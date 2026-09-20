/**
 * The tool gate: whatever makes the model's tools answerable, and answered by us.
 *
 * `open()` resolves only once that is true, and it must have resolved before the browser is
 * ever handed its credentials — an ungated session is never issued. For Runway that means
 * joining the LiveKit room as a hidden participant; for Anam it means the handlers are in the
 * registry the webhook route reads. The handle is held for the call's life, which is why the
 * API is a persistent process.
 *
 * Implemented by `adapters/runway/rpc-host.ts` (`@runwayml/avatars-node-rpc`'s
 * `createRpcHandler`, whose handler type these mirror), `adapters/anam/tool-gate.ts` (a map
 * write plus a polled liveness read), `adapters/null/rpc-host.null.ts` (legal only beside the
 * null provider — a startup invariant in the composition root) and the test double
 * `FakeRpcHost` (records open() order relative to the grant; can be scripted to reject).
 */
import type { ToolName } from '@dhan/contracts'
import type { AvatarCredential } from './avatar-provider.port.ts'

export type ToolArgs = Record<string, unknown>
/** Bad arguments become a result the model can read, never a rejection. */
export type ToolHandler = (args: ToolArgs) => Promise<Record<string, unknown>>
export type ToolHandlers = Record<ToolName, ToolHandler>

export interface RpcHandle {
  readonly runwaySessionId: string
  readonly openedAt: Date
}

/**
 * What this process can truthfully say about a call it is still holding a lease for.
 *
 *   connected  a signal this process holds says the call is up
 *   gone       a signal says it has ended. The slot may be freed now
 *   unknown    there is no signal. Not "probably fine" — no evidence either way, and the
 *              caller must fall back to the /end beacon and the reaper rather than guess
 */
export type CallLiveness = 'connected' | 'gone' | 'unknown'

export interface AvatarRpcHost {
  /**
   * Make the model's tools answerable, and answered by us. Resolves only once that is true,
   * or rejects.
   */
  open(runwaySessionId: string, cred: AvatarCredential, handlers: ToolHandlers): Promise<RpcHandle>
  /** Idempotent. Called on end, reap, release-all and server close. */
  close(handle: RpcHandle): Promise<void>
  /**
   * Never throws and never guesses: an error, a missing signal or an unrecognised answer is
   * `unknown`. May do I/O; the caller polls it every couple of seconds.
   */
  liveness(handle: RpcHandle): Promise<CallLiveness>
  /** Handles open on this task. On /health. */
  openCount(): number
}
