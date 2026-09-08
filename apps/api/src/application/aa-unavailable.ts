/**
 * The Account Aggregator gateway, for a source that has none.
 *
 * Under the fixtures generator or the seeded database there is no aggregator to ask, and the
 * choice is between not registering the consent routes at all and registering them so they say
 * why they cannot work. The second is better: a client gets one shape everywhere and a 503 that
 * names the reason, rather than a 404 that reads like a bug in the client.
 */
import { Unavailable } from './errors.ts'
import type { AaConsentSummary, AaGatewayPort } from '../ports/aa-gateway.port.ts'

export function unavailableAaGateway(source: string): AaGatewayPort {
  const refuse = (): never => {
    throw new Unavailable(
      `The ${source} data source has no Account Aggregator behind it, so a consent cannot be ` +
        'raised. Run with BANK_SOURCE=idbi-sandbox to use the real flow.',
    )
  }
  return {
    requestConsent: () => refuse(),
    consentRedirectUrl: () => refuse(),
    decryptConsentCallback: () => refuse(),
    // A list is answerable: there are none. Refusing a read would make every screen that shows
    // consent state fail under a source where the honest answer is simply "no consents".
    consents: (): Promise<AaConsentSummary[]> => Promise.resolve([]),
  }
}
