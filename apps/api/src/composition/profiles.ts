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
import { HISTORY_WINDOW_MONTHS } from '../application/advisory.service.ts'
import type { SeedInfo } from '../application/seed-info.ts'
import { avatarIsLive, runwayCredentials } from '../config.ts'
import type { Config } from '../config.ts'
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
    case 'postgres':
    case 'idbi-sandbox':
      throw new Error(
        `BANK_SOURCE=${profile.bank} is not wired in this build yet. Add its adapters as a case in composition/profiles.ts; the memory profile runs with BANK_SOURCE=memory.`,
      )
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
