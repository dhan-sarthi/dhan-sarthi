/**
 * The tool gate on the wire: the hidden participant that answers the model's backend RPCs.
 *
 * `open()` resolves only once the handler is connected to the room, and it must have resolved
 * before the browser is ever handed its credentials — an ungated session is never issued. The
 * handle is held for the call's life, which is why the API is a persistent process.
 *
 * Implemented by `adapters/runway/rpc-host.ts` (`@runwayml/avatars-node-rpc`'s
 * `createRpcHandler`, whose handler type these mirror), `adapters/null/rpc-host.null.ts` (legal
 * only beside the null provider — a startup invariant in the composition root) and the test
 * double `FakeRpcHost` (records open() order relative to consume(); can be scripted to reject).
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
  readonly connected: boolean
}

export interface AvatarRpcHost {
  /** Joins the room and resolves on connection, or rejects on the timeout. */
  open(runwaySessionId: string, cred: AvatarCredential, handlers: ToolHandlers): Promise<RpcHandle>
  /** Idempotent. Called on end, reap, release-all and server close. */
  close(handle: RpcHandle): Promise<void>
  /** Handles open on this task. On /health. */
  openCount(): number
}
