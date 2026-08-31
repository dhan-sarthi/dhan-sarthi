import Fastify from 'fastify'
import { healthy } from './db.js'
import { configured, embeddingDimensions } from './providers/llm.js'
import { bankSource } from './providers/bank.js'
import memoryRoutes from './routes/memory.js'
import sessionRoutes from './routes/session.js'
import snapshotRoutes from './routes/snapshot.js'
import adviceRoutes from './routes/advice.js'
import avatarRoutes from './routes/avatar.js'

const app = Fastify({
  logger: { transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' } },
})

// Dev only. In the sandbox the client is served from the same origin and this goes away.
app.addHook('onSend', async (req, reply) => {
  const origin = req.headers.origin
  if (origin && /^http:\/\/localhost:\d+$/.test(origin)) {
    reply.header('Access-Control-Allow-Origin', origin)
    reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type')
    reply.header('Vary', 'Origin')
  }
})
app.options('/*', async (_req, reply) => reply.code(204).send())

app.get('/api/health', async () => ({
  ok: true,
  database: (await healthy()) ? 'connected' : 'unavailable',
  llm: configured() ? 'configured' : 'no api key',
  bankSource,
  embeddingDimensions,
}))

await app.register(sessionRoutes)
await app.register(memoryRoutes)
await app.register(snapshotRoutes)
await app.register(adviceRoutes)
await app.register(avatarRoutes)

const port = Number(process.env.PORT || 3001)
await app.listen({ port, host: '127.0.0.1' })
