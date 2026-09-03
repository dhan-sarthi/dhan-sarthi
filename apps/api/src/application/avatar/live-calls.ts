/**
 * The calls this task is hosting right now: the one piece of genuinely in-process avatar state,
 * because the RPC handle is a held LiveKit connection that only the task that opened it can
 * close. Shared by the session service, the reaper and the shutdown path.
 */
import type { AvatarCredential, Lease, RpcHandle } from '../../ports/index.ts'
import type { Lifecycle } from './lifecycle.ts'

export interface LiveCall {
  runwaySessionId: string
  sessionId: string
  cred: AvatarCredential
  lease: Lease
  handle: RpcHandle | null
  lifecycle: Lifecycle
  openedAt: Date
  maxSeconds: number
}

export class LiveCalls {
  private readonly calls = new Map<string, LiveCall>()

  set(call: LiveCall): void {
    this.calls.set(call.runwaySessionId, call)
  }

  get(runwaySessionId: string): LiveCall | undefined {
    return this.calls.get(runwaySessionId)
  }

  take(runwaySessionId: string): LiveCall | undefined {
    const call = this.calls.get(runwaySessionId)
    this.calls.delete(runwaySessionId)
    return call
  }

  bySession(sessionId: string): LiveCall | undefined {
    for (const call of this.calls.values()) if (call.sessionId === sessionId) return call
    return undefined
  }

  all(): LiveCall[] {
    return [...this.calls.values()]
  }

  get size(): number {
    return this.calls.size
  }
}
