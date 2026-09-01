/**
 * Avatar routes — Runway Characters.
 *
 * Runway owns the conversation: microphone in, its own model and the Character's cloned voice
 * out, video out. Our side is three jobs, and all three are here rather than in the browser:
 *
 *   1. Keep the API key server-side. The browser is handed LiveKit room credentials — a room
 *      URL, a one-room JWT, a room name — and nothing else. Note we run `/consume` here, so
 *      even the session key never leaves this process.
 *
 *   2. Tell the Character who it is talking to. The `personality` override is built from the
 *      derived snapshot in avatar-brief.js, not passed up from the client, because a system
 *      prompt behind a compliance claim should not be client-editable.
 *
 *   3. Hold the tool boundary. The suitability verdict comes from suitability.js over a
 *      backend RPC connection this process opens into the session. If that connection cannot
 *      be established the session is abandoned rather than run ungated — an avatar that can
 *      recommend a product without the rules is worse than no avatar.
 *
 * Every failure answers with `fallback: true` and a 5xx the client is expected to shrug off.
 * The stage keeps its own renderer, the voice path keeps working, and the demo survives.
 */

import * as runway from '../providers/runway.js'
import { bank } from '../providers/bank.js'
import { derive } from '../derive.js'
import { buildBrief, toolDefinitions, makeToolHandlers } from '../avatar-brief.js'
import { recordAdvice } from '../advice-record.js'
import { createLimiter } from '../ratelimit.js'

// Sessions bill per 6 seconds of worker uptime, so the ceiling is deliberately low.
const limited = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 })

const MAX_SESSION_SECONDS = Number(process.env.RUNWAY_MAX_SESSION_SECONDS || 600)

/**
 * Live backend RPC handlers, keyed by session. One per session is all the API allows, and
 * each holds a LiveKit connection, so leaking these leaks sockets and money both.
 */
const handlers = new Map()

async function closeHandler(sessionId, log) {
  const entry = handlers.get(sessionId)
  if (!entry) return
  handlers.delete(sessionId)
  clearTimeout(entry.reaper)
  try { await entry.handler.close() } catch (err) {
    log?.warn({ sessionId, err: err.message }, 'rpc handler close failed')
  }
}

function availability() {
  const configured = runway.configured()
  const hasCharacter = Boolean(runway.characterId())
  return {
    available: configured && hasCharacter,
    reason: !configured ? 'RUNWAY_API_KEY not set' : !hasCharacter ? 'RUNWAY_CHARACTER_ID not set' : null,
  }
}

/**
 * A health check that answers the question it is asked: does the credential work, is the
 * Character ready, and can the conversation actually be gated? Cached, because it is polled
 * by a UI and an unbilled GET is still a round trip.
 */
let probe = { at: 0, result: null }
const PROBE_TTL_MS = 60_000

async function checkCredential(log) {
  if (probe.result && Date.now() - probe.at < PROBE_TTL_MS) return probe.result
  if (!runway.configured()) {
    probe = { at: Date.now(), result: { credential: 'unconfigured', character: null } }
    return probe.result
  }
  try {
    const c = await runway.describeCharacter()
    probe = {
      at: Date.now(),
      result: {
        credential: 'ok',
        character: c && { id: c.id, name: c.name, status: c.status, voice: c.voice?.name ?? c.voice?.type ?? null },
      },
    }
  } catch (err) {
    log?.warn({ status: err.status, err: err.message }, 'runway credential check failed')
    probe = {
      at: Date.now(),
      result: {
        credential: err.status === 401 || err.status === 403 ? 'invalid' : 'unreachable',
        character: null,
        error: err.message,
      },
    }
  }
  return probe.result
}

export default async function avatarRoutes(app) {
  app.get('/api/avatar/health', async (req) => {
    const { available, reason } = availability()
    const { credential, character, error } = await checkCredential(req.log)
    return {
      provider: 'runway',
      // Runway runs the whole conversation, so there is one mode and this says whether it
      // is the live one or the built-in renderer.
      mode: available && credential === 'ok' ? 'live-runway' : 'unavailable',
      configured: available,
      ...(reason ? { reason } : {}),
      credential,
      character,
      characterId: runway.characterId() || null,
      transport: 'webrtc/livekit',
      // What the conversation can do, which is what decides whether the product works.
      capabilities: {
        transcript: 'live+post',      // data-channel deltas during, conversations API after
        contextAtStart: 'personality+startScript',
        contextMidCall: 'pull-only',  // no push API; the model asks via tools
        toolCalling: ['backend_rpc', 'client_event'],
        // Not asserted. The worker exposes user/avatar speech-start events, which implies it
        // does its own turn detection, but Runway does not document interruption and it has
        // not been confirmed in a live call. Verify before promising it in a demo.
        bargeIn: 'unverified',
      },
      maxSessionSeconds: MAX_SESSION_SECONDS,
      creditsPerMinute: 20,           // 2 upfront + 2 per 6s
      activeSessions: handlers.size,
      ...(error ? { error } : {}),
      checkedAt: new Date(probe.at).toISOString(),
    }
  })

  /**
   * Open a conversation.
   *
   * `cif` is the only thing the client gets to choose. Everything the Character is told is
   * derived here from that customer's snapshot.
   */
  app.post('/api/avatar/session', async (req, reply) => {
    const { available, reason } = availability()
    if (!available) {
      // Not an error. The stage falls back to its own renderer, and the demo still runs.
      return reply.code(503).send({ error: `Avatar not configured: ${reason}`, fallback: true })
    }
    if (limited(req.ip)) {
      return reply.code(429).send({ error: 'Too many avatar sessions — try again later.', fallback: true })
    }

    const cif = req.body?.cif
    if (!cif) return reply.code(400).send({ error: 'cif required', fallback: true })

    let sessionId
    try {
      // One snapshot, same as every other surface reads, so the Character cannot quote a
      // number the screens do not show.
      const b = await bank()
      const [customer, accounts, transactions, liabilities, holdings, shelf] = await Promise.all([
        b.getCustomer(cif), b.getAccounts(cif), b.getTransactions(cif),
        b.getLiabilities(cif), b.getHoldings(cif), b.getProductShelf(),
      ])
      const snapshot = { customer, accounts, transactions, liabilities, holdings }
      snapshot.derived = derive(snapshot)

      const brief = buildBrief(snapshot)
      req.log.info(
        { cif, personalityChars: brief.personality.length, tools: toolDefinitions().map((t) => t.name) },
        'avatar brief built',
      )

      sessionId = await runway.createSession({
        personality: brief.personality,
        startScript: brief.startScript,
        tools: toolDefinitions(),
        maxDuration: MAX_SESSION_SECONDS,
      })
      req.log.info({ sessionId, cif }, 'runway session created')

      const ready = await runway.waitUntilReady(sessionId, {
        onProgress: ({ status, queued, polls }) => {
          if (queued) req.log.warn({ sessionId, polls }, 'runway session queued behind concurrency limit')
          else req.log.debug({ sessionId, status, polls }, 'runway session provisioning')
        },
      })

      // The tool boundary, opened before the customer can say anything. If this throws we
      // do not hand over a session, because an ungated adviser is the one failure mode this
      // product cannot ship.
      const handler = await runway.connectBackendRpc({
        sessionId,
        tools: makeToolHandlers({
          facts: brief.facts,
          customer: brief.customer,
          shelf,
          log: req.log,
          // The audit trail keys on the same customer id every other surface writes, not
          // on the CIF, or the avatar's records would sit apart from the typed ones.
          onVerdict: ({ product, amount, result }) => recordAdvice({
            customerId: customer?.custId || cif, sessionId, product, amount,
            facts: brief.facts, result, log: req.log,
          }),
        }),
        log: req.log,
      })
      // Belt and braces: the worker dies at maxDuration whatever happens, so the handler
      // should not outlive it even if the client never calls DELETE.
      const reaper = setTimeout(() => closeHandler(sessionId, req.log), (MAX_SESSION_SECONDS + 30) * 1000)
      reaper.unref?.()
      handlers.set(sessionId, { handler, reaper })

      const creds = await runway.consumeSession(sessionId, ready.sessionKey)
      req.log.info({ sessionId, roomName: creds.roomName }, 'runway session ready and gated')

      return {
        mode: 'live-runway',
        sessionId,
        serverUrl: creds.url,
        token: creds.token,
        roomName: creds.roomName,
        characterId: runway.characterId(),
        // So the client knows what it is allowed to expect, rather than guessing.
        tools: toolDefinitions().filter((t) => t.type === 'client_event').map((t) => t.name),
      }
    } catch (err) {
      if (sessionId) {
        await closeHandler(sessionId, req.log)
        runway.cancelSession(sessionId).catch((e) =>
          req.log.error({ sessionId, err: e.message }, 'failed to cancel orphaned runway session'))
      }
      req.log.error(
        { sessionId, cif, status: err.status, code: err.code, err: err.message, body: err.body },
        'runway avatar session failed',
      )
      return reply.code(err.status === 429 ? 429 : 502).send({
        error: err.message,
        code: err.code ?? null,
        fallback: true,
      })
    }
  })

  /**
   * Teardown. Without this the worker bills until maxDuration expires and the RPC handler
   * holds its LiveKit connection open.
   */
  app.delete('/api/avatar/session/:id', async (req, reply) => {
    const { id } = req.params
    await closeHandler(id, req.log)
    if (runway.configured()) {
      try {
        await runway.cancelSession(id)
        req.log.info({ sessionId: id }, 'runway session cancelled')
      } catch (err) {
        req.log.warn({ sessionId: id, err: err.message }, 'runway session cancel failed')
      }
    }
    return reply.code(204).send()
  })

  /**
   * The transcript after the fact, for memory and audit. The session id is the conversation
   * id, and each entry carries role, text, timestamp and any tool calls with their results —
   * which is what makes the gate auditable rather than merely asserted.
   */
  app.get('/api/avatar/transcript/:id', async (req, reply) => {
    if (!runway.configured()) return reply.code(503).send({ error: 'Avatar not configured.' })
    try {
      return await runway.getConversation(req.params.id)
    } catch (err) {
      req.log.error({ sessionId: req.params.id, status: err.status, err: err.message }, 'transcript fetch failed')
      return reply.code(err.status === 404 ? 404 : 502).send({ error: err.message })
    }
  })

  app.addHook('onClose', async () => {
    await Promise.all([...handlers.keys()].map((id) => closeHandler(id, app.log)))
  })
/**
 * The Character's own portrait, proxied.
 *
 * The idle frame has to be the same face the video shows, or the first thing a customer sees
 * is a stand-in. Runway's imageUrl carries a short-lived JWT, so the browser cannot hold it —
 * we fetch it here, keep the bytes, and serve them from our own origin.
 */
let portrait = null // { body, contentType, fetchedAt }
const PORTRAIT_TTL_MS = 6 * 60 * 60 * 1000

app.get('/api/avatar/portrait', async (request, reply) => {
  const fresh = portrait && Date.now() - portrait.fetchedAt < PORTRAIT_TTL_MS
  if (!fresh) {
    try {
      const character = await runway.describeCharacter()
      const src = character?.referenceImageUri || character?.imageUrl
      if (!src) return reply.code(404).send({ error: 'character has no portrait' })
      const res = await fetch(src)
      if (!res.ok) return reply.code(502).send({ error: `portrait fetch failed: ${res.status}` })
      portrait = {
        body: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') ?? 'image/png',
        fetchedAt: Date.now(),
      }
      request.log.info({ bytes: portrait.body.length }, 'avatar portrait cached')
    } catch (err) {
      request.log.warn({ err: err.message }, 'avatar portrait unavailable')
      return reply.code(502).send({ error: err.message })
    }
  }
  return reply.header('Content-Type', portrait.contentType).header('Cache-Control', 'public, max-age=3600').send(portrait.body)
})

}
