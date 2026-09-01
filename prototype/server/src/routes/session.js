import { realtimeToken, configured } from '../providers/llm.js'
import { createLimiter } from '../ratelimit.js'

// Best-effort per-instance limit. The real backstop is the spend cap on the account.
const rateLimited = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 })

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
