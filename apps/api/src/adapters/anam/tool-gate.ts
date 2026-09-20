/**
 * AvatarRpcHost over HTTP, for Anam.
 *
 * The port's shape was drawn around Runway's hidden participant, and it survives the move
 * intact because what it really promises is narrower than "we joined a room": **after `open()`
 * resolves, the model's tools are answerable, and they are answered by us.** For Anam that is
 * true the moment the handlers are in the registry the webhook route reads, so `open()` is a
 * map write rather than a network join, and it cannot time out or half-connect.
 *
 * Liveness is the one place Anam differs in substance. Anam tells the *client* the connection
 * closed and tells us nothing, so there is no pushed signal — but the session it created for
 * our `clientLabel` does appear in `GET /v1/sessions`, and it carries an outcome once it is
 * over. So this polls rather than listens: the answer lags by up to the transport's cache TTL
 * plus Anam's own listing lag, and where the list says nothing the answer is `unknown` and the
 * client's `/end` beacon and the lease reaper are still the backstop. Nothing here ever claims
 * a liveness it cannot observe.
 */
import type {
  AvatarCredential,
  AvatarRpcHost,
  CallLiveness,
  RpcHandle,
  ToolHandlers,
} from '../../ports/index.ts'
import type { Logger } from '../../infra/logger.ts'
import { silentLogger } from '../../infra/logger.ts'
import type { AnamCallRegistry } from './call-registry.ts'
import type { AnamTransport } from './transport.ts'

export interface AnamToolGateOptions {
  registry: AnamCallRegistry
  transport: AnamTransport
  log?: Logger
}

export class AnamToolGate implements AvatarRpcHost {
  private readonly registry: AnamCallRegistry
  private readonly transport: AnamTransport
  private readonly log: Logger
  /** Call id → the credential that minted it. The list endpoint is per-key. */
  private readonly creds = new Map<string, AvatarCredential>()

  constructor(options: AnamToolGateOptions) {
    this.registry = options.registry
    this.transport = options.transport
    this.log = options.log ?? silentLogger
  }

  async open(
    runwaySessionId: string,
    cred: AvatarCredential,
    handlers: ToolHandlers,
  ): Promise<RpcHandle> {
    this.registry.attach(runwaySessionId, handlers)
    this.creds.set(runwaySessionId, cred)
    this.log.info({ runwaySessionId, tools: Object.keys(handlers) }, 'anam tool gate open')
    return { runwaySessionId, openedAt: new Date() }
  }

  async close(handle: RpcHandle): Promise<void> {
    this.registry.release(handle.runwaySessionId)
    this.creds.delete(handle.runwaySessionId)
    this.log.info({ runwaySessionId: handle.runwaySessionId }, 'anam tool gate closed')
  }

  /**
   * A row whose `exitStatus` is a spelling we recognise as an outcome is `gone`; one whose
   * status says the call is still running is `connected`; anything else — no row, no status, a
   * status nobody has seen before, a transport failure — is `unknown`.
   *
   * The last of those is the load-bearing one. A row's shape on a *live* Anam session has
   * never been observed (see `classify` in transport.ts), and being wrong in the `gone`
   * direction hangs up on a customer mid-sentence, so an unrecognised status is logged at warn
   * and read as no evidence at all. That log line is how the real spelling gets learnt: the
   * first billed call that carries one prints it, and it can then be added to the set.
   */
  async liveness(handle: RpcHandle): Promise<CallLiveness> {
    const cred = this.creds.get(handle.runwaySessionId)
    if (!cred) return 'unknown'
    try {
      const rows = await this.transport.listSessions(cred)
      const row = rows?.find((r) => r.clientLabel === handle.runwaySessionId)
      if (!row) return 'unknown'
      if (row.state === 'ended') return 'gone'
      if (row.state === 'live') return 'connected'
      if (row.exitStatus !== null) {
        this.log.warn(
          { runwaySessionId: handle.runwaySessionId, exitStatus: row.exitStatus },
          'anam listed an exitStatus this build does not recognise; reading it as unknown',
        )
      }
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  openCount(): number {
    return this.registry.openCount()
  }
}
