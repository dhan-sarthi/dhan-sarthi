/**
 * The transcript fetch after a call: backoff until the provider has turns, `unavailable` once
 * the attempts run out, and the reconciliation attached beside the transcript.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shelfRows } from '@dhan/fixtures'
import type { ConversationTurn } from '@dhan/contracts'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import type { AvatarCredential } from '../../src/ports/index.ts'
import { InMemoryAuditStore } from '../../src/adapters/memory/audit-store.memory.ts'
import { InMemoryProductShelf } from '../../src/adapters/memory/product-shelf.memory.ts'
import { TranscriptService } from '../../src/application/avatar/transcript.service.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import { FakeAvatarProvider } from '../fakes/avatar-provider.fake.ts'

const CRED: AvatarCredential = { key: 'test-key-not-real', characterId: 'c', label: 'runway-1' }
const SESSION = 'fake-session-9'

const TURNS: ConversationTurn[] = [
  { role: 'user', text: 'Should I take the LIC ULIP for two and a half thousand a month?' },
  {
    role: 'assistant',
    text: 'No. It costs about three times what a term plan costs for the same job. Take the term cover at around eight hundred and eighty rupees a month.',
    toolCalls: [{ name: 'check_suitability', args: { product_name: 'LIC ULIP' } }],
    toolResults: [
      {
        name: 'check_suitability',
        result: {
          verdict: 'BLOCKED',
          product: 'LIC Market Plus ULIP',
          alternative: { name: 'LIC Term Assurance, ₹1 crore cover' },
        },
      },
    ],
  },
]

async function seeded() {
  const clock = new FixedClock()
  const audit = new InMemoryAuditStore(clock)
  await audit.appendAvatarSession({
    runwaySessionId: SESSION,
    sessionId: '11111111-1111-4111-8111-111111111111',
    credentialLabel: 'runway-1',
    taskId: 't',
    openedAt: clock.now().toISOString(),
    readyAt: null,
    rpcConnectedAt: null,
    grantedAt: null,
  })
  const call = await audit.appendToolCall({
    runwaySessionId: SESSION,
    tool: 'check_suitability',
    args: { product_name: 'LIC ULIP' },
    result: {
      verdict: 'BLOCKED',
      product: 'LIC Market Plus ULIP',
      alternative: { name: 'LIC Term Assurance, ₹1 crore cover' },
    },
    adviceRecordId: null,
    latencyMs: 12,
  })
  return { audit, call, shelf: new InMemoryProductShelf(shelfRows()) }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 30))

describe('the transcript service', () => {
  it('records unavailable when there are no attempts left', async () => {
    const { audit, shelf } = await seeded()
    const provider = new FakeAvatarProvider()
    const svc = new TranscriptService({ provider, audit, shelf, log: silentLogger, delaysMs: [] })
    svc.schedule(SESSION, CRED)
    await settle()
    assert.equal((await audit.getAvatarSession(SESSION))?.transcriptStatus, 'unavailable')
  })

  it('retries until the provider has turns, then attaches the reconciliation', async () => {
    const { audit, call, shelf } = await seeded()
    const provider = new FakeAvatarProvider()
    const svc = new TranscriptService({
      provider,
      audit,
      shelf,
      log: silentLogger,
      delaysMs: [0, 0, 0],
    })

    assert.equal(await svc.fetchOnce(SESSION, CRED), 'empty')

    svc.schedule(SESSION, CRED)
    assert.equal(svc.pending, 1)
    // The first attempt finds nothing; the transcript lands before the second.
    await new Promise((r) => setImmediate(r))
    provider.transcript = TURNS
    for (let i = 0; i < 20; i += 1) {
      await settle()
      if ((await audit.getAvatarSession(SESSION))?.transcriptStatus === 'fetched') break
    }

    const session = await audit.getAvatarSession(SESSION)
    assert.equal(session?.transcriptStatus, 'fetched')
    assert.deepEqual(session?.gateCoverage, { fired: 1, expected: 1, misses: [] })
    assert.deepEqual(await audit.getTranscript(SESSION), TURNS)
    const [row] = await audit.listToolCalls(SESSION)
    assert.equal(row?.id, call.id)
    assert.equal(row?.verifiedInTranscript, true)
    assert.equal(svc.pending, 0)
  })

  it('reports a failed read and keeps going', async () => {
    const { audit, shelf } = await seeded()
    class Throwing extends FakeAvatarProvider {
      override async getConversation(): Promise<ConversationTurn[] | null> {
        throw new Error('boom')
      }
    }
    const svc = new TranscriptService({
      provider: new Throwing(),
      audit,
      shelf,
      log: silentLogger,
      delaysMs: [0],
    })
    assert.equal(await svc.fetchOnce(SESSION, CRED), 'failed')
    svc.schedule(SESSION, CRED)
    for (let i = 0; i < 20; i += 1) {
      await settle()
      if ((await audit.getAvatarSession(SESSION))?.transcriptStatus !== 'pending') break
    }
    assert.equal((await audit.getAvatarSession(SESSION))?.transcriptStatus, 'unavailable')
  })

  it('drops pending fetches on shutdown and leaves the status pending', async () => {
    const { audit, shelf } = await seeded()
    const svc = new TranscriptService({
      provider: new FakeAvatarProvider(),
      audit,
      shelf,
      log: silentLogger,
      delaysMs: [60_000],
    })
    svc.schedule(SESSION, CRED)
    assert.equal(svc.pending, 1)
    svc.shutdown()
    assert.equal(svc.pending, 0)
    assert.equal((await audit.getAvatarSession(SESSION))?.transcriptStatus, 'pending')
  })
})
