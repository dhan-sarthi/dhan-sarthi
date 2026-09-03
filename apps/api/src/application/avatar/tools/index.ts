/**
 * The three tools, keyed as Runway registers them. Every handler catches its own errors and
 * answers with something the model can say, because a thrown error reaches the worker as a
 * timeout and the customer as silence.
 */
import type { ToolHandler, ToolHandlers } from '../../../ports/index.ts'
import { makeCheckSuitability } from './check-suitability.tool.ts'
import type { ToolContext } from './context.ts'
import { makeGetPlan } from './get-plan.tool.ts'
import { makeQuerySpend } from './query-spend.tool.ts'

export type { ToolContext } from './context.ts'

const FALLBACK = {
  text: 'I could not check that just now. Let me come back to it in a moment.',
  evidence: [],
}

function guarded(ctx: ToolContext, name: string, handler: ToolHandler): ToolHandler {
  return async (args) => {
    const started = ctx.clock.now().getTime()
    try {
      const result = await handler(args)
      // The one line that proves, in the API log, that the worker asked and the rules answered.
      ctx.log.info(
        {
          runwaySessionId: ctx.runwaySessionId,
          tool: name,
          latencyMs: ctx.clock.now().getTime() - started,
          ...(name === 'check_suitability'
            ? { verdict: result['verdict'], ruleId: result['rule_id'], product: result['product'] }
            : {}),
        },
        'tool call answered',
      )
      return result
    } catch (err) {
      ctx.log.error(
        { runwaySessionId: ctx.runwaySessionId, tool: name, err: (err as Error).message },
        'tool handler failed',
      )
      return name === 'check_suitability'
        ? {
            verdict: 'UNKNOWN_PRODUCT',
            product: null,
            rule_id: null,
            spoken:
              'I could not run the suitability check just now, so I will not recommend anything until I can.',
            alternative: null,
          }
        : FALLBACK
    }
  }
}

export function makeToolHandlers(ctx: ToolContext): ToolHandlers {
  return {
    check_suitability: guarded(ctx, 'check_suitability', makeCheckSuitability(ctx)),
    query_spend: guarded(ctx, 'query_spend', makeQuerySpend(ctx)),
    get_plan: guarded(ctx, 'get_plan', makeGetPlan(ctx)),
  }
}
