/**
 * The view model: fixtures and the engine, wired together and memoised.
 *
 * Worth being explicit about where this runs. **For the demo the deterministic engine runs in the
 * browser**, over synthetic customers bundled into the app. That is a deliberate trade: it makes
 * the whole product a static site with no server, so it cannot fail because an API is down, and
 * it deploys anywhere in minutes — which is the insurance the demo needs.
 *
 * It is not the production shape. `@dhan/core` is pure, so every function called here moves
 * behind `apps/api` unchanged when the data is a real customer's; and `@dhan/fixtures` must not
 * be in a production bundle at all. The rule from CONTRIBUTING.md that does hold here: nothing in this
 * file touches a provider or a secret. Runway and the model are reached only through the API.
 */
import {
  buildDailyPlan,
  buildRoadmap,
  derive,
  findInsights,
  ruleBook,
} from '@dhan/core'
import type { CustomerFile, DailyPlan, Goal, Insight, Roadmap, Snapshot } from '@dhan/core'
import { PERSONAS, PRODUCT_SHELF, generateCustomerFile, personaBySlug } from '@dhan/fixtures'
import type { PersonaSpec } from '@dhan/fixtures'
import { ANCHOR } from './session.ts'
import type { Session } from './session.ts'

export interface View {
  spec: PersonaSpec
  file: CustomerFile
  snapshot: Snapshot
  goal: Goal
  roadmap: Roadmap
  plan: DailyPlan
  insights: Insight[]
  shelf: typeof PRODUCT_SHELF
  rules: typeof ruleBook
}

export const personas = PERSONAS

/**
 * The default goal for a customer.
 *
 * Cleo's own framing, and the right one: *"you tell Cleo what you want to achieve, **or she can
 * suggest a goal based on your financial situation**."* A mass-market customer who has never had
 * advice cannot answer "what are your financial goals?" — so the app proposes, and the
 * conversation is them editing it. The proposal follows the ladder: whatever is most broken.
 */
export function suggestGoal(snapshot: Snapshot, asOf: string, override: number | null): Goal {
  const monthlyOutflow = snapshot.commitments.total + snapshot.discretionary.monthly

  if (snapshot.debt.hasHighInterest) {
    return {
      id: 'goal-debt',
      kind: 'debt_payoff',
      purpose: 'Clear the expensive debt',
      targetAmount: override ?? snapshot.debt.total,
      targetDate: `${Number(asOf.slice(0, 4)) + 3}${asOf.slice(4)}`,
      createdAt: asOf,
    }
  }

  if (snapshot.buffer.monthsCovered < 3) {
    return {
      id: 'goal-buffer',
      kind: 'emergency_fund',
      purpose: 'Six months of breathing room',
      targetAmount: override ?? Math.round(monthlyOutflow * 6),
      targetDate: `${Number(asOf.slice(0, 4)) + 2}${asOf.slice(4)}`,
      createdAt: asOf,
    }
  }

  // Twenty-five times current annual spending — the conventional shorthand for "enough to draw
  // 4% a year and not run out" — and stated in **today's** money.
  //
  // The obvious alternative is to inflate that spending forward to 60 and quote the nominal
  // figure. It is arithmetically defensible and it produced ₹11.48 crore, which overflowed the
  // card, read as absurd, and made every plan infeasible for a reason that had nothing to do
  // with the customer. Nobody thinks in 2057 rupees. So the target is in money the customer
  // recognises, and the inflation is handled where it belongs — in the projection, which already
  // shows a real-terms line beside the nominal one.
  const yearsTo60 = Math.max(5, 60 - snapshot.customer.age)
  const target = monthlyOutflow * 12 * 25
  return {
    id: 'goal-retire',
    kind: 'retirement',
    purpose: 'Enough to stop working at 60',
    targetAmount: override ?? Math.round(target / 500_000) * 500_000,
    targetDate: `${Number(asOf.slice(0, 4)) + yearsTo60}${asOf.slice(4)}`,
    createdAt: asOf,
  }
}

const cache = new Map<string, View>()

export function buildView(session: Session): View | null {
  if (!session.slug) return null

  const key = [
    session.slug,
    session.asOf,
    session.lastSeen,
    session.goalTarget ?? '',
    session.caps.map((c) => `${c.category}:${c.monthlyLimit}`).join(','),
  ].join('|')

  const hit = cache.get(key)
  if (hit) return hit

  const spec = personaBySlug(session.slug)
  const file = generateCustomerFile(spec, { anchor: ANCHOR, asOf: session.asOf, months: 24 })
  const snapshot = derive(file, session.asOf)
  const goal = suggestGoal(snapshot, session.asOf, session.goalTarget)

  const roadmap = buildRoadmap(snapshot, goal, PRODUCT_SHELF, session.asOf, {
    version: 1 + Math.max(0, session.accepted.length),
    reasonForChange:
      session.accepted.length === 0
        ? 'First plan, from twenty-four months of your statements.'
        : `Re-cut after ${session.accepted.length} ${session.accepted.length === 1 ? 'decision' : 'decisions'} you made.`,
  })

  const plan = buildDailyPlan(snapshot, roadmap, file.transactions, PRODUCT_SHELF, session.asOf, {
    lastSeen: session.lastSeen,
    caps: session.caps,
    horizonYears: Math.max(5, 60 - snapshot.customer.age),
  })

  const view: View = {
    spec,
    file,
    snapshot,
    goal,
    roadmap,
    plan,
    insights: findInsights(snapshot),
    shelf: PRODUCT_SHELF,
    rules: ruleBook,
  }

  // Small and bounded: at most a handful of clock positions per session.
  if (cache.size > 24) cache.clear()
  cache.set(key, view)
  return view
}
