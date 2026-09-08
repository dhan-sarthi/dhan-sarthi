/**
 * IDBI's responses to the domain, in one hop.
 *
 * This replaces a two-hop translation that went through a canonical 93-field block form named
 * after `docs/integration/data-requirements.md`. That form was what we *asked* IDBI for and it
 * is not what IDBI built: the request went out as snake_case blocks on a query string and the
 * bank serves camelCase Finacle payloads over POST. Keeping it in the middle meant formatting
 * a date to `DD-MM-YY` purely so the next step could parse it back, and it meant every field
 * IDBI does not have — declared income, risk profile, average balances — had to be invented to
 * satisfy a schema before being dropped again. So the fiction is gone and this maps the wire
 * we actually receive onto the domain we actually have.
 *
 * What the bank cannot answer is not filled in here. `Customer` needs declared income, an
 * employment type and a risk profile, and no operation in the catalogue carries any of them,
 * so they arrive from the app's own profile store through `DeclaredProfile` and the caller is
 * required to pass it. That is the honest seam: a field is either read off a captured response
 * or supplied by whoever actually holds it, and never defaulted into existence.
 *
 * Every code that lands on a fallback and every key we did not expect is recorded in a
 * `MappingReport` rather than swallowed, so a payload that drifts shows up as a report entry
 * instead of a wrong number on a screen.
 */
import { categorize } from '@dhan/core'
import type { Account, Customer, Liability, Transaction, TxnMode } from '@dhan/core'
import type { Consent, IsoDate } from '@dhan/contracts'
import { ACCOUNT_TYPE, CONSENT_STATUS, TXN_MODE, TXN_TYPE, lookupCode } from '../code-maps.ts'
import type { CodeMap } from '../code-maps.ts'
import {
  amountToPaise,
  isBlank,
  optionalAmountToPaise,
  optionalInt,
  optionalIsoDate,
  optionalPaise,
  optionalRate,
  optionalText,
  paiseToRupees,
  parseIdbiDate,
  toIsoDate,
  toPaise,
} from './scalars.ts'
import type { Paise } from './scalars.ts'
import type {
  WireAaAccount,
  WireAccountEnquiry,
  WireConsentListEntry,
  WireCustomerAccounts,
  WireCustomerRecord,
  WireFullStatement,
  WireLienEnquiry,
  WireLoanAccountDetails,
  WireLoanOverdues,
} from './schemas.ts'
import type { BalanceType } from './schemas.ts'

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

export interface CodeFallback {
  map: string
  raw: string
  landedOn: string
  where: string
}

export interface MappingNote {
  where: string
  detail: string
}

export interface MappingReport {
  codeFallbacks: CodeFallback[]
  /** Keys IDBI sent that nothing reads. Recorded once per path, not once per row. */
  unmappedPaths: Set<string>
  notes: MappingNote[]
}

export function newReport(): MappingReport {
  return { codeFallbacks: [], unmappedPaths: new Set(), notes: [] }
}

function note(report: MappingReport, where: string, detail: string): void {
  report.notes.push({ where, detail })
}

/** A code through its map, with a fallback recorded rather than hidden. */
function code<T extends string>(
  map: CodeMap<T>,
  raw: string | null,
  where: string,
  report: MappingReport,
): T | null {
  if (raw === null) return null
  const found = lookupCode(map, raw)
  if (!found.matched) {
    report.codeFallbacks.push({
      map: map.name,
      raw,
      landedOn: found.value ?? '(none)',
      where,
    })
  }
  return found.value
}

/* ------------------------------------------------------------------ *
 * Account numbers
 * ------------------------------------------------------------------ */

/**
 * IDBI sends account numbers in full — `660100100003` — while its own Account Aggregator feed
 * masks them to `XXXXXXXX0003`. The domain field is called `accountNumberMasked` and the UI
 * prints it, so a full number reaching a screen would be us leaking what the bank was careful
 * about two endpoints over. Masked here, once, at the edge.
 */
export function maskAccountNumber(raw: string): string {
  const digits = raw.trim()
  if (digits.length <= 4) return digits
  return `${'X'.repeat(digits.length - 4)}${digits.slice(-4)}`
}

/* ------------------------------------------------------------------ *
 * Balances
 * ------------------------------------------------------------------ */

export type BalanceSet = Partial<Record<BalanceType, Paise>>

/** 365's `acctBal` array as a map. Unknown balance types are recorded, not dropped silently. */
export function balancesFromEnquiry(wire: WireAccountEnquiry, report: MappingReport): BalanceSet {
  const out: BalanceSet = {}
  for (const entry of wire.acctBal) {
    const type = entry.balType.trim().toUpperCase()
    const paise = optionalAmountToPaise(entry.balAmt, `365.acctBal.${type}`)
    if (paise === null) continue
    if (!BALANCE_TYPE_SET.has(type)) {
      report.unmappedPaths.add(`365.acctBal[balType=${type}]`)
      continue
    }
    out[type as BalanceType] = paise
  }
  return out
}

const BALANCE_TYPE_SET: ReadonlySet<string> = new Set([
  'LEDGER',
  'AVAIL',
  'EFFAVL',
  'LIEN',
  'FLOAT',
  'DRWPWR',
  'ACCBAL',
])

/**
 * The spendable floor: the bank's own `EFFAVL`, never a figure we computed.
 *
 * The identity `EFFAVL = AVAIL - LIEN` holds on five of the sandbox's six accounts and breaks
 * on the sixth — the current account withholds a further ₹1,000 on top of its lien, which is
 * what a minimum balance requirement looks like. Deriving the floor would therefore have
 * credited that customer with a thousand rupees they cannot spend.
 *
 * So the sent value wins and the subtraction is only ever a fallback for a feed that omits
 * `EFFAVL`. The identity is still checked, because a *new* break is worth a note: it is the
 * cheapest available signal that one of the three fields has changed meaning.
 */
export function spendableFloor(
  balances: BalanceSet,
  where: string,
  report: MappingReport,
): Paise | null {
  const { EFFAVL, AVAIL, LIEN } = balances
  if (EFFAVL !== undefined && AVAIL !== undefined && LIEN !== undefined) {
    if (EFFAVL !== AVAIL - LIEN) {
      // Expected on a current account, where a minimum balance is withheld too. Recorded
      // rather than corrected: the gap is the bank's, and it is theirs to explain.
      note(
        report,
        where,
        `EFFAVL ${EFFAVL} is AVAIL ${AVAIL} less LIEN ${LIEN} less a further ${AVAIL - LIEN - EFFAVL} paise`,
      )
    }
  }
  if (EFFAVL !== undefined) return EFFAVL
  if (AVAIL !== undefined && LIEN !== undefined) return AVAIL - LIEN
  return AVAIL ?? null
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export interface AccountEnquiryContext {
  /** 362's lien, where it was read for this account. Falls back to the LIEN balance type. */
  lienPaise?: Paise | null
  /** 391's rate and maturity, for an account that is really a loan or a deposit. */
  interestRate?: number | null
  maturityDate?: IsoDate | null
}

/**
 * An account from 365, which is the only operation that sends the whole picture: scheme,
 * vintage, branch and all seven balances.
 *
 * `currentBalance` is `LEDGER` — the figure on the statement header and the one a customer
 * recognises — and never a sum of transaction rows. In the captured 393 the last row's running
 * balance and the ledger balance in the same payload sit about ₹288,000 apart, so a statement
 * cannot be reconciled into a balance here even when the arithmetic is clean.
 */
export function accountFromEnquiry(
  wire: WireAccountEnquiry,
  ctx: AccountEnquiryContext,
  report: MappingReport,
): Account {
  const where = `365(${wire.acctId})`
  const balances = balancesFromEnquiry(wire, report)
  const ledger = balances.LEDGER ?? balances.ACCBAL ?? balances.AVAIL
  if (ledger === undefined) {
    throw new Error(`${where}: no ledger, account or available balance to use as the balance`)
  }
  const schemeType = optionalText(wire.acctType?.schmType)
  const accountType = code(ACCOUNT_TYPE, schemeType, `${where}.acctType.schmType`, report)
  const floor = spendableFloor(balances, where, report)
  const lien = ctx.lienPaise ?? balances.LIEN ?? null
  const ifsc = ifscFor(wire, report)

  return {
    accountNumberMasked: maskAccountNumber(wire.acctId),
    accountType: accountType ?? 'Savings',
    currentBalance: paiseToRupees(ledger),
    accountOpeningDate: toIsoDate(wire.acctOpenDt, `${where}.acctOpenDt`),
    ...(ifsc === null ? {} : { branchIfsc: ifsc }),
    ...(floor === null ? {} : { effectiveAvailableBalance: paiseToRupees(floor) }),
    ...(lien === null ? {} : { lienAmount: paiseToRupees(lien) }),
    ...(ctx.interestRate == null ? {} : { interestRate: ctx.interestRate }),
    ...(ctx.maturityDate == null ? {} : { maturityDate: ctx.maturityDate }),
  }
}

/**
 * The branch IFSC, which 365 does not send.
 *
 * 595 does, as `IBKL0000105` against `branchId` 105, and the pattern is IDBI's prefix plus a
 * zero-padded branch — so it is composed from the branch id rather than left blank, and only
 * when the bank is IDBI. `IBKL` matters: the generator used to stamp `IDIB`, which is Indian
 * Bank's, and that is the sort of detail a banker spots before reading a single figure.
 */
function ifscFor(wire: WireAccountEnquiry, report: MappingReport): string | null {
  const branchId = optionalText(wire.bankInfo?.branchId)
  const bankId = optionalText(wire.bankInfo?.bankId)
  if (branchId === null) return null
  if (bankId !== null && bankId !== 'IDBI001') {
    report.unmappedPaths.add(`365.bankInfo.bankId=${bankId}`)
    return null
  }
  if (!/^\d{1,7}$/.test(branchId)) return null
  return `IBKL${branchId.padStart(7, '0')}`
}

/** 394's rows: an account number, a type and a balance, and nothing else. */
export interface AccountStub {
  acctId: string
  accountType: Account['accountType']
  balancePaise: Paise | null
  rawType: string | null
}

export function accountStubsFromList(
  wire: WireCustomerAccounts,
  report: MappingReport,
): AccountStub[] {
  return wire.customerAccountInfo.map((row) => {
    const rawType = optionalText(row.acctType)
    const mapped = code(ACCOUNT_TYPE, rawType, '394.customerAccountInfo.acctType', report)
    return {
      acctId: row.acctNumber,
      accountType: mapped ?? 'Savings',
      balancePaise: optionalAmountToPaise(row.acctBalance, '394.acctBalance'),
      rawType,
    }
  })
}

/* ------------------------------------------------------------------ *
 * Liens
 * ------------------------------------------------------------------ */

export interface LienFacts {
  lienPaise: Paise | null
  lienId: string | null
  reasonCode: string | null
  startDate: IsoDate | null
  endDate: IsoDate | null
  /** `isDeleted` is `"N"` on a live lien; a deleted one holds no money. */
  active: boolean
}

/** 362, where Finacle hangs the lien off `bankInfo` rather than beside the account. */
export function lienFromEnquiry(wire: WireLienEnquiry, report: MappingReport): LienFacts | null {
  const details = wire.bankInfo?.lienDetails
  if (details === undefined) return null
  const deleted = optionalText(details.isDeleted)
  const active = deleted === null ? true : deleted.toUpperCase() !== 'Y'
  const amount = optionalAmountToPaise(details.newLienAmt, '362.newLienAmt')
  if (amount === null) {
    report.unmappedPaths.add('362.lienDetails(no newLienAmt)')
  }
  return {
    lienPaise: active ? amount : 0,
    lienId: optionalText(details.lienId),
    reasonCode: optionalText(details.reasonCode),
    startDate: optionalIsoDate(details.lienDate?.startDate, '362.lienDate.startDate'),
    endDate: optionalIsoDate(details.lienDate?.endDate, '362.lienDate.endDate'),
    active,
  }
}

/* ------------------------------------------------------------------ *
 * Transactions
 * ------------------------------------------------------------------ */

/**
 * 393's rows.
 *
 * Three decisions worth stating. `txnType` is `D` or `C` and a row whose direction cannot be
 * read is dropped rather than guessed, because a debit filed as a credit is worse than a
 * missing line. `txnMode` is `UNKNOWN`: 393 carries `txnCat`, `txnCat` is `TCI` on every
 * captured row, and the code map's fallback would otherwise stamp `NEFT` on lines that might
 * be anything. And ordering uses `pstdDate` when it is present, because `txnDate` is midnight
 * on every row and the posting stamp is the only signal of order within a day.
 */
export function transactionsFromStatement(
  wire: WireFullStatement,
  report: MappingReport,
): Transaction[] {
  const out: Transaction[] = []
  for (const row of wire.transactionDetails) {
    const where = `393(${row.txnId})`
    const summary = row.transactionSummary
    const direction = code(TXN_TYPE, optionalText(summary.txnType), `${where}.txnType`, report)
    if (direction === null) {
      note(report, where, `dropped: txnType ${String(summary.txnType)} is not a direction`)
      continue
    }
    const posted =
      row.pstdDate === undefined ? null : parseIdbiDate(row.pstdDate, `${where}.pstdDate`)
    const txnDate = isBlank(summary.txnDate)
      ? (posted?.date ?? null)
      : toIsoDate(summary.txnDate, `${where}.txnDate`)
    if (txnDate === null) {
      note(report, where, 'dropped: no transaction or posting date')
      continue
    }
    const narration = optionalText(summary.txnDesc) ?? ''
    const base: Transaction = {
      txnId: row.txnId,
      txnDate,
      valueDate: optionalIsoDate(row.valueDate, `${where}.valueDate`) ?? txnDate,
      txnAmount: paiseToRupees(amountToPaise(summary.txnAmt, `${where}.txnAmt`)),
      txnType: direction,
      txnMode: 'UNKNOWN',
      narration,
      spendCategory: 'Transfers',
      balanceAfterTxn:
        optionalAmountToPaise(row.txnBalance, `${where}.txnBalance`) === null
          ? null
          : paiseToRupees(optionalAmountToPaise(row.txnBalance, `${where}.txnBalance`) as Paise),
      isSalaryCredit: false,
      isRecurring: false,
    }
    out.push(withCategory(base, report, where))
    // `txnCat` is the bank's own classification and is `TCI` throughout, so it is recorded as
    // an unread path rather than trusted as a second opinion.
    const cat = optionalText(row.txnCat)
    if (cat !== null) report.unmappedPaths.add(`393.txnCat=${cat}`)
  }
  return out
}

/**
 * A consented Account Aggregator statement — 595 and 739 — which is the richer feed.
 *
 * Every row carries a real `mode`, so nothing here is `UNKNOWN`, and the narrations are either
 * prose ("Salary Credit") or a recognisable rail format ("UPI/CR/21980/PAYEE0/ABCD"). That is
 * the whole reason the categoriser can run on this path and cannot run on 393. The payees are
 * still placeholders in the sandbox, so a merchant name is not invented from them.
 */
export function transactionsFromAaAccount(
  wire: WireAaAccount,
  report: MappingReport,
): Transaction[] {
  const rows = wire.Transactions?.Transaction ?? []
  const out: Transaction[] = []
  let index = 0
  for (const row of rows) {
    index += 1
    const id = optionalText(row.txnId) ?? `${wire.linkReferenceNumber ?? 'aa'}-${index}`
    const where = `595(${id})`
    const direction = code(TXN_TYPE, optionalText(row.type), `${where}.type`, report)
    if (direction === null) {
      note(report, where, `dropped: type ${String(row.type)} is not a direction`)
      continue
    }
    const stamp = optionalText(row.transactionDateTime) ?? optionalText(row.valueDate)
    if (stamp === null) {
      note(report, where, 'dropped: no transaction date')
      continue
    }
    const txnDate = toIsoDate(stamp, `${where}.transactionDateTime`)
    const mode = code(TXN_MODE, optionalText(row.mode), `${where}.mode`, report)
    const balance = optionalPaise(row.balance ?? row.currentBalance, `${where}.balance`)
    const base: Transaction = {
      txnId: id,
      txnDate,
      valueDate: optionalIsoDate(row.valueDate, `${where}.valueDate`) ?? txnDate,
      txnAmount: paiseToRupees(toPaise(row.amount, `${where}.amount`)),
      txnType: direction,
      txnMode: (mode ?? 'UNKNOWN') as TxnMode,
      narration: optionalText(row.narration) ?? '',
      spendCategory: 'Transfers',
      balanceAfterTxn: balance === null ? null : paiseToRupees(balance),
      isSalaryCredit: false,
      isRecurring: false,
    }
    out.push(withCategory(base, report, where))
  }
  return out
}

/**
 * The category, from our own engine rather than the bank's field.
 *
 * `categorize` reports its own confidence, and `low` means the fallback fired. On 393 that is
 * every row, because "S1 TXN 14" says nothing — which is a fact about the sandbox's seeding
 * and is recorded as such rather than papered over.
 */
function withCategory(txn: Transaction, report: MappingReport, where: string): Transaction {
  const enriched = categorize(txn)
  if (enriched.confidence === 'low') {
    report.unmappedPaths.add(
      `${where.split('(')[0] ?? where}: narration carries no category signal`,
    )
  }
  return {
    ...txn,
    spendCategory: enriched.category,
    isSalaryCredit: enriched.category === 'Income' && txn.txnType === 'CREDIT',
    ...(enriched.merchant === null ? {} : { merchantName: enriched.merchant }),
  }
}

/* ------------------------------------------------------------------ *
 * Liabilities
 * ------------------------------------------------------------------ */

export interface LoanFacts {
  /** 391's terms for one loan account, where they were read. */
  emiPaise?: Paise | null
  interestRate?: number | null
  tenureMonths?: number | null
  loanType?: string | null
}

/**
 * 402's overdue rows, which is the only operation that lists a customer's loan accounts with
 * an outstanding figure on each.
 *
 * 402 sends bare decimal strings rather than amount objects, and writes a missing date as the
 * four characters `NULL`. `dpd` of zero is a performing loan and `npaStatus` `SA` is standard
 * asset; a non-zero `dpd` blocks every investment recommendation downstream, which is why it
 * is carried rather than rounded away.
 */
export function liabilitiesFromOverdues(
  wire: WireLoanOverdues,
  terms: ReadonlyMap<string, LoanFacts>,
  report: MappingReport,
): Liability[] {
  const out: Liability[] = []
  for (const row of wire.overdueDetails) {
    const where = `402(${row.accountId})`
    const outstanding = optionalPaise(row.outstandingBal, `${where}.outstandingBal`)
    if (outstanding === null) {
      note(report, where, 'dropped: no outstanding balance')
      continue
    }
    // A settled account still appears here with a zero outstanding; it is not a liability.
    if (outstanding === 0) continue
    const facts = terms.get(row.accountId) ?? {}
    const dpd = optionalInt(row.dpd, `${where}.dpd`) ?? 0
    const npa = optionalText(row.npaStatus)
    if (npa !== null && npa !== 'SA') {
      note(report, where, `npaStatus is ${npa}, not the standard-asset SA`)
    }
    out.push({
      loanType: facts.loanType ?? 'Loan',
      outstandingPrincipal: paiseToRupees(outstanding),
      emiAmount: facts.emiPaise == null ? 0 : paiseToRupees(facts.emiPaise),
      loanInterestRate: facts.interestRate ?? 0,
      tenureRemainingMonths: facts.tenureMonths ?? 0,
      dpdStatus: dpd,
    })
  }
  return out
}

/** 391's terms for one loan account. */
export function loanFactsFromDetails(
  wire: WireLoanAccountDetails,
  report: MappingReport,
): { acctId: string | null; facts: LoanFacts } {
  const acctId = optionalText(wire.loanAcctId?.acctId)
  const where = `391(${acctId ?? '?'})`
  const plan = wire.loanGenDetails?.pmtPlan
  const rate =
    optionalRate(wire.netIntRate?.value, `${where}.netIntRate`) ??
    optionalRate(plan?.negotiatedRate?.value, `${where}.negotiatedRate`) ??
    optionalRate(plan?.defApplIntRate?.value, `${where}.defApplIntRate`)
  const tenure = optionalInt(wire.loanGenDetails?.loanPeriodMonths, `${where}.loanPeriodMonths`)
  // 391 sends the sanction and the disbursal but no EMI; 433's loanInfo carries emiAmount.
  if (wire.loanGenDetails?.rePmtMethod === 'EMI') {
    report.unmappedPaths.add('391: rePmtMethod is EMI but no instalment amount is sent')
  }
  return {
    acctId,
    facts: {
      interestRate: rate,
      tenureMonths: tenure,
      loanType: loanTypeFrom(optionalText(wire.loanAcctGenInfo?.acctName)),
    },
  }
}

/** 433's `loanInfo`, which is the one place an EMI amount appears. */
export function loanFactsFromRecord(wire: WireCustomerRecord): LoanFacts {
  const info = wire.loanInfo
  if (info === undefined) return {}
  return {
    emiPaise: optionalPaise(info.emiAmount, '433.loanInfo.emiAmount'),
    interestRate: optionalRate(info.netIntRate, '433.loanInfo.netIntRate'),
    tenureMonths: optionalInt(info.loanPeriodMonths, '433.loanInfo.loanPeriodMonths'),
  }
}

/** `PRIYAPATIL Loan` is all 391 gives; a product name would come from the scheme code. */
function loanTypeFrom(acctName: string | null): string | null {
  if (acctName === null) return null
  const m = /\b(home|housing|car|auto|personal|education|gold|business)\b/i.exec(acctName)
  return m
    ? `${(m[1] ?? '').charAt(0).toUpperCase()}${(m[1] ?? '').slice(1).toLowerCase()} loan`
    : null
}

/* ------------------------------------------------------------------ *
 * Customer
 * ------------------------------------------------------------------ */

/**
 * What no IDBI operation sends, and the app therefore has to hold itself.
 *
 * Income, employment, dependents, marital status, language, risk profile and tax regime are
 * advisory facts a customer declares. The catalogue has nothing resembling any of them — 433
 * comes closest and carries none — so they are a required input here rather than a default,
 * and the profile store behind `/api/v1/profile` is what supplies them.
 */
export interface DeclaredProfile {
  custId: string
  custName?: string | undefined
  maritalStatus: string
  dependents: number
  employmentType: Customer['employmentType']
  declaredAnnualIncome: number
  preferredLanguage: string
  riskProfile: Customer['riskProfile']
  taxRegime: Customer['taxRegime']
}

export interface CustomerSources {
  /** 365, for the holder's name and the branch's city. */
  enquiry?: WireAccountEnquiry | undefined
  /** 433, for date of birth, gender, PAN and the communication address. */
  record?: WireCustomerRecord | undefined
  /** 595's holder block, which carries a date of birth and a CKYC flag. */
  aaAccount?: WireAaAccount | undefined
}

export function customerFrom(
  cif: string,
  sources: CustomerSources,
  declared: DeclaredProfile,
  report: MappingReport,
): Customer {
  const { enquiry, record, aaAccount } = sources
  const holder = aaAccount?.Profile?.Holders?.Holder?.[0]

  const dob =
    optionalIsoDate(record?.dateOfBirth, '433.dateOfBirth') ??
    optionalIsoDate(holder?.dob, '595.Holder.dob')
  if (dob === null) {
    throw new Error(
      `${cif}: no date of birth from 433 or 595, and age-based suitability cannot run without one`,
    )
  }

  const name =
    declared.custName ??
    optionalText(record?.custName) ??
    optionalText(enquiry?.personName?.name) ??
    optionalText(holder?.name) ??
    cif

  const city = optionalText(record?.comuCity) ?? optionalText(enquiry?.bankInfo?.postAddr?.city)
  const stateCode =
    optionalText(record?.comuState) ?? optionalText(enquiry?.bankInfo?.postAddr?.stateProv)

  // `ckycCompliance` is the only KYC signal in the catalogue, and 595 sends it as a string.
  const ckyc = optionalText(holder?.ckycCompliance)
  const kycStatus =
    ckyc === null ? 'UNKNOWN' : ckyc.toLowerCase() === 'true' ? 'CKYC_COMPLIANT' : 'PENDING'
  if (ckyc === null) {
    report.unmappedPaths.add('kycStatus: no operation reports it without a consented AA pull')
  }

  // 433's createdDate would be the relationship's start; the sandbox sends the account's.
  const customerSince =
    optionalIsoDate(record?.acctOpenDt, '433.acctOpenDt') ??
    optionalIsoDate(enquiry?.acctOpenDt, '365.acctOpenDt') ??
    dob

  return {
    cif,
    custId: declared.custId,
    custName: name,
    dateOfBirth: dob,
    gender: genderFrom(record?.custSex, holder, report),
    maritalStatus: declared.maritalStatus,
    dependents: declared.dependents,
    employmentType: declared.employmentType,
    declaredAnnualIncome: declared.declaredAnnualIncome,
    city: city ?? 'Unknown',
    stateCode: stateCode ?? 'Unknown',
    preferredLanguage: declared.preferredLanguage,
    riskProfile: declared.riskProfile,
    kycStatus,
    customerSince,
    taxRegime: declared.taxRegime,
  }
}

/** `F`, `Female`, `M`. Left as the bank wrote it where it is neither. */
function genderFrom(
  raw: unknown,
  holder: { name?: string | undefined } | undefined,
  report: MappingReport,
): string {
  const text = optionalText(raw)
  if (text === null) {
    if (holder !== undefined) report.unmappedPaths.add('gender: not sent for this customer')
    return 'Unknown'
  }
  const s = text.toUpperCase()
  if (s === 'F' || s === 'FEMALE') return 'Female'
  if (s === 'M' || s === 'MALE') return 'Male'
  return text
}

/* ------------------------------------------------------------------ *
 * Consent
 * ------------------------------------------------------------------ */

/**
 * 591's consent entry as the artefact every advice record echoes.
 *
 * The Account Aggregator consent covers the accounts it lists, which is what the scopes are
 * read from: a consent naming a deposit account grants the statement and balance scopes, and
 * nothing in the catalogue's consent object mentions holdings, so `HOLDINGS` is granted only
 * when a linked account's `fiType` says the consent actually reaches one.
 */
export function consentFrom(
  wire: WireConsentListEntry,
  window: { validFrom: IsoDate; validTo: IsoDate },
  report: MappingReport,
): Consent {
  const id = optionalText(wire.consentID) ?? optionalText(wire.consent_handle) ?? 'UNKNOWN'
  const status = code(CONSENT_STATUS, optionalText(wire.status), '591.status', report)
  const fiTypes = new Set(
    wire.accounts.map((a) => (optionalText(a.fiType) ?? '').toUpperCase()).filter((t) => t !== ''),
  )
  const reachesInvestments = [...fiTypes].some((t) =>
    ['MUTUAL_FUNDS', 'EQUITIES', 'INSURANCE_POLICIES', 'NPS', 'ETF', 'IDR'].includes(t),
  )
  const created = optionalIsoDate(wire.consentCreationData, '591.consentCreationData')

  return {
    consentId: id,
    purpose: 'Wealth advisory',
    scopes: reachesInvestments
      ? ['PROFILE', 'ACCOUNTS', 'TXN', 'LIABILITIES', 'HOLDINGS']
      : ['PROFILE', 'ACCOUNTS', 'TXN', 'LIABILITIES'],
    status: status ?? 'REVOKED',
    validFrom: created ?? window.validFrom,
    validTo: window.validTo,
  }
}
