import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function askRoutes(r: Registrar, s: AppServices): void {
  r(routeById('ask'), async ({ session, body }) => s.conversation.ask(session, body.question))

  r(routeById('askSuggestions'), async ({ session }) => s.conversation.suggestions(session))
}
