/**
 * The captures, as a test.
 *
 * Every schema in `api/schemas.ts` was written from a real IDBI response rather than from a
 * spec, and this is what keeps it that way: each of the forty-two captured bodies is unwrapped
 * with its operation's declared envelope family and parsed with its operation's schema, and a
 * schema that stops matching the evidence fails here.
 *
 * The second half is the traps. Each one cost a capture to find, and left as prose in a commit
 * message each one is a thing the next person re-learns the hard way — so `response_status`
 * being absent, `EFFAVL` being `AVAIL` less `LIEN`, the statement's running balance not
 * reconciling with the ledger, and `status` arriving in three different cases are all
 * assertions now.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  readValidationRefusal,
  readVerdict,
  unwrap,
} from '../../src/adapters/idbi-sandbox/api/envelope.ts'
import { operationByPath } from '../../src/adapters/idbi-sandbox/api/operations.ts'
import type { IdbiOperation } from '../../src/adapters/idbi-sandbox/api/operations.ts'
import { RESPONSE_SCHEMAS } from '../../src/adapters/idbi-sandbox/api/schemas.ts'
import { toPaise } from '../../src/adapters/idbi-sandbox/api/scalars.ts'

const CAPTURED = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/adapters/idbi-sandbox/captured',
)

interface Capture {
  file: string
  code: string
  op: string
  operation: IdbiOperation
  body: unknown
  /** The body that produced it. Every response is stored beside its request. */
  request: unknown
}

/**
 * `393-getFullAccountStatementWithPaginationtest-s2.json` → the operation it answers for, with
 * the `.request.json` beside it that produced it. The pair is what lets the replay transport
 * answer the adapter's real requests rather than serving one fixture for everything.
 */
function loadCaptures(): Capture[] {
  const out: Capture[] = []
  for (const file of readdirSync(CAPTURED).sort()) {
    if (!file.endsWith('.json') || file.endsWith('.request.json')) continue
    const m = /^(\d{3})-(.+?)(?:-s\d+)?\.json$/.exec(file)
    assert.ok(m, `${file}: not named <code>-<op>[-sN].json`)
    const code = m[1] as string
    const op = m[2] as string
    const operation = operationByPath(op)
    assert.ok(operation, `${file}: no operation registered for path ${op}`)
    assert.equal(operation.code, code, `${file}: filename code disagrees with the registry`)
    const requestFile = file.replace(/\.json$/, '.request.json')
    out.push({
      file,
      code,
      op,
      operation,
      body: JSON.parse(readFileSync(join(CAPTURED, file), 'utf8')),
      request: JSON.parse(readFileSync(join(CAPTURED, requestFile), 'utf8')),
    })
  }
  return out
}

const CAPTURES = loadCaptures()

/**
 * The three bodies the sandbox refused with a 400, all of them IDBI's own exported samples.
 *
 * 362 and 391 sample 2 carry an address the sandbox's fixture does not hold. 428 sample 3
 * carries the PAN `ABCDX99995`, which fails the format rule the same endpoint enforces —
 * `AAAAA9999A` wants a letter in the last position and that is a digit. Three of the bank's
 * own samples do not work against the bank's own sandbox, which is a question for IDBI and
 * not a defect on this side.
 */
const REFUSED = new Set([
  '362-accountLienEnquirytest-s2.json',
  '391-getLoanAccountDetailstest-s2.json',
  '428-createLeadtest-s3.json',
])

function ok(c: Capture): boolean {
  return !REFUSED.has(c.file)
}

function find(file: string): unknown {
  const c = CAPTURES.find((x) => x.file === file)
  assert.ok(c, `${file} is missing from captured/`)
  return c.body
}

describe('the IDBI captures', () => {
  it('has a capture for every operation the app reads from', () => {
    const captured = new Set(CAPTURES.map((c) => c.code))
    // 408 and 415 are the bureau pair: never called, and shaped from 433's copy of their bodies.
    const expected = ['362', '365', '391', '393', '394', '402', '404', '428', '433', '441']
    const alsoExpected = ['442', '473', '497', '498', '508', '538', '590', '591', '592', '593']
    for (const code of [...expected, ...alsoExpected, '595', '739']) {
      assert.ok(captured.has(code), `no capture for service ${code}`)
    }
    assert.equal(CAPTURES.length, 42)
  })

  it('parses every captured body with its operation schema', () => {
    for (const c of CAPTURES) {
      if (!ok(c)) continue
      const envelope = unwrap(c.op, c.operation.family, c.body)
      const schema = RESPONSE_SCHEMAS[c.code as keyof typeof RESPONSE_SCHEMAS]
      assert.ok(schema, `${c.file}: no schema for service ${c.code}`)
      const parsed = schema.safeParse(envelope.payload)
      assert.ok(
        parsed.success,
        `${c.file}: ${parsed.success ? '' : parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`,
      )
    }
  })

  it('reads every refusal as a validation refusal rather than as a shape', () => {
    for (const file of REFUSED) {
      const refusal = readValidationRefusal(find(file))
      assert.ok(refusal, `${file}: did not read as a validation refusal`)
      assert.ok(refusal.message.length > 0)
    }
    // The address pair names its fields; the PAN one explains itself in the message alone.
    const fields = readValidationRefusal(find('362-accountLienEnquirytest-s2.json'))
    assert.deepEqual(fields?.failedFields, [
      'addr1 does not match',
      'addr2 does not match',
      'postalCode does not match',
    ])
    const pan = readValidationRefusal(find('428-createLeadtest-s3.json'))
    assert.deepEqual(pan?.failedFields, [])
    assert.match(pan?.message ?? '', /pancard is not valid/)
  })
})

describe('the traps the captures found', () => {
  it('carries no response_status anywhere, and hardly an underscore', () => {
    const underscored = new Set<string>()
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) {
        for (const x of v) walk(x)
        return
      }
      if (typeof v !== 'object' || v === null) return
      for (const [k, x] of Object.entries(v)) {
        assert.notEqual(k, 'response_status', 'a body carries response_status after all')
        if (k.includes('_')) underscored.add(k)
        walk(x)
      }
    }
    for (const c of CAPTURES) walk(c.body)
    // The whole catalogue's underscore surface: two genuinely snake_case keys, and one
    // camelCase key with a separator. Everything else is camelCase, which is why the
    // snake_case `meta.response_status` envelope described a shape that never existed.
    assert.deepEqual([...underscored].sort(), [
      'consent_handle',
      'inquireCustomerLimitDetails_CustomData',
      'serial_num',
    ])
  })

  it('makes EFFAVL AVAIL less LIEN on the captured accounts, though not on every account', () => {
    const enquiries = CAPTURES.filter((c) => c.code === '365')
    assert.equal(enquiries.length, 3)
    for (const c of enquiries) {
      const body = c.body as { acctBal: { balType: string; balAmt: { amountValue: string } }[] }
      const at = (t: string): number => {
        const row = body.acctBal.find((b) => b.balType === t)
        assert.ok(row, `${c.file}: no ${t} balance`)
        return toPaise(row.balAmt.amountValue)
      }
      assert.equal(at('EFFAVL'), at('AVAIL') - at('LIEN'), `${c.file}: EFFAVL is not AVAIL - LIEN`)
    }
    // It holds here and it is still not a rule. Sweeping all six accounts the sandbox holds
    // breaks it on the current account 660100100007, where AVAIL 248000.00 less LIEN 2000.00
    // is 246000.00 and EFFAVL is 245000.00 — a further ₹1,000 withheld, which is what a
    // minimum balance looks like. Hence `spendableFloor` prefers the sent value and only ever
    // falls back to the subtraction. This assertion documents the three that agree; it must
    // not be read as licence to derive the floor.
  })

  it('does not let the statement rows reconcile with the ledger balance', () => {
    const body = find('393-getFullAccountStatementWithPaginationtest-s1.json') as {
      result: {
        accountBalances: { ledgerBalance: { amountValue: string } }
        transactionDetails: { txnBalance: { amountValue: string } }[]
      }
    }
    const ledger = toPaise(body.result.accountBalances.ledgerBalance.amountValue)
    const rows = body.result.transactionDetails
    const lastRow = rows[rows.length - 1]
    assert.ok(lastRow)
    const running = toPaise(lastRow.txnBalance.amountValue)
    // About ₹288,000 apart. A balance comes from a balance field; summing rows is wrong here.
    assert.ok(
      Math.abs(running - ledger) > 100_000_00,
      'the running balance now agrees with the ledger, so this fixture changed',
    )
  })

  it('agrees that 393 ignores the row cursor: cursor and no-cursor answer identically', () => {
    const withCursor = find('393-getFullAccountStatementWithPaginationtest-s1.json')
    const without = find('393-getFullAccountStatementWithPaginationtest-s2.json')
    assert.deepEqual(withCursor, without)
  })

  it('sizes a 393 page by the window rather than by a page size', () => {
    const month = find('393-getFullAccountStatementWithPaginationtest-s1.json') as {
      result: { transactionDetails: unknown[]; hasMoreData: string }
    }
    const tenDays = find('393-getFullAccountStatementWithPaginationtest-s3.json') as {
      result: { transactionDetails: unknown[]; hasMoreData: string }
    }
    assert.equal(month.result.transactionDetails.length, 20)
    assert.equal(tenDays.result.transactionDetails.length, 10)
    // And it never admits to more, which is why the pager trusts the cursor over the flag.
    assert.equal(month.result.hasMoreData, 'N')
    assert.equal(tenDays.result.hasMoreData, 'N')
  })

  it('spells the FinPro status in three different cases, and reads all of them as success', () => {
    const spellings = new Set<string>()
    for (const c of CAPTURES) {
      if (c.operation.family !== 'finpro') continue
      const body = c.body as { status?: unknown }
      const { verdict, rawStatus } = readVerdict(body.status)
      assert.equal(verdict, 'success', `${c.file}: ${String(rawStatus)} did not read as success`)
      if (rawStatus !== null) spellings.add(rawStatus)
    }
    assert.deepEqual([...spellings].sort(), ['SUCCESS', 'Success', 'success'])
  })

  it('settles which identifier keys which API, from the one call that prints both', () => {
    const body = find('442-fetchCustomerLimitDetailstest-s1.json') as {
      customerSummary: { custCifId: string; customerID: string; customerName: string }
    }
    // 394 and 442 are keyed by the CIF; 365 returns, and 391/402/404 key on, the Finacle id.
    assert.equal(body.customerSummary.custCifId, '98655854')
    assert.equal(body.customerSummary.customerID, '68453002')
    assert.notEqual(body.customerSummary.custCifId, body.customerSummary.customerID)

    const enquiry = find('365-performAccountEnquirytest-s1.json') as { custId: string }
    assert.equal(enquiry.custId, body.customerSummary.customerID)

    const accounts = find('394-getCustomerAccountsByCustIdtest-s1.json') as { cifId: string }
    assert.equal(accounts.cifId, body.customerSummary.custCifId)
  })

  it('gives 393 no categorising signal, and 595 one on every row', () => {
    const statement = find('393-getFullAccountStatementWithPaginationtest-s1.json') as {
      result: { transactionDetails: { txnCat: string; transactionSummary: { txnDesc: string } }[] }
    }
    const cats = new Set(statement.result.transactionDetails.map((r) => r.txnCat))
    assert.deepEqual([...cats], ['TCI'], '393 grew more than one txnCat')
    for (const row of statement.result.transactionDetails) {
      assert.match(row.transactionSummary.txnDesc, /^S1 TXN \d+$/)
    }

    const aa = find('595-getAccountStatementtest01-s1.json') as {
      data: { Transactions: { Transaction: { mode?: string; narration?: string }[] } }[]
    }
    const first = aa.data[0]
    assert.ok(first)
    for (const txn of first.Transactions.Transaction) {
      assert.ok(txn.mode !== undefined && txn.mode !== '', 'an AA row arrived with no mode')
    }
    const modes = new Set(first.Transactions.Transaction.map((t) => t.mode))
    assert.ok(modes.size > 1, 'every AA row carried the same mode, so it signals nothing')
  })

  it('carries the 433 record with the bureau blocks the pair would have cost a pull to see', () => {
    const body = find('433-fetchLoanInterestRatestest-s1.json') as Record<string, unknown>
    assert.ok(Object.keys(body).length > 100, '433 stopped answering the whole record')
    assert.ok(body['cibilResponse'], '433 no longer carries cibilResponse')
    assert.ok(body['ckycInfo'], '433 no longer carries ckycInfo')
    assert.ok(body['rateInfo'], '433 no longer carries rateInfo')
  })
})
