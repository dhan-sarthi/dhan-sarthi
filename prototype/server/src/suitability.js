// The suitability gate.
//
// Deterministic rules, evaluated before any recommendation reaches a customer. The model
// never decides whether something is suitable — it only phrases what this file concluded.
// That separation is the whole compliance argument, and it is what lets the advisor refuse
// a product the bank itself sells without anyone worrying about what the model might say.
//
// Rules are written as data rather than nested conditionals so that a compliance officer can
// read them, and so the reason recorded in the audit trail is the same sentence the customer
// hears. Order matters: the earliest failing rule is the one reported, so the most
// fundamental objection wins rather than the most technical one.

const RISK_LADDER = ['Low', 'Low to Moderate', 'Moderate', 'Moderately High', 'High', 'Very High']
const PROFILE_CEILING = {
  Conservative: 'Moderate',
  Balanced: 'Very High',
  Growth: 'Very High',
}

const rank = (band) => {
  const i = RISK_LADDER.indexOf(band)
  return i === -1 ? 0 : i
}

/**
 * Each rule returns null to pass, or an object to block.
 * `spoken` is what the avatar says. `recorded` is what goes in the audit trail.
 */
const RULES = [
  {
    id: 'HIGH_INTEREST_DEBT',
    description: 'No investment is recommended while high-interest debt is outstanding.',
    check: ({ facts }) => facts.hasHighInterestDebt && {
      spoken: 'Not yet. You have debt costing far more than any investment will return. Clearing that first is worth more than anything I could put you into.',
      recorded: 'Blocked: outstanding high-interest debt takes precedence over investment.',
    },
  },
  {
    id: 'MISSED_REPAYMENT',
    description: 'No investment is recommended where loan repayments have been missed.',
    check: ({ facts }) => facts.missedEmi && {
      spoken: "Let's not invest anything this month. There is a missed repayment on record, and putting that right protects you more than a new investment would.",
      recorded: 'Blocked: missed loan repayment detected.',
    },
  },
  {
    id: 'EMERGENCY_BUFFER',
    description: 'Products with a lock-in are not recommended below a three-month emergency buffer.',
    check: ({ facts, product }) => (
      facts.emergencyFundMonths < 3 && (product.lockInYears > 0 || product.category === 'ULIP') && {
        spoken: `Your emergency buffer covers about ${facts.emergencyFundMonths?.toFixed(1)} months. Locking money away before that is built is how a small emergency turns into a loan.`,
        recorded: `Blocked: emergency buffer ${facts.emergencyFundMonths} months, below the three-month floor, product has a lock-in.`,
      }
    ),
  },
  {
    id: 'RISK_CEILING',
    description: "A product's riskometer band may not exceed the customer's recorded risk profile.",
    check: ({ product, customer }) => {
      const ceiling = PROFILE_CEILING[customer.riskProfile] || 'Moderate'
      return rank(product.riskometer) > rank(ceiling) && {
        spoken: `That sits above the risk level on your profile. Your profile says ${customer.riskProfile}, and this is rated ${product.riskometer}. I would need you to re-do your risk assessment before I could suggest it.`,
        recorded: `Blocked: product riskometer ${product.riskometer} exceeds ceiling ${ceiling} for ${customer.riskProfile} profile.`,
      }
    },
  },
  {
    id: 'AFFORDABILITY',
    description: 'A recommended amount may not exceed the customer’s investable monthly surplus.',
    check: ({ amount, facts }) => (
      amount > 0 && facts.investableSurplus != null && amount > facts.investableSurplus && {
        spoken: `That is more than you actually have spare each month. After everything committed, there is about ₹${Math.round(facts.investableSurplus).toLocaleString('en-IN')}. Let us work inside that.`,
        recorded: `Blocked: recommended ₹${amount} exceeds investable surplus ₹${facts.investableSurplus}.`,
      }
    ),
  },
  {
    id: 'HORIZON_VS_LOCKIN',
    description: 'A product’s lock-in may not exceed the horizon of the goal it is recommended for.',
    check: ({ product, goal }) => (
      goal?.horizonYears != null && product.lockInYears > goal.horizonYears && {
        spoken: `The money would be locked for ${product.lockInYears} years, and you need it in about ${goal.horizonYears}. Wrong shape for this goal.`,
        recorded: `Blocked: lock-in ${product.lockInYears}y exceeds goal horizon ${goal.horizonYears}y.`,
      }
    ),
  },
  {
    id: 'BUNDLED_PROTECTION',
    description:
      'A product bundling protection with investment is not recommended where an unbundled ' +
      'term policy plus a fund provides equivalent cover at materially lower cost.',
    check: ({ product, alternatives }) => {
      if (!product.bundlesProtectionAndInvestment) return null
      const term = alternatives.find((p) => p.category === 'Term Insurance')
      if (!term) return null
      const ratio = product.minInvestment / term.minInvestment
      if (ratio < 2) return null
      return {
        spoken: `No. It costs about ${Math.round(ratio)} times what a term plan costs for the same protection, and the charges are buried inside it. IDBI sells this one, and I am still telling you not to buy it. Take the term cover for around ₹${term.minInvestment.toLocaleString('en-IN')} a month and invest the difference separately.`,
        recorded: `Blocked: bundled protection-and-investment product priced ${ratio.toFixed(1)}x the unbundled term alternative (${term.productId}).`,
        alternative: { productId: term.productId, name: term.name, monthly: term.minInvestment },
      }
    },
  },
]

/**
 * Evaluate a proposed recommendation.
 * Returns { verdict, ruleId, spoken, recorded, alternative, passed[] }.
 */
export function evaluate({ product, customer, facts = {}, amount = 0, goal = null, alternatives = [] }) {
  const passed = []
  for (const rule of RULES) {
    const failure = rule.check({ product, customer, facts, amount, goal, alternatives })
    if (failure) {
      return {
        verdict: 'BLOCKED',
        ruleId: rule.id,
        spoken: failure.spoken,
        recorded: failure.recorded,
        alternative: failure.alternative || null,
        passed,
      }
    }
    passed.push(rule.id)
  }
  return { verdict: 'PASS', ruleId: null, spoken: null, recorded: 'All suitability rules passed.', alternative: null, passed }
}

export const ruleBook = RULES.map(({ id, description }) => ({ id, description }))
