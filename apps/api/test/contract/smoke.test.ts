/**
 * The demo walk, end to end through the real routes on the memory profile: pick Rohan, read
 * the figures the web app computes today, move the clock, decide, verify the record, refuse the
 * ULIP in text, page the statement, erase. Every body is what the registry declares, because
 * the registrar parses it on the way out.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
  Answer,
  ChainVerification,
  DecisionResponse,
  ErrorBody,
  EvaluateResponse,
  RecordView,
  SessionState,
  ShelfResponse,
  TransactionsPage,
  View,
} from '@dhan/contracts'
import { ANCHOR, ROHAN_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('the demo walk on the memory profile', () => {
  let root: TestRoot
  let token: string
  let session: SessionState

  before(async () => {
    root = await makeRoot()
    const created = await createSession(root.app, ROHAN_CIF)
    token = created.token
    session = created.session
  })
  after(() => root.close())

  async function get(url: string, headers: Record<string, string> = {}) {
    return root.app.inject({ method: 'GET', url, headers: { ...bearer(token), ...headers } })
  }

  async function post(
    url: string,
    payload: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    return root.app.inject({
      method: 'POST',
      url,
      headers: { ...bearer(token), ...headers },
      payload,
    })
  }

  it('starts at the anchor with a week to talk about', () => {
    assert.equal(session.asOf, ANCHOR)
    assert.equal(session.lastSeen, '2026-08-26')
    assert.equal(session.version, 1)
    assert.equal(session.capabilities.simulatedClock, true)
    assert.equal(session.capabilities.avatar, 'none')
    assert.deepEqual(session.ledgerHorizon, { from: '2024-10-01', to: '2028-03-01' })
  })

  it("renders Rohan's View with the figures the browser engine computes today", async () => {
    const res = await get('/api/v1/view')
    assert.equal(res.statusCode, 200)
    const view = res.json<View>()
    // Paise, because a statement with an electricity bill and a GST line on it has paise.
    assert.equal(view.snapshot.balances.idleFloor, 141_663.35)
    assert.equal(view.snapshot.surplus.deployable, 10_933)
    assert.equal(view.snapshot.income.monthly, 85_000)
    assert.equal(view.snapshot.debt.endingSoon?.monthsLeft, 5)
    assert.equal(view.goal.kind, 'retirement')
    assert.equal(view.roadmap.version, 1)
    assert.equal(view.meta.tier, 'server')
    assert.equal(view.meta.source, 'memory')
    assert.equal(view.meta.roadmapVersion, 1)
    assert.equal(view.meta.dataFreshnessDate, ANCHOR)
    assert.ok(view.plan.primary)
    assert.equal(view.shelf.length, 15)
    assert.equal(view.rules.length, 9)

    // ETag: the same View a second time is a 304.
    const etag = res.headers['etag']
    assert.ok(typeof etag === 'string' && etag.includes(view.meta.snapshotId))
    const again = await get('/api/v1/view', { 'if-none-match': etag })
    assert.equal(again.statusCode, 304)
    assert.equal(res.headers['cache-control'], 'private, no-store')
  })

  it('moves the clock twice and the View moves with it', async () => {
    const first = await post('/api/v1/session/clock', { advanceDays: 30, expectedVersion: 1 })
    assert.equal(first.statusCode, 200, first.body)
    const s1 = first.json<SessionState>()
    assert.equal(s1.asOf, '2026-10-01')
    assert.equal(s1.lastSeen, ANCHOR)
    assert.equal(s1.version, 2)

    const v1 = (await get('/api/v1/view')).json<View>()
    assert.equal(v1.meta.asOf, '2026-10-01')
    assert.equal(v1.snapshot.debt.endingSoon?.monthsLeft, 4)
    assert.equal(v1.plan.since.from, ANCHOR)
    assert.ok(v1.plan.since.spent > 0)
    assert.equal(v1.meta.roadmapVersion, 2)

    // A stale tab moves nothing.
    const stale = await post('/api/v1/session/clock', { advanceDays: 30, expectedVersion: 1 })
    assert.equal(stale.statusCode, 409)
    assert.equal(stale.json<ErrorBody>().code, 'STALE_CLOCK')

    const second = await post('/api/v1/session/clock', { advanceDays: 30, expectedVersion: 2 })
    assert.equal(second.statusCode, 200)
    const v2 = (await get('/api/v1/view')).json<View>()
    assert.equal(v2.meta.asOf, '2026-10-31')
    assert.notEqual(v2.meta.snapshotId, v1.meta.snapshotId)

    const beyond = await post('/api/v1/session/clock', { advanceDays: 30, expectedVersion: 99 })
    assert.equal(beyond.statusCode, 409)
  })

  it('refuses a clock past the seeded horizon', async () => {
    const other = await createSession(root.app, ROHAN_CIF)
    let version = other.session.version
    for (let i = 0; i < 18; i += 1) {
      const res = await root.app.inject({
        method: 'POST',
        url: '/api/v1/session/clock',
        headers: bearer(other.token),
        payload: { advanceDays: 30, expectedVersion: version },
      })
      assert.equal(res.statusCode, 200, res.body)
      version = res.json<SessionState>().version
    }
    const res = await root.app.inject({
      method: 'POST',
      url: '/api/v1/session/clock',
      headers: bearer(other.token),
      payload: { advanceDays: 30, expectedVersion: version },
    })
    assert.equal(res.statusCode, 422)
    assert.equal(res.json<ErrorBody>().code, 'CLOCK_BEYOND_SEEDED_HORIZON')
  })

  it('records a decision, re-cuts the plan and keeps the chain intact', async () => {
    const view = (await get('/api/v1/view')).json<View>()
    const primary = view.plan.primary
    assert.ok(primary)

    const missing = await post(`/api/v1/actions/${primary.id}/decision`, { kind: 'did_it' })
    assert.equal(missing.statusCode, 400)
    assert.equal(missing.json<ErrorBody>().code, 'IDEMPOTENCY_KEY_REQUIRED')

    const res = await post(
      `/api/v1/actions/${primary.id}/decision`,
      { kind: 'did_it' },
      { 'idempotency-key': 'smoke-decision-1' },
    )
    assert.equal(res.statusCode, 200, res.body)
    const decided = res.json<DecisionResponse>()
    assert.equal(decided.decision.actionId, primary.id)
    assert.equal(decided.decision.amount, primary.amount)
    assert.equal(decided.decision.shown, primary.label)
    assert.equal(decided.decision.atSim, '2026-10-31')
    assert.ok(decided.adviceRecord)
    assert.equal(decided.adviceRecord.source, 'screen')
    assert.equal(decided.adviceRecord.verdict, 'PASS')
    assert.equal(decided.adviceRecord.prevHash, '0'.repeat(64))
    assert.equal(decided.roadmapVersion, view.meta.roadmapVersion + 1)

    // Replay: the same answer, marked as such. A different body under the key is refused.
    const replay = await post(
      `/api/v1/actions/${primary.id}/decision`,
      { kind: 'did_it' },
      { 'idempotency-key': 'smoke-decision-1' },
    )
    assert.equal(replay.statusCode, 200)
    assert.equal(replay.headers['idempotent-replayed'], 'true')
    assert.equal(replay.json<DecisionResponse>().decision.id, decided.decision.id)
    const mismatch = await post(
      `/api/v1/actions/${primary.id}/decision`,
      { kind: 'declined' },
      { 'idempotency-key': 'smoke-decision-1' },
    )
    assert.equal(mismatch.statusCode, 409)
    assert.equal(mismatch.json<ErrorBody>().code, 'IDEMPOTENCY_MISMATCH')

    // A second decision on the same action, under a new key, is a conflict, not a second row.
    const twice = await post(
      `/api/v1/actions/${primary.id}/decision`,
      { kind: 'declined' },
      { 'idempotency-key': 'smoke-decision-2' },
    )
    assert.equal(twice.statusCode, 409)

    const record = (await get('/api/v1/record')).json<RecordView>()
    assert.equal(record.decisions.length, 1)
    assert.equal(record.adviceRecords.length, 1)
    assert.equal(record.chainVerified, true)
    assert.equal(record.consent?.consentId, 'CONS_SYN_1')
    assert.ok(record.provenance?.contentSha256)
    assert.ok(record.roadmapVersions.length >= 4)
    assert.match(record.roadmapVersions.at(-1)?.reasonForChange ?? '', /Re-cut after 1 decision/)

    const verify = (await get('/api/v1/record/verify')).json<ChainVerification>()
    assert.deepEqual(verify, { ok: true, length: 1 })
  })

  it('refuses the ULIP in text and writes the verdict to the record', async () => {
    const res = await post('/api/v1/suitability/evaluate', {
      productId: 'LIC_ULIP_401',
      amount: 5000,
    })
    assert.equal(res.statusCode, 200, res.body)
    const { verdict, adviceRecordId } = res.json<EvaluateResponse>()
    assert.equal(verdict.verdict, 'BLOCKED')
    assert.equal(verdict.ruleId, 'BUNDLED_PROTECTION')
    assert.equal(verdict.alternative?.productId, 'LIC_TERM_201')

    const unknown = await post('/api/v1/suitability/evaluate', { productId: 'NOPE', amount: 1 })
    assert.equal(unknown.statusCode, 404)

    const record = (await get('/api/v1/record')).json<RecordView>()
    const row = record.adviceRecords.find((r) => r.id === adviceRecordId)
    assert.ok(row)
    assert.equal(row.source, 'text')
    assert.equal(row.spoken, verdict.spoken)
    assert.equal((await get('/api/v1/record/verify')).json<ChainVerification>().length, 2)
  })

  it('answers the text tier with figures and evidence', async () => {
    const res = await post('/api/v1/ask', { question: 'How much did I spend on food last month?' })
    assert.equal(res.statusCode, 200)
    const answer = res.json<Answer>()
    assert.equal(answer.matched, true)
    assert.equal(answer.resolved?.category, 'Food & dining')
    assert.match(answer.text, /₹[\d,]+ on food & dining/)

    const suggestions = await get('/api/v1/ask/suggestions')
    assert.equal(suggestions.statusCode, 200)
    assert.ok(suggestions.json<{ questions: string[] }>().questions.length >= 4)
  })

  it('pages the statement newest first and never past the simulated today', async () => {
    const first = (await get('/api/v1/transactions?limit=5')).json<TransactionsPage>()
    assert.equal(first.items.length, 5)
    assert.ok(first.nextCursor)
    assert.ok(first.items.every((t) => t.txnDate <= '2026-10-31'))
    for (let i = 1; i < first.items.length; i += 1) {
      assert.ok((first.items[i - 1]?.txnDate ?? '') >= (first.items[i]?.txnDate ?? ''))
    }
    const second = (
      await get(`/api/v1/transactions?limit=5&cursor=${first.nextCursor}`)
    ).json<TransactionsPage>()
    assert.notDeepEqual(second.items[0], first.items[0])

    const food = (
      await get('/api/v1/transactions?category=Food%20%26%20dining&limit=3')
    ).json<TransactionsPage>()
    assert.ok(food.items.every((t) => t.spendCategory === 'Food & dining'))

    const bad = await get('/api/v1/transactions?limit=999')
    assert.equal(bad.statusCode, 400)
  })

  it('serves the shelf and the rule book to anyone', async () => {
    const shelf = await root.app.inject({ method: 'GET', url: '/api/v1/shelf' })
    assert.equal(shelf.statusCode, 200)
    assert.equal(shelf.headers['cache-control'], 'public, max-age=300')
    const ulip = shelf.json<ShelfResponse>().find((p) => p.productId === 'LIC_ULIP_401')
    assert.ok(ulip?.aliases.includes('ULIP'))
    assert.equal(ulip?.source, 'fixture')

    const rules = await root.app.inject({ method: 'GET', url: '/api/v1/rules' })
    assert.equal(rules.json<unknown[]>().length, 9)
  })

  it('withdraws a scope and recomputes without it', async () => {
    const before = (await get('/api/v1/view')).json<View>()
    const res = await post('/api/v1/session/consent', { scope: 'LIABILITIES', granted: false })
    assert.equal(res.statusCode, 200, res.body)
    assert.deepEqual(res.json<SessionState>().scopeOverrides, ['LIABILITIES'])
    const after = (await get('/api/v1/view')).json<View>()
    assert.equal(after.snapshot.debt.total, 0)
    assert.notEqual(after.meta.snapshotId, before.meta.snapshotId)
    const back = await post('/api/v1/session/consent', { scope: 'LIABILITIES', granted: true })
    assert.deepEqual(back.json<SessionState>().scopeOverrides, [])
  })

  it('erases the session and forgets the bearer', async () => {
    const res = await root.app.inject({
      method: 'DELETE',
      url: '/api/v1/session',
      headers: bearer(token),
    })
    assert.equal(res.statusCode, 204)
    const gone = await get('/api/v1/view')
    assert.equal(gone.statusCode, 401)
    assert.equal(gone.json<ErrorBody>().code, 'UNAUTHORIZED')
  })

  it('refuses an unknown customer and a malformed body', async () => {
    const unknown = await root.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { cif: 'IDBI0000000000' },
    })
    assert.equal(unknown.statusCode, 404)
    const malformed = await root.app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      payload: { cif: ROHAN_CIF, extra: true },
    })
    assert.equal(malformed.statusCode, 400)
    assert.equal(malformed.json<ErrorBody>().code, 'VALIDATION')
  })
})
