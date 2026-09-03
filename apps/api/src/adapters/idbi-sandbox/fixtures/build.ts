/**
 * Regenerate the sample payloads: one file per block for Rohan, exactly as the offline sandbox
 * serves them at the persona anchor over the 24-month window the app requests.
 *
 *   pnpm --filter @dhan/api exec node --experimental-strip-types src/adapters/idbi-sandbox/fixtures/build.ts
 *
 * The samples are golden files. `test/idbi-sandbox/fixtures.test.ts` rebuilds them in memory
 * and fails when the checked-in JSON differs, so the payloads the stub boots against cannot
 * drift from the generator — and `pnpm seed:check` proves the generator matches the seeded
 * database, which closes the loop the brief asks for: the numbers on the wire are the numbers
 * in Postgres.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROHAN, shelfRows, toSeedBundle } from '@dhan/fixtures'
import type { SeedBundle } from '@dhan/fixtures'
import { IdbiClient } from '../client.ts'
import type { BlockRequest } from '../client.ts'
import { DATA_BLOCKS, endpointFor, serviceEndpoint } from '../endpoints.ts'
import type { DataBlock } from '../endpoints.ts'
import { OFFLINE_BASE_URL, OfflineSandbox } from '../offline-sandbox.ts'
import { dateToDdmmyy } from '../transforms.ts'

export const SAMPLE_ANCHOR = '2026-09-01'
export const SAMPLE_WINDOW = { from: '2024-10-01', to: SAMPLE_ANCHOR } as const
export const SAMPLE_PAGE_SIZE = 250

export const SAMPLE_FILES: Readonly<Record<DataBlock | 'REQUEST' | 'META' | 'LIENS', string>> = {
  REQUEST: '00-request.json',
  PROFILE: '01-profile.json',
  ACCOUNTS: '02-accounts.json',
  TXN: '03-transactions.json',
  HOLDINGS: '04-holdings.json',
  LIABILITIES: '05-liabilities.json',
  SHELF: '06-product-shelf.json',
  SIGNALS: '07-signals.json',
  META: '08-meta.json',
  LIENS: '09-liens-362.json',
}

export function sampleBundle(): SeedBundle {
  return toSeedBundle(ROHAN, { anchor: SAMPLE_ANCHOR, historyMonths: 24, forwardMonths: 18 })
}

/** Every sample body, keyed by file name, built from the generator through the sandbox's own fetch. */
export async function buildSamples(): Promise<Record<string, unknown>> {
  const bundle = sampleBundle()
  const sandbox = new OfflineSandbox({
    bundles: [bundle],
    shelf: shelfRows(),
    freshness: SAMPLE_ANCHOR,
    pageSize: SAMPLE_PAGE_SIZE,
  })
  const client = new IdbiClient({
    baseUrl: OFFLINE_BASE_URL,
    fetch: sandbox.fetch,
    pageSize: SAMPLE_PAGE_SIZE,
  })
  const req: BlockRequest = {
    customerId: bundle.customer.cif,
    consentId: bundle.consent.consentId,
    period: { ...SAMPLE_WINDOW },
  }

  const out: Record<string, unknown> = {
    [SAMPLE_FILES.REQUEST]: {
      customer_id: req.customerId,
      consent_id: req.consentId,
      data_period_from: dateToDdmmyy(req.period.from),
      data_period_to: dateToDdmmyy(req.period.to),
      data_blocks: DATA_BLOCKS.join(','),
    },
  }

  for (const block of DATA_BLOCKS) {
    // The statement sample is page one, with the paging fields that say how many follow.
    const query = block === 'TXN' ? { page: '1', page_size: String(SAMPLE_PAGE_SIZE) } : {}
    const url = client.buildUrl(endpointFor(block), req, { data_blocks: block, ...query })
    const res = await sandbox.fetch(url)
    out[SAMPLE_FILES[block]] = await res.json()
  }

  const liens = await sandbox.fetch(client.buildUrl(serviceEndpoint('362'), req, {}))
  out[SAMPLE_FILES.LIENS] = await liens.json()

  const profile = out[SAMPLE_FILES.PROFILE] as { meta: unknown }
  out[SAMPLE_FILES.META] = profile.meta
  return out
}

async function main(): Promise<void> {
  const dir = import.meta.dirname
  const samples = await buildSamples()
  for (const [file, body] of Object.entries(samples)) {
    writeFileSync(join(dir, file), `${JSON.stringify(body, null, 2)}\n`)
    process.stdout.write(`wrote ${file}\n`)
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  await main()
}
