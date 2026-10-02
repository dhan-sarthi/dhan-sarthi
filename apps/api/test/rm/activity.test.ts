/**
 * The activity behind the book, with the simulator run to the end over the whole population.
 *
 * One root for the file: laying fifty journeys down is about seventy seconds of real engine
 * work (twelve months of derivations and decisions per customer), and every test here reads what
 * that one run wrote. The tests that write (a note, a handoff's status, a tampered record) run
 * last and put back what they change where a later test would read it.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { addDays, addMonths, ruleBook } from '@dhan/core'
import { BOOK_ACTIVITY, PERSONAS, RM_ASSIGNMENTS } from '@dhan/fixtures'
import type {
  AdviceRecord,
  ErrorBody,
  RmAccessLog,
  RmBook,
  RmBookVerification,
  RmCustomerRecord,
  RmCustomerVerification,
  RmHandoffResponse,
  RmInsights,
  RmJourney,
  RmNoteResponse,
  RmRefusals,
  RmRevealResponse,
  RmToday,
} from '@dhan/contracts'
import { HISTORY_RESOLVED_DAYS, handoffStatus } from '../../src/application/rm/activity.service.ts'
import { JOURNEY_MONTHS, isJourney } from '../../src/application/rm/simulator.ts'
import type { Session } from '../../src/ports/index.ts'
import { ANCHOR, ARJUN, MEERA, bearer, makeRoot, signInRm } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const ULIP = 'LIC_ULIP_401'
const MEERA_ID = 'rm-204117'
const ARJUN_ID = 'rm-204388'

const BOOK = Object.entries(BOOK_ACTIVITY)
const HEROES = PERSONAS.map((p) => p.customer.cif)

/** A second person left in a sentence written for the RM. */
const SECOND_PERSON = /\byou(r|rs|rself|'re|'ve)?\b/i

describe('the activity behind the book', () => {
  let root: TestRoot
  let meera: string
  let arjun: string

  before(async () => {
    root = await makeRoot({ env: { RM_SIMULATE: '1' } })
    await root.rm.simulator.ready()
    meera = (await signInRm(root.app, MEERA)).token
    arjun = (await signInRm(root.app, ARJUN)).token
  })
  after(() => root.close())

  const get = (url: string, token = meera) =>
    root.app.inject({ method: 'GET', url, headers: bearer(token) })
  const send = (method: 'POST' | 'PATCH', url: string, payload?: object, token = meera) =>
    root.app.inject({
      method,
      url,
      headers: bearer(token),
      ...(payload === undefined ? {} : { payload }),
    })

  async function journeySession(cif: string): Promise<Session> {
    const journeys = (await root.deps.sessions.listByCif(cif)).filter(isJourney)
    assert.equal(journeys.length, 1, `${cif}: one journey session`)
    const [session] = journeys
    assert.ok(session)
    return session
  }

  async function recordsOf(cif: string): Promise<AdviceRecord[]> {
    const out: AdviceRecord[] = []
    for (const s of await root.deps.sessions.listByCif(cif)) {
      out.push(...(await root.deps.audit.listForSession(s.id)).adviceRecords)
    }
    return out
  }

  it('ran over every customer in a book and finished', () => {
    const report = root.rm.simulator.report()
    assert.ok(report)
    assert.equal(report.failed, 0)
    assert.equal(report.simulated, BOOK.length + HEROES.length)
  })

  it('gives every book customer one journey session: twelve months, in order, back at the clock', async () => {
    const months = Array.from({ length: JOURNEY_MONTHS }, (_, i) =>
      addMonths(ANCHOR, i - JOURNEY_MONTHS).slice(0, 7),
    )
    for (const [cif] of BOOK) {
      const session = await journeySession(cif)
      // Home where `create` left it: the session reads like any other at the RM clock.
      assert.equal(session.asOf, ANCHOR, cif)

      const versions = await root.deps.snapshots.listRoadmaps(session.id)
      assert.equal(versions[0]?.atSim, addMonths(ANCHOR, -JOURNEY_MONTHS), cif)
      const trail = await root.deps.audit.listForSession(session.id)
      const decided = new Set(trail.decisions.map((d) => d.atSim.slice(0, 7)))
      for (const m of months) assert.ok(decided.has(m), `${cif}: a decision in ${m}`)

      // Written in simulated order: the chain and the plan versions never step back in time,
      // which is what asking each question inside the walk (not after it) is for.
      const inOrder = (dates: string[]): boolean =>
        dates.every((d, i) => i === 0 || d >= dates[i - 1]!)
      assert.ok(inOrder(trail.adviceRecords.map((r) => r.atSim)), `${cif}: chain in date order`)
      assert.ok(inOrder(versions.map((v) => v.atSim)), `${cif}: versions in date order`)
      assert.ok((await root.deps.audit.verifyChain(session.id)).ok, cif)
    }
  })

  it('asks each enquiry through the text path, on the month it was asked', async () => {
    for (const [cif, activity] of BOOK) {
      const records = (await root.deps.audit.listForSession((await journeySession(cif)).id))
        .adviceRecords
      for (const e of activity.enquiries) {
        const at = addMonths(ANCHOR, -e.monthsAgo)
        const asked = records.filter(
          (r) => r.source === 'text' && r.productId === e.productId && r.atSim === at,
        )
        assert.equal(asked.length, 1, `${cif}: ${e.productId} on ${at}`)
        assert.equal(asked[0]?.amount, e.amount)
        assert.equal(asked[0]?.actionId, null)
      }
      // Nothing else went through the text path: only what the customer asked.
      const text = records.filter((r) => r.source === 'text')
      assert.equal(text.length, activity.enquiries.length, cif)
    }
  })

  it('refuses every ULIP a book customer asked about, and the book counts each refusal', async () => {
    const askers = BOOK.filter(([, a]) => a.enquiries.some((e) => e.productId === ULIP))
    assert.ok(askers.length >= 5, 'the fixtures have ULIP enquiries to refuse')
    for (const [cif] of askers) {
      const refused = (await recordsOf(cif)).filter(
        (r) => r.productId === ULIP && r.verdict === 'BLOCKED',
      )
      assert.ok(refused.length >= 1, `${cif}: the ULIP was refused`)
    }

    let blocked = 0
    for (const [token, rmId] of [
      [meera, MEERA_ID],
      [arjun, ARJUN_ID],
    ] as const) {
      const book = (await get('/api/v1/rm/book', token)).json<RmBook>()
      const refusals = (await get('/api/v1/rm/refusals', token)).json<RmRefusals>()
      let expected = 0
      for (const row of book.rows) {
        assert.equal(RM_ASSIGNMENTS[row.cif], rmId)
        const own = (await recordsOf(row.cif)).filter((r) => r.verdict === 'BLOCKED').length
        assert.equal(row.refusals, own, `${row.cif}: the row counts its refusals`)
        expected += own
      }
      assert.equal(refusals.total, expected)
      assert.equal(refusals.items.length, expected)
      assert.ok(refusals.items.every((r) => r.verdict === 'BLOCKED' && r.spoken !== null))
      assert.ok(refusals.items.every((r, i, all) => i === 0 || all[i - 1]!.at >= r.at))
      assert.equal(
        refusals.byRule.reduce((n, r) => n + r.count, 0),
        expected,
      )
      const described = new Map(ruleBook.map((r) => [r.id, r.description]))
      for (const r of refusals.byRule) assert.equal(r.label, described.get(r.ruleId))
      blocked += expected
    }
    assert.ok(blocked > 0)
  })

  it('opens a handoff for each recent request and none for history alone', async () => {
    for (const [token, rmId] of [
      [meera, MEERA_ID],
      [arjun, ARJUN_ID],
    ] as const) {
      const recent = BOOK.filter(([cif, a]) => a.recentHandoff && RM_ASSIGNMENTS[cif] === rmId)
      assert.ok(recent.length > 0, `${rmId} has requests waiting`)

      const today = (await get('/api/v1/rm/today', token)).json<RmToday>()
      assert.deepEqual(today.handoffs.map((h) => h.cif).sort(), recent.map(([cif]) => cif).sort())
      for (const h of today.handoffs) {
        const activity = BOOK_ACTIVITY[h.cif]
        assert.equal(h.status, 'open')
        assert.equal(h.waitingDays, activity?.handoffDaysAgo)
        assert.equal(h.requestedOn, addDays(ANCHOR, -(activity?.handoffDaysAgo ?? 0)))
        assert.ok(h.reason.length > 0 && !SECOND_PERSON.test(h.reason), h.reason)
      }
      // Oldest first, and the queue leads with them.
      assert.ok(
        today.handoffs.every((h, i, all) => i === 0 || all[i - 1]!.requestedOn <= h.requestedOn),
      )
      const queued = today.queue.filter((q) => q.source === 'handoff').map((q) => q.cif)
      assert.deepEqual(
        today.queue.slice(0, queued.length).map((q) => q.cif),
        queued,
      )
      assert.equal(queued.length, recent.length)

      const book = (await get('/api/v1/rm/book', token)).json<RmBook>()
      for (const row of book.rows) {
        assert.equal(row.openHandoff, BOOK_ACTIVITY[row.cif]?.recentHandoff ?? false, row.cif)
      }
      assert.equal(book.totals.openHandoffs, recent.length)
    }

    // A customer with history's requests only: on the journey, every one resolved by history.
    let historyRequests = 0
    for (const [cif, activity] of BOOK) {
      if (activity.recentHandoff) continue
      const token = RM_ASSIGNMENTS[cif] === MEERA_ID ? meera : arjun
      const journey = (await get(`/api/v1/rm/customers/${cif}/journey`, token)).json<RmJourney>()
      for (const e of journey.events.filter((x) => x.kind === 'handoff')) {
        historyRequests += 1
        assert.ok(e.at < addDays(ANCHOR, -HISTORY_RESOLVED_DAYS), `${cif}: ${e.at} is history`)
        assert.match(e.detail ?? '', /Resolved\.$/)
      }
    }
    assert.ok(historyRequests > 0, 'history wrote requests for the rule to resolve')
  })

  it('resolves a request by history only once it is older than thirty days', () => {
    const asOf = ANCHOR
    assert.equal(handoffStatus(addDays(asOf, -HISTORY_RESOLVED_DAYS), [], asOf).status, 'open')
    assert.equal(
      handoffStatus(addDays(asOf, -HISTORY_RESOLVED_DAYS - 1), [], asOf).status,
      'resolved',
    )
    // The desk's own last change wins either way, a history request included.
    const contacted = [{ status: 'contacted' as const, note: 'Called' }]
    assert.deepEqual(handoffStatus(addDays(asOf, -200), contacted, asOf), {
      status: 'contacted',
      note: 'Called',
    })
    assert.equal(
      handoffStatus(asOf, [...contacted, { status: 'resolved', note: null }], asOf).status,
      'resolved',
    )
  })

  it('gives the heroes the same journey when nobody has opened them yet', async () => {
    for (const cif of HEROES) {
      const session = await journeySession(cif)
      const trail = await root.deps.audit.listForSession(session.id)
      assert.ok(trail.decisions.length >= JOURNEY_MONTHS, cif)
      // No enquiries and no recent request: those are the book's, and a hero's come from a person.
      assert.ok(
        trail.adviceRecords.every((r) => r.source !== 'text'),
        cif,
      )
    }
    const journey = (await get(`/api/v1/rm/customers/${HEROES[0]}/journey`)).json<RmJourney>()
    assert.ok(journey.events.some((e) => e.kind === 'plan'))
    assert.ok(journey.events.some((e) => e.kind === 'decision'))
  })

  it('reads a journey newest first, in the third person, with what changed on each plan', async () => {
    const [cif] = BOOK.find(([c, a]) => a.enquiries.length > 1 && RM_ASSIGNMENTS[c] === MEERA_ID)!
    const res = await get(`/api/v1/rm/customers/${cif}/journey`)
    assert.equal(res.statusCode, 200, res.body)
    const { events } = res.json<RmJourney>()
    assert.ok(
      events.every((e, i) => i === 0 || events[i - 1]!.at >= e.at),
      'newest first',
    )
    const kinds = new Set(events.map((e) => e.kind))
    for (const k of ['joined', 'plan', 'decision', 'advice', 'handoff'] as const) {
      assert.ok(kinds.has(k), `a ${k} event`)
    }
    const plans = events.filter((e) => e.kind === 'plan')
    assert.ok(
      plans.every((p) => (p.diff?.length ?? 0) > 0),
      'a plan event says what moved',
    )
    const first = plans[plans.length - 1]
    assert.equal(first?.title, 'First plan')
    assert.ok(first?.diff?.every((d) => d.before === null))
    for (const e of events) {
      if (e.kind === 'ledger') continue
      assert.ok(!SECOND_PERSON.test(e.title), e.title)
      assert.ok(!SECOND_PERSON.test(e.detail ?? ''), `${e.kind}: ${e.detail}`)
    }
    // The record keeps what the customer heard, word for word.
    const record = (await get(`/api/v1/rm/customers/${cif}/record`)).json<RmCustomerRecord>()
    const refused = record.records.find((r) => r.verdict === 'BLOCKED')
    if (refused) assert.match(refused.spoken ?? '', /\byou/i)
    assert.equal(record.chains, 1)
  })

  it('counts the activity month by month on Insights', async () => {
    const insights = (await get('/api/v1/rm/insights')).json<RmInsights>()
    assert.equal(insights.series.activity.length, insights.months.length)
    assert.ok(insights.series.activity.every((n) => n > 0))
    assert.ok(insights.refusalsByRule.length > 0)
  })

  it('verifies every chain, and finds the record that was altered in the store', async () => {
    const [cif] = BOOK.find(([c, a]) => a.enquiries.length > 0 && RM_ASSIGNMENTS[c] === MEERA_ID)!
    const session = await journeySession(cif)
    const url = `/api/v1/rm/customers/${cif}/record/verify`

    const clean = (await send('POST', url)).json<RmCustomerVerification>()
    assert.equal(clean.valid, true)
    const length = (await root.deps.audit.listForSession(session.id)).adviceRecords.length
    assert.equal(clean.checked, length)
    assert.deepEqual(clean.chains, [
      { chainId: session.id, records: length, valid: true, brokenAt: null },
    ])
    const book = (await send('POST', '/api/v1/rm/refusals/verify')).json<RmBookVerification>()
    assert.equal(book.valid, true)
    assert.ok(book.checked >= length)

    // The memory store hands back its own rows: change one, as an edit to the table would.
    const target = (await root.deps.audit.listForSession(session.id)).adviceRecords[1]
    assert.ok(target)
    const original = target.recorded
    target.recorded = 'Passed. (edited after the fact)'
    try {
      const caught = (await send('POST', url)).json<RmCustomerVerification>()
      assert.equal(caught.valid, false)
      assert.equal(caught.chains[0]?.brokenAt, target.id)
      const all = (await send('POST', '/api/v1/rm/refusals/verify')).json<RmBookVerification>()
      assert.equal(all.valid, false)
      assert.deepEqual(all.broken, [{ cif, chainId: session.id, brokenAt: target.id }])
    } finally {
      target.recorded = original
    }
    assert.equal((await send('POST', url)).json<RmCustomerVerification>().valid, true)
  })

  it('writes a note, a contact and a reveal, each with an access entry', async () => {
    const [cif] = BOOK.find(([c, a]) => a.recentHandoff && RM_ASSIGNMENTS[c] === MEERA_ID)!
    const log = async () => (await get('/api/v1/rm/access-log')).json<RmAccessLog>().entries

    const noted = await send('POST', `/api/v1/rm/customers/${cif}/notes`, {
      kind: 'call',
      text: 'Spoke about the card. Will move ₹20,000 on payday.',
    })
    assert.equal(noted.statusCode, 200, noted.body)
    const event = noted.json<RmNoteResponse>().event
    assert.equal(event.kind, 'call')
    assert.equal(event.at, ANCHOR)
    let entries = await log()
    assert.deepEqual([entries[0]?.cif, entries[0]?.action], [cif, 'noted'])
    const journey = (await get(`/api/v1/rm/customers/${cif}/journey`)).json<RmJourney>()
    assert.equal(journey.events[0]?.id, event.id)

    const [open] = (await get('/api/v1/rm/today'))
      .json<RmToday>()
      .handoffs.filter((h) => h.cif === cif)
    assert.ok(open)
    const contacted = await send('PATCH', `/api/v1/rm/handoffs/${open.id}`, {
      status: 'contacted',
      note: 'Called back, meeting on Friday.',
    })
    assert.equal(contacted.statusCode, 200, contacted.body)
    assert.deepEqual(
      [
        contacted.json<RmHandoffResponse>().handoff.status,
        contacted.json<RmHandoffResponse>().handoff.note,
      ],
      ['contacted', 'Called back, meeting on Friday.'],
    )
    entries = await log()
    assert.deepEqual(
      [entries[0]?.action, entries[0]?.detail],
      ['contacted', 'Called back, meeting on Friday.'],
    )
    let today = (await get('/api/v1/rm/today')).json<RmToday>()
    assert.equal(today.handoffs.find((h) => h.id === open.id)?.status, 'contacted')
    let row = (await get('/api/v1/rm/book')).json<RmBook>().rows.find((r) => r.cif === cif)
    assert.equal(row?.openHandoff, false, 'contacted is no longer waiting')

    const resolved = await send('PATCH', `/api/v1/rm/handoffs/${open.id}`, { status: 'resolved' })
    assert.equal(resolved.statusCode, 200, resolved.body)
    today = (await get('/api/v1/rm/today')).json<RmToday>()
    assert.ok(!today.handoffs.some((h) => h.id === open.id), 'resolved leaves the inbox')
    row = (await get('/api/v1/rm/book')).json<RmBook>().rows.find((r) => r.cif === cif)
    assert.equal(row?.openHandoff, false)

    const revealed = await send('POST', `/api/v1/rm/customers/${cif}/reveal`, {
      field: 'dateOfBirth',
      reason: 'Verifying identity on a call',
    })
    assert.equal(revealed.statusCode, 200, revealed.body)
    const customer = await root.deps.bank.getCustomer(cif)
    assert.deepEqual(revealed.json<RmRevealResponse>(), {
      field: 'dateOfBirth',
      value: customer.dateOfBirth,
    })
    entries = await log()
    assert.deepEqual(
      [entries[0]?.action, entries[0]?.purpose, entries[0]?.detail, entries[0]?.name],
      ['revealed', 'Verifying identity on a call', 'dateOfBirth', customer.custName],
    )
  })

  it('refuses Arjun a handoff in Meera’s book with 403, and an unknown one with 404', async () => {
    const [handoff] = (await get('/api/v1/rm/today')).json<RmToday>().handoffs
    assert.ok(handoff, 'Meera still has a request waiting')
    const before = (await get('/api/v1/rm/access-log', arjun)).json<RmAccessLog>().entries.length

    const theirs = await send(
      'PATCH',
      `/api/v1/rm/handoffs/${handoff.id}`,
      { status: 'resolved' },
      arjun,
    )
    assert.equal(theirs.statusCode, 403)
    assert.equal(theirs.json<ErrorBody>().code, 'FORBIDDEN')
    const still = (await get('/api/v1/rm/today'))
      .json<RmToday>()
      .handoffs.find((h) => h.id === handoff.id)
    assert.equal(still?.status, 'open', 'nothing was written')
    const afterLog = (await get('/api/v1/rm/access-log', arjun)).json<RmAccessLog>().entries.length
    assert.equal(afterLog, before)

    const nobody = await send('PATCH', '/api/v1/rm/handoffs/no-such-handoff', {
      status: 'contacted',
    })
    assert.equal(nobody.statusCode, 404)
    assert.equal(nobody.json<ErrorBody>().code, 'NOT_FOUND')
  })
})
