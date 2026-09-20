import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function transactionRoutes(r: Registrar, s: AppServices): void {
  r(routeById('listTransactions'), async ({ session, query }) => s.ledger.page(session, query))
}
