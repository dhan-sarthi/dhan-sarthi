/**
 * Spending challenges: the running one, the quote behind the wizard, the start and the surrender.
 *
 * The view and the start answer the same whole `ChallengeView`, so the screen the customer
 * lands on after the wizard's last tap is the one the server just computed rather than one the
 * client assembled from a narrower answer and a refetch. The quote is a GET because it reads
 * the statement and writes nothing, and the surrender is a 204 — the handler returns
 * `undefined`, which `register.ts` short-circuits before the response parse.
 */
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function challengeRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getChallenges'), async ({ session }) => s.challenges.view(session))

  r(routeById('quoteChallenge'), async ({ session, query }) => s.challenges.quote(session, query))

  r(routeById('startChallenge'), async ({ session, body }) => s.challenges.start(session, body))

  r(routeById('endChallenge'), async ({ session, params }) => {
    await s.challenges.end(session, params.challengeId)
    return undefined
  })
}
