/**
 * Which adapters a configuration means.
 *
 * `BANK_SOURCE` picks the data side, `AVATAR_PROVIDER` (and the `AVATAR_ENABLED` kill switch)
 * picks the provider side, and the two are independent: memory × runway is a legitimate way to
 * demo the avatar with no database. The Postgres and IDBI-sandbox adapters land here as new
 * cases; nothing above this file names a concrete class.
 */
import { seedBundles, shelfRows } from '@dhan/fixtures'
import type { AvatarProviderName } from '@dhan/contracts'
import { InMemoryAuditStore } from '../adapters/memory/audit-store.memory.ts'
import { InMemoryBankData } from '../adapters/memory/bank-data.memory.ts'
import { InMemoryLeaseStore } from '../adapters/memory/lease-store.memory.ts'
import { InMemoryProductShelf } from '../adapters/memory/product-shelf.memory.ts'
import { InMemorySessionStore } from '../adapters/memory/session-store.memory.ts'
import { InMemorySnapshotStore } from '../adapters/memory/snapshot-store.memory.ts'
import { NullAvatarProvider } from '../adapters/null/avatar-provider.null.ts'
import { NullRpcHost } from '../adapters/null/rpc-host.null.ts'
import { RunwayAvatarProvider } from '../adapters/runway/provider.ts'
import { RunwayRpcHost } from '../adapters/runway/rpc-host.ts'
import { RunwayTransport } from '../adapters/runway/transport.ts'
import { IdbiSandboxBankData } from '../adapters/idbi-sandbox/bank-data.idbi-sandbox.ts'
import { IdbiClient } from '../adapters/idbi-sandbox/client.ts'
import { CompositeBankData, customerDirectory } from '../adapters/idbi-sandbox/composite.ts'
import { OFFLINE_BASE_URL, OfflineSandbox } from '../adapters/idbi-sandbox/offline-sandbox.ts'
import { PostgresAuditStore } from '../adapters/postgres/audit-store.postgres.ts'
import { PostgresBankData } from '../adapters/postgres/bank-data.postgres.ts'
import { PostgresLeaseStore } from '../adapters/postgres/lease-store.postgres.ts'
import { PostgresProductShelf } from '../adapters/postgres/product-shelf.postgres.ts'
import { PostgresSeedInfo } from '../adapters/postgres/seed-provenance.postgres.ts'
import { PostgresSessionStore } from '../adapters/postgres/session-store.postgres.ts'
import { PostgresSnapshotStore } from '../adapters/postgres/snapshot-store.postgres.ts'
import { HISTORY_WINDOW_MONTHS } from '../application/advisory.service.ts'
import type { SeedInfo } from '../application/seed-info.ts'
import { avatarIsLive, runwayCredentials } from '../config.ts'
import type { Config } from '../config.ts'
import { createPool } from '../db/pool.ts'
import type { Logger } from '../infra/logger.ts'
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

export interface Profile {
  bank: Config['BANK_SOURCE']
  avatar: AvatarProviderName
}

export function resolveProfile(config: Config): Profile {
  return { bank: config.BANK_SOURCE, avatar: avatarIsLive(config) ? 'runway' : 'none' }
}

export function describeProfile(profile: Profile): string {
  return `${profile.bank} × ${profile.avatar}`
}

export interface BankAdapters {
  bank: BankDataPort
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
): BankAdapters {
  switch (profile.bank) {
    case 'memory': {
      const options = {
        anchor: config.SEED_ANCHOR,
        historyMonths: HISTORY_WINDOW_MONTHS,
        forwardMonths: config.SEED_FORWARD_MONTHS,
      }
      const bank = new InMemoryBankData(seedBundles(options), {
        generatorVersion: `@dhan/fixtures@${versions.fixtures}`,
        ranAt: clock.now().toISOString(),
        regenerate: () => seedBundles(options),
      })
      return {
        bank,
        shelf: new InMemoryProductShelf(shelfRows()),
        sessions: new InMemorySessionStore(clock),
        snapshots: new InMemorySnapshotStore(clock),
        audit: new InMemoryAuditStore(clock),
        leases: new InMemoryLeaseStore(clock),
        seed: bank,
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
      const seed = new PostgresSeedInfo(db, {
        anchor: config.SEED_ANCHOR,
        historyMonths: HISTORY_WINDOW_MONTHS,
        forwardMonths: config.SEED_FORWARD_MONTHS,
        generatorVersion: `@dhan/fixtures@${versions.fixtures}+${config.GIT_SHA?.slice(0, 12) ?? 'dev'}`,
      })
      return {
        bank,
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
      const options = {
        anchor: config.SEED_ANCHOR,
        historyMonths: HISTORY_WINDOW_MONTHS,
        forwardMonths: config.SEED_FORWARD_MONTHS,
      }
      const bundles = seedBundles(options)
      const fixtures = new InMemoryBankData(bundles, {
        generatorVersion: `@dhan/fixtures@${versions.fixtures}`,
        ranAt: clock.now().toISOString(),
        regenerate: () => seedBundles(options),
      })
      // With no base URL configured there is nothing to call, so the recorded samples are
      // served in process: the adapter runs offline, on a reserved TLD that cannot resolve.
      const offline = config.IDBI_API_BASE
        ? null
        : new OfflineSandbox({ bundles, shelf: shelfRows() })
      const client = new IdbiClient({
        baseUrl: config.IDBI_API_BASE ?? OFFLINE_BASE_URL,
        ...(offline ? { fetch: offline.fetch } : {}),
        ...(config.IDBI_API_KEY ? { apiKey: config.IDBI_API_KEY } : {}),
      })
      const bank = new CompositeBankData(
        new IdbiSandboxBankData({
          client,
          directory: customerDirectory(fixtures, { consentId: config.IDBI_CONSENT_ID }),
          initialFreshness: config.SEED_ANCHOR,
          windowAnchor: config.SEED_ANCHOR,
        }),
        fixtures,
      )
      return {
        bank,
        shelf: new InMemoryProductShelf(shelfRows()),
        sessions: new InMemorySessionStore(clock),
        snapshots: new InMemorySnapshotStore(clock),
        audit: new InMemoryAuditStore(clock),
        leases: new InMemoryLeaseStore(clock),
        seed: fixtures,
      }
    }
  }
}

export interface AvatarAdapters {
  avatar: AvatarProvider
  rpc: AvatarRpcHost
  credentials: AvatarCredential[]
}

export function avatarAdapters(profile: Profile, config: Config, log: Logger): AvatarAdapters {
  if (profile.avatar === 'none') {
    // Under the kill switch the credentials are still counted, so the availability route can
    // say "disabled" (a decision) rather than "not configured" (a gap).
    return {
      avatar: new NullAvatarProvider(),
      rpc: new NullRpcHost(),
      credentials: config.AVATAR_PROVIDER === 'runway' ? runwayCredentials(config) : [],
    }
  }
  const transport = new RunwayTransport({ baseUrl: config.RUNWAY_API_BASE })
  return {
    avatar: new RunwayAvatarProvider(transport),
    rpc: new RunwayRpcHost({ baseUrl: config.RUNWAY_API_BASE, log }),
    credentials: runwayCredentials(config),
  }
}
