/**
 * The single backend. Web and mobile are both clients of this and hold no business logic.
 *
 * Two rules that decide where code goes:
 *   1. Secrets and provider calls live here and nowhere else. A client that can reach Runway or
 *      OpenAI directly is a client that can leak a key.
 *   2. Decisions live in @dhan/core. This app is transport: validate, call, persist, respond.
 *
 * One deployment constraint worth knowing before choosing infrastructure: the Runway backend RPC
 * handler joins the LiveKit room as a participant and holds that connection for the whole
 * conversation. That rules out Lambda for the avatar path — the API needs a persistent process.
 *
 * Note what is *not* here: the advisory engine. `@dhan/core` is pure, so for the demo the web app
 * computes the snapshot, roadmap and daily plan in the browser over synthetic customers, and this
 * process exists only for the things that need a secret. When the data is a real customer's, the
 * same core functions move behind routes here without changing.
 */
import cors from '@fastify/cors'
import Fastify from 'fastify'
import { avatarRoutes } from './routes/avatar.ts'

const app = Fastify({
  logger:
    process.env['NODE_ENV'] === 'production'
      ? true
      : { transport: { target: 'pino-pretty' } },
})

await app.register(cors, {
  // The web app is served from a different origin in dev, and from a CDN in production.
  origin: process.env['CORS_ORIGIN']?.split(',') ?? true,
})

app.get('/api/health', async () => ({
  ok: true,
  at: new Date().toISOString(),
  avatar: Boolean(process.env['RUNWAY_API_KEY']),
}))

await app.register(avatarRoutes)

const port = Number(process.env['PORT'] ?? 3001)
// 0.0.0.0 rather than loopback: a phone on the same wifi has to be able to reach this, which is
// the whole point of a mobile web app you can actually hold.
await app.listen({ port, host: process.env['HOST'] ?? '0.0.0.0' })
