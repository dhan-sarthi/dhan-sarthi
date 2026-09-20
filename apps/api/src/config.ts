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

/** Only the fields the per-provider requirement table below reads. */
interface AvatarEnv {
  ANAM_API_KEY: readonly string[]
  ANAM_AVATAR_ID: readonly string[]
  ANAM_VOICE_ID?: string | undefined
  ANAM_LLM_ID?: string | undefined
  ANAM_PUBLIC_BASE_URL?: string | undefined
  RUNWAY_API_KEY: readonly string[]
  RUNWAY_CHARACTER_ID: readonly string[]
}

/**
 * What each provider cannot start without, as one table rather than a branch per provider.
 *
 * Adding a third provider is a row here and a row in `AVATAR_BUILDS`
 * (composition/profiles.ts) — which is what "the provider is a swap" is worth, if it is true.
 */
const REQUIRED_BY_PROVIDER: Partial<
  Record<
    Config['AVATAR_PROVIDER'],
    readonly (readonly [key: string, present: (c: AvatarEnv) => boolean])[]
  >
> = {
  anam: [
    ['ANAM_API_KEY', (c) => c.ANAM_API_KEY.length > 0],
    ['ANAM_AVATAR_ID', (c) => c.ANAM_AVATAR_ID.length > 0],
    ['ANAM_VOICE_ID', (c) => Boolean(c.ANAM_VOICE_ID)],
    ['ANAM_LLM_ID', (c) => Boolean(c.ANAM_LLM_ID)],
    // Without this the tools are declared with a URL nobody can call, and the model would
    // answer from its own head. A gate that cannot be reached is worse than no gate.
    ['ANAM_PUBLIC_BASE_URL', (c) => Boolean(c.ANAM_PUBLIC_BASE_URL)],
  ],
  runway: [
    ['RUNWAY_API_KEY', (c) => c.RUNWAY_API_KEY.length > 0],
    ['RUNWAY_CHARACTER_ID', (c) => c.RUNWAY_CHARACTER_ID.length > 0],
  ],
}

export const ConfigSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().default('0.0.0.0'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /** Which BankDataPort adapter the composition root wires. */
    BANK_SOURCE: z.enum(['memory', 'postgres', 'idbi-sandbox']).default('memory'),
    /** Required by `postgres`. The API is the only process that ever connects. */
    DATABASE_URL: z.string().url().optional(),
    /**
     * The role the API assumes on every connection (`SET ROLE`), so the REVOKEs in migration
     * 0007 bind the server without a second login. Unset connects as the login itself; the
     * migrator and the seed never set one, because they own the objects.
     */
    DB_ROLE: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/, 'a plain SQL identifier')
      .optional(),

    /**
     * Which AvatarProvider adapter. Interchangeable: the two are wired behind the same port,
     * hold the same lease, spend the same minute budget and answer the same routes, and the
     * client learns which one ran only from the grant's `transport`.
     */
    AVATAR_PROVIDER: z.enum(['runway', 'anam', 'none']).default('none'),
    /** The kill switch: false wires the null provider without a deploy of code. */
    AVATAR_ENABLED: bool.default(true),
    /** Parallel lists; entries pair by index. One key, one character is the ordinary case. */
    RUNWAY_API_KEY: list.default([]),
    RUNWAY_CHARACTER_ID: list.default([]),
    RUNWAY_API_BASE: z.string().url().default('https://api.dev.runwayml.com'),
    /**
     * Per-call cap, whichever provider runs it. Runway accepts 10–1800 and Anam takes the same
     * number as `maxSessionLengthSeconds`; 600 turns one shared slot over across reviewers.
     * The RUNWAY_-prefixed name is the older spelling and still works.
     */
    RUNWAY_MAX_SESSION_SECONDS: z.coerce.number().int().min(10).max(1800).default(600),
    AVATAR_MAX_SESSION_SECONDS: z.coerce.number().int().min(10).max(1800).optional(),
    /** Minutes per day across every credential, read from the store. 240 ≈ US$48 on Runway. */
    RUNWAY_DAILY_MINUTE_BUDGET: z.coerce.number().int().min(0).default(240),
    AVATAR_DAILY_MINUTE_BUDGET: z.coerce.number().int().min(0).optional(),

    /** Anam. Parallel lists, same as Runway's: entries pair by index. */
    ANAM_API_KEY: list.default([]),
    ANAM_AVATAR_ID: list.default([]),
    ANAM_API_BASE: z.string().url().default('https://api.anam.ai'),
    /** Account-wide, not per-credential: one voice and one brain for Uday. */
    ANAM_VOICE_ID: z.string().optional(),
    ANAM_LLM_ID: z.string().optional(),
    /**
     * The shape of the video track.
     *
     * Anam's default is landscape (1152×768 measured) and the app plays the call full-bleed on a
     * phone, so a landscape track gets cropped to roughly 2:3 and the face ends up zoomed past
     * the eyebrows. A portrait track fixes it — but **768×1152 is the only portrait size Anam
     * accepts.** 720×1280, 768×1536, 768×1344 and 576×1152 were each rejected at connect time
     * with `POST /v1/engine/session → 400 "Invalid request to start session"`, and none of that
     * shows up when the token is minted, because minting validates nothing. Change these only
     * against a live call.
     */
    ANAM_VIDEO_WIDTH: z.coerce.number().int().min(256).max(1920).default(768),
    ANAM_VIDEO_HEIGHT: z.coerce.number().int().min(256).max(1920).default(1152),
    /**
     * Where Anam's servers reach this API. Anam calls the tool gate server-to-server, so
     * localhost is not reachable and there is no way to fake it — in dev this is a tunnel.
     */
    ANAM_PUBLIC_BASE_URL: z.string().url().optional(),
    AVATAR_SESSIONS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(5),

    /*
     * The text tier's language model.
     *
     * It phrases; it never computes. `core/query.ts` and the suitability rules have already
     * produced the figures and the verdict by the time a completion is asked for, so an absent
     * key costs the wording and nothing else — `/ask` still answers, still with evidence, and
     * `phrasedBy` on the response says `rules` rather than pretending otherwise.
     */
    OPENAI_API_KEY: z.string().optional(),
    /**
     * Any chat model this key can reach. The default is a small one on purpose: the task is
     * rewriting a sentence whose numbers are already fixed, a customer is waiting on it, and a
     * larger model buys prose nobody asked for at a second of latency. Raise it for a demo.
     */
    OPENAI_MODEL: z.string().default('gpt-5.4-mini'),
    OPENAI_API_BASE: z.string().url().default('https://api.openai.com/v1'),
    /**
     * The deadline. Past this the deterministic answer is sent instead, so the ceiling on a
     * slow model is a plainer sentence rather than a spinner.
     */
    OPENAI_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
    /** Two or three sentences. A cap, not a target; the prompt asks for brevity as well. */
    OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4_000).default(400),
    /** Low, because the figures are fixed and the only freedom left is the wording. */
    OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
    /** The kill switch, matching AVATAR_ENABLED: false wires the null model without a deploy. */
    TEXT_MODEL_ENABLED: bool.default(true),

    /** Allowed browser origins. Unset reflects any origin, which is only right in dev. */
    CORS_ORIGIN: list.optional(),
    /** Behind CloudFront/ALB the client IP is in X-Forwarded-For; rate limits key on it. */
    TRUST_PROXY: bool.default(false),
    /** Guards /operator/*. Absent means those routes answer 404. */
    OPERATOR_KEY: z.string().min(16, 'at least 16 characters').optional(),

    /** Faults to inject, by name (see infra/fault-inject.ts). Refused in production. */
    FAULT_INJECT: list.default([]),

    /** The persona anchor every fixture window is measured from. It never moves. */
    // The IDBI sandbox. Unset, BANK_SOURCE=idbi-sandbox serves the recorded sample payloads
    // through an in-process fake, so the adapter runs with no network and no credential.
    IDBI_API_BASE: z.string().url().optional(),
    /**
     * Where the Account Aggregator sends the customer back to after they approve a consent.
     *
     * It is encrypted into 592's redirection URL, so it has to be a URL this deployment
     * actually serves and the aggregator can reach — which for a local run means it cannot be
     * localhost. Unset, the consent flow still raises a handle and records notifications; only
     * the browser-return leg needs it.
     */
    AA_REDIRECT_URL: z.string().url().optional(),
    IDBI_API_KEY: z.string().optional(),
    IDBI_CONSENT_ID: z.string().optional(),

    SEED_ANCHOR: isoDate.default('2026-09-01'),
    /** Months of ledger seeded past the anchor: the clock's headroom. */
    SEED_FORWARD_MONTHS: z.coerce.number().int().min(0).max(120).default(18),
    /**
     * Months of *use* laid down behind a new session: how long this customer has had the app.
     *
     * The ledger has always gone back two years; the advice trail started this morning, so Record
     * opened on "Nothing yet" and Plan on "version 1". `HistoryService` walks a new session back
     * through this many months and runs the real engine at each one. Zero is a session with no
     * past — what the tests assert against, and the honest setting over a live bank feed, where
     * the app genuinely has not advised this customer before.
     */
    SEED_HISTORY_MONTHS: z.coerce.number().int().min(0).max(24).default(8),

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
    for (const [key, present] of REQUIRED_BY_PROVIDER[c.AVATAR_PROVIDER] ?? []) {
      if (!present(c)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `required when AVATAR_PROVIDER=${c.AVATAR_PROVIDER}`,
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

/** Which pair of parallel lists a provider's credentials come out of. */
const CREDENTIAL_LISTS: Partial<
  Record<
    Config['AVATAR_PROVIDER'],
    (c: Config) => { keys: readonly string[]; ids: readonly string[] }
  >
> = {
  anam: (c) => ({ keys: c.ANAM_API_KEY, ids: c.ANAM_AVATAR_ID }),
  runway: (c) => ({ keys: c.RUNWAY_API_KEY, ids: c.RUNWAY_CHARACTER_ID }),
}

/**
 * The credentials for whichever provider is configured, as the pool sees them.
 *
 * One shape for both, because the pool, the lease and the budget do not care which provider a
 * credential is for. `characterId` is Runway's Character or Anam's avatar id; for Anam the
 * voice and the brain are account-wide rather than per-credential, so they are not here. One
 * id shared across several keys is not usable on Runway — a Character belongs to the account
 * that created it — so the fallback to the first id exists only to keep a single-key setup
 * working.
 */
export function avatarCredentials(config: Config): AvatarCredential[] {
  const lists = CREDENTIAL_LISTS[config.AVATAR_PROVIDER]
  if (!lists) return []
  const { keys, ids } = lists(config)
  return keys
    .map((key, i) => ({
      key,
      characterId: ids[i] ?? ids[0] ?? '',
      label: `${config.AVATAR_PROVIDER}-${i + 1}`,
    }))
    .filter((c) => c.characterId !== '')
}

/**
 * The per-call cap and the daily budget, under either spelling.
 *
 * The RUNWAY_-prefixed pair is deployment-pinned and is not going away: it is set in
 * fly.api.toml, infra/terraform/variables.tf, infra/ec2-compose/cloud-init.yaml and
 * .env.example, and infra/terraform/observability.tf mirrors RUNWAY_DAILY_MINUTE_BUDGET to
 * place a CloudWatch alarm. Dropping it would fall back to defaults that happen to equal the
 * deployed values today — a silent no-op now, and a silent wrong answer the first time
 * somebody changes one.
 */
export function maxSessionSeconds(config: Config): number {
  return config.AVATAR_MAX_SESSION_SECONDS ?? config.RUNWAY_MAX_SESSION_SECONDS
}

export function dailyMinuteBudget(config: Config): number {
  return config.AVATAR_DAILY_MINUTE_BUDGET ?? config.RUNWAY_DAILY_MINUTE_BUDGET
}

/** True when the composition root should wire a real provider rather than the null one. */
export function avatarIsLive(config: Config): boolean {
  return config.AVATAR_PROVIDER !== 'none' && config.AVATAR_ENABLED
}

/**
 * True when the composition root should wire the real model rather than the null one.
 *
 * A missing key is a configuration, not a fault: the tier it leaves behind is the one the
 * product shipped with and every figure in it is still real.
 */
export function textModelIsLive(config: Config): boolean {
  return config.TEXT_MODEL_ENABLED && Boolean(config.OPENAI_API_KEY)
}

/** What the boot log prints. Secrets are counted, never shown. */
export function describeConfig(config: Config): Record<string, unknown> {
  return {
    port: config.PORT,
    host: config.HOST,
    nodeEnv: config.NODE_ENV,
    bankSource: config.BANK_SOURCE,
    database: config.DATABASE_URL ? 'set' : 'unset',
    dbRole: config.DB_ROLE ?? 'login',
    avatarProvider: config.AVATAR_PROVIDER,
    avatarEnabled: config.AVATAR_ENABLED,
    avatarCredentials: avatarCredentials(config).length,
    avatarMaxSessionSeconds: maxSessionSeconds(config),
    avatarDailyMinuteBudget: dailyMinuteBudget(config),
    textModel: textModelIsLive(config) ? config.OPENAI_MODEL : 'none (rules only)',
    corsOrigin: config.CORS_ORIGIN ?? 'any (dev)',
    trustProxy: config.TRUST_PROXY,
    operatorKey: config.OPERATOR_KEY ? 'set' : 'unset',
    faultInject: config.FAULT_INJECT,
    seedAnchor: config.SEED_ANCHOR,
    seedForwardMonths: config.SEED_FORWARD_MONTHS,
    seedHistoryMonths: config.SEED_HISTORY_MONTHS,
    gitSha: config.GIT_SHA ?? 'unknown',
  }
}
