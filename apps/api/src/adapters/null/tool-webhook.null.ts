/**
 * The tool webhook under Runway, or under no provider at all: the route exists, because routes
 * are a fixed contract, and nothing may ever come through it. Runway's tools are answered
 * inside the room by `RunwayRpcHost`, so a request arriving here is either a stale URL from an
 * Anam deployment or someone guessing.
 */
import type { AvatarToolWebhook, ToolWebhookOutcome } from '../../ports/avatar-tool-webhook.port.ts'

export class NullToolWebhook implements AvatarToolWebhook {
  async dispatch(): Promise<ToolWebhookOutcome> {
    return { status: 'unknown_call' }
  }
}
