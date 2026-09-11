/**
 * The Plan surface.
 *
 * `Plan` itself stays at `screens/Plan.tsx`, where `App.tsx` already finds it. What lives here is
 * the rebalancing flow it pushes and the presentation the two share — and the model underneath
 * both, which is a plain `.ts` for the reason `charts/series.ts` and `goals/jar.ts` are: the
 * parts of a drift screen that can be wrong invisibly are all in the arithmetic and the
 * provenance, and those are tested rather than eyeballed.
 */
export { Rebalance } from './Rebalance.tsx'
export type { RebalanceDecisions } from './Rebalance.tsx'
export {
  BenefitCards,
  CartRow,
  ChangeBand,
  Constituent,
  MeasureHead,
  MeasureRow,
  StageCard,
  TargetCard,
} from './parts.tsx'
export type { Benefit } from './parts.tsx'
export {
  changesFor,
  changeTotals,
  detectDrift,
  driftFor,
  fundingStage,
  investingNow,
  monthlyIncome,
  monthlyInterest,
  monthPair,
  monthsToClear,
  observedMonth,
  paymentToClear,
  plannedMonth,
  MONTH_SLICES,
  STAGE_LABEL,
} from './drift.ts'
export type {
  Change,
  ChangeInputs,
  Drift,
  DriftKind,
  Measure,
  MonthSlice,
  Terminus,
} from './drift.ts'
