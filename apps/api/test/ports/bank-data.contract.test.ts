/**
 * The BankDataPort contract, as a suite any adapter can be run through.
 *
 * Its centrepiece is parity: for every persona at six clock positions, the file the port
 * loads must equal the file the generator produces, and so must everything derived from it.
 * That is the property the seed rests on — the Postgres adapter, the memory adapter and the
 * offline chunk all agree to the rupee because they call the same functions over the same rows.
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { addMonths, derive } from '@dhan/core'
import { PERSONAS, generateCustomerFile, seedBundles } from '@dhan/fixtures'
import { InMemoryBankData } from '../../src/adapters/memory/bank-data.memory.ts'
import { HISTORY_WINDOW_MONTHS } from '../../src/application/advisory.service.ts'
import type { BankDataPort } from '../../src/ports/index.ts'
import { ANCHOR, CLOCK_POSITIONS, FORWARD_MONTHS } from '../helpers/app.ts'

export function bankDataPortContract(
  name: string,
  factory: () => BankDataPort | Promise<BankDataPort>,
): void {
  describe(`BankDataPort contract: ${name}`, () => {
    let port: BankDataPort

    before(async () => {
      port = await factory()
    })

    it('lists every persona with the story it demonstrates, in the picker order', async () => {
      const customers = await port.listCustomers()
      // The order is the bundle's explicit display order, never the cif's or the name's.
      assert.deepEqual(
        customers.map((c) => c.slug),
        PERSONAS.map((p) => p.slug),
      )
      assert.deepEqual(
        customers.map((c) => c.name),
        ['Rohan Mehta', 'Priya Nair', 'Sunil Kumar'],
      )
      for (const c of customers) {
        assert.ok(c.cif.startsWith('IDBI'))
        assert.ok(c.pitch.length > 10)
        assert.ok(c.demonstrates.length > 10)
        assert.ok(c.age > 18 && c.age < 80)
      }
    })

    it('describes its source, clock and freshness', async () => {
      const d = port.describe()
      assert.ok(['memory', 'postgres', 'idbi-sandbox'].includes(d.source))
      assert.match(d.dataFreshnessDate, /^\d{4}-\d{2}-\d{2}$/)
      assert.equal(typeof d.simulatedClock, 'boolean')
      const h = await port.health()
      assert.equal(h.ok, true)
    })

    it('spans a ledger horizon that contains the anchor', async () => {
      for (const spec of PERSONAS) {
        const h = await port.ledgerHorizon(spec.customer.cif)
        assert.ok(h.from <= ANCHOR && ANCHOR <= h.to, `${spec.slug}: ${h.from}..${h.to}`)
      }
    })

    it('answers an active consent artefact covering all five blocks', async () => {
      for (const spec of PERSONAS) {
        const consent = await port.getConsent(spec.customer.cif)
        assert.equal(consent.status, 'ACTIVE')
        assert.deepEqual([...consent.scopes].sort(), [
          'ACCOUNTS',
          'HOLDINGS',
          'LIABILITIES',
          'PROFILE',
          'TXN',
        ])
        assert.ok(consent.validFrom <= ANCHOR && ANCHOR <= consent.validTo)
      }
    })

    it('bounds every read by asOf', async () => {
      for (const spec of PERSONAS) {
        for (const asOf of CLOCK_POSITIONS) {
          const { file } = await port.loadCustomerFile(
            spec.customer.cif,
            asOf,
            HISTORY_WINDOW_MONTHS,
          )
          assert.ok(
            file.transactions.every((t) => t.txnDate <= asOf),
            `${spec.slug} @ ${asOf}`,
          )
          const rows = await port.getTransactions(spec.customer.cif, {
            from: '2000-01-01',
            to: asOf,
          })
          assert.ok(rows.every((t) => t.txnDate <= asOf))
        }
      }
    })

    it('stamps provenance on every block', async () => {
      const { provenance } = await port.loadCustomerFile(
        PERSONAS[0]?.customer.cif ?? '',
        ANCHOR,
        HISTORY_WINDOW_MONTHS,
      )
      for (const block of ['PROFILE', 'ACCOUNTS', 'TXN', 'LIABILITIES', 'HOLDINGS'] as const) {
        assert.ok(['idbi', 'fixture', 'postgres', 'memory'].includes(provenance[block]), block)
      }
    })

    it('reproduces the generator to the rupee at six clock positions for every persona', async () => {
      for (const spec of PERSONAS) {
        for (const asOf of CLOCK_POSITIONS) {
          const expected = generateCustomerFile(spec, {
            anchor: ANCHOR,
            asOf,
            months: HISTORY_WINDOW_MONTHS,
          })
          const { file } = await port.loadCustomerFile(
            spec.customer.cif,
            asOf,
            HISTORY_WINDOW_MONTHS,
          )

          assert.deepEqual(file, expected, `${spec.slug} @ ${asOf}: customer file`)
          assert.deepEqual(
            derive(file, asOf),
            derive(expected, asOf),
            `${spec.slug} @ ${asOf}: snapshot`,
          )

          // The block reads agree with the whole-file read.
          assert.deepEqual(await port.getAccounts(spec.customer.cif, asOf), expected.accounts)
          assert.deepEqual(await port.getLiabilities(spec.customer.cif, asOf), expected.liabilities)
          const held = await port.getHoldings(spec.customer.cif, asOf)
          assert.deepEqual(held.holdings, expected.holdings)
          assert.deepEqual(held.policies, expected.policies)
        }
      }
    })

    it("rolls Rohan's education loan off the file once its five instalments have gone", async () => {
      const rohan = PERSONAS.find((p) => p.slug === 'rohan')
      assert.ok(rohan)
      const at = async (asOf: string): Promise<number> =>
        (await port.getLiabilities(rohan.customer.cif, asOf)).length
      assert.equal(await at(ANCHOR), 1)
      assert.equal(await at(addMonths(ANCHOR, 4)), 1)
      assert.equal(await at(addMonths(ANCHOR, 5)), 0)
    })

    it('refuses an unknown cif', async () => {
      await assert.rejects(port.getCustomer('IDBI0000000000'), /No customer/)
    })
  })
}

bankDataPortContract(
  'memory',
  () =>
    new InMemoryBankData(
      seedBundles({
        anchor: ANCHOR,
        historyMonths: HISTORY_WINDOW_MONTHS,
        forwardMonths: FORWARD_MONTHS,
      }),
      { generatorVersion: '@dhan/fixtures@test', ranAt: '2026-09-03T00:00:00.000Z' },
    ),
)

describe('the memory adapter as a seed source', () => {
  it('hashes the rows and reports no drift against a regeneration', async () => {
    const options = {
      anchor: ANCHOR,
      historyMonths: HISTORY_WINDOW_MONTHS,
      forwardMonths: FORWARD_MONTHS,
    }
    const bank = new InMemoryBankData(seedBundles(options), {
      generatorVersion: '@dhan/fixtures@test',
      ranAt: '2026-09-03T00:00:00.000Z',
      regenerate: () => seedBundles(options),
    })
    const provenance = await bank.provenance()
    assert.ok(provenance)
    assert.match(provenance.contentSha256, /^[0-9a-f]{64}$/)
    assert.equal(provenance.anchor, ANCHOR)
    assert.equal(provenance.horizonTo, addMonths(ANCHOR, FORWARD_MONTHS))
    const drift = await bank.drift()
    assert.equal(drift.checked, true)
    assert.equal(drift.ok, true)
  })
})
