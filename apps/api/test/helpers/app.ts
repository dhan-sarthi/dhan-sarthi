/**
 * The real app on the memory profile, with a pinned clock and no rate limits, for tests that
 * go through HTTP with `app.inject()`.
 */
import type { FastifyInstance } from 'fastify'
import { addDays, addMonths } from '@dhan/core'
import type { CreateSessionResponse } from '@dhan/contracts'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import { buildRoot } from '../../src/composition/root.ts'
import type { Root, RootOptions } from '../../src/composition/root.ts'
import { loadConfig } from '../../src/config.ts'
import type { Config } from '../../src/config.ts'

export const ANCHOR = '2026-09-01'
export const FORWARD_MONTHS = 18

/** Anchor, a day, a week, a month, half a year and the horizon: every clock position a judge reaches. */
export const CLOCK_POSITIONS: readonly string[] = [
  ANCHOR,
  addDays(ANCHOR, 1),
  addDays(ANCHOR, 7),
  addDays(ANCHOR, 30),
  addMonths(ANCHOR, 6),
  addMonths(ANCHOR, FORWARD_MONTHS),
]

export const ROHAN_CIF = 'IDBI0009182731'
export const PRIYA_CIF = 'IDBI0004471902'
export const SUNIL_CIF = 'IDBI0007729184'

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    BANK_SOURCE: 'memory',
    AVATAR_PROVIDER: 'none',
    /*
     * A session with no past, unless a test asks for one.
     *
     * `SEED_HISTORY_MONTHS` defaults to eight so the app a customer opens has months of advice
     * behind it, and every one of those months is a real derivation plus a real decision. Under
     * that default a test asserting "the record starts empty" or "this is roadmap version 1" is
     * asserting on the seeder rather than on the thing it means to test, and every session
     * creation in the suite pays for eight derivations. `history.test.ts` turns it on and holds
     * the seeder to what it claims.
     */
    SEED_HISTORY_MONTHS: '0',
    ...env,
  })
}

export interface TestRoot extends Root {
  clock: FixedClock
}

export async function makeRoot(
  options: RootOptions & { env?: Record<string, string> } = {},
): Promise<TestRoot> {
  const clock = new FixedClock('2026-09-03T09:00:00.000Z')
  const { env, ...rest } = options
  const root = await buildRoot(testConfig(env), {
    rateLimits: false,
    logger: false,
    ...rest,
    deps: { clock, ...rest.deps },
  })
  await root.app.ready()
  return { ...root, clock }
}

export async function createSession(
  app: FastifyInstance,
  cif = ROHAN_CIF,
): Promise<CreateSessionResponse> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/sessions', payload: { cif } })
  if (res.statusCode !== 200)
    throw new Error(`session create failed: ${res.statusCode} ${res.body}`)
  return res.json<CreateSessionResponse>()
}

export const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
})
