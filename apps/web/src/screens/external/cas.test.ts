/**
 * The seam between the statement and the record.
 *
 * A folio counts as imported when a declared holding of the **same name** is on the record and
 * marked as held outside IDBI — `ExternalImport` says so at length, because `HoldingSchema` has no
 * folio number and a name is all there is to match on. That makes the folio names in `cas.ts` and
 * the names in `packages/fixtures/src/personas.ts` one fact written in two files, and nothing but
 * this file notices when they stop agreeing. The failure it prevents is quiet: rename a folio and
 * the statement simply reports two more folios to import, the Holdings pane grows a duplicate the
 * next time anybody presses Verify, and no screen says anything is wrong.
 *
 * It also holds the rule that decided *which* folios the persona already carries: the ones with no
 * mandate. A declared holding with a live SIP that has no matching debit in the ledger would have
 * the Holdings pane reporting money going in every month that Commitments — which reads the
 * statement — has never seen.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ROHAN } from '@dhan/fixtures'
import { CAS_FOLIOS, casInvested, casTotal } from './cas.ts'

/** What the import writes: the folios already on a persona's declared record, matched by name. */
const importedBy = (holdings: readonly { name: string; heldOutsideIdbi?: boolean }[]) =>
  CAS_FOLIOS.filter((f) => holdings.some((h) => h.name === f.name && h.heldOutsideIdbi === true))

describe('the statement against the record', () => {
  it('has Rohan already holding the folios that carry no mandate, and only those', () => {
    const already = importedBy(ROHAN.holdings)

    assert.deepEqual(
      already.map((f) => f.name).sort(),
      CAS_FOLIOS.filter((f) => f.sipMonthly === 0)
        .map((f) => f.name)
        .sort(),
      'the persona and the statement have drifted apart — a renamed folio silently un-imports it',
    )
  })

  it('carries the statement’s own figures, so the two screens quote one number', () => {
    for (const folio of importedBy(ROHAN.holdings)) {
      const held = ROHAN.holdings.find((h) => h.name === folio.name)
      assert.ok(held, `no holding for ${folio.name}`)
      assert.equal(held.currentValue, folio.value)
      assert.equal(held.investedAmount, folio.invested)
      // No mandate on the record, because there is none on the statement and none in the ledger.
      assert.equal(held.sipActive, false)
      assert.equal(held.sipAmount, undefined)
    }
  })

  it('still leaves something on the statement to import', () => {
    const already = importedBy(ROHAN.holdings)
    assert.ok(
      already.length < CAS_FOLIOS.length,
      'every folio is already on the record, so the import flow has nothing to demonstrate',
    )
  })

  it('totals the folios rather than restating a figure', () => {
    assert.equal(
      casTotal(CAS_FOLIOS),
      CAS_FOLIOS.reduce((n, f) => n + f.value, 0),
    )
    assert.equal(
      casInvested(CAS_FOLIOS),
      CAS_FOLIOS.reduce((n, f) => n + f.invested, 0),
    )
  })
})
