/**
 * `pnpm --filter @dhan/api seed [--check] [--force] [--anchor YYYY-MM-DD] [--forward N] [--history N]`
 *
 * Migrates, generates the four personas, and writes them through the same path a bank
 * response will take: one staging.raw_payloads row per persona under a consented
 * staging.sync_runs row, then a projection into the bank.* mirrors. Nothing in the projector
 * reads a persona spec; it reads the payload, so the pipeline the sandbox will use is the
 * pipeline the demo runs every day.
 *
 * Idempotent by construction: the generator is deterministic, the run is one transaction, and
 * the content hash is recorded in staging.seed_runs. `--check` regenerates and compares.
 * Reseeding wipes the fixtures customers (cascading every reviewer session) and is refused
 * while sessions exist unless `--force`; the append-only record is never touched.
 *
 * The last step re-derives every persona through the Postgres adapter and deep-compares the
 * snapshot to the generator's, so a seed that does not reproduce the memory path's numbers
 * fails here rather than in front of a reviewer.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { accountFactsAsOf, addMonths, derive, liabilityAsOf, ruleBook } from '@dhan/core'
import type { Holding, Institution, Transaction } from '@dhan/core'
import { PERSONAS, generateCustomerFile } from '@dhan/fixtures'
import type { SeedAccountRow, SeedBundle } from '@dhan/fixtures'
import type pg from 'pg'
import { recordedGeneratorVersion } from '../adapters/memory/generated-source.ts'
import { PostgresBankData } from '../adapters/postgres/bank-data.postgres.ts'
import {
  casaType,
  channelForMode,
  coverTypeForPolicy,
  depositType,
  employmentCode,
  genderCode,
  heldVia,
  kycCode,
  loanProductKind,
  loanTypeCode,
  maritalCode,
  policyTypeCode,
  productType,
} from '../adapters/postgres/codes.ts'
import { latestSeedRun } from '../adapters/postgres/seed-provenance.postgres.ts'
import { withTransaction } from '../adapters/postgres/unit-of-work.ts'
import { engineVersion } from '../application/engine-version.ts'
import { sha256Hex } from '../application/hash.ts'
import { loadConfig } from '../config.ts'
import { migrate } from '../db/migrate.ts'
import { createPool } from '../db/pool.ts'
import type { Db } from '../db/pool.ts'
import { buildSeedPlan } from '../db/seed-bundle.ts'
import type { SeedOptions, SeedPersona, SeedPlan } from '../db/seed-bundle.ts'

const ENDPOINT = 'fixtures/customer-file'
// 2: statement lines go to the account that carried them, and every holding is projected.
const PROJECTOR = { name: 'projectFixturesCustomerFile', version: '2' }

export interface SeedReport {
  skipped: boolean
  seedRunId: string | null
  contentSha256: string
  rowCounts: Record<string, number>
  personas: { slug: string; cif: string; idleFloor: number; deployable: number }[]
}

export interface CheckReport {
  ok: boolean
  expectedSha256: string | null
  actualSha256: string
  /** False when the rows were written by an older projector: same content, stale shape. */
  projectorCurrent: boolean
  recordedRowCounts: Record<string, number>
  liveRowCounts: Record<string, number>
}

export interface SeedRunOptions extends SeedOptions {
  force?: boolean
  gitSha?: string
  log?: (line: string) => void
}

/* ------------------------------------------------------------------ *
 * Versions
 * ------------------------------------------------------------------ */

const require = createRequire(import.meta.url)

/** A workspace package's version, from the package.json above its resolved entry. */
function packageVersion(name: string): string {
  try {
    let dir = dirname(require.resolve(name))
    for (let i = 0; i < 4; i += 1) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
          name?: string
          version?: string
        }
        if (pkg.name === name && pkg.version) return pkg.version
      } catch {
        // keep climbing
      }
      dir = dirname(dir)
    }
  } catch {
    // unresolved: fall through
  }
  return '0.0.0'
}

export function seedVersions(gitSha: string | undefined): { engine: string; generator: string } {
  return {
    engine: engineVersion(packageVersion('@dhan/core'), gitSha),
    // The same stamp the Postgres SeedInfo re-derives to check for drift, from the same
    // function, so the two cannot disagree about the format.
    generator: recordedGeneratorVersion(packageVersion('@dhan/fixtures'), gitSha),
  }
}

/* ------------------------------------------------------------------ *
 * Projection: payload → bank.*
 * ------------------------------------------------------------------ */

interface RunContext {
  slug: string
  customerId: string
  syncRunId: string
  rawPayloadId: string
  /** The run's business time: the anchor, at UTC midnight. */
  asOf: string
  counts: Record<string, number>
}

const count = (ctx: RunContext, table: string, n: number): void => {
  ctx.counts[table] = (ctx.counts[table] ?? 0) + n
}

/** Four digits from a name, so a loan account gets a stable masked number without a real one. */
const maskedFrom = (seed: string): string =>
  `XXXXXX${(parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 6), 16) % 10_000)
    .toString()
    .padStart(4, '0')}`

const pad2 = (i: number): string => String(i).padStart(2, '0')

async function upsertCustomer(db: Db, b: SeedBundle): Promise<string> {
  const c = b.customer
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO app.customers
       (cif, cust_id, display_name, preferred_language, tax_regime, data_source, onboarding_state,
        persona_slug, pitch, demonstrates, display_order, ledger_anchor, ledger_history_from, ledger_horizon)
     VALUES ($1, $2, $3, $4, $5, 'fixtures', 'active', $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (cust_id) DO UPDATE SET
       cif = EXCLUDED.cif, display_name = EXCLUDED.display_name, preferred_language = EXCLUDED.preferred_language,
       tax_regime = EXCLUDED.tax_regime, persona_slug = EXCLUDED.persona_slug, pitch = EXCLUDED.pitch,
       demonstrates = EXCLUDED.demonstrates, display_order = EXCLUDED.display_order,
       ledger_anchor = EXCLUDED.ledger_anchor,
       ledger_history_from = EXCLUDED.ledger_history_from, ledger_horizon = EXCLUDED.ledger_horizon,
       erased_at = NULL
     RETURNING id`,
    [
      c.cif,
      c.custId,
      c.custName,
      c.preferredLanguage,
      c.taxRegime,
      b.slug,
      b.pitch,
      b.demonstrates,
      b.displayOrder,
      b.horizon.anchor,
      b.horizon.from,
      b.horizon.to,
    ],
  )
  return rows[0]?.id as string
}

async function upsertConsent(db: Db, customerId: string, b: SeedBundle): Promise<string> {
  const { consent, horizon } = b
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO app.consents
       (customer_id, consent_reference, kind, purpose_code, purpose_text, scopes, data_period_from,
        data_period_to, fetch_type, frequency_unit, frequency_value, status, granted_at, valid_from, valid_to)
     VALUES ($1, $2, 'synthetic', '101', $3, $4, $5, $6, 'PERIODIC', 'DAY', 1, 'ACTIVE',
             now(), $7::timestamptz, $8::timestamptz)
     ON CONFLICT (consent_reference) DO UPDATE SET
       customer_id = EXCLUDED.customer_id, status = 'ACTIVE',
       granted_at = coalesce(app.consents.granted_at, now()), revoked_at = NULL, revocation_reason = NULL,
       valid_from = EXCLUDED.valid_from, valid_to = EXCLUDED.valid_to,
       data_period_from = EXCLUDED.data_period_from, data_period_to = EXCLUDED.data_period_to
     RETURNING id`,
    [
      customerId,
      consent.consentId,
      consent.purpose,
      consent.scopes,
      horizon.from,
      horizon.to,
      `${consent.validFrom}T00:00:00Z`,
      `${consent.validTo}T00:00:00Z`,
    ],
  )
  const id = rows[0]?.id as string
  await db.query(
    `INSERT INTO app.consent_events (consent_id, event, actor, detail) VALUES ($1, 'granted', 'system', $2)`,
    [id, JSON.stringify({ seed: true, reference: consent.consentId })],
  )
  return id
}

async function openSyncRun(
  db: Db,
  customerId: string,
  consentId: string,
  b: SeedBundle,
  engine: string,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO staging.sync_runs
       (customer_id, consent_id, source, trigger, data_blocks, data_period_from, data_period_to,
        data_freshness_date, as_of, started_at, finished_at, status, response_status, engine_version)
     VALUES ($1, $2, 'fixtures', 'backfill', $3, $4, $5, $5, $6::timestamptz, now(), now(), 'succeeded', 'OK', $7)
     RETURNING id`,
    [
      customerId,
      consentId,
      b.consent.scopes,
      b.horizon.from,
      b.horizon.to,
      `${b.horizon.anchor}T00:00:00Z`,
      engine,
    ],
  )
  const id = rows[0]?.id as string
  await db.query(
    `INSERT INTO app.consent_events (consent_id, event, actor, detail) VALUES ($1, 'used', 'system', $2)`,
    [consentId, JSON.stringify({ endpoint: ENDPOINT, sync_run_id: id })],
  )
  return id
}

async function storePayload(db: Db, ctx: RunContext, p: SeedPersona): Promise<string> {
  const json = JSON.stringify(p.bundle)
  const params = { slug: p.bundle.slug, ...p.bundle.horizon }
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO staging.raw_payloads
       (sync_run_id, endpoint_id, source, endpoint_code, customer_id, request_params, http_status,
        response_status, payload, payload_hash, payload_bytes, contains_pii)
     VALUES ($1, (SELECT id FROM staging.endpoint_registry WHERE source = 'fixtures' AND endpoint_code = $2),
             'fixtures', $2, $3, $4, 200, 'OK', $5, $6, $7, false)
     ON CONFLICT (source, endpoint_code, payload_hash) DO NOTHING
     RETURNING id`,
    [
      ctx.syncRunId,
      ENDPOINT,
      ctx.customerId,
      JSON.stringify(params),
      json,
      p.payloadHash,
      Buffer.byteLength(json),
    ],
  )
  if (inserted.rows[0]) {
    count(ctx, 'staging.raw_payloads', 1)
    return inserted.rows[0].id
  }
  // The same bytes are already on file: a reseed is a replay, not a second payload.
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM staging.raw_payloads WHERE source = 'fixtures' AND endpoint_code = $1 AND payload_hash = $2`,
    [ENDPOINT, p.payloadHash],
  )
  return existing.rows[0]?.id as string
}

async function projectProfile(db: Db, ctx: RunContext, b: SeedBundle): Promise<void> {
  const c = b.customer
  await db.query(
    `INSERT INTO bank.customer_profiles
       (customer_id, sync_run_id, source, as_of, raw_payload_id, cif, cust_name, date_of_birth, gender, gender_raw,
        marital_status, marital_status_raw, dependents_count, employment_type, employment_type_raw,
        declared_annual_income, kyc_status, kyc_status_raw, risk_profile, customer_since, city, state_code,
        preferred_language)
     VALUES ($1, $2, 'fixtures', $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
             $18, $19, $20, (SELECT state_code FROM ref.state_codes WHERE state_code = $21), $22)
     ON CONFLICT (customer_id, sync_run_id) DO NOTHING`,
    [
      ctx.customerId,
      ctx.syncRunId,
      ctx.asOf,
      ctx.rawPayloadId,
      c.cif,
      c.custName,
      c.dateOfBirth,
      genderCode(c.gender),
      c.gender,
      maritalCode(c.maritalStatus),
      c.maritalStatus,
      c.dependents,
      employmentCode(c.employmentType),
      c.employmentType,
      c.declaredAnnualIncome,
      kycCode(c.kycStatus),
      c.kycStatus,
      c.riskProfile,
      c.customerSince,
      c.city,
      c.stateCode,
      c.preferredLanguage,
    ],
  )
  count(ctx, 'bank.customer_profiles', 1)
}

interface AccountPlacement {
  /** Null means IDBI, which is what an account row meant before a customer could bank elsewhere. */
  institution?: Institution
  isPrimary?: boolean
  /** Position in the bundle's accounts list, which is the order the customer file lists them in. */
  displayOrder?: number
}

async function upsertAccount(
  db: Db,
  ctx: RunContext,
  ref: string,
  masked: string,
  productKind: string,
  schemeType: string,
  placement: AccountPlacement = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bank.accounts
       (customer_id, account_ref, account_number_masked, product_kind, scheme_type, source, first_seen_run_id,
        last_seen_run_id, institution_name, institution_ifsc_prefix, institution_is_home, is_primary, display_order)
     VALUES ($1, $2, $3, $4, $5, 'fixtures', $6, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (customer_id, account_ref) DO UPDATE SET
       last_seen_run_id = EXCLUDED.last_seen_run_id,
       institution_name = EXCLUDED.institution_name,
       institution_ifsc_prefix = EXCLUDED.institution_ifsc_prefix,
       institution_is_home = EXCLUDED.institution_is_home,
       is_primary = EXCLUDED.is_primary,
       display_order = EXCLUDED.display_order
     RETURNING id`,
    [
      ctx.customerId,
      ref,
      masked,
      productKind,
      schemeType,
      ctx.syncRunId,
      placement.institution?.name ?? null,
      placement.institution?.ifscPrefix ?? null,
      placement.institution?.isHome ?? null,
      placement.isPrimary ?? false,
      placement.displayOrder ?? null,
    ],
  )
  count(ctx, 'bank.accounts', 1)
  return rows[0]?.id as string
}

/** `bank.transactions` CHECKs that an MCC only appears on a rail that could have carried one. */
const MCC_CHANNELS: ReadonlySet<string> = new Set(['POS', 'ECOM', 'ATM', 'UPI', 'OTHER'])

const casaRef = (slug: string, a: SeedAccountRow): string =>
  `fx:${slug}:casa:${a.accountNumberMasked.slice(-4)}`

async function projectCasa(
  db: Db,
  ctx: RunContext,
  b: SeedBundle,
  account: SeedAccountRow,
  displayOrder: number,
  own: readonly Transaction[],
): Promise<string> {
  const kind = casaType(account.accountType)
  const accountId = await upsertAccount(
    db,
    ctx,
    casaRef(ctx.slug, account),
    account.accountNumberMasked,
    'CASA',
    kind === 'CURRENT' ? 'CAA' : 'SBA',
    {
      ...(account.institution === undefined ? {} : { institution: account.institution }),
      isPrimary: account.isPrimary,
      displayOrder,
    },
  )
  // What API 394 (or the aggregator's DEPOSIT summary) would have reported on the run's as-of
  // date, from this account's own ledger. Four accounts have four running balances, not one.
  const facts = accountFactsAsOf(
    own.filter((t) => t.txnDate <= b.horizon.anchor),
    b.horizon.anchor,
    account.openingBalance === undefined ? {} : { openingBalance: account.openingBalance },
  )
  await db.query(
    `INSERT INTO bank.account_snapshots
       (account_id, sync_run_id, source, as_of, raw_payload_id, account_type, account_type_raw, is_salary_account,
        mode_of_operation, status, opening_date, current_balance, avg_monthly_balance_3m, avg_monthly_balance_12m,
        min_balance_12m, balance_as_of, branch_ifsc, interest_rate)
     VALUES ($1, $2, 'fixtures', $3::timestamptz, $4, $5, $6, $7, 'SINGLE', 'ACTIVE', $8, $9, $10, $11, $12, $3::timestamptz, $13, $14)
     ON CONFLICT (account_id, sync_run_id) DO NOTHING`,
    [
      accountId,
      ctx.syncRunId,
      ctx.asOf,
      ctx.rawPayloadId,
      kind,
      account.accountType,
      kind === 'SAVINGS' && b.customer.employmentType === 'Salaried',
      account.accountOpeningDate,
      facts.currentBalance,
      facts.avgMonthlyBalance3m,
      facts.avgMonthlyBalance12m,
      facts.minBalance12m,
      account.branchIfsc ?? null,
      account.interestRate ?? null,
    ],
  )
  count(ctx, 'bank.account_snapshots', 1)
  return accountId
}

async function projectTransactions(
  db: Db,
  ctx: RunContext,
  accountId: string,
  accountRef: string,
  txns: readonly Transaction[],
  /** Each line's position in the customer's whole ledger, so interleaved accounts read back in order. */
  order: readonly number[],
): Promise<void> {
  const BATCH = 1_000
  for (let start = 0; start < txns.length; start += BATCH) {
    const batch = txns.slice(start, start + BATCH)
    const seqs = order.slice(start, start + BATCH)
    await db.query(
      `INSERT INTO bank.transactions
         (account_id, customer_id, source, first_seen_run_id, raw_payload_id, tran_id, dedupe_hash, seq,
          tran_date, value_date, tran_type, amount, balance_after, channel_code, channel_raw, narration,
          spend_category_bank, is_salary_credit_bank, is_recurring_bank, mcc, counterparty_vpa,
          merchant_name_bank, is_self_transfer)
       SELECT $1, $2, 'fixtures', $3, $4, t.tran_id, t.dedupe_hash, t.seq, t.tran_date, t.value_date, t.tran_type,
              t.amount, t.balance_after, t.channel_code, t.channel_raw, t.narration, t.spend_category,
              t.is_salary, t.is_recurring, t.mcc, t.vpa, t.merchant_name, t.is_self_transfer
       FROM unnest($5::text[], $6::text[], $7::int[], $8::date[], $9::text[], $10::numeric[], $11::numeric[],
                   $12::text[], $13::text[], $14::text[], $15::text[], $16::boolean[], $17::boolean[],
                   $18::date[], $19::text[], $20::text[], $21::text[], $22::boolean[])
            AS t(tran_id, dedupe_hash, seq, tran_date, tran_type, amount, balance_after, channel_code,
                 channel_raw, narration, spend_category, is_salary, is_recurring, value_date, mcc, vpa,
                 merchant_name, is_self_transfer)
       ON CONFLICT (account_id, tran_id, part_tran_srl_num) DO NOTHING`,
      [
        accountId,
        ctx.customerId,
        ctx.syncRunId,
        ctx.rawPayloadId,
        batch.map((t) => t.txnId),
        batch.map((t, i) =>
          sha256Hex(
            [
              accountRef,
              t.txnDate,
              t.txnType,
              t.txnAmount,
              t.narration,
              t.balanceAfterTxn,
              seqs[i],
            ].join('|'),
          ),
        ),
        seqs,
        batch.map((t) => t.txnDate),
        batch.map((t) => t.txnType),
        batch.map((t) => t.txnAmount),
        batch.map((t) => t.balanceAfterTxn),
        batch.map((t) => channelForMode(t.txnMode)),
        batch.map((t) => t.txnMode),
        batch.map((t) => t.narration),
        batch.map((t) => t.spendCategory),
        batch.map((t) => t.isSalaryCredit),
        batch.map((t) => t.isRecurring),
        batch.map((t) => t.valueDate),
        // The schema only allows an MCC on the rails that carry one, so a code on any other
        // channel is dropped here rather than failing the whole batch on a CHECK.
        batch.map((t) =>
          MCC_CHANNELS.has(channelForMode(t.txnMode)) ? (t.mccCode ?? null) : null,
        ),
        batch.map((t) => t.counterpartyVpa ?? null),
        batch.map((t) => t.merchantName ?? null),
        batch.map((t) => t.isSelfTransfer === true),
      ],
    )
  }
  count(ctx, 'bank.transactions', txns.length)
}

async function projectDeposit(
  db: Db,
  ctx: RunContext,
  b: SeedBundle,
  account: SeedAccountRow,
  displayOrder: number,
): Promise<void> {
  const type = depositType(account.accountType)
  const balance = account.currentBalance ?? 0
  // The deposit's holding view carries the name; match it on the facts they share.
  const holding = b.holdings.find(
    (h) =>
      (h.holdingType === 'FD' || h.holdingType === 'RD') &&
      h.maturityDate === account.maturityDate &&
      h.currentValue === balance,
  )
  const accountId = await upsertAccount(
    db,
    ctx,
    `fx:${ctx.slug}:${type.toLowerCase()}:${account.accountNumberMasked.slice(-4)}`,
    account.accountNumberMasked,
    type === 'RD' ? 'RECURRING_DEPOSIT' : 'TERM_DEPOSIT',
    'TDA',
    {
      ...(account.institution === undefined ? {} : { institution: account.institution }),
      displayOrder,
    },
  )
  await db.query(
    `INSERT INTO bank.term_deposit_snapshots
       (account_id, sync_run_id, source, as_of, raw_payload_id, deposit_type, deposit_type_raw, description,
        principal_amount, current_value, opening_date, maturity_date, interest_rate, status,
        recurring_amount, recurring_deposit_day, branch_ifsc)
     VALUES ($1, $2, 'fixtures', $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE', $13, $14, $15)
     ON CONFLICT (account_id, sync_run_id) DO NOTHING`,
    [
      accountId,
      ctx.syncRunId,
      ctx.asOf,
      ctx.rawPayloadId,
      type,
      account.accountType,
      holding?.name ?? null,
      holding?.investedAmount ?? balance,
      balance,
      account.accountOpeningDate,
      account.maturityDate ?? null,
      account.interestRate ?? holding?.interestRate ?? 0,
      type === 'RD' ? (holding?.sipAmount ?? balance) : null,
      type === 'RD' ? (holding?.sipDebitDay ?? 1) : null,
      account.branchIfsc ?? null,
    ],
  )
  count(ctx, 'bank.term_deposit_snapshots', 1)
}

async function projectLoans(db: Db, ctx: RunContext, b: SeedBundle): Promise<void> {
  for (const [i, loan] of b.liabilityContracts.entries()) {
    const code = loanTypeCode(loan.loanType, loan.isRevolving)
    const kind = loanProductKind(code)
    const accountId = await upsertAccount(
      db,
      ctx,
      `fx:${ctx.slug}:loan:${pad2(i)}`,
      maskedFrom(`${ctx.slug}:${loan.lender}:${loan.loanType}`),
      kind,
      kind === 'CREDIT_CARD' ? 'CCA' : 'LAA',
    )
    const atAnchor = liabilityAsOf(loan, b.horizon.anchor, b.horizon.anchor)
    await db.query(
      `INSERT INTO bank.loan_snapshots
         (account_id, sync_run_id, source, as_of, raw_payload_id, lender, loan_type, loan_type_raw,
          outstanding_principal, interest_rate, emi_amount, emi_due_day, tenure_remaining_months, dpd,
          status, is_revolving, security_type)
       VALUES ($1, $2, 'fixtures', $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ACTIVE', $14, 'UNSECURED')
       ON CONFLICT (account_id, sync_run_id) DO NOTHING`,
      [
        accountId,
        ctx.syncRunId,
        ctx.asOf,
        ctx.rawPayloadId,
        loan.lender,
        code,
        loan.loanType,
        atAnchor?.outstandingPrincipal ?? 0,
        loan.rate,
        loan.emiAmount,
        loan.emiDay,
        loan.tenureRemainingAtAnchor,
        loan.dpdStatus ?? 0,
        loan.isRevolving ?? false,
      ],
    )
    count(ctx, 'bank.loan_snapshots', 1)
  }
}

async function projectSips(db: Db, ctx: RunContext, b: SeedBundle): Promise<Set<string>> {
  const names = new Set<string>()
  for (const [i, sip] of b.sipContracts.entries()) {
    names.add(sip.scheme)
    await db.query(
      `INSERT INTO bank.sip_registrations
         (customer_id, sync_run_id, source, as_of, registration_ref, platform, scheme_name, asset_class, amount,
          frequency, instalment_day, start_date, until_cancelled, status, held_via)
       VALUES ($1, $2, 'fixtures', $3::timestamptz, $4, 'OTHER', $5, $6, $7, 'MONTHLY', $8, $9, true, 'ACTIVE', $10)
       ON CONFLICT (customer_id, registration_ref, sync_run_id) DO NOTHING`,
      [
        ctx.customerId,
        ctx.syncRunId,
        ctx.asOf,
        `fx:${ctx.slug}:sip:${pad2(i)}`,
        sip.scheme,
        sip.assetClass,
        sip.amount,
        sip.day,
        addMonths(b.horizon.anchor, -sip.startsMonthsBeforeAnchor),
        heldVia(sip.heldOutsideIdbi),
      ],
    )
    count(ctx, 'bank.sip_registrations', 1)
  }
  return names
}

/** The fields a bank.mf_holdings row carries back. A fund with anything more goes to other_holdings. */
const FUND_MIRROR_FIELDS: ReadonlySet<string> = new Set([
  'holdingType',
  'name',
  'assetClass',
  'investedAmount',
  'currentValue',
  'sipActive',
  'heldOutsideIdbi',
])

/**
 * A plain folio: what the fund mirror can hold without losing a field. A SIP's own scheme is not
 * one — the loader rolls it from the registration and would hide a folio of the same name.
 */
const fitsFundMirror = (h: Holding, sipNames: ReadonlySet<string>): boolean =>
  h.holdingType === 'MUTUAL_FUND' &&
  h.assetClass !== 'Protection' &&
  !h.sipActive &&
  !sipNames.has(h.name) &&
  Object.keys(h).every((k) => FUND_MIRROR_FIELDS.has(k))

/**
 * Every holding that is not a SIP, each where its kind lives: a plain fund folio in the fund
 * mirror, and EPF, NPS, PPF, shares and anything else in bank.other_holdings. The position is the
 * bundle's, shared across both tables, so the loader reads them back in the order they were given.
 */
async function projectHoldings(
  db: Db,
  ctx: RunContext,
  holdings: readonly Holding[],
  sipNames: ReadonlySet<string>,
): Promise<void> {
  for (const [i, h] of holdings.entries()) {
    if (fitsFundMirror(h, sipNames)) {
      await db.query(
        `INSERT INTO bank.mf_holdings
           (customer_id, sync_run_id, source, as_of, raw_payload_id, folio_no, amc, scheme_name, asset_class, units,
            cost_value, current_value, held_via, position)
         VALUES ($1, $2, 'fixtures', $3::timestamptz, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12)
         ON CONFLICT DO NOTHING`,
        [
          ctx.customerId,
          ctx.syncRunId,
          ctx.asOf,
          ctx.rawPayloadId,
          `fx:${ctx.slug}:mf:${pad2(i)}`,
          h.name.split(' ')[0] ?? 'Unknown',
          h.name,
          h.assetClass,
          h.investedAmount,
          h.currentValue,
          heldVia(h.heldOutsideIdbi),
          i,
        ],
      )
      count(ctx, 'bank.mf_holdings', 1)
      continue
    }
    await db.query(
      `INSERT INTO bank.other_holdings
         (customer_id, sync_run_id, source, as_of, raw_payload_id, holding_ref, position, holding_type, name,
          asset_class, invested_amount, current_value, sip_active, sip_amount, sip_debit_day, maturity_date,
          interest_rate, held_via, custodian, ticker, isin, units, avg_cost, purchased_on)
       VALUES ($1, $2, 'fixtures', $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
               $18, $19, $20, $21, $22, $23)
       ON CONFLICT (customer_id, holding_ref, sync_run_id) DO NOTHING`,
      [
        ctx.customerId,
        ctx.syncRunId,
        ctx.asOf,
        ctx.rawPayloadId,
        `fx:${ctx.slug}:hold:${pad2(i)}`,
        i,
        h.holdingType,
        h.name,
        h.assetClass,
        h.investedAmount,
        h.currentValue,
        h.sipActive,
        h.sipAmount ?? null,
        h.sipDebitDay ?? null,
        h.maturityDate ?? null,
        h.interestRate ?? null,
        heldVia(h.heldOutsideIdbi),
        h.custodian ?? null,
        h.ticker ?? null,
        h.isin ?? null,
        h.units ?? null,
        h.avgCost ?? null,
        h.purchasedOn ?? null,
      ],
    )
    count(ctx, 'bank.other_holdings', 1)
  }
}

async function projectPolicies(
  db: Db,
  ctx: RunContext,
  policies: readonly Holding[],
): Promise<void> {
  for (const [i, p] of policies.entries()) {
    const type = policyTypeCode(p.name)
    await db.query(
      `INSERT INTO bank.insurance_policies
         (customer_id, sync_run_id, source, as_of, raw_payload_id, policy_number, insurer, plan_name, policy_type,
          cover_type, cover_amount, sum_assured, premium_amount, premium_frequency, fund_value, policy_start_date,
          maturity_date, status, sold_via, custodian)
       VALUES ($1, $2, 'fixtures', $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               'IN_FORCE', $17, $18)
       ON CONFLICT (customer_id, insurer, policy_number, sync_run_id) DO NOTHING`,
      [
        ctx.customerId,
        ctx.syncRunId,
        ctx.asOf,
        ctx.rawPayloadId,
        `fx:${ctx.slug}:pol:${pad2(i)}`,
        p.custodian ?? p.name.split(' ')[0] ?? 'Unknown',
        p.name,
        type,
        coverTypeForPolicy(type),
        // The cover the engine reads. A policy's own sum assured is kept beside it when stated:
        // on a ULIP the two differ, and the figure paid in is not the figure it pays out.
        p.investedAmount,
        p.sumAssured ?? null,
        p.sipActive ? (p.sipAmount ?? null) : (p.annualPremium ?? null),
        p.sipActive ? 'MONTHLY' : 'ANNUAL',
        p.currentValue,
        p.purchasedOn ?? null,
        p.maturityDate ?? null,
        p.heldOutsideIdbi === false
          ? 'IDBI_BANCASSURANCE'
          : p.heldOutsideIdbi
            ? 'OTHER'
            : 'UNKNOWN',
        p.custodian ?? null,
      ],
    )
    count(ctx, 'bank.insurance_policies', 1)
  }
}

async function projectPersona(
  db: Db,
  p: SeedPersona,
  engine: string,
): Promise<Record<string, number>> {
  const b = p.bundle
  const customerId = await upsertCustomer(db, b)
  const consentId = await upsertConsent(db, customerId, b)
  const syncRunId = await openSyncRun(db, customerId, consentId, b, engine)
  const ctx: RunContext = {
    slug: b.slug,
    customerId,
    syncRunId,
    rawPayloadId: '',
    asOf: `${b.horizon.anchor}T00:00:00Z`,
    counts: {},
  }
  ctx.rawPayloadId = await storePayload(db, ctx, p)

  await projectProfile(db, ctx, b)

  const isCasa = (a: SeedAccountRow): boolean =>
    a.accountType === 'Savings' || a.accountType === 'Current'
  const isDeposit = (a: SeedAccountRow): boolean => a.accountType === 'FD' || a.accountType === 'RD'

  // An unstamped line is the primary account's, which is what a single-bank statement means. A
  // customer with accounts elsewhere has every line stamped with the account that carried it.
  const primary = b.accounts.find((a) => a.isPrimary && isCasa(a)) ?? b.accounts.find(isCasa)
  if (!primary) throw new Error(`${b.slug}: no operative account to attach the statement to`)
  const byAccount = new Map<string, { txns: Transaction[]; order: number[] }>()
  for (const [seq, t] of b.transactions.entries()) {
    const masked = t.accountNumberMasked ?? primary.accountNumberMasked
    const lines = byAccount.get(masked) ?? { txns: [], order: [] }
    lines.txns.push(t)
    lines.order.push(seq)
    byAccount.set(masked, lines)
  }

  for (const [displayOrder, account] of b.accounts.entries()) {
    if (isCasa(account)) {
      const lines = byAccount.get(account.accountNumberMasked) ?? { txns: [], order: [] }
      byAccount.delete(account.accountNumberMasked)
      const id = await projectCasa(db, ctx, b, account, displayOrder, lines.txns)
      await projectTransactions(db, ctx, id, casaRef(b.slug, account), lines.txns, lines.order)
    } else if (isDeposit(account)) {
      await projectDeposit(db, ctx, b, account, displayOrder)
    }
  }
  // A line stamped with an account the bundle does not hold would vanish from every balance.
  const orphans = [...byAccount.keys()]
  if (orphans.length > 0) {
    throw new Error(
      `${b.slug}: statement lines for accounts not in the bundle: ${orphans.join(', ')}`,
    )
  }
  await projectLoans(db, ctx, b)
  const sipNames = await projectSips(db, ctx, b)
  await projectHoldings(db, ctx, b.holdings, sipNames)
  await projectPolicies(db, ctx, b.policies)

  const rows = Object.values(ctx.counts).reduce((s, n) => s + n, 0)
  await db.query(
    `INSERT INTO staging.projections (raw_payload_id, projector, projector_version, status, finished_at, rows_upserted)
     VALUES ($1, $2, $3, 'projected', now(), $4)
     ON CONFLICT (raw_payload_id, projector, projector_version) DO UPDATE SET
       status = 'projected', finished_at = now(), rows_upserted = EXCLUDED.rows_upserted`,
    [ctx.rawPayloadId, PROJECTOR.name, PROJECTOR.version, rows],
  )
  count(ctx, 'staging.projections', 1)
  count(ctx, 'staging.sync_runs', 1)
  count(ctx, 'app.customers', 1)
  count(ctx, 'app.consents', 1)
  return ctx.counts
}

/* ------------------------------------------------------------------ *
 * Reference data: the shelf and the rule book
 * ------------------------------------------------------------------ */

async function upsertShelf(db: Db, plan: SeedPlan): Promise<number> {
  for (const p of plan.shelf) {
    await db.query(
      `INSERT INTO ref.products
         (product_id, name, product_type, category, riskometer, manufacturer, min_investment, lock_in_years,
          expense_ratio, indicative_return, insurance_product, bundles_protection_and_investment, cover_amount,
          cover_type, is_transactable, is_transactable_sandbox, aliases, verified, source, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16, $17, $18, $19)
       ON CONFLICT (product_id) DO UPDATE SET
         name = EXCLUDED.name, product_type = EXCLUDED.product_type, category = EXCLUDED.category,
         riskometer = EXCLUDED.riskometer, manufacturer = EXCLUDED.manufacturer,
         min_investment = EXCLUDED.min_investment, lock_in_years = EXCLUDED.lock_in_years,
         expense_ratio = EXCLUDED.expense_ratio, indicative_return = EXCLUDED.indicative_return,
         insurance_product = EXCLUDED.insurance_product,
         bundles_protection_and_investment = EXCLUDED.bundles_protection_and_investment,
         cover_amount = EXCLUDED.cover_amount, cover_type = EXCLUDED.cover_type,
         is_transactable = EXCLUDED.is_transactable, is_transactable_sandbox = EXCLUDED.is_transactable_sandbox,
         aliases = EXCLUDED.aliases, verified = EXCLUDED.verified, source = EXCLUDED.source,
         note = EXCLUDED.note, valid_to = NULL`,
      [
        p.productId,
        p.name,
        productType(p.category),
        p.category,
        p.riskometer,
        p.manufacturer,
        p.minInvestment,
        p.lockInYears,
        p.expenseRatio ?? null,
        p.indicativeReturn ?? null,
        p.insuranceProduct ?? false,
        p.bundlesProtectionAndInvestment ?? false,
        p.coverAmount ?? null,
        p.coverType ?? null,
        p.transactable,
        p.aliases,
        p.verified,
        p.source === 'idbi' ? 'idbi_api' : 'fixtures',
        p.note ?? null,
      ],
    )
  }
  return plan.shelf.length
}

/** 'HIGH_INTEREST_DEBT' → 'High interest debt'. */
const title = (id: string): string => {
  const words = id.toLowerCase().split('_')
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
}

async function upsertRules(db: Db, engine: string, gitSha: string | undefined): Promise<number> {
  await db.query(
    `INSERT INTO ref.engine_versions (version, git_sha, notes) VALUES ($1, $2, 'registered by pnpm seed')
     ON CONFLICT (version) DO NOTHING`,
    [engine, gitSha ?? null],
  )
  // The rule book is what the gate executes today; the rows for this version say exactly that.
  await db.query(`DELETE FROM ref.suitability_rules WHERE rules_version = $1`, [engine])
  for (const [i, rule] of ruleBook.entries()) {
    await db.query(
      `INSERT INTO ref.suitability_rules (rules_version, rule_id, ordinal, title, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [engine, rule.id, i + 1, title(rule.id), rule.description],
    )
  }
  return ruleBook.length
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

const TABLES = [
  'app.customers',
  'app.consents',
  'staging.sync_runs',
  'staging.raw_payloads',
  'staging.projections',
  'bank.customer_profiles',
  'bank.accounts',
  'bank.account_snapshots',
  'bank.transactions',
  'bank.term_deposit_snapshots',
  'bank.loan_snapshots',
  'bank.sip_registrations',
  'bank.mf_holdings',
  'bank.other_holdings',
  'bank.insurance_policies',
  'ref.products',
] as const

const FIXTURE_CUSTOMERS = `SELECT id FROM app.customers WHERE data_source = 'fixtures'`
const FIXTURE_ACCOUNTS = `SELECT id FROM bank.accounts WHERE customer_id IN (${FIXTURE_CUSTOMERS})`
const FIXTURE_PAYLOADS = `SELECT id FROM staging.raw_payloads WHERE customer_id IN (${FIXTURE_CUSTOMERS})`

/**
 * The wipe, leaf first. `DELETE FROM app.customers` alone is not enough and only looked like it
 * was: staging.sync_runs cascades straight off the customer, while a dozen bank.* mirrors point
 * at the run with NO ACTION, so the wipe's success rests on the order Postgres happens to fire
 * the cascades in. On this schema it fires the sync-run cascade first and the reseed dies on
 * account_snapshots_sync_run_id_fkey. Deleting the referencing rows ourselves makes it
 * deterministic — bank.mandates before bank.accounts (debit_account_id is NO ACTION),
 * app.snapshots before staging.sync_runs (sync_run_id is NO ACTION).
 *
 * The last statement still leans on cascades, but only inside app.*: consents → consent events,
 * subjects → sessions → idempotency keys. The append-only record has no key into any of it.
 */
const WIPE: readonly string[] = [
  `DELETE FROM bank.sip_registrations WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM bank.nominees WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM bank.loan_schedules WHERE account_id IN (${FIXTURE_ACCOUNTS})`,
  `DELETE FROM bank.loan_snapshots WHERE account_id IN (${FIXTURE_ACCOUNTS})`,
  `DELETE FROM bank.term_deposit_snapshots WHERE account_id IN (${FIXTURE_ACCOUNTS})`,
  `DELETE FROM bank.account_snapshots WHERE account_id IN (${FIXTURE_ACCOUNTS})`,
  `DELETE FROM bank.transactions WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM bank.mandates WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM bank.mf_holdings WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM bank.other_holdings WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM bank.insurance_policies WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM bank.customer_profiles WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM bank.accounts WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  // Cascades to app.actions and app.roadmap_versions, which hang off the snapshot.
  `DELETE FROM app.snapshots WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM staging.projections WHERE raw_payload_id IN (${FIXTURE_PAYLOADS})`,
  `DELETE FROM staging.raw_payloads WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM staging.sync_runs WHERE customer_id IN (${FIXTURE_CUSTOMERS})`,
  `DELETE FROM app.customers WHERE data_source = 'fixtures'`,
]

export async function liveRowCounts(db: Db): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const table of TABLES) {
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)
    out[table] = rows[0]?.n ?? 0
  }
  return out
}

/**
 * Whether every fixture payload was projected by this projector version. The content hash alone
 * cannot say: the bundles stay the same when only the projection changes, and a database the old
 * projector wrote would then be called up to date and fail parity on every run after.
 */
async function projectedByCurrentProjector(db: Db): Promise<boolean> {
  const { rows } = await db.query<{ current: boolean }>(
    `SELECT NOT EXISTS (
       SELECT 1 FROM staging.raw_payloads r
       WHERE r.customer_id IN (${FIXTURE_CUSTOMERS})
         AND NOT EXISTS (SELECT 1 FROM staging.projections p
                         WHERE p.raw_payload_id = r.id AND p.projector = $1
                           AND p.projector_version = $2 AND p.status = 'projected')
     ) AS current`,
    [PROJECTOR.name, PROJECTOR.version],
  )
  return rows[0]?.current ?? false
}

async function liveSessions(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM app.sessions WHERE revoked_at IS NULL`,
  )
  return rows[0]?.n ?? 0
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

/** Derive through the adapter and through the generator; they must agree to the rupee. */
async function verifyParity(
  pool: pg.Pool,
  plan: SeedPlan,
  log: (line: string) => void,
): Promise<SeedReport['personas']> {
  const bank = await PostgresBankData.connect(pool)
  const out: SeedReport['personas'] = []
  for (const { bundle } of plan.personas) {
    const spec = PERSONAS.find((p) => p.slug === bundle.slug)
    if (!spec) throw new Error(`no persona spec for ${bundle.slug}`)
    const expected = derive(
      generateCustomerFile(spec, {
        anchor: plan.anchor,
        asOf: plan.anchor,
        months: plan.historyMonths,
      }),
      plan.anchor,
    )
    const loaded = await bank.loadCustomerFile(bundle.customer.cif, plan.anchor, plan.historyMonths)
    const actual = derive(loaded.file, plan.anchor)
    assert.deepStrictEqual(
      actual,
      expected,
      `${bundle.slug}: the Postgres and generator snapshots differ`,
    )
    out.push({
      slug: bundle.slug,
      cif: bundle.customer.cif,
      idleFloor: actual.balances.idleFloor,
      deployable: actual.surplus.deployable,
    })
    log(
      `parity ${bundle.slug.padEnd(6)} idle floor ${inr(actual.balances.idleFloor)}  ` +
        `deployable ${inr(actual.surplus.deployable)}  ` +
        `(${loaded.file.transactions.length} lines to ${plan.anchor})`,
    )
  }
  return out
}

export async function seed(pool: pg.Pool, opts: SeedRunOptions): Promise<SeedReport> {
  const log = opts.log ?? (() => {})
  await migrate(pool, { log })

  const plan = buildSeedPlan(opts)
  const versions = seedVersions(opts.gitSha)
  const [last, sessions, before, projectorCurrent] = await Promise.all([
    latestSeedRun(pool),
    liveSessions(pool),
    liveRowCounts(pool),
    projectedByCurrentProjector(pool),
  ])
  const seeded = (before['app.customers'] ?? 0) > 0

  if (
    seeded &&
    !opts.force &&
    last?.contentSha256 === plan.contentSha256 &&
    projectorCurrent &&
    (before['bank.transactions'] ?? 0) > 0
  ) {
    log(`already seeded: content ${plan.contentSha256.slice(0, 12)} matches run ${last.seedRunId}`)
    const personas = await verifyParity(pool, plan, log)
    return {
      skipped: true,
      seedRunId: last.seedRunId,
      contentSha256: plan.contentSha256,
      rowCounts: before,
      personas,
    }
  }

  // Only a seed that would change the rows can erase anyone; an identical one returned above.
  // This guard used to sit after that return, so it never ran and the refusal the header
  // promises never happened: a changed generator silently took every reviewer's session with it.
  if (seeded && sessions > 0 && !opts.force) {
    throw new Error(
      `${sessions} reviewer session(s) are live and reseeding would erase them; pass --force to proceed`,
    )
  }

  const { seedRunId, rowCounts } = await withTransaction(pool, async (client) => {
    if (seeded) {
      log(`wiping fixtures rows${sessions > 0 ? ` and ${sessions} live session(s)` : ''}`)
      await client.query(`DELETE FROM app.avatar_leases`)
      await client.query(`DELETE FROM app.avatar_waitlist`)
      for (const statement of WIPE) await client.query(statement)
    }

    // Reference data first: every sync run names the engine version that projected it.
    const counts: Record<string, number> = {}
    counts['ref.suitability_rules'] = await upsertRules(client, versions.engine, opts.gitSha)
    counts['ref.products'] = await upsertShelf(client, plan)
    for (const persona of plan.personas) {
      log(
        `projecting ${persona.bundle.slug} (${persona.bundle.transactions.length} statement lines)`,
      )
      for (const [table, n] of Object.entries(
        await projectPersona(client, persona, versions.engine),
      )) {
        counts[table] = (counts[table] ?? 0) + n
      }
    }

    const run = await client.query<{ id: string }>(
      `INSERT INTO staging.seed_runs
         (generator_version, anchor, history_from, horizon_to, personas, row_counts, content_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        versions.generator,
        plan.anchor,
        plan.historyFrom,
        plan.horizonTo,
        plan.personas.map((p) => p.bundle.slug),
        JSON.stringify(counts),
        plan.contentSha256,
      ],
    )
    return { seedRunId: run.rows[0]?.id as string, rowCounts: counts }
  })

  log(`seed run ${seedRunId} content ${plan.contentSha256.slice(0, 12)}`)
  const personas = await verifyParity(pool, plan, log)
  return { skipped: false, seedRunId, contentSha256: plan.contentSha256, rowCounts, personas }
}

export async function checkSeed(pool: pg.Pool, opts: SeedOptions): Promise<CheckReport> {
  const last = await latestSeedRun(pool)
  const plan = buildSeedPlan(
    last ? { ...opts, anchor: last.anchor, generatorVersion: last.generatorVersion } : opts,
  )
  const recorded = last ? await recordedRowCounts(pool, last.seedRunId) : {}
  const live = await liveRowCounts(pool)
  const countsOk = Object.entries(recorded)
    .filter(([table]) => table in live)
    .every(([table, n]) => live[table] === n)
  const projectorCurrent = await projectedByCurrentProjector(pool)
  return {
    ok: last !== null && last.contentSha256 === plan.contentSha256 && countsOk && projectorCurrent,
    expectedSha256: last?.contentSha256 ?? null,
    actualSha256: plan.contentSha256,
    projectorCurrent,
    recordedRowCounts: recorded,
    liveRowCounts: live,
  }
}

async function recordedRowCounts(db: Db, seedRunId: string): Promise<Record<string, number>> {
  const { rows } = await db.query<{ row_counts: Record<string, number> }>(
    `SELECT row_counts FROM staging.seed_runs WHERE id = $1`,
    [seedRunId],
  )
  return rows[0]?.row_counts ?? {}
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      anchor: { type: 'string' },
      forward: { type: 'string' },
      history: { type: 'string' },
    },
  })
  const config = loadConfig()
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set')

  const options: SeedOptions = {
    anchor: values.anchor ?? config.SEED_ANCHOR,
    historyMonths: values.history ? Number(values.history) : 24,
    forwardMonths: values.forward ? Number(values.forward) : config.SEED_FORWARD_MONTHS,
    generatorVersion: seedVersions(config.GIT_SHA).generator,
  }

  const pool = createPool({
    connectionString: config.DATABASE_URL,
    applicationName: 'dhan-seed',
    max: 2,
    statementTimeoutMs: 120_000,
  })
  try {
    if (values.check) {
      const report = await checkSeed(pool, options)
      out(`seed check: ${report.ok ? 'OK' : 'DRIFT'}`)
      out(`  recorded    ${report.expectedSha256 ?? '(no seed run)'}`)
      out(`  regenerated ${report.actualSha256}`)
      if (!report.projectorCurrent) {
        out(
          `  projector   rows predate ${PROJECTOR.name} v${PROJECTOR.version}; reseed to reproject`,
        )
      }
      for (const [table, n] of Object.entries(report.liveRowCounts)) {
        const recorded = report.recordedRowCounts[table]
        const note = recorded !== undefined && recorded !== n ? `  (recorded ${recorded})` : ''
        out(`  ${table.padEnd(30)} ${String(n).padStart(6)}${note}`)
      }
      if (!report.ok) process.exitCode = 1
      return
    }

    const report = await seed(pool, {
      ...options,
      force: values.force,
      ...(config.GIT_SHA === undefined ? {} : { gitSha: config.GIT_SHA }),
      log: out,
    })
    out(report.skipped ? 'seed: up to date' : `seed: done (run ${report.seedRunId})`)
    for (const [table, n] of Object.entries(report.rowCounts).sort()) {
      out(`  ${table.padEnd(30)} ${String(n).padStart(6)}`)
    }
  } finally {
    await pool.end()
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`seed: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
}
