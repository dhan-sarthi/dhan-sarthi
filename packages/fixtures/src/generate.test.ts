import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { derive } from '@dhan/core'
import { addMonths, monthKey } from './calendar.ts'
import { generateCustomerFile, generateForward, generateLedger } from './generate.ts'
import { PERSONAS, PRIYA, ROHAN, SUNIL } from './personas.ts'
import { summarise } from './summary.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

describe('determinism', () => {
  it('produces an identical ledger from the same seed', () => {
    const a = generateLedger(ROHAN, OPTS)
    const b = generateLedger(ROHAN, OPTS)
    assert.deepEqual(a, b)
  })

  it('produces different ledgers for different personas', () => {
    const a = generateLedger(ROHAN, OPTS)
    const b = generateLedger(PRIYA, OPTS)
    assert.notEqual(a[0]?.narration, b[0]?.narration)
  })
})

describe('the running balance', () => {
  it('is continuous — every balance is the previous one plus the movement', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)

      // Carried in paise, because utilities, charges and GST arrive with paise on them and a
      // running balance accumulated in floating-point rupees stops being exactly equal to the
      // previous one plus the movement somewhere around the thousandth row.
      let paise = Math.round(spec.openingBalance * 100)

      for (const t of txns) {
        paise += (t.txnType === 'CREDIT' ? 1 : -1) * Math.round(t.txnAmount * 100)
        assert.equal(
          t.balanceAfterTxn,
          paise / 100,
          `${spec.slug}: balance broke at ${t.txnId} (${t.narration})`,
        )
      }
    }
  })

  it('never goes negative', () => {
    // A savings balance below zero is not a small cosmetic problem: it is an impossible
    // statement on screen, and it means the persona's spec spends money it never had. Cheap
    // to assert, and it catches an incoherent persona the moment someone edits one.
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const floor = Math.min(...txns.map((t) => t.balanceAfterTxn ?? 0))
      assert.ok(floor >= 0, `${spec.slug}: balance reached ₹${floor}`)
    }
  })

  it('never lets the salary be spent before it arrives', () => {
    // Intra-day ordering exists for this. A card swipe ranked before the credit that funded
    // it produces a balance no statement would ever show.
    const txns = generateLedger(ROHAN, OPTS)
    const firstOfMonth = txns.filter((t) => t.txnDate.endsWith('-01'))
    for (const t of firstOfMonth) {
      if (t.isSalaryCredit) continue
      const salary = txns.find((s) => s.txnDate === t.txnDate && s.isSalaryCredit)
      if (salary) assert.ok(txns.indexOf(salary) < txns.indexOf(t))
    }
  })
})

describe('the window', () => {
  it('ends at asOf and spans the requested months', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const last = txns[txns.length - 1]
    const first = txns[0]
    assert.ok(last && first)
    assert.ok(last.txnDate <= ASOF)
    assert.ok(first.txnDate >= addMonths(ASOF, -24))

    const months = new Set(txns.map((t) => monthKey(t.txnDate)))
    assert.ok(months.size >= 23, `expected ~24 months of history, got ${months.size}`)
  })

  it('produces enough history for a pattern to exist at all', () => {
    // Every insight we want needs repetition to be visible in. A forgotten subscription is
    // only detectable because there are sixteen identical charges.
    const txns = generateLedger(ROHAN, OPTS)
    assert.ok(txns.length > 800, `only ${txns.length} transactions — too sparse to reason over`)
  })
})

describe('the time machine', () => {
  it('reveals the future the ledger always had, not a second ledger', () => {
    // The property the whole demo control rests on: days generated live when a judge advances
    // the clock must equal the days that month produces as history. If these diverge, a judge
    // who steps off the script sees the seam.
    const laterAsOf = addMonths(ASOF, 2)
    const history = generateLedger(ROHAN, { ...OPTS, asOf: laterAsOf, months: 26 })
    const revealed = history.filter((t) => t.txnDate > ASOF)

    const forward = generateForward(ROHAN, ASOF, laterAsOf, 0, { anchor: ASOF })

    const shape = (t: { txnDate: string; txnAmount: number; narration: string }) =>
      `${t.txnDate}|${t.txnAmount}|${t.narration}`
    assert.deepEqual(forward.map(shape), revealed.map(shape))
  })

  it('does not rewrite history when the clock advances', () => {
    const before = generateLedger(ROHAN, OPTS)
    const after = generateLedger(ROHAN, { ...OPTS, asOf: addMonths(ASOF, 3) })
    const overlap = after.filter((t) => t.txnDate <= ASOF)

    const shape = (t: { txnDate: string; txnAmount: number; narration: string }) =>
      `${t.txnDate}|${t.txnAmount}|${t.narration}`
    assert.deepEqual(overlap.map(shape), before.map(shape))
  })

  it('actually ends the education loan, rather than only saying it will', () => {
    // ROHAN has five instalments left. Advance six months and the EMI must be gone from both
    // the ledger and the liability list — that is what frees up ₹8,200 a month.
    const after = generateCustomerFile(ROHAN, {
      anchor: ASOF,
      asOf: addMonths(ASOF, 6),
      months: 30,
    })
    const emis = after.transactions.filter(
      (t) => t.spendCategory === 'Loan EMI' && t.txnDate > addMonths(ASOF, 5),
    )
    assert.equal(emis.length, 0, 'the education loan is still debiting after it should have ended')
    assert.equal(after.liabilities.length, 0, 'a cleared loan is still on the liability list')
  })
})

describe('the patterns the product has to find', () => {
  it('leaves a forgotten subscription as an identical repeated charge', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const gym = txns.filter((t) => t.narration.includes('CULTFIT'))
    assert.ok(gym.length >= 15, `only ${gym.length} charges — not enough to detect periodicity`)
    assert.equal(new Set(gym.map((t) => t.txnAmount)).size, 1, 'a subscription must not vary')
    assert.equal(new Set(gym.map((t) => t.txnDate.slice(-2))).size, 1, 'and must fall on one day')
  })

  it('leaves utilities recurring but variable, so they are not mistaken for subscriptions', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const power = txns.filter((t) => t.narration.includes('MPPKVVCL'))
    assert.ok(power.length > 20)
    assert.ok(
      new Set(power.map((t) => t.txnAmount)).size > 5,
      'an electricity bill that never changes is not an electricity bill',
    )
  })

  it('clusters spending after payday', () => {
    // Cleo's finding: 35% spend most of their income within five days of being paid. If our
    // ledger spreads spending evenly, the whole safe-to-spend feature has nothing to bite on.
    const txns = generateLedger(ROHAN, OPTS).filter(
      // Routine discretionary spending only. The persona's lump sums are one-offs an order of
      // magnitude larger, and three of the four happen to fall late in their month — left in,
      // they swamp the signal this test exists to check.
      (t) =>
        t.txnType === 'DEBIT' &&
        !t.isRecurring &&
        t.txnAmount < 10_000 &&
        t.spendCategory !== 'Cash',
    )
    const early = txns.filter((t) => Number(t.txnDate.slice(-2)) <= 10)
    const late = txns.filter((t) => Number(t.txnDate.slice(-2)) >= 21)
    const sum = (list: typeof txns) => list.reduce((s, t) => s + t.txnAmount, 0)
    assert.ok(sum(early) > sum(late) * 1.3, 'spending is too flat across the month')
  })

  it('drifts one category upward over recent months', () => {
    // "Your food spend is up 40%" has to be arithmetic over the ledger, not a written string.
    // Complete months only: asOf is the 1st, so the current month holds a single day.
    const txns = generateLedger(ROHAN, OPTS)
    const spend = (from: string, to: string) =>
      txns
        .filter((t) => t.spendCategory === 'Food & dining' && t.txnDate >= from && t.txnDate < to)
        .reduce((s, t) => s + t.txnAmount, 0)

    const recent = spend(addMonths(ASOF, -3), ASOF)
    const baseline = spend(addMonths(ASOF, -15), addMonths(ASOF, -12))
    assert.ok(
      recent > baseline * 1.25,
      `food spend is not visibly drifting: ${baseline} -> ${recent}`,
    )
  })

  it('varies a trader’s income so it cannot be read off one field', () => {
    const file = generateCustomerFile(SUNIL, OPTS)
    const credits = file.transactions.filter((t) => t.txnType === 'CREDIT')
    assert.ok(
      credits.every((t) => !t.isSalaryCredit),
      'a trader has no payroll flag to lean on',
    )

    const byMonth = new Map<string, number>()
    for (const c of credits) {
      byMonth.set(monthKey(c.txnDate), (byMonth.get(monthKey(c.txnDate)) ?? 0) + c.txnAmount)
    }
    const totals = [...byMonth.values()]
    const spread = Math.max(...totals) / Math.min(...totals)
    assert.ok(spread > 1.4, `income spread of ${spread.toFixed(2)} is too regular for a shop owner`)
  })
})

describe('the customer file', () => {
  it('derives account aggregates from the ledger rather than declaring them', () => {
    const file = generateCustomerFile(ROHAN, OPTS)
    const savings = file.accounts.find((a) => a.accountType === 'Savings')
    const last = file.transactions[file.transactions.length - 1]
    assert.ok(savings && last)
    assert.equal(savings.currentBalance, last.balanceAfterTxn)
    assert.ok(
      savings.minBalance12m !== undefined && savings.minBalance12m <= savings.currentBalance,
    )
  })

  it('keeps outstanding principal consistent with the tenure left', () => {
    for (const spec of PERSONAS) {
      const file = generateCustomerFile(spec, OPTS)
      for (const l of file.liabilities) {
        const implied = l.emiAmount * l.tenureRemainingMonths
        assert.ok(
          Math.abs(l.outstandingPrincipal - implied) / implied < 0.1,
          `${spec.slug}/${l.loanType}: ₹${l.outstandingPrincipal} does not square with ` +
            `${l.tenureRemainingMonths} × ₹${l.emiAmount}`,
        )
      }
    }
  })

  it('gives each persona the condition its suitability rule needs', () => {
    // A shelf of suitable products cannot demonstrate suitability, and neither can one
    // customer. Each of these is the precondition for a different rule firing.
    const rohan = generateCustomerFile(ROHAN, OPTS)
    assert.equal(rohan.policies.length, 0, 'ROHAN needs no cover in force for BUNDLED_PROTECTION')
    assert.ok(rohan.customer.dependents > 0)

    const priya = generateCustomerFile(PRIYA, OPTS)
    const card = priya.liabilities.find((l) => l.isRevolving)
    assert.ok(card && card.loanInterestRate > 30, 'PRIYA needs the card for HIGH_INTEREST_DEBT')

    const sunil = generateCustomerFile(SUNIL, OPTS)
    assert.ok(
      sunil.liabilities.some((l) => l.dpdStatus > 0),
      'SUNIL needs a missed repayment for MISSED_REPAYMENT',
    )
    assert.equal(sunil.customer.riskProfile, 'Conservative')
  })

  it('never records a deposit held at IDBI as both an account and a holding', () => {
    /*
     * `packages/contracts/src/routes/holdings.ts` states the rule and the reason: a term
     * deposit held at IDBI "arrives as an account on 394 and 365 and is already in the accounts
     * block, so recording it again would count it twice in every net-worth figure".
     *
     * Rohan's ₹2,00,000 Suvidha FD was in both — an `extraAccounts` row and a declared holding
     * with the same value and the same maturity date — so his dashboard added it to
     * `balances.deposits` and to `holdings.debt` and put his net worth ₹2 lakh above what he
     * has. The rule is checked against every persona, not only the one that broke it.
     */
    for (const spec of PERSONAS) {
      const file = generateCustomerFile(spec, OPTS)
      const deposits = file.accounts.filter((a) => a.accountType === 'FD' || a.accountType === 'RD')

      for (const holding of file.holdings) {
        const twin = deposits.find(
          (a) =>
            a.currentBalance === holding.currentValue ||
            (a.maturityDate !== undefined && a.maturityDate === holding.maturityDate),
        )
        assert.equal(
          twin,
          undefined,
          `${spec.slug}: "${holding.name}" is already account ${twin?.accountNumberMasked} ` +
            `— ${holding.currentValue} would be counted twice`,
        )
      }
    }
  })

  it('leaves ROHAN a net worth that counts his deposit once', () => {
    const s = derive(generateCustomerFile(ROHAN, OPTS), ASOF)

    // The FD is an account, and it is the reason his buffer covers six months.
    assert.equal(s.balances.deposits, 200_000)
    // And it is not also a holding, so the two blocks can be added without doubling it. What he
    // owns beyond the accounts is the flexi-cap fund the generator rolls forward from his SIP.
    assert.equal(s.holdings.debt, 0)
    assert.equal(s.holdings.total, s.holdings.equity)

    // The figure Overview puts on the card. It read ₹7,67,628 while the FD was counted twice.
    const netWorth = s.balances.total + s.holdings.total - s.debt.total
    assert.equal(Math.round(netWorth), 567_628)
  })
})

describe('the headline numbers', () => {
  it('leaves ROHAN with a real surplus and a real leak', () => {
    // The pitch rests on both halves: money that is not being deployed, and money quietly
    // leaking that could join it. If either collapses, the product has nothing to say.
    const file = generateCustomerFile(ROHAN, OPTS)
    const s = summarise(file, ASOF, 24)

    assert.equal(s.monthlyIncome, 85_000)
    assert.ok(s.monthlySurplus > 8_000, `surplus of ₹${s.monthlySurplus} is too thin to invest`)
    assert.ok(
      s.discretionary > 12_000,
      `discretionary of ₹${s.discretionary} leaves nothing to recover`,
    )
    assert.ok(s.idleFloor > 20_000, `an idle floor of ₹${s.idleFloor} is not an idle-cash story`)
  })

  it('leaves PRIYA earning well and unable to invest a rupee of it', () => {
    const s = summarise(generateCustomerFile(PRIYA, OPTS), ASOF, 24)
    assert.equal(s.monthlyIncome, 140_000)
    assert.ok(s.discretionary > s.fixedCommitments * 0.5, 'her problem has to be the spending')

    // Coherence, not arithmetic. Nobody sits on months of cash while paying a third a year on a card,
    // and a judge who notices that stops believing the rest of the ledger too.
    assert.ok(
      s.idleFloor < s.monthlyOutflow * 0.5,
      `₹${s.idleFloor} idle alongside revolving card debt is not a story anyone believes`,
    )
  })
})
