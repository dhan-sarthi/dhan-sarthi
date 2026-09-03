/**
 * The seed bundle: one persona as the rows a bank would hold, rather than as a file shaped for
 * one date.
 *
 * `generateCustomerFile` answers "what does this customer look like on `asOf`". A database does
 * not store answers, it stores facts: the whole ledger the clock will ever reveal, and the
 * contracts — a loan's remaining tenure at the anchor, a SIP's start — from which any date can
 * be rolled with `@dhan/core`'s as-of arithmetic. This module produces exactly those facts,
 * once, for the seed CLI to COPY into Postgres and for the in-memory adapter to hold, so the two
 * sources cannot disagree: both are the same rows shaped by the same functions.
 *
 * The ledger is generated in one pass to the horizon and sealed once. `seal` orders by date and
 * assigns ids and running balances in that order, so the rows dated on or before any `asOf`
 * are byte-identical to what `generateCustomerFile` produces for that date. The port contract
 * suite in apps/api pins that property at six clock positions for every persona.
 */
import type {
  Account,
  Customer,
  Holding,
  LiabilityContract,
  Product,
  SipContract,
  Transaction,
} from '@dhan/core'
import { addMonths } from './calendar.ts'
import { generateLedger, liabilityContract, sipContract } from './generate.ts'
import { PERSONAS, branchIfscFor } from './personas.ts'
import type { PersonaSpec } from './personas.ts'
import { PRODUCT_SHELF } from './shelf.ts'

export interface SeedBundleOptions {
  /** The persona anchor. Never moves. */
  anchor: string
  /** Months of ledger ending at the anchor, the anchor month included. */
  historyMonths: number
  /** Months of ledger past the anchor: the simulated clock's headroom. */
  forwardMonths: number
}

/** The five blocks of a customer file, which are also the five consent scopes. */
export const SEED_SCOPES = ['PROFILE', 'ACCOUNTS', 'TXN', 'LIABILITIES', 'HOLDINGS'] as const
export type SeedScope = (typeof SEED_SCOPES)[number]

/** Block 08 of the IDBI data requirements, as a fixture. Structurally the wire `Consent`. */
export interface SeedConsent {
  consentId: string
  purpose: string
  scopes: SeedScope[]
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
  validFrom: string
  validTo: string
}

export interface SeedAccountRow {
  accountNumberMasked: string
  accountType: Account['accountType']
  accountOpeningDate: string
  /** The IDBI branch the account is held at. `IBKL` plus the city's own branch code. */
  branchIfsc?: string
  /** The primary savings account: every balance is arithmetic over the ledger from here. */
  openingBalance?: number
  /** A deposit carries a fixed principal; the ledger does not move it. */
  currentBalance?: number
  interestRate?: number
  maturityDate?: string
  isPrimary: boolean
}

export interface SeedLiabilityRow extends LiabilityContract {
  lender: string
  emiDay: number
}

/** A shelf product plus how it got onto the shelf. Structurally the wire `ShelfProduct`. */
export interface SeedProductRow extends Product {
  /** Names a customer might use for it. What the avatar's product resolution matches on. */
  aliases: string[]
  source: 'fixture' | 'idbi'
  /** True once a banker has confirmed the rate and the name. */
  verified: boolean
}

export interface SeedHorizon {
  anchor: string
  /** First ledger date. */
  from: string
  /** Last ledger date. The clock may not be advanced past it. */
  to: string
  historyMonths: number
  forwardMonths: number
}

export interface SeedBundle {
  slug: string
  customer: Customer
  /** The picker copy, so the API can list customers without importing personas. */
  pitch: string
  demonstrates: string
  /**
   * Position on the picker, 1-based. Explicit rather than derived from a name or a cif, because
   * the picker tells a story in this order: the headline customer first, then the two refusals.
   */
  displayOrder: number
  consent: SeedConsent
  accounts: SeedAccountRow[]
  transactions: Transaction[]
  liabilityContracts: SeedLiabilityRow[]
  sipContracts: SipContract[]
  /** Holdings that are not SIPs. SIP holdings are rolled from `sipContracts` per date. */
  holdings: Holding[]
  policies: Holding[]
  horizon: SeedHorizon
}

export const DEFAULT_SEED_OPTIONS: SeedBundleOptions = {
  anchor: '2026-09-01',
  historyMonths: 24,
  forwardMonths: 18,
}

export function toSeedBundle(spec: PersonaSpec, options?: Partial<SeedBundleOptions>): SeedBundle {
  const opts = { ...DEFAULT_SEED_OPTIONS, ...options }
  const from = addMonths(opts.anchor, -(opts.historyMonths - 1))
  const to = addMonths(opts.anchor, opts.forwardMonths)

  // One ledger to the horizon. Truncating it at any earlier date reproduces the generator's
  // output for that date, which is the whole point of sealing once.
  const transactions = generateLedger(spec, {
    anchor: opts.anchor,
    asOf: to,
    months: opts.historyMonths,
  })

  const index = PERSONAS.findIndex((p) => p.slug === spec.slug)

  return {
    slug: spec.slug,
    customer: spec.customer,
    pitch: spec.pitch,
    demonstrates: spec.demonstrates,
    displayOrder: index === -1 ? PERSONAS.length + 1 : index + 1,
    consent: {
      consentId: `CONS_SYN_${index === -1 ? spec.slug.toUpperCase() : index + 1}`,
      purpose: 'Wealth advisory',
      scopes: [...SEED_SCOPES],
      status: 'ACTIVE',
      validFrom: from,
      validTo: addMonths(to, 12),
    },
    accounts: [
      {
        accountNumberMasked: spec.accountNumberMasked,
        accountType: 'Savings',
        accountOpeningDate: spec.customer.customerSince,
        branchIfsc: branchIfscFor(spec),
        openingBalance: spec.openingBalance,
        isPrimary: true,
      },
      ...spec.extraAccounts.map((a): SeedAccountRow => ({
        accountNumberMasked: a.accountNumberMasked,
        accountType: a.accountType,
        accountOpeningDate: a.accountOpeningDate,
        ...(a.branchIfsc === undefined ? {} : { branchIfsc: a.branchIfsc }),
        currentBalance: a.currentBalance,
        ...(a.interestRate === undefined ? {} : { interestRate: a.interestRate }),
        ...(a.maturityDate === undefined ? {} : { maturityDate: a.maturityDate }),
        isPrimary: false,
      })),
    ],
    transactions,
    liabilityContracts: spec.emis.map((emi) => ({
      ...liabilityContract(emi),
      lender: emi.lender,
      emiDay: emi.day,
    })),
    sipContracts: spec.sips.map(sipContract),
    holdings: spec.holdings,
    policies: spec.policies,
    horizon: {
      anchor: opts.anchor,
      from,
      to,
      historyMonths: opts.historyMonths,
      forwardMonths: opts.forwardMonths,
    },
  }
}

/** Every persona, bundled. */
export function seedBundles(options?: Partial<SeedBundleOptions>): SeedBundle[] {
  return PERSONAS.map((spec) => toSeedBundle(spec, options))
}

/**
 * What a customer might call each product. The avatar's `check_suitability` resolves the name
 * the model heard through these before it can evaluate anything, and an unmatched name is an
 * honest UNKNOWN_PRODUCT rather than a guess — so the list errs towards what people say
 * ("term plan", "the LIC savings plan") over what the brochure says.
 */
const SHELF_ALIASES: Readonly<Record<string, readonly string[]>> = {
  IDBI_SWEEP_001: ['sweep-in', 'sweep in FD', 'sweep-in deposit', 'auto sweep', 'flexi deposit'],
  IDBI_SSP_002: ['SSP', 'systematic savings plan', 'recurring deposit', 'RD'],
  IDBI_SUVIDHA_003: ['Suvidha', 'fixed deposit', 'FD'],
  MF_LIQUID_101: ['liquid fund', 'LIC liquid fund'],
  MF_DEBT_102: ['short duration fund', 'debt fund', 'LIC short duration'],
  MF_INDEX_103: ['index fund', 'Nifty 50', 'Nifty index fund', 'UTI Nifty'],
  MF_ELSS_104: ['ELSS', 'tax saver', 'tax saving fund', 'LIC ELSS'],
  LIC_TERM_201: ['term plan', 'term insurance', 'term cover', 'LIC term', 'term assurance'],
  NIVA_HEALTH_202: [
    'health insurance',
    'health cover',
    'mediclaim',
    'Niva Bupa',
    'ReAssure',
    'family floater',
  ],
  GOI_PMJJBY_203: ['PMJJBY', 'Jeevan Jyoti', 'Pradhan Mantri Jeevan Jyoti Bima Yojana'],
  GOI_PMSBY_204: [
    'PMSBY',
    'Suraksha Bima',
    'accident cover',
    'Pradhan Mantri Suraksha Bima Yojana',
  ],
  PFRDA_NPS_301: ['NPS', 'National Pension System', 'pension scheme', 'Tier 1'],
  GOI_PPF_302: ['PPF', 'Public Provident Fund', 'provident fund'],
  LIC_ULIP_401: [
    'ULIP',
    'LIC ULIP',
    'Market Plus',
    'LIC market plus',
    'unit linked',
    'unit linked insurance plan',
  ],
  LIC_ENDOW_402: [
    'endowment',
    'endowment plan',
    'Jeevan Anand',
    'LIC Jeevan Anand',
    'LIC savings plan',
    'savings plan',
    'money back',
  ],
}

/** The shelf as the `products` table holds it. Nothing on it is banker-verified yet. */
export function shelfRows(): SeedProductRow[] {
  return PRODUCT_SHELF.map((p) => ({
    ...p,
    aliases: [...(SHELF_ALIASES[p.productId] ?? [])],
    source: 'fixture',
    verified: false,
  }))
}
