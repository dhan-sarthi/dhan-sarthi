/**
 * Progress against the calendar, and a run of stages on one axis.
 *
 * The cases that matter here are the ones where a bar that draws correctly still says the wrong
 * thing: a plan whose window has not opened yet, a plan whose end date has passed, and a roadmap
 * whose last stage is thirty times the length of its first.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dayOf, lanesOf, paceOf } from './pace.ts'

const plan = { startsOn: '2026-01-01', completesOn: '2027-01-01', target: 120_000 }

describe('paceOf', () => {
  it('reads half a year of a one-year plan as half elapsed', () => {
    const p = paceOf({ ...plan, achieved: 60_000, asOf: '2026-07-02' })
    assert.ok(Math.abs(p.expected - 0.5) < 0.01, `${p.expected}`)
    assert.equal(p.progress, 0.5)
    assert.equal(p.status, 'on')
    assert.equal(p.shortfall, 0)
  })

  it('calls the same 50% behind when the year is nearly over', () => {
    const p = paceOf({ ...plan, achieved: 60_000, asOf: '2026-11-01' })
    assert.equal(p.status, 'behind')
    // The figure is what makes it actionable: 83% of the year has gone and half the money is in.
    assert.ok(p.shortfall > 39_000 && p.shortfall < 42_000, `${p.shortfall}`)
  })

  it('calls the same 50% ahead in the first quarter', () => {
    assert.equal(paceOf({ ...plan, achieved: 60_000, asOf: '2026-03-01' }).status, 'ahead')
  })

  it('does not nag about two points either side of the line', () => {
    const p = paceOf({ ...plan, achieved: 58_800, asOf: '2026-07-02' })
    assert.equal(p.status, 'on')
  })

  it('reports done at the target however early it arrives, and never draws past the end', () => {
    const p = paceOf({ ...plan, achieved: 200_000, asOf: '2026-02-01' })
    assert.equal(p.status, 'done')
    assert.equal(p.progress, 1)
  })

  it('clamps a window that has not opened, and one that has closed', () => {
    assert.equal(paceOf({ ...plan, achieved: 0, asOf: '2025-06-01' }).expected, 0)
    const over = paceOf({ ...plan, achieved: 10_000, asOf: '2029-06-01' })
    assert.equal(over.expected, 1)
    assert.equal(over.monthsLeft, 0)
  })

  it('treats a zero-length window as time up rather than dividing by zero', () => {
    const p = paceOf({
      startsOn: '2026-01-01',
      completesOn: '2026-01-01',
      target: 1000,
      achieved: 400,
      asOf: '2026-01-01',
    })
    assert.equal(p.expected, 1)
    assert.equal(p.status, 'behind')
    assert.equal(p.shortfall, 600)
  })

  it('has no progress against a target of nothing, and no NaN either', () => {
    const p = paceOf({ ...plan, target: 0, achieved: 500, asOf: '2026-07-02' })
    assert.equal(p.progress, 0)
    assert.equal(p.shortfall, 0)
  })

  it('counts the months left, rounded up, because a part month is still a month to fund', () => {
    assert.equal(paceOf({ ...plan, achieved: 0, asOf: '2026-10-15' }).monthsLeft, 3)
  })

  it('reads a date as UTC midnight, so no zone can move a boundary by a day', () => {
    assert.equal(dayOf('2026-01-02') - dayOf('2026-01-01'), 1)
    assert.equal(dayOf('2026-01-01T18:00:00Z'), dayOf('2026-01-01'))
  })
})

describe('lanesOf', () => {
  const stages = [
    { key: 'a', label: 'Free up', startsOn: '2026-01-01', completesOn: '2026-03-01' },
    { key: 'b', label: 'Buffer', startsOn: '2026-03-01', completesOn: '2027-01-01' },
    { key: 'c', label: 'Grow', startsOn: '2027-01-01', completesOn: '2036-01-01' },
  ]

  it('lays every stage on one axis, so a long stage draws long', () => {
    const { lanes } = lanesOf(stages, '2026-06-01')
    assert.equal(lanes[0]?.from, 0)
    assert.equal(lanes[2]?.to, 1)
    const width = (i: number) => (lanes[i]?.to ?? 0) - (lanes[i]?.from ?? 0)
    assert.ok(width(2) > width(0) * 10, 'nine years against two months')
  })

  it('keeps a short stage tappable without letting it swallow the axis', () => {
    const { lanes } = lanesOf(
      [
        { key: 'a', label: 'One week', startsOn: '2026-01-01', completesOn: '2026-01-08' },
        { key: 'b', label: 'Thirty years', startsOn: '2026-01-08', completesOn: '2056-01-08' },
      ],
      '2026-01-02',
    )
    assert.equal(lanes[0]?.from, 0)
    assert.equal(lanes[0]?.to, 0.04)
  })

  it('says which stage is under way and how far into it today is', () => {
    const { lanes, today } = lanesOf(stages, '2026-08-01')
    assert.deepEqual(
      lanes.map((l) => l.state),
      ['done', 'now', 'later'],
    )
    assert.ok(
      (lanes[1]?.through ?? 0) > 0.4 && (lanes[1]?.through ?? 0) < 0.6,
      'five of ten months',
    )
    assert.ok(today > 0 && today < 1)
  })

  it('puts today at the start before the plan opens and at the end after it closes', () => {
    assert.equal(lanesOf(stages, '2020-01-01').today, 0)
    assert.equal(lanesOf(stages, '2099-01-01').today, 1)
    assert.deepEqual(
      lanesOf(stages, '2099-01-01').lanes.map((l) => l.state),
      ['done', 'done', 'done'],
    )
  })

  it('draws nothing for no stages rather than an axis of nothing', () => {
    assert.deepEqual(lanesOf([], '2026-01-01'), { lanes: [], today: 0 })
  })

  it('handles a single stage, where the axis is that stage', () => {
    const { lanes, today } = lanesOf([stages[1] as (typeof stages)[number]], '2026-08-01')
    assert.equal(lanes[0]?.from, 0)
    assert.equal(lanes[0]?.to, 1)
    assert.ok(today > 0 && today < 1)
  })
})
