/**
 * Catalogue-confirmed response shapes, separate from the proposed block adapter.
 *
 * The workbook does not establish live URLs, date formats or flag vocabularies. A caller
 * supplies observed enum mappings; ISO dates and boolean flags are the synthetic convention.
 * Financial facts stay separate here where the domain has not yet defined their meaning.
 */
import { createHash } from 'node:crypto'
import type { Transaction } from '@dhan/core'

type ObjectValue = Record<string, unknown>
export type DateDecoder = (value: string, field: string) => string
export type FlagMap = Readonly<Record<string, boolean>>

/** Report the failing path without exposing a bank value or provider error message. */
export class CatalogueFormatError extends Error {
  readonly field: string

  constructor(field: string, reason: string) {
    super(`${field}: ${reason}`)
    this.name = 'CatalogueFormatError'
    this.field = field
  }
}

function object(value: unknown, field: string): ObjectValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CatalogueFormatError(field, 'expected an object')
  }
  return value as ObjectValue
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new CatalogueFormatError(field, 'expected an array')
  return value
}

function text(value: unknown, field: string, allowBlank = false): string {
  if (typeof value !== 'string' || (!allowBlank && value.trim() === '')) {
    throw new CatalogueFormatError(field, 'expected text')
  }
  return value
}

function absent(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

function decimalPaise(value: unknown, field: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new CatalogueFormatError(field, 'expected a decimal amount')
  }
  const raw = String(value)
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw)
  if (!match) throw new CatalogueFormatError(field, 'expected at most two decimal places')
  const paise = BigInt(match[2] ?? '0') * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))
  return match[1] === '-' ? -paise : paise
}

/** Parse decimal INR through integer paise; never round an invalid bank amount into validity. */
export function parseInrAmount(value: unknown, currency: unknown, field = 'amount'): number {
  if (currency !== 'INR') throw new CatalogueFormatError(field, 'expected INR currency')
  const paise = decimalPaise(value, field)
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (paise > max || paise < -max) {
    throw new CatalogueFormatError(field, 'amount exceeds safe integer paise')
  }
  const rupees = Number(paise) / 100
  // A safe integer can still lose a cent when converted to a very large rupee number.
  if (decimalPaise(String(rupees), field) !== paise) {
    throw new CatalogueFormatError(field, 'amount cannot preserve paise in the rupee contract')
  }
  return rupees
}

export function parseInrMoney(value: unknown, field = 'amount'): number {
  const money = object(value, field)
  return parseInrAmount(money['amountValue'], money['currencyCode'], field)
}

/** Strict synthetic default. Live formats must be explicitly decoded into this calendar form. */
export function decodeIsoDate(value: string, field = 'date'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new CatalogueFormatError(field, 'expected a configured calendar date format')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (year < 1 || days === undefined || day < 1 || day > days) {
    throw new CatalogueFormatError(field, 'not a calendar date')
  }
  return value
}

function date(value: unknown, field: string, decoder: DateDecoder): string {
  return decodeIsoDate(decoder(text(value, field), field), field)
}

function optionalDate(value: unknown, field: string, decoder: DateDecoder): string | null {
  return absent(value) ? null : date(value, field, decoder)
}

function flag(value: unknown, field: string, map: FlagMap | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (
    typeof value === 'string' &&
    map !== undefined &&
    Object.hasOwn(map, value) &&
    typeof map[value] === 'boolean'
  ) {
    return map[value] as boolean
  }
  throw new CatalogueFormatError(field, 'unmapped flag')
}

/** Absent errors are allowed. Blank placeholder entries provide no actual error evidence. */
function businessErrors(value: ObjectValue, field: string): void {
  if (!Object.hasOwn(value, 'errors')) return
  for (const entry of array(value['errors'], `${field}.errors`)) {
    const error = object(entry, `${field}.errors[]`)
    if (Object.values(error).some((part) => !absent(part))) {
      throw new CatalogueFormatError(`${field}.errors`, 'provider reported a business error')
    }
  }
}

function result(payload: unknown): ObjectValue {
  const root = object(payload, 'response')
  businessErrors(root, 'response')
  const value = object(root['result'], 'result')
  businessErrors(value, 'result')
  return value
}

export const STATEMENT_BALANCE_TYPES = [
  'availableBalance',
  'ledgerBalance',
  'floatingBalance',
  'fFDBalance',
  'userDefinedBalance',
] as const
export type StatementBalanceType = (typeof STATEMENT_BALANCE_TYPES)[number]

export interface IdbiStatementCursor {
  lastBalance: { amountValue: string | number; currencyCode: 'INR' }
  lastPstdDate: string
  lastTxnDate: string
  lastTxnId: string
  lastTxnSrlNo: string
}

export interface IdbiStatementRow {
  transaction: Pick<
    Transaction,
    'txnId' | 'txnDate' | 'valueDate' | 'txnAmount' | 'txnType' | 'narration' | 'balanceAfterTxn'
  >
  raw: {
    txnId: string
    txnSrlNo: string
    txnCat: string
    pstdDate: string
    txnDate: string
    valueDate: string
    instrumentId: string
  }
}

export interface IdbiStatementOptions {
  directionMap: Readonly<Record<string, 'CREDIT' | 'DEBIT'>>
  dateDecoder?: DateDecoder
  hasMoreDataMap?: FlagMap
  expectedAccountId?: string
  expectedBranchId?: string
}

export interface IdbiStatementPage {
  accountId: string
  branchId: string
  balances: Record<StatementBalanceType, number>
  transactions: IdbiStatementRow[]
  hasMoreData: boolean
  nextCursor: IdbiStatementCursor | null
}

export function parseIdbiStatement(
  payload: unknown,
  options: IdbiStatementOptions,
): IdbiStatementPage {
  const value = result(payload)
  const decoder = options.dateDecoder ?? decodeIsoDate
  const balancesRaw = object(value['accountBalances'], 'result.accountBalances')
  const accountId = text(balancesRaw['acid'], 'result.accountBalances.acid')
  const branchId = text(balancesRaw['branchId'], 'result.accountBalances.branchId')
  if (options.expectedAccountId !== undefined && options.expectedAccountId !== accountId) {
    throw new CatalogueFormatError(
      'result.accountBalances.acid',
      'response does not match requested account',
    )
  }
  if (options.expectedBranchId !== undefined && options.expectedBranchId !== branchId) {
    throw new CatalogueFormatError(
      'result.accountBalances.branchId',
      'response does not match requested branch',
    )
  }
  if (balancesRaw['currencyCode'] !== 'INR') {
    throw new CatalogueFormatError('result.accountBalances.currencyCode', 'expected INR currency')
  }
  const balances = Object.fromEntries(
    STATEMENT_BALANCE_TYPES.map((kind) => [
      kind,
      parseInrMoney(balancesRaw[kind], `result.accountBalances.${kind}`),
    ]),
  ) as Record<StatementBalanceType, number>
  const hasMoreData = flag(value['hasMoreData'], 'result.hasMoreData', options.hasMoreDataMap)
  const rawRows = array(value['transactionDetails'], 'result.transactionDetails')
  const ids = new Set<string>()
  let lastCursor: IdbiStatementCursor | null = null
  const transactions = rawRows.map((entry, index): IdbiStatementRow => {
    const field = `result.transactionDetails[${index}]`
    const row = object(entry, field)
    const summary = object(row['transactionSummary'], `${field}.transactionSummary`)
    const txnId = text(row['txnId'], `${field}.txnId`)
    const txnSrlNo = text(row['txnSrlNo'], `${field}.txnSrlNo`)
    const identity = `idbi:${createHash('sha256')
      .update(JSON.stringify([accountId, txnId, txnSrlNo]))
      .digest('hex')}`
    if (ids.has(identity)) throw new CatalogueFormatError(field, 'duplicate transaction identity')
    ids.add(identity)
    const direction = text(summary['txnType'], `${field}.transactionSummary.txnType`)
    const txnType = Object.hasOwn(options.directionMap, direction)
      ? options.directionMap[direction]
      : undefined
    if (txnType !== 'CREDIT' && txnType !== 'DEBIT') {
      throw new CatalogueFormatError(`${field}.transactionSummary.txnType`, 'unmapped direction')
    }
    const txnAmount = parseInrMoney(summary['txnAmt'], `${field}.transactionSummary.txnAmt`)
    if (txnAmount < 0)
      throw new CatalogueFormatError(
        `${field}.transactionSummary.txnAmt`,
        'expected an unsigned transaction amount',
      )
    const balance = object(row['txnBalance'], `${field}.txnBalance`)
    const balanceAfterTxn = parseInrMoney(balance, `${field}.txnBalance`)
    const raw = {
      txnId,
      txnSrlNo,
      txnCat: text(row['txnCat'], `${field}.txnCat`, true),
      pstdDate: text(row['pstdDate'], `${field}.pstdDate`),
      txnDate: text(summary['txnDate'], `${field}.transactionSummary.txnDate`),
      valueDate: text(row['valueDate'], `${field}.valueDate`),
      instrumentId: text(summary['instrumentId'], `${field}.transactionSummary.instrumentId`, true),
    }
    date(raw.pstdDate, `${field}.pstdDate`, decoder)
    // The matching last* names suggest this cursor, but its live semantics need confirmation.
    lastCursor = {
      lastBalance: { amountValue: balance['amountValue'] as string | number, currencyCode: 'INR' },
      lastPstdDate: raw.pstdDate,
      lastTxnDate: raw.txnDate,
      lastTxnId: raw.txnId,
      lastTxnSrlNo: raw.txnSrlNo,
    }
    return {
      transaction: {
        txnId: identity,
        txnDate: date(raw.txnDate, `${field}.transactionSummary.txnDate`, decoder),
        valueDate: date(raw.valueDate, `${field}.valueDate`, decoder),
        txnAmount,
        txnType,
        narration: text(summary['txnDesc'], `${field}.transactionSummary.txnDesc`, true),
        balanceAfterTxn,
      },
      raw,
    }
  })
  if (hasMoreData && transactions.length === 0) {
    throw new CatalogueFormatError('result.hasMoreData', 'nonterminal page has no cursor row')
  }
  return {
    accountId,
    branchId,
    balances,
    transactions,
    hasMoreData,
    nextCursor: hasMoreData ? lastCursor : null,
  }
}

/**
 * Reject inconsistent captures before their history can drive advice. The transport must
 * additionally retain and verify request-cursor linkage and impose a page limit: response
 * bodies alone cannot prove that a caller did not skip an intermediate page.
 */
export function parseIdbiStatementPages(
  payloads: readonly unknown[],
  options: IdbiStatementOptions,
): IdbiStatementPage {
  if (payloads.length === 0) throw new CatalogueFormatError('pages', 'statement capture is empty')
  const pages = payloads.map((payload) => parseIdbiStatement(payload, options))
  const first = pages[0] as IdbiStatementPage
  const cursors = new Set<string>()
  const ids = new Set<string>()
  const transactions: IdbiStatementRow[] = []
  for (const [index, page] of pages.entries()) {
    if (page.accountId !== first.accountId || page.branchId !== first.branchId) {
      throw new CatalogueFormatError('pages', 'account identity changed during capture')
    }
    if (STATEMENT_BALANCE_TYPES.some((kind) => page.balances[kind] !== first.balances[kind])) {
      throw new CatalogueFormatError('pages', 'balance snapshot changed during capture')
    }
    if (page.hasMoreData !== index < pages.length - 1) {
      throw new CatalogueFormatError(
        'pages',
        'capture is incomplete or continues beyond its terminal page',
      )
    }
    if (page.nextCursor) {
      const cursor = JSON.stringify(page.nextCursor)
      if (cursors.has(cursor)) throw new CatalogueFormatError('pages', 'statement cursor repeated')
      cursors.add(cursor)
    }
    for (const row of page.transactions) {
      if (ids.has(row.transaction.txnId)) {
        throw new CatalogueFormatError('pages', 'transaction identity repeated across pages')
      }
      ids.add(row.transaction.txnId)
      transactions.push(row)
    }
  }
  return { ...first, transactions, hasMoreData: false, nextCursor: null }
}

export interface IdbiLien {
  accountId: string
  lienId: string
  newLienAmount: number
  oldLienAmount: number | null
  startsOn: string | null
  endsOn: string | null
  isDeleted: boolean
  reasonCode: string
  remarks: string
}

export function parseIdbiLien(
  payload: unknown,
  options: { dateDecoder?: DateDecoder; deletedMap?: FlagMap; expectedAccountId?: string } = {},
): IdbiLien {
  const value = result(payload)
  if (options.expectedAccountId !== undefined && value['acctId'] !== options.expectedAccountId) {
    throw new CatalogueFormatError('result.acctId', 'response does not match requested account')
  }
  if (value['acctCurr'] !== 'INR')
    throw new CatalogueFormatError('result.acctCurr', 'expected INR currency')
  const field = 'result.bankInfo.lienDetails'
  const lien = object(object(value['bankInfo'], 'result.bankInfo')['lienDetails'], field)
  const validity = object(lien['lienDate'], `${field}.lienDate`)
  const decoder = options.dateDecoder ?? decodeIsoDate
  const newLienAmount = parseInrMoney(lien['newLienAmt'], `${field}.newLienAmt`)
  const oldLienAmount = absent(lien['oldLienAmt'])
    ? null
    : parseInrMoney(lien['oldLienAmt'], `${field}.oldLienAmt`)
  if (newLienAmount < 0 || (oldLienAmount !== null && oldLienAmount < 0)) {
    throw new CatalogueFormatError(field, 'lien amounts must be nonnegative')
  }
  const startsOn = optionalDate(validity['startDate'], `${field}.lienDate.startDate`, decoder)
  const endsOn = optionalDate(validity['endDate'], `${field}.lienDate.endDate`, decoder)
  if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
    throw new CatalogueFormatError(field, 'lien validity ends before it starts')
  }
  return {
    accountId: text(value['acctId'], 'result.acctId'),
    lienId: text(lien['lienId'], `${field}.lienId`),
    newLienAmount,
    oldLienAmount,
    startsOn,
    endsOn,
    isDeleted: flag(lien['isDeleted'], `${field}.isDeleted`, options.deletedMap),
    reasonCode: text(lien['reasonCode'], `${field}.reasonCode`, true),
    remarks: text(lien['remarks'], `${field}.remarks`, true),
  }
}

function optionalNumber(value: unknown, field: string, integer = false): number | null {
  if (absent(value)) return null
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new CatalogueFormatError(field, 'expected a number')
  if (!(integer ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(String(value)))
    throw new CatalogueFormatError(field, 'expected a nonnegative number')
  const number = Number(value)
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) {
    throw new CatalogueFormatError(field, 'number outside supported range')
  }
  return number
}

export interface IdbiOverdue {
  customerId: string
  accountId: string
  outstandingBalance: number | null
  totalOverdueAmount: number | null
  dpd: number | null
  npaStatus: string | null
  overdueDate: string | null
  npaDate: string | null
}

export function parseIdbiOverdues(
  payload: unknown,
  options: {
    currency: 'INR'
    dateDecoder?: DateDecoder
    expectedCustomerId?: string
    expectedAccountId?: string
  },
): IdbiOverdue[] {
  const value = result(payload)
  if (options.currency !== 'INR')
    throw new CatalogueFormatError('currency', 'expected verified account currency INR')
  const decoder = options.dateDecoder ?? decodeIsoDate
  const seen = new Set<string>()
  return array(value['overdueDetails'], 'result.overdueDetails').map((entry, index) => {
    const field = `result.overdueDetails[${index}]`
    const row = object(entry, field)
    const customerId = text(row['customerId'], `${field}.customerId`)
    const accountId = text(row['accountId'], `${field}.accountId`)
    if (options.expectedCustomerId !== undefined && options.expectedCustomerId !== customerId) {
      throw new CatalogueFormatError(
        `${field}.customerId`,
        'response does not match requested customer',
      )
    }
    if (options.expectedAccountId !== undefined && options.expectedAccountId !== accountId) {
      throw new CatalogueFormatError(
        `${field}.accountId`,
        'response does not match requested account',
      )
    }
    const key = JSON.stringify([customerId, accountId])
    if (seen.has(key)) throw new CatalogueFormatError(field, 'duplicate overdue account')
    seen.add(key)
    const amount = (key: string): number | null =>
      absent(row[key]) ? null : parseInrAmount(row[key], options.currency, `${field}.${key}`)
    const outstandingBalance = amount('outstandingBal')
    const totalOverdueAmount = amount('totalOverdueAmt')
    if (totalOverdueAmount !== null && totalOverdueAmount < 0)
      throw new CatalogueFormatError(
        `${field}.totalOverdueAmt`,
        'overdue amount must be nonnegative',
      )
    return {
      customerId,
      accountId,
      outstandingBalance,
      totalOverdueAmount,
      dpd: optionalNumber(row['dpd'], `${field}.dpd`, true),
      npaStatus: absent(row['npaStatus']) ? null : text(row['npaStatus'], `${field}.npaStatus`),
      overdueDate: optionalDate(row['overdueDate'], `${field}.overdueDate`, decoder),
      npaDate: optionalDate(row['npaDate'], `${field}.npaDate`, decoder),
    }
  })
}

export interface IdbiLimits {
  drawingPowerHistory: { applicableDate: string; amount: number; percentage: number | null }[]
  sanctionHistory: { applicableDate: string; expiryDate: string | null; amount: number }[]
}

export function parseIdbiLimits(
  payload: unknown,
  options: { dateDecoder?: DateDecoder } = {},
): IdbiLimits {
  const field = 'result.accountLimitDetails'
  const details = object(result(payload)['accountLimitDetails'], field)
  businessErrors(details, field)
  const decoder = options.dateDecoder ?? decodeIsoDate
  const history = (key: string): unknown[] =>
    array(object(details[key], `${field}.${key}`)['olimitLL'], `${field}.${key}.olimitLL`)
  const readAmount = (value: unknown, path: string): number => {
    const amount = parseInrMoney(value, path)
    if (amount < 0) throw new CatalogueFormatError(path, 'limit must be nonnegative')
    return amount
  }
  return {
    drawingPowerHistory: history('acctDrwngPowerLimitHistMsgInq').map((entry, index) => {
      const path = `${field}.acctDrwngPowerLimitHistMsgInq.olimitLL[${index}]`
      const row = object(entry, path)
      const percentage = absent(row['drwngPowerPcnt'])
        ? null
        : object(row['drwngPowerPcnt'], `${path}.drwngPowerPcnt`)['value']
      return {
        applicableDate: date(row['applicableDate'], `${path}.applicableDate`, decoder),
        amount: readAmount(row['drwngPower'], `${path}.drwngPower`),
        percentage: optionalNumber(percentage, `${path}.drwngPowerPcnt.value`),
      }
    }),
    sanctionHistory: history('acctSanctLimitHistMsg').map((entry, index) => {
      const path = `${field}.acctSanctLimitHistMsg.olimitLL[${index}]`
      const row = object(entry, path)
      const applicableDate = date(row['applicableDate'], `${path}.applicableDate`, decoder)
      const expiryDate = optionalDate(row['expiryDate'], `${path}.expiryDate`, decoder)
      if (expiryDate !== null && expiryDate < applicableDate)
        throw new CatalogueFormatError(path, 'limit expires before it applies')
      return {
        applicableDate,
        expiryDate,
        amount: readAmount(row['sanctLimit'], `${path}.sanctLimit`),
      }
    }),
  }
}
