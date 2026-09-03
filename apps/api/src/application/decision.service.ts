/**
 * A decision on today's action, recorded server-side.
 *
 * The client sends an action id and a kind, nothing else. The server re-derives the plan,
 * finds the action by id, runs the gate again over the snapshot the customer was actually
 * shown, and appends the advice record, the decision and a new roadmap version. Amounts and
 * products from the client are never trusted, because the record has to be what the engine
 * said, not what a request body claimed it said.
 */
import { evaluate } from '@dhan/core'
import type { Action } from '@dhan/core'
import type { DecisionKind, DecisionResponse } from '@dhan/contracts'
import type { AdvisoryService, ServerView } from './advisory.service.ts'
import { Conflict, NotFound } from './errors.ts'
import type { AuditStore, ProductShelfPort, Session, SessionStore } from '../ports/index.ts'

export interface DecisionDeps {
  advisory: AdvisoryService
  shelf: ProductShelfPort
  audit: AuditStore
  sessions: SessionStore
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export class DecisionService {
  private readonly deps: DecisionDeps

  constructor(deps: DecisionDeps) {
    this.deps = deps
  }

  async decide(
    session: Session,
    actionId: string,
    kind: DecisionKind,
    note?: string,
  ): Promise<DecisionResponse> {
    const { advisory, shelf, audit, sessions } = this.deps
    const view = await advisory.view(session)

    const action = findAction(view, actionId)
    if (!action) throw new NotFound(`No action "${actionId}" on today's plan.`)

    const trail = await audit.listForSession(session.id)
    if (trail.decisions.some((d) => d.actionId === actionId)) {
      throw new Conflict('A decision on this action is already on the record.', { actionId })
    }

    // Money actions carry a product and go through the gate again, over the same snapshot.
    let adviceRecordId: string | null = null
    let adviceRecord: DecisionResponse['adviceRecord'] = null
    const product = action.productId ? await shelf.byId(action.productId) : null
    if (product) {
      const verdict = evaluate({
        product,
        snapshot: view.snapshot,
        amount: action.amount,
        goal: { kind: view.goal.kind, horizonYears: view.horizonYears },
        alternatives: view.shelfProducts,
      })
      adviceRecord = await audit.appendAdvice({
        sessionId: session.id,
        subjectId: session.subjectId,
        snapshotId: view.stored.id,
        consentId: view.consent.consentId,
        source: 'screen',
        actionId: action.id,
        actionKind: action.kind,
        productId: product.productId,
        amount: action.amount,
        verdict: verdict.verdict,
        ruleId: verdict.ruleId,
        rulesPassed: verdict.passed,
        // The sentence the customer read. On a pass the rules write nothing, so the record
        // keeps the action's own line — what was actually on the screen.
        spoken: verdict.spoken ?? action.detail,
        recorded: verdict.recorded,
        alternative: verdict.alternative,
        evidence: action.evidence,
        engineVersion: advisory.engineVersion,
        runwaySessionId: null,
        atSim: session.asOf,
      })
      adviceRecordId = adviceRecord.id
    }

    const decision = await audit.appendDecision({
      sessionId: session.id,
      adviceRecordId,
      actionId: action.id,
      actionKind: action.kind,
      kind,
      amount: action.amount,
      productId: product?.productId ?? null,
      shown: action.label,
      evidence: action.evidence,
      note: note ?? null,
      atSim: session.asOf,
    })

    // Accepting a spending cap is the one action that changes the daily plan immediately, so
    // it is recorded as a cap rather than only as a decision.
    let current = session
    if (kind === 'did_it' && action.kind === 'set_category_cap') {
      const trend = view.snapshot.discretionary.categoryTrends[0]
      if (trend) {
        const caps = [
          ...session.caps.filter((c) => c.category !== trend.category),
          { category: trend.category, monthlyLimit: trend.prior },
        ]
        const patched =
          (await sessions.patch(session.id, { caps }, session.version)) ??
          (await sessions.getById(session.id))
        if (patched) current = patched
      }
    }

    const didIt =
      trail.decisions.filter((d) => d.kind === 'did_it').length + (kind === 'did_it' ? 1 : 0)
    const roadmapVersion = await advisory.recut(
      current,
      didIt === 0
        ? `Re-cut after you passed on "${action.label}".`
        : `Re-cut after ${plural(didIt, 'decision')} you made.`,
    )

    return { adviceRecord, decision, roadmapVersion }
  }
}

function findAction(view: ServerView, actionId: string): Action | null {
  const candidates = [view.plan.primary, ...view.plan.secondary]
  return candidates.find((a): a is Action => a !== null && a.id === actionId) ?? null
}
