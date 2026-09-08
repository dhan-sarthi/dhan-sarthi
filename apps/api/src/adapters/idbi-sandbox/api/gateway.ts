/**
 * The domain-facing gateway over IDBI's operations.
 *
 * Nothing in the catalogue answers a question the app actually asks. "This customer's
 * accounts, with balances" is 394 for the list and then 365 per account for the seven balance
 * types and the vintage; "their liabilities" is 402 for the accounts that owe, 391 for each
 * one's terms and 433 for the instalment amount that neither of the first two sends. So the
 * composition lives here, once, and the adapter above sees whole domain objects.
 *
 * Two behaviours are deliberate and both come from the sandbox being a request-matching stub.
 * Enrichment is best-effort: 394 lists five accounts and 365 has a fixture for three of them,
 * so an account whose enquiry is refused keeps the list's balance and type rather than
 * disappearing from the app. And a refusal is never retried with a different body — the
 * sandbox answers `{failedFields}` when the request does not match what it holds, and guessing
 * at addresses until one lands is how a capture ends up testing our imagination.
 */
import type { Account, Customer, Liability, Transaction } from '@dhan/core'
import type { Consent, IsoDate } from '@dhan/contracts'
import type { Logger } from '../../../infra/logger.ts'
import { silentLogger } from '../../../infra/logger.ts'
import { IdbiCallError } from './transport.ts'
import type { IdbiResponse, IdbiTransport } from './transport.ts'
import { operation } from './operations.ts'
import { pageByRowCursor } from './paging.ts'
import type { PagingStop, RowCursor } from './paging.ts'
import {
  AccountEnquiryResponse,
  ConsentListEntry,
  ConsentRequestData,
  CustomerAccountsResponse,
  CustomerLimitsResponse,
  CustomerRecordResponse,
  DecryptedCallback,
  FullStatementResult,
  LienEnquiryResult,
  LoanAccountDetailsResult,
  LoanOverdueDetailsResponse,
  WebRedirection,
  AaAccount,
} from './schemas.ts'
import type { WireAaAccount, WireConsentListEntry, WireCustomerRecord } from './schemas.ts'
import type { AaConsentSummary } from '../../../ports/aa-gateway.port.ts'
import type { IdbiCustomerKey, IdbiSandboxCustomer } from './customers.ts'
import { sandboxCustomer } from './customers.ts'
import { isoDateToNaiveStamp, optionalIsoDate, optionalText, paiseToRupees } from './scalars.ts'
import type { Paise } from './scalars.ts'
import {
  accountFromEnquiry,
  accountStubsFromList,
  consentFrom,
  customerFrom,
  liabilitiesFromOverdues,
  lienFromEnquiry,
  loanFactsFromDetails,
  loanFactsFromRecord,
  maskAccountNumber,
  newReport,
  transactionsFromAaAccount,
  transactionsFromStatement,
} from './to-domain.ts'
import type { DeclaredProfile, LoanFacts, MappingReport } from './to-domain.ts'
import { z } from 'zod'

export interface GatewayOptions {
  transport: IdbiTransport
  logger?: Logger | undefined
}

export interface AccountsResult {
  accounts: Account[]
  report: MappingReport
  /** Accounts 394 listed that 365 would not enrich, with why. */
  unenriched: { acctId: string; reason: string }[]
}

export interface TransactionsResult {
  transactions: Transaction[]
  pages: number
  stop: PagingStop
  report: MappingReport
  /** The statement header's own balances, which are the only trustworthy ones. */
  balances: { ledger: number | null; spendable: number | null }
}

export interface AaStatement {
  accounts: WireAaAccount[]
  transactions: Transaction[]
  report: MappingReport
}

export interface LiabilitiesResult {
  liabilities: Liability[]
  report: MappingReport
}

/**
 * One request, several plausible ways to ask it.
 *
 * A request-matching stub does not let us reason our way to the right body. Which identifier
 * 402 wants is a case in point: it *returns* the Finacle customer id, and its own captured
 * sample sends the CIF, and its `…test01` fixture sends the Finacle id — so the same operation
 * keys on a different field depending on which fixture answers. There is no rule to infer, so
 * the candidates are tried in order and the one that worked is reported, which is both what
 * makes the app work against this sandbox and what we would show IDBI when asking them to make
 * the fixtures consistent.
 *
 * Only a refusal moves on to the next candidate. A timeout, a 5xx or a broken line is the
 * bank being unreachable and stops the whole attempt.
 */
interface Candidate {
  label: string
  body: unknown
  variant?: string | undefined
}

interface Attempt {
  response: IdbiResponse
  candidate: Candidate
}

function parse<T extends z.ZodTypeAny>(schema: T, payload: unknown, where: string): z.output<T> {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(
      `${where}: IDBI's body did not match the schema: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
        .slice(0, 4)
        .join('; ')}`,
    )
  }
  return parsed.data
}

export class IdbiGateway {
  private readonly transport: IdbiTransport
  private readonly log: Logger

  constructor(options: GatewayOptions) {
    this.transport = options.transport
    this.log = options.logger ?? silentLogger
  }

  breakerState(): ReturnType<IdbiTransport['breakerState']> {
    return this.transport.breakerState()
  }

  /** The first candidate the sandbox accepts, or null when every one of them was refused. */
  private async attempt(
    code: Parameters<typeof operation>[0],
    candidates: readonly Candidate[],
    report: MappingReport,
  ): Promise<Attempt | null> {
    const refusals: string[] = []
    for (const candidate of candidates) {
      try {
        const response = await this.transport.call(
          operation(code),
          candidate.body,
          candidate.variant === undefined ? {} : { variant: candidate.variant },
        )
        if (refusals.length > 0) {
          report.notes.push({
            where: code,
            detail: `answered to ${candidate.label} after refusing ${refusals.join(', ')}`,
          })
        }
        return { response, candidate }
      } catch (err) {
        if (err instanceof IdbiCallError) {
          refusals.push(`${candidate.label}${err.sentKey === null ? '' : ` (${err.sentKey})`}`)
          continue
        }
        throw err
      }
    }
    report.notes.push({
      where: code,
      detail: `every way of asking was refused: ${refusals.join(', ')}`,
    })
    return null
  }

  /* ---------------------------------------------------------------- *
   * Identity
   * ---------------------------------------------------------------- */

  /**
   * 442, which is the only operation that prints the CIF and the Finacle customer id together
   * and can therefore confirm a key rather than take our word for it.
   */
  async verifyKey(
    key: IdbiCustomerKey,
  ): Promise<{ cif: string | null; custId: string | null; name: string | null }> {
    const res = await this.transport.call(operation('442'), { custCifId: key.cif })
    const body = parse(CustomerLimitsResponse, res.envelope.payload, '442')
    const summary = body.customerSummary
    return {
      cif: optionalText(summary?.custCifId),
      custId: optionalText(summary?.customerID),
      name: optionalText(summary?.customerName),
    }
  }

  /**
   * 433: the whole per-customer record, which is also where the date of birth, the PAN and the
   * only instalment amount in the catalogue live.
   *
   * The body is the rate-card request its fixture was captured with, field for field. Adding
   * an account number — which is what the operation's name suggests it wants — earns a "Data
   * not found", because the fixture is keyed on the interest-table code and nothing else.
   */
  async customerRecord(tblCode = 'LY001'): Promise<WireCustomerRecord> {
    const res = await this.transport.call(operation('433'), {
      crncyCode: 'INR',
      intTblCode: { tblCode },
      loanAmt: { amountValue: '10000', currencyCode: 'INR' },
      loanPerdDays: '0',
      loanPerdMnths: '12',
      originationDate: '2022-01-03T17:13:06.751',
    })
    return parse(CustomerRecordResponse, res.envelope.payload, '433')
  }

  /* ---------------------------------------------------------------- *
   * Accounts
   * ---------------------------------------------------------------- */

  /**
   * Every account a customer holds: 394 for the list, then 365 for each one's detail.
   *
   * 394 is asked for `SBA` because that is the only `acctType` its fixtures answer to, and it
   * returns the whole book regardless of what was asked — four accounts of four different
   * types against a request for savings. So the request is what the bank accepts and the
   * response is read for what it is.
   */
  async accounts(customer: IdbiSandboxCustomer): Promise<AccountsResult> {
    const report = newReport()
    const key: IdbiCustomerKey = customer
    const input = { acctType: 'SBA', branchId: key.branchId, cifId: key.cif }
    const listed = customer.coverage.accountList
      ? await this.attempt(
          '394',
          [
            // Priya's book answers on the base path with `txn`, Neha's on the `01` fixture
            // without it. Both are the same question, spelled the way each fixture wants.
            { label: 'base', body: { input, txn: 'E' } },
            { label: 'base without txn', body: { input } },
            { label: 'test01', body: { input }, variant: 'getCustomerAccountsByCustIdtest01' },
          ],
          report,
        )
      : null

    const stubs =
      listed === null
        ? // No account list, so the primary account is the whole book. Asking again with a
          // different body would only be guessing at what this stub holds.
          [
            {
              acctId: key.primaryAcctId,
              accountType: 'Savings' as const,
              balancePaise: null,
              rawType: null,
            },
          ]
        : accountStubsFromList(
            parse(CustomerAccountsResponse, listed.response.envelope.payload, '394'),
            report,
          )
    if (listed === null) {
      report.notes.push({
        where: '394',
        detail: customer.coverage.accountList
          ? 'the account list was refused; falling back to the primary account'
          : 'no account list in this sandbox; the primary account is the whole book',
      })
    }

    const accounts: Account[] = []
    const unenriched: { acctId: string; reason: string }[] = []

    for (const stub of stubs) {
      const enquiry = await this.tryEnquiry(stub.acctId, customer.enquiryVariant)
      if (enquiry === null) {
        unenriched.push({ acctId: stub.acctId, reason: 'no 365 fixture for this account' })
        // The list still knows the number, the type and the balance. That is a real account.
        accounts.push({
          accountNumberMasked: maskAccountNumber(stub.acctId),
          accountType: stub.accountType,
          currentBalance: stub.balancePaise === null ? 0 : paiseToRupees(stub.balancePaise),
          accountOpeningDate: '1970-01-01',
          ...(stub.balancePaise === null
            ? {}
            : { effectiveAvailableBalance: paiseToRupees(stub.balancePaise) }),
        })
        continue
      }
      const lien = await this.tryLien(stub.acctId, enquiry, report)
      accounts.push(accountFromEnquiry(enquiry, { lienPaise: lien }, report))
    }

    return { accounts, report, unenriched }
  }

  /** 365, or null when the sandbox has no fixture for the account. */
  /**
   * 365, or null when neither fixture set holds the account.
   *
   * The two sets hold different accounts — the base path answers for 003, 004 and 008 and
   * `…test01` for 006 through 009 — so a customer's own variant is tried first and the other
   * is the fallback. Both are asked before giving up, because only 008 is in both.
   */
  private async tryEnquiry(
    acctId: string,
    preferred?: string | undefined,
  ): Promise<z.output<typeof AccountEnquiryResponse> | null> {
    const order =
      preferred === undefined
        ? ([undefined, 'performAccountEnquirytest01'] as const)
        : ([preferred, undefined] as const)
    for (const variant of order) {
      try {
        const res = await this.transport.call(
          operation('365'),
          { acctId },
          variant === undefined ? {} : { variant },
        )
        return parse(AccountEnquiryResponse, res.envelope.payload, '365')
      } catch (err) {
        // A refusal means this fixture does not hold the account; the variant may.
        if (err instanceof IdbiCallError) continue
        throw err
      }
    }
    return null
  }

  /**
   * 362's lien, which needs the account's own address echoed back exactly.
   *
   * That is why 365 comes first: the enquiry carries the `postAddr` the lien enquiry validates
   * against, and IDBI's own sample for a second account fails precisely because its address
   * does not match. Sending back what the bank just told us is the only reliable way to ask.
   */
  private async tryLien(
    acctId: string,
    enquiry: z.output<typeof AccountEnquiryResponse>,
    report: MappingReport,
  ): Promise<Paise | null> {
    const bankInfo = enquiry.bankInfo
    if (bankInfo === undefined) return null
    try {
      const res = await this.transport.call(operation('362'), {
        input: {
          acctId,
          moduleType: 'DEPOSIT',
          acctCurr: enquiry.acctCurr ?? 'INR',
          acctType: {
            schmCode: enquiry.acctType?.schmCode ?? '',
            schmType: enquiry.acctType?.schmType ?? '',
          },
          bankInfo,
        },
      })
      const body = parse(LienEnquiryResult, res.envelope.payload, '362')
      const lien = lienFromEnquiry(body, report)
      return lien?.lienPaise ?? null
    } catch (err) {
      if (err instanceof IdbiCallError) {
        report.notes.push({
          where: `362(${acctId})`,
          detail: `lien enquiry refused: ${err.failedFields.join('; ') || err.message}`,
        })
        // 365's LIEN balance type still stands; the enquiry only adds the reason and the dates.
        return null
      }
      throw err
    }
  }

  /* ---------------------------------------------------------------- *
   * Transactions
   * ---------------------------------------------------------------- */

  /**
   * A statement window from 393, every page of it.
   *
   * The window travels as naive stamps because that is what the bank sends back and what its
   * own samples use. `sortIn: 'D'` is the sample's value and returns the window in ascending
   * posting order despite the name.
   */
  async transactions(
    key: IdbiCustomerKey,
    acctId: string,
    window: { from: IsoDate; to: IsoDate },
  ): Promise<TransactionsResult> {
    const report = newReport()
    // A holder rather than a bare `let`: the assignment happens inside the pager's callback,
    // which the control-flow analysis cannot see through.
    const first: { header: z.output<typeof FullStatementResult> | null } = { header: null }

    const paged = await pageByRowCursor<
      z.output<typeof FullStatementResult>['transactionDetails'][number]
    >({
      fetchPage: async (cursor: RowCursor | null) => {
        const res = await this.transport.call(operation('393'), {
          input: {
            acid: acctId,
            branchId: key.branchId,
            fromDate: isoDateToNaiveStamp(window.from),
            toDate: isoDateToNaiveStamp(window.to),
            sortIn: 'D',
            ...(cursor === null ? {} : { paginationDetails: cursor }),
          },
        })
        const body = parse(FullStatementResult, res.envelope.payload, '393')
        first.header ??= body
        return {
          rows: body.transactionDetails,
          hasMore: (optionalText(body.hasMoreData) ?? 'N').toUpperCase() === 'Y',
        }
      },
      cursorOf: (row) => {
        const id = optionalText(row.txnId)
        const srl = optionalText(row.txnSrlNo)
        const posted = optionalText(row.pstdDate)
        const txnDate = optionalText(row.transactionSummary.txnDate)
        const balance = row.txnBalance
        if (id === null || srl === null || posted === null || txnDate === null) return null
        return {
          lastTxnId: id,
          lastTxnSrlNo: srl,
          lastPstdDate: posted,
          lastTxnDate: txnDate,
          lastBalance: {
            amountValue: String(balance?.amountValue ?? '0'),
            currencyCode: String(balance?.currencyCode ?? 'INR'),
          },
        }
      },
      identityOf: (row) => `${row.txnId}#${String(row.txnSrlNo ?? '')}`,
    })

    if (paged.stop !== 'complete') {
      this.log.warn(
        { idbi: '393', acctId, pages: paged.pages, stop: paged.stop },
        'the statement pager stopped early',
      )
      report.notes.push({ where: '393', detail: `pager stopped: ${paged.stop}` })
    }

    const header = first.header
    const balances = header?.accountBalances
    const mapped = transactionsFromStatement(
      { ...(header ?? { transactionDetails: [] }), transactionDetails: paged.rows },
      report,
    )

    /*
     * Drop the running balance when it does not reconcile with the account's own.
     *
     * In this sandbox it does not: the last row of the captured statement closes at ₹344,483
     * while the ledger balance in the same payload is ₹56,780. We knew that and wrote it down,
     * and still passed the per-row figure straight through — where `derive()` took the minimum
     * of it as the twelve-month idle floor and reported ₹344,483 of idle money in an account
     * holding ₹56,780. An engine cannot be expected to distrust a number the adapter handed it,
     * so the adapter stops handing it over: the rows keep their amounts and dates, which are
     * sound, and lose a balance column that is not.
     */
    const ledger = moneyOf(balances?.ledgerBalance?.amountValue)
    const closing = mapped.at(-1)?.balanceAfterTxn ?? null
    const reconciles =
      ledger === null || closing === null || Math.abs(ledger - closing) < RECONCILE_TOLERANCE
    const transactions = reconciles ? mapped : mapped.map((t) => ({ ...t, balanceAfterTxn: null }))
    if (!reconciles) {
      report.notes.push({
        where: '393',
        detail:
          `the statement closes at ${String(closing)} against a ledger balance of ${String(ledger)}, ` +
          'so the per-row running balance is dropped rather than derived from',
      })
    }
    return {
      transactions,
      pages: paged.pages,
      stop: paged.stop,
      report,
      balances: {
        ledger: moneyOf(balances?.ledgerBalance?.amountValue),
        spendable: moneyOf(balances?.userDefinedBalance?.amountValue),
      },
    }
  }

  /* ---------------------------------------------------------------- *
   * Liabilities
   * ---------------------------------------------------------------- */

  /**
   * What the customer owes: 402 for the accounts and outstandings, 391 for each one's rate and
   * tenure, 433 for the instalment.
   *
   * The EMI is the awkward one. 402 sends an outstanding and no instalment; 391 sends
   * `rePmtMethod: "EMI"` and still no amount; only 433's `loanInfo.emiAmount` has it. So the
   * record is read once and its instalment applied to the loan it belongs to, and a loan we
   * cannot price keeps a zero EMI with a note rather than an invented one.
   */
  async liabilities(customer: IdbiSandboxCustomer): Promise<LiabilitiesResult> {
    const report = newReport()
    const key: IdbiCustomerKey = customer
    if (!customer.coverage.overdues) {
      report.notes.push({
        where: '402',
        detail: 'no overdue record in this sandbox, so no liability can be read for this customer',
      })
      return { liabilities: [], report }
    }
    // Which identifier 402 wants is a property of the fixture, not of the operation: its own
    // captured sample sends the CIF while its `01` fixture sends the Finacle id.
    const overduesAttempt = await this.attempt(
      '402',
      [
        { label: 'cif', body: { customerId: key.cif, accountNo: '' } },
        { label: 'custId', body: { customerId: key.custId, accountNo: '' } },
        {
          label: 'test01 custId',
          body: { customerId: key.custId, accountNo: '' },
          variant: 'getLoanOverdueDetailstest01',
        },
        {
          label: 'test01 cif',
          body: { customerId: key.cif, accountNo: '' },
          variant: 'getLoanOverdueDetailstest01',
        },
      ],
      report,
    )
    if (overduesAttempt === null) return { liabilities: [], report }
    const overdues = parse(
      LoanOverdueDetailsResponse,
      overduesAttempt.response.envelope.payload,
      '402',
    )

    const terms = new Map<string, LoanFacts>()
    for (const row of overdues.overdueDetails) {
      const facts = await this.tryLoanDetails(row.accountId, key, report)
      if (facts !== null) terms.set(row.accountId, facts)
    }

    // One 433 read for the instalment the other two operations never send.
    if (customer.coverage.customerRecord) {
      try {
        const record = await this.customerRecord()
        const fromRecord = loanFactsFromRecord(record)
        if (fromRecord.emiPaise != null) {
          const target = terms.get(key.primaryAcctId) ?? {}
          terms.set(key.primaryAcctId, { ...target, emiPaise: fromRecord.emiPaise })
        }
      } catch (err) {
        report.notes.push({
          where: '433',
          detail: `no instalment amount: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }

    for (const row of overdues.overdueDetails) {
      if (!terms.has(row.accountId)) {
        report.notes.push({
          where: `402(${row.accountId})`,
          detail: 'no 391 terms and no 433 instalment; EMI, rate and tenure are unknown',
        })
      }
    }

    return { liabilities: liabilitiesFromOverdues(overdues, terms, report), report }
  }

  private async tryLoanDetails(
    acctId: string,
    key: IdbiCustomerKey,
    report: MappingReport,
  ): Promise<LoanFacts | null> {
    try {
      const res = await this.transport.call(operation('391'), {
        input: {
          loanAcctId: { acctId, acctCurr: 'INR' },
          custId: { custId: key.custId },
          channel: 'API',
          requestId: `REQ${Date.now()}`,
          reqDate: new Date().toISOString().slice(0, 10),
        },
      })
      const body = parse(LoanAccountDetailsResult, res.envelope.payload, '391')
      return loanFactsFromDetails(body, report).facts
    } catch (err) {
      if (err instanceof IdbiCallError) return null
      throw err
    }
  }

  /* ---------------------------------------------------------------- *
   * The customer
   * ---------------------------------------------------------------- */

  async customer(
    customer: IdbiSandboxCustomer,
    declared: DeclaredProfile,
  ): Promise<{ customer: Customer; report: MappingReport }> {
    const report = newReport()
    const key: IdbiCustomerKey = customer
    const [enquiry, record] = await Promise.all([
      this.tryEnquiry(key.primaryAcctId, customer.enquiryVariant),
      customer.coverage.customerRecord
        ? this.customerRecord().catch(() => undefined)
        : Promise.resolve(undefined),
    ])

    // 433 holds one customer's record and the consented pull holds another's, so between them
    // the date of birth, PAN and KYC flag are covered for two of the three. The AA read only
    // happens when the cheaper source came back without a date.
    const aaAccount =
      record?.dateOfBirth === undefined && customer.coverage.accountAggregator
        ? await this.tryAaProfile(customer, report)
        : undefined

    const mapped = customerFrom(
      key.cif,
      {
        ...(enquiry === null ? {} : { enquiry }),
        ...(record === undefined ? {} : { record }),
        ...(aaAccount === undefined ? {} : { aaAccount }),
      },
      declared,
      report,
    )
    return { customer: mapped, report }
  }

  /**
   * One consented account, for its holder block alone.
   *
   * The Account Aggregator statement is the only source of a date of birth for a customer 433
   * does not hold, and the holder block is identical across that customer's linked accounts,
   * so the first account that answers is enough.
   */
  private async tryAaProfile(
    customer: IdbiSandboxCustomer,
    report: MappingReport,
  ): Promise<WireAaAccount | undefined> {
    for await (const pulled of this.aaStatements(customer, report)) {
      const first = pulled.accounts.find((a) => a.Profile?.Holders?.Holder?.[0] !== undefined)
      if (first !== undefined) return first
    }
    return undefined
  }

  /**
   * Every consented statement the sandbox will answer for a customer.
   *
   * 591's own answer is tried first, so a consistent environment needs nothing recorded; the
   * pairs written down against the customer are the fallback for this sandbox, where 591 and
   * 595 disagree about what a consent is called. A refusal on one pair is not a failure of the
   * read — 595 holds a statement for some of a consent's accounts and not others.
   */
  async *aaStatements(
    customer: IdbiSandboxCustomer,
    report: MappingReport,
  ): AsyncGenerator<AaStatement> {
    const attempts: {
      consentId: string
      refs: string[]
      variant?: string | undefined
      viaFinPro?: boolean | undefined
    }[] = []

    for (const consent of await this.consentList(customer, report)) {
      const consentId = optionalText(consent.consentID)
      const refs = consent.accounts
        .map((a) => optionalText(a.linkReferenceNumber))
        .filter((r): r is string => r !== null)
      if (consentId !== null && refs.length > 0) attempts.push({ consentId, refs })
    }
    for (const pull of customer.aaPulls) {
      attempts.push({
        consentId: pull.consentId,
        refs: [pull.linkRefNumber],
        variant: pull.variant,
        viaFinPro: pull.viaFinPro,
      })
    }

    for (const attempt of attempts) {
      const variants =
        attempt.variant === undefined
          ? ([undefined, 'getAccountStatementtest01'] as const)
          : ([attempt.variant] as const)
      for (const variant of variants) {
        try {
          yield await this.consentedStatement(attempt.consentId, attempt.refs, {
            ...(variant === undefined ? {} : { variant }),
            ...(attempt.viaFinPro === true ? { viaFinPro: true } : {}),
          })
          break
        } catch (err) {
          if (err instanceof IdbiCallError) continue
          throw err
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Account Aggregator
   * ---------------------------------------------------------------- */

  /** 591: the consents a customer has already granted. */
  async consentList(
    key: IdbiCustomerKey,
    report: MappingReport = newReport(),
  ): Promise<WireConsentListEntry[]> {
    const body = {
      partyIdentifierType: 'MOBILE',
      partyIdentifierValue: key.mobile ?? '',
      productID: 'TEST',
      accountID: key.primaryAcctId,
      vua: `${key.mobile ?? ''}@onemoney`,
    }
    const attempt = await this.attempt(
      '591',
      [
        { label: 'base', body },
        { label: 'test01', body, variant: 'getConsentListFromFinProtest01' },
      ],
      report,
    )
    if (attempt === null) return []
    return parse(z.array(ConsentListEntry), attempt.response.envelope.payload, '591')
  }

  async consent(
    key: IdbiCustomerKey,
    window: { validFrom: IsoDate; validTo: IsoDate },
  ): Promise<{ consent: Consent | null; report: MappingReport }> {
    const report = newReport()
    const list = await this.consentList(key, report)
    const active = list.find((c) => (optionalText(c.status) ?? '').toUpperCase() === 'ACTIVE')
    const chosen = active ?? list[0]
    return {
      consent: chosen === undefined ? null : consentFrom(chosen, window, report),
      report,
    }
  }

  /**
   * 591, in the shape the consent flow's port asks for.
   *
   * Named separately from `consentList` because that returns IDBI's own wire rows and this
   * returns the aggregator-neutral summary `AaGatewayPort` declares — which is what lets the
   * flow be written against an interface rather than against Finacle.
   */
  async consents(cif: string): Promise<AaConsentSummary[]> {
    const customer = sandboxCustomer(cif)
    if (customer === null) return []
    const report = newReport()
    const rows = await this.consentList(customer, report)
    return rows.map((row) => ({
      consentId: optionalText(row.consentID),
      consentHandle: optionalText(row.consent_handle) ?? optionalText(row.consentHandle),
      status: optionalText(row.status),
      createdAt: optionalIsoDate(row.consentCreationData, '591.consentCreationData'),
      accounts: row.accounts.map((a) => ({
        linkReferenceNumber: a.linkReferenceNumber,
        maskedAccountNumber: optionalText(a.maskedAccountNumber),
        fipName: optionalText(a.fipName),
        fiType: optionalText(a.fiType),
        accountType: optionalText(a.accountType),
      })),
    }))
  }

  /**
   * 590, keyed by CIF, for the consent flow's port.
   *
   * A separate entry point from `requestConsent` below only because the port speaks in CIFs
   * while the gateway speaks in customer keys.
   */
  async requestConsent(cif: string): Promise<{ consentHandle: string; status: string }> {
    const customer = sandboxCustomer(cif)
    if (customer === null) throw new Error(`no IDBI customer for cif ${cif}`)
    return this.requestConsentFor(customer)
  }

  /** 590: step one. Raises a consent request and may notify the customer. */
  async requestConsentFor(
    key: IdbiCustomerKey,
  ): Promise<{ consentHandle: string; status: string }> {
    const res = await this.transport.call(operation('590'), {
      partyIdentifierType: 'MOBILE',
      partyIdentifierValue: key.mobile ?? '',
      productID: 'TEST',
      accountID: key.primaryAcctId,
      vua: `${key.mobile ?? ''}@onemoney`,
      transactionID: String(Date.now()),
    })
    const body = parse(ConsentRequestData, res.envelope.payload, '590')
    return {
      consentHandle: body.consent_handle,
      status: optionalText(body.status) ?? 'UNKNOWN',
    }
  }

  /** 592: step two. The URL the customer approves the consent at. */
  async consentRedirectUrl(consentHandle: string, redirectUrl: string): Promise<string> {
    const res = await this.transport.call(operation('592'), { consentHandle, redirectUrl })
    const body = parse(z.array(WebRedirection), res.envelope.payload, '592')
    const first = body[0]
    if (first === undefined) throw new Error('592 answered no redirection URL')
    return first.webRedirectionUrl
  }

  /**
   * 593: step four. Turns the `ecres` the redirect returns with into a readable result.
   *
   * The spec's sample `ecres` is stale and we expected it to be refused; it was not — this
   * sandbox does not validate the token, so a green answer here says nothing about whether a
   * real one would decrypt. Worth knowing before trusting this step in production.
   */
  async decryptConsentCallback(payload: {
    ecres: string
    resdate: string
    fi: string
  }): Promise<{ status: string | null; consentHandle: string | null; sessionId: string | null }> {
    const res = await this.transport.call(operation('593'), { webRedirectionURL: payload })
    const body = parse(DecryptedCallback, res.envelope.payload, '593')
    return {
      status: optionalText(body.status),
      // `srcref` is where 593 puts the handle the redirect belonged to.
      consentHandle: optionalText(body.srcref),
      sessionId: optionalText(body.sessionid),
    }
  }

  /**
   * 595 and 739: the consented pull, which is the only statement with a payment mode on every
   * row and so the only one our categoriser can read.
   */
  async consentedStatement(
    consentId: string,
    linkRefNumbers: readonly string[],
    opts: { viaFinPro?: boolean; variant?: string | undefined } = {},
  ): Promise<{ accounts: WireAaAccount[]; transactions: Transaction[]; report: MappingReport }> {
    const report = newReport()
    const op = operation(opts.viaFinPro === true ? '739' : '595')
    const res = await this.transport.call(
      op,
      { consentId, linkRefNumber: [...linkRefNumbers] },
      opts.variant === undefined ? {} : { variant: opts.variant },
    )
    const accounts = parse(z.array(AaAccount), res.envelope.payload, op.code)
    const transactions = accounts.flatMap((a) => transactionsFromAaAccount(a, report))
    return { accounts, transactions, report }
  }
}

/** A rupee of slack, which is more than enough for rounding and far less than a real gap. */
const RECONCILE_TOLERANCE = 1

function moneyOf(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(String(raw))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
