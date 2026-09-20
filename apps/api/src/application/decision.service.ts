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
import type { LeadOutcome, LeadSinkPort } from '../ports/lead-sink.port.ts'

export interface DecisionDeps {
  advisory: AdvisoryService
  shelf: ProductShelfPort
  audit: AuditStore
  sessions: SessionStore
  /** Where an accepted product goes: IDBI's lead queue, or nowhere under a source with no bank. */
  leads: LeadSinkPort
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
    const { advisory, shelf, audit, sessions, leads } = this.deps
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
        // The same cadence the action was proposed under. Omitting it made this second run
        // judge a one-off transfer as a monthly commitment, so accepting the plan's own
        // primary action was refused by AFFORDABILITY every time.
        cadence: action.cadence ?? 'monthly',
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

    /*
     * The bank's half of an accepted recommendation.
     *
     * Everything else in this app reads. A customer who says yes has to reach somebody, and
     * IDBI's 428 is that route — so an accepted product becomes a lead their staff will work,
     * and the loop from "read their statements" to "hand it back" actually closes.
     *
     * After the record, never before, and never allowed to fail the decision: the advice record
     * and the decision are already written and are the source of truth. A bank that refuses, or
     * that cannot be reached, is reported beside the decision instead. Only an acceptance of a
     * product raises one — a decline has nothing to hand over, and a behavioural action has no
     * product to hand.
     */
    let lead: LeadOutcome | null = null
    if (kind === 'did_it' && product !== null && verdictPassed(adviceRecord)) {
      lead = await leads.create({
        cif: session.cif,
        product: {
          name: product.name,
          category: product.category,
          // The bank's lead form wants a sub-category and the shelf has no second level, so
          // the manufacturer is the most informative thing we hold: it is what tells a member
          // of staff whether this is IDBI's own deposit or somebody's fund.
          subCategory: product.manufacturer,
        },
        estimatedAmount: action.amount,
        // Stable across a repeat of the same decision, so 428 recognises it as one lead. The
        // session is in it because two reviewers accepting the same thing are two leads.
        leadId: `DS-${session.id.slice(0, 8)}-${action.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}`,
      })
    }

    const didIt =
      trail.decisions.filter((d) => d.kind === 'did_it').length + (kind === 'did_it' ? 1 : 0)
    const roadmapVersion = await advisory.recut(
      current,
      didIt === 0
        ? `Re-cut after you passed on "${action.label}".`
        : `Re-cut after ${plural(didIt, 'decision')} you made.`,
    )

    return { adviceRecord, decision, roadmapVersion, lead }
  }
}

/** A blocked recommendation is not handed to the bank, whatever the customer pressed. */
function verdictPassed(adviceRecord: DecisionResponse['adviceRecord']): boolean {
  return adviceRecord !== null && adviceRecord.verdict === 'PASS'
}

function findAction(view: ServerView, actionId: string): Action | null {
  const candidates = [view.plan.primary, ...view.plan.secondary]
  return candidates.find((a): a is Action => a !== null && a.id === actionId) ?? null
}
