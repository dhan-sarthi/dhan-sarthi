/**
 * Which adapters a configuration means.
 *
 * `BANK_SOURCE` picks the data side, `AVATAR_PROVIDER` (and the `AVATAR_ENABLED` kill switch)
 * picks the provider side, and the two are independent: memory × runway is a legitimate way to
 * demo the avatar with no database. The Postgres and IDBI-sandbox adapters land here as new
 * cases; nothing above this file names a concrete class.
 */
import type { AvatarProviderName } from '@dhan/contracts'
import { InMemoryAuditStore } from '../adapters/memory/audit-store.memory.ts'
import { InMemoryLeaseStore } from '../adapters/memory/lease-store.memory.ts'
import { InMemorySessionStore } from '../adapters/memory/session-store.memory.ts'
import { InMemorySnapshotStore } from '../adapters/memory/snapshot-store.memory.ts'
import { NullAvatarProvider } from '../adapters/null/avatar-provider.null.ts'
import { NullRpcHost } from '../adapters/null/rpc-host.null.ts'
import { AnamCallRegistry } from '../adapters/anam/call-registry.ts'
import { AnamAvatarProvider } from '../adapters/anam/provider.ts'
import { AnamToolGate } from '../adapters/anam/tool-gate.ts'
import { AnamToolWebhook } from '../adapters/anam/tool-webhook.ts'
import { AnamTransport } from '../adapters/anam/transport.ts'
import { NoLanguageModel } from '../adapters/null/language-model.null.ts'
import { NullToolWebhook } from '../adapters/null/tool-webhook.null.ts'
import { OpenAiChatModel } from '../adapters/openai/chat.openai.ts'
import { RunwayAvatarProvider } from '../adapters/runway/provider.ts'
import { RunwayRpcHost } from '../adapters/runway/rpc-host.ts'
import { RunwayTransport } from '../adapters/runway/transport.ts'
import { IdbiSandboxBankData } from '../adapters/idbi-sandbox/bank-data.idbi-sandbox.ts'
import { IdbiGateway } from '../adapters/idbi-sandbox/api/gateway.ts'
import { IdbiTransport } from '../adapters/idbi-sandbox/api/transport.ts'
import { REPLAY_BASE_URL, createReplayTransport } from '../adapters/idbi-sandbox/api/replay.ts'
import { loadCapturedCalls } from '../adapters/idbi-sandbox/api/captured.ts'
import { createFailoverFetch } from '../adapters/idbi-sandbox/api/failover.ts'
import { DECLARED_SEEDS, HOLDINGS_SEEDS } from '../adapters/idbi-sandbox/api/customers.ts'
import { BankBackedHoldings, InMemoryHoldings } from '../adapters/memory/holdings.memory.ts'
import { InMemoryAaConsents } from '../adapters/memory/aa-consent.memory.ts'
import { IdbiLeadSink, noLeadSink } from '../adapters/idbi-sandbox/lead-sink.idbi.ts'
import { InMemoryDeclaredProfiles } from '../adapters/memory/declared-profile.memory.ts'
import {
  generatedDeclaredProfiles,
  generatedSource,
  recordedGeneratorVersion,
} from '../adapters/memory/generated-source.ts'
import { CompositeBankData } from '../adapters/idbi-sandbox/composite.ts'
import { PostgresAuditStore } from '../adapters/postgres/audit-store.postgres.ts'
import { PostgresBankData } from '../adapters/postgres/bank-data.postgres.ts'
import { PostgresLeaseStore } from '../adapters/postgres/lease-store.postgres.ts'
import { PostgresProductShelf } from '../adapters/postgres/product-shelf.postgres.ts'
import { PostgresSeedInfo } from '../adapters/postgres/seed-provenance.postgres.ts'
import { PostgresSessionStore } from '../adapters/postgres/session-store.postgres.ts'
import { PostgresSnapshotStore } from '../adapters/postgres/snapshot-store.postgres.ts'
import { HISTORY_WINDOW_MONTHS } from '../application/advisory.service.ts'
import { AvatarProviderRouter, AvatarRpcRouter } from '../application/avatar/provider-router.ts'
import type { SeedInfo } from '../application/seed-info.ts'
import { avatarChain, avatarCredentials, avatarIsLive, textModelIsLive } from '../config.ts'
import type { Config } from '../config.ts'
import { createPool } from '../db/pool.ts'
import type { Logger } from '../infra/logger.ts'
import type { AaConsentStore } from '../ports/aa-consent.port.ts'
import type { LeadSinkPort } from '../ports/lead-sink.port.ts'
import type { MappingReport } from '../adapters/idbi-sandbox/api/to-domain.ts'
import type { AaGatewayPort } from '../ports/aa-gateway.port.ts'
import type { DeclaredProfileStore } from '../ports/declared-profile.port.ts'
import type { HoldingsStore } from '../ports/holdings.port.ts'
import type { LanguageModelPort } from '../ports/language-model.port.ts'
import type {
  AuditStore,
  AvatarCredential,
  AvatarProvider,
  AvatarRpcHost,
  AvatarToolWebhook,
  AvatarVendor,
  BankDataPort,
  Clock,
  LeaseStore,
  ProductShelfPort,
  SessionStore,
  SnapshotStore,
} from '../ports/index.ts'

export interface Profile {
  bank: Config['BANK_SOURCE']
  /** The provider tried first — what health and a session's capabilities report. */
  avatar: AvatarProviderName
  /** Every provider in try order. Empty when the avatar is off. */
  avatarChain: AvatarVendor[]
}

export function resolveProfile(config: Config): Profile {
  const chain = avatarIsLive(config) ? avatarChain(config) : []
  return {
    bank: config.BANK_SOURCE,
    avatar: chain[0] ?? 'none',
    avatarChain: chain,
  }
}

export function describeProfile(profile: Profile): string {
  return `${profile.bank} × ${profile.avatarChain.length > 0 ? profile.avatarChain.join(' → ') : 'none'}`
}

export interface BankAdapters {
  bank: BankDataPort
  /**
   * The declared half of a customer's profile, which no bank endpoint carries.
   *
   * Present under every source so `/api/v1/profile` behaves the same way whichever one is
   * running: over the generator it starts as a mirror of the generated customers, and over
   * IDBI it is the only place income, employment and risk profile exist at all.
   */
  profiles: DeclaredProfileStore
  /**
   * A customer's investments, which no bank endpoint carries. Present under every source so
   * `/api/v1/holdings` behaves the same way whichever one is running.
   */
  holdings: HoldingsStore
  /**
   * The Account Aggregator consent flow's state and the bank's side of it, or null where the
   * source has no aggregator behind it.
   */
  aa: { store: AaConsentStore; gateway: AaGatewayPort } | null
  /** Where an accepted product goes. Nowhere, under a source with no bank behind it. */
  leads: LeadSinkPort
  /** The mapping report of the last read. Null under a source with no mapping layer. */
  mappingReport: (() => MappingReport | null) | null
  shelf: ProductShelfPort
  sessions: SessionStore
  snapshots: SnapshotStore
  audit: AuditStore
  leases: LeaseStore
  seed: SeedInfo
}

export function bankAdapters(
  profile: Profile,
  config: Config,
  clock: Clock,
  versions: { fixtures: string },
  log: Logger,
): BankAdapters {
  switch (profile.bank) {
    case 'memory': {
      const source = generatedSource(
        {
          anchor: config.SEED_ANCHOR,
          historyMonths: HISTORY_WINDOW_MONTHS,
          forwardMonths: config.SEED_FORWARD_MONTHS,
          fixturesVersion: versions.fixtures,
        },
        clock,
      )
      return {
        bank: source.bank,
        profiles: source.profiles,
        holdings: new BankBackedHoldings(source.bank, clock),
        aa: null,
        leads: noLeadSink('memory'),
        mappingReport: null,
        shelf: source.shelf,
        sessions: new InMemorySessionStore(clock),
        snapshots: new InMemorySnapshotStore(clock),
        audit: new InMemoryAuditStore(clock),
        leases: new InMemoryLeaseStore(clock),
        seed: source.bank,
      }
    }
    case 'postgres': {
      // config.ts already refuses BANK_SOURCE=postgres without DATABASE_URL; the assertion keeps
      // the type honest rather than repeating the check.
      if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required for BANK_SOURCE=postgres')
      // DB_ROLE is what makes the record append-only for this process and not only for a
      // stranger: the connection takes the role before it serves a request.
      const db = createPool({
        connectionString: config.DATABASE_URL,
        applicationName: 'dhan-api',
        max: 5,
        statementTimeoutMs: 15_000,
        ...(config.DB_ROLE === undefined ? {} : { role: config.DB_ROLE }),
      })
      // The ledger was generated at the seed anchor and the mirrors carry that as their as-of;
      // the bank adapter reports it as the data freshness date on every view.
      const bank = new PostgresBankData(db, { dataFreshnessDate: config.SEED_ANCHOR })
      const seedOptions = {
        anchor: config.SEED_ANCHOR,
        historyMonths: HISTORY_WINDOW_MONTHS,
        forwardMonths: config.SEED_FORWARD_MONTHS,
      }
      const seed = new PostgresSeedInfo(db, {
        ...seedOptions,
        generatorVersion: recordedGeneratorVersion(versions.fixtures, config.GIT_SHA),
      })
      return {
        bank,
        // The rows in Postgres came from this generator, so mirroring its declared fields keeps
        // the profile API's answers consistent with the ledger the database holds. A Postgres
        // sibling of this store belongs here once the profile is editable in a deployment.
        profiles: generatedDeclaredProfiles(seedOptions, clock),
        holdings: new BankBackedHoldings(bank, clock),
        aa: null,
        leads: noLeadSink('postgres'),
        mappingReport: null,
        shelf: new PostgresProductShelf(db),
        sessions: new PostgresSessionStore(db, clock),
        snapshots: new PostgresSnapshotStore(db, clock),
        audit: new PostgresAuditStore(db, clock),
        leases: new PostgresLeaseStore(db, clock),
        seed,
      }
    }
    case 'idbi-sandbox': {
      // The seam the bank's own feed will arrive through. The bank answers for the profile,
      // accounts, statement and loans; fixtures answer for holdings, policies and the shelf,
      // because IDBI's catalogue has no endpoint for those (docs/integration/field-mapping.md).
      // Reviewer state stays in memory: which store holds sessions is orthogonal to where the
      // customer's data comes from, and this profile exists to prove the data seam.
      // `source.profiles` is not read here: IDBI's catalogue carries none of the declared
      // fields, so the seeds below are hand-written instead. A three-row Map built and dropped
      // at boot is not worth a fifth export on the generated source.
      const source = generatedSource(
        {
          anchor: config.SEED_ANCHOR,
          historyMonths: HISTORY_WINDOW_MONTHS,
          forwardMonths: config.SEED_FORWARD_MONTHS,
          fixturesVersion: versions.fixtures,
        },
        clock,
      )
      // With no base URL configured there is nothing to call, so the captured responses are
      // replayed in process against a reserved TLD that cannot resolve. That is IDBI's own
      // bytes rather than wire we generated, so the offline path exercises the same mapping
      // the live one does.
      //
      // With a base URL, the live sandbox is asked first and the same replay answers whenever it
      // cannot — refused at the edge, down, or slow — so an IP allow-list we do not control is
      // never the reason the product stops working (failover.ts).
      const replay =
        config.IDBI_API_BASE && config.IDBI_FALLBACK === 'off'
          ? null
          : createReplayTransport({
              captures: loadCapturedCalls(),
              onMiss: (miss) =>
                log.warn(
                  { op: miss.op, fingerprint: miss.fingerprint, reason: miss.reason },
                  'the IDBI replay transport had no capture for a request',
                ),
            })
      const idbiFetch =
        replay === null
          ? undefined
          : config.IDBI_API_BASE
            ? createFailoverFetch({ live: fetch, fallback: replay.fetch, logger: log }).fetch
            : replay.fetch
      const transport = new IdbiTransport({
        baseUrl: config.IDBI_API_BASE ?? REPLAY_BASE_URL,
        ...(idbiFetch ? { fetch: idbiFetch } : {}),
        logger: log,
      })
      const profiles = new InMemoryDeclaredProfiles(DECLARED_SEEDS, clock)
      const holdings = new InMemoryHoldings(HOLDINGS_SEEDS, clock)
      const gateway = new IdbiGateway({ transport, logger: log })
      const idbi = new IdbiSandboxBankData({ gateway, profiles, logger: log })
      const bank = new CompositeBankData(idbi, holdings)
      return {
        bank,
        profiles,
        holdings,
        aa: { store: new InMemoryAaConsents(clock), gateway },
        leads: new IdbiLeadSink({ gateway, logger: log }),
        mappingReport: () => idbi.lastReport(),
        shelf: source.shelf,
        sessions: new InMemorySessionStore(clock),
        snapshots: new InMemorySnapshotStore(clock),
        audit: new InMemoryAuditStore(clock),
        leases: new InMemoryLeaseStore(clock),
        seed: source.bank,
      }
    }
  }
}

export interface AvatarAdapters {
  avatar: AvatarProvider
  rpc: AvatarRpcHost
  /** The gate's HTTP front door. Null-implemented unless Anam is in the chain. */
  toolWebhook: AvatarToolWebhook
  credentials: AvatarCredential[]
}

/**
 * The two providers are wired the same way and differ only in what answers the model's tools:
 * Runway joins the room as a hidden participant, Anam is called back over HTTP. Everything
 * downstream — the pool, the lease, the budget, the reaper, the waitlist, the audit — is shared.
 *
 * The table below is the whole of what a third provider would add here: one row, three
 * adapters. What changed on 22 September 2026 is that more than one row can be live at once:
 * `AVATAR_PROVIDER=runway,anam` builds both and puts a router in front, and each credential in
 * the pool says which of them it belongs to.
 */
interface VendorAdapters {
  avatar: AvatarProvider
  rpc: AvatarRpcHost
  toolWebhook: AvatarToolWebhook | null
}

type AvatarBuild = (config: Config, log: Logger) => VendorAdapters

const AVATAR_BUILDS: Record<AvatarVendor, AvatarBuild> = {
  anam: (config, log) => {
    // One registry, three readers: the provider mints the per-call secret into the persona
    // config, the gate attaches the handlers, the webhook dispatches. See call-registry.ts.
    const registry = new AnamCallRegistry()
    const transport = new AnamTransport({
      baseUrl: config.ANAM_API_BASE,
      voiceId: config.ANAM_VOICE_ID ?? '',
      llmId: config.ANAM_LLM_ID ?? '',
      ...(config.ANAM_LANGUAGE_CODE ? { languageCode: config.ANAM_LANGUAGE_CODE } : {}),
      videoWidth: config.ANAM_VIDEO_WIDTH,
      videoHeight: config.ANAM_VIDEO_HEIGHT,
    })
    return {
      avatar: new AnamAvatarProvider({
        transport,
        registry,
        publicBaseUrl: config.ANAM_PUBLIC_BASE_URL ?? '',
      }),
      // The gate takes the transport as well as the registry: its liveness answer is a read of
      // `GET /v1/sessions`, which is the only server-side evidence Anam gives us. Sharing the
      // instance is deliberate and safe — that read answers to the transport's own
      // `listBreaker`, not the customer-facing one, so a sick list endpoint cannot take grants
      // offline.
      rpc: new AnamToolGate({ registry, transport, log }),
      toolWebhook: new AnamToolWebhook(registry),
    }
  },
  runway: (config, log) => ({
    avatar: new RunwayAvatarProvider(new RunwayTransport({ baseUrl: config.RUNWAY_API_BASE })),
    rpc: new RunwayRpcHost({ baseUrl: config.RUNWAY_API_BASE, log }),
    // Runway's tools are answered inside the room; nothing may come through the HTTP gate.
    toolWebhook: null,
  }),
}

export function avatarAdapters(profile: Profile, config: Config, log: Logger): AvatarAdapters {
  // The credentials are counted under the kill switch too, so the availability route can say
  // "disabled" (a decision) rather than "not configured" (a gap).
  const credentials = avatarCredentials(config)
  if (profile.avatarChain.length === 0) {
    return {
      avatar: new NullAvatarProvider(),
      rpc: new NullRpcHost(),
      toolWebhook: new NullToolWebhook(),
      credentials,
    }
  }
  const providers: Partial<Record<AvatarVendor, AvatarProvider>> = {}
  const hosts: Partial<Record<AvatarVendor, AvatarRpcHost>> = {}
  let toolWebhook: AvatarToolWebhook = new NullToolWebhook()
  for (const vendor of profile.avatarChain) {
    const built = AVATAR_BUILDS[vendor](config, log)
    providers[vendor] = built.avatar
    hosts[vendor] = built.rpc
    if (built.toolWebhook) toolWebhook = built.toolWebhook
  }
  return {
    avatar: new AvatarProviderRouter(providers),
    rpc: new AvatarRpcRouter(hosts),
    toolWebhook,
    credentials,
  }
}

/**
 * The text tier's model, or the null one.
 *
 * Deliberately not part of `Profile`: this is not a variant of the product the way a bank
 * source or an avatar provider is. The tier answers the same questions from the same engine
 * with the same evidence either way, and the only difference downstream is who wrote the
 * sentence — which the response says, in `phrasedBy`.
 */
export function languageModel(config: Config, log: Logger): LanguageModelPort {
  if (!textModelIsLive(config)) return new NoLanguageModel()
  return new OpenAiChatModel({
    apiKey: config.OPENAI_API_KEY ?? '',
    model: config.OPENAI_MODEL,
    baseUrl: config.OPENAI_API_BASE,
    timeoutMs: config.OPENAI_TIMEOUT_MS,
    maxOutputTokens: config.OPENAI_MAX_OUTPUT_TOKENS,
    temperature: config.OPENAI_TEMPERATURE,
    log,
  })
}
