/**
 * The book over HTTP: who sees which customers, the 403 at the edge of a book, what each page
 * answers, and the promise the whole console rests on — an RM reading a customer leaves no mark
 * on that customer's record.
 *
 * One root for the file, because the first book read derives every customer in it (about five
 * seconds for Meera's thirty-eight) and every test after it reads the memo. The no-writes test
 * therefore runs first, while every read is still cold: a memo hit writes nothing whatever the
 * code does, so only a cold read can prove it.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { daysInMonth, derive, fromYmd, isBalanceAccount } from '@dhan/core'
import { ALL_PERSONAS } from '@dhan/fixtures'
import type {
  Customer360,
  CustomersResponse,
  ErrorBody,
  RmAccessLog,
  RmBook,
  RmInsights,
  RmToday,
  View,
} from '@dhan/contracts'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import { InMemoryAuditStore } from '../../src/adapters/memory/audit-store.memory.ts'
import { InMemorySessionStore } from '../../src/adapters/memory/session-store.memory.ts'
import { InMemorySnapshotStore } from '../../src/adapters/memory/snapshot-store.memory.ts'
import { HISTORY_WINDOW_MONTHS } from '../../src/application/advisory.service.ts'
import type { AuditStore, SessionStore, SnapshotStore } from '../../src/ports/index.ts'
import {
  ANCHOR,
  ARJUN,
  KARAN_CIF,
  MEERA,
  ROHAN_CIF,
  bearer,
  createSession,
  makeRoot,
  signInRm,
} from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

/** The last day of a 'YYYY-MM' month. */
function monthEnd(month: string): string {
  const [year = 0, mm = 0] = month.split('-').map(Number)
  return fromYmd(year, mm, daysInMonth(year, mm))
}

/**
 * Third person gone wrong in `revoice`: a subject pronoun after a verb that takes an object, or
 * "than them" where a verb follows and the sentence needed "than they".
 */
const MISVOICED = /\b(costing|costs|cost|gets|get|find|tells|shows) they\b|\bthan them [a-z]/i

/** Every method on the three customer-side stores that adds, changes or removes a row. */
const WRITES = new Set([
  'create',
  'patch',
  'touch',
  'erase',
  'putIdempotent',
  'expireIdle',
  'put',
  'putRoadmap',
  'appendAdvice',
  'appendDecision',
  'appendToolCall',
  'appendAvatarSession',
  'markAvatarEnded',
  'attachTranscript',
])

/** The store as it is, with every write it receives counted by method name. */
function counted<T extends object>(store: T, writes: string[]): T {
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function' || typeof prop !== 'string' || !WRITES.has(prop)) {
        return typeof value === 'function' ? value.bind(target) : value
      }
      return (...args: unknown[]) => {
        writes.push(prop)
        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  })
}

describe('the RM book', () => {
  let root: TestRoot
  let meera: string
  let arjun: string
  const writes: string[] = []

  before(async () => {
    const clock = new FixedClock('2026-09-03T09:00:00.000Z')
    root = await makeRoot({
      deps: {
        clock,
        sessions: counted<SessionStore>(new InMemorySessionStore(clock), writes),
        snapshots: counted<SnapshotStore>(new InMemorySnapshotStore(clock), writes),
        audit: counted<AuditStore>(new InMemoryAuditStore(clock), writes),
      },
    })
    meera = (await signInRm(root.app, MEERA)).token
    arjun = (await signInRm(root.app, ARJUN)).token
  })
  after(() => root.close())

  const get = (url: string, token: string) =>
    root.app.inject({ method: 'GET', url, headers: bearer(token) })

  it('reads the whole console without writing a row to any customer’s record', async () => {
    // A reviewer's session first, so there is a customer-side record to leave alone.
    const reviewer = await createSession(root.app, ROHAN_CIF)
    const view = await root.app.inject({
      method: 'GET',
      url: '/api/v1/view',
      headers: bearer(reviewer.token),
    })
    assert.equal(view.statusCode, 200)
    assert.ok(writes.length > 0, 'the reviewer path did write, so the counter is live')

    const before = {
      sessions: await root.deps.sessions.listByCif(ROHAN_CIF),
      roadmaps: await root.deps.snapshots.listRoadmaps(reviewer.session.id),
      record: await root.deps.audit.listForSession(reviewer.session.id),
    }
    writes.length = 0

    for (const url of [
      '/api/v1/rm/me',
      '/api/v1/rm/book',
      '/api/v1/rm/today',
      `/api/v1/rm/customers/${ROHAN_CIF}`,
      `/api/v1/rm/customers/${KARAN_CIF}?purpose=Annual%20review`,
      '/api/v1/rm/insights',
    ]) {
      const res = await get(url, meera)
      assert.equal(res.statusCode, 200, `${url}: ${res.body}`)
    }

    assert.deepEqual(writes, [], 'an RM read wrote to a customer store')
    assert.deepEqual(await root.deps.sessions.listByCif(ROHAN_CIF), before.sessions)
    assert.deepEqual(await root.deps.sessions.listByCif(KARAN_CIF), [])
    assert.deepEqual(await root.deps.snapshots.listRoadmaps(reviewer.session.id), before.roadmaps)
    assert.deepEqual(await root.deps.audit.listForSession(reviewer.session.id), before.record)
  })

  it('reads the same customer the app does: the console’s snapshot is the app’s', async () => {
    const reviewer = await createSession(root.app, ROHAN_CIF)
    const res = await root.app.inject({
      method: 'GET',
      url: '/api/v1/view',
      headers: bearer(reviewer.token),
    })
    const app = res.json<View>()
    const desk = await root.services.rmBook.state(ROHAN_CIF)
    assert.deepEqual(JSON.parse(JSON.stringify(desk.snapshot)), app.snapshot)
    // And the threshold the console passes `derive` is the engine's own default.
    const { file } = await root.deps.bank.loadCustomerFile(ROHAN_CIF, ANCHOR, HISTORY_WINDOW_MONTHS)
    assert.deepEqual(desk.snapshot, derive(file, ANCHOR))
  })

  it('gives Meera her 38 customers and Arjun his 12, with no customer in both', async () => {
    const m = (await get('/api/v1/rm/book', meera)).json<RmBook>()
    const a = (await get('/api/v1/rm/book', arjun)).json<RmBook>()
    assert.equal(m.rows.length, 38)
    assert.equal(a.rows.length, 12)
    const mine = new Set(m.rows.map((r) => r.cif))
    assert.ok(a.rows.every((r) => !mine.has(r.cif)))
    // The four heroes are Meera's: the reviewer's handoff has to land on the RM the demo opens.
    for (const cif of [KARAN_CIF, ROHAN_CIF]) assert.ok(mine.has(cif), cif)

    assert.equal(m.totals.customers, 38)
    const sum = m.rows.reduce((s, r) => s + r.relationshipValue, 0)
    assert.ok(Math.abs(m.totals.relationshipValue - sum) < 0.01)
    const tabs = Object.fromEntries(m.segments.map((t) => [t.id, t.count]))
    assert.equal(tabs.all, 38)
    assert.equal((tabs.priority ?? 0) + (tabs.affluent ?? 0) + (tabs.mass ?? 0), 38)
    // Largest relationship first.
    const values = m.rows.map((r) => r.relationshipValue)
    assert.deepEqual(
      values,
      [...values].sort((x, y) => y - x),
    )
  })

  it('carries a twelve-month balance history on every row, month-ends to August', () =>
    get('/api/v1/rm/book', meera).then((res) => {
      for (const row of res.json<RmBook>().rows) {
        assert.equal(row.balanceSeries.length, 12, row.name)
        assert.equal(row.balanceSeries[0]?.month, '2025-09')
        assert.equal(row.balanceSeries[11]?.month, '2026-08')
        assert.ok(row.strength.reason.length > 0)
        assert.equal(row.attrition.flagged, row.attrition.reasons.length > 0)
      }
    }))

  it('refuses Arjun a customer in Meera’s book with 403, and an unknown cif with 404', async () => {
    const theirs = await get(`/api/v1/rm/customers/${KARAN_CIF}`, arjun)
    assert.equal(theirs.statusCode, 403)
    assert.equal(theirs.json<ErrorBody>().code, 'FORBIDDEN')
    const nobody = await get('/api/v1/rm/customers/IDBI0000000000', meera)
    assert.equal(nobody.statusCode, 404)
    assert.equal(nobody.json<ErrorBody>().code, 'NOT_FOUND')
    // Every book-scoped route, the activity and copilot ones included, answers the same.
    for (const [method, url, payload] of [
      ['GET', `/api/v1/rm/customers/${KARAN_CIF}/journey`, undefined],
      ['GET', `/api/v1/rm/customers/${KARAN_CIF}/record`, undefined],
      ['POST', `/api/v1/rm/customers/${KARAN_CIF}/record/verify`, undefined],
      ['POST', `/api/v1/rm/customers/${KARAN_CIF}/notes`, { kind: 'note', text: 'hi' }],
      [
        'POST',
        `/api/v1/rm/customers/${KARAN_CIF}/reveal`,
        { field: 'dateOfBirth', reason: 'KYC check' },
      ],
      ['POST', `/api/v1/rm/customers/${KARAN_CIF}/brief`, undefined],
      ['POST', `/api/v1/rm/customers/${KARAN_CIF}/ask`, { question: 'How is he doing?' }],
    ] as const) {
      const res = await root.app.inject({
        method,
        url,
        headers: bearer(arjun),
        ...(payload === undefined ? {} : { payload }),
      })
      assert.equal(res.statusCode, 403, `${method} ${url}`)
    }
  })

  it('opens a customer and writes a viewed entry with the purpose given', async () => {
    const res = await get(`/api/v1/rm/customers/${KARAN_CIF}?purpose=Pre-call%20check`, meera)
    assert.equal(res.statusCode, 200, res.body)
    const c = res.json<Customer360>()
    assert.equal(c.profile.name, 'Karan Deshpande')
    assert.equal(c.profile.assignedRm.name, 'Meera Joshi')
    assert.match(c.profile.dateOfBirthMasked, /^••\/••\/\d{4}$/)
    // Masked means masked: the date itself appears nowhere in the answer, only from a reveal.
    const { dateOfBirth } = await root.deps.bank.getCustomer(KARAN_CIF)
    assert.ok(!res.body.includes(dateOfBirth), 'the full date of birth leaked into the 360')
    assert.equal(c.money.walletSharePct, 25.6)
    assert.equal(c.money.balanceSeries.length, 12)
    assert.ok(c.signals.every((s) => s.kind !== ('human_handoff' as string)))
    assert.ok(c.nextActions.length > 0)

    const [latest] = await root.deps.rmActivity.listAccess('rm-204117', 1)
    assert.equal(latest?.action, 'viewed')
    assert.equal(latest?.cif, KARAN_CIF)
    assert.equal(latest?.purpose, 'Pre-call check')

    await get(`/api/v1/rm/customers/${KARAN_CIF}`, meera)
    const [plain] = await root.deps.rmActivity.listAccess('rm-204117', 1)
    assert.equal(plain?.purpose, 'Relationship review')
    // Arjun's refused opens are his entries, never Meera's.
    const mine = await root.deps.rmActivity.listAccess('rm-204117', 50)
    assert.ok(mine.every((e) => e.action !== 'denied'))
  })

  it('logs every refused attempt as denied, for the RM who tried, and a 404 not at all', async () => {
    // The 403 test above ran first: Arjun tried Karan's file and seven routes under it.
    const entries = await root.deps.rmActivity.listAccess('rm-204388', 50)
    assert.ok(entries.every((e) => e.action === 'denied' && e.cif === KARAN_CIF))
    // Oldest first, each saying what was tried; the brief and the question are the copilot
    // routes', which name their own purpose.
    const tried = entries.map((e) => e.purpose).reverse()
    assert.equal(tried.length, 8)
    assert.deepEqual(tried.slice(0, 6), [
      'Relationship review',
      'Open the journey',
      'Open the advice record',
      'Verify the advice record',
      'Add a note',
      'KYC check',
    ])
    assert.equal(entries.find((e) => e.purpose === 'KYC check')?.detail, 'dateOfBirth')
    // Read back through the route, the entry names the cif, not the customer the 403 withheld.
    const log = (await get('/api/v1/rm/access-log', arjun)).json<RmAccessLog>()
    assert.equal(log.entries[0]?.name, KARAN_CIF)
    // Meera's 404 on a cif nobody holds names no customer, so there is nothing to log it against.
    const meeras = await root.deps.rmActivity.listAccess('rm-204117', 50)
    assert.ok(meeras.every((e) => e.cif !== 'IDBI0000000000'))
  })

  it('keeps the mobile picker to exactly the four heroes, in their order', async () => {
    const res = await root.app.inject({ method: 'GET', url: '/api/v1/customers' })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(
      res.json<CustomersResponse>().map((c) => c.name),
      ['Karan Deshpande', 'Rohan Mehta', 'Priya Nair', 'Sunil Kumar'],
    )
    // While the source holds all fifty for the book.
    assert.equal((await root.deps.bank.listPopulation()).length, 50)
  })

  it('answers Today: four KPIs, a queue of ten led by the engine’s ranking, the next 30 days', async () => {
    const res = await get('/api/v1/rm/today', meera)
    assert.equal(res.statusCode, 200, res.body)
    const t = res.json<RmToday>()
    assert.deepEqual(
      t.kpis.map((k) => k.id),
      ['book_value', 'sip_book', 'goals_on_track', 'open_handoffs'],
    )
    assert.equal(t.queue.length, 10)
    assert.ok(t.queue.every((q) => q.signal !== null && q.why.length > 0 && q.opener.length > 0))
    // Urgent first: nothing in the queue outranks an urgent signal placed after it.
    const severities = t.queue.map((q) => q.signal?.severity)
    const firstNonUrgent = severities.findIndex((s) => s !== 'urgent')
    if (firstNonUrgent !== -1) {
      assert.ok(severities.slice(firstNonUrgent).every((s) => s !== 'urgent'))
    }
    // Until the activity side lands, no handoff and no refusal: an empty list, never a failure.
    assert.ok(Array.isArray(t.handoffs))
    assert.ok(Array.isArray(t.refusals))
    for (const u of t.upcoming) assert.ok(u.date >= '2026-09-01' && u.date <= '2026-10-01', u.date)
    const dates = t.upcoming.map((u) => u.date)
    assert.deepEqual(dates, [...dates].sort())
  })

  it('charts no balance growth the ledger did not book: every month is its rows’ net', async () => {
    /*
     * For every customer, each month's change in the balance series equals the net of that
     * month's rows on the accounts the series counts. A declared deposit with no rows stepped in
     * on its opening date used to break this by its whole principal: Meher's ₹12 lakh in
     * January, Rajesh's ₹10 lakh in March, Suresh's ₹5 lakh in October, none of it funded by a
     * line on any statement, and all of it in the book's line on Today and Insights.
     */
    const m = (await get('/api/v1/rm/book', meera)).json<RmBook>()
    const a = (await get('/api/v1/rm/book', arjun)).json<RmBook>()
    const cifs = [...m.rows, ...a.rows].map((r) => r.cif)
    assert.equal(cifs.length, ALL_PERSONAS.length, 'every persona is in somebody’s book')

    for (const cif of cifs) {
      const state = await root.services.rmBook.state(cif)
      const series = state.balanceSeries
      const counted = state.ledgers.filter(isBalanceAccount)
      for (let i = 1; i < series.length; i += 1) {
        const prev = series[i - 1]
        const point = series[i]
        if (prev === undefined || point === undefined) continue
        const from = monthEnd(prev.month)
        const to = monthEnd(point.month)
        let net = 0
        for (const account of counted) {
          for (const t of account.transactions) {
            if (t.txnDate <= from || t.txnDate > to) continue
            net += t.txnType === 'CREDIT' ? t.txnAmount : -t.txnAmount
          }
        }
        // A rupee either way: each point is rounded on its own.
        assert.ok(
          Math.abs(point.total - prev.total - net) <= 1,
          `${cif} ${point.month}: series moved ${point.total - prev.total}, the ledger ${Math.round(net)}`,
        )
      }
    }
  })

  it('speaks of every customer in the third person, grammatically', async () => {
    for (const [token, book] of [
      [meera, (await get('/api/v1/rm/book', meera)).json<RmBook>()],
      [arjun, (await get('/api/v1/rm/book', arjun)).json<RmBook>()],
    ] as const) {
      for (const row of book.rows) {
        const res = await get(`/api/v1/rm/customers/${row.cif}`, token)
        assert.equal(res.statusCode, 200, res.body)
        const found = MISVOICED.exec(res.body)
        assert.equal(found, null, `${row.name}: “…${found?.[0] ?? ''}…”`)
      }
    }
  })

  it('names the month the book value moved in, not "this month"', async () => {
    // The RM clock is 1 September and the series ends at August's close.
    const t = (await get('/api/v1/rm/today', meera)).json<RmToday>()
    const value = t.kpis.find((k) => k.id === 'book_value')
    assert.equal(value?.deltaLabel, 'in month-end balances over August')
  })

  it('answers Insights: twelve months aligned across every ledger series', async () => {
    const res = await get('/api/v1/rm/insights', meera)
    assert.equal(res.statusCode, 200, res.body)
    const i = res.json<RmInsights>()
    assert.equal(i.months.length, 12)
    assert.equal(i.months[11], '2026-08')
    for (const key of ['bookBalance', 'withIdbi', 'inflow', 'outflow', 'sipBook'] as const) {
      assert.equal(i.series[key].length, 12, key)
    }
    const g = i.goalHealth
    assert.equal(g.on_track + g.at_risk + g.off_track, 38)
    assert.equal(
      i.allocation.bySegment.reduce((s, x) => s + x.customers, 0),
      38,
    )
    assert.ok(i.signals.length > 0)
    assert.ok(i.topMovers.length <= 5)
  })

  it('gives every idea one definition: as at the RM clock in a headline, month-ends in a chart', async () => {
    const book = (await get('/api/v1/rm/book', meera)).json<RmBook>()
    const today = (await get('/api/v1/rm/today', meera)).json<RmToday>()
    const insights = (await get('/api/v1/rm/insights', meera)).json<RmInsights>()
    const basis = {
      asOf: '2026-09-01',
      asOfLabel: 'As at 1 Sep 2026',
      seriesFrom: '2025-09',
      seriesTo: '2026-08',
      lastMonthEnd: '2026-08-31',
      seriesLabel: '12 month-ends, Sep 2025 to Aug 2026',
      lastMonthEndLabel: 'Month-end, 31 Aug 2026',
    }
    assert.deepEqual(book.basis, basis)
    assert.deepEqual(today.basis, basis)
    assert.deepEqual(insights.basis, basis)

    // With IDBI and the wallet share: the same sums on Book and Insights, as at the clock.
    // To the paisa, as the totals are rounded.
    const sum = (f: (r: RmBook['rows'][number]) => number) =>
      Math.round(book.rows.reduce((n, r) => n + f(r), 0) * 100) / 100
    assert.equal(
      book.totals.withIdbi,
      sum((r) => r.withIdbi),
    )
    assert.equal(insights.asAt.withIdbi, book.totals.withIdbi)
    assert.equal(insights.asAt.balances, book.totals.balances)
    assert.equal(insights.asAt.walletSharePct, book.totals.walletSharePct)
    assert.equal(
      book.totals.walletSharePct,
      Math.round((book.totals.withIdbi / book.totals.balances) * 1000) / 10,
    )
    assert.equal(insights.asAt.relationshipValue, book.totals.relationshipValue)
    // The chart's last point is a month-end, and a different figure: payday falls between.
    assert.notEqual(insights.series.withIdbi.at(-1), insights.asAt.withIdbi)

    // The SIP book is registered SIPs everywhere; the statements' debits are their own series.
    const kpi = (id: string) => today.kpis.find((k) => k.id === id)
    assert.equal(kpi('sip_book')?.value, book.totals.sipMonthly)
    assert.equal(insights.asAt.sipMonthly, book.totals.sipMonthly)
    assert.equal(insights.asAt.sipCustomers, book.rows.filter((r) => r.sipMonthly > 0).length)
    assert.deepEqual(insights.series.sipDebits, insights.series.sipBook)
    assert.equal(insights.seriesLabels.sipDebits, 'SIP debits per statements, each month')
    assert.match(kpi('sip_book')?.deltaLabel ?? '', /^registered SIPs · \d+ of 38 customers$/)
    assert.equal(kpi('book_value')?.value, book.totals.relationshipValue)
    assert.equal(kpi('book_value')?.seriesLabel, 'Month-end balances, Sep 2025 to Aug 2026')

    // Goals on track: nine customers out of thirty-eight, never 23.7%.
    const onTrack = book.rows.filter((r) => r.goal.health === 'on_track').length
    assert.deepEqual(
      [kpi('goals_on_track')?.value, kpi('goals_on_track')?.unit, kpi('goals_on_track')?.outOf],
      [onTrack, 'count', 38],
    )
    assert.equal(insights.goalHealth.on_track, onTrack)

    // One customer: the header's share is the row's, as at the clock; the chart is month-ends.
    const row = book.rows.find((r) => r.cif === KARAN_CIF)
    const c = (await get(`/api/v1/rm/customers/${KARAN_CIF}`, meera)).json<Customer360>()
    assert.deepEqual(c.basis, basis)
    assert.equal(c.money.withIdbi, row?.withIdbi)
    assert.equal(c.money.walletSharePct, row?.walletSharePct)
    assert.equal(
      c.money.walletSharePct,
      Math.round((c.money.withIdbi / c.money.balances) * 1000) / 10,
    )
    assert.equal(c.money.balanceSeries.at(-1)?.month, basis.seriesTo)
  })

  it('carries every signal on a row, so a tab and the rail see what the file sees', async () => {
    const book = (await get('/api/v1/rm/book', meera)).json<RmBook>()
    let behindTop = 0
    for (const row of book.rows) {
      assert.equal(row.signals.length, row.signalCount, row.name)
      assert.deepEqual(row.signals[0] ?? null, row.topSignal, row.name)
      assert.deepEqual(row.signalKinds, [...new Set(row.signals.map((s) => s.kind))], row.name)
      if (row.signalKinds.includes('idle_cash') && row.topSignal?.kind !== 'idle_cash')
        behindTop += 1
    }
    const idle = book.rows.filter((r) => r.signalKinds.includes('idle_cash')).length
    assert.equal(book.segments.find((s) => s.id === 'idle_cash')?.count, idle)
    assert.ok(behindTop > 0, 'some idle cash ranks below a bigger signal, and is still counted')
  })

  it('gives the customer file its own next thirty days and the money its goal is in', async () => {
    const today = (await get('/api/v1/rm/today', meera)).json<RmToday>()
    const book = (await get('/api/v1/rm/book', meera)).json<RmBook>()
    let items = 0
    for (const row of book.rows) {
      const c = (await get(`/api/v1/rm/customers/${row.cif}`, meera)).json<Customer360>()
      assert.deepEqual(
        c.upcoming,
        today.upcoming.filter((u) => u.cif === row.cif),
        row.name,
      )
      items += c.upcoming.length
      assert.ok(['today', 'at_horizon'].includes(c.goal.amountBasis), row.name)
      assert.equal(row.goal.amountBasis, c.goal.amountBasis, row.name)
    }
    assert.equal(items, today.upcoming.length)
    assert.ok(items > 0)
  })
})
