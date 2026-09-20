/**
 * The suitability gate.
 *
 * Deterministic rules, evaluated before any recommendation reaches a customer. **The model never
 * decides whether something is suitable** — it calls this, receives a verdict plus the sentence
 * the rules wrote, and phrases it. That separation is the whole compliance argument, and it is
 * what lets the advisor refuse a product the bank itself sells without anyone worrying about
 * what a model might say. It is enforced architecturally, as a tool boundary rather than a
 * prompt instruction.
 *
 * Rules are written as data rather than nested conditionals so a compliance officer can read
 * them, and so the reason recorded in the audit trail is the same sentence the customer hears.
 *
 * **Order matters.** The earliest failing rule is the one reported, so the most fundamental
 * objection wins rather than the most technical one. A customer with a card at 34.8% should hear
 * about the card, not about their risk profile.
 *
 * What counts as pure protection — the carve-out four of the rules below turn on — is owned by
 * `./protection.ts` and is not restated here. This gate was the one of the three callers that
 * had that rule right, which is why the module was pulled out beside it; a second copy living
 * here is exactly how the three stopped agreeing the first time.
 *
 * Ported from the archived prototype's suitability module, with the ladder in
 * docs/product/product-shelf.md added: volatility against horizon, and the tax regime.
 */
import type { Snapshot } from './derive.ts'
import { isProtectionProduct } from './protection.ts'
import type { Product, Riskometer, RiskProfile } from './types.ts'

/** SEBI's six bands, ordered. */
const RISK_LADDER: readonly Riskometer[] = [
  'Low',
  'Low to Moderate',
  'Moderate',
  'Moderately High',
  'High',
  'Very High',
]

/**
 * The highest band each profile may hold.
 *
 * `Balanced -> Very High` looks wrong and is not: SEBI's riskometer places essentially every
 * diversified equity fund at "Very High", so capping a Balanced investor below it would exclude
 * index funds altogether. The real protection against equity for the wrong customer is
 * `VOLATILITY_VS_HORIZON` below, which is about time rather than temperament.
 */
const PROFILE_CEILING: Record<RiskProfile, Riskometer> = {
  Conservative: 'Moderate',
  Balanced: 'Very High',
  Growth: 'Very High',
}

const rank = (band: Riskometer): number => {
  const i = RISK_LADDER.indexOf(band)
  return i === -1 ? 0 : i
}

/** Categories whose value can fall. Horizon, not profile, is what governs these. */
const VOLATILE: ReadonlySet<Product['category']> = new Set<Product['category']>([
  'Index Fund',
  'Equity',
  'ELSS',
  'ULIP',
])

export interface GoalContext {
  kind: string
  horizonYears: number
}

export interface SuitabilityInput {
  product: Product
  snapshot: Snapshot
  /** The amount proposed, read according to `cadence`. Zero where the question is only about the product. */
  amount: number
  /**
   * Whether the amount is committed every month or moved once.
   *
   * This distinction is load-bearing and its absence was a real defect. AFFORDABILITY checks a
   * proposal against `surplus.deployable`, which is a *monthly* figure — so "move your idle
   * ₹1,41,663 into a sweep-in" was read as "commit ₹1,41,663 a month" and blocked for every
   * customer alive, because idle cash is an accumulated balance and surplus is monthly income.
   * The single recommendation the product is built around could not reach a screen.
   *
   * A lump sum is limited by what the customer *has*, not by what they earn. Defaults to
   * `monthly`, so an un-migrated caller keeps the stricter of the two checks.
   */
  cadence?: 'monthly' | 'lump_sum'
  goal?: GoalContext | null
  /** The rest of the shelf, so a rule may name a better answer instead of only refusing. */
  alternatives?: readonly Product[]
}

export interface Verdict {
  verdict: 'PASS' | 'BLOCKED'
  ruleId: string | null
  /** What the advisor says. Written here, phrased by nobody else. */
  spoken: string | null
  /** What goes in the audit trail, in the language a reviewer needs. */
  recorded: string
  alternative: { productId: string; name: string; monthly: number } | null
  /** Rules cleared before the failure, so the record shows what *was* checked. */
  passed: string[]
}

interface Rule {
  id: string
  description: string
  check: (input: SuitabilityInput) => Omit<Verdict, 'verdict' | 'ruleId' | 'passed'> | null
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

const RULES: readonly Rule[] = [
  {
    id: 'HIGH_INTEREST_DEBT',
    description: 'No investment is recommended while high-interest debt is outstanding.',
    check: ({ snapshot, product }) =>
      snapshot.debt.hasHighInterest && !isProtectionProduct(product)
        ? {
            spoken:
              `Not yet. You are paying ${snapshot.debt.highestRate}% on ${inr(snapshot.debt.highInterestTotal)}. ` +
              `Nothing I can sell you returns that much, so clearing it first earns you more.`,
            recorded:
              `Blocked: outstanding debt at ${snapshot.debt.highestRate}% p.a. exceeds any ` +
              `reasonable expected return; repayment takes precedence over investment.`,
            alternative: null,
          }
        : null,
  },
  {
    id: 'MISSED_REPAYMENT',
    description: 'No investment is recommended where loan repayments have been missed.',
    check: ({ snapshot, product }) =>
      snapshot.debt.missedRepayment && !isProtectionProduct(product)
        ? {
            spoken:
              'Not this month. You have a missed repayment on record. Fixing that protects ' +
              'your credit score, which is worth more than any investment right now.',
            recorded: 'Blocked: missed loan repayment detected (DPD > 0).',
            alternative: null,
          }
        : null,
  },
  {
    id: 'EMERGENCY_BUFFER',
    description:
      'Products with a lock-in are not recommended below a three-month emergency buffer.',
    check: ({ snapshot, product, alternatives }) => {
      const floor = 3
      // An unreadable outflow is not a buffer. The gate can only ever refuse more than the
      // truth, never less, so an unknown ratio is treated as below the floor.
      if (snapshot.buffer.monthsCovered !== null && snapshot.buffer.monthsCovered >= floor) {
        return null
      }
      if (isProtectionProduct(product)) return null
      if (product.lockInYears <= 0 && product.category !== 'ULIP') return null

      // Name the thing they should do instead. A refusal with no alternative is just a no.
      const liquid = alternatives?.find(
        (p) => p.category === 'Liquid' || p.category === 'Sweep-in FD',
      )

      return {
        spoken:
          `Your savings cover about ${snapshot.buffer.monthsCovered} months. Lock money away ` +
          `before you have three months and a small emergency becomes a loan.` +
          `${liquid ? ` Build it up in ${liquid.name} first — you can reach that any day.` : ''}`,
        recorded:
          `Blocked: emergency buffer ${snapshot.buffer.monthsCovered} months, below the ` +
          `three-month floor, and product has a ${product.lockInYears}-year lock-in.`,
        alternative: liquid
          ? { productId: liquid.productId, name: liquid.name, monthly: liquid.minInvestment }
          : null,
      }
    },
  },
  {
    id: 'RISK_CEILING',
    description: "A product's riskometer band may not exceed the customer's recorded risk profile.",
    check: ({ product, snapshot, alternatives }) => {
      const ceiling = PROFILE_CEILING[snapshot.customer.riskProfile]
      if (rank(product.riskometer) <= rank(ceiling)) return null

      const within = alternatives?.find(
        (p) => rank(p.riskometer) <= rank(ceiling) && p.category !== 'ULIP',
      )

      return {
        spoken:
          `That is riskier than your profile allows. You are ${snapshot.customer.riskProfile}; ` +
          `this is rated ${product.riskometer}. Redo your risk assessment and I can look again.`,
        recorded:
          `Blocked: product riskometer ${product.riskometer} exceeds ceiling ${ceiling} for a ` +
          `${snapshot.customer.riskProfile} profile.`,
        alternative: within
          ? { productId: within.productId, name: within.name, monthly: within.minInvestment }
          : null,
      }
    },
  },
  {
    id: 'VOLATILITY_VS_HORIZON',
    description:
      'A product whose value can fall is not recommended for a goal less than three years away.',
    check: ({ product, goal, alternatives }) => {
      if (!goal || goal.horizonYears >= 3) return null
      if (!VOLATILE.has(product.category)) return null

      const safe = alternatives?.find(
        (p) => p.category === 'Recurring Deposit' || p.category === 'Debt',
      )

      return {
        spoken:
          `You need this money in ${goal.horizonYears} ${goal.horizonYears === 1 ? 'year' : 'years'}, ` +
          `and this can be worth less than you put in by then. Money with a date on it should ` +
          `not carry that risk.${safe ? ` ${safe.name} fits better.` : ''}`,
        recorded:
          `Blocked: market-linked product proposed for a ${goal.horizonYears}-year horizon, ` +
          `below the three-year floor for volatile assets.`,
        alternative: safe
          ? { productId: safe.productId, name: safe.name, monthly: safe.minInvestment }
          : null,
      }
    },
  },
  {
    id: 'AFFORDABILITY',
    description:
      'A recommended amount may not exceed what the customer can actually commit each month.',
    check: ({ amount, snapshot, product, alternatives, cadence }) => {
      if (amount <= 0) return null

      /*
       * A one-off move of money the customer already holds is bounded by the balance, not by
       * the month's surplus — less anything the emergency buffer is still short of, so a
       * transfer can never be funded out of the cushion.
       */
      if (cadence === 'lump_sum') {
        const headroom = Math.max(0, snapshot.balances.total - snapshot.buffer.shortfall)
        if (amount <= headroom) return null
        return {
          spoken:
            `More than you have to move. You hold ${inr(snapshot.balances.total)}, and ` +
            `${inr(snapshot.buffer.shortfall)} of that is your emergency buffer.`,
          recorded:
            `Blocked: one-off ${inr(amount)} exceeds reachable balance ${inr(snapshot.balances.total)} ` +
            `less outstanding buffer shortfall ${inr(snapshot.buffer.shortfall)}.`,
          alternative: null,
        }
      }

      const ceiling = snapshot.surplus.deployable
      if (amount <= ceiling) return null

      // Cover is not optional in the way an investment is, so an unaffordable premium is a
      // reason to find a cheaper policy rather than to go uninsured.
      if (isProtectionProduct(product)) {
        // Below this, being uninsured costs more than the premium ever could. PMJJBY is ₹436 a
        // year; refusing it on affordability grounds would be theatre.
        if (product.minInvestment <= 100) return null

        // Only within the same kind of cover. Accident cover at ₹2 a month is not a substitute
        // for life cover, and offering it as one would be worse advice than saying nothing.
        const cheapest = [...(alternatives ?? [])]
          .filter(
            (p) =>
              isProtectionProduct(p) &&
              p.coverType === product.coverType &&
              p.minInvestment < product.minInvestment,
          )
          .sort((a, b) => a.minInvestment - b.minInvestment)[0]

        if (!cheapest) {
          // Nothing cheaper of this kind exists, so there is no substitution to offer. Blocking
          // is still right — she cannot pay it today — and it is not the end of the matter: the
          // roadmap surfaces it again the month the money is there. Passing instead would mean
          // recommending a premium the customer demonstrably cannot fund.
          return {
            spoken:
              `${inr(product.minInvestment)} a month is more than you have spare. I will not sign ` +
              `you up for something you would soon cancel. Free up the money first — this is ` +
              `next after that.`,
            recorded:
              `Blocked: premium ${inr(product.minInvestment)}/month exceeds deployable surplus ` +
              `${inr(ceiling)} and no lower-cost ${product.coverType ?? 'protection'} product is ` +
              `available on the shelf. Deferred rather than substituted.`,
            alternative: null,
          }
        }

        return {
          spoken:
            `${inr(product.minInvestment)} a month is more than you have spare, and going ` +
            `uncovered is worse. ${cheapest.name} costs ${inr(cheapest.minInvestment)} a month. ` +
            `Start there.`,
          recorded:
            `Blocked: premium ${inr(product.minInvestment)}/month exceeds deployable surplus ` +
            `${inr(ceiling)}; substituted a lower-cost protection product (${cheapest.productId}) ` +
            `rather than leaving the customer uncovered.`,
          alternative: {
            productId: cheapest.productId,
            name: cheapest.name,
            monthly: cheapest.minInvestment,
          },
        }
      }

      // Nobody expects a bank to turn money down. Checked against `deployable` rather than the
      // raw surplus, so the provision for irregular months is respected — a SIP sized against a
      // median month breaks the first time a hospital bill lands.
      return {
        spoken:
          ceiling <= 0
            ? `Nothing is spare once your committed payments go out. I will not take money ` +
              `you are going to need back.`
            : `More than you have spare. After committed payments, and something held back for ` +
              `bad months, there is about ${inr(ceiling)}. Better slower than having to stop.`,
        recorded:
          `Blocked: proposed ${inr(amount)}/month exceeds deployable surplus ${inr(ceiling)} ` +
          `(normal-month surplus ${inr(snapshot.surplus.monthly)} less irregular provision ` +
          `${inr(snapshot.irregular.monthlyProvision)}).`,
        alternative: null,
      }
    },
  },
  {
    id: 'HORIZON_VS_LOCKIN',
    description:
      "A product's lock-in may not exceed the horizon of the goal it is recommended for.",
    check: ({ product, goal }) =>
      goal && product.lockInYears > goal.horizonYears
        ? {
            spoken:
              `Locked for ${product.lockInYears} years, and you need it in ${goal.horizonYears}. ` +
              `Wrong fit for this goal.`,
            recorded: `Blocked: lock-in ${product.lockInYears}y exceeds goal horizon ${goal.horizonYears}y.`,
            alternative: null,
          }
        : null,
  },
  {
    id: 'TAX_BENEFIT_UNAVAILABLE',
    description:
      'A product whose only advantage is a tax deduction is not recommended to a customer who ' +
      'cannot claim it.',
    check: ({ product, snapshot, alternatives }) => {
      if (product.category !== 'ELSS') return null
      // The new regime has been the default since FY 2023-24 and removes the deduction this
      // product exists to provide. On the old regime the trade is at least arguable.
      if (snapshot.customer.taxRegime === 'old') return null

      const plain = alternatives?.find((p) => p.category === 'Index Fund')

      return {
        spoken:
          `You are on the new tax regime, so the tax break this fund exists for is worth nothing ` +
          `to you — but it still locks your money for three years. ` +
          `${plain ? `${plain.name} holds much the same thing, with no lock-in and lower charges.` : ''}`,
        recorded:
          `Blocked: ELSS proposed to a customer on the new tax regime; 80C deduction unavailable, ` +
          `three-year lock-in retained with no offsetting benefit.`,
        alternative: plain
          ? { productId: plain.productId, name: plain.name, monthly: plain.minInvestment }
          : null,
      }
    },
  },
  {
    id: 'BUNDLED_PROTECTION',
    description:
      'A product bundling protection with investment is not recommended where an unbundled term ' +
      'policy plus a fund provides equivalent cover at materially lower cost.',
    check: ({ product, alternatives }) => {
      if (!product.bundlesProtectionAndInvestment) return null

      const term = alternatives?.find((p) => p.category === 'Term Insurance')
      if (!term) return null

      const ratio = product.minInvestment / term.minInvestment
      if (ratio < 2) return null

      // The refusal. The only thing in this app that costs the bank money in the short run,
      // which is exactly why it is the only thing that proves the rest of it.
      return {
        spoken:
          `No. It costs ${Math.round(ratio)} times what a term plan costs for the same job, and ` +
          `the charges are hidden inside it. IDBI sells this one and I am still telling you not ` +
          `to buy it. Take term cover at ${inr(term.minInvestment)} a month and invest the rest ` +
          `where you can see it.`,
        recorded:
          `Blocked: bundled protection-and-investment product priced ${ratio.toFixed(1)}x the ` +
          `unbundled term alternative (${term.productId}); charges opaque; ` +
          `${product.lockInYears}-year lock-in.`,
        alternative: {
          productId: term.productId,
          name: term.name,
          monthly: term.minInvestment,
        },
      }
    },
  },
]

/**
 * Evaluate a proposed recommendation.
 *
 * Pure, and takes the whole snapshot rather than loose facts, so a new rule can reach for
 * anything already derived without changing every call site.
 */
export function evaluate(input: SuitabilityInput): Verdict {
  const passed: string[] = []

  for (const rule of RULES) {
    const failure = rule.check(input)
    if (failure) {
      return { verdict: 'BLOCKED', ruleId: rule.id, passed, ...failure }
    }
    passed.push(rule.id)
  }

  return {
    verdict: 'PASS',
    ruleId: null,
    spoken: null,
    recorded: `All ${RULES.length} suitability rules passed.`,
    alternative: null,
    passed,
  }
}

/** The rule book, for the Record screen and for anyone who wants to audit it without running it. */
export const ruleBook: readonly { id: string; description: string }[] = RULES.map(
  ({ id, description }) => ({ id, description }),
)
