/**
 * The RM console's own routes: sign-in and out, who is signed in, the book, Today, one customer
 * and Insights. The activity routes are in `rm-activity.ts` and the copilot's in
 * `rm-copilot.ts`, each with its own owner.
 *
 * Every route that names a cif asks `rmScope.assertInBook` before anything else, in the handler
 * where a reviewer can see it: 403 for a customer in another RM's book, 404 for one nobody holds.
 */
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function rmRoutes(r: Registrar, s: AppServices): void {
  r(routeById('rmSignIn'), async ({ body }) => s.rmAuth.signIn(body.employeeNo, body.password))

  r(routeById('rmSignOut'), async ({ rm }) => {
    await s.rmAuth.signOut(rm)
    return undefined
  })

  r(routeById('rmMe'), async ({ rm }) => s.rmConsole.me(rm))

  r(routeById('rmBook'), async ({ rm }) => s.rmConsole.book(rm))

  r(routeById('rmToday'), async ({ rm }) => s.rmConsole.today(rm))

  r(routeById('rmCustomer'), async ({ rm, params, query }) => {
    await s.rmScope.assertInBook(rm, params.cif)
    return s.rmConsole.customer(rm, params.cif, query.purpose)
  })

  r(routeById('rmInsights'), async ({ rm }) => s.rmConsole.insights(rm))
}
