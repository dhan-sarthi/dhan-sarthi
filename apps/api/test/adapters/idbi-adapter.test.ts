/**
 * The whole adapter, over the captured responses, with no network.
 *
 * This is the test the old offline sandbox could not be: that one *generated* the snake_case
 * block wire we had asked IDBI for, so passing it proved only that we could parse our own
 * invention. Here the transport replays IDBI's own forty-two bodies — including the three it
 * refused, with their real 400s — so a mapping that drifts fails here rather than on the one
 * machine that happens to be allow-listed.
 *
 * The figures asserted below were read off the live sandbox and match it to the paisa. That is
 * the point: if this file and the bank ever disagree, one of them has changed.
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { InMemoryDeclaredProfiles } from '../../src/adapters/memory/declared-profile.memory.ts'
import { IdbiSandboxBankData } from '../../src/adapters/idbi-sandbox/bank-data.idbi-sandbox.ts'
import { IdbiGateway } from '../../src/adapters/idbi-sandbox/api/gateway.ts'
import { IdbiTransport } from '../../src/adapters/idbi-sandbox/api/transport.ts'
import {
  REPLAY_BASE_URL,
  createReplayTransport,
} from '../../src/adapters/idbi-sandbox/api/replay.ts'
import { loadCapturedCalls } from '../../src/adapters/idbi-sandbox/api/captured.ts'
import { DECLARED_SEEDS } from '../../src/adapters/idbi-sandbox/api/customers.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import type { Account } from '@dhan/core'

const PRIYA = '98655854'
const NEHA = '88234567'
const clock = { now: () => new Date('2026-09-08T00:00:00.000Z') }

function build(): IdbiSandboxBankData {
  const replay = createReplayTransport({ captures: loadCapturedCalls() })
  const transport = new IdbiTransport({
    baseUrl: REPLAY_BASE_URL,
    fetch: replay.fetch,
    logger: silentLogger,
  })
  return new IdbiSandboxBankData({
    gateway: new IdbiGateway({ transport, logger: silentLogger }),
    profiles: new InMemoryDeclaredProfiles(DECLARED_SEEDS, clock),
    logger: silentLogger,
  })
}

describe('the IDBI adapter over the captured responses', () => {
  let bank: IdbiSandboxBankData

  before(() => {
    bank = build()
  })

  it('has captures to replay at all', () => {
    // A `dist` build has no `captured/` beside it, and the loader answers empty rather than
    // throwing. Asserting it here means this suite fails loudly instead of passing vacuously.
    assert.ok(loadCapturedCalls().length >= 42)
  })

  it('offers the customers the bank holds enough about to advise', async () => {
    const listed = await bank.listCustomers()
    assert.deepEqual(
      listed.map((c) => c.cif),
      [PRIYA, NEHA],
    )
    // Arjun is registered and not offered: 365 answers for him and nothing else does, so there
    // is no file to advise on and no date of birth to compute an age from.
    assert.ok(!listed.some((c) => c.name.includes('Arjun')))
  })

  it('discovers the window the bank actually holds rather than assuming one', async () => {
    // Twenty rows, one a day. A 2026 window answers zero rows, correctly, which is why this
    // cannot be inferred from today's date.
    assert.deepEqual(await bank.ledgerHorizon(PRIYA), { from: '2025-05-01', to: '2025-05-20' })
  })

  it('reads the account, the spendable floor and the lien', async () => {
    const accounts = await bank.getAccounts(PRIYA, '2025-05-20')
    assert.equal(accounts.length, 1)
    const account = accounts[0] as Account
    // Masked here, because IDBI sends the number in full while its own AA feed masks it.
    assert.equal(account.accountNumberMasked, 'XXXXXXXX0003')
    assert.equal(account.accountType, 'Savings')
    assert.equal(account.currentBalance, 56780.25)
    // EFFAVL as sent, never AVAIL less LIEN recomputed.
    assert.equal(account.effectiveAvailableBalance, 50780.25)
    assert.equal(account.lienAmount, 5000)
    assert.equal(account.accountOpeningDate, '2018-04-18')
    // IBKL, not IDIB: the prefix is IDBI's and a banker spots the wrong one immediately.
    assert.equal(account.branchIfsc, 'IBKL0000105')
  })

  it('reads all four of the other customer’s accounts, across both 365 fixture sets', async () => {
    const accounts = await bank.getAccounts(NEHA, '2025-07-19')
    assert.deepEqual(
      accounts.map((a) => [a.accountNumberMasked, a.accountType, a.currentBalance]),
      [
        ['XXXXXXXX0006', 'Savings', 72400],
        ['XXXXXXXX0007', 'Current', 250000],
        ['XXXXXXXX0008', 'FD', 500000],
        ['XXXXXXXX0009', 'Savings', 118000],
      ],
    )
  })

  it('drops the running balance, because it does not reconcile with the ledger', async () => {
    const txns = await bank.getTransactions(PRIYA, { from: '2025-05-01', to: '2025-05-20' })
    assert.equal(txns.length, 20)
    // The statement closes ~₹288,000 away from the ledger balance in the same payload, and
    // `derive()` would otherwise take the minimum of these as the twelve-month idle floor.
    assert.ok(txns.every((t) => t.balanceAfterTxn === null))
  })

  it('leaves 393’s rows honestly uncategorised, and marks the mode unknown', async () => {
    const txns = await bank.getTransactions(PRIYA, { from: '2025-05-01', to: '2025-05-20' })
    // `txnCat` is `TCI` on every row and the narrations are "S1 TXN n", so there is nothing to
    // read. UNKNOWN rather than the code map's NEFT fallback, which would be a fabrication.
    assert.ok(txns.every((t) => t.txnMode === 'UNKNOWN'))
    assert.ok(txns.every((t) => /^S1 TXN \d+$/.test(t.narration)))
    assert.deepEqual([...new Set(txns.map((t) => t.spendCategory))], ['Transfers'])
    assert.deepEqual(txns.map((t) => t.txnDate).slice(0, 3), [
      '2025-05-01',
      '2025-05-02',
      '2025-05-03',
    ])
  })

  it('reads a real payment mode off the consented feed, where 393 has none', async () => {
    // The customer with no own-bank statement. Her transactions can only come from a consented
    // pull, and that feed carries a mode on every row — which is the whole reason the
    // categoriser can run on one path and not the other.
    const txns = await bank.getTransactions(NEHA, { from: '2025-01-01', to: '2025-07-19' })
    assert.ok(txns.length >= 40)
    assert.ok(txns.every((t) => t.txnMode !== 'UNKNOWN'))
    assert.ok(new Set(txns.map((t) => t.txnMode)).size > 1)
  })

  it('reads the liabilities, and says which terms it could not find', async () => {
    const liabilities = await bank.getLiabilities(PRIYA, '2025-05-20')
    assert.equal(liabilities.length, 3)
    const total = liabilities.reduce((s, l) => s + l.outstandingPrincipal, 0)
    assert.equal(Math.round(total * 100) / 100, 4671486.83)
    // Only the primary account has 391 terms and only 433 carries an instalment, so the other
    // two are reported with an unknown EMI rather than an invented one.
    const priced = liabilities.filter((l) => l.emiAmount > 0)
    assert.equal(priced.length, 1)
    assert.equal(priced[0]?.emiAmount, 16800)
    assert.equal(priced[0]?.loanInterestRate, 8.75)
    assert.ok(liabilities.every((l) => l.dpdStatus === 0))
  })

  it('reads the customer, taking the date of birth from whichever source has one', async () => {
    // 433 holds Priya's record; it holds nobody else's, so Neha's comes from her consented pull.
    const priya = await bank.getCustomer(PRIYA)
    assert.equal(priya.dateOfBirth, '1995-06-20')
    assert.equal(priya.city, 'PUNE')
    assert.equal(priya.gender, 'Female')

    const neha = await bank.getCustomer(NEHA)
    assert.equal(neha.dateOfBirth, '1992-03-14')
  })

  it('reads the consent, and grants the holdings scope the bank does not own', async () => {
    const consent = await bank.getConsent(PRIYA)
    assert.equal(consent.consentId, 'CONSENT-0001')
    assert.equal(consent.status, 'ACTIVE')
    // HOLDINGS is included even though the AA consent covers deposits: that block is what the
    // customer told us, not what the bank hands over, and withholding it blanked a ₹7.2 lakh
    // portfolio and a ₹1 crore policy out of the file before the engine ever saw them.
    assert.deepEqual(consent.scopes.slice().sort(), [
      'ACCOUNTS',
      'HOLDINGS',
      'LIABILITIES',
      'PROFILE',
      'TXN',
    ])
  })

  it('reports a simulated clock, because the ledger stopped sixteen months ago', async () => {
    const described = bank.describe()
    assert.equal(described.source, 'idbi-sandbox')
    // Not a demo convenience: reporting today as today would leave every screen empty over a
    // feed whose last row is 2025-05-20.
    assert.equal(described.simulatedClock, true)
  })

  it('refuses holdings, and says why the bank cannot supply them', async () => {
    await assert.rejects(
      () => bank.getHoldings(),
      /no mutual fund, deposit-book or insurance endpoint/,
    )
  })

  it('answers a cif the bank does not hold with a not-found', async () => {
    await assert.rejects(() => bank.getAccounts('00000000', '2025-05-20'), /No customer with cif/)
  })
})
