/**
 * Configuration: the only place in the API that reads `process.env`.
 *
 * Everything else receives a `Config` by constructor. That is what makes a startup invariant
 * a thrown error with a readable message rather than an undefined that surfaces as a 500 on
 * the first request — and what keeps `dependency-cruiser` able to prove nobody else reads the
 * environment.
 *
 * Values are never echoed: a failed parse names the variable and the rule it broke, and
 * `describeConfig` is what the boot log prints.
 */
import { z } from 'zod'
import type { AvatarCredential } from './ports/avatar-provider.port.ts'

const TRUE = new Set(['1', 'true', 'yes', 'on'])
const FALSE = new Set(['0', 'false', 'no', 'off'])

const bool = z.preprocess((v) => {
  if (typeof v !== 'string') return v
  const s = v.trim().toLowerCase()
  if (TRUE.has(s)) return true
  if (FALSE.has(s)) return false
  return v
}, z.boolean())

/** Comma-separated. Blank entries are dropped, so a trailing comma is harmless. */
const list = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : v,
  z.array(z.string()),
)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const ConfigSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().default('0.0.0.0'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /** Which BankDataPort adapter the composition root wires. */
    BANK_SOURCE: z.enum(['memory', 'postgres', 'idbi-sandbox']).default('memory'),
    /** Required by `postgres`. The API is the only process that ever connects. */
    DATABASE_URL: z.string().url().optional(),

    /** Which AvatarProvider adapter. `runway` needs a key and a character id. */
    AVATAR_PROVIDER: z.enum(['runway', 'none']).default('none'),
    /** The kill switch: false wires the null provider without a deploy of code. */
    AVATAR_ENABLED: bool.default(true),
    /** Parallel lists; entries pair by index. One key, one character is the ordinary case. */
    RUNWAY_API_KEY: list.default([]),
    RUNWAY_CHARACTER_ID: list.default([]),
    RUNWAY_API_BASE: z.string().url().default('https://api.dev.runwayml.com'),
    /** Per-call cap. Runway accepts 10–1800; 600 turns one shared slot over across reviewers. */
    RUNWAY_MAX_SESSION_SECONDS: z.coerce.number().int().min(10).max(1800).default(600),
    /** Minutes per day across every credential, read from the store. 240 ≈ US$48. */
    RUNWAY_DAILY_MINUTE_BUDGET: z.coerce.number().int().min(0).default(240),
    AVATAR_SESSIONS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(5),

    /** Allowed browser origins. Unset reflects any origin, which is only right in dev. */
    CORS_ORIGIN: list.optional(),
    /** Behind CloudFront/ALB the client IP is in X-Forwarded-For; rate limits key on it. */
    TRUST_PROXY: bool.default(false),
    /** Guards /operator/*. Absent means those routes answer 404. */
    OPERATOR_KEY: z.string().min(16, 'at least 16 characters').optional(),

    /** Faults to inject, by name (see infra/fault-inject.ts). Refused in production. */
    FAULT_INJECT: list.default([]),

    /** The persona anchor every fixture window is measured from. It never moves. */
    SEED_ANCHOR: isoDate.default('2026-09-01'),
    /** Months of ledger seeded past the anchor: the clock's headroom. */
    SEED_FORWARD_MONTHS: z.coerce.number().int().min(0).max(120).default(18),

    /** Stamped into engineVersion and the seed run. Set by the image build. */
    GIT_SHA: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.BANK_SOURCE === 'postgres' && !c.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'required when BANK_SOURCE=postgres',
      })
    }
    if (c.AVATAR_PROVIDER === 'runway') {
      if (c.RUNWAY_API_KEY.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RUNWAY_API_KEY'],
          message: 'required when AVATAR_PROVIDER=runway',
        })
      }
      if (c.RUNWAY_CHARACTER_ID.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RUNWAY_CHARACTER_ID'],
          message: 'required when AVATAR_PROVIDER=runway',
        })
      }
    }
    // A fault injector in production is a foot-gun with a bank's name on it.
    if (c.NODE_ENV === 'production' && c.FAULT_INJECT.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FAULT_INJECT'],
        message: 'refused when NODE_ENV=production',
      })
    }
  })

export type Config = z.infer<typeof ConfigSchema>

export class ConfigError extends Error {
  readonly issues: readonly { key: string; message: string }[]

  constructor(issues: readonly { key: string; message: string }[]) {
    super(`invalid configuration: ${issues.map((i) => `${i.key} (${i.message})`).join(', ')}`)
    this.name = 'ConfigError'
    this.issues = issues
  }
}

/**
 * Parse the environment. Blank values count as unset, because `.env.example` ships them blank
 * and an empty string should mean "use the default", not "the port is zero".
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const present: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.trim() !== '') present[key] = value
  }

  const parsed = ConfigSchema.safeParse(present)
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => ({ key: i.path.join('.') || '(root)', message: i.message })),
    )
  }
  return parsed.data
}

/**
 * Runway credentials as the pool sees them. One character id shared across keys is not usable —
 * a Character belongs to the account that created it — so the fallback to the first id exists
 * only to keep a single-key setup working.
 */
export function runwayCredentials(config: Config): AvatarCredential[] {
  return config.RUNWAY_API_KEY.map((key, i) => ({
    key,
    characterId: config.RUNWAY_CHARACTER_ID[i] ?? config.RUNWAY_CHARACTER_ID[0] ?? '',
    label: `runway-${i + 1}`,
  })).filter((c) => c.characterId !== '')
}

/** True when the composition root should wire the real provider rather than the null one. */
export function avatarIsLive(config: Config): boolean {
  return config.AVATAR_PROVIDER === 'runway' && config.AVATAR_ENABLED
}

/** What the boot log prints. Secrets are counted, never shown. */
export function describeConfig(config: Config): Record<string, unknown> {
  return {
    port: config.PORT,
    host: config.HOST,
    nodeEnv: config.NODE_ENV,
    bankSource: config.BANK_SOURCE,
    database: config.DATABASE_URL ? 'set' : 'unset',
    avatarProvider: config.AVATAR_PROVIDER,
    avatarEnabled: config.AVATAR_ENABLED,
    runwayCredentials: runwayCredentials(config).length,
    runwayMaxSessionSeconds: config.RUNWAY_MAX_SESSION_SECONDS,
    runwayDailyMinuteBudget: config.RUNWAY_DAILY_MINUTE_BUDGET,
    corsOrigin: config.CORS_ORIGIN ?? 'any (dev)',
    trustProxy: config.TRUST_PROXY,
    operatorKey: config.OPERATOR_KEY ? 'set' : 'unset',
    faultInject: config.FAULT_INJECT,
    seedAnchor: config.SEED_ANCHOR,
    seedForwardMonths: config.SEED_FORWARD_MONTHS,
    gitSha: config.GIT_SHA ?? 'unknown',
  }
}
