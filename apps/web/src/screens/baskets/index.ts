/**
 * The surface's one export.
 *
 * `App.tsx` is another agent's file, so nothing here reaches into the shell: `Baskets` takes the
 * `view` and the injected `evaluate` the shell already hands `Discover` and `Plan`, and hands back
 * `onExit` / `onSeeRecord`. The two optional callbacks — `onOpenProfile`, `onOpenPlan` — are the
 * profile banner's arrow and the plan card's link; left out, both places still say what they say
 * and simply do not navigate.
 */
export { Baskets } from './Baskets.tsx'
export { BASKETS, composeAll, composeBasket, basketFloor, planStance } from './compose.ts'
export type { Basket, BasketId, BasketSpec, Group, Stance } from './compose.ts'
