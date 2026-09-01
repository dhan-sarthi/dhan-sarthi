// The behaviour engine.
//
// Raw bank records in, the numbers a person would actually care about out. Everything the
// advisor is allowed to say comes from here, and the screens render the same object — so a
// figure cannot appear in conversation that is absent from the UI.
//
// Deliberately plain arithmetic. When IDBI supply these as derived fields (group 07 of the
// data spec we sent them), this file becomes a passthrough rather than a calculation.

const SAVINGS_RATE = 0.03
const INFLATION = 0.06

const sum = (xs) => xs.reduce((a, b) => a + b, 0)

export function derive({ customer, accounts = [], transactions = [], liabilities = [], holdings = [] }) {
  const credits = transactions.filter((t) => t.txnType === 'CREDIT')
  const debits = transactions.filter((t) => t.txnType === 'DEBIT')

  const monthlyInflow = sum(credits.map((t) => t.txnAmount))
  const monthlyOutflow = sum(debits.map((t) => t.txnAmount))

  // Spend by category, largest first — the "where is it going" answer.
  const byCategory = {}
  for (const t of debits) {
    const k = t.spendCategory || 'Uncategorised'
    byCategory[k] = (byCategory[k] || 0) + t.txnAmount
  }
  const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

  const savings = accounts.find((a) => a.accountType === 'Savings')
  const idleBalance = savings?.currentBalance ?? 0

  const emiTotal = sum(liabilities.map((l) => l.emiAmount || 0))
  const currentSip = sum(holdings.filter((h) => h.sipActive).map((h) => h.sipAmount || 0))

  // Surplus is what is left after everything already committed. Recommending against a
  // number that ignores EMIs and existing SIPs is how advice becomes unaffordable.
  const investableSurplus = Math.max(0, monthlyInflow - monthlyOutflow - emiTotal)

  const salaryTxn = credits.find((t) => t.isSalaryCredit)
  const daysSinceSalary = salaryTxn
    ? Math.max(0, Math.round((Date.now() - new Date(salaryTxn.txnDate).getTime()) / 86_400_000))
    : null

  const emergencyFundMonths = monthlyOutflow > 0 ? idleBalance / monthlyOutflow : 0
  const hasTermCover = holdings.some((h) => /term/i.test(h.name || ''))
  const hasHighInterestDebt = liabilities.some((l) => (l.loanInterestRate || 0) >= 18)
  const missedEmi = liabilities.some((l) => (l.dpdStatus || 0) > 0)

  const invested = sum(holdings.map((h) => h.currentValue || 0))
  const netWorth = invested + sum(accounts.map((a) => a.currentBalance || 0))

  return {
    monthlyInflow,
    monthlyOutflow,
    investableSurplus,
    idleBalance,
    idleCostPerYear: Math.round(idleBalance * (INFLATION - SAVINGS_RATE)),
    spendByCategory: Object.fromEntries(ranked),
    topCategory: ranked[0]?.[0] ?? null,
    topCategoryAmount: ranked[0]?.[1] ?? 0,
    transactionCount: transactions.length,
    currentSip,
    emiTotal,
    emergencyFundMonths: Number(emergencyFundMonths.toFixed(1)),
    daysSinceSalary,
    dependents: customer?.dependents ?? 0,
    hasTermCover,
    hasHighInterestDebt,
    missedEmi,
    invested,
    netWorth,
    investedPctOfNetWorth: netWorth ? Number(((invested / netWorth) * 100).toFixed(1)) : 0,
    savingsRate: SAVINGS_RATE,
    inflation: INFLATION,
  }
}
