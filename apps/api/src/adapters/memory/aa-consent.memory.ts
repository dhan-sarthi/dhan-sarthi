/**
 * The Account Aggregator consent store, in process.
 *
 * A Postgres sibling belongs beside this one before any of it is real — a consent handle that
 * does not survive a restart means a customer who approved on their phone comes back to an app
 * that has forgotten it asked. The port is the same either way.
 */
import { NotFound } from '../../application/errors.ts'
import type { Clock } from '../../ports/index.ts'
import type {
  AaConsentStore,
  ConsentEvent,
  ConsentRequestRecord,
  ConsentRequestStatus,
} from '../../ports/aa-consent.port.ts'

export class InMemoryAaConsents implements AaConsentStore {
  private readonly rows = new Map<string, ConsentRequestRecord>()
  private readonly clock: Clock

  constructor(clock: Clock) {
    this.clock = clock
  }

  async open(record: {
    consentHandle: string
    cif: string
    status: ConsentRequestStatus
  }): Promise<ConsentRequestRecord> {
    const at = this.clock.now().toISOString()
    // A handle IDBI reuses — and its sandbox reuses one for every request — keeps the events
    // already recorded against it rather than losing them to a second attempt.
    const existing = this.rows.get(record.consentHandle)
    const row: ConsentRequestRecord = {
      consentHandle: record.consentHandle,
      cif: record.cif,
      status: record.status,
      redirectionUrl: existing?.redirectionUrl ?? null,
      consentId: existing?.consentId ?? null,
      validFrom: existing?.validFrom ?? null,
      validTo: existing?.validTo ?? null,
      events: existing?.events ?? [],
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    }
    this.rows.set(row.consentHandle, row)
    return clone(row)
  }

  async find(consentHandle: string): Promise<ConsentRequestRecord | null> {
    const row = this.rows.get(consentHandle)
    return row === undefined ? null : clone(row)
  }

  async forCustomer(cif: string): Promise<ConsentRequestRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.cif === cif)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(clone)
  }

  async update(
    consentHandle: string,
    patch: Partial<
      Pick<
        ConsentRequestRecord,
        'status' | 'redirectionUrl' | 'consentId' | 'validFrom' | 'validTo'
      >
    >,
  ): Promise<ConsentRequestRecord> {
    const row = this.rows.get(consentHandle)
    if (row === undefined) throw new NotFound(`No consent request ${consentHandle}.`)
    const next: ConsentRequestRecord = {
      ...row,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: this.clock.now().toISOString(),
    }
    this.rows.set(consentHandle, next)
    return clone(next)
  }

  async record(consentHandle: string, event: ConsentEvent): Promise<ConsentRequestRecord> {
    const at = this.clock.now().toISOString()
    const existing = this.rows.get(consentHandle)
    const row: ConsentRequestRecord = existing ?? {
      consentHandle,
      // A notification for a handle we never raised. Kept anyway: unexplained is better than
      // gone, and `cif` being empty is itself the signal that nothing here is correlated.
      cif: '',
      status: 'REPORTED',
      redirectionUrl: null,
      consentId: null,
      validFrom: null,
      validTo: null,
      events: [],
      createdAt: at,
      updatedAt: at,
    }
    row.events = [...row.events, event]
    // The event moves nothing but the fact that something happened. Only 591 can make a
    // consent ACTIVE, and `verify` on the service is what asks it.
    row.status = row.status === 'ACTIVE' ? 'ACTIVE' : 'REPORTED'
    row.updatedAt = at
    this.rows.set(consentHandle, row)
    return clone(row)
  }
}

function clone(row: ConsentRequestRecord): ConsentRequestRecord {
  return { ...row, events: row.events.map((e) => ({ ...e })) }
}
