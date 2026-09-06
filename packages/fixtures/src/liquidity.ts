import type { AccountLiquidity } from '@dhan/core'

/** Explicit synthetic observations, not inferred bank semantics. */
export interface FixtureLiquidityTerms {
  lienAmount: number
  floatingBalance: number
}

export function fixtureLiquidity(
  currentBalance: number,
  asOf: string,
  terms?: FixtureLiquidityTerms,
): AccountLiquidity {
  const lienAmount = terms?.lienAmount ?? 0
  const floatingBalance = terms?.floatingBalance ?? 0
  return {
    observedOn: asOf,
    availableBalance:
      Math.max(
        0,
        Math.round(currentBalance * 100) -
          Math.round(lienAmount * 100) -
          Math.round(floatingBalance * 100),
      ) / 100,
    lienAmount,
    floatingBalance,
    fFDBalance: 0,
    userDefinedBalance: 0,
  }
}
