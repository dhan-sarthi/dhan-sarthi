import { routeById } from '@dhan/contracts'
import { Unavailable } from '../../application/errors.ts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function customerRoutes(r: Registrar, s: AppServices): void {
  r(routeById('listCustomers'), async () => {
    const customers = await s.bank.listCustomers()
    // Under a host-identity adapter the host names the customer and there is nothing to pick.
    if (customers.length === 0) throw new Unavailable('The customer picker is disabled here.')
    return customers
  })
}
