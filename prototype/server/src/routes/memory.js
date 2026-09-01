import * as mem from '../memory.js'

export default async function memoryRoutes(app) {
  app.post('/api/memory/remember', async (req, reply) => {
    const { customerId, transcript } = req.body || {}
    if (!customerId || !transcript) return reply.code(400).send({ error: 'customerId and transcript required' })
    try {
      const result = await mem.remember(customerId, transcript)
      // A discarded memory is a correct outcome, not a failure — log it so the safeguard
      // is visible in operation rather than only in the code.
      if (!result.stored) req.log.info({ customerId, reason: result.reason }, 'memory not stored')
      return result
    } catch (err) {
      req.log.error({ err: err.message }, 'remember failed')
      // Never let memory take down a session. No memory is a valid state.
      return reply.code(200).send({ stored: false, reason: 'unavailable' })
    }
  })

  app.post('/api/memory/recall', async (req, reply) => {
    const { customerId, query, topics = [], limit = 5 } = req.body || {}
    if (!customerId || !query) return reply.code(400).send({ error: 'customerId and query required' })
    try {
      return { memories: await mem.recall(customerId, query, { topics, limit }) }
    } catch (err) {
      req.log.error({ err: err.message }, 'recall failed')
      return { memories: [] }
    }
  })

  app.get('/api/memory/:customerId', async (req) => ({
    memories: await mem.listMemories(req.params.customerId),
    commitments: await mem.openCommitments(req.params.customerId),
  }))

  app.delete('/api/memory/:customerId', async (req) => mem.forgetAll(req.params.customerId))
}
