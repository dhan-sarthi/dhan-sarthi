/**
 * `check_suitability`: the gate, on the wire.
 *
 * The model names a product; the shelf resolves it; `evaluate()` from `@dhan/core` judges it
 * over the snapshot computed at grant; the advice record and the tool-call row are written
 * BEFORE the verdict is returned, so the record exists before the sentence is spoken. Bad
 * arguments and unknown products come back as results the model can read aloud, never as
 * exceptions — an exception would leave the worker waiting out its timeout with nothing to say.
 */
import { evaluate } from '@dhan/core'
import { TOOLS } from '@dhan/contracts'
import type { CheckSuitabilityResult } from '@dhan/contracts'
import type { ToolHandler } from '../../../ports/index.ts'
import type { ToolContext } from './context.ts'

const UNKNOWN = "I don't have that product on IDBI's shelf, so I can't check it."
const UNCLEAR = "I didn't catch which product you mean. Could you say the name again?"

export function makeCheckSuitability(ctx: ToolContext): ToolHandler {
  const { view, shelf, audit, session, runwaySessionId, engineVersion } = ctx
  const contract = TOOLS.check_suitability

  return async (rawArgs) => {
    const started = ctx.clock.now().getTime()
    const args = contract.args.safeParse(rawArgs)
    const record = async (
      result: CheckSuitabilityResult,
      adviceRecordId: string | null,
    ): Promise<CheckSuitabilityResult> => {
      await audit.appendToolCall({
        runwaySessionId,
        tool: 'check_suitability',
        args: (rawArgs ?? {}) as Record<string, unknown>,
        result,
        adviceRecordId,
        latencyMs: ctx.clock.now().getTime() - started,
      })
      return result
    }

    if (!args.success) {
      return record(
        {
          verdict: 'UNKNOWN_PRODUCT',
          product: null,
          rule_id: null,
          spoken: UNCLEAR,
          alternative: null,
        },
        null,
      )
    }

    const amount = args.data.monthly_amount ?? 0
    const product = await shelf.resolve(args.data.product_name)

    const base = {
      sessionId: session.id,
      subjectId: session.subjectId,
      snapshotId: view.stored.id,
      consentId: view.consent.consentId,
      source: 'avatar_tool' as const,
      actionId: null,
      actionKind: null,
      amount,
      evidence: [`Asked about "${args.data.product_name}"`],
      engineVersion,
      runwaySessionId,
      atSim: session.asOf,
    }

    if (!product) {
      const advice = await audit.appendAdvice({
        ...base,
        productId: null,
        verdict: 'UNKNOWN_PRODUCT',
        ruleId: null,
        rulesPassed: [],
        spoken: UNKNOWN,
        recorded: `Unknown product "${args.data.product_name}": not resolved against the shelf; no verdict given.`,
        alternative: null,
      })
      return record(
        {
          verdict: 'UNKNOWN_PRODUCT',
          product: null,
          rule_id: null,
          spoken: UNKNOWN,
          alternative: null,
        },
        advice.id,
      )
    }

    const verdict = evaluate({
      product,
      snapshot: view.snapshot,
      amount,
      goal: { kind: view.goal.kind, horizonYears: view.horizonYears },
      alternatives: view.shelfProducts,
    })

    const spoken =
      verdict.spoken ??
      `${product.name} passes the bank's suitability rules for you${amount > 0 ? ` at ${inr(amount)} a month` : ''}.`

    const advice = await audit.appendAdvice({
      ...base,
      productId: product.productId,
      verdict: verdict.verdict,
      ruleId: verdict.ruleId,
      rulesPassed: verdict.passed,
      spoken,
      recorded: verdict.recorded,
      alternative: verdict.alternative,
    })

    return record(
      {
        verdict: verdict.verdict,
        product: product.name,
        rule_id: verdict.ruleId,
        spoken,
        alternative: verdict.alternative
          ? {
              product_id: verdict.alternative.productId,
              name: verdict.alternative.name,
              monthly: verdict.alternative.monthly,
            }
          : null,
      },
      advice.id,
    )
  }
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`
