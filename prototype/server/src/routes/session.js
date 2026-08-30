import { realtimeToken, configured } from '../providers/llm.js'

// Best-effort per-instance limit. The real backstop is the spend cap on the account.
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 20
const hits = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const e = hits.get(ip) || { count: 0, start: now }
  if (now - e.start > WINDOW_MS) { e.count = 0; e.start = now }
  e.count += 1
  hits.set(ip, e)
  if (hits.size > 5000) hits.clear()
  return e.count > MAX_PER_WINDOW
}

export default async function sessionRoutes(app) {
  app.post('/api/realtime-token', async (req, reply) => {
    if (!configured()) return reply.code(503).send({ error: 'Voice backend not configured.' })
    if (rateLimited(req.ip)) return reply.code(429).send({ error: 'Too many sessions — try again later.' })
    try {
      const data = await realtimeToken()
      return { value: data.value, expires_at: data.expires_at }
    } catch (err) {
      req.log.error({ err: err.message }, 'token mint failed')
      return reply.code(502).send({ error: 'Token mint failed.' })
    }
  })
}
