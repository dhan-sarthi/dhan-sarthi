/**
 * `pnpm --filter @dhan/fixtures figures`
 *
 * The snapshot headline numbers for every persona at the anchor, plus the suitability verdict
 * each persona exists to demonstrate — in the exact shape the README table, the autopilot doc
 * and the test assertions quote them.
 *
 * This exists because those three places quote about forty figures between them, and a change
 * to the generator moves all of them at once. Running this and pasting the output is the only
 * way to keep a document honest; typing a number next to the data is how the prototype ended up
 * quoting an outflow of ₹49,600 while its own transactions summed to ₹51,630.
 *
 * `--json` prints the same figures as a machine-readable object, for a script that wants to
 * diff two runs.
 */
import { derive, evaluate } from '@dhan/core'
import type { Snapshot } from '@dhan/core'
import { generateCustomerFile } from './generate.ts'
import { PERSONAS } from './personas.ts'
import type { PersonaSpec } from './personas.ts'
import { PRODUCT_SHELF, productById } from './shelf.ts'

const ASOF = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? '2026-09-01'
const MONTHS = 24
const asJson = process.argv.includes('--json')

/**
 * The product each persona's story turns on, and the goal it is proposed against.
 *
 * Rohan raises the ULIP his cousin sold him; Priya and Sunil ask about an index fund. These are
 * the three questions the demo actually asks, so these are the three verdicts worth printing.
 */
const HEADLINE: Record<string, { productId: string; amount: number; horizonYears: number }> = {
  rohan: { productId: 'LIC_ULIP_401', amount: 2_500, horizonYears: 20 },
  priya: { productId: 'MF_INDEX_103', amount: 5_000, horizonYears: 10 },
  sunil: { productId: 'MF_INDEX_103', amount: 3_000, horizonYears: 10 },
}

export interface PersonaFigures {
  slug: string
  name: string
  asOf: string
  transactions: number
  income: number
  incomeStability: Snapshot['income']['stability']
  commitments: number
  discretionary: number
  surplus: number
  deployable: number
  idleFloor: number
  bufferMonths: number
  debtTotal: number
  highestRate: number
  protectionGap: number
  headlineProduct: string
  verdict: string
  ruleId: string | null
  alternative: string | null
}

export function personaFigures(spec: PersonaSpec, asOf: string): PersonaFigures {
  const file = generateCustomerFile(spec, { anchor: '2026-09-01', asOf, months: MONTHS })
  const snapshot = derive(file, asOf)
  const ask = HEADLINE[spec.slug] ?? { productId: 'MF_INDEX_103', amount: 5_000, horizonYears: 10 }

  const verdict = evaluate({
    product: productById(ask.productId),
    snapshot,
    amount: ask.amount,
    goal: { kind: 'wealth_target', horizonYears: ask.horizonYears },
    alternatives: PRODUCT_SHELF,
  })

  return {
    slug: spec.slug,
    name: spec.customer.custName,
    asOf,
    transactions: file.transactions.length,
    income: snapshot.income.monthly,
    incomeStability: snapshot.income.stability,
    commitments: snapshot.commitments.total,
    discretionary: snapshot.discretionary.monthly,
    surplus: snapshot.surplus.monthly,
    deployable: snapshot.surplus.deployable,
    idleFloor: snapshot.balances.idleFloor,
    // Null where the outflow could not be read. The CLI's table wants a number, and 0 is the
    // conservative reading everywhere else this appears.
    bufferMonths: snapshot.buffer.monthsCovered ?? 0,
    debtTotal: snapshot.debt.total,
    highestRate: snapshot.debt.highestRate,
    protectionGap: snapshot.protection.gap,
    headlineProduct: ask.productId,
    verdict: verdict.verdict,
    ruleId: verdict.ruleId,
    alternative: verdict.alternative?.productId ?? null,
  }
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

function print(f: PersonaFigures): void {
  const row = (label: string, value: string): string => `  ${label.padEnd(16)}${value.padStart(14)}`
  console.log(`${f.name} — ${f.slug}, ${f.transactions} transactions as of ${f.asOf}`)
  console.log(row('income', `${inr(f.income)} (${f.incomeStability})`))
  console.log(row('commitments', inr(f.commitments)))
  console.log(row('discretionary', inr(f.discretionary)))
  console.log(row('surplus', inr(f.surplus)))
  console.log(row('deployable', inr(f.deployable)))
  console.log(row('idle floor', inr(f.idleFloor)))
  console.log(row('buffer', `${f.bufferMonths} months`))
  console.log(row('debt', `${inr(f.debtTotal)} @ ${f.highestRate}%`))
  console.log(row('protection gap', inr(f.protectionGap)))
  console.log(
    row(
      'suitability',
      `${f.headlineProduct} ${f.verdict}${f.ruleId ? ` (${f.ruleId})` : ''}${
        f.alternative ? ` → ${f.alternative}` : ''
      }`,
    ),
  )
  console.log()
}

const figures = PERSONAS.map((spec) => personaFigures(spec, ASOF))

if (asJson) console.log(JSON.stringify(figures, null, 2))
else for (const f of figures) print(f)
