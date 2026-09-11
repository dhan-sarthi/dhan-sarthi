/**
 * The family surface.
 *
 * `Family` is the whole feature — the two tabs, the invite flow, the request-sent screen and the
 * incoming accept/decline all push inside it, the way `Commitments` owns its calendar and detail
 * stack. It is a push over the shell rather than a tab: give it `onBack` and it draws the arrow.
 *
 * ```tsx
 * <Family view={view} holdings={holdings} onBack={() => setFamily(false)} onRefresh={refreshView} />
 * ```
 *
 * `holdings` is the same `HoldingsSource` `App.tsx` already builds for the Dashboard; the surface
 * reads it through `usePortfolio`, keyed on the snapshot, so it stays consistent with every other
 * figure on screen when the simulated clock moves.
 *
 * `householdOf` and its types are exported for the Dashboard's Family Wealth tile, which needs the
 * member count and the household total without mounting the screen.
 */
export { Family } from './Family.tsx'
export { COOLDOWN_DAYS, DEMO_MEMBERS, DEMO_REQUESTS, householdOf } from './household.ts'
export type { Household, HouseholdHolding, LinkRequest, Member } from './household.ts'
