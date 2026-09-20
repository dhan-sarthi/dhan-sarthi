/**
 * The conduct figure over customers who actually exist.
 *
 * `@dhan/core/src/credit.test.ts` is the other half and neither replaces the other. It asks
 * whether each cut-off in the model does what the comment beside it says, one input at a time
 * against a literal — which is the question an auditor asks of the arithmetic. This file asks
 * what the arithmetic says about four people, and a literal cannot answer that: a persona's
 * rate, his fixed-obligation ratio and his days past due arrive together off one generated
 * ledger, and it is the combination that lands him in a band. See CONTRIBUTING.md, "Where tests live".
 *
 * The reason the file exists at all is the gate-agreement block below. `debt.missedRepayment`
 * and `credit.dpdDays` are two readings of one fact, taken in two places and shown on two
 * screens, and nothing in core can catch them disagreeing — the cap is correct in isolation and
 * the gate is correct in isolation. A hero reading "one thing to tidy" over a shelf refusing the
 * customer everything is the product arguing with itself in front of the person it is about.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { conductBand, DELINQUENCY_CAP, delinquencyCeiling, derive } from '@dhan/core'
import type { CreditComponentId, Snapshot } from '@dhan/core'
import { generateCustomerFile, generateLedger } from './generate.ts'
import { KARAN, PERSONAS, PRIYA, ROHAN, SUNIL } from './personas.ts'
import type { PersonaSpec } from './personas.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const snap = (spec: PersonaSpec, asOf: string = ASOF): Snapshot =>
  derive(generateCustomerFile(spec, { ...OPTS, asOf }), asOf)

/**
 * The published figure for each persona and the working behind it, as one table.
 *
 * A table rather than four separate assertions because this *is* the table — the same four rows
 * are printed in the slice document and argued from. A weight or a cut-off that moves has to
 * fail here, by name, beside the number the documentation claims, rather than somewhere a reader
 * has to reconcile against prose.
 *
 * `earned` is pinned component by component on purpose. A total that still comes to 70 out of a
 * repayment component that has quietly halved and a cost component that has quietly doubled is
 * the failure a single total cannot see.
 */
const EXPECTED: readonly {
  spec: PersonaSpec
  earned: Record<CreditComponentId, number | null>
  conductScore: number
  capped: boolean
  caption: string
}[] = [
  {
    spec: ROHAN,
    earned: { repayment: 50, cost: 30, load: 20 },
    conductScore: 100,
    capped: false,
    caption: 'Nothing wrong here',
  },
  {
    spec: PRIYA,
    // Nothing past due, and the whole loss is the card at 34.8% — which is the same fact
    // `HIGH_INTEREST_DEBT` refuses her on, reached by a different route.
    earned: { repayment: 50, cost: 0, load: 20 },
    conductScore: 70,
    capped: false,
    caption: 'One thing to tidy',
  },
  {
    spec: SUNIL,
    // Earns 70 and is published at 64. His only fault is the missed instalment, so without the
    // cap he would read "one thing to tidy" while the gate refuses him every product on the
    // shelf for exactly that instalment.
    earned: { repayment: 20, cost: 30, load: 20 },
    conductScore: DELINQUENCY_CAP,
    capped: true,
    caption: 'This is costing you',
  },
  {
    spec: KARAN,
    // Both faults at once, so the cap has nothing to do: 40 is what he earned. This row only
    // reads this way because of the `dpd: 12` on his car loan — before it his repayment
    // component was full and the demo customer priced as spotless.
    earned: { repayment: 20, cost: 0, load: 20 },
    conductScore: 40,
    capped: false,
    caption: 'This is costing you',
  },
]

describe('what IDBI can see about how four real customers borrow', () => {
  it('scores each persona where the published table says it does', () => {
    for (const row of EXPECTED) {
      const { credit } = snap(row.spec)
      const where = `${row.spec.slug}: ${credit.conductScore}/${credit.outOf}`

      assert.equal(credit.conductScore, row.conductScore, where)
      assert.equal(credit.capped, row.capped, where)
      assert.equal(conductBand(credit.conductScore, credit.outOf), row.caption, where)

      // All three components are readable for every persona today, so the denominator is the
      // full 100. It is asserted rather than assumed: an unreadable income would make it 80,
      // and a figure silently out of 80 while the screen says 100 is the mis-read the whole
      // `outOf` field exists to prevent.
      assert.equal(credit.outOf, 100, where)
      assert.equal(credit.components.length, 3, where)
      for (const c of credit.components) {
        assert.equal(c.earned, row.earned[c.id], `${row.spec.slug}/${c.id}`)
      }
    }
  })

  it('shows the cap doing its job as a gap between the working and the figure', () => {
    for (const row of EXPECTED) {
      const { credit } = snap(row.spec)
      const worked = Math.round(credit.components.reduce((sum, c) => sum + (c.earned ?? 0), 0))

      // The components are the working, and the working has to add up to the published figure —
      // otherwise a customer reproducing the number from the payload gets a different answer
      // than the screen showed them. The one licensed exception is the cap, and where it fires
      // the figure has to be the cap itself with the working strictly above it: a capped
      // persona whose components already came to 64 would mean the cap was never tested.
      // Against this file's own denominator rather than a notional hundred: every persona
      // reads 100 today, and asserting the constant directly would stop being true the day one
      // of them lost a readable income.
      const ceiling = delinquencyCeiling(credit.outOf ?? 0)
      if (row.capped) {
        assert.equal(credit.conductScore, ceiling, row.spec.slug)
        assert.ok(worked > ceiling, `${row.spec.slug} is capped but only earned ${worked}`)
      } else {
        assert.equal(worked, credit.conductScore, row.spec.slug)
      }
    }
  })

  it('reads the same customer the suitability gate reads', () => {
    for (const spec of PERSONAS) {
      const { credit, debt } = snap(spec)

      /*
       * The invariant this file was written for. `debt.missedRepayment` is the boolean the gate
       * refuses on; `credit.dpdDays` is the scalar the hero is built from. Both are derived off
       * `liabilities[].dpdStatus` in the same pass, so they cannot disagree by arithmetic — they
       * can only disagree because somebody changed one of the two derivations, which is the day
       * this line fails.
       */
      assert.equal(
        debt.missedRepayment,
        credit.dpdDays > 0,
        `${spec.slug}: the gate and the figure disagree about whether he is behind`,
      )

      if (debt.missedRepayment) {
        assert.ok(
          credit.conductScore !== null &&
            credit.conductScore <= delinquencyCeiling(credit.outOf ?? 0),
          `${spec.slug} is refused every product on the shelf while his file reads ` +
            `${credit.conductScore}`,
        )
      }
    }
  })

  it('says the same thing the statement says about an instalment that came back', () => {
    /*
     * The regression for the `dpd` that was missing from Karan's car loan. His ledger has always
     * carried the return charge and the instalment settled by hand twelve days later; his
     * liability record read no days past due, so every figure derived from it priced the demo
     * customer as spotless while his own statement priced him as delinquent.
     *
     * Asserted both ways round, over every persona. A return charge with no days past due is the
     * bug that shipped; days past due with no return charge anywhere in the ledger is the
     * opposite one, and a customer whose statement cannot show what the screen asserts about him
     * is just as unanswerable at a branch counter.
     */
    for (const spec of PERSONAS) {
      const returned = generateLedger(spec, OPTS).some((t) =>
        t.narration.startsWith('NACH RETURN CHGS'),
      )
      assert.equal(
        snap(spec).credit.dpdDays > 0,
        returned,
        `${spec.slug}'s statement and his liability record describe different customers`,
      )
    }
  })

  it('splits the debt total in two without losing any of it', () => {
    for (const spec of PERSONAS) {
      const { credit, debt } = snap(spec)

      // The cost row on the screen words itself off `revolvingBalance` — "you are carrying
      // 34.8% on ₹1,86,240" — while the hero above it is built from the whole file. If the two
      // balances do not add back to `debt.total`, the screen quotes a rupee figure the customer
      // cannot find anywhere else in the app.
      assert.equal(credit.revolvingBalance + credit.instalmentBalance, debt.total, spec.slug)
    }
  })

  it('has nothing to judge once the last loan clears', () => {
    /*
     * Rohan's education loan runs out in February 2027, so a judge reaches the null arm of this
     * screen by moving the clock rather than by reading about it. That makes "no borrowing on
     * your IDBI file" a state the product actually enters, and the difference between a screen
     * that handles it and a screen that has an untested branch in it.
     */
    const rolled = snap(ROHAN, '2027-03-01')

    assert.equal(rolled.credit.liabilityCount, 0)
    assert.equal(rolled.credit.conductScore, null)
    assert.equal(rolled.credit.outOf, null)
    assert.equal(rolled.credit.components.length, 0)
    assert.equal(rolled.credit.capped, false)

    // And the four blind spots still ship. A bank that can say nothing about how you borrow
    // still owes you the list of what it would have needed to say anything.
    assert.equal(rolled.credit.blind.length, 4)
  })
})
