/**
 * AvatarRpcHost over `@runwayml/avatars-node-rpc`.
 *
 * What the 3 September spike established about the SDK, and what this file leans on:
 * `createRpcHandler` POSTs `/connect_backend`, joins the LiveKit room as a hidden participant,
 * registers one RPC method per tool (rejecting callers not prefixed `worker:`, parsing
 * `payload.args ?? payload`, converting thrown errors into RpcErrors so the worker does not
 * wait out its timeout), then calls `onConnected` synchronously and resolves. So awaiting it
 * IS the gate — a resolved promise means the tools are answerable on the wire. The deadline
 * here guards a hung join; a late resolution after the deadline is closed, not leaked.
 *
 * The native LiveKit binding keeps the event loop alive after close and rtc-node writes its
 * own pino lines to stdout. Both are the SDK's behaviour, not ours.
 */
import type { RpcHandler, createRpcHandler as CreateRpcHandler } from '@runwayml/avatars-node-rpc'
import { AvatarProviderError } from '../../application/avatar/provider-error.ts'
import type { Logger } from '../../infra/logger.ts'
import { silentLogger } from '../../infra/logger.ts'
import { isTimeout, withTimeout } from '../../infra/timeout.ts'
import type {
  AvatarCredential,
  AvatarRpcHost,
  CallLiveness,
  RpcHandle,
  ToolHandlers,
} from '../../ports/index.ts'

export interface RunwayRpcHostOptions {
  baseUrl: string
  openTimeoutMs?: number
  log?: Logger
}

export class RunwayRpcHost implements AvatarRpcHost {
  private readonly handlers = new Map<string, RpcHandler>()
  private readonly baseUrl: string
  private readonly openTimeoutMs: number
  private readonly log: Logger

  constructor(options: RunwayRpcHostOptions) {
    this.baseUrl = options.baseUrl
    this.openTimeoutMs = options.openTimeoutMs ?? 8_000
    this.log = options.log ?? silentLogger
  }

  private sdk(): Promise<{ createRpcHandler: typeof CreateRpcHandler }> {
    return import('@runwayml/avatars-node-rpc')
  }

  async open(
    runwaySessionId: string,
    cred: AvatarCredential,
    handlers: ToolHandlers,
  ): Promise<RpcHandle> {
    let connected = false
    const startedAt = Date.now()
    // Loaded on first use: importing the SDK loads LiveKit's native binding, which a process
    // running the memory profile with no avatar has no reason to carry.
    const { createRpcHandler } = await this.sdk()
    const pending = createRpcHandler({
      apiKey: cred.key,
      sessionId: runwaySessionId,
      baseUrl: this.baseUrl,
      tools: handlers,
      onConnected: () => {
        connected = true
        this.log.info(
          { runwaySessionId, joinMs: Date.now() - startedAt, tools: Object.keys(handlers) },
          'rpc handler connected',
        )
      },
      onDisconnected: () => {
        connected = false
        this.log.info({ runwaySessionId }, 'rpc handler disconnected')
      },
      onError: (err) => this.log.warn({ runwaySessionId, err: err.message }, 'rpc handler error'),
    })

    let handler: RpcHandler
    try {
      handler = await withTimeout(() => pending, this.openTimeoutMs, 'RPC handler join')
    } catch (err) {
      // A join that lands after the deadline must not linger as a billed participant.
      pending.then(
        (late) => late.close().catch(() => {}),
        () => {},
      )
      throw new AvatarProviderError(
        isTimeout(err) ? 'timeout' : 'failed',
        `The tool gate could not join the call: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!connected && !handler.connected) {
      await handler.close().catch(() => {})
      throw new AvatarProviderError('failed', 'The tool gate joined but never connected.')
    }

    this.handlers.set(runwaySessionId, handler)
    return { runwaySessionId, openedAt: new Date() }
  }

  /**
   * The SDK's own view of the room, read off the handler this process still holds. A handle we
   * have closed, or never opened, is `unknown` rather than `gone`: it is not evidence about the
   * call, only about our bookkeeping.
   */
  async liveness(handle: RpcHandle): Promise<CallLiveness> {
    const handler = this.handlers.get(handle.runwaySessionId)
    if (!handler) return 'unknown'
    return handler.connected ? 'connected' : 'gone'
  }

  async close(handle: RpcHandle): Promise<void> {
    const handler = this.handlers.get(handle.runwaySessionId)
    if (!handler) return
    this.handlers.delete(handle.runwaySessionId)
    try {
      await handler.close()
    } catch (err) {
      this.log.warn(
        { runwaySessionId: handle.runwaySessionId, err: (err as Error).message },
        'rpc handler close failed',
      )
    }
  }

  openCount(): number {
    return this.handlers.size
  }
}
