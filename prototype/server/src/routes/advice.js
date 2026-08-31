import { randomUUID } from 'node:crypto'
import { evaluate, ruleBook } from '../suitability.js'
import { bank } from '../providers/bank.js'
import { query } from '../db.js'

export default async function adviceRoutes(app) {
  // What the rules are, in the words a compliance officer would use. Exposed so the app can
  // show them rather than asserting that a gate exists.
  app.get('/api/advice/rules', async () => ({ rules: ruleBook }))

  /**
   * Run a proposed recommendation through the gate.
   * Always writes an advice_record — a blocked recommendation is the more interesting one
   * to have on file, since it is the evidence the gate does something.
   */
  app.post('/api/advice/evaluate', async (req, reply) => {
    const { customerId, productId, amount = 0, facts = {}, customer, goal = null, sessionId = null } = req.body || {}
    if (!customerId || !productId) return reply.code(400).send({ error: 'customerId and productId required' })

    const shelf = await (await bank()).getProductShelf()
    const product = shelf.find((p) => p.productId === productId)
    if (!product) return reply.code(404).send({ error: `unknown product ${productId}` })

    const result = evaluate({
      product,
      customer: customer || { riskProfile: 'Balanced' },
      facts,
      amount,
      goal,
      alternatives: shelf.filter((p) => p.productId !== productId),
    })

    try {
      await query(
        `INSERT INTO advice_records (id, customer_id, session_id, recommendation, basis, suitability, block_reason, model)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), customerId, sessionId,
         `${product.name}${amount ? ` at ₹${amount}/month` : ''}`,
         JSON.stringify({ productId, amount, facts, rulesPassed: result.passed }),
         result.verdict, result.recorded, 'deterministic-rules'],
      )
    } catch (err) {
      // The gate's decision stands even if we cannot write the record; surface it loudly.
      req.log.error({ err: err.message }, 'advice_record write failed')
    }

    return {
      verdict: result.verdict,
      product: { productId: product.productId, name: product.name },
      ruleId: result.ruleId,
      spoken: result.spoken,
      recorded: result.recorded,
      alternative: result.alternative,
      rulesPassed: result.passed,
    }
  })

  // The audit trail, for the screen that shows a judge what was recommended and why.
  app.get('/api/advice/:customerId', async (req) => {
    const { rows } = await query(
      `SELECT id, recommendation, basis, suitability, block_reason, model, created_at
         FROM advice_records WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.customerId],
    )
    return { records: rows }
  })
}
