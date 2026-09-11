/**
 * External holdings — SmartWealth's CAS import, on IDBI terms.
 *
 * `ExternalImport` is the whole feature and the only thing a host needs: four screens, one state
 * machine, its own back handling. It draws as a normal screen (a `Screen` with a `Head`), so it
 * can be pushed anywhere the shell pushes a screen — `App.tsx` renders `Commitments` exactly that
 * way. Until it is wired there it is reached from `LinkAccountsSheet`, which is the sheet the
 * Dashboard's "Money held elsewhere" promo already opens.
 *
 * The pieces are exported too, for a host that wants only the payoff screen: `ExternalHoldings`
 * is the `All / At IDBI / Elsewhere` fund list and takes a `HoldingsResponse`.
 */
export { ExternalImport } from './ExternalImport.tsx'
export { ExternalHoldings } from './ExternalHoldings.tsx'
export { CAS_FOLIOS, casInvested, casTotal } from './cas.ts'
export type { CasFolio } from './cas.ts'
