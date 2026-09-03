/**
 * `query_spend`: the model never does arithmetic. The question goes to `core/query.ts` over
 * the session's snapshot and ledger, and the sentence it returns is what gets said.
 */
import { answer } from '@dhan/core'
import { TOOLS } from '@dhan/contracts'
import type { QuerySpendResult } from '@dhan/contracts'
import type { ToolHandler } from '../../../ports/index.ts'
import type { ToolContext } from './context.ts'

export function makeQuerySpend(ctx: ToolContext): ToolHandler {
  const { view, audit, runwaySessionId } = ctx

  return async (rawArgs) => {
    const started = ctx.clock.now().getTime()
    const args = TOOLS.query_spend.args.safeParse(rawArgs)

    const result: QuerySpendResult = args.success
      ? (({ text, evidence }) => ({ text, evidence }))(
          answer(args.data.question, view.snapshot, view.file),
        )
      : {
          text: 'I did not catch the question. Could you ask it again?',
          evidence: [],
        }

    await audit.appendToolCall({
      runwaySessionId,
      tool: 'query_spend',
      args: (rawArgs ?? {}) as Record<string, unknown>,
      result,
      adviceRecordId: null,
      latencyMs: ctx.clock.now().getTime() - started,
    })
    return result
  }
}
