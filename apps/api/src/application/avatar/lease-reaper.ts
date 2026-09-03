/**
 * Cancel anything held past its lease.
 *
 * A hard-killed browser never calls `/end`, and Runway bills until the cap. The reaper runs
 * before every acquire and on a short timer, so an abandoned tab costs at most one cap and
 * never blocks the next reviewer. A reaped lease is charged the full cap, because a session
 * nobody closed ran until Runway stopped it — assuming otherwise would let a string of
 * abandoned tabs spend the budget invisibly.
 */
import type { Logger } from '../../infra/logger.ts'
import type {
  AuditStore,
  AvatarProvider,
  AvatarRpcHost,
  Clock,
  Lease,
  LeaseStore,
} from '../../ports/index.ts'
import type { CredentialPool } from './credential-pool.ts'
import type { LiveCalls } from './live-calls.ts'

export interface ReaperDeps {
  leases: LeaseStore
  audit: AuditStore
  provider: AvatarProvider
  rpc: AvatarRpcHost
  pool: CredentialPool
  live: LiveCalls
  clock: Clock
  capSeconds: number
  log: Logger
}

export class LeaseReaper {
  private readonly deps: ReaperDeps

  constructor(deps: ReaperDeps) {
    this.deps = deps
  }

  async run(): Promise<Lease[]> {
    const { leases, audit, provider, rpc, pool, live, clock, capSeconds, log } = this.deps
    const expired = await leases.reapExpired(clock.now())

    for (const lease of expired) {
      const capMinutes = capSeconds / 60
      const call = lease.runwaySessionId ? live.take(lease.runwaySessionId) : undefined
      call?.lifecycle.tryTo('reaped')

      if (call?.handle) await rpc.close(call.handle).catch(() => {})

      const cred = call?.cred ?? pool.byLabel(lease.credentialLabel)
      if (lease.runwaySessionId && cred) {
        try {
          await provider.cancel(cred, lease.runwaySessionId)
        } catch (err) {
          log.error(
            { label: lease.credentialLabel, err: (err as Error).message },
            'could not reap avatar session',
          )
        }
      }

      // release() is the single charging call; the store tolerates a lease already removed.
      await leases.release(lease.credentialLabel, capMinutes, 'reaped')
      if (lease.runwaySessionId) {
        await audit.markAvatarEnded(
          lease.runwaySessionId,
          'reaped',
          capMinutes,
          clock.now().toISOString(),
        )
      }
      log.info(
        { label: lease.credentialLabel, runwaySessionId: lease.runwaySessionId },
        'avatar session reaped past its lease',
      )
    }
    return expired
  }
}
