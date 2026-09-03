/**
 * An AvatarRpcHost that records when it was opened relative to the provider's calls and keeps
 * the tool handlers it was given, so a test can invoke `check_suitability` exactly as the
 * worker would.
 */
import type {
  AvatarCredential,
  AvatarRpcHost,
  RpcHandle,
  ToolHandlers,
} from '../../src/ports/index.ts'

export class FakeRpcHost implements AvatarRpcHost {
  readonly events: string[]
  readonly opened = new Map<string, ToolHandlers>()
  readonly closed: string[] = []
  /** Handles whose room has closed under them; `connected` reads false for these. */
  private readonly dropped = new Set<string>()
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
    const dropped = this.dropped
    return {
      runwaySessionId,
      openedAt: new Date(),
      get connected() {
        return !dropped.has(runwaySessionId)
      },
    }
  }

  /** Simulate the room closing under a live call: the worker died or Runway ended the session. */
  disconnect(runwaySessionId: string): void {
    this.dropped.add(runwaySessionId)
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
