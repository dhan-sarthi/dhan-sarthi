/**
 * The text tier and the direct suitability check.
 *
 * The division here is the same one the avatar runs under, and it does not move when a model is
 * wired in: **code owns the numbers, the model owns the words.** `core/query.ts` computes the
 * figures over the session's own View, `evaluate()` decides every product question, both of
 * them write their evidence, and only then is a language model asked to say the result in
 * English. It is handed no ledger and no discretion, so the worst a bad completion can do is
 * phrase a true thing badly.
 *
 * With no `OPENAI_API_KEY` the tier is exactly what it was before the model existed: the
 * engine's own sentence, its own evidence, `phrasedBy: 'rules'`. That is not a degraded mode —
 * every figure in it is real and it is the fallback a failed or slow completion lands on.
 *
 * Every verdict is written to the record before it is returned, because a verdict nobody
 * recorded is a verdict nobody can audit. That holds for a verdict the model triggered by
 * being asked about a product mid-sentence, which is why the gate below runs before the
 * prompt is built rather than after.
 */
import { answer, evaluate, openingLine, suggestedQuestions } from '@dhan/core'
import type {
  AdviceSource,
  Answer,
  AskSuggestions,
  AskTurn,
  EvaluateRequest,
  EvaluateResponse,
  Verdict,
} from '@dhan/contracts'
import type { AdvisoryService } from './advisory.service.ts'
import { textPrompt } from './conversation.prompt.ts'
import { NotFound } from './errors.ts'
import type {
  AuditStore,
  LanguageModelPort,
  ProductShelfPort,
  Session,
  ShelfProduct,
} from '../ports/index.ts'

/** How many recorded decisions travel into the prompt as context. */
const DECISION_CONTEXT = 3

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ')

export interface ConversationDeps {
  advisory: AdvisoryService
  shelf: ProductShelfPort
  audit: AuditStore
  /** The null implementation when no key is configured; `ask` behaves identically either way. */
  model: LanguageModelPort
}

export class ConversationService {
  private readonly deps: ConversationDeps

  constructor(deps: ConversationDeps) {
    this.deps = deps
  }

  async ask(session: Session, question: string, history: readonly AskTurn[] = []): Promise<Answer> {
    const { advisory, audit, model } = this.deps
    const view = await advisory.view(session)
    // The plan Today rendered goes in with the question, so "what can I spend" quotes the pot on
    // the screen and not a second arithmetic of its own.
    const engine = answer(question, view.snapshot, view.file, {
      safeToSpend: view.plan.safeToSpend,
    })
    if (!model.live) return { ...engine, phrasedBy: 'rules' }

    /*
     * The gate, in front of the model rather than beside it.
     *
     * A customer who types a product name has asked a suitability question whether or not the
     * rule set has a branch for it, and the answer to that is the bank's, not a model's. So the
     * verdict is decided and recorded here, and the prompt receives the sentence the rules
     * wrote. `check_suitability` is the same idea on the avatar's side; the difference is only
     * that a typed question can be resolved before anyone starts speaking.
     */
    const [gate, trail] = await Promise.all([
      this.gateFor(session, question),
      // Context, not correctness: what he already accepted or turned down, so the chat does not
      // re-propose it. Best-effort, and in parallel with the gate so it costs no latency.
      audit.listForSession(session.id).catch(() => null),
    ])
    const evidence = gate ? [gate.verdict.recorded, ...engine.evidence] : engine.evidence

    const spoken = await model.complete(
      textPrompt({
        view,
        question,
        engine,
        gate: gate ? { productName: gate.product.name, verdict: gate.verdict } : null,
        history,
        recentDecisions: trail?.decisions.slice(-DECISION_CONTEXT) ?? [],
      }),
    )

    // A failed completion is not a failed request: the engine's sentence was always the answer,
    // and the customer gets it with the provenance saying so.
    if (!spoken) {
      return gate?.verdict.spoken
        ? { ...engine, text: gate.verdict.spoken, evidence, phrasedBy: 'rules' }
        : { ...engine, evidence, phrasedBy: 'rules' }
    }

    // `evidence` and `matched` stay the engine's. The model rewrote the sentence; it did not
    // find the figures, and the receipts under the answer have to keep pointing at what did.
    return { ...engine, text: spoken, evidence, phrasedBy: 'model' }
  }

  async suggestions(session: Session): Promise<AskSuggestions> {
    const view = await this.deps.advisory.view(session)
    return { opening: openingLine(view.snapshot), questions: suggestedQuestions(view.snapshot) }
  }

  /**
   * The shelf product this question names, if it names one.
   *
   * Longest match wins, so "IDBI Flexi Cap" is not answered as whatever shorter name it
   * contains. `ProductShelfPort.resolve` is the avatar's path and takes a spoken product name;
   * a typed question is a whole sentence, so the match is done here against names and aliases
   * and nothing is guessed — no match is no gate, and the engine's own answer stands.
   */
  private async gateFor(
    session: Session,
    question: string,
  ): Promise<{ product: ShelfProduct; verdict: Verdict } | null> {
    const haystack = ` ${norm(question)} `
    let best: ShelfProduct | null = null
    let bestLength = 0

    for (const product of await this.deps.shelf.list()) {
      for (const candidate of [product.name, ...product.aliases]) {
        const needle = norm(candidate).trim()
        // Two characters is a ticker, not a name, and would match inside an ordinary word.
        if (needle.length <= 2 || !haystack.includes(` ${needle} `)) continue
        if (needle.length > bestLength) {
          best = product
          bestLength = needle.length
        }
      }
    }
    if (!best) return null

    // Zero rupees: the question is about the product, not about a sum he named. The record is
    // written by `evaluateProduct` before the verdict comes back here.
    const { verdict } = await this.evaluateProduct(
      session,
      { productId: best.productId, amount: 0 },
      'text',
    )
    return { product: best, verdict }
  }

  async evaluateProduct(
    session: Session,
    request: EvaluateRequest,
    source: Extract<AdviceSource, 'text' | 'api'>,
  ): Promise<EvaluateResponse> {
    const { advisory, shelf, audit } = this.deps
    const product = await shelf.byId(request.productId)
    if (!product) throw new NotFound(`No product "${request.productId}" on the shelf.`)

    const view = await advisory.view(session)
    const verdict = evaluate({
      product,
      snapshot: view.snapshot,
      amount: request.amount,
      goal: request.goal ?? { kind: view.goal.kind, horizonYears: view.horizonYears },
      alternatives: view.shelfProducts,
    })

    const record = await audit.appendAdvice({
      sessionId: session.id,
      subjectId: session.subjectId,
      snapshotId: view.stored.id,
      consentId: view.consent.consentId,
      source,
      actionId: null,
      actionKind: null,
      productId: product.productId,
      amount: request.amount,
      verdict: verdict.verdict,
      ruleId: verdict.ruleId,
      rulesPassed: verdict.passed,
      spoken: verdict.spoken,
      recorded: verdict.recorded,
      alternative: verdict.alternative,
      evidence: [],
      engineVersion: advisory.engineVersion,
      runwaySessionId: null,
      atSim: session.asOf,
    })

    return { verdict, adviceRecordId: record.id }
  }
}
