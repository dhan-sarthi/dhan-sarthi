/**
 * Avatar session tokens.
 *
 * The Simli API key never reaches the browser — same reasoning as the realtime token route.
 * The client gets a short-lived session token and the ICE servers, nothing else.
 *
 * The avatar is only ever a mouth. It receives the audio gpt-realtime has already produced
 * and returns a face moving in time with it; it does not generate speech. That is the whole
 * point of choosing an audio-driven service: the voice, its prosody and its barge-in stay
 * exactly as they are.
 */

const SIMLI_URL = 'https://api.simli.ai'

// A South Asian face is a hard requirement, not a preference: an American-looking adviser
// discussing lakhs would undercut everything else. Set SIMLI_FACE_ID once one is chosen.
const DEFAULT_FACE = process.env.SIMLI_FACE_ID || ''

export default async function avatarRoutes(app) {
  app.get('/api/avatar/health', async () => ({
    configured: Boolean(process.env.SIMLI_API_KEY),
    faceId: DEFAULT_FACE || null,
  }))

  app.post('/api/avatar/session', async (req, reply) => {
    const apiKey = process.env.SIMLI_API_KEY
    if (!apiKey) {
      // Not an error. The stage falls back to its own renderer, and the demo still runs.
      return reply.code(503).send({ error: 'Avatar not configured.', fallback: true })
    }

    const faceId = req.body?.faceId || DEFAULT_FACE
    if (!faceId) return reply.code(400).send({ error: 'faceId required (set SIMLI_FACE_ID).' })

    try {
      const [tokenRes, iceRes] = await Promise.all([
        fetch(`${SIMLI_URL}/startAudioToVideoSession`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            faceId,
            handleSilence: true,
            // Bounded on purpose. A runaway session on a per-minute plan is a real risk when
            // the thing is left open on a demo machine.
            maxSessionLength: 600,
            maxIdleTime: 30,
          }),
        }),
        fetch(`${SIMLI_URL}/getIceServers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        }),
      ])

      if (!tokenRes.ok) {
        req.log.error({ status: tokenRes.status }, 'simli session failed')
        return reply.code(502).send({ error: 'Avatar session failed.', fallback: true })
      }

      const token = await tokenRes.json()
      const iceServers = iceRes.ok ? await iceRes.json() : null

      return {
        sessionToken: token.session_token,
        iceServers,
        faceId,
      }
    } catch (err) {
      req.log.error({ err: err.message }, 'simli session threw')
      return reply.code(502).send({ error: 'Avatar session failed.', fallback: true })
    }
  })
}
