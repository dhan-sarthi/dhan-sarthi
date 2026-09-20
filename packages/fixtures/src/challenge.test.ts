/**
 * Challenges and the savings pot, against the generated ledgers.
 *
 * Same reason as `engine.test.ts`: `@dhan/core` may not depend on the fixtures, so the two meet
 * here. Both of the new modules are exercised from this one file because they ship as one slice
 * and neither is large enough to justify a second — if `save.ts` grows a rules engine of its own
 * it should move out, and the split will be obvious when it happens.
 *
 * Everything below is driven off `generateLedger` / `generateCustomerFile` over the personas
 * rather than off literals. A hand-written array of four transactions proves that a function
 * loops; a real ledger proves it against paise, self-transfers, salary credits landing on a
 * Sunday, and twenty-four months of them. The one thing to watch when reading these: several of
 * them recompute the answer independently **in paise**, for the reason `engine.test.ts` records
 * — two floating-point sums of the same rows do not agree to the last digit, and a test that
 * failed for that reason would be a test about arithmetic rather than about behaviour.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accrue,
  addDays,
  baselineFor,
  categorize,
  challengeProgress,
  CHALLENGE_WINDOW_DAYS,
  daysBetween,
  derive,
  EMPTY_SAVE_STATE,
  idFor,
  interestEarned,
  NO_SAVE_HACKS,
  NOT_CHALLENGEABLE,
  normaliseSaveState,
  potTotal,
  projectHacks,
  recommendedWeeklySave,
  repeatedSaving,
  roundLimit,
  SAVE_HACK_IDS,
  savingsRatePct,
  SMART_SAVE_FACTOR,
  suggestLimits,
  topSpendTargets,
} from '@dhan/core'
import type { SaveHacks, SpendTarget, Transaction } from '@dhan/core'
import { generateCustomerFile, generateLedger } from './generate.ts'
import { KARAN, PERSONAS, PRIYA, ROHAN, SUNIL } from './personas.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

/** The cap convention, written out once here so the tests assert it rather than inherit it. */
const inWindow = (date: string, after: string, through: string): boolean =>
  date > after && date <= through

const isSpend = (t: Transaction): boolean => t.txnType === 'DEBIT' && t.isSelfTransfer !== true

const paise = (t: Transaction): number => Math.round(t.txnAmount * 100)

describe('challenge targets', () => {
  it('offers only spending a customer could choose to stop', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const { merchants, categories } = topSpendTargets(txns, ASOF)

      assert.ok(merchants.length <= 3, `${spec.slug}: more than three merchants offered`)
      assert.ok(categories.length <= 3, `${spec.slug}: more than three categories offered`)
      assert.ok(categories.length > 0, `${spec.slug}: nothing to challenge at all`)

      for (const row of categories) {
        assert.ok(
          ![...NOT_CHALLENGEABLE].some((c) => c === row.target.name),
          `${spec.slug}: offered a challenge on ${row.target.name}`,
        )
      }

      // Biggest first, in both lists, and every figure a whole rupee.
      for (const list of [merchants, categories]) {
        const spent = list.map((r) => r.spent)
        assert.deepEqual(
          spent,
          [...spent].sort((a, b) => b - a),
          `${spec.slug}: out of order`,
        )
        for (const n of spent) assert.equal(n, Math.round(n))
      }
    }
  })

  it('never bundles the unrecognised into an Other bucket', () => {
    // An IDBI narration is routinely `S1 TXN 20`, so "Other" would be the biggest row on the
    // screen for most customers. Every merchant offered has to be one `categorize` actually named.
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const named = new Set(
        txns.map((t) => categorize(t).merchant).filter((m): m is string => m !== null),
      )
      for (const row of topSpendTargets(txns, ASOF).merchants) {
        assert.ok(named.has(row.target.name), `${spec.slug}: invented merchant ${row.target.name}`)
      }
    }
  })

  it('totals exactly the debits inside the four weeks ending today', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const from = addDays(ASOF, -CHALLENGE_WINDOW_DAYS)
      const { merchants, categories } = topSpendTargets(txns, ASOF)

      for (const row of [...merchants, ...categories]) {
        let total = 0
        let occurrences = 0
        for (const t of txns) {
          if (!isSpend(t) || !inWindow(t.txnDate, from, ASOF)) continue
          const e = categorize(t)
          const hit =
            row.target.kind === 'merchant'
              ? e.merchant === row.target.name
              : e.category === row.target.name
          if (!hit) continue
          total += paise(t)
          occurrences += 1
        }
        assert.equal(row.spent, Math.round(total / 100), `${spec.slug}: ${row.target.name}`)
        assert.equal(row.occurrences, occurrences, `${spec.slug}: ${row.target.name}`)
      }
    }
  })

  it('excludes the day four weeks ago and includes today', () => {
    /*
     * The convention pinned against a real transaction rather than asserted in prose.
     *
     * Three window conventions coexist in this package and the difference between them is one
     * day's spending, which is invisible in every figure and wrong in all of them. Take a known
     * Swiggy debit, stand `asOf` exactly twenty-eight days after it, and the window's lower bound
     * lands on that transaction's own date: it must be out. Widen by one day and it must be in,
     * by exactly its own amount.
     */
    const txns = generateLedger(ROHAN, OPTS)
    const swiggy = txns.find(
      (t) => isSpend(t) && categorize(t).merchant === 'Swiggy' && t.txnDate > '2026-06-01',
    )
    assert.ok(swiggy, 'the ledger should contain a Swiggy debit')

    const onTheDay = txns
      .filter(
        (t) => isSpend(t) && t.txnDate === swiggy.txnDate && categorize(t).merchant === 'Swiggy',
      )
      .reduce((sum, t) => sum + paise(t), 0)
    assert.ok(onTheDay > 0)

    const asOf = addDays(swiggy.txnDate, CHALLENGE_WINDOW_DAYS)
    const find = (days: number): number =>
      topSpendTargets(txns, asOf, days, 50).merchants.find((r) => r.target.name === 'Swiggy')
        ?.spent ?? 0

    assert.equal(
      find(CHALLENGE_WINDOW_DAYS + 1) - find(CHALLENGE_WINDOW_DAYS),
      Math.round(onTheDay / 100),
    )
  })

  it('does not treat a customer moving their own money as spending', () => {
    /*
     * Karan is the aggregated customer: forty-seven of his debits are sweeps into his own
     * household account, all of them categorised `Transfers`, and together they are ₹24.8 lakh
     * over two years. Counted, they would be his largest spending category by a wide margin and
     * the app would offer him a challenge to stop moving his own money about.
     *
     * Two things stop that, and this asserts both because either alone would be enough today
     * and neither alone is enough for good. `isSelfTransfer` drops the sweeps, and
     * `NOT_CHALLENGEABLE` drops the whole `Transfers` category — a debit to another person's
     * account has left, but it has not been *spent*, and a limit on a total whose purpose the
     * bank does not know is a limit the customer cannot act on.
     */
    const txns = generateLedger(KARAN, OPTS)
    const sweeps = txns.filter((t) => t.txnType === 'DEBIT' && t.isSelfTransfer === true)
    assert.ok(sweeps.length > 20, 'the aggregated persona should carry self-transfers')

    const offered = topSpendTargets(txns, ASOF, 730, 5)
    assert.equal(
      offered.categories.find((r) => r.target.name === 'Transfers'),
      undefined,
      'Transfers is not a habit anybody can be challenged to break',
    )

    // And nothing that *is* offered has a sweep inside it. Summed in paise, because this is an
    // independent re-derivation of totals `topSpendTargets` already computed.
    const sweptIds = new Set(sweeps.map((t) => t.txnId))
    for (const row of [...offered.merchants, ...offered.categories]) {
      const counted = txns.filter(
        (t) =>
          t.txnType === 'DEBIT' &&
          sweptIds.has(t.txnId) &&
          (row.target.kind === 'merchant'
            ? categorize(t).merchant === row.target.name
            : categorize(t).category === row.target.name),
      )
      assert.equal(
        counted.reduce((sum, t) => sum + paise(t), 0),
        0,
        `${row.target.name} is counting the customer's own sweeps as spending`,
      )
    }
  })
})

describe('challenge progress', () => {
  /** The biggest merchant each persona actually spends at, which is what the wizard would offer. */
  const topMerchant = (txns: readonly Transaction[]): SpendTarget => {
    const first = topSpendTargets(txns, ASOF).merchants[0]
    assert.ok(first, 'the ledger should offer at least one merchant')
    return first.target
  }

  it('gives one bar per day and a headline the bars add up to', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const target = topMerchant(txns)
      const startDate = addDays(ASOF, -13)
      const p = challengeProgress({ target, limit: 2_000, days: 14, startDate }, txns, ASOF)

      assert.equal(p.days, 14)
      assert.equal(p.daily.length, 14)
      assert.equal(p.endDate, ASOF)
      assert.equal(p.dayIndex, 14)
      assert.equal(p.daily[0]?.date, startDate)
      assert.equal(p.daily[13]?.date, ASOF)

      // The same rows, summed independently in paise and rounded per day, because that is how
      // the module builds the bars and the headline is the sum of the bars by construction.
      let reference = 0
      for (let i = 0; i < 14; i += 1) {
        const date = addDays(startDate, i)
        const onTheDay = txns
          .filter((t) => isSpend(t) && t.txnDate === date && categorize(t).merchant === target.name)
          .reduce((sum, t) => sum + paise(t), 0)
        assert.equal(p.daily[i]?.spent, Math.round(onTheDay / 100), `${spec.slug}: day ${i + 1}`)
        reference += Math.round(onTheDay / 100)
      }
      assert.equal(p.spent, reference, `${spec.slug}: the bars do not add up to the headline`)
      assert.equal(p.remaining, Math.max(0, p.limit - p.spent))
      assert.equal(p.overspent, p.spent > p.limit)
    }
  })

  it('does not call a day that has not happened a zero-spend day', () => {
    // Half a challenge, run from the middle of it. The future half is `elapsed: false` and may
    // not appear in the streak — a customer is not on a fourteen-day streak on day one.
    const txns = generateLedger(PRIYA, OPTS)
    const target = topMerchant(txns)
    const startDate = addDays(ASOF, -6)
    const p = challengeProgress({ target, limit: 5_000, days: 14, startDate }, txns, ASOF)

    const elapsed = p.daily.filter((d) => d.elapsed)
    assert.equal(elapsed.length, 7)
    assert.equal(p.dayIndex, 7)
    assert.equal(p.complete, false)
    assert.equal(p.won, null, 'a challenge in progress has not been lost')

    for (const day of p.daily.filter((d) => !d.elapsed)) assert.equal(day.spent, 0)
    assert.equal(p.zeroDays, elapsed.filter((d) => d.spent === 0).length)
    assert.ok(p.longestZeroStreak <= p.zeroDays)
  })

  it('settles the verdict only once the last day is behind them', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const target = topMerchant(txns)
    const startDate = addDays(ASOF, -34)
    const terms = { target, limit: 1_00_000, days: 14, startDate }

    const running = challengeProgress(terms, txns, addDays(startDate, 3))
    assert.equal(running.complete, false)
    assert.equal(running.won, null)

    const finished = challengeProgress(terms, txns, ASOF)
    assert.equal(finished.complete, true)
    assert.equal(finished.dayIndex, 14, 'the day index is clamped to the length')
    assert.equal(finished.won, true, 'a limit of ₹1 lakh over a fortnight cannot be lost')

    // The same fortnight against a limit of nothing, which anyone who spent a rupee has lost.
    const impossible = challengeProgress({ ...terms, limit: 0 }, txns, ASOF)
    assert.ok(impossible.spent > 0, 'the persona should have spent something on their top merchant')
    assert.equal(impossible.overspent, true)
    assert.equal(impossible.won, false)
    assert.equal(impossible.remaining, 0, 'remaining never goes negative')
  })

  it('lists the transactions behind the figure, newest first', () => {
    const txns = generateLedger(KARAN, OPTS)
    const target = topMerchant(txns)
    const startDate = addDays(ASOF, -27)
    const p = challengeProgress({ target, limit: 3_000, days: 28, startDate }, txns, ASOF)

    const byId = new Map(txns.map((t) => [t.txnId, t]))
    assert.ok(p.txnIds.length > 0)

    let previous = ASOF
    for (const id of p.txnIds) {
      const t = byId.get(id)
      assert.ok(t, `unknown transaction ${id}`)
      assert.ok(isSpend(t))
      assert.equal(categorize(t).merchant, target.name)
      assert.ok(inWindow(t.txnDate, addDays(startDate, -1), ASOF))
      assert.ok(t.txnDate <= previous, 'the list is not newest first')
      previous = t.txnDate
    }
  })

  it('counts nothing after today, whatever the ledger holds', () => {
    // The demo's clock runs backwards as happily as forwards, and a challenge that had already
    // spent next week's money would be the most convincing bug in the app.
    const txns = generateLedger(PRIYA, OPTS)
    const target = topMerchant(txns)
    const startDate = addDays(ASOF, -60)
    const terms = { target, limit: 10_000, days: 28, startDate }

    const midway = addDays(startDate, 13)
    const early = challengeProgress(terms, txns, midway)
    const whole = challengeProgress(terms, txns, ASOF)

    assert.ok(early.spent <= whole.spent)
    assert.equal(
      early.spent,
      early.daily.filter((d) => d.date <= midway).reduce((sum, d) => sum + d.spent, 0),
    )
    assert.equal(
      early.txnIds.every((id) => whole.txnIds.includes(id)),
      true,
    )
  })
})

describe('challenge limits', () => {
  it('rounds down onto the stepper ladder and never up', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      for (const row of topSpendTargets(txns, ASOF).merchants) {
        for (const days of [7, 14, 28]) {
          const baseline = baselineFor(row, days)
          for (const option of suggestLimits(baseline, days)) {
            const step = option.limit < 5_000 ? 100 : option.limit < 50_000 ? 500 : 1_000
            assert.equal(
              option.limit % step,
              0,
              `${spec.slug}: ${option.limit} is not a round figure`,
            )
            assert.ok(option.limit <= baseline, `${spec.slug}: a limit above what they spend`)
            assert.equal(option.predictedSaving, Math.max(0, baseline - option.limit))
          }
        }
      }
    }
  })

  it('recommends the easiest of the three, and offers no duplicates', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const row = topSpendTargets(txns, ASOF).merchants[0]
      assert.ok(row)
      const options = suggestLimits(baselineFor(row, 28), 28)

      assert.ok(options.length > 0 && options.length <= 3)
      assert.deepEqual(
        options.map((o) => o.recommended),
        options.map((_, i) => i === 0),
        `${spec.slug}: the recommended option is not the first`,
      )
      const limits = options.map((o) => o.limit)
      assert.equal(new Set(limits).size, limits.length, `${spec.slug}: duplicate tiers survived`)
      assert.deepEqual(
        limits,
        [...limits].sort((a, b) => b - a),
      )
      // The easiest one is also the one that saves least, which is the trade being offered.
      assert.deepEqual(
        options.map((o) => o.predictedSaving),
        [...options.map((o) => o.predictedSaving)].sort((a, b) => a - b),
      )
    }
  })

  it('scales the baseline by the length of the challenge', () => {
    const txns = generateLedger(SUNIL, OPTS)
    const row = topSpendTargets(txns, ASOF).merchants[0]
    assert.ok(row)

    assert.equal(baselineFor(row, CHALLENGE_WINDOW_DAYS), row.spent, 'four weeks is the window')
    assert.equal(baselineFor(row, CHALLENGE_WINDOW_DAYS * 2), Math.round(row.spent * 2))
    assert.equal(baselineFor(row, 7), Math.round(row.spent / 4))
  })

  it('never proposes a limit of nothing', () => {
    // The rounding floor. A baseline small enough to round to zero would otherwise produce a
    // challenge that is lost the moment it starts, which teaches only that the figures are props.
    assert.equal(roundLimit(0), 100)
    assert.equal(roundLimit(-500), 100)
    assert.equal(roundLimit(40), 100)
    assert.equal(roundLimit(4_999), 4_900)
    assert.equal(roundLimit(5_000), 5_000)
    assert.equal(roundLimit(49_999), 49_500)
    assert.equal(roundLimit(123_400), 123_000)
    // And a target too small to challenge is answered with nothing rather than with a rubber stamp.
    assert.deepEqual(suggestLimits(100, 28), [])
  })

  it('multiplies the saving out without dressing it as a projection', () => {
    assert.deepEqual(repeatedSaving(1_117, 28), [
      { days: 28, saved: 1_117 },
      { days: 56, saved: 2_234 },
      { days: 84, saved: 3_351 },
    ])
    assert.deepEqual(
      repeatedSaving(-5, 14).map((r) => r.saved),
      [0, 0, 0],
    )
  })
})

/* ------------------------------------------------------------------ *
 * The savings pot
 * ------------------------------------------------------------------ */

const allOn = (over: Partial<SaveHacks> = {}): SaveHacks => ({
  roundups: { enabled: true, toNearest: 10 },
  setForget: { enabled: true, weekly: 500 },
  smartSave: { enabled: true, level: 'normal' },
  swearJar: { enabled: true, merchant: null, perSpend: 50 },
  paydaySaver: { enabled: true, percent: 5 },
  ...over,
})

describe('save hacks', () => {
  it('puts the same money aside however many times the clock is read', () => {
    /*
     * The property the whole design rests on. `SaveService` calls `accrue` on every read, so
     * accruing one four-week range in one go and accruing it a day at a time have to produce the
     * same deposits, with the same ids, in the same order — otherwise the pot grows every time
     * someone opens the app.
     */
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const hacks = allOn({ swearJar: { enabled: true, merchant: 'Swiggy', perSpend: 50 } })
      const from = addDays(ASOF, -28)
      const opts = { from, to: ASOF, recommendedWeekly: 1_000 }

      const inOneGo = accrue({ ...EMPTY_SAVE_STATE, hacks }, txns, opts)

      let state = { ...EMPTY_SAVE_STATE, hacks }
      for (let i = 1; i <= 28; i += 1) {
        const day = addDays(from, i)
        const fresh = accrue(state, txns, {
          from: addDays(day, -1),
          to: day,
          recommendedWeekly: 1_000,
        })
        state = { ...state, deposits: [...state.deposits, ...fresh], accruedTo: day }
      }

      assert.deepEqual(state.deposits, inOneGo, `${spec.slug}: a day at a time differs from one go`)
      assert.ok(inOneGo.length > 0, `${spec.slug}: nothing accrued at all`)

      // And a second read on the same simulated day adds nothing, which is the case that actually
      // happens: a reviewer opening the Save tab twice without moving the clock.
      assert.deepEqual(accrue(state, txns, opts), [])
    }
  })

  it('rounds up to the next ten, and charges nothing on an exact ten', () => {
    const txns = generateLedger(KARAN, OPTS)
    const from = addDays(ASOF, -28)
    const hacks = allOn({
      setForget: { enabled: false, weekly: 500 },
      smartSave: { enabled: false, level: 'normal' },
      swearJar: { enabled: false, merchant: null, perSpend: 50 },
      paydaySaver: { enabled: false, percent: 5 },
    })
    const deposits = accrue({ ...EMPTY_SAVE_STATE, hacks }, txns, {
      from,
      to: ASOF,
      recommendedWeekly: 1_000,
    })

    const spending = txns.filter((t) => isSpend(t) && inWindow(t.txnDate, from, ASOF))
    const exact = spending.filter((t) => paise(t) % 1_000 === 0)
    assert.ok(exact.length > 0, 'the ledger should contain payments of an exact ten')

    const charged = new Set(deposits.map((d) => d.id))
    for (const t of exact) {
      assert.equal(
        charged.has(idFor('roundups', t.txnId)),
        false,
        `charged ₹10 on a payment of exactly ${t.txnAmount}, which is a levy and not a round-up`,
      )
    }

    let reference = 0
    for (const t of spending)
      reference += Math.round(Math.ceil(t.txnAmount / 10) * 10 - t.txnAmount)
    assert.equal(potTotal(deposits), reference)
    assert.ok(deposits.every((d) => d.source === 'roundups' && d.amount > 0))
  })

  it('takes its slice off the salary the statement shows, not one anybody typed', () => {
    // Rohan is paid ₹85,000 on the 1st; Sunil is a trader and his three August collections are
    // the only credits either of them has that `categorize` calls income.
    const rohan = accrue(
      {
        ...EMPTY_SAVE_STATE,
        hacks: allOn({
          roundups: { enabled: false, toNearest: 10 },
          setForget: { enabled: false, weekly: 500 },
          smartSave: { enabled: false, level: 'normal' },
        }),
      },
      generateLedger(ROHAN, OPTS),
      { from: addDays(ASOF, -28), to: ASOF, recommendedWeekly: 1_000 },
    ).filter((d) => d.source === 'payday_saver')

    assert.equal(rohan.length, 1)
    assert.equal(rohan[0]?.atSim, ASOF)
    assert.equal(rohan[0]?.amount, 4_250)

    const sunil = accrue(
      {
        ...EMPTY_SAVE_STATE,
        hacks: allOn({
          roundups: { enabled: false, toNearest: 10 },
          setForget: { enabled: false, weekly: 500 },
          smartSave: { enabled: false, level: 'normal' },
        }),
      },
      generateLedger(SUNIL, OPTS),
      { from: addDays(ASOF, -28), to: ASOF, recommendedWeekly: 1_000 },
    ).filter((d) => d.source === 'payday_saver')

    const credits = generateLedger(SUNIL, OPTS).filter(
      (t) =>
        t.txnType === 'CREDIT' &&
        categorize(t).category === 'Income' &&
        inWindow(t.txnDate, addDays(ASOF, -28), ASOF),
    )
    assert.equal(sunil.length, credits.length)
    assert.equal(
      potTotal(sunil),
      credits.reduce((sum, t) => sum + Math.round(t.txnAmount * 0.05), 0),
    )
  })

  it('lands the weekly rules on Mondays, and both of them on the same one', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const deposits = accrue(
      {
        ...EMPTY_SAVE_STATE,
        hacks: allOn({
          roundups: { enabled: false, toNearest: 10 },
          swearJar: { enabled: false, merchant: null, perSpend: 50 },
          paydaySaver: { enabled: false, percent: 5 },
        }),
      },
      txns,
      { from: addDays(ASOF, -28), to: ASOF, recommendedWeekly: 1_200 },
    )

    const mondays = new Set(deposits.map((d) => d.atSim))
    assert.equal(mondays.size, 4, 'four weeks contain four Mondays')
    for (const day of mondays) assert.equal(new Date(`${day}T00:00:00Z`).getUTCDay(), 1)

    // Two hacks, one Monday, two deposits — and two ids, or one of them would be swallowed.
    assert.equal(deposits.length, 8)
    assert.equal(new Set(deposits.map((d) => d.id)).size, 8)
    assert.equal(potTotal(deposits.filter((d) => d.source === 'set_forget')), 2_000)
    assert.equal(
      potTotal(deposits.filter((d) => d.source === 'smart_save')),
      4 * Math.round(1_200 * SMART_SAVE_FACTOR.normal),
    )
  })

  it('charges the jar on the merchant the customer picked, by the derived name', () => {
    const txns = generateLedger(PRIYA, OPTS)
    const row = topSpendTargets(txns, ASOF).merchants[0]
    assert.ok(row)

    const deposits = accrue(
      {
        ...EMPTY_SAVE_STATE,
        hacks: allOn({
          roundups: { enabled: false, toNearest: 10 },
          setForget: { enabled: false, weekly: 500 },
          smartSave: { enabled: false, level: 'normal' },
          paydaySaver: { enabled: false, percent: 5 },
          swearJar: { enabled: true, merchant: row.target.name, perSpend: 50 },
        }),
      },
      txns,
      { from: addDays(ASOF, -28), to: ASOF, recommendedWeekly: 1_000 },
    )

    assert.equal(deposits.length, row.occurrences)
    assert.equal(potTotal(deposits), row.occurrences * 50)

    // A jar with no merchant chosen charges nothing rather than charging everything.
    assert.deepEqual(
      accrue(
        {
          ...EMPTY_SAVE_STATE,
          hacks: allOn({
            roundups: { enabled: false, toNearest: 10 },
            setForget: { enabled: false, weekly: 500 },
            smartSave: { enabled: false, level: 'normal' },
            paydaySaver: { enabled: false, percent: 5 },
          }),
        },
        txns,
        { from: addDays(ASOF, -28), to: ASOF, recommendedWeekly: 1_000 },
      ),
      [],
    )
  })

  it('shows on each card exactly what that hack put in', () => {
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      const hacks = allOn({ swearJar: { enabled: true, merchant: 'Swiggy', perSpend: 50 } })
      const opts = { from: addDays(ASOF, -28), to: ASOF, recommendedWeekly: 800 }

      const cards = projectHacks(hacks, txns, opts)
      const deposits = accrue({ ...EMPTY_SAVE_STATE, hacks }, txns, opts)

      // Five rows, in screen order, even where a hack found nothing to do.
      assert.deepEqual(
        cards.map((c) => c.id),
        [...SAVE_HACK_IDS],
      )
      for (const card of cards) {
        assert.equal(
          card.amount,
          potTotal(deposits.filter((d) => d.source === card.id)),
          `${spec.slug}: the ${card.id} card disagrees with the pot`,
        )
        assert.notEqual(card.note, '')
      }

      // Nothing is stored: the projection is a question, and asking it twice changes nothing.
      assert.deepEqual(projectHacks(hacks, txns, opts), cards)
    }
  })

  it('leaves a hack that is off out of the projection entirely', () => {
    const txns = generateLedger(ROHAN, OPTS)
    const opts = { from: addDays(ASOF, -28), to: ASOF, recommendedWeekly: 800 }

    assert.deepEqual(projectHacks(NO_SAVE_HACKS, txns, opts), [])

    const oneOn = projectHacks(
      { ...NO_SAVE_HACKS, roundups: { enabled: true, toNearest: 10 } },
      txns,
      opts,
    )
    assert.deepEqual(
      oneOn.map((c) => c.id),
      ['roundups'],
    )

    // The counterfactual the card prints for a hack that is off: the same configuration, asked
    // with `enabled` set true. It is the same figure the customer would get by turning it on.
    const wouldHave = projectHacks(
      { ...NO_SAVE_HACKS, setForget: { enabled: true, weekly: 500 } },
      txns,
      opts,
    )
    assert.equal(wouldHave[0]?.amount, 2_000)
  })
})

describe('the pot', () => {
  it('sizes the weekly recommendation off what the roadmap believes is spare', () => {
    for (const spec of PERSONAS) {
      const snapshot = derive(generateCustomerFile(spec, OPTS), ASOF)
      const weekly = recommendedWeeklySave(snapshot.surplus.deployable)

      assert.equal(weekly % 50, 0, `${spec.slug}: not a figure a person would choose`)
      assert.ok(weekly >= 0)
      // Within half a step of the monthly surplus spread across the weeks in a month.
      assert.ok(Math.abs(weekly - snapshot.surplus.deployable / 4.345) <= 25, spec.slug)
      // A customer with nothing spare is offered nothing, not a number the app made up.
      assert.ok(snapshot.surplus.deployable > 0 || weekly === 0)
    }
    assert.equal(recommendedWeeklySave(0), 0)
    assert.equal(recommendedWeeklySave(-50_000), 0)
  })

  it('pays IDBI’s published savings rate, on the slab the pot is actually in', () => {
    assert.equal(savingsRatePct(0), 2.7)
    assert.equal(savingsRatePct(4_99_999), 2.7)
    assert.equal(savingsRatePct(5_00_000), 3.0)

    const deposits = accrue({ ...EMPTY_SAVE_STATE, hacks: allOn() }, generateLedger(KARAN, OPTS), {
      from: addDays(ASOF, -28),
      to: ASOF,
      recommendedWeekly: 1_000,
    })
    assert.ok(deposits.length > 0)

    // Nothing has been held for any time yet, so nothing has been earned. A pot that credited
    // interest on the day the money landed would be overstating itself from the first screen.
    assert.equal(interestEarned(deposits, deposits[0]?.atSim ?? ASOF), 0)

    // A year on, at the slab this pot is in, every deposit accruing from the day it landed.
    const aYearOn = addDays(ASOF, 365)
    const reference = deposits.reduce(
      (sum, d) =>
        sum +
        (d.amount * savingsRatePct(potTotal(deposits)) * daysBetween(d.atSim, aYearOn)) /
          (100 * 365),
      0,
    )
    assert.ok(interestEarned(deposits, aYearOn) > 0)
    assert.equal(interestEarned(deposits, aYearOn), Math.round(reference))
  })
})

describe('reading a pot back off a row', () => {
  it('never throws, whatever the column holds', () => {
    for (const junk of [null, undefined, 0, 'nonsense', [], {}, { hacks: 7, deposits: 'no' }]) {
      const state = normaliseSaveState(junk)
      assert.deepEqual(state.hacks, NO_SAVE_HACKS)
      assert.deepEqual(state.deposits, [])
      assert.equal(state.accruedTo, null)
    }
    assert.deepEqual(normaliseSaveState({}), EMPTY_SAVE_STATE)
  })

  it('keeps a real pot byte for byte', () => {
    const hacks = allOn({ swearJar: { enabled: true, merchant: 'Swiggy', perSpend: 75 } })
    const deposits = accrue({ ...EMPTY_SAVE_STATE, hacks }, generateLedger(PRIYA, OPTS), {
      from: addDays(ASOF, -28),
      to: ASOF,
      recommendedWeekly: 950,
    })
    const state = { hacks, deposits, accruedTo: ASOF }

    assert.deepEqual(normaliseSaveState(JSON.parse(JSON.stringify(state))), state)
  })

  it('drops a deposit it cannot place, and repairs one it can', () => {
    const state = normaliseSaveState({
      hacks: { roundups: { enabled: true } },
      accruedTo: '2026-02-31',
      deposits: [
        { id: 'manual:a', atSim: '2026-08-04', amount: 500 },
        { id: 'manual:b', atSim: '2026-02-31', amount: 500, source: 'manual', note: 'x' },
        { id: '', atSim: '2026-08-04', amount: 500, source: 'manual', note: 'x' },
        { id: 'manual:d', atSim: '2026-08-04', amount: 'lots', source: 'manual', note: 'x' },
        { id: 'manual:e', atSim: '2026-08-04', amount: 500, source: 'wishful', note: '' },
      ],
    })

    // The 31st of February is a date every helper in `dates.ts` would answer about the 3rd of
    // March, so it is not a date. Rows without an id or an amount cannot be repaired either.
    assert.equal(state.accruedTo, null)
    assert.deepEqual(
      state.deposits.map((d) => d.id),
      ['manual:a', 'manual:e'],
    )
    // A missing note and an unrecognised source are cosmetic, so those are filled in.
    assert.equal(state.deposits[0]?.source, 'manual')
    assert.equal(state.deposits[0]?.note, 'Added to your goal')
    assert.equal(state.deposits[1]?.source, 'manual')
    // A configuration written before the rest of the object existed keeps its defaults.
    assert.equal(state.hacks.roundups.enabled, true)
    assert.equal(state.hacks.roundups.toNearest, 10)
    assert.equal(state.hacks.setForget.weekly, 500)
  })
})
