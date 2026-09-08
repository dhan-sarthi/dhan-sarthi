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
 * Ported from the archived prototype's suitability module, with the ladder in
 * docs/product/product-shelf.md added: volatility against horizon, and the tax regime.
 */
import type { Snapshot } from './derive.ts'
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

/**
 * Pure protection: cover with no investment component.
 *
 * These are exempt from the rules that gate *investment*, and getting that carve-out wrong is a
 * genuine advisory error rather than a technicality. Refusing someone term cover because they
 * have credit card debt is backwards — if they die, their family inherits the debt and loses the
 * income. Debt and a thin buffer are arguments for cover, not against it.
 *
 * A ULIP is deliberately not here: it bundles investment, so every investment rule applies to it.
 */
const PROTECTION_ONLY: ReadonlySet<Product['category']> = new Set<Product['category']>([
  'Term Insurance',
  'Health Insurance',
  'Government Insurance',
])

const isProtection = (p: Product): boolean =>
  PROTECTION_ONLY.has(p.category) && !p.bundlesProtectionAndInvestment

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
  /** Monthly amount proposed. Zero where the question is only about the product. */
  amount: number
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
      snapshot.debt.hasHighInterest && !isProtection(product)
        ? {
            spoken:
              `Not yet. You are paying ${snapshot.debt.highestRate}% on ${inr(snapshot.debt.total)}. ` +
              `Nothing I could put you into returns anything close to that, so clearing it first is ` +
              `worth more than any investment I could sell you.`,
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
      snapshot.debt.missedRepayment && !isProtection(product)
        ? {
            spoken:
              "Let's not start anything this month. There is a missed repayment on record, and " +
              'putting that right protects you — and your credit score — more than a new ' +
              'investment would.',
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
      if (isProtection(product)) return null
      if (product.lockInYears <= 0 && product.category !== 'ULIP') return null

      // Name the thing they should do instead. A refusal with no alternative is just a no.
      const liquid = alternatives?.find(
        (p) => p.category === 'Liquid' || p.category === 'Sweep-in FD',
      )

      return {
        spoken:
          `Your savings cover about ${snapshot.buffer.monthsCovered} months of your outgoings. ` +
          `Locking money away before three months are in place is how a small emergency turns ` +
          `into a loan.${liquid ? ` Build the buffer in ${liquid.name} first — you can reach it any day.` : ''}`,
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
          `That sits above the risk level on your profile. Your profile says ` +
          `${snapshot.customer.riskProfile} and this is rated ${product.riskometer}. I would need ` +
          `you to re-do your risk assessment before I could suggest it.`,
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
          `You need this money in about ${goal.horizonYears} ${goal.horizonYears === 1 ? 'year' : 'years'}, ` +
          `and this can be worth less than you put in over that time. That is not a risk worth ` +
          `taking on money with a date on it.${safe ? ` ${safe.name} is the right shape for it.` : ''}`,
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
    check: ({ amount, snapshot, product, alternatives }) => {
      if (amount <= 0) return null
      const ceiling = snapshot.surplus.deployable
      if (amount <= ceiling) return null

      // Cover is not optional in the way an investment is, so an unaffordable premium is a
      // reason to find a cheaper policy rather than to go uninsured.
      if (isProtection(product)) {
        // Below this, being uninsured costs more than the premium ever could. PMJJBY is ₹436 a
        // year; refusing it on affordability grounds would be theatre.
        if (product.minInvestment <= 100) return null

        // Only within the same kind of cover. Accident cover at ₹2 a month is not a substitute
        // for life cover, and offering it as one would be worse advice than saying nothing.
        const cheapest = [...(alternatives ?? [])]
          .filter(
            (p) =>
              isProtection(p) &&
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
              `${inr(product.minInvestment)} a month is more than you have spare right now. I am ` +
              `not going to sign you up for something you would have to cancel. Let us free the ` +
              `money up first — this is the next thing we do after that.`,
            recorded:
              `Blocked: premium ${inr(product.minInvestment)}/month exceeds deployable surplus ` +
              `${inr(ceiling)} and no lower-cost ${product.coverType ?? 'protection'} product is ` +
              `available on the shelf. Deferred rather than substituted.`,
            alternative: null,
          }
        }

        return {
          spoken:
            `${inr(product.minInvestment)} a month is more than you have spare right now, and ` +
            `going without cover is not the answer. ${cheapest.name} costs about ` +
            `${inr(cheapest.minInvestment)} a month. Start there and we will revisit it.`,
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
            ? `There is nothing spare each month once everything committed has gone out. I am not ` +
              `going to take money you will need back.`
            : `That is more than you actually have spare. After everything committed, and keeping ` +
              `something aside for the months that go wrong, there is about ${inr(ceiling)}. ` +
              `I would rather you got there slower and did not have to stop.`,
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
              `The money would be locked for ${product.lockInYears} years and you need it in ` +
              `about ${goal.horizonYears}. Wrong shape for this goal.`,
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
          `You are on the new tax regime, so the deduction this fund exists for is worth nothing ` +
          `to you — and it still locks your money up for three years. ` +
          `${plain ? `${plain.name} holds the same kind of assets with no lock-in and lower charges.` : ''}`,
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
          `No. It costs about ${Math.round(ratio)} times what a term plan costs for the same job, ` +
          `and the charges are buried inside it where you cannot see them. IDBI sells this one, ` +
          `and I am still telling you not to buy it. Take the term cover at around ` +
          `${inr(term.minInvestment)} a month and invest the difference where you can watch it.`,
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
