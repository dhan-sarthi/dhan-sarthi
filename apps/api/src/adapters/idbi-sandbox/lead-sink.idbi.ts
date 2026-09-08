/**
 * `LeadSinkPort` over IDBI's 428: the one write the product needs.
 *
 * The identity a lead requires — a name, a mobile number and a PAN — is resolved here rather
 * than passed in, so none of it travels through the application layer or into a response body.
 * The name and the PAN come from the bank (433, or a consented pull's holder block); the mobile
 * number is the one the sandbox keys its Account Aggregator calls on, which is the only place
 * the catalogue holds one.
 *
 * Where any of the three is missing the lead is not sent. A lead carrying a placeholder PAN is
 * worse than no lead at all: it is a real row in a bank's queue that nobody can act on, and this
 * is the one part of the app whose output a member of staff has to trust.
 */
import { silentLogger } from '../../infra/logger.ts'
import type { Logger } from '../../infra/logger.ts'
import type { LeadOutcome, LeadRequest, LeadSinkPort } from '../../ports/lead-sink.port.ts'
import { sandboxCustomer } from './api/customers.ts'
import type { IdbiGateway } from './api/gateway.ts'
import { optionalText } from './api/scalars.ts'

/**
 * The holder fields a lead needs, read loosely.
 *
 * `unknown` rather than `string | undefined` because zod's passthrough output types every key
 * as optional and `exactOptionalPropertyTypes` will not let those flow into a narrower shape —
 * and `optionalText` is what reads them anyway, which accepts anything.
 */
/** Everything 428 needs about the customer, resolved from whichever operation carries it. */
interface ResolvedIdentity {
  firstName: string | null
  lastName: string | null
  mobileNo: string | null
  pan: string | null
  emailId: string | null
  addressLine1: string | null
  pincode: string | null
  state: string | null
}

interface AaHolderFacts {
  name?: unknown
  mobile?: unknown
  pan?: unknown
  email?: unknown
  address?: unknown
}

export interface IdbiLeadSinkOptions {
  gateway: IdbiGateway
  logger?: Logger | undefined
}

export class IdbiLeadSink implements LeadSinkPort {
  private readonly gateway: IdbiGateway
  private readonly log: Logger

  constructor(options: IdbiLeadSinkOptions) {
    this.gateway = options.gateway
    this.log = options.logger ?? silentLogger
  }

  async create(request: LeadRequest): Promise<LeadOutcome> {
    const customer = sandboxCustomer(request.cif)
    if (customer === null) {
      return {
        status: 'incomplete',
        message: `No IDBI customer for cif ${request.cif}, so no lead can be raised.`,
        leadId: null,
      }
    }

    let identity: ResolvedIdentity
    try {
      identity = await this.resolveIdentity(request.cif)
    } catch (err) {
      // Resolving the identity is itself two or three bank reads, and a line that is down
      // during them is the same situation as one down during 428: the decision stands, and
      // this is reported rather than thrown.
      this.log.warn(
        { cif: request.cif, err: err instanceof Error ? err.message : String(err) },
        'no lead raised: the bank could not be reached for the customer identity',
      )
      return {
        status: 'unavailable',
        message: 'The bank could not be reached to raise a lead. Your decision is recorded.',
        leadId: null,
      }
    }
    const missing = [
      identity.pan === null ? 'PAN' : null,
      identity.mobileNo === null ? 'mobile number' : null,
      identity.firstName === null ? 'name' : null,
    ].filter((m): m is string => m !== null)

    if (missing.length > 0 || identity.pan === null || identity.mobileNo === null) {
      // Reported rather than sent. The customer's decision is already on the record; what is
      // missing is the detail a member of staff would need to act on it.
      this.log.warn({ cif: request.cif, missing }, 'no lead raised: incomplete identity')
      return {
        status: 'incomplete',
        message: `The bank sends no ${missing.join(' or ')} for this customer, so no lead was raised.`,
        leadId: null,
      }
    }

    const outcome = await this.gateway.createLead({
      ...request,
      firstName: identity.firstName ?? '',
      lastName: identity.lastName ?? '',
      mobileNo: identity.mobileNo,
      pan: identity.pan,
      emailId: identity.emailId,
      addressLine1: identity.addressLine1,
      pincode: identity.pincode,
      state: identity.state,
    })
    this.log.info(
      { cif: request.cif, product: request.product.name, status: outcome.status },
      'handed a lead to IDBI',
    )
    return outcome
  }

  /**
   * Name, PAN, mobile and address, from whichever operation carries them.
   *
   * 433 is the richest and holds one customer; a consented pull's holder block covers another.
   * The mobile number is not in either — it is the value the Account Aggregator calls are keyed
   * on, recorded per customer because that is the only place the catalogue has one.
   */
  private async resolveIdentity(cif: string): Promise<ResolvedIdentity> {
    const customer = sandboxCustomer(cif)
    const record = customer?.coverage.customerRecord
      ? await this.gateway.customerRecord().catch(() => undefined)
      : undefined

    if (record !== undefined) {
      return {
        firstName: optionalText(record.firstName),
        lastName: optionalText(record.lastName),
        mobileNo: optionalText(record.custMobileNo) ?? customer?.mobile ?? null,
        pan: optionalText(record.panCardNo),
        emailId: optionalText(record.emailId),
        addressLine1: optionalText(record.comuAddr1),
        pincode: optionalText(record.comuPincode),
        state: optionalText(record.comuState),
      }
    }

    // No record: the consented pull's holder block is the only other source of a PAN.
    const holder = await this.aaHolder(cif)
    const name = optionalText(holder?.name) ?? customer?.name ?? null
    const [first, ...rest] = (name ?? '').split(/\s+/).filter((p) => p !== '')
    return {
      firstName: first ?? null,
      lastName: rest.join(' ') || null,
      mobileNo: optionalText(holder?.mobile) ?? customer?.mobile ?? null,
      pan: optionalText(holder?.pan),
      emailId: optionalText(holder?.email),
      addressLine1: optionalText(holder?.address),
      pincode: null,
      state: null,
    }
  }

  private async aaHolder(cif: string): Promise<AaHolderFacts | undefined> {
    const customer = sandboxCustomer(cif)
    if (customer === null || !customer.coverage.accountAggregator) return undefined
    const { newReport } = await import('./api/to-domain.ts')
    const report = newReport()
    for await (const pulled of this.gateway.aaStatements(customer, report)) {
      const holder = pulled.accounts.find((a) => a.Profile?.Holders?.Holder?.[0] !== undefined)
        ?.Profile?.Holders?.Holder?.[0]
      if (holder !== undefined) return holder
    }
    return undefined
  }
}

/** A `LeadSinkPort` for a source with no bank to hand a lead to. */
export function noLeadSink(source: string): LeadSinkPort {
  return {
    create: async (): Promise<LeadOutcome> => ({
      status: 'unavailable',
      message: `The ${source} data source has no bank behind it, so no lead was raised.`,
      leadId: null,
    }),
  }
}
