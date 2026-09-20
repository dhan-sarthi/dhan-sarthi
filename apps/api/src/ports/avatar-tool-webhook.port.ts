/**
 * The gate, when the provider knocks on it over HTTP instead of over a room.
 *
 * Runway's model reached our tools through a LiveKit RPC the `AvatarRpcHost` answered from
 * inside the room, so nothing had to be exposed to the internet. Anam's model reaches them by
 * calling a URL from Anam's servers, which means the same handlers need a public front door —
 * and a front door needs a doorman, because Anam signs nothing and its request body carries
 * only what the model extracted. Nothing in it says whose call this is.
 *
 * So this port answers one question: *may this request be answered, and if so, by which
 * handler?* Implemented by `adapters/anam/tool-webhook.ts` over the shared call registry, and
 * by `adapters/null/tool-webhook.null.ts` under Runway or no provider at all, where the route
 * exists but nothing may ever come through it.
 *
 * That the null adapter's whole body is one `unknown_call` is the seam working, not evidence
 * against it: the route is a fixed contract under all three providers, and the only thing
 * http/routes/services.ts:47 is allowed to name is this interface.
 */
export type ToolWebhookOutcome =
  /** The tool ran. Its result goes back to the model verbatim. */
  | { status: 'ok'; result: Record<string, unknown> }
  /** No such live call in this process. A stale URL from a finished session. */
  | { status: 'unknown_call' }
  /** The call exists and the secret did not match. Someone has the URL and not the key. */
  | { status: 'bad_secret' }
  /** The call exists, the secret matched, and the gate is not open yet. Never answer these. */
  | { status: 'not_gated' }
  /** The gate is open and does not have that tool. */
  | { status: 'unknown_tool' }

export interface AvatarToolWebhook {
  dispatch(input: {
    runwaySessionId: string
    tool: string
    secret: string
    args: Record<string, unknown>
  }): Promise<ToolWebhookOutcome>
}
