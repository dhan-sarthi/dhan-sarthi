// Populate the advice register with a realistic history before a demo.
//
// An empty register proves nothing and a fabricated one is worse, so this runs real
// evaluations through the real gate — the records are genuine decisions, just made ahead of
// time rather than on stage.
//
//   node --env-file=.env src/seed-demo.js
import { randomUUID } from 'node:crypto'
import { evaluate } from './suitability.js'
import { bank } from './providers/bank.js'
import { derive } from './derive.js'
import { query, pool } from './db.js'

const CUSTOMER = 'demo-rohan'

const b = await bank()
const [customer, accounts, transactions, liabilities, holdings, shelf] = await Promise.all([
  b.getCustomer(), b.getAccounts(), b.getTransactions(), b.getLiabilities(), b.getHoldings(), b.getProductShelf(),
])
const facts = derive({ customer, accounts, transactions, liabilities, holdings })

// Chosen to exercise different rules, so the register shows range rather than one verdict
// repeated: an approval, a risk-ceiling refusal, and the bundled-product refusal.
const proposals = [
  { productId: 'LIC_TERM_0021',  amount: 850,   riskProfile: 'Balanced',     daysAgo: 21 },
  { productId: 'IDBI_MF_00412',  amount: 15000, riskProfile: 'Balanced',     daysAgo: 14 },
  { productId: 'IDBI_MF_00184',  amount: 8000,  riskProfile: 'Conservative', daysAgo: 6 },
  { productId: 'IDBI_MF_00184',  amount: 8000,  riskProfile: 'Balanced',     daysAgo: 2 },
]

await query('DELETE FROM advice_records WHERE customer_id = $1', [CUSTOMER])

for (const p of proposals) {
  const product = shelf.find((x) => x.productId === p.productId)
  const result = evaluate({
    product, customer: { riskProfile: p.riskProfile }, facts, amount: p.amount,
    alternatives: shelf.filter((x) => x.productId !== p.productId),
  })
  await query(
    `INSERT INTO advice_records (id, customer_id, recommendation, basis, suitability, block_reason, model, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' days')::interval)`,
    [randomUUID(), CUSTOMER, `${product.name} at ₹${p.amount}/month`,
     JSON.stringify({ productId: p.productId, amount: p.amount, facts, rulesPassed: result.passed }),
     result.verdict, result.recorded, 'deterministic-rules', String(p.daysAgo)],
  )
  console.log(`  ${result.verdict.padEnd(7)} ${product.name}${result.ruleId ? `  (${result.ruleId})` : ''}`)
}

console.log('\nregister seeded.')
await pool.end()
