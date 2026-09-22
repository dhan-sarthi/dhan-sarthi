export interface MonthlyByCategory {
  /** Months of statement the division used. At least 1, so a fresh account cannot divide by zero. */
  months: number
  /** Each category's running total divided down to a normal month, order preserved. */
  perMonth: ReadonlyArray<readonly [string, number]>
  /** The largest per-month figure, floored at 1 so a bar can always be a fraction of it. */
  largest: number
}

/**
 * Spending by category, per month rather than per ledger.
 *
 * `byCategory` on the snapshot is a running total over the whole statement, not a monthly
 * figure — Shopping comes back as ₹93,234 against a ₹22,070 monthly envelope, which is not a
 * number anyone can act on and is not comparable to the cap beside it. Dividing by the months
 * of history is what makes the bar and the envelope the same kind of number.
 *
 * `Math.max(1, ...[])` is `1`, which is the right answer for an empty ledger and is the reason
 * the floor is not written as a conditional.
 */
export function monthlyByCategory(
  byCategory: ReadonlyArray<readonly [string, number]>,
  monthsOfHistory: number,
): MonthlyByCategory {
  const months = Math.max(1, monthsOfHistory)
  const perMonth = byCategory.map(([name, total]) => [name, total / months] as const)
  return { months, perMonth, largest: Math.max(1, ...perMonth.map(([, v]) => v)) }
}

/** The month's fixed outgoings as the snapshot carries them (`CommitmentFacts` on the wire). */
export interface Commitments {
  total: number
  rent: number
  emis: number
  bills: number
  /** Regular transfers and fees: the `obligation` and `transfer` series. */
  obligations: number
  subscriptions: number
  /** Investment debits the statement recognises, which is not every SIP the customer has. */
  investments: number
  series: ReadonlyArray<{ kind: string; category: string }>
}

export interface GoingOutRow {
  key: 'living' | 'transfers' | 'investments' | 'subscriptions' | 'plan' | 'all'
  label: string
  amount: number
  /** A second line, where the figure needs its reach said. */
  detail?: string
}

/** Rounding moves a split by a rupee or two. More than this and the parts are not the total. */
const ROUNDING = 4

/**
 * What the month has committed, one row per kind of money, and the plan's share last.
 *
 * The engine's reserved rows are two lumps, and both were misread. "Rent, bills and EMIs" is
 * every commitment, SIPs and family transfers included — Karan's ₹1,19,308 carries ₹12,000 of
 * investments and ₹27,000 of transfers and fees. The second row is the plan's monthly
 * (`roadmap.monthlyCommitment` — for Karan ₹22,501: the term premium plus the payoff running
 * now). The engine once labelled it "Saved and invested", which read as his investing beside a
 * Holdings tab saying ₹40,000 a month goes in; it now says "Set aside for your plan", as this
 * row does. So the lump is split along the facts it is the sum of, and the plan's row says what
 * it is.
 *
 * Built from the numbers, never from the engine's labels: the rows add up to the same total the
 * engine's own rows do, rupee for rupee, so the "Going out" figure over them does not move. The
 * engine's third row, the month's spending so far, is not among them: the budget hero counts it
 * on its own bar, and summing it here counted the same rupees twice. A
 * split that no longer adds up to the total (a new kind of commitment the engine starts counting)
 * falls back to the one row, rather than mislabelling the difference.
 *
 * Investments say where they were seen when the holdings report more going in than the statement
 * shows: SIPs paid from elsewhere are real, but they are not this month's outgoings here.
 */
export function goingOutRows(
  commitments: Commitments,
  planMonthly: number,
  holdingsMonthly = 0,
): GoingOutRow[] {
  const { rent, emis, bills, obligations, subscriptions, investments } = commitments
  const whole = Math.round(commitments.total)
  const parts: GoingOutRow[] = [
    {
      key: 'living',
      label: livingLabel(rent, bills, emis),
      amount: Math.round(rent + bills + emis),
    },
    {
      key: 'transfers',
      label: transfersLabel(commitments.series),
      amount: Math.round(obligations),
    },
    {
      key: 'investments',
      label: 'Investments',
      amount: Math.round(investments),
      ...(holdingsMonthly > investments ? { detail: 'Seen on your statement' } : {}),
    },
    { key: 'subscriptions', label: 'Subscriptions', amount: Math.round(subscriptions) },
  ]
  const residue = whole - parts.reduce((sum, p) => sum + p.amount, 0)

  let committed: GoingOutRow[]
  if (Math.abs(residue) > ROUNDING) {
    committed =
      whole > 0
        ? [{ key: 'all', label: 'Bills, EMIs, transfers and investing', amount: whole }]
        : []
  } else {
    // The rupee rounding lost goes on the biggest row, where it is the smallest share.
    const biggest = parts.reduce((a, b) => (b.amount > a.amount ? b : a))
    committed = parts
      .map((p) => (p === biggest ? { ...p, amount: p.amount + residue } : p))
      .filter((p) => p.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }

  const plan = Math.round(planMonthly)
  return plan > 0
    ? [...committed, { key: 'plan', label: 'Set aside for your plan', amount: plan }]
    : committed
}

/** "Rent, bills and EMIs", naming only what is there: Sunil pays no rent. */
function livingLabel(rent: number, bills: number, emis: number): string {
  const names = [rent > 0 && 'rent', bills > 0 && 'bills', emis > 0 && 'EMIs'].filter(
    (n): n is string => typeof n === 'string',
  )
  const said =
    names.length <= 1
      ? (names[0] ?? 'bills')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
  return said.charAt(0).toUpperCase() + said.slice(1)
}

/**
 * Transfers and fees are one engine figure, and a school fee is not a transfer to family. The
 * label names what the series behind it are, so a customer with no fees is not told of any.
 */
function transfersLabel(series: Commitments['series']): string {
  const owed = series.filter((s) => s.kind === 'obligation' || s.kind === 'transfer')
  const fees = owed.some((s) => s.category === 'Education')
  const transfers = owed.some((s) => s.category !== 'Education')
  return fees && transfers ? 'Transfers and fees' : fees ? 'Education fees' : 'Regular transfers'
}

/**
 * The newest first, which is the statement's own order for the same lines.
 *
 * The engine hands over "since you last looked" oldest first — it keeps the latest twelve with
 * `slice(-12)` — so the Overview's first six of them were the six *oldest*: the list ran the
 * wrong way beside `/statement`, and the spend that had just cleared was the one cut off.
 * Sorted on the day the bank posted each line and, within a day, in the reverse of the order
 * the lines arrived, which reproduces the statement row for row.
 */
export function newestFirst<T extends { txnDate: string }>(rows: readonly T[]): T[] {
  return rows
    .map((row, at) => ({ row, at }))
    .sort((a, b) =>
      a.row.txnDate === b.row.txnDate ? b.at - a.at : a.row.txnDate < b.row.txnDate ? 1 : -1,
    )
    .map(({ row }) => row)
}

/**
 * A balance month by month under a fixed payment, from today's figure: the month's interest
 * goes on, then the payment comes off — the order `payoffSummary` in core uses, so the month
 * this reaches zero is the month the plan says the debt clears.
 *
 * Stops at zero, or after `months` months if it has not got there. A payment below the interest
 * never gets there and the figures climb instead; that is the picture of a debt that does not
 * clear, and it is drawn as it is rather than left out.
 */
export function balanceByMonth(
  principal: number,
  annualRatePct: number,
  monthly: number,
  months: number,
): number[] {
  const r = annualRatePct / 100 / 12
  let balance = Math.max(0, principal)
  const out = [balance]
  for (let m = 0; m < months && balance > 0; m++) {
    const owed = balance + balance * r
    balance = owed - Math.min(Math.max(0, monthly), owed)
    out.push(balance)
  }
  return out
}
