import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CatalogueFormatError,
  decodeIsoDate,
  parseIdbiLien,
  parseIdbiLimits,
  parseIdbiOverdues,
  parseIdbiStatement,
  parseIdbiStatementPages,
  parseInrAmount,
  parseInrMoney,
} from '../../src/adapters/idbi-sandbox/catalogue.ts'

const money = (amountValue: unknown, currencyCode = 'INR') => ({ amountValue, currencyCode })
const options = { directionMap: { CREDIT: 'CREDIT', DEBIT: 'DEBIT' } } as const
function transaction(txnId = 'entry-1', txnSrlNo = '1') {
  return {
    pstdDate: '2026-09-06',
    transactionSummary: {
      instrumentId: '',
      txnAmt: money('1250.25'),
      txnDate: '2026-09-05',
      txnDesc: 'TRANSFER FROM SAVINGS',
      txnType: 'CREDIT',
    },
    txnBalance: money('25000.50'),
    txnCat: 'UNCONFIRMED_BANK_CATEGORY',
    txnId,
    txnSrlNo,
    valueDate: '2026-09-04',
  }
}
function statement(rows = [transaction()], hasMoreData: unknown = false) {
  return {
    result: {
      accountBalances: {
        acid: 'synthetic-account',
        branchId: 'synthetic-branch',
        currencyCode: 'INR',
        availableBalance: money('24000.50'),
        ledgerBalance: money('25000.50'),
        floatingBalance: money('1000.00'),
        fFDBalance: money('7500.00'),
        userDefinedBalance: money('0.00'),
      },
      hasMoreData,
      transactionDetails: rows,
    },
    customData: { THB: '' },
  }
}
function lien() {
  return {
    result: {
      acctId: 'synthetic-account',
      acctCurr: 'INR',
      bankInfo: {
        lienDetails: {
          newLienAmt: money('2500.00'),
          oldLienAmt: money('1000.00'),
          lienDate: { startDate: '2026-09-01', endDate: '2026-10-01' },
          reasonCode: 'SYNTHETIC_HOLD',
          remarks: '',
          isDeleted: false as unknown,
          lienId: 'synthetic-lien',
        },
      },
      errors: [],
    },
  }
}
function overdue() {
  return {
    result: {
      overdueDetails: [
        {
          customerId: 'synthetic-customer',
          accountId: 'synthetic-loan',
          outstandingBal: '150000.25',
          overdueDate: '2026-09-01',
          dpd: '5' as unknown,
          npaStatus: 'UNCONFIRMED_STATUS',
          totalOverdueAmt: '5000.25',
          npaDate: null,
        },
      ],
      errors: [],
    },
  }
}
function limits() {
  return {
    result: {
      accountLimitDetails: {
        acctDrwngPowerLimitHistMsgInq: {
          olimitLL: [
            {
              applicableDate: '2026-08-01',
              drwngPower: money('100000.00'),
              drwngPowerPcnt: { value: '75.00' },
            },
            {
              applicableDate: '2026-09-01',
              drwngPower: money('80000.00'),
              drwngPowerPcnt: { value: '60.00' },
            },
          ],
        },
        acctSanctLimitHistMsg: {
          olimitLL: [
            {
              applicableDate: '2026-08-01',
              expiryDate: '2027-08-01',
              sanctLimit: money('150000.00'),
            },
          ],
        },
        errors: [] as unknown[],
      },
    },
  }
}

test('INR decimal parsing preserves paise and rejects coercion, excess precision and currency mismatch', () => {
  assert.equal(parseInrMoney(money('1250.25')), 1250.25)
  assert.equal(parseInrAmount('-0.01', 'INR'), -0.01)
  assert.equal(parseInrAmount(1.25, 'INR'), 1.25)
  assert.equal(parseInrAmount('0', 'INR'), 0)
  for (const value of [
    '',
    ' ',
    ' 1.00',
    '1.00 ',
    '1.001',
    '1e3',
    '1,000',
    true,
    null,
    Infinity,
    NaN,
    '90071992547409.92',
  ]) {
    assert.throws(() => parseInrAmount(value, 'INR'), CatalogueFormatError)
  }
  assert.throws(() => parseInrMoney(money('1.00', 'USD')), /INR/)
  assert.throws(() => parseInrMoney({ amountValue: '1.00' }), /INR/)
  // toFixed(2) can mask cent loss: JSON serializes this edge amount without its last cent.
  assert.throws(() => parseInrAmount('90071992547409.91', 'INR'), /preserve paise/)
  assert.equal(
    String(JSON.parse(JSON.stringify(parseInrAmount('45035996273704.95', 'INR')))),
    '45035996273704.95',
  )
})

test('ISO default validates the calendar and rejects undocumented date conventions', () => {
  assert.equal(decodeIsoDate('2024-02-29'), '2024-02-29')
  for (const value of [
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '0000-01-01',
    '06-09-26',
    '2026-09-06T00:00:00Z',
  ])
    assert.throws(() => decodeIsoDate(value), CatalogueFormatError)
})

test('393 accepts its no-errors envelope, retains five balances and does not invent enrichment', () => {
  const parsed = parseIdbiStatement(statement(), options)
  assert.deepEqual(parsed.balances, {
    availableBalance: 24000.5,
    ledgerBalance: 25000.5,
    floatingBalance: 1000,
    fFDBalance: 7500,
    userDefinedBalance: 0,
  })
  const row = parsed.transactions[0]
  assert.ok(row)
  assert.equal(row.transaction.txnDate, '2026-09-05')
  assert.equal(row.transaction.valueDate, '2026-09-04')
  assert.equal(row.raw.pstdDate, '2026-09-06')
  assert.equal(row.raw.txnCat, 'UNCONFIRMED_BANK_CATEGORY')
  assert.equal('spendCategory' in row.transaction, false)
  assert.equal('txnMode' in row.transaction, false)
  assert.equal(parsed.nextCursor, null)
})

test('393 inferred cursor preserves final raw dates, money and transaction serial', () => {
  const row = transaction('last', '0002')
  row.pstdDate = '06/09/2026'
  row.transactionSummary.txnDate = '05/09/2026'
  row.valueDate = '04/09/2026'
  const parsed = parseIdbiStatement(statement([row], 'Y'), {
    ...options,
    hasMoreDataMap: { Y: true, N: false },
    dateDecoder: (value) => {
      const [day, month, year] = value.split('/')
      return `${year}-${month}-${day}`
    },
  })
  assert.deepEqual(parsed.nextCursor, {
    lastBalance: money('25000.50'),
    lastPstdDate: '06/09/2026',
    lastTxnDate: '05/09/2026',
    lastTxnId: 'last',
    lastTxnSrlNo: '0002',
  })
  assert.equal(parsed.transactions[0]?.transaction.txnDate, '2026-09-05')
})

test('393 rejects unknown flags/directions and empty nonterminal pages', () => {
  assert.throws(() => parseIdbiStatement(statement([], true), options), /no cursor row/)
  assert.throws(() => parseIdbiStatement(statement([], 'false'), options), /unmapped flag/)
  const row = transaction()
  row.transactionSummary.txnType = 'DR'
  assert.throws(() => parseIdbiStatement(statement([row]), options), /unmapped direction/)
  assert.equal(
    parseIdbiStatement(statement([row]), { directionMap: { DR: 'DEBIT' } }).transactions[0]
      ?.transaction.txnType,
    'DEBIT',
  )
  row.transactionSummary.txnAmt = money('1.00', 'USD')
  assert.throws(
    () => parseIdbiStatement(statement([row]), { directionMap: { DR: 'DEBIT' } }),
    /INR/,
  )
})

test('transaction identities are opaque, account-scoped and serial-scoped', () => {
  const page = statement([transaction('shared', '1'), transaction('shared', '2')])
  const parsed = parseIdbiStatement(page, options)
  assert.notEqual(
    parsed.transactions[0]?.transaction.txnId,
    parsed.transactions[1]?.transaction.txnId,
  )
  assert.doesNotMatch(parsed.transactions[0]?.transaction.txnId ?? '', /synthetic-account|shared/)
  assert.throws(
    () => parseIdbiStatement(statement([transaction(), transaction()]), options),
    /duplicate/,
  )
  assert.throws(
    () => parseIdbiStatement(page, { ...options, expectedAccountId: 'someone-else' }),
    /requested account/,
  )
  assert.throws(
    () => parseIdbiStatement(page, { ...options, expectedBranchId: 'elsewhere' }),
    /requested branch/,
  )
  page.result.accountBalances.acid = 'second-account'
  assert.notEqual(
    parsed.transactions[0]?.transaction.txnId,
    parseIdbiStatement(page, options).transactions[0]?.transaction.txnId,
  )
})

test('statement capture rejects incomplete/repeated pages and changing balance snapshots', () => {
  const first = statement([transaction('first')], true)
  const last = statement([transaction('last')], false)
  assert.equal(parseIdbiStatementPages([first, last], options).transactions.length, 2)
  assert.throws(() => parseIdbiStatementPages([first], options), /incomplete/)
  assert.throws(() => parseIdbiStatementPages([last, first], options), /terminal/)
  assert.throws(
    () => parseIdbiStatementPages([first, first, last], options),
    /cursor repeated|identity repeated/,
  )
  assert.throws(
    () => parseIdbiStatementPages([first, statement([transaction('first')])], options),
    /identity repeated/,
  )
  last.result.accountBalances.ledgerBalance = money('1.00')
  assert.throws(() => parseIdbiStatementPages([first, last], options), /balance snapshot changed/)
})

test('business errors use service-specific paths and do not leak provider messages', () => {
  const payload = { ...statement(), errors: [{ code: 'FAIL', message: 'private bank detail' }] }
  assert.throws(
    () => parseIdbiStatement(payload, options),
    (error: unknown) => {
      assert.ok(error instanceof CatalogueFormatError)
      assert.match(error.message, /business error/)
      assert.doesNotMatch(error.message, /private bank detail/)
      return true
    },
  )
  assert.doesNotThrow(() =>
    parseIdbiStatement({ ...statement(), errors: [{ code: '', type: '', message: '' }] }, options),
  )
  const creditLimits = limits()
  creditLimits.result.accountLimitDetails.errors.push({ code: 'REJECTED' })
  assert.throws(() => parseIdbiLimits(creditLimits), /business error/)
})

test('362 preserves lien versions/deletion and validates account/validity independently', () => {
  const parsed = parseIdbiLien(lien())
  assert.equal(parsed.newLienAmount, 2500)
  assert.equal(parsed.oldLienAmount, 1000)
  assert.equal(parsed.isDeleted, false)
  const payload = lien()
  payload.result.bankInfo.lienDetails.isDeleted = 'N'
  assert.throws(() => parseIdbiLien(payload), /unmapped flag/)
  assert.equal(parseIdbiLien(payload, { deletedMap: { N: false, Y: true } }).isDeleted, false)
  assert.throws(
    () => parseIdbiLien(lien(), { expectedAccountId: 'different' }),
    /requested account/,
  )
  payload.result.bankInfo.lienDetails.lienDate.endDate = '2026-08-01'
  assert.throws(() => parseIdbiLien(payload), /ends before/)
})

test('402 preserves outstanding balance semantics and distinguishes unknown/zero/invalid DPD', () => {
  const payload = overdue()
  const row = parseIdbiOverdues(payload, { currency: 'INR' })[0]
  assert.ok(row)
  assert.equal(row.outstandingBalance, 150000.25)
  assert.equal('outstandingPrincipal' in row, false)
  assert.equal(row.dpd, 5)
  assert.equal(row.npaStatus, 'UNCONFIRMED_STATUS')
  assert.equal(row.npaDate, null)
  const raw = payload.result.overdueDetails[0]
  assert.ok(raw)
  raw.dpd = ''
  assert.equal(parseIdbiOverdues(payload, { currency: 'INR' })[0]?.dpd, null)
  raw.dpd = '0'
  assert.equal(parseIdbiOverdues(payload, { currency: 'INR' })[0]?.dpd, 0)
  for (const invalid of ['1.0000000000000000001', '9007199254740991.1', '-1', '9007199254740992']) {
    raw.dpd = invalid
    assert.throws(() => parseIdbiOverdues(payload, { currency: 'INR' }), CatalogueFormatError)
  }
})

test('402 validates requested subjects and rejects duplicate loan rows', () => {
  assert.throws(
    () => parseIdbiOverdues(overdue(), { currency: 'INR', expectedCustomerId: 'other-customer' }),
    /requested customer/,
  )
  assert.throws(
    () => parseIdbiOverdues(overdue(), { currency: 'INR', expectedAccountId: 'other-loan' }),
    /requested account/,
  )
  const payload = overdue()
  const row = payload.result.overdueDetails[0]
  assert.ok(row)
  payload.result.overdueDetails.push(row)
  assert.throws(() => parseIdbiOverdues(payload, { currency: 'INR' }), /duplicate overdue/)
})

test('441 keeps drawing and sanction histories separate from own cash', () => {
  const parsed = parseIdbiLimits(limits())
  assert.deepEqual(
    parsed.drawingPowerHistory.map((row) => row.amount),
    [100000, 80000],
  )
  assert.equal(parsed.sanctionHistory[0]?.amount, 150000)
  assert.equal('currentBalance' in parsed, false)
  const payload = limits()
  const row = payload.result.accountLimitDetails.acctDrwngPowerLimitHistMsgInq.olimitLL[0]
  assert.ok(row)
  row.drwngPower = money('-1.00')
  assert.throws(() => parseIdbiLimits(payload), /nonnegative/)
})
