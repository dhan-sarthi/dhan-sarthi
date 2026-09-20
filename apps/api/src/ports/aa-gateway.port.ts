/**
 * What the consent flow needs from the bank, as a port.
 *
 * The orchestration belongs in `application/`, which may not reach into `adapters/` — and it
 * should not have to: the four calls below are the whole of the bank's side of an Account
 * Aggregator consent, and stating them as an interface is what lets the flow be tested against
 * a fake and lets a different aggregator be dropped in behind it. `IdbiGateway` satisfies this
 * structurally; nothing had to be added to it.
 *
 * Three implementations: `IdbiGateway` (adapters/idbi-sandbox/api/gateway.ts), the refusing
 * `unavailableAaGateway` (application/aa-unavailable.ts) that composition/root.ts selects under
 * every non-IDBI source, and the fake in test/application/aa-consent.test.ts.
 */
import type { IsoDate } from '@dhan/contracts'

/** One account a consent reaches, as the aggregator names it. */
export interface AaLinkedAccount {
  linkReferenceNumber: string
  maskedAccountNumber: string | null
  fipName: string | null
  fiType: string | null
  accountType: string | null
}

export interface AaConsentSummary {
  consentId: string | null
  consentHandle: string | null
  status: string | null
  createdAt: IsoDate | null
  accounts: AaLinkedAccount[]
}

export interface AaGatewayPort {
  /** 590. Raises a consent request and may notify the customer. */
  requestConsent(cif: string): Promise<{ consentHandle: string; status: string }>
  /** 592. The URL the customer approves at, for a handle. */
  consentRedirectUrl(consentHandle: string, redirectUrl: string): Promise<string>
  /**
   * 593. Turns the `ecres` the redirect returns with into a readable result.
   *
   * Worth knowing before this is trusted: the sandbox does not validate the token. The spec's
   * stale sample decrypts happily, so a success here says nothing about whether a real one
   * would.
   */
  decryptConsentCallback(payload: {
    ecres: string
    resdate: string
    fi: string
  }): Promise<{ status: string | null; consentHandle: string | null; sessionId: string | null }>
  /** 591. What the bank says the customer's consents actually are. The only source of truth. */
  consents(cif: string): Promise<AaConsentSummary[]>
}
