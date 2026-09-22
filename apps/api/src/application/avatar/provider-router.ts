/**
 * Both providers at once, behind the two ports the session service already speaks.
 *
 * The pool used to hold one provider's keys. It now holds an ordered chain — Runway's accounts
 * first, then Anam's — and a call can land on any of them: the first account that is free and
 * has credit wins, and a refusal moves the call to the next one. Every credential says whose it
 * is (`AvatarCredential.provider`), so the router has one job: send each call to that provider's
 * adapter. Nothing above it learns there are two.
 *
 * The RPC side needs one piece of memory the provider side does not: `close` and `liveness`
 * take a handle, not a credential, so the router remembers which host opened each call.
 */
import type { BreakerState, ConversationTurn } from '@dhan/contracts'
import type {
  AvatarCredential,
  AvatarProvider,
  AvatarRpcHost,
  AvatarSessionOptions,
  AvatarVendor,
  CallLiveness,
  IssuedGrant,
  RpcHandle,
  ToolHandlers,
} from '../../ports/index.ts'
import { AvatarProviderError } from './provider-error.ts'

type ByVendor<T> = Partial<Record<AvatarVendor, T>>

/** Best line wins: one provider that can be reached means the pool is not down. */
function bestOf(states: readonly BreakerState[]): BreakerState {
  if (states.length === 0) return 'closed'
  if (states.includes('closed')) return 'closed'
  if (states.includes('half-open')) return 'half-open'
  return 'open'
}

export class AvatarProviderRouter implements AvatarProvider {
  private readonly providers: ByVendor<AvatarProvider>

  constructor(providers: ByVendor<AvatarProvider>) {
    this.providers = providers
  }

  private to(cred: AvatarCredential): AvatarProvider {
    const provider = this.providers[cred.provider]
    if (!provider) {
      throw new AvatarProviderError(
        'not_configured',
        `No ${cred.provider} adapter is wired for credential ${cred.label}.`,
      )
    }
    return provider
  }

  probe(cred: AvatarCredential): Promise<{ ok: boolean; character: string | null }> {
    return this.to(cred).probe(cred)
  }

  credits(cred: AvatarCredential): Promise<number | null> {
    return this.to(cred).credits(cred)
  }

  sessionsLeftToday(cred: AvatarCredential): Promise<number | null> {
    return this.to(cred).sessionsLeftToday(cred)
  }

  createSession(
    cred: AvatarCredential,
    opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }> {
    return this.to(cred).createSession(cred, opts)
  }

  awaitIssuable(
    cred: AvatarCredential,
    runwaySessionId: string,
    opts: { timeoutMs: number; queuedGiveUpMs?: number },
  ): Promise<void> {
    return this.to(cred).awaitIssuable(cred, runwaySessionId, opts)
  }

  issueGrant(cred: AvatarCredential, runwaySessionId: string): Promise<IssuedGrant> {
    return this.to(cred).issueGrant(cred, runwaySessionId)
  }

  cancel(
    cred: AvatarCredential,
    runwaySessionId: string,
    opts?: { graceMs?: number },
  ): Promise<void> {
    return this.to(cred).cancel(cred, runwaySessionId, opts)
  }

  getConversation(
    cred: AvatarCredential,
    runwaySessionId: string,
  ): Promise<ConversationTurn[] | null> {
    return this.to(cred).getConversation(cred, runwaySessionId)
  }

  breakerState(cred?: AvatarCredential): BreakerState {
    if (cred) return this.providers[cred.provider]?.breakerState(cred) ?? 'open'
    return bestOf(Object.values(this.providers).map((p) => p.breakerState()))
  }
}

export class AvatarRpcRouter implements AvatarRpcHost {
  private readonly hosts: ByVendor<AvatarRpcHost>
  /** Call id → the host that opened it. `close` and `liveness` are handed a handle, not a key. */
  private readonly opened = new Map<string, AvatarRpcHost>()

  constructor(hosts: ByVendor<AvatarRpcHost>) {
    this.hosts = hosts
  }

  async open(
    runwaySessionId: string,
    cred: AvatarCredential,
    handlers: ToolHandlers,
  ): Promise<RpcHandle> {
    const host = this.hosts[cred.provider]
    if (!host) {
      throw new AvatarProviderError(
        'not_configured',
        `No ${cred.provider} tool gate is wired for credential ${cred.label}.`,
      )
    }
    const handle = await host.open(runwaySessionId, cred, handlers)
    this.opened.set(runwaySessionId, host)
    return handle
  }

  async close(handle: RpcHandle): Promise<void> {
    const host = this.opened.get(handle.runwaySessionId)
    if (!host) return
    this.opened.delete(handle.runwaySessionId)
    await host.close(handle)
  }

  async liveness(handle: RpcHandle): Promise<CallLiveness> {
    const host = this.opened.get(handle.runwaySessionId)
    return host ? host.liveness(handle) : 'unknown'
  }

  openCount(): number {
    let open = 0
    for (const host of Object.values(this.hosts)) open += host.openCount()
    return open
  }
}
