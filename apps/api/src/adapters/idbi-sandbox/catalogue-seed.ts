/**
 * Synthetic catalogue captures plus an explicitly separate fixture supplement. Only fields
 * present in the catalogue cross the bank projector. Profile, product, card and enrichment
 * facts remain fixtures; a successful round trip does not make them bank observations.
 */
import { accountFactsAsOf, liabilityAsOf } from '@dhan/core'
import type { Account, CustomerFile, Transaction } from '@dhan/core'
import { fixtureLiquidity } from '@dhan/fixtures'
import type { SeedBundle } from '@dhan/fixtures'
import {
  CatalogueFormatError,
  parseIdbiLien,
  parseIdbiLimits,
  parseIdbiOverdues,
  parseIdbiStatementPages,
  parseIdbiStatement,
  parseInrAmount,
} from './catalogue.ts'
import type { IdbiStatementRow } from './catalogue.ts'
import { hashOf } from '../../application/hash.ts'

export { SEED_FORMAT_VERSION as CATALOGUE_SEED_VERSION } from '../../application/seed-format.ts'
import { SEED_FORMAT_VERSION as CATALOGUE_SEED_VERSION } from '../../application/seed-format.ts'
const DIRECTION = { CREDIT: 'CREDIT', DEBIT: 'DEBIT' } as const
const money = (n: number): { amountValue: string; currencyCode: 'INR' } => ({
  amountValue: parseInrAmount(n, 'INR').toFixed(2),
  currencyCode: 'INR',
})
type Enrichment = Omit<Transaction, keyof IdbiStatementRow['transaction']>

export interface CatalogueCapture {
  source: 'fixtures'
  endpoint: '393' | '362' | '402' | '441'
  request: unknown
  response: unknown
}

export interface CatalogueSeedPayload {
  version: typeof CATALOGUE_SEED_VERSION
  captures: CatalogueCapture[]
  supplement: Omit<SeedBundle, 'transactions'> & { enrichment: Record<string, Enrichment> }
}

function enrichmentOf(transactions: readonly Transaction[]): Record<string, Enrichment> {
  return Object.fromEntries(
    transactions.map((t) => [
      t.txnId,
      {
        txnMode: t.txnMode,
        spendCategory: t.spendCategory,
        isSalaryCredit: t.isSalaryCredit,
        isRecurring: t.isRecurring,
        ...(t.mccCode === undefined ? {} : { mccCode: t.mccCode }),
        ...(t.merchantName === undefined ? {} : { merchantName: t.merchantName }),
        ...(t.counterpartyVpa === undefined ? {} : { counterpartyVpa: t.counterpartyVpa }),
      },
    ]),
  )
}

export function statementCaptures(
  account: Account,
  transactions: readonly Transaction[],
  asOf: string,
  pageSize = 250,
): CatalogueCapture[] {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Invalid capture page size')
  const q = account.liquidity ?? fixtureLiquidity(account.currentBalance, asOf)
  if (q.observedOn !== asOf || Object.values(q).some((v) => v === null))
    throw new Error('Synthetic captures require complete same-date liquidity facts')
  const branchId = 'SYNTHETIC_BRANCH'
  const captures: CatalogueCapture[] = []
  let paginationDetails: unknown = undefined
  for (let offset = 0; offset < Math.max(1, transactions.length); offset += pageSize) {
    const rows = transactions.slice(offset, offset + pageSize).map((t, index) => ({
      transactionSummary: {
        instrumentId: '',
        txnAmt: money(t.txnAmount),
        txnDate: t.txnDate,
        txnDesc: t.narration,
        txnType: t.txnType,
      },
      pstdDate: t.txnDate,
      valueDate: t.valueDate,
      txnId: t.txnId,
      txnSrlNo: String(offset + index + 1),
      txnCat: t.spendCategory,
      txnBalance: t.balanceAfterTxn === null ? null : money(t.balanceAfterTxn),
    }))
    const response = {
      result: {
        accountBalances: {
          acid: account.accountNumberMasked,
          branchId,
          currencyCode: 'INR',
          ledgerBalance: money(account.currentBalance),
          availableBalance: money(q.availableBalance ?? 0),
          floatingBalance: money(q.floatingBalance ?? 0),
          fFDBalance: money(q.fFDBalance ?? 0),
          userDefinedBalance: money(q.userDefinedBalance ?? 0),
        },
        transactionDetails: rows,
        hasMoreData: offset + pageSize < transactions.length,
      },
    }
    captures.push({
      source: 'fixtures',
      endpoint: '393',
      request: {
        input: {
          acid: account.accountNumberMasked,
          branchId,
          fromDate: transactions[0]?.txnDate ?? asOf,
          toDate: transactions.at(-1)?.txnDate ?? asOf,
          sortIn: 'ASC',
          ...(paginationDetails === undefined ? {} : { paginationDetails }),
        },
      },
      response,
    })
    const last = rows.at(-1)
    if (last)
      paginationDetails = {
        lastBalance: last.txnBalance,
        lastPstdDate: last.pstdDate,
        lastTxnDate: last.transactionSummary.txnDate,
        lastTxnId: last.txnId,
        lastTxnSrlNo: last.txnSrlNo,
      }
  }
  return captures
}

function projectTransactions(
  captures: CatalogueCapture[],
  accountId: string,
  enrichment: Record<string, Enrichment>,
): Transaction[] {
  const statements = captures.filter((c) => c.endpoint === '393')
  let previousCursor: unknown = undefined
  for (const capture of statements) {
    const request = capture.request as { input?: Record<string, unknown> } | null
    const input = request?.input
    const page = parseIdbiStatement(capture.response, {
      directionMap: DIRECTION,
      expectedAccountId: accountId,
    })
    if (!input || input['acid'] !== page.accountId || input['branchId'] !== page.branchId)
      throw new Error('Captured statement request identity does not match response')
    if (hashOf(input['paginationDetails'] ?? null) !== hashOf(previousCursor ?? null))
      throw new Error('Captured statement request cursor does not continue previous page')
    previousCursor = page.nextCursor
  }
  const pages = parseIdbiStatementPages(
    statements.map((c) => c.response),
    {
      directionMap: DIRECTION,
      expectedAccountId: accountId,
    },
  )
  const rows = pages.transactions
  if (rows.length !== Object.keys(enrichment).length)
    throw new CatalogueFormatError('supplement.enrichment', 'does not match the complete statement')
  if (new Set(rows.map((r) => r.raw.txnId)).size !== rows.length)
    throw new CatalogueFormatError(
      'supplement.enrichment',
      'synthetic transaction IDs must be unique',
    )
  return rows.map(({ transaction, raw }) => {
    const extra = Object.hasOwn(enrichment, raw.txnId) ? enrichment[raw.txnId] : undefined
    if (!extra)
      throw new CatalogueFormatError('supplement.enrichment', 'missing fixture enrichment')
    // These deterministic fixtures contain one operative account and globally unique IDs.
    // Live imports keep the projector's account + transaction + serial compound identity.
    return { ...extra, ...transaction, txnId: raw.txnId }
  })
}

export function buildCatalogueSeedPayload(bundle: SeedBundle): CatalogueSeedPayload {
  const row = bundle.accounts.find((a) => a.isPrimary)
  if (!row) throw new Error('Catalogue seed requires a primary account')
  const facts = accountFactsAsOf(bundle.transactions, bundle.horizon.anchor, {
    ...(row.openingBalance === undefined ? {} : { openingBalance: row.openingBalance }),
  })
  const q = fixtureLiquidity(facts.currentBalance, bundle.horizon.anchor, row.liquidityTerms)
  const account: Account = { ...row, ...facts, liquidity: q }
  const captures = statementCaptures(account, bundle.transactions, bundle.horizon.anchor)
  captures.push({
    source: 'fixtures',
    endpoint: '362',
    request: { input: { acctId: row.accountNumberMasked } },
    response: {
      result: {
        acctId: row.accountNumberMasked,
        acctCurr: 'INR',
        bankInfo: {
          lienDetails: {
            lienId: `SYN-${bundle.slug}`,
            newLienAmt: money(q.lienAmount ?? 0),
            oldLienAmt: money(0),
            lienDate: { startDate: bundle.horizon.from, endDate: bundle.horizon.to },
            isDeleted: false,
            reasonCode: 'SYNTHETIC_HOLD',
            remarks: 'Synthetic account hold for replay',
          },
        },
        errors: [],
      },
    },
  })
  captures.push({
    source: 'fixtures',
    endpoint: '402',
    request: { input: { customerId: bundle.customer.cif } },
    response: {
      result: {
        errors: [],
        overdueDetails: bundle.liabilityContracts
          .filter((l) => !l.isRevolving)
          .map((l, i) => ({
            customerId: bundle.customer.cif,
            accountId: `SYN-LOAN-${i}`,
            outstandingBal: String(
              liabilityAsOf(l, bundle.horizon.anchor, bundle.horizon.anchor)
                ?.outstandingPrincipal ?? 0,
            ),
            overdueDate: (l.dpdStatus ?? 0) > 0 ? bundle.horizon.anchor : null,
            dpd: String(l.dpdStatus ?? 0),
            npaStatus: 'N',
            totalOverdueAmt: (l.dpdStatus ?? 0) > 0 ? String(l.emiAmount) : '0',
            npaDate: null,
          })),
      },
    },
  })
  // Credit capacity is captured for inspection but never counted as wealth or buffer cash.
  captures.push({
    source: 'fixtures',
    endpoint: '441',
    request: { input: { foracid: row.accountNumberMasked } },
    response: {
      result: {
        accountLimitDetails: {
          errors: [],
          acctDrwngPowerLimitHistMsgInq: {
            olimitLL: [
              {
                applicableDate: bundle.horizon.anchor,
                drwngPower: money(25_000),
                drwngPowerPcnt: { value: '100' },
              },
            ],
          },
          acctSanctLimitHistMsg: {
            olimitLL: [
              {
                applicableDate: bundle.horizon.anchor,
                expiryDate: bundle.horizon.to,
                sanctLimit: money(50_000),
              },
            ],
          },
        },
      },
    },
  })
  const { transactions, ...supplement } = bundle
  return {
    version: CATALOGUE_SEED_VERSION,
    captures,
    supplement: { ...supplement, enrichment: enrichmentOf(transactions) },
  }
}

/** Same pure projector for the staged Postgres seed and the in-process catalogue replay. */
export function projectCatalogueSeedPayload(payload: CatalogueSeedPayload): SeedBundle {
  if (
    payload.version !== CATALOGUE_SEED_VERSION ||
    payload.captures.some((c) => c.source !== 'fixtures')
  )
    throw new Error('Unsupported catalogue seed payload')
  const { enrichment, ...bundle } = payload.supplement
  const primary = bundle.accounts.find((a) => a.isPrimary)
  if (!primary) throw new Error('Missing synthetic primary account')
  const capture = (endpoint: CatalogueCapture['endpoint']): unknown => {
    const matches = payload.captures.filter((c) => c.endpoint === endpoint)
    if (matches.length !== 1) throw new Error(`Expected one synthetic ${endpoint} capture`)
    return matches[0]?.response
  }
  const lien = parseIdbiLien(capture('362'), { expectedAccountId: primary.accountNumberMasked })
  if (
    lien.isDeleted ||
    lien.startsOn === null ||
    lien.endsOn === null ||
    lien.startsOn > bundle.horizon.anchor ||
    lien.endsOn < bundle.horizon.anchor
  )
    throw new Error('Synthetic lien must cover the seed anchor')
  const transactions = projectTransactions(
    payload.captures,
    primary.accountNumberMasked,
    enrichment,
  )
  const statement = parseIdbiStatementPages(
    payload.captures.filter((c) => c.endpoint === '393').map((c) => c.response),
    {
      directionMap: DIRECTION,
      expectedAccountId: primary.accountNumberMasked,
    },
  )
  const ledger = accountFactsAsOf(transactions, bundle.horizon.anchor, {
    ...(primary.openingBalance === undefined ? {} : { openingBalance: primary.openingBalance }),
  })
  const balances = statement.balances
  if (balances.ledgerBalance !== ledger.currentBalance)
    throw new Error('Captured ledger balance disagrees with statement')
  // The synthetic convention is explicit; a real provider needs its own confirmed semantics.
  // Reject unsupported balances rather than silently dropping them from the seeded facts.
  if (
    balances.fFDBalance !== 0 ||
    balances.userDefinedBalance !== 0 ||
    balances.floatingBalance < 0
  )
    throw new Error('Unsupported synthetic balance convention')
  const available = Math.max(
    0,
    ledger.currentBalance - lien.newLienAmount - balances.floatingBalance,
  )
  if (Math.round(available * 100) !== Math.round(balances.availableBalance * 100))
    throw new Error('Captured available balance disagrees with synthetic hold convention')
  const accounts = bundle.accounts.map((account) =>
    account.isPrimary
      ? {
          ...account,
          ...(account.liquidityTerms || lien.newLienAmount || balances.floatingBalance
            ? {
                liquidityTerms: {
                  lienAmount: lien.newLienAmount,
                  floatingBalance: balances.floatingBalance,
                },
              }
            : {}),
        }
      : account,
  )
  const overdues = parseIdbiOverdues(capture('402'), {
    currency: 'INR',
    expectedCustomerId: bundle.customer.cif,
  })
  const loans = bundle.liabilityContracts.filter((l) => !l.isRevolving)
  if (overdues.length !== loans.length) throw new Error('Incomplete synthetic loan observation')
  let loanIndex = 0
  const liabilityContracts = bundle.liabilityContracts.map((loan) => {
    if (loan.isRevolving) return loan // No card endpoint exists in the catalogue.
    const id = `SYN-LOAN-${loanIndex++}`
    const observed = overdues.find((o) => o.accountId === id)
    if (!observed || observed.dpd === null || observed.outstandingBalance === null)
      throw new Error('Missing synthetic loan facts')
    if (observed.npaStatus !== 'N' && observed.npaStatus !== 'Y')
      throw new Error('Unknown synthetic NPA code')
    // Total outstanding is not principal. This fixture explicitly has no unpaid interest;
    // disagreement invalidates it rather than replacing principal with an unrelated amount.
    const principal =
      liabilityAsOf(loan, bundle.horizon.anchor, bundle.horizon.anchor)?.outstandingPrincipal ?? 0
    if (observed.outstandingBalance !== principal)
      throw new Error('Synthetic outstanding disagrees with fixture principal convention')
    return {
      ...loan,
      ...(loan.dpdStatus !== undefined || observed.dpd !== 0 ? { dpdStatus: observed.dpd } : {}),
      ...(observed.npaStatus === 'Y' ? { isNpa: true } : {}),
    }
  })
  parseIdbiLimits(capture('441'))
  return { ...bundle, accounts, liabilityContracts, transactions }
}

/** A replay of the observed window only; it cannot manufacture transactions past asOf. */
export function replayCatalogueFile(file: CustomerFile, asOf: string): CustomerFile {
  const primary = file.accounts.find(
    (a) => a.accountType === 'Savings' || a.accountType === 'Current',
  )
  if (!primary) throw new Error('Catalogue replay requires an operative account')
  const captures = statementCaptures(primary, file.transactions, asOf)
  return {
    ...file,
    transactions: projectTransactions(
      captures,
      primary.accountNumberMasked,
      enrichmentOf(file.transactions),
    ),
  }
}
