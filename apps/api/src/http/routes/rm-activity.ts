/**
 * Owned by the activity builder.
 *
 * The routes behind the journey, the record, notes, handoffs, reveals, refusals and the access
 * log, registered against `RmActivityService`. Each `:cif` route is checked against the caller's
 * book here, before the service is called, so a service method can assume the customer is the
 * caller's; `rmUpdateHandoff` names no cif, so its service method checks the handoff's customer.
 * Each check names what was attempted, for the `denied` entry a 403 writes.
 */
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function rmActivityRoutes(r: Registrar, s: AppServices): void {
  r(routeById('rmJourney'), async ({ rm, params }) => {
    await s.rmScope.assertInBook(rm, params.cif, { purpose: 'Open the journey', detail: null })
    return s.rmActivity.journey(rm, params.cif)
  })

  r(routeById('rmCustomerRecord'), async ({ rm, params }) => {
    await s.rmScope.assertInBook(rm, params.cif, {
      purpose: 'Open the advice record',
      detail: null,
    })
    return s.rmActivity.customerRecord(rm, params.cif)
  })

  r(routeById('rmVerifyCustomerRecord'), async ({ rm, params }) => {
    await s.rmScope.assertInBook(rm, params.cif, {
      purpose: 'Verify the advice record',
      detail: null,
    })
    return s.rmActivity.verifyCustomerRecord(rm, params.cif)
  })

  r(routeById('rmAddNote'), async ({ rm, params, body }) => {
    await s.rmScope.assertInBook(rm, params.cif, {
      purpose: body.kind === 'call' ? 'Log a call' : 'Add a note',
      detail: null,
    })
    return s.rmActivity.addNote(rm, params.cif, body)
  })

  r(routeById('rmUpdateHandoff'), async ({ rm, params, body }) =>
    s.rmActivity.updateHandoff(rm, params.handoffId, body),
  )

  r(routeById('rmReveal'), async ({ rm, params, body }) => {
    // As a `revealed` entry would read: the reason verbatim, the field as the detail.
    await s.rmScope.assertInBook(rm, params.cif, { purpose: body.reason, detail: body.field })
    return s.rmActivity.reveal(rm, params.cif, body)
  })

  r(routeById('rmRefusals'), async ({ rm }) => s.rmActivity.refusals(rm))

  r(routeById('rmVerifyBook'), async ({ rm }) => s.rmActivity.verifyBook(rm))

  r(routeById('rmAccessLog'), async ({ rm }) => s.rmActivity.accessLog(rm))
}
