/**
 * The Account Aggregator consent flow's state.
 *
 * Six chained calls, and only the middle of them is ours: 590 asks IDBI for a consent handle,
 * 592 turns that handle into the OneMoney URL the customer approves at, 497 is IDBI calling
 * *us* to say what the customer decided, 593 decrypts the token the redirect comes back with,
 * 591 lists the consent, and 595 finally reads the accounts under it. Between the redirect
 * leaving and the notification arriving the app has no idea what happened, so the handle and
 * everything since has to be written down.
 *
 * The security property that matters, and the reason this port exists rather than the webhook
 * writing consent state directly: **an inbound notification is untrusted input.** IDBI's
 * sandbox signs nothing, the route has to be reachable without a session because the bank
 * calls it, and the gateway answers `access-control-allow-origin: *` — so anyone who can
 * guess a consent handle can post an approval. A recorded event therefore grants nothing. It
 * only marks the handle as worth re-checking, and the app then asks 591 what the consent
 * actually says. The bank's own answer is the only thing that moves a consent to ACTIVE.
 *
 * One adapter today, `InMemoryAaConsents`, chosen in composition/profiles.ts with the same
 * class as the fallback in composition/root.ts. The second is a Postgres sibling whose tables
 * already exist — `app.consents` and the append-only `app.consent_events`, both created in
 * apps/api/migrations/0004_app_identity.sql — and a consent trail that survives a restart is
 * the whole point of writing it down. The interface is load-bearing meanwhile:
 * application/aa-consent.service.ts is its only caller and
 * `application-never-imports-adapters-or-http` (.dependency-cruiser.cjs) forbids it from
 * naming the class.
 */
import type { IsoDate } from '@dhan/contracts'

/** Where a consent request has got to, as far as *we* can prove. */
export type ConsentRequestStatus =
  /** 590 answered with a handle; the customer has not been sent anywhere yet. */
  | 'REQUESTED'
  /** 592 gave us a URL and the customer has been pointed at it. */
  | 'AWAITING_APPROVAL'
  /** A notification arrived, or the redirect came back. Unverified until 591 confirms it. */
  | 'REPORTED'
  /** 591 confirmed an active consent. The only status that permits a data pull. */
  | 'ACTIVE'
  /** 591 says it is not active, or a notification reported a rejection we then confirmed. */
  | 'CLOSED'

/** One inbound notification, exactly as it arrived. Data, never instruction. */
export interface ConsentEvent {
  /** 497 and 498 both send these; which one arrived is in `eventType`. */
  eventType: string
  eventStatus: string
  eventMessage: string | null
  consentId: string | null
  /** 498 only: the session a data pull happens under. */
  sessionId: string | null
  /** The masked accounts a data event says are ready. */
  linkRefNumbers: readonly string[]
  receivedAt: string
  /** The raw body, kept for the audit trail and for showing IDBI what they sent. */
  raw: unknown
}

export interface ConsentRequestRecord {
  consentHandle: string
  cif: string
  status: ConsentRequestStatus
  /** 592's URL. Held so a customer who closed the tab can be sent back to the same one. */
  redirectionUrl: string | null
  /** What 591 reported the last time it was asked, where it has been. */
  consentId: string | null
  validFrom: IsoDate | null
  validTo: IsoDate | null
  events: ConsentEvent[]
  createdAt: string
  updatedAt: string
}

export interface AaConsentStore {
  /** 590 answered. Replaces any earlier record for the same handle. */
  open(record: {
    consentHandle: string
    cif: string
    status: ConsentRequestStatus
  }): Promise<ConsentRequestRecord>
  find(consentHandle: string): Promise<ConsentRequestRecord | null>
  /** Every request raised for a customer, newest first. */
  forCustomer(cif: string): Promise<ConsentRequestRecord[]>
  /** Moves the status and whatever else 591 or 592 taught us. */
  update(
    consentHandle: string,
    patch: Partial<
      Pick<
        ConsentRequestRecord,
        'status' | 'redirectionUrl' | 'consentId' | 'validFrom' | 'validTo'
      >
    >,
  ): Promise<ConsentRequestRecord>
  /**
   * Records an inbound notification against a handle, creating a bare record if the handle is
   * one we have never seen — because a webhook we cannot correlate is still evidence, and
   * dropping it silently is how a missing consent becomes unexplainable.
   */
  record(consentHandle: string, event: ConsentEvent): Promise<ConsentRequestRecord>
}
