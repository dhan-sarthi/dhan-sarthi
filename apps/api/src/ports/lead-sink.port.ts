/**
 * Handing a product interest back to the bank.
 *
 * This is the half of the product that makes it more than a calculator. Everything else here
 * reads: the app pulls a customer's accounts, works out what they should do, and shows them.
 * A customer who then says yes has to reach somebody — and IDBI's 428 is that route, a lead
 * their staff will work.
 *
 * Three properties the implementation has to hold, because this is a write to a bank.
 *
 * It is never on the critical path. The advice record is the source of truth and it is already
 * written by the time a lead is attempted; a bank that refuses, times out or is unreachable must
 * not turn an accepted recommendation into an error the customer sees. The outcome is reported
 * beside the decision instead.
 *
 * A repeat is not a failure. 428 answers "Lead already created" for a lead it holds, which is
 * the correct response to a customer who accepted the same thing twice, and it is reported as a
 * duplicate rather than as an error.
 *
 * And it carries no invented detail. A lead needs a name, a mobile number and a PAN, all three
 * of which come from the bank or from the customer's own declared profile. Where one is missing
 * the lead is not sent, because a lead with a placeholder PAN is worse than no lead: it is a
 * real row in a bank's queue that nobody can act on.
 */

/**
 * What the application knows when a customer accepts something.
 *
 * Deliberately no name, no mobile number and no PAN. A lead needs all three, and they are bank
 * facts — 433 and a consented pull carry them — so the adapter resolves them behind this port.
 * Passing them through the application layer would put a PAN and a phone number into a service
 * signature, and from there into a log line or a response body, for no reason: the only thing
 * the decision knows that the bank does not is which product was accepted and for how much.
 */
export interface LeadRequest {
  cif: string
  /** The shelf product the customer accepted, as the bank's lead form wants it. */
  product: { name: string; category: string; subCategory: string }
  /** Rupees. The monthly ticket for a SIP, the premium for cover. */
  estimatedAmount: number
  /** Ours, so a repeat of the same decision is recognisable as the same lead. */
  leadId: string
}

/** The bank-facing body, assembled inside the adapter once the identity is resolved. */
export interface LeadDraft extends LeadRequest {
  firstName: string
  lastName: string
  mobileNo: string
  pan: string
  emailId: string | null
  addressLine1: string | null
  pincode: string | null
  state: string | null
}

export type LeadStatus =
  /** The bank took it. */
  | 'created'
  /** The bank already holds this lead. Not an error. */
  | 'duplicate'
  /** The bank rejected the body — a PAN format, a missing field. Ours to fix. */
  | 'refused'
  /** The line was down, or this source has no bank to hand a lead to. */
  | 'unavailable'
  /** We did not have the detail a lead needs, so nothing was sent. */
  | 'incomplete'

export interface LeadOutcome {
  status: LeadStatus
  /** The bank's own sentence, or ours where nothing was sent. */
  message: string
  leadId: string | null
}

export interface LeadSinkPort {
  create(request: LeadRequest): Promise<LeadOutcome>
}
