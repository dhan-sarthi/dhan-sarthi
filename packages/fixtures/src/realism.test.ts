/**
 * The realism pass, as assertions.
 *
 * Two different things are checked here and they fail for different reasons.
 *
 * **Narration grammar.** Every line in every ledger has to match a declared template for its
 * rail, with reference numbers of the right shape and an IFSC that belongs to the right bank.
 * These are cheap, they are exact, and they catch the class of error that is invisible in a
 * summary and obvious to a banker — an `IDIB` prefix on an IDBI statement, a twelve-digit RRN
 * where a sixteen-character UTR belongs, a Kochi customer being billed by Indore's discom.
 *
 * **Emergent statistics.** Ticket sizes, the share of payments under ₹500 and how many UPI
 * debits a month an account carries are not written anywhere in the generator; they fall out of
 * merchant weights, envelope sizes and a Gamma draw. So they are exactly the thing that breaks
 * silently when somebody edits a weight, and the bands in `calibration.ts` are what say so.
 *
 * A failure here is not necessarily a bug. It may be that a persona changed and the band needs
 * to move — but then it is moved deliberately, with the published figure beside it, rather than
 * drifting.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { categorize, coverage, disagreements, seriesKey } from '@dhan/core'
import type { Transaction } from '@dhan/core'
import { bankGeneratedLines } from './bank-lines.ts'
import type { LedgerRow } from './bank-lines.ts'
import { addMonths, monthKey } from './calendar.ts'
import {
  BANK_CHARGES,
  CITIES,
  IDBI_IFSC_PREFIX,
  MCC,
  UPI_CALIBRATION,
  cityProfile,
} from './calibration.ts'
import { generateCustomerFile, generateLedger } from './generate.ts'
import { billersFor, DISCRETIONARY } from './merchants.ts'
import { achLoan, achSip, neftSalary, rrn, umrn } from './narration.ts'
import { PERSONAS, ROHAN, SUNIL } from './personas.ts'
import { rng } from './random.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/
const RRN = /^\d{12}$/
const UTR = /^[A-Z0-9]{16}$/

/**
 * Every narration form the generator is allowed to emit.
 *
 * A line that matches none of these is either a rail we invented or a template somebody changed
 * without saying so, and both are the same failure: a statement a bank would not produce.
 */
const TEMPLATES: readonly { name: string; pattern: RegExp }[] = [
  { name: 'UPI P2M/P2A debit', pattern: /^UPI\/DR\/\d{12}\/[^/]+\/[A-Z]{4}\/[^/]+\/[^/]+$/ },
  { name: 'UPI credit', pattern: /^UPI\/CR\/\d{12}\/[^/]+\/[A-Z]{4}\/[^/]+\/[^/]+$/ },
  { name: 'IMPS P2A', pattern: /^IMPS\/P2A\/\d{12}\/[^/]+\/[A-Z]{4}0[A-Z0-9]{6}\/[^/]+$/ },
  {
    name: 'NEFT inward',
    pattern:
      /^NEFT\/[A-Z0-9]{16}\/[^/]+\/[A-Z]{4}0[A-Z0-9]{6}\/(SALARY [A-Z]{3} \d{4}|SETTLEMENT)$/,
  },
  { name: 'NEFT outward', pattern: /^NEFT\/DR\/[^/]+\/[A-Z]{4}0[A-Z0-9]{6}\/[^/]+$/ },
  { name: 'NACH mandate', pattern: /^ACH-DR-[^-]+-[A-Z0-9]{20}-\d{2}-\d{2}-\d{4}$/ },
  { name: 'NACH premium', pattern: /^ACH\/D\/[^/]+\/PREMIUM\/\d+$/ },
  { name: 'standing instruction', pattern: /^SI\/[A-Z0-9 ]+\/AUTOPAY$/ },
  { name: 'BBPS bill', pattern: /^BIL\/BBPS\/[^/]+\/\d{9}\/BBPS\d{10}$/ },
  { name: 'card at a terminal', pattern: /^POS 4X{11}\d{4} .+$/ },
  { name: 'card online', pattern: /^ECOM 4X{11}\d{4} .+$/ },
  { name: 'card bill payment', pattern: /^CreditCard Payment XX \d{4} Ref#[A-Z0-9]{13}$/ },
  {
    name: 'other-bank ATM',
    pattern: /^NFS\/CASH WDL\/\d{12}\/[A-Z]{4}\d{4}\/[^/]+\/\d{2}-\d{2}-\d{2}$/,
  },
  { name: 'IDBI ATM', pattern: /^ATW\/ATM CASH\/IDBI ATM [^/]+\/\d{12}$/ },
  { name: 'cash deposit', pattern: /^CDM\/CASH DEP\/[^/]+\/\d{12}$/ },
  { name: 'savings interest', pattern: /^SB INT CR \d{2}-\d{2}-\d{4} TO \d{2}-\d{2}-\d{4}$/ },
  { name: 'SMS alert charge', pattern: /^SMS ALERT CHGS \d+ MSG \d{2}-\d{2}-\d{4}$/ },
  { name: 'minimum balance charge', pattern: /^MIN BAL CHGS [A-Z]{3} \d{4}$/ },
  { name: 'NACH return charge', pattern: /^NACH RETURN CHGS \d{2}-\d{2}-\d{4}$/ },
  { name: 'GST', pattern: /^GST @18% ON .+ \d{2}-\d{2}-\d{4}$/ },
]

const ledgers = (): { slug: string; txns: Transaction[] }[] =>
  PERSONAS.map((spec) => ({ slug: spec.slug, txns: generateLedger(spec, OPTS) }))

describe('narration grammar', () => {
  it('emits nothing that is not a declared template', () => {
    for (const { slug, txns } of ledgers()) {
      for (const t of txns) {
        const matched = TEMPLATES.some((tpl) => tpl.pattern.test(t.narration))
        assert.ok(matched, `${slug}: no template matches "${t.narration}"`)
      }
    }
  })

  it('exercises every rail on at least one persona', () => {
    // A template nobody emits is a template nobody has checked. This is what catches a rail
    // being quietly dropped from the generator while its regex stays in this file.
    //
    // The minimum-balance charge is the one exception, and deliberately: none of these four
    // ever runs an account thin enough to be charged one, and forcing a persona below ₹10,000
    // to exercise a template would be inventing behaviour to satisfy a test. It is proved
    // directly against `bankGeneratedLines` further down instead.
    const exempt = new Set(['minimum balance charge'])
    const all = ledgers().flatMap((l) => l.txns)

    for (const tpl of TEMPLATES) {
      if (exempt.has(tpl.name)) continue
      assert.ok(
        all.some((t) => tpl.pattern.test(t.narration)),
        `no generated line matches the ${tpl.name} template`,
      )
    }
  })

  it('never stamps another bank’s IFSC prefix on an IDBI account', () => {
    // `IDIB` is Indian Bank's. The salary line carried it for months, on the receiving side of
    // an inward credit, which is wrong twice over.
    for (const { slug, txns } of ledgers()) {
      for (const t of txns) {
        assert.ok(!t.narration.includes('IDIB'), `${slug}: ${t.narration}`)
      }
    }

    for (const spec of PERSONAS) {
      const file = generateCustomerFile(spec, OPTS)
      for (const account of file.accounts) {
        assert.ok(account.branchIfsc, `${spec.slug}: no branch IFSC on ${account.accountType}`)
        assert.match(account.branchIfsc, IFSC)

        // An account held at another bank carries that bank's prefix, and must: stamping
        // IBKL on an HDFC account would be the same error in the other direction. What has
        // to hold is that the prefix agrees with the institution the account says it is at.
        const prefix = account.institution?.ifscPrefix ?? IDBI_IFSC_PREFIX
        assert.ok(
          account.branchIfsc.startsWith(prefix),
          `${spec.slug}: ${account.branchIfsc} is not a ${account.institution?.name ?? 'IDBI'} branch`,
        )
      }
    }
  })

  it('remits every salary from the employer’s bank, never from IDBI', () => {
    for (const spec of PERSONAS) {
      if (spec.income.splits > 1) continue
      const salary = generateLedger(spec, OPTS).filter((t) => t.isSalaryCredit)
      assert.ok(salary.length >= 20, `${spec.slug}: only ${salary.length} salary credits`)

      for (const t of salary) {
        const parts = t.narration.split('/')
        assert.match(parts[1] ?? '', UTR)
        assert.equal(parts[3], spec.employer.ifsc)
        assert.notEqual(parts[3]?.slice(0, 4), IDBI_IFSC_PREFIX)
      }
    }
  })

  it('shapes a reference number so it decodes back to its own date', () => {
    // An RRN is the last digit of the year, the day of the year and an eight-digit switch
    // trace. A reviewer who decomposes one finds the transaction's date, which is the second
    // thing anybody checks after the format.
    const r = rng(1).fork('probe')
    const reference = rrn(r, '2026-02-06')
    assert.match(reference, RRN)
    assert.equal(reference.slice(0, 4), '6037')

    assert.match(umrn(r, 'IBKL'), /^IBKL[A-Z0-9]{16}$/)
    assert.match(
      neftSalary(r, { date: '2026-08-01', employer: 'Acme', ifsc: 'HDFC0000523' }),
      /^NEFT\/HDFCN26213\d{6}\/ACME\/HDFC0000523\/SALARY AUG 2026$/,
    )
  })

  it('writes both NACH mandate forms the clearing houses actually use', () => {
    // Only one of the two appears in the ledgers — Rohan is the persona with a SIP — so the
    // other is checked against its builder rather than left untested.
    const ref = umrn(rng(2).fork('probe'), 'UTIB')
    assert.match(
      achSip({ clearer: 'NSEClearingLimited', mandateRef: ref, date: '2026-04-14' }),
      /^ACH-DR-NSEClearingLimited-[A-Z0-9]{20}-14-04-2026$/,
    )
    assert.match(
      achLoan({ lender: 'BAJAJ FINANCE LTD', mandateRef: ref, date: '2026-04-05' }),
      /^ACH-DR-BAJAJ FINANCE LTD-[A-Z0-9]{20}-05-04-2026$/,
    )
  })

  it('gives every statement line a value date the bank could defend', () => {
    for (const { slug, txns } of ledgers()) {
      for (const t of txns) {
        assert.match(t.valueDate, /^\d{4}-\d{2}-\d{2}$/, `${slug}: ${t.narration}`)
        // Value before posting is ordinary — a card settles the day after the purchase, a
        // charge is back-valued to the period it belongs to. Value *after* posting is not.
        assert.ok(t.valueDate <= t.txnDate, `${slug}: ${t.narration} is value-dated forward`)
        if (t.txnMode === 'CARD') assert.notEqual(t.valueDate, t.txnDate)
        else if (t.spendCategory !== 'Fees & charges') assert.equal(t.valueDate, t.txnDate)
      }
    }
  })

  it('carries the rail’s own reference as the statement id where there is one', () => {
    for (const { slug, txns } of ledgers()) {
      const ids = new Set<string>()
      for (const t of txns) {
        assert.ok(!ids.has(t.txnId), `${slug}: duplicate reference ${t.txnId}`)
        ids.add(t.txnId)
        // `S########` is Finacle's, which is IDBI's core. An account at another bank has its
        // own sequence and no reason to look like Finacle — so a four-letter bank prefix is
        // the third legal shape, and it is the sending bank's own.
        assert.ok(
          RRN.test(t.txnId) || UTR.test(t.txnId) || /^[A-Z]{1,4}\d{8}$/.test(t.txnId),
          `${slug}: ${t.txnId} is not an RRN, a UTR or a bank's own sequence`,
        )
      }
    }
  })
})

describe('the fields the real feed carries', () => {
  it('puts an MCC on every merchant line and on none of the others', () => {
    for (const { slug, txns } of ledgers()) {
      for (const t of txns) {
        const isMerchant =
          /^(POS|ECOM) 4X{11}\d{4}/.test(t.narration) ||
          /^BIL\/BBPS\//.test(t.narration) ||
          (/^UPI\/DR\//.test(t.narration) && t.spendCategory !== 'Transfers')

        if (isMerchant) assert.ok(t.mccCode, `${slug}: no MCC on "${t.narration}"`)
        else assert.equal(t.mccCode, undefined, `${slug}: unexpected MCC on "${t.narration}"`)

        if (t.mccCode) assert.match(t.mccCode, /^\d{4}$/)
      }
    }
  })

  it('puts a VPA on UPI merchant lines and a merchant name on only some of them', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const upi = txns.filter((t) => t.narration.startsWith('UPI/DR/') && t.mccCode !== undefined)
    assert.ok(upi.every((t) => t.counterpartyVpa?.includes('@')))

    // Deliberately partial. The bank sends a merchant name on some UPI lines and not others,
    // and an enricher that has only ever seen the enriched half is one that has not been tested.
    const named = upi.filter((t) => t.merchantName !== undefined).length / upi.length
    assert.ok(named > 0.2 && named < 0.7, `${(named * 100).toFixed(0)}% of UPI lines are named`)

    // Every card line carries one, because the acquirer always sends it.
    const card = txns.filter((t) => t.txnMode === 'CARD')
    assert.ok(card.every((t) => t.merchantName !== undefined))
  })

  it('gives each persona a masked account number of their own', () => {
    const masked = PERSONAS.map((p) => p.accountNumberMasked)
    assert.equal(new Set(masked).size, masked.length, 'two personas share a masked account number')
    for (const value of masked) assert.match(value, /^X{12}\d{4}$/)
  })
})

describe('city correctness', () => {
  it('bills each persona by the utilities that actually operate in their city', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const bills = txns.filter((t) => t.narration.startsWith('BIL/BBPS/'))
      const expected = new Set(billersFor(spec.customer.city).map((b) => b.biller))

      for (const t of bills) {
        const biller = t.narration.split('/')[2]
        assert.ok(biller && expected.has(biller), `${spec.slug}: billed by ${biller}`)
      }

      /*
       * And by nobody else's. An Indore discom on a Kochi statement is the fastest way to be
       * caught, and it is not a figure anybody has to add up to notice.
       *
       * Compared only against discoms that are *exclusive* to another city, because a real
       * one need not be: MSEDCL bills the whole of Maharashtra, so it is on both the Pune and
       * the Nagpur statement and that is correct. The claim this makes is "a discom that does
       * not operate here", which is the claim a banker would actually test.
       */
      const own = CITIES[spec.customer.city]?.electricity.biller
      const served = new Set(
        Object.entries(CITIES)
          .filter(([city]) => city === spec.customer.city)
          .map(([, p]) => p.electricity.biller),
      )
      for (const [city, profile] of Object.entries(CITIES)) {
        if (city === spec.customer.city) continue
        if (served.has(profile.electricity.biller) || profile.electricity.biller === own) continue
        for (const t of txns) {
          assert.ok(
            !t.narration.includes(profile.electricity.biller),
            `${spec.slug} in ${spec.customer.city} was billed by ${city}'s discom`,
          )
        }
      }
    }
  })

  it('keeps a persona’s local merchants inside their own city', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const foreign = Object.values(DISCRETIONARY)
        .flat()
        .filter((x) => x.city !== undefined && x.city !== spec.customer.city)

      for (const merchant of foreign) {
        assert.ok(
          !txns.some((t) => t.narration.toUpperCase().includes(merchant.name.toUpperCase())),
          `${spec.slug} shopped at ${merchant.name}, which is in ${merchant.city}`,
        )
      }
    }
  })

  it('withdraws cash in a locality of the persona’s own city', () => {
    for (const spec of PERSONAS) {
      const localities = new Set(cityProfile(spec.customer.city).localities)
      const cash = generateLedger(spec, OPTS).filter((t) => t.spendCategory === 'Cash')
      assert.ok(cash.length > 5, `${spec.slug}: only ${cash.length} cash withdrawals`)

      for (const t of cash) {
        const found = [...localities].some((l) => t.narration.includes(l))
        assert.ok(found, `${spec.slug}: withdrew at "${t.narration}"`)
      }
    }
  })

  it('moves money on the festival dates that year, in the cities that keep them', () => {
    // Onam empties a Kochi account in late August 2026 and does nothing at all in Nagpur. A
    // fixed "late October is Diwali" window put the spike in the wrong month half the time.
    const spend = (slug: string, from: string, to: string): number =>
      generateLedger(PERSONAS.find((p) => p.slug === slug) ?? ROHAN, OPTS)
        .filter(
          (t) => t.txnType === 'DEBIT' && !t.isRecurring && t.txnDate >= from && t.txnDate <= to,
        )
        .reduce((s, t) => s + t.txnAmount, 0)

    // Thiruvonam 2026 falls on 26 August; the window opens ten days before.
    const onam = spend('priya', '2026-08-16', '2026-08-26')
    const ordinary = spend('priya', '2026-07-16', '2026-07-26')
    assert.ok(onam > ordinary * 1.2, `Onam ₹${onam} against an ordinary ₹${ordinary}`)

    // Diwali 2025 was 20 October, nineteen days earlier than in 2026. A window pinned to the
    // calendar rather than to the festival gets one of those two years wrong.
    const diwali2025 = spend('rohan', '2025-10-08', '2025-10-23')
    const before2025 = spend('rohan', '2025-09-08', '2025-09-23')
    assert.ok(diwali2025 > before2025 * 1.2, `Diwali ₹${diwali2025} against ₹${before2025}`)
  })
})

describe('the lines the bank writes', () => {
  it('credits interest every quarter at the slab rates', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const interest = txns.filter((t) => t.narration.startsWith('SB INT CR'))
    assert.ok(interest.length >= 7, `only ${interest.length} interest credits in two years`)

    for (const t of interest) {
      assert.equal(t.txnType, 'CREDIT')
      // RBI's Master Direction rounds savings interest to the nearest rupee, which is why this
      // is the one line in the ledger that never carries paise.
      assert.equal(t.txnAmount, Math.round(t.txnAmount))
      assert.ok(t.txnAmount > 0)
    }

    // A balance of roughly ₹2 lakh at 2.5–2.55% earns something in the low four figures a
    // quarter. An order of magnitude either side means the slab arithmetic is wrong.
    const last = interest[interest.length - 1]
    assert.ok(last && last.txnAmount > 400 && last.txnAmount < 3_000, `₹${last?.txnAmount}`)
  })

  it('charges for SMS alerts and bills the GST as its own line', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const fee = txns.filter((t) => t.narration.startsWith('SMS ALERT CHGS'))
    const gst = txns.filter((t) => t.narration.startsWith('GST @18% ON SMS ALERT CHGS'))
    assert.equal(fee.length, gst.length, 'every charge needs its own GST line')
    assert.ok(fee.length >= 7)

    for (let i = 0; i < fee.length; i += 1) {
      const charge = fee[i]
      const tax = gst[i]
      assert.ok(charge && tax)
      assert.equal(charge.spendCategory, 'Fees & charges')
      assert.equal(tax.txnDate, charge.txnDate)
      assert.equal(Math.round(tax.txnAmount * 100), Math.round(charge.txnAmount * 18))
    }
  })

  it('debits both government covers in May and holds the policies that match', () => {
    const txns = generateLedger(SUNIL, OPTS)
    const pmjjby = txns.filter((t) => t.narration.includes('PMJJBY'))
    const pmsby = txns.filter((t) => t.narration.includes('PMSBY'))

    assert.ok(pmjjby.length >= 2 && pmsby.length >= 2)
    for (const t of [...pmjjby, ...pmsby]) {
      assert.equal(t.txnDate.slice(5, 7), '05')
      assert.equal(t.spendCategory, 'Insurance')
    }
    assert.equal(pmjjby[0]?.txnAmount, 436)
    assert.equal(pmsby[0]?.txnAmount, 20)

    // The statement and the protection register have to agree with each other.
    const file = generateCustomerFile(SUNIL, OPTS)
    assert.equal(file.policies.length, 2)

    // And Rohan's must not: his whole story is that nothing is in force.
    assert.equal(generateCustomerFile(ROHAN, OPTS).policies.length, 0)
    assert.ok(!generateLedger(ROHAN, OPTS).some((t) => t.narration.includes('PMJJBY')))
  })

  it('charges for the mandate that came back, in the month it came back', () => {
    /*
     * Every persona carrying a returned mandate, not Sunil alone. Naming one persona is how
     * Karan's car loan spent six months telling two different stories at once — a return charge
     * and a hand-paid instalment in his ledger, `dpdStatus: 0` on his liability record — while
     * this test stayed green because it never looked at him. A loop over the condition rather
     * than over a name is what makes the next persona to carry one arrive already checked.
     */
    const withReturn = PERSONAS.filter((p) => p.emis.some((e) => e.returnedMonthsAgo !== undefined))
    assert.ok(withReturn.length >= 2, 'the returned mandate is meant to be more than one story')

    for (const spec of withReturn) {
      const returned = spec.emis.find((e) => e.returnedMonthsAgo !== undefined)
      assert.ok(returned?.returnedMonthsAgo !== undefined)

      const txns = generateLedger(spec, OPTS)
      const month = monthKey(addMonths(ASOF, -returned.returnedMonthsAgo))

      const charge = txns.filter((t) => t.narration.startsWith('NACH RETURN CHGS'))
      assert.equal(charge.length, 1, `${spec.slug} was charged for the return ${charge.length}x`)
      assert.equal(charge[0]?.txnAmount, 300)
      assert.equal(charge[0]?.txnDate.slice(0, 7), month)

      // The instalment still leaves the account, twelve days late and by hand. That is what a
      // DPD of 12 looks like on a statement rather than only on a liability record.
      const late = txns.filter((t) => t.narration.includes('LATE EMI'))
      assert.equal(late.length, 1, `${spec.slug} settled the returned instalment ${late.length}x`)
      assert.equal(late[0]?.txnAmount, returned.amount)
      assert.equal(late[0]?.txnDate.slice(0, 7), month)

      /*
       * And the liability record has to say the same thing the statement does. Nothing
       * downstream reads the ledger for this — `derive.ts:596` is
       * `file.liabilities.some((l) => l.dpdStatus > 0)` — so a spec that declares the bounce
       * and omits `dpd` prices the customer as spotless on every screen derived from it while
       * his own statement prices him as delinquent. That is the drift this line catches.
       */
      assert.ok(
        returned.dpd !== undefined && returned.dpd > 0,
        `${spec.slug}'s mandate came back and his liability record still reads no days past due`,
      )
    }
  })

  it('charges a minimum-balance shortfall only where the account really ran thin', () => {
    // None of the four personas is a minimum-balance customer — every account opens in five
    // figures or better (Rohan's ₹22,000 is the thinnest, Karan's ₹8,09,891 the fattest) and
    // the generator never runs one thin — so none of them is charged, and that is the right
    // answer rather than a gap. The charge is proved against the balances instead, on a ledger
    // thin enough to earn one.
    for (const { slug, txns } of ledgers()) {
      assert.ok(
        !txns.some((t) => t.narration.startsWith('MIN BAL CHGS')),
        `${slug} was charged a minimum-balance fee while never running the account thin`,
      )
    }

    const thin: LedgerRow[] = []
    for (let month = 10; month <= 12; month += 1) {
      // Paid in, spent down to almost nothing, twice over. A monthly average well under
      // ₹10,000 with a balance that is never negative: exactly the customer the charge is for.
      thin.push({ date: `2024-${month}-01`, amount: 9_000, type: 'CREDIT' })
      thin.push({ date: `2024-${month}-04`, amount: 8_500, type: 'DEBIT' })
    }

    const lines = bankGeneratedLines(thin, {
      from: '2024-10-01',
      // Into January, because the charge for a month that fell short is collected in the one
      // after it — which is also how it appears on a real statement.
      to: '2025-01-31',
      openingBalance: 1_000,
      govtCover: [],
      coverReference: '500110000001',
      nachReturnOn: null,
    })

    const charge = lines.find((l) => l.narration.startsWith('MIN BAL CHGS'))
    const gst = lines.find((l) => l.narration.startsWith('GST @18% ON MIN BAL CHGS'))
    assert.ok(charge, 'a month spent below the minimum average balance was not charged')
    assert.ok(gst, 'the charge came without its GST line')

    // 6% of the shortfall, capped. On a balance near zero the shortfall is the whole ₹10,000,
    // so this is the cap — and the cap is the reason the charge is survivable rather than
    // punitive, which is a fact worth pinning.
    assert.equal(charge.amount, BANK_CHARGES.mabShortfallCap)
    assert.equal(gst.amount, Math.round(BANK_CHARGES.mabShortfallCap * 0.18 * 100) / 100)
    // Back-valued to the month that fell short, collected in the one after it.
    assert.ok(charge.valueDate < charge.date)

    // And never in the first month: the schedule of fees allows a month's grace, and the ledger
    // cannot see far enough back to know what the month before it looked like anyway.
    assert.ok(lines.every((l) => !l.narration.includes('OCT 2024')))
  })
})

describe('calibration', () => {
  const stats = (txns: readonly Transaction[]) => {
    const months = new Set(txns.map((t) => t.txnDate.slice(0, 7))).size
    const upiDebits = txns.filter((t) => t.txnType === 'DEBIT' && t.txnMode === 'UPI')
    const p2m = upiDebits.filter(
      (t) => t.narration.startsWith('UPI/DR/') && t.mccCode !== undefined,
    )
    const total = p2m.reduce((s, t) => s + t.txnAmount, 0)
    return {
      months,
      debitsPerMonth: upiDebits.length / months,
      ticketMean: total / p2m.length,
      shareBelow500: p2m.filter((t) => t.txnAmount < 500).length / p2m.length,
    }
  }

  it('lands every persona inside the published bands', () => {
    const [minCount, maxCount] = UPI_CALIBRATION.debitsPerMonthBand
    const [minMean, maxMean] = UPI_CALIBRATION.p2mTicketMeanBand
    const [minShare, maxShare] = UPI_CALIBRATION.p2mShareBelow500Band

    for (const { slug, txns } of ledgers()) {
      const s = stats(txns)
      assert.ok(
        s.debitsPerMonth >= minCount && s.debitsPerMonth <= maxCount,
        `${slug}: ${s.debitsPerMonth.toFixed(1)} UPI debits a month, band ${minCount}-${maxCount}`,
      )
      assert.ok(
        s.ticketMean >= minMean && s.ticketMean <= maxMean,
        `${slug}: mean ticket ₹${s.ticketMean.toFixed(0)}, band ₹${minMean}-₹${maxMean}`,
      )
      assert.ok(
        s.shareBelow500 >= minShare && s.shareBelow500 <= maxShare,
        `${slug}: ${(s.shareBelow500 * 100).toFixed(1)}% under ₹500, band ${minShare}-${maxShare}`,
      )
    }
  })

  it('keeps the ticket distribution skewed, not symmetric', () => {
    // The property that makes both published figures reachable at once. If the median ever
    // creeps up to the mean, a uniform draw has crept back in and the "85% are small" fact
    // stops being reproducible however the weights are tuned.
    for (const { slug, txns } of ledgers()) {
      const amounts = txns
        .filter((t) => t.narration.startsWith('UPI/DR/') && t.mccCode !== undefined)
        .map((t) => t.txnAmount)
        .sort((a, b) => a - b)
      const median = amounts[Math.floor(amounts.length / 2)] ?? 0
      const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length
      assert.ok(median < mean * 0.7, `${slug}: median ₹${median} against mean ₹${mean.toFixed(0)}`)
    }
  })

  it('keeps a single merchant from swallowing a category', () => {
    // A pool with one usable merchant in it produces twenty-two orders a month from the same
    // shop, which reads as synthetic long before any statistic does.
    for (const { slug, txns } of ledgers()) {
      const months = new Set(txns.map((t) => t.txnDate.slice(0, 7))).size
      const byKey = new Map<string, number>()
      for (const t of txns) {
        if (t.isRecurring || t.txnType === 'CREDIT') continue
        const key = seriesKey(t.narration)
        byKey.set(key, (byKey.get(key) ?? 0) + 1)
      }
      for (const [key, count] of byKey) {
        assert.ok(count / months < 8, `${slug}: ${key} appears ${(count / months).toFixed(1)}x/mo`)
      }
    }
  })

  it('still recognises what it generates, and still agrees with the bank', () => {
    // The dictionary and the generator are separate tables on purpose, so this is not proof the
    // enrichment is good — it is proof that no new narration form has quietly become
    // unreadable, which is the risk every time a rail's grammar changes.
    for (const { slug, txns } of ledgers()) {
      assert.deepEqual(
        disagreements(txns).map((d) => `${d.narration} ${d.ours}!=${d.bank}`),
        [],
        slug,
      )
      const c = coverage(txns)
      assert.ok(c.rate > 0.98, `${slug}: coverage ${(c.rate * 100).toFixed(1)}%`)
    }
  })

  it('names the merchant behind a line rather than the rail it arrived on', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const bill = txns.find((t) => t.narration.includes('MPPKVVCL'))
    assert.ok(bill)
    assert.equal(categorize(bill).merchant, 'Electricity')
    assert.equal(bill.mccCode, MCC.utilities)

    const emi = txns.find((t) => t.narration.startsWith('ACH-DR-IDBI BANK RETAIL ASSETS'))
    assert.ok(emi)
    assert.equal(categorize(emi).category, 'Loan EMI')

    const sip = txns.find((t) => t.narration.startsWith('ACH-DR-INDIAN CLEARING CORP'))
    assert.ok(sip)
    assert.equal(categorize(sip).category, 'Investment')
  })
})

describe('bill payments', () => {
  it('quotes one consumer number per biller, unchanged while the amount moves', () => {
    for (const spec of PERSONAS) {
      const bills = generateLedger(spec, OPTS).filter((t) => t.narration.startsWith('BIL/BBPS/'))
      const byBiller = new Map<string, Set<string>>()
      const amounts = new Map<string, Set<number>>()

      for (const t of bills) {
        const [, , biller, consumer] = t.narration.split('/')
        if (!biller || !consumer) continue
        byBiller.set(biller, (byBiller.get(biller) ?? new Set()).add(consumer))
        amounts.set(biller, (amounts.get(biller) ?? new Set()).add(t.txnAmount))
      }

      for (const [biller, consumers] of byBiller) {
        assert.equal(consumers.size, 1, `${spec.slug}: ${biller} has ${consumers.size} accounts`)
      }

      // And a metered bill is never the same amount twice, which is what separates it from a
      // subscription and the whole reason recurring detection has two reason codes.
      const metered = cityProfile(spec.customer.city).electricity.biller
      assert.ok((amounts.get(metered)?.size ?? 0) > 5, `${spec.slug}: ${metered} never varies`)
    }
  })

  it('bills a cylinder every other month where the city has no piped gas', () => {
    const nagpur = generateLedger(SUNIL, OPTS).filter((t) => t.narration.includes('INDANE GAS'))
    const rohan = generateLedger(ROHAN, OPTS).filter((t) => t.narration.includes('AVANTIKA GAS'))
    assert.ok(
      nagpur.length < rohan.length * 0.7,
      `a cylinder is not a monthly bill: ${nagpur.length} against ${rohan.length}`,
    )
  })
})

describe('the shape of a statement', () => {
  it('puts paise where a bank puts paise, and nowhere else', () => {
    for (const { slug, txns } of ledgers()) {
      for (const t of txns) {
        const hasPaise = Math.round(t.txnAmount * 100) % 100 !== 0
        if (!hasPaise) continue
        // Metered bills and charges carry paise. A UPI payment to a merchant does not, and a
        // ₹203.34 chai is the kind of detail that reads as generated.
        const allowed = t.narration.startsWith('BIL/BBPS/') || t.spendCategory === 'Fees & charges'
        assert.ok(allowed, `${slug}: paise on "${t.narration}" (₹${t.txnAmount})`)
      }
    }
  })

  it('keeps every narration short enough for a statement column', () => {
    for (const { slug, txns } of ledgers()) {
      for (const t of txns) {
        assert.ok(t.narration.length <= 100, `${slug}: ${t.narration.length} chars`)
      }
    }
  })
})
