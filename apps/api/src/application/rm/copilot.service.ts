/**
 * Owned by the copilot builder.
 *
 * The RM copilot: "Brief me for a meeting" and "Ask about this customer", scoped to one customer
 * in the caller's book (docs/product/rm-console.md, "Copilot rules"):
 *
 * - Facts are assembled here, deterministically, as numbered lines (`F1`, `F2` …), each with
 *   its source, from `book.state(cif)` and the customer's record (`activity`). The model writes
 *   from those lines only and marks each sentence with the fact ids it uses; a sentence is kept
 *   only if its ids exist and every figure in it appears in a cited fact.
 * - **The model never decides suitability.** A question naming a shelf product runs
 *   `evaluate()` first and quotes its verdict verbatim. The check is a `checked` access entry,
 *   never an advice record: the customer's chain is what the customer was told.
 * - With no key or a failed call the deterministic brief is the answer, `phrasedBy: 'rules'`.
 *   Never an error.
 * - `model` is the copilot's own instance (`composition/rm-copilot.ts`, `RM_COPILOT_*`), with
 *   its own breaker, so the console can never open the breaker on the customer's `/ask`.
 *
 * Both routes are already checked against the book in their handlers
 * (`http/routes/rm-copilot.ts`). The bodies below are the core builder's safe defaults: valid,
 * empty answers that still write the access entry the contract promises. Replace them; keep the
 * signatures. `prompts` feeds `Customer360.copilotPrompts` on the customer page.
 */
import type { RmAnswer, RmAskRequest, RmBrief } from '@dhan/contracts'
import type { Logger } from '../../infra/logger.ts'
import type { Clock, LanguageModelPort, ProductShelfPort } from '../../ports/index.ts'
import type { RmAccessLog } from './access-log.ts'
import type { RmActivityService } from './activity.service.ts'
import type { RmBookService } from './book.service.ts'
import type { RmCaller } from './caller.ts'
import type { CustomerState } from './customer-state.ts'

export interface RmCopilotDeps {
  book: RmBookService
  activity: RmActivityService
  accessLog: RmAccessLog
  shelf: ProductShelfPort
  /** The copilot's own model and breaker; the null model when no key is configured. */
  model: LanguageModelPort
  clock: Clock
  log: Logger
}

export class RmCopilotService {
  private readonly deps: RmCopilotDeps

  constructor(deps: RmCopilotDeps) {
    this.deps = deps
  }

  async brief(rm: RmCaller, cif: string): Promise<RmBrief> {
    await this.deps.accessLog.record(rm, cif, 'briefed', 'Meeting brief')
    return {
      sections: [],
      facts: [],
      phrasedBy: 'rules',
      generatedAt: this.deps.clock.now().toISOString(),
    }
  }

  async ask(rm: RmCaller, cif: string, request: RmAskRequest): Promise<RmAnswer> {
    await this.deps.accessLog.record(
      rm,
      cif,
      'asked',
      'Question about the customer',
      request.question,
    )
    return { sentences: [], facts: [], phrasedBy: 'rules', verdict: null }
  }

  /**
   * The suggested questions under the box, from the customer's own signals so each one has an
   * answer on file. Pure over the state; no model.
   */
  prompts(state: CustomerState): string[] {
    const name = state.file.customer.custName.split(/\s+/)[0] ?? 'the customer'
    const out = [`Brief me for a meeting with ${name}`]
    if (state.signals.length > 0) out.push(`What should I raise first with ${name}?`)
    if (state.health !== 'on_track') {
      const health = state.health === 'at_risk' ? 'at risk' : 'off track'
      out.push(`Why is ${name}'s goal ${health}?`)
    }
    out.push(`What has changed in ${name}'s money over the last three months?`)
    return out
  }
}
