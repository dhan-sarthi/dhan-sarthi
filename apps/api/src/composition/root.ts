/**
 * The composition root: the one file that names concrete classes.
 *
 * `buildRoot(config)` picks one adapter per port from the configuration, wires the services
 * by constructor, builds the Fastify app, registers every row of the route registry, and
 * enforces the startup invariants that must never be discovered on the first request. Tests
 * call it with adapter overrides — a fixed clock, a fake provider — and get the real app.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import type { HealthResponse } from '@dhan/contracts'
import { SystemClock } from '../adapters/clock/system-clock.ts'
import { NullAvatarProvider } from '../adapters/null/avatar-provider.null.ts'
import { NullRpcHost } from '../adapters/null/rpc-host.null.ts'
import { AdvisoryService } from '../application/advisory.service.ts'
import { AvatarSessionService } from '../application/avatar/avatar-session.service.ts'
import { CredentialPool } from '../application/avatar/credential-pool.ts'
import { LeaseReaper } from '../application/avatar/lease-reaper.ts'
import { LiveCalls } from '../application/avatar/live-calls.ts'
import { MinuteBudget } from '../application/avatar/minute-budget.ts'
import { Waitlist } from '../application/avatar/waitlist.ts'
import { ConversationService } from '../application/conversation.service.ts'
import { DecisionService } from '../application/decision.service.ts'
import { engineVersion } from '../application/engine-version.ts'
import { RecordService } from '../application/record.service.ts'
import { SessionService } from '../application/session.service.ts'
import type { SeedInfo } from '../application/seed-info.ts'
import type { Config } from '../config.ts'
import { makeAuthenticator } from '../http/auth.ts'
import { buildOpenApi } from '../http/openapi.ts'
import { registerAllRoutes } from '../http/routes/index.ts'
import type { AppServices } from '../http/routes/index.ts'
import { createServer } from '../http/server.ts'
import type {
  AuditStore,
  AvatarCredential,
  AvatarProvider,
  AvatarRpcHost,
  BankDataPort,
  Clock,
  LeaseStore,
  ProductShelfPort,
  SessionStore,
  SnapshotStore,
} from '../ports/index.ts'
import type { DeclaredProfileStore } from '../ports/declared-profile.port.ts'
import type { HoldingsStore } from '../ports/holdings.port.ts'
import { avatarAdapters, bankAdapters, describeProfile, resolveProfile } from './profiles.ts'

export interface Deps {
  bank: BankDataPort
  /** The declared half of a profile, and a customer's holdings: neither is the bank's to send. */
  profiles: DeclaredProfileStore
  holdings: HoldingsStore
  shelf: ProductShelfPort
  sessions: SessionStore
  snapshots: SnapshotStore
  audit: AuditStore
  leases: LeaseStore
  avatar: AvatarProvider
  rpc: AvatarRpcHost
  clock: Clock
  credentials: AvatarCredential[]
  seed: SeedInfo
}

export interface RootOptions {
  /** Adapters to use instead of the configured ones. Tests pin the clock and fake the provider. */
  deps?: Partial<Deps>
  /** Default: on outside NODE_ENV=test. */
  rateLimits?: boolean
  logger?: FastifyServerOptions['logger']
  /** Backoff for the transcript fetch after a call. */
  transcriptDelaysMs?: readonly number[]
}

export interface Root {
  app: FastifyInstance
  deps: Deps
  services: AppServices
  taskId: string
  close(): Promise<void>
}

const REAPER_INTERVAL_MS = 2_000
/** Waitlist hold: how long a promoted ticket has to claim the slot. */
const HOLD_SECONDS = 20

/** The version of a workspace package, read from the package.json its entry resolves under. */
function packageVersion(name: string): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.resolve(name)))
    for (let i = 0; i < 5; i += 1) {
      const candidate = join(dir, 'package.json')
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as {
          name?: string
          version?: string
        }
        if (pkg.name === name && typeof pkg.version === 'string') return pkg.version
      }
      dir = dirname(dir)
    }
  } catch {
    // fall through
  }
  return '0.0.0'
}

export async function buildRoot(config: Config, options: RootOptions = {}): Promise<Root> {
  const profile = resolveProfile(config)
  const clock = options.deps?.clock ?? new SystemClock()
  const taskId = randomUUID().slice(0, 8)
  const versions = {
    api: packageVersion('@dhan/api'),
    core: packageVersion('@dhan/core'),
    fixtures: packageVersion('@dhan/fixtures'),
  }
  const engine = engineVersion(versions.core, config.GIT_SHA)

  const app = await createServer(config, {
    rateLimits: options.rateLimits ?? config.NODE_ENV !== 'test',
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })
  const log = app.log

  const deps: Deps = {
    ...bankAdapters(profile, config, clock, versions, log),
    ...avatarAdapters(profile, config, log),
    clock,
    ...options.deps,
  }

  // A real provider with no real RPC host would mean issuing sessions the gate cannot join.
  // Refuse to start rather than discover it on the first call.
  const realProvider = !(deps.avatar instanceof NullAvatarProvider)
  if (realProvider && deps.rpc instanceof NullRpcHost) {
    throw new Error(
      'startup invariant: a real AvatarProvider requires a real AvatarRpcHost; an ungated avatar session must never be issued.',
    )
  }
  if (realProvider && deps.credentials.length === 0) {
    throw new Error('startup invariant: a real AvatarProvider needs at least one credential.')
  }

  /* Services ------------------------------------------------------------------ */

  const sessions = new SessionService({
    sessions: deps.sessions,
    bank: deps.bank,
    clock,
    anchor: config.SEED_ANCHOR,
    avatarName: profile.avatar,
  })
  const advisory = new AdvisoryService({
    bank: deps.bank,
    shelf: deps.shelf,
    snapshots: deps.snapshots,
    engineVersion: engine,
  })
  const decisions = new DecisionService({
    advisory,
    shelf: deps.shelf,
    audit: deps.audit,
    sessions: deps.sessions,
  })
  const conversation = new ConversationService({ advisory, shelf: deps.shelf, audit: deps.audit })
  const records = new RecordService({
    audit: deps.audit,
    snapshots: deps.snapshots,
    bank: deps.bank,
    seed: deps.seed,
  })

  const pool = new CredentialPool(deps.credentials)
  const live = new LiveCalls()
  const budget = new MinuteBudget(deps.leases, clock, config.RUNWAY_DAILY_MINUTE_BUDGET)
  const reaper = new LeaseReaper({
    leases: deps.leases,
    audit: deps.audit,
    provider: deps.avatar,
    rpc: deps.rpc,
    pool,
    live,
    clock,
    capSeconds: config.RUNWAY_MAX_SESSION_SECONDS,
    log,
  })
  const waitlist = new Waitlist(deps.leases, clock, {
    holdSeconds: HOLD_SECONDS,
    capSeconds: config.RUNWAY_MAX_SESSION_SECONDS,
  })
  const avatar = new AvatarSessionService({
    provider: deps.avatar,
    rpc: deps.rpc,
    leases: deps.leases,
    audit: deps.audit,
    shelf: deps.shelf,
    advisory,
    clock,
    pool,
    budget,
    reaper,
    waitlist,
    live,
    enabled: config.AVATAR_ENABLED,
    taskId,
    maxSessionSeconds: config.RUNWAY_MAX_SESSION_SECONDS,
    engineVersion: engine,
    log,
    ...(options.transcriptDelaysMs === undefined
      ? {}
      : { transcriptDelaysMs: options.transcriptDelaysMs }),
  })

  const health = async (): Promise<HealthResponse> => {
    const [bankHealth, provenance] = await Promise.all([deps.bank.health(), deps.seed.provenance()])
    return {
      ok: bankHealth.ok,
      at: clock.now().toISOString(),
      version: `${versions.api}+${config.GIT_SHA?.slice(0, 12) ?? 'dev'}`,
      engineVersion: engine,
      bank: {
        source: deps.bank.describe().source,
        ok: bankHealth.ok,
        latencyMs: bankHealth.latencyMs,
        seedHash: provenance?.contentSha256 ?? null,
      },
      avatar: {
        provider: profile.avatar,
        enabled: config.AVATAR_ENABLED,
        breaker: deps.avatar.breakerState(),
        rpcOpen: deps.rpc.openCount(),
      },
      faultInject: config.FAULT_INJECT,
    }
  }

  const services: AppServices = {
    bank: deps.bank,
    profiles: deps.profiles,
    holdings: deps.holdings,
    shelf: deps.shelf,
    sessions,
    advisory,
    decisions,
    conversation,
    records,
    avatar,
    seed: deps.seed,
    health,
    openapi: buildOpenApi({ version: versions.api }),
  }

  /* The app ------------------------------------------------------------------- */

  registerAllRoutes(
    app,
    {
      auth: makeAuthenticator({ sessions, operatorKey: config.OPERATOR_KEY }),
      sessions: deps.sessions,
      clock,
      rateLimits: options.rateLimits ?? config.NODE_ENV !== 'test',
      strictResponses: config.NODE_ENV !== 'production',
    },
    services,
  )

  // The reaper runs before every acquire; the timer catches abandoned calls between grants.
  const reaperTimer =
    pool.size > 0
      ? setInterval(() => {
          reaper.run().catch((err: Error) => log.error({ err: err.message }, 'reaper failed'))
        }, REAPER_INTERVAL_MS)
      : null
  reaperTimer?.unref()

  app.addHook('onClose', async () => {
    if (reaperTimer) clearInterval(reaperTimer)
    await avatar.shutdown()
  })

  log.info(
    {
      profile: describeProfile(profile),
      engineVersion: engine,
      taskId,
      routes: app.routeTable.size,
    },
    'composition root built',
  )

  return {
    app,
    deps,
    services,
    taskId,
    close: () => app.close(),
  }
}
