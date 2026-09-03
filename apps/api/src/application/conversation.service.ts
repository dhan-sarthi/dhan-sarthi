/**
 * The text tier and the direct suitability check, both deterministic and both over the same
 * View the screens read. No model is involved: `core/query.ts` owns the numbers and the words.
 * Every verdict is written to the record before it is returned, because a verdict nobody
 * recorded is a verdict nobody can audit.
 */
import { answer, evaluate, openingLine, suggestedQuestions } from '@dhan/core'
import type {
  AdviceSource,
  Answer,
  AskSuggestions,
  EvaluateRequest,
  EvaluateResponse,
} from '@dhan/contracts'
import type { AdvisoryService } from './advisory.service.ts'
import { NotFound } from './errors.ts'
import type { AuditStore, ProductShelfPort, Session } from '../ports/index.ts'

export interface ConversationDeps {
  advisory: AdvisoryService
  shelf: ProductShelfPort
  audit: AuditStore
}

export class ConversationService {
  private readonly deps: ConversationDeps

  constructor(deps: ConversationDeps) {
    this.deps = deps
  }

  async ask(session: Session, question: string): Promise<Answer> {
    const view = await this.deps.advisory.view(session)
    return answer(question, view.snapshot, view.file)
  }

  async suggestions(session: Session): Promise<AskSuggestions> {
    const view = await this.deps.advisory.view(session)
    return { opening: openingLine(view.snapshot), questions: suggestedQuestions(view.snapshot) }
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
