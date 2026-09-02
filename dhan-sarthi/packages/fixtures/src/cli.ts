/**
 * `pnpm --filter @dhan/fixtures summary`
 *
 * Prints the derived headline numbers for every persona. This is how the demo script gets
 * written: generate, read the numbers off here, put those numbers in the script. Never the
 * other way round — the prototype's script quoted an outflow of ₹49,600 while its own
 * transactions summed to ₹51,630, and nobody could see it until someone added them up.
 */
import { generateCustomerFile } from './generate.ts'
import { PERSONAS } from './personas.ts'
import { formatSummary, summarise } from './summary.ts'

const ASOF = process.argv[2] ?? '2026-09-01'
const MONTHS = Number(process.argv[3] ?? 24)

for (const spec of PERSONAS) {
  const file = generateCustomerFile(spec, { asOf: ASOF, months: MONTHS })
  console.log(formatSummary(summarise(file, ASOF, MONTHS)))
  console.log(`  demonstrates  ${spec.demonstrates}`)
  console.log()
}
