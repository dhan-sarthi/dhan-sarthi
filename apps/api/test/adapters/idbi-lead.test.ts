/**
 * Handing a lead back to the bank, and the three ways it must not go wrong.
 *
 * This is the app's only write, and it is the half that makes the product more than a
 * calculator: everything else reads a customer's statements, and 428 is how a customer who says
 * yes reaches somebody. What matters is what it does when it cannot: an accepted recommendation
 * is already on the record, so a bank that refuses, or that cannot be reached, or a customer
 * whose PAN the bank does not send, must all come back as an outcome rather than an error.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { IdbiGateway } from '../../src/adapters/idbi-sandbox/api/gateway.ts'
import { IdbiLeadSink, noLeadSink } from '../../src/adapters/idbi-sandbox/lead-sink.idbi.ts'
import { IdbiTransport } from '../../src/adapters/idbi-sandbox/api/transport.ts'
import {
  REPLAY_BASE_URL,
  createReplayTransport,
} from '../../src/adapters/idbi-sandbox/api/replay.ts'
import { loadCapturedCalls } from '../../src/adapters/idbi-sandbox/api/captured.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import type { FetchLike } from '../../src/adapters/idbi-sandbox/api/transport.ts'
import type { LeadRequest } from '../../src/ports/lead-sink.port.ts'

const PRIYA = '98655854'
const NEHA = '88234567'

const REQUEST: LeadRequest = {
  cif: PRIYA,
  product: { name: 'Term Life', category: 'Term Insurance', subCategory: 'LIC' },
  estimatedAmount: 18_500,
  leadId: 'DS-test-0001',
}

function sink(fetchImpl?: FetchLike): IdbiLeadSink {
  const impl = fetchImpl ?? createReplayTransport({ captures: loadCapturedCalls() }).fetch
  const transport = new IdbiTransport({
    baseUrl: REPLAY_BASE_URL,
    fetch: impl,
    logger: silentLogger,
    // Off: these tests care about what each answer becomes, and a cached read would let one
    // case's response satisfy the next one's request.
    readCacheMs: 0,
  })
  return new IdbiLeadSink({ gateway: new IdbiGateway({ transport, logger: silentLogger }) })
}

/** A transport that answers 428 with `body` and everything else from the captures. */
function answering428(body: unknown, status = 200): FetchLike {
  const replay = createReplayTransport({ captures: loadCapturedCalls() })
  return async (input, init) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.includes('createLead')) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }
    return replay.fetch(input, init)
  }
}

describe('handing a lead to IDBI', () => {
  it('sends the identity the bank holds, and takes the bank’s answer', async () => {
    // Against the captures this comes back a duplicate, because both of IDBI's own 428 samples
    // answer "Lead already created" — so that is what replay can honestly report. What matters
    // here is that the call is made at all: the identity resolved, the body was accepted, and
    // the lead id we generated came back.
    const outcome = await sink().create(REQUEST)
    assert.equal(outcome.status, 'duplicate')
    assert.equal(outcome.leadId, 'DS-test-0001')
  })

  it('reports a lead the bank took as created', async () => {
    const outcome = await sink(
      answering428({ result: { errors: [], message: 'Lead created successfully' } }),
    ).create(REQUEST)
    assert.equal(outcome.status, 'created')
    assert.equal(outcome.leadId, 'DS-test-0001')
  })

  it('reads "Lead already created" as a duplicate rather than a failure', async () => {
    // The right answer to a customer who accepted the same thing twice, and the sandbox gives
    // it with a 200 — so it is read from the message, not the status code.
    const outcome = await sink(
      answering428({ result: { errors: [], message: 'Lead already created' } }),
    ).create(REQUEST)
    assert.equal(outcome.status, 'duplicate')
  })

  it('reports a rejected body as refused, with the bank’s own reason', async () => {
    // IDBI's own sample 3 trips this: `ABCDX99995` fails the AAAAA9999A rule 428 enforces.
    const outcome = await sink(
      answering428(
        { message: 'pancard is not valid: must be 10 characters in format AAAAA9999A' },
        400,
      ),
    ).create(REQUEST)
    assert.equal(outcome.status, 'refused')
    assert.match(outcome.message, /pancard is not valid/)
  })

  it('reports an unreachable bank as unavailable, and does not throw', async () => {
    const outcome = await sink(async () => {
      throw new Error('socket hang up')
    }).create(REQUEST)
    // The customer's decision is already recorded; this must never become an error they see.
    assert.equal(outcome.status, 'unavailable')
    assert.equal(outcome.leadId, null)
  })

  it('finds the other customer’s PAN in her consented pull rather than in 433', async () => {
    // 433 holds one customer's record. Neha's PAN is in her Account Aggregator holder block,
    // which is the whole reason the resolver has two sources.
    const outcome = await sink().create({ ...REQUEST, cif: NEHA })
    assert.notEqual(outcome.status, 'incomplete')
  })

  it('sends nothing at all where no operation carries a PAN', async () => {
    // Arjun: 365 answers for him and nothing else does, so there is no record and no consented
    // pull to read a PAN from. A row in a bank's queue with a placeholder PAN is worse than no
    // row — it is real, and nobody can act on it.
    const outcome = await sink().create({ ...REQUEST, cif: '77712345' })
    assert.equal(outcome.status, 'incomplete')
    assert.match(outcome.message, /PAN/)
    assert.equal(outcome.leadId, null)
  })

  it('sends nothing for a customer the bank does not hold', async () => {
    const outcome = await sink().create({ ...REQUEST, cif: '00000000' })
    assert.equal(outcome.status, 'incomplete')
  })

  it('answers unavailable under a source with no bank behind it', async () => {
    const outcome = await noLeadSink('memory').create(REQUEST)
    assert.equal(outcome.status, 'unavailable')
    assert.match(outcome.message, /no bank behind it/)
  })
})
