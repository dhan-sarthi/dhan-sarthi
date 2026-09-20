/**
 * An AvatarRpcHost that records when it was opened relative to the provider's calls and keeps
 * the tool handlers it was given, so a test can invoke `check_suitability` exactly as the
 * worker would.
 */
import type {
  AvatarCredential,
  AvatarRpcHost,
  CallLiveness,
  RpcHandle,
  ToolHandlers,
} from '../../src/ports/index.ts'

export class FakeRpcHost implements AvatarRpcHost {
  readonly events: string[]
  readonly opened = new Map<string, ToolHandlers>()
  readonly closed: string[] = []
  /** Handles whose call has ended under them; `liveness` reads `gone` for these. */
  private readonly dropped = new Set<string>()
  /** Handles this host can say nothing about, for exercising the `unknown` branch. */
  private readonly opaque = new Set<string>()
  rejectOpen = false

  constructor(events: string[] = []) {
    this.events = events
  }

  async open(
    runwaySessionId: string,
    _cred: AvatarCredential,
    handlers: ToolHandlers,
  ): Promise<RpcHandle> {
    this.events.push('open')
    if (this.rejectOpen) throw new Error('join refused')
    this.opened.set(runwaySessionId, handlers)
    return { runwaySessionId, openedAt: new Date() }
  }

  /** Simulate the call ending under us: the worker died, or the provider ended the session. */
  disconnect(runwaySessionId: string): void {
    this.dropped.add(runwaySessionId)
  }

  /** Simulate a provider that gives this process no evidence either way. */
  cannotTell(runwaySessionId: string): void {
    this.opaque.add(runwaySessionId)
  }

  async liveness(handle: RpcHandle): Promise<CallLiveness> {
    const id = handle.runwaySessionId
    if (this.opaque.has(id) || !this.opened.has(id)) return 'unknown'
    return this.dropped.has(id) ? 'gone' : 'connected'
  }

  async close(handle: RpcHandle): Promise<void> {
    this.events.push('close')
    this.opened.delete(handle.runwaySessionId)
    this.closed.push(handle.runwaySessionId)
  }

  openCount(): number {
    return this.opened.size
  }

  handlers(runwaySessionId: string): ToolHandlers | undefined {
    return this.opened.get(runwaySessionId)
  }
}
