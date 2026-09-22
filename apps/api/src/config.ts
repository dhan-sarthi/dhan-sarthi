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
import type { AvatarCredential, AvatarVendor } from './ports/avatar-provider.port.ts'

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

/**
 * How many numbered accounts a provider may carry: `RUNWAY_API_KEY_1` … `RUNWAY_API_KEY_9`.
 * One account is one concurrent call on both providers, so this is also the ceiling on calls
 * at once.
 */
export const MAX_ACCOUNT_SLOTS = 9

/** One numbered Runway account, as `RUNWAY_API_KEY_n` and `RUNWAY_CHARACTER_ID_n` spell it. */
const RunwayAccountSchema = z.object({
  slot: z.number().int().min(1).max(MAX_ACCOUNT_SLOTS),
  key: z.string().optional(),
  characterId: z.string().optional(),
})

/**
 * One numbered Anam account. The voice and the brain are optional here because the
 * account-wide `ANAM_VOICE_ID` / `ANAM_LLM_ID` cover an account that shares them — but a cloned
 * voice belongs to the account that cloned it, so a second account usually names its own.
 */
const AnamAccountSchema = z.object({
  slot: z.number().int().min(1).max(MAX_ACCOUNT_SLOTS),
  key: z.string().optional(),
  avatarId: z.string().optional(),
  voiceId: z.string().optional(),
  llmId: z.string().optional(),
})

const VENDORS = ['runway', 'anam'] as const

/**
 * `AVATAR_PROVIDER` is the order accounts are tried in, by provider: `runway,anam` means every
 * Runway account first, then every Anam one. A single name still works, and `none` alone turns
 * the avatar off.
 */
const providerChain = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : v,
  z
    .array(z.enum(['runway', 'anam', 'none']))
    .min(1)
    .refine((names) => !(names.includes('none') && names.length > 1), {
      message: '"none" cannot be combined with a provider',
    })
    .transform((names) => [...new Set(names)]),
)

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
     * Which providers, in the order their accounts are tried: `runway,anam` puts every Runway
     * account ahead of every Anam one. They are interchangeable behind the same port — the same
     * lease, minute budget, brief, tools and routes — and the client learns which one took a
     * call only from the grant's `transport`.
     */
    AVATAR_PROVIDER: providerChain.default(['none']),
    /** The kill switch: false wires the null provider without a deploy of code. */
    AVATAR_ENABLED: bool.default(true),
    /**
     * Numbered accounts, gathered by `loadConfig` from `RUNWAY_API_KEY_n` and
     * `RUNWAY_CHARACTER_ID_n`. Slot order is try order. A Character belongs to the account that
     * made it, so every slot names its own.
     */
    RUNWAY_ACCOUNTS: z.array(RunwayAccountSchema).default([]),
    /**
     * The older spelling: parallel comma lists, entries paired by index. Read only when no
     * numbered Runway slot is set, so a deployment pinned to it keeps working unchanged.
     */
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

    /** Numbered Anam accounts, from `ANAM_API_KEY_n`, `ANAM_AVATAR_ID_n` and friends. */
    ANAM_ACCOUNTS: z.array(AnamAccountSchema).default([]),
    /** The older spelling, read only when no numbered Anam slot is set. */
    ANAM_API_KEY: list.default([]),
    ANAM_AVATAR_ID: list.default([]),
    ANAM_API_BASE: z.string().url().default('https://api.anam.ai'),
    /** The voice and brain for any Anam account that does not name its own. */
    ANAM_VOICE_ID: z.string().optional(),
    ANAM_LLM_ID: z.string().optional(),
    /**
     * What Anam's speech recogniser expects to hear (ISO 639-1). Unset is the org default,
     * English. Anam cannot detect the language itself and fixes it per session, so `hi` trades
     * clean English transcription for Hindi; the reply's language follows the customer either
     * way, because that is the brief's instruction rather than this setting.
     */
    ANAM_LANGUAGE_CODE: z
      .string()
      .regex(/^[a-z]{2}$/, 'an ISO 639-1 code, like en or hi')
      .optional(),
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
    /**
     * Below this balance an account is skipped, in the provider's units. Runway's 42 credits is
     * two minutes (2 up front, 2 per six seconds), so the last call an account takes is not cut
     * off in its first sentence. Anam publishes no balance and is never skipped for it.
     */
    AVATAR_MIN_CREDITS: z.coerce.number().int().min(0).default(42),
    /**
     * Seconds a hung-up call gets to end on its own before it is cancelled. Runway keeps a
     * transcript and a recording only for a session that ends itself, and the slot stays held
     * while it does. Measured: a short call completed within 7 s of END_CALL; a 90 s one had not
     * after 10.
     */
    AVATAR_END_GRACE_SECONDS: z.coerce.number().int().min(0).max(120).default(20),

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
     * What answers when `IDBI_API_BASE` is set and the sandbox cannot: `replay` serves IDBI's
     * own captured responses (adapters/idbi-sandbox/api/failover.ts), `off` lets the outage
     * reach the customer. The sandbox allow-lists IPs, so a new network is refused outright.
     */
    IDBI_FALLBACK: z.enum(['replay', 'off']).default('replay'),
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
    for (const issue of avatarIssues(c)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.key], message: issue.message })
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
    if (typeof value === 'string' && value.trim() !== '') present[key] = value.trim()
  }

  const parsed = ConfigSchema.safeParse({ ...present, ...numberedAccounts(present) })
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => ({ key: i.path.join('.') || '(root)', message: i.message })),
    )
  }
  return parsed.data
}

/**
 * The numbered account variables, gathered into the two account lists the schema validates.
 *
 * Only slots with at least one variable set are returned, so an `.env` that ships blank
 * placeholders for slots 2 and 3 configures exactly slot 1 — and a half-filled slot (a key with
 * no character) is a startup error naming the missing variable, not a silently skipped account.
 */
function numberedAccounts(env: Record<string, string>): {
  RUNWAY_ACCOUNTS?: z.input<typeof RunwayAccountSchema>[]
  ANAM_ACCOUNTS?: z.input<typeof AnamAccountSchema>[]
} {
  const runway: z.input<typeof RunwayAccountSchema>[] = []
  const anam: z.input<typeof AnamAccountSchema>[] = []
  for (let slot = 1; slot <= MAX_ACCOUNT_SLOTS; slot += 1) {
    const r = {
      slot,
      key: env[`RUNWAY_API_KEY_${slot}`],
      characterId: env[`RUNWAY_CHARACTER_ID_${slot}`],
    }
    if (r.key || r.characterId) runway.push(r)
    const a = {
      slot,
      key: env[`ANAM_API_KEY_${slot}`],
      avatarId: env[`ANAM_AVATAR_ID_${slot}`],
      voiceId: env[`ANAM_VOICE_ID_${slot}`],
      llmId: env[`ANAM_LLM_ID_${slot}`],
    }
    if (a.key || a.avatarId || a.voiceId || a.llmId) anam.push(a)
  }
  return {
    ...(runway.length > 0 ? { RUNWAY_ACCOUNTS: runway } : {}),
    ...(anam.length > 0 ? { ANAM_ACCOUNTS: anam } : {}),
  }
}

/** Only the fields the credential builders read, so the schema's refinement can call them. */
type AvatarEnv = Pick<
  Config,
  | 'AVATAR_PROVIDER'
  | 'RUNWAY_ACCOUNTS'
  | 'RUNWAY_API_KEY'
  | 'RUNWAY_CHARACTER_ID'
  | 'ANAM_ACCOUNTS'
  | 'ANAM_API_KEY'
  | 'ANAM_AVATAR_ID'
  | 'ANAM_VOICE_ID'
  | 'ANAM_LLM_ID'
  | 'ANAM_PUBLIC_BASE_URL'
>

/** The providers named in `AVATAR_PROVIDER`, in try order. Empty for `none`. */
export function avatarChain(config: Pick<Config, 'AVATAR_PROVIDER'>): AvatarVendor[] {
  return config.AVATAR_PROVIDER.filter((p): p is AvatarVendor =>
    (VENDORS as readonly string[]).includes(p),
  )
}

/** A second copy of the same key is the same account, and one account is one slot. */
function distinctKeys(creds: AvatarCredential[]): AvatarCredential[] {
  const seen = new Set<string>()
  return creds.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)))
}

/**
 * Each provider's accounts, numbered slots first. The comma lists are read only where no slot
 * is set: mixing the two spellings for one provider would make the try order a guess.
 *
 * One id shared across several keys is not usable on Runway — a Character belongs to the
 * account that created it — so the list form's fallback to the first id exists only to keep a
 * single-key setup working.
 */
const CREDENTIALS: Record<AvatarVendor, (c: AvatarEnv) => AvatarCredential[]> = {
  runway: (c) =>
    distinctKeys(
      c.RUNWAY_ACCOUNTS.length > 0
        ? c.RUNWAY_ACCOUNTS.filter((a) => a.key && a.characterId).map((a) => ({
            provider: 'runway' as const,
            key: a.key!,
            characterId: a.characterId!,
            label: `runway-${a.slot}`,
          }))
        : c.RUNWAY_API_KEY.map((key, i) => ({
            provider: 'runway' as const,
            key,
            characterId: c.RUNWAY_CHARACTER_ID[i] ?? c.RUNWAY_CHARACTER_ID[0] ?? '',
            label: `runway-${i + 1}`,
          })).filter((cred) => cred.characterId !== ''),
    ),
  anam: (c) =>
    distinctKeys(
      c.ANAM_ACCOUNTS.length > 0
        ? c.ANAM_ACCOUNTS.filter((a) => a.key && a.avatarId).map((a) => ({
            provider: 'anam' as const,
            key: a.key!,
            characterId: a.avatarId!,
            label: `anam-${a.slot}`,
            ...(a.voiceId ? { voiceId: a.voiceId } : {}),
            ...(a.llmId ? { llmId: a.llmId } : {}),
          }))
        : c.ANAM_API_KEY.map((key, i) => ({
            provider: 'anam' as const,
            key,
            characterId: c.ANAM_AVATAR_ID[i] ?? c.ANAM_AVATAR_ID[0] ?? '',
            label: `anam-${i + 1}`,
          })).filter((cred) => cred.characterId !== ''),
    ),
}

/**
 * Every account the pool may spend, in the order it tries them: each provider in
 * `AVATAR_PROVIDER` order, and within a provider by slot.
 *
 * `characterId` is Runway's Character or Anam's avatar id. The credentials are counted under
 * the kill switch too, so the availability route can say "disabled" (a decision) rather than
 * "not configured" (a gap).
 */
export function avatarCredentials(config: AvatarEnv): AvatarCredential[] {
  return avatarChain(config).flatMap((vendor) => CREDENTIALS[vendor](config))
}

/**
 * What stops a named provider from starting, as readable issues rather than a 500 on the first
 * call. A provider named in `AVATAR_PROVIDER` with no usable account is an error, not a quiet
 * skip: somebody asked for it.
 */
function avatarIssues(c: AvatarEnv): { key: string; message: string }[] {
  const issues: { key: string; message: string }[] = []
  const chain = avatarChain(c)
  const named = `required when AVATAR_PROVIDER includes`

  for (const a of c.RUNWAY_ACCOUNTS) {
    if (!a.key)
      issues.push({
        key: `RUNWAY_API_KEY_${a.slot}`,
        message: `required when RUNWAY_CHARACTER_ID_${a.slot} is set`,
      })
    if (!a.characterId)
      issues.push({
        key: `RUNWAY_CHARACTER_ID_${a.slot}`,
        message: `required when RUNWAY_API_KEY_${a.slot} is set`,
      })
  }
  for (const a of c.ANAM_ACCOUNTS) {
    if (!a.key)
      issues.push({
        key: `ANAM_API_KEY_${a.slot}`,
        message: `required when another ANAM_*_${a.slot} is set`,
      })
    if (!a.avatarId)
      issues.push({
        key: `ANAM_AVATAR_ID_${a.slot}`,
        message: `required when ANAM_API_KEY_${a.slot} is set`,
      })
  }

  if (chain.includes('runway') && CREDENTIALS.runway(c).length === 0) {
    issues.push({
      key: 'RUNWAY_API_KEY_1',
      message: `${named} runway (or the RUNWAY_API_KEY list)`,
    })
    if (c.RUNWAY_ACCOUNTS.length === 0 && c.RUNWAY_API_KEY.length > 0) {
      issues.push({ key: 'RUNWAY_CHARACTER_ID', message: `${named} runway` })
    }
  }
  if (chain.includes('anam')) {
    const anam = CREDENTIALS.anam(c)
    if (anam.length === 0) {
      issues.push({ key: 'ANAM_API_KEY_1', message: `${named} anam (or the ANAM_API_KEY list)` })
    }
    for (const cred of anam) {
      const slot = cred.label.split('-')[1]
      if (!cred.voiceId && !c.ANAM_VOICE_ID) {
        issues.push({
          key: `ANAM_VOICE_ID_${slot}`,
          message: `${named} anam (or set ANAM_VOICE_ID)`,
        })
      }
      if (!cred.llmId && !c.ANAM_LLM_ID) {
        issues.push({ key: `ANAM_LLM_ID_${slot}`, message: `${named} anam (or set ANAM_LLM_ID)` })
      }
    }
    // Without this the tools are declared with a URL nobody can call, and the model would
    // answer from its own head. A gate that cannot be reached is worse than no gate.
    if (!c.ANAM_PUBLIC_BASE_URL) {
      issues.push({ key: 'ANAM_PUBLIC_BASE_URL', message: `${named} anam` })
    }
  }
  return issues
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
  return avatarChain(config).length > 0 && config.AVATAR_ENABLED
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
    avatarProvider: config.AVATAR_PROVIDER.join(','),
    avatarEnabled: config.AVATAR_ENABLED,
    avatarCredentials: avatarCredentials(config).length,
    // Labels, in try order. Which accounts exist is not a secret; their keys are.
    avatarAccounts: avatarCredentials(config).map((c) => c.label),
    avatarMinCredits: config.AVATAR_MIN_CREDITS,
    anamLanguage: config.ANAM_LANGUAGE_CODE ?? 'org default',
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
