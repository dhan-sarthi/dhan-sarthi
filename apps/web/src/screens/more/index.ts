/**
 * The More surface.
 *
 * `More.tsx` is the router for these; nothing outside it should need more than `MoreMenu`, and
 * `App.tsx` needs none of them. If a route to one of these ever has to be reachable from
 * elsewhere in the app, this is the file to widen.
 */
export { MoreMenu } from './MoreMenu.tsx'
export { Reports } from './Reports.tsx'
export { InvestmentProfile } from './InvestmentProfile.tsx'
