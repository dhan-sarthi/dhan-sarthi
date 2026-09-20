export interface HoldingsTotals {
  invested: number
  value: number
  gain: number
}

/**
 * What a portfolio cost, what it is worth, and the difference.
 *
 * Gains are notional, pre-tax and pre-exit-load, and are never annualised into a return. The
 * difference is returned signed and unclamped: a loss is a loss, and the screen renders the
 * sign itself rather than being handed a floor it cannot see.
 */
export function holdingsTotals(
  holdings: readonly { investedAmount: number; currentValue: number }[],
): HoldingsTotals {
  const invested = holdings.reduce((t, h) => t + h.investedAmount, 0)
  const value = holdings.reduce((t, h) => t + h.currentValue, 0)
  return { invested, value, gain: value - invested }
}
