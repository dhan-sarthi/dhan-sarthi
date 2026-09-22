import { routeById } from '@dhan/contracts'
import { Conflict, Forbidden, NotFound } from '../../application/errors.ts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function avatarRoutes(r: Registrar, s: AppServices): void {
  r(routeById('avatarAvailability'), async () => s.avatar.availability())

  /*
   * The brief is built here and is not editable from the client. The one thing the client may
   * say is *what the customer tapped* — `topic` — which steers the opening sentence and
   * nothing else; every figure in the call still comes from the View or a tool result.
   */
  r(routeById('startAvatarSession'), async ({ session, headers, body }) =>
    s.avatar.start(session, headers['x-waitlist-ticket'], body.topic),
  )

  // The call screen asks for this while the customer is still looking at Uday: the provider's
  // slow part (create, READY, the gate) happens before the tap instead of after it. Same topic
  // rule as the start route: it steers the opening line and nothing else.
  r(routeById('prepareAvatarSession'), async ({ session, body }) =>
    s.avatar.prepare(session, body.topic),
  )

  r(routeById('getWaitlist'), async ({ session, params }) =>
    s.avatar.waitlistStatus(session, params.ticket),
  )

  r(routeById('leaveWaitlist'), async ({ session, params }) => {
    await s.avatar.leaveWaitlist(session, params.ticket)
    return undefined
  })

  r(routeById('endAvatarSession'), async ({ session, params }) => {
    await s.avatar.end(session, params.runwaySessionId)
    return undefined
  })

  r(routeById('getAvatarCallRecord'), async ({ session, params }) =>
    s.avatar.record(session, params.runwaySessionId),
  )

  // The gate, when the provider calls it over HTTP rather than answering inside a room. There
  // is no session bearer on this request — it comes from the provider's servers, not from a
  // customer — so the per-call secret is the whole of its authentication, and every way of
  // failing it is a refusal to answer rather than a hint about which part was wrong.
  r(routeById('avatarToolCall'), async ({ params, body, headers, log }) => {
    const outcome = await s.avatarTools.dispatch({
      runwaySessionId: params.runwaySessionId,
      tool: params.tool,
      secret: headers['x-avatar-call'],
      args: body,
    })

    if (outcome.status === 'ok') return outcome.result
    log.warn(
      { runwaySessionId: params.runwaySessionId, tool: params.tool, outcome: outcome.status },
      'avatar tool call refused',
    )
    switch (outcome.status) {
      case 'bad_secret':
        throw new Forbidden()
      case 'not_gated':
        // 409, not 503: the session exists and is not answerable, and it never will be by
        // retrying. An ungated call is never answered — that is the whole promise of the gate.
        throw new Conflict('The tool gate for that call is not open.')
      default:
        throw new NotFound('No such live avatar tool call.')
    }
  })
}
