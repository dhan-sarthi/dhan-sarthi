/**
 * The doorman on the Anam gate.
 *
 * Every refusal here is a refusal to *answer*, never a refusal to log. An unknown call is a
 * stale URL; a bad secret is someone holding a URL they should not have; and `not_gated` is
 * the invariant that matters most — a tool call that arrives between the session being minted
 * and the handlers being attached is turned away, because answering it would mean the model
 * heard a verdict from a session that was not yet gated.
 */
import type { ToolName } from '@dhan/contracts'
import type { AvatarToolWebhook, ToolWebhookOutcome } from '../../ports/avatar-tool-webhook.port.ts'
import { type AnamCallRegistry, secretMatches } from './call-registry.ts'

export class AnamToolWebhook implements AvatarToolWebhook {
  private readonly registry: AnamCallRegistry

  constructor(registry: AnamCallRegistry) {
    this.registry = registry
  }

  async dispatch(input: {
    runwaySessionId: string
    tool: string
    secret: string
    args: Record<string, unknown>
  }): Promise<ToolWebhookOutcome> {
    const call = this.registry.get(input.runwaySessionId)
    if (!call) return { status: 'unknown_call' }
    if (!secretMatches(call.secret, input.secret)) return { status: 'bad_secret' }
    if (!call.handlers) return { status: 'not_gated' }

    const handler = call.handlers[input.tool as ToolName]
    if (!handler) return { status: 'unknown_tool' }

    // Bad arguments become a result the model can read, never a rejection — the same contract
    // the handlers had over Runway's RPC, so the tools themselves did not change at all.
    return { status: 'ok', result: await handler(input.args) }
  }
}
