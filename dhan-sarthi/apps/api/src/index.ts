/**
 * The single backend. Web and mobile are both clients of this and hold no business logic.
 *
 * Two rules that decide where code goes:
 *   1. Secrets and provider calls live here and nowhere else. A client that can reach Runway
 *      or OpenAI directly is a client that can leak a key.
 *   2. Decisions live in @dhan/core. This app is transport: validate, call, persist, respond.
 *
 * One deployment constraint worth knowing before choosing infrastructure: the Runway backend
 * RPC handler joins the LiveKit room as a participant and holds that connection for the whole
 * conversation. That rules out Lambda for the avatar path — the API needs a persistent process
 * (ECS Fargate or EC2).
 */
import Fastify from 'fastify'

const app = Fastify({
  logger:
    process.env.NODE_ENV === 'production'
      ? true
      : { transport: { target: 'pino-pretty' } },
})

app.get('/api/health', async () => ({ ok: true, at: new Date().toISOString() }))

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '127.0.0.1' })
