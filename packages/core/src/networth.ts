/**
 * Net worth: what "everything you own, less everything you owe" means here.
 *
 * Written inline in the Grow tab's render body, where nothing could test it and nothing else
 * could reuse it. It is a definition rather than a layout, so it lives here.
 *
 * The parameter is structural rather than core's own `Snapshot`, deliberately: the clients
 * read the wire shape from `@dhan/contracts`, which mirrors `Snapshot` but is not it, and a
 * cast at the call site would be the definition quietly disagreeing with itself. Core's
 * `Snapshot` satisfies this shape, so core's own callers pass it unchanged.
 */
export interface NetWorthFacts {
  balances: { total: number }
  holdings: { total: number; equity: number }
  debt: { total: number }
}

export interface NetWorth {
  assets: number
  liabilities: number
  net: number
  allocation: {
    /**
     * Cash is an allocation, not "not invested yet". An idle balance is a decision, and
     * showing it beside equity and fixed income is what makes it look like one.
     */
    cash: number
    equity: number
    /**
     * Fixed income and everything else held that is not equity — deliberately not
     * `holdings.debt`, which is debt funds alone and would drop NPS, PPF and endowments
     * out of the total.
     */
    fixed: number
  }
}

export function netWorth(snapshot: NetWorthFacts): NetWorth {
  const { balances, holdings, debt } = snapshot
  const assets = balances.total + holdings.total
  return {
    assets,
    liabilities: debt.total,
    net: assets - debt.total,
    allocation: {
      cash: balances.total,
      equity: holdings.equity,
      fixed: holdings.total - holdings.equity,
    },
  }
}
