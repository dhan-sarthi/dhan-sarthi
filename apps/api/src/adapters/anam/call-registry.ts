/**
 * What the Anam tool gate is made of, in place of a room.
 *
 * Runway's gate was a hidden participant: `RunwayRpcHost.open()` joined the LiveKit room, and a
 * resolved promise meant the tools were answerable *on the wire*. Anam has no room. Its tools
 * arrive as ordinary HTTP from Anam's servers, so the gate is a route — and the thing that has
 * to be true before a session is handed out is no longer "we joined" but "this process is
 * holding handlers for this call, and knows the secret that proves a request belongs to it".
 *
 * That is all this registry is, and keeping it in one small object is what lets three pieces
 * that must not import each other agree:
 *
 *   the provider   mints the secret at session-create time, because the tool URLs and headers
 *                  are baked into the persona config and cannot be changed afterwards
 *   the gate       attaches the handlers, and only then is the call answerable
 *   the route      dispatches, having proved the secret and that the handlers are there
 *
 * The ordering invariant is unchanged from Runway's, and still enforced by the same lifecycle:
 * `open()` runs before `consume()`, so a tool call cannot be answered by a half-built session.
 * A call whose handlers are not attached is refused with a 409, never answered.
 */
import { randomBytes } from 'node:crypto'
import type { ToolHandlers } from '../../ports/index.ts'

export interface RegisteredCall {
  readonly runwaySessionId: string
  readonly secret: string
  /** Null until the gate opens. A tool call arriving before then is refused. */
  handlers: ToolHandlers | null
}

export class AnamCallRegistry {
  private readonly calls = new Map<string, RegisteredCall>()

  /** Called by the provider, before the persona config that embeds the secret is sent. */
  mint(runwaySessionId: string): string {
    const secret = randomBytes(24).toString('base64url')
    this.calls.set(runwaySessionId, { runwaySessionId, secret, handlers: null })
    return secret
  }

  /** Called by the gate. From here the call is answerable. */
  attach(runwaySessionId: string, handlers: ToolHandlers): RegisteredCall {
    const call = this.calls.get(runwaySessionId)
    if (!call) throw new Error(`no minted Anam call ${runwaySessionId} to attach handlers to`)
    call.handlers = handlers
    return call
  }

  release(runwaySessionId: string): void {
    this.calls.delete(runwaySessionId)
  }

  get(runwaySessionId: string): RegisteredCall | undefined {
    return this.calls.get(runwaySessionId)
  }

  /** How many calls have handlers attached — the gate's `openCount()`. */
  openCount(): number {
    let open = 0
    for (const call of this.calls.values()) if (call.handlers) open += 1
    return open
  }
}

/**
 * Constant-time compare, because the secret is the only thing standing between the gate and
 * anyone who has seen a tool URL. Anam does not sign its webhook requests.
 */
export function secretMatches(expected: string, given: string): boolean {
  if (expected.length !== given.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}
