// ---- Demo persona: derived from 6 months of (mock) IDBI savings-account
// transactions + Account Aggregator-linked external accounts ----

export const persona = {
  name: 'Rohan',
  age: 29,
  retireAt: 60,
  monthlyIncome: 85000,
  city: 'Indore',
}

// Spend analysis for last month, ₹ (as the behaviour engine would compute it)
export const spendCategories = [
  { name: 'Rent & bills', amount: 24500 },
  { name: 'Food & dining', amount: 9800 },
  { name: 'Shopping', amount: 7400 },
  { name: 'Transport', amount: 4300 },
  { name: 'Entertainment', amount: 3600 },
]

export const spendTotal = spendCategories.reduce((s, c) => s + c.amount, 0)

// Behaviour-engine outputs
export const insights = {
  avgMonthlySurplus: 18400, // income - spend - existing commitments, 6-mo avg
  idleBalance: 92000, // sits in savings a/c earning 3% for 4+ months
  fdMaturingDays: 12,
  fdAmount: 200000,
  existingSip: 5000,
}

export const nudges = [
  {
    icon: '💰',
    text: '<b>Salary credited yesterday.</b> Based on 6 months of your spending, ₹18,400 of it will likely sit idle. Moving it on salary day is the easiest way to invest without feeling it.',
    action: 'Set up an auto-sweep SIP',
  },
  {
    icon: '⏳',
    text: 'Your <b>₹2,00,000 FD matures in 12 days.</b> At your age and risk profile, a 100% FD renewal may be too conservative for your retirement goal.',
    action: 'See a suitable split',
  },
  {
    icon: '🛡️',
    text: 'You have <b>no term insurance</b> on record. Protection comes before investment — a ₹1 Cr LIC term cover costs about ₹850/month at your age.',
    action: 'Get a quote via LIC',
  },
]

// Risk profile → expected annual return of the recommended asset mix
export const riskProfiles = {
  Conservative: { rate: 0.08, mix: 'FD + debt funds (80/20)' },
  Balanced: { rate: 0.10, mix: 'Hybrid: 50% equity index, 30% debt, 20% FD' },
  Growth: { rate: 0.12, mix: '70% equity index funds, 20% debt, 10% gold' },
}

// SIP future value: monthly P for n months at annual rate r (contributions at period start)
export function sipFutureValue(monthly, years, annualRate) {
  const i = annualRate / 12
  const n = years * 12
  return monthly * (((1 + i) ** n - 1) / i) * (1 + i)
}

// Retirement corpus needed: today's spend, inflated to retirement, at 4% withdrawal
export function corpusNeeded(monthlySpendToday, yearsToRetire, inflation = 0.06) {
  const futureMonthly = monthlySpendToday * (1 + inflation) ** yearsToRetire
  return (futureMonthly * 12) / 0.04
}

// Life events "unlocked" as goal coverage crosses thresholds (BitLife mechanic).
// Written in the future self's first person — the writing IS the product (MIT Future You).
export const lifeEvents = [
  { at: 0.25, icon: '🛒', text: '2049 — I stopped doing the maths before every grocery run.' },
  { at: 0.5, icon: '🎉', text: 'Age 60 — I retired on time. No "just two more years."' },
  { at: 0.75, icon: '💍', text: "2054 — Meera's wedding. I paid for all of it. Happy tears." },
  { at: 1.0, icon: '🏖️', text: '2057 — work became a choice. I chose the beach at Gokarna.' },
]

// Everyday prices inflated to 2057 (6% for 31 years ≈ 6.1×) — the Merrill trick.
export const prices2057 = [
  { item: 'Cutting chai', today: 15, future: 91 },
  { item: 'Milk, 1 litre', today: 65, future: 396 },
  { item: 'Movie ticket', today: 300, future: 1826 },
]

export function formatINR(x) {
  if (x >= 1e7) return `₹${(x / 1e7).toFixed(x >= 1e8 ? 0 : 1)} Cr`
  if (x >= 1e5) return `₹${(x / 1e5).toFixed(1)} L`
  return `₹${Math.round(x).toLocaleString('en-IN')}`
}

// Onboarding chat script. Each step: bot lines, then chips; answers stored by key.
export const onboardingScript = [
  {
    key: 'intro',
    bot: [
      'Namaste Rohan! 🙏 It\'s me — you, at sixty. I know how this sounds. Bear with me.',
      'I remember 2026… salary on the 1st, gone by the 20th, chai at the tapri. I\'m here so my life turns out well — which means yours. A few quick questions?',
    ],
    chips: [{ label: "Let's do it", value: 'yes' }, { label: 'What do you do with my data?', value: 'privacy' }],
  },
  {
    key: 'privacy',
    onlyIf: 'privacy',
    bot: [
      'Fair question. I read your IDBI transactions, and — only with your consent via the RBI Account Aggregator — your accounts elsewhere. Everything stays inside the bank, is consent-logged under the DPDP Act, and you can revoke access anytime.',
    ],
    chips: [{ label: 'Okay, I consent — proceed', value: 'yes' }],
  },
  {
    key: 'goal',
    bot: ['If we get this right, what matters most to you?'],
    chips: [
      { label: '🏖️ Retire comfortably', value: 'retire' },
      { label: '🏠 Buy a home', value: 'home' },
      { label: '👨‍👩‍👧 Child\'s education', value: 'child' },
    ],
  },
  {
    key: 'drop',
    bot: [
      'Good choice. Now the question that actually decides your investment mix — be honest!',
      'Your ₹1,00,000 investment falls to ₹80,000 in a market crash. What do you do?',
    ],
    fineprint: 'Required by SEBI (IA) Regulations — your answers form your risk profile, recorded & editable anytime.',
    chips: [
      { label: '😰 Sell before it gets worse', value: 'sell' },
      { label: '😐 Wait it out', value: 'hold' },
      { label: '😎 Invest more at the dip', value: 'buy' },
    ],
  },
  {
    key: 'horizon',
    bot: ['And when would you need to touch this money?'],
    chips: [
      { label: 'Within 3 years', value: 'short' },
      { label: '3–10 years', value: 'mid' },
      { label: '10+ years', value: 'long' },
    ],
  },
]

export function computeRiskProfile(answers) {
  let score = 0
  if (answers.drop === 'hold') score += 1
  if (answers.drop === 'buy') score += 2
  if (answers.horizon === 'mid') score += 1
  if (answers.horizon === 'long') score += 2
  if (score >= 3) return 'Growth'
  if (score >= 1) return 'Balanced'
  return 'Conservative'
}

// Canned advisor Q&A for the Ask tab (each answer carries its "why" / audit basis)
export const advisorQA = [
  {
    q: 'Am I saving enough?',
    a: 'Right now you invest ₹5,000/month while ₹18,400/month sits unused in savings. For your retirement goal you need about ₹15,000/month — so you\'re a third of the way there, and the gap is affordable from money you already don\'t spend.',
    basis: 'Basis: 6-month spend analysis · goal gap calculation',
  },
  {
    q: 'Why mutual funds over another FD?',
    a: 'FDs are great for money you need within 3 years — that\'s why I still suggest keeping ₹80,000 of your maturing FD there. But your retirement money has 31 years to grow. Historically, diversified equity index funds have beaten FD returns by 4–6% a year over such periods. The trade-off is short-term ups and downs, which your risk profile says you can tolerate.',
    basis: 'Basis: your risk profile (consented) · SEBI suitability check passed',
  },
  {
    q: 'What about insurance?',
    a: 'Protection comes first. Before we grow wealth, a ₹1 Cr term cover (~₹850/month via LIC) protects your family if something happens to you. I flag it because your records show no term policy — not because it earns the bank a commission. That reasoning is logged.',
    basis: 'Basis: protection-first advice rule · LIC bancassurance shelf',
  },
]
