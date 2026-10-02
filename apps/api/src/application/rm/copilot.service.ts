/**
 * The RM copilot: "Brief me for a meeting" and "Ask about this customer", scoped to one customer
 * in the caller's book (docs/product/rm-console.md, "Copilot rules").
 *
 * Five files, one job each, and this one only runs them in order:
 *
 * 1. `copilot.facts.ts` reads the customer's state at the RM clock and their activity into
 *    numbered lines, `F1 … Fn`, each with its source. Deterministic: the same record gives the
 *    same lines.
 * 2. `copilot.prompt.ts` hands those lines, and nothing else, to the copilot's own model, and
 *    asks for one sentence a line, each ending with the ids it rests on.
 * 3. `copilot.guard.ts` keeps a sentence only if every id exists, every figure in it appears in
 *    a fact it cites, and every rupee figure keeps the meaning that fact gives it
 *    (`copilot.meaning.ts`). Too few survive, or the model is off, slow or wrong, and
 * 4. `copilot.rules.ts` writes the brief or the answer from the same lines. That is an answer,
 *    not an error: `phrasedBy: 'rules'`, and every sentence still cites its facts.
 * 5. `copilot.arrange.ts` shapes either brief the same way before the RM reads it: one sentence
 *    a line, "Talk about" and "Be careful about" in the engine's signal order, and each talking
 *    point tagged by its signal's severity. The model never decides what is urgent or what comes
 *    first. Every brief and answer leaves with each sentence's citations once each and in the
 *    order the console numbers its footnotes, so they print ascending ("1 2", never "2 1").
 *
 * **The model never decides suitability.** A question naming a shelf product runs `evaluate()`
 * first, over the same snapshot, goal and shelf the console reads, and the verdict travels back
 * verbatim beside the answer. That check is a `checked` entry in the RM's access log, never an
 * advice record: the customer's chain is what the customer was told, and the desk asking a
 * question told the customer nothing.
 *
 * `model` is the copilot's own instance (`composition/rm-copilot.ts`, `RM_COPILOT_*`) with its
 * own breaker, so a brief that times out can never open the breaker on the customer's `/ask`.
 * Both routes are checked against the caller's book in their handlers before they reach here.
 */
import { firstName, ruleLabel } from '@dhan/core'
import type {
  CitedSentence,
  RmAnswer,
  RmAskRequest,
  RmBrief,
  RmCheckVerdict,
} from '@dhan/contracts'
import type { Logger } from '../../infra/logger.ts'
import type { ChatMessage, Clock, LanguageModelPort, ProductShelfPort } from '../../ports/index.ts'
import type { RmAccessLog } from './access-log.ts'
import { NO_ACTIVITY } from './activity.service.ts'
import type { ActivityFacts, RmActivityService } from './activity.service.ts'
import type { RmBookService } from './book.service.ts'
import type { RmCaller } from './caller.ts'
import {
  WHOLE_LINE_SECTIONS,
  arrangeBrief,
  briefInReadingOrder,
  factRanks,
  inReadingOrder,
  oneSentenceALine,
} from './copilot.arrange.ts'
import type { Arranged } from './copilot.arrange.ts'
import { factSheet, withVerdict } from './copilot.facts.ts'
import type { CopilotRecord } from './copilot.facts.ts'
import { candidates, screen } from './copilot.guard.ts'
import type { Screened } from './copilot.guard.ts'
import { BRIEF_SECTIONS, askPrompt, briefHeading, briefPrompt } from './copilot.prompt.ts'
import type { PromptPeople } from './copilot.prompt.ts'
import { productCheck, rulesAnswer, rulesBrief, suggestedPrompts } from './copilot.rules.ts'
import type { BriefPart } from './copilot.rules.ts'
import type { CustomerState } from './customer-state.ts'

/** A check's outcome in the access log, in the words the Advice record uses, not a rule's code. */
const CHECK_WORDS: Readonly<Record<RmCheckVerdict['verdict'], (ruleId: string | null) => string>> =
  {
    BLOCKED: (ruleId) => `refused under "${ruleLabel(ruleId ?? '')}"`,
    PASS: () => 'every rule passed',
  }

export interface RmCopilotDeps {
  book: RmBookService
  activity: RmActivityService
  accessLog: RmAccessLog
  /**
   * Kept for the wiring's sake. The copilot reads the shelf the customer's state was gated over
   * (`CustomerState.shelf`), so a check here and the plan on the customer page judge the same
   * products.
   */
  shelf: ProductShelfPort
  /** The copilot's own model and breaker; the null model when no key is configured. */
  model: LanguageModelPort
  clock: Clock
  log: Logger
}

/**
 * Fewer surviving model sentences than this and the brief is the rules' brief. Four is one a
 * section: below it, the model has either failed the format or failed the guard often enough
 * that what is left is not a brief.
 */
export const MIN_MODEL_SENTENCES = 4

/**
 * The most sentences a model's section or answer keeps. One more than the rules' brief keeps,
 * because a point the model wrote as two sentences arrives here as two.
 */
const SECTION_MAX = 5
const ANSWER_MAX = 4

export class RmCopilotService {
  private readonly deps: RmCopilotDeps

  constructor(deps: RmCopilotDeps) {
    this.deps = deps
  }

  async brief(rm: RmCaller, cif: string): Promise<RmBrief> {
    const started = performance.now()
    const state = await this.deps.book.state(cif)
    const sheet = factSheet(state, await this.record(rm, cif))
    const ranks = factRanks(sheet)
    const rules = arrangeBrief(rulesBrief(state, sheet), ranks, sheet.facts).sections

    let sections: BriefPart[] = rules
    let phrasedBy: RmBrief['phrasedBy'] = 'rules'
    const output = await this.complete(() => briefPrompt(this.people(rm, state), sheet.facts))
    if (output !== null) {
      const screened = screen(
        candidates(oneSentenceALine(output, briefHeading, WHOLE_LINE_SECTIONS), briefHeading),
        { facts: sheet.facts, state },
        true,
      )
      const arranged = arrangeBrief(
        BRIEF_SECTIONS.map((title) => ({
          title,
          sentences: screened.kept
            .filter((c) => c.section === title)
            .map(({ text, cites }) => ({ text, cites })),
        })),
        ranks,
        sheet.facts,
      )
      this.logScreen('brief', cif, screened, started, arranged)
      const kept = arranged.sections.reduce((n, part) => n + part.sentences.length, 0)
      if (kept >= MIN_MODEL_SENTENCES) {
        // A heading the model left empty, or emptied by the guard, keeps the rules' sentences
        // rather than reaching the RM blank. The cap comes after the ordering, so it is the
        // lowest-ranked points that go.
        sections = arranged.sections.map((part) => ({
          title: part.title,
          sentences:
            part.sentences.length > 0
              ? part.sentences.slice(0, SECTION_MAX)
              : (rules.find((r) => r.title === part.title)?.sentences ?? []),
        }))
        phrasedBy = 'model'
      }
    }

    await this.deps.accessLog.record(rm, cif, 'briefed', 'Meeting brief')
    return {
      // Last, over the brief as it will be read: a rules part standing in for an empty model
      // part changes which ids are cited first.
      sections: briefInReadingOrder(sections),
      facts: sheet.facts,
      phrasedBy,
      generatedAt: this.deps.clock.now().toISOString(),
    }
  }

  async ask(rm: RmCaller, cif: string, request: RmAskRequest): Promise<RmAnswer> {
    const started = performance.now()
    const question = request.question
    const state = await this.deps.book.state(cif)
    let sheet = factSheet(state, await this.record(rm, cif))

    /*
     * The gate, before any model. A product named in the question is judged by the rules over
     * this customer's snapshot, as the customer's own text chat judges it (`gateFor` in
     * `conversation.service.ts`): no amount, the goal's kind, the plan's horizon, the shelf the
     * plan was gated over. The verdict is the bank's and is returned as the rules wrote it.
     */
    const gate = productCheck(question, state)
    let verdict: RmCheckVerdict | null = null
    let check: { factId: string; productId: string } | null = null
    if (gate) {
      const { product, verdict: v } = gate
      verdict = {
        productId: product.productId,
        productName: product.name,
        verdict: v.verdict,
        ruleId: v.ruleId,
        spoken: v.spoken,
        recorded: v.recorded,
      }
      const added = withVerdict(sheet, { productName: product.name, ...v })
      sheet = added.sheet
      check = { factId: added.id, productId: product.productId }
    }

    let sentences: CitedSentence[] = inReadingOrder(rulesAnswer(question, sheet, check))
    let phrasedBy: RmAnswer['phrasedBy'] = 'rules'
    const output = await this.complete(() =>
      askPrompt({
        people: this.people(rm, state),
        facts: sheet.facts,
        question,
        history: request.history ?? [],
        verdictFact: check?.factId ?? null,
      }),
    )
    if (output !== null) {
      const screened = screen(
        candidates(oneSentenceALine(output), () => null),
        { facts: sheet.facts, state },
        false,
      )
      this.logScreen('ask', cif, screened, started)
      const kept = inReadingOrder(screened.kept.slice(0, ANSWER_MAX))
      // Where a product was checked, an answer that never states the check is not an answer to
      // the question asked; the rules' answer leads with it.
      const statesCheck = check === null || kept.some((s) => s.cites.includes(check.factId))
      if (kept.length > 0 && statesCheck) {
        sentences = kept
        phrasedBy = 'model'
      }
    }

    // One entry per question: a check where the rules judged a product, otherwise the question.
    if (verdict) {
      await this.deps.accessLog.record(
        rm,
        cif,
        'checked',
        'Suitability check from a question',
        `${verdict.productName}: ${CHECK_WORDS[verdict.verdict](verdict.ruleId)}. Asked: ${question}`,
      )
    } else {
      await this.deps.accessLog.record(rm, cif, 'asked', 'Question about the customer', question)
    }
    return { sentences, facts: sheet.facts, phrasedBy, verdict }
  }

  /**
   * The suggested questions under the box, from the customer's own record so each one has an
   * answer on file. Pure over the state; no model. `activity` adds the request and refusal
   * questions where the caller has the customer's activity to hand.
   */
  prompts(
    state: CustomerState,
    activity?: Pick<ActivityFacts, 'refusals' | 'openHandoff'>,
  ): string[] {
    return suggestedPrompts(state, activity)
  }

  /**
   * The customer's activity, each part on its own: a part that fails is read as nothing on
   * record, because a brief missing its journey is still a brief and an error is not.
   */
  private async record(rm: RmCaller, cif: string): Promise<CopilotRecord> {
    const { activity, log } = this.deps
    const quiet =
      <T>(part: string, fallback: T) =>
      (err: unknown): T => {
        log.warn({ cif, part, err: (err as Error).message }, 'rm copilot: activity part not read')
        return fallback
      }
    const [facts, handoffs, refusals, journey] = await Promise.all([
      activity
        .facts([cif])
        .then((m) => m.get(cif) ?? NO_ACTIVITY)
        .catch(quiet('facts', NO_ACTIVITY)),
      activity
        .handoffs([cif])
        .then((hs) => hs.filter((h) => h.cif === cif))
        .catch(quiet('handoffs', [])),
      activity
        .refusalItems([cif])
        .then((rs) => rs.filter((r) => r.cif === cif))
        .catch(quiet('refusals', [])),
      activity
        .journey(rm, cif)
        .then((j) => j.events)
        .catch(quiet('journey', [])),
    ])
    return { activity: facts, handoffs, refusals, journey }
  }

  /** The model's text, or null when it is off, failed, timed out or threw anyway. */
  private async complete(build: () => ChatMessage[]): Promise<string | null> {
    const { model, log } = this.deps
    if (!model.live) return null
    try {
      return await model.complete(build())
    } catch (err) {
      // The port promises never to throw; a fake or a future adapter might, and the copilot's
      // promise is the same either way.
      log.warn({ model: model.name, err: (err as Error).message }, 'rm copilot: model threw')
      return null
    }
  }

  private people(rm: RmCaller, state: CustomerState): PromptPeople {
    const name = state.file.customer.custName
    return {
      rmName: rm.name,
      customerName: name,
      first: firstName(name),
      asOf: state.asOf,
    }
  }

  /**
   * Counts and reasons only: the sentences carry the customer's figures and stay out of the log.
   * For a brief, `arranged` adds what the ordering dropped and whether it had to reorder at all.
   */
  private logScreen(
    kind: 'brief' | 'ask',
    cif: string,
    screened: Screened,
    started: number,
    arranged?: Arranged,
  ): void {
    const reasons: Record<string, number> = {}
    const dropped = [...screened.dropped, ...(arranged?.dropped ?? [])]
    for (const d of dropped) reasons[d.reason] = (reasons[d.reason] ?? 0) + 1
    this.deps.log.info(
      {
        kind,
        cif,
        model: this.deps.model.name,
        offered: screened.kept.length + screened.dropped.length,
        kept: screened.kept.length - (arranged?.dropped.length ?? 0),
        dropped: reasons,
        ...(arranged ? { reordered: arranged.reordered } : {}),
        ms: Math.round(performance.now() - started),
      },
      'rm copilot: model sentences screened',
    )
  }
}
