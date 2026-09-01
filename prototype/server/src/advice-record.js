/**
 * The audit trail.
 *
 * One writer, because there is now more than one way a recommendation reaches a customer —
 * the typed advice route and the avatar's suitability tool — and a compliance record that
 * differs by which surface produced it is not a record anyone can rely on.
 *
 * A blocked recommendation is the more interesting one to have on file: it is the evidence
 * the gate does something.
 */

import { randomUUID } from 'node:crypto'
import { query } from './db.js'

export async function recordAdvice({
  customerId, sessionId = null, product, amount = 0, facts = {}, result, model = 'deterministic-rules', log,
}) {
  try {
    await query(
      `INSERT INTO advice_records (id, customer_id, session_id, recommendation, basis, suitability, block_reason, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), customerId, sessionId,
       `${product.name}${amount ? ` at ₹${amount}/month` : ''}`,
       JSON.stringify({ productId: product.productId, amount, facts, rulesPassed: result.passed }),
       result.verdict, result.recorded, model],
    )
    return true
  } catch (err) {
    // The gate's decision stands even if we cannot write the record; surface it loudly.
    log?.error({ err: err.message }, 'advice_record write failed')
    return false
  }
}
