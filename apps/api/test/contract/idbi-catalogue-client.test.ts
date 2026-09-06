import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchIdbiStatement } from '../../src/adapters/idbi-sandbox/catalogue-client.ts'
import type {
  IdbiCatalogueTransport,
  IdbiStatementCapture,
  IdbiStatementFetchOptions,
  IdbiStatementRequest,
} from '../../src/adapters/idbi-sandbox/catalogue-client.ts'

const money = (amountValue: string) => ({ amountValue, currencyCode: 'INR' })
const request: IdbiStatementRequest = {
  input: {
    acid: 'synthetic-account',
    branchId: 'synthetic-branch',
    fromDate: '2026-09-01',
    toDate: '2026-09-30',
    sortIn: 'SYNTHETIC_ASC',
    extension: { preserve: true },
  },
  callerExtension: 'preserve',
}
const options: IdbiStatementFetchOptions = {
  expectedAccountId: 'synthetic-account',
  expectedBranchId: 'synthetic-branch',
  currency: 'INR',
  directionMap: { CREDIT: 'CREDIT', DEBIT: 'DEBIT' },
}
function page(id: string, hasMoreData: boolean) {
  return {
    result: {
      accountBalances: {
        acid: 'synthetic-account',
        branchId: 'synthetic-branch',
        currencyCode: 'INR',
        availableBalance: money('4500.00'),
        ledgerBalance: money('5000.00'),
        floatingBalance: money('500.00'),
        fFDBalance: money('0.00'),
        userDefinedBalance: money('0.00'),
      },
      hasMoreData,
      transactionDetails: [
        {
          txnId: id,
          txnSrlNo: '0001',
          pstdDate: '2026-09-06',
          txnCat: 'UNCONFIRMED',
          valueDate: '2026-09-04',
          txnBalance: money('5000.00'),
          transactionSummary: {
            txnDate: '2026-09-05',
            txnType: 'CREDIT',
            txnAmt: money('250.25'),
            txnDesc: 'Synthetic credit',
            instrumentId: '',
          },
        },
      ],
    },
  }
}
function harness(responses: unknown[]) {
  const captures: IdbiStatementCapture[] = []
  const requests: { url: string; init: RequestInit | undefined; body: IdbiStatementRequest }[] = []
  const config: IdbiCatalogueTransport = {
    endpoints: { '393': { url: 'https://synthetic.invalid/explicit-statement', method: 'POST' } },
    headers: { authorization: 'synthetic-test-header' },
    timeoutMs: 500,
    maxPages: 10,
    capture: async (capture) => {
      captures.push(capture)
    },
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        init,
        body: JSON.parse(String(init?.body)) as IdbiStatementRequest,
      })
      assert.ok(responses.length > 0, 'unexpected extra request')
      const value = responses.shift()
      return value instanceof Response
        ? value
        : new Response(typeof value === 'string' ? value : JSON.stringify(value))
    },
  }
  return { config, captures, requests }
}

test('393 sends the configured endpoint/method and links exact raw cursors while preserving filters', async () => {
  const { config, captures, requests } = harness([page('first', true), page('last', false)])
  config.endpoints['393'].method = 'PUT'
  const original = structuredClone(request)
  const result = await fetchIdbiStatement(config, request, options)
  assert.equal(result.pageCount, 2)
  assert.equal(result.transactions.length, 2)
  assert.equal(result.hasMoreData, false)
  assert.deepEqual(request, original)
  assert.equal(requests[0]?.url, 'https://synthetic.invalid/explicit-statement')
  assert.equal(requests[0]?.init?.method, 'PUT')
  assert.deepEqual(requests[0]?.body, request)
  assert.deepEqual(requests[1]?.body.input.paginationDetails, {
    lastBalance: money('5000.00'),
    lastPstdDate: '2026-09-06',
    lastTxnDate: '2026-09-05',
    lastTxnId: 'first',
    lastTxnSrlNo: '0001',
  })
  assert.deepEqual(requests[1]?.body.input.extension, { preserve: true })
  assert.equal(requests[1]?.body.input.fromDate, request.input.fromDate)
  assert.equal(requests[1]?.body.callerExtension, 'preserve')
  assert.equal(captures.length, 2)
  assert.deepEqual(
    captures.map((capture) => capture.requestBody),
    requests.map((entry) => entry.body),
  )
  assert.equal(JSON.stringify(captures).includes('synthetic-test-header'), false)
})

test('raw capture is awaited before the next page or any domain parsing', async () => {
  const { config, requests } = harness([page('first', true), page('last', false)])
  let release: (() => void) | undefined
  const persisted: number[] = []
  config.capture = async (capture) => {
    if (capture.page === 1)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    persisted.push(capture.page)
  }
  const pending = fetchIdbiStatement(config, request, options)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(requests.length, 1)
  assert.deepEqual(persisted, [])
  assert.ok(release)
  release()
  await pending
  assert.deepEqual(persisted, [1, 2])

  const malformed = harness(['  not JSON  '])
  await assert.rejects(fetchIdbiStatement(malformed.config, request, options), /valid JSON/)
  assert.equal(malformed.captures[0]?.rawResponse, '  not JSON  ')
})

test('capture failure aborts the operation before any next page is requested', async () => {
  const { config, requests } = harness([page('first', true), page('last', false)])
  config.capture = async () => {
    throw new Error('capture unavailable')
  }
  await assert.rejects(fetchIdbiStatement(config, request, options), /capture unavailable/)
  assert.equal(requests.length, 1)
})

test('HTTP failure and HTTP200 business errors are captured and cannot produce a statement', async () => {
  const badHttp = harness([new Response('service failure', { status: 502 })])
  await assert.rejects(fetchIdbiStatement(badHttp.config, request, options), /HTTP 502/)
  assert.equal(badHttp.captures[0]?.responseStatus, 502)
  assert.equal(badHttp.captures[0]?.rawResponse, 'service failure')
  const bodyError = harness([
    { ...page('first', false), errors: [{ code: 'DENIED', message: 'private detail' }] },
  ])
  await assert.rejects(fetchIdbiStatement(bodyError.config, request, options), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /business error/)
    assert.doesNotMatch(error.message, /private detail/)
    return true
  })
  assert.equal(bodyError.captures[0]?.responseStatus, 200)
})

test('bounded statement traversal rejects repeated rows, empty continuation and truncation', async () => {
  const repeated = harness([page('first', true), page('first', true)])
  await assert.rejects(fetchIdbiStatement(repeated.config, request, options), /without progress/)
  assert.equal(repeated.requests.length, 2)
  const bounded = harness([page('first', true), page('last', false)])
  bounded.config.maxPages = 1
  await assert.rejects(fetchIdbiStatement(bounded.config, request, options), /maxPages/)
  assert.equal(bounded.requests.length, 1)
  const empty = page('first', true)
  empty.result.transactionDetails = []
  const stalled = harness([empty])
  await assert.rejects(fetchIdbiStatement(stalled.config, request, options), /no cursor row/)
})

test('the transport validates required account/branch/currency before use and on returned data', async () => {
  const local = harness([])
  await assert.rejects(
    fetchIdbiStatement(local.config, request, { ...options, expectedAccountId: 'another-account' }),
    /expected account/,
  )
  await assert.rejects(
    fetchIdbiStatement(local.config, request, { ...options, currency: 'USD' as 'INR' }),
    /INR/,
  )
  assert.equal(local.requests.length, 0)
  const wrongAccount = page('first', false)
  wrongAccount.result.accountBalances.acid = 'another-account'
  const remote = harness([wrongAccount])
  await assert.rejects(fetchIdbiStatement(remote.config, request, options), /requested account/)
  assert.equal(remote.captures.length, 1)
  const wrongCurrency = page('first', false)
  wrongCurrency.result.accountBalances.currencyCode = 'USD'
  const foreign = harness([wrongCurrency])
  await assert.rejects(fetchIdbiStatement(foreign.config, request, options), /INR/)
})

test('timeout covers an unresponsive fetch even if an injected implementation ignores AbortSignal', async () => {
  const { config, captures } = harness([])
  config.timeoutMs = 10
  let signal: AbortSignal | null | undefined
  config.fetch = async (_url, init) => {
    signal = init?.signal
    return await new Promise<Response>(() => {})
  }
  await assert.rejects(fetchIdbiStatement(config, request, options), /timed out/)
  assert.equal(signal?.aborted, true)
  assert.equal(captures.length, 0)
})

test('transport rejects missing or invalid operational configuration without a network call', async () => {
  const { config, requests } = harness([])
  config.endpoints['393'].url = '/not-an-absolute-url'
  await assert.rejects(fetchIdbiStatement(config, request, options), /absolute endpoint/)
  config.endpoints['393'].url = 'https://synthetic.invalid/statement'
  config.maxPages = 0
  await assert.rejects(fetchIdbiStatement(config, request, options), /maxPages/)
  config.maxPages = 1
  config.timeoutMs = 0
  await assert.rejects(fetchIdbiStatement(config, request, options), /timeoutMs/)
  assert.equal(requests.length, 0)
})

test('a resumed statement tail cannot be claimed as a complete history', async () => {
  const { config, requests } = harness([page('last', false)])
  const resumed: IdbiStatementRequest = {
    ...request,
    input: {
      ...request.input,
      paginationDetails: {
        lastBalance: { amountValue: '5000.00', currencyCode: 'INR' },
        lastPstdDate: '2026-09-04',
        lastTxnDate: '2026-09-04',
        lastTxnId: 'already-seen',
        lastTxnSrlNo: '1',
      },
    },
  }
  await assert.rejects(fetchIdbiStatement(config, resumed, options), /start without a cursor/)
  assert.equal(requests.length, 0)
})

test('raw numeric money tokens cannot lose precision inside JSON.parse before validation', async () => {
  const template = JSON.stringify(page('last', false))
  for (const token of ['1.0000000000000000001', '90071992547409.91']) {
    const raw = template.replace('"amountValue":"250.25"', `"amountValue":${token}`)
    const { config, captures } = harness([raw])
    await assert.rejects(
      fetchIdbiStatement(config, request, options),
      /decimal places|preserve paise/,
    )
    assert.equal(captures[0]?.rawResponse, raw)
  }
  const numeric = harness([template.replace('"amountValue":"250.25"', '"amountValue":250.25')])
  assert.equal(
    (await fetchIdbiStatement(numeric.config, request, options)).transactions[0]?.transaction
      .txnAmount,
    250.25,
  )
})
