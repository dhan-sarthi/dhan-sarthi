# IDBI's sandbox, as it actually behaves

IDBI Innovate 2026 · Problem Statement 1 · Team Atomic

What the twenty-four APIs really return, what they will not return, and every trap that cost a
capture to find. Written from forty-two live responses rather than from the specs, because
twenty-eight of IDBI's twenty-nine OpenAPI exports declare `responses: {}` — they say what to
send and never what comes back.

Read [`data-requirements.md`](data-requirements.md) as what we *asked* for. This is what exists.

## The gate

There is no credential. The sandbox allow-lists IP addresses and that is the entire gate, so:

- A `403` with an HTML body from `awselb` means the wrong network, not a missing key. Nothing is
  fixed by adding a header.
- CI cannot reach the sandbox. This is why the adapter's tests replay captured responses.
- The gateway answers `access-control-allow-origin: *`, so a browser on any origin could read
  customer data straight from IDBI with no credential. **Our server must be the only caller**,
  and `apps/web` never learns the base URL.

Every response carries `x-atlas-request-id` and `x-atlas-trace-id`. Those are the two things IDBI
support asks for, so every call logs both, failures included.

## The shape of a call

Every operation is a `POST` to `/Development/<op>test` with a JSON body. The registry we had
before this — `GET /api/v1/wealth-advisory/<block>` with parameters on a query string — described
nothing that exists.

Twenty-nine paths are twenty-four APIs: the five `…test01` paths are second fixture sets of an
operation rather than operations of their own, and they hold **different data** from the base
path. See the coverage table.

### Three envelopes, not one

| Family | Operations | Unwrap |
|---|---|---|
| bare | 365, 394, 402, 404, 433, 441, 442, 473, 497, 498, 508, 538 | the body is the payload |
| `result` | 362, 391, 393, 428 | take `.result` |
| FinPro | 590, 591, 592, 593, 595, 739 | take `.data`, check `.status` |

`status` is spelled `SUCCESS` in 591, `Success` in 592 and 595, and `success` in 593, 739 and
590. A case-sensitive comparison fails on two thirds of the family.

**Nothing anywhere carries `response_status`.** Of every key in all forty-two bodies, three
contain an underscore: `consent_handle`, `serial_num`, and `inquireCustomerLimitDetails_CustomData`.
Everything else is camelCase.

### Three refusals, not one

| Body | Meaning |
|---|---|
| `{"failedFields":[…],"message":"…"}` | the request body does not match the fixture, field by field |
| `{"message":"Data not found","sentKey":"acid#660100100006"}` | no fixture for this key — it names the key |
| `{"message":"pancard is not valid: …"}` | a validation complaint |

`sentKey` is the most useful sentence in the catalogue: it separates "we asked wrongly" from
"this does not exist", which is what lets a refused account list fall back to the primary
account instead of failing the customer.

## Paging

Two strategies, and neither is `page`/`page_size`/`total_pages`.

- **393** answers `hasMoreData: "Y"/"N"` with a row cursor built from the *last row received*:
  `lastTxnId`, `lastTxnSrlNo`, `lastPstdDate`, `lastTxnDate`, `lastBalance`.
- **595** answers `pageDetails.currentPageNumber` against `totalPages`.

**This sandbox cannot demonstrate 393's protocol.** A request carrying the spec's second-page
cursor and a request carrying no cursor at all come back byte-identical: `paginationDetails` is
ignored, and `hasMoreData` is `"N"` every time. Twenty rows is not a page size either — a
ten-day window returns ten rows, one per day.

So the pager trusts the cursor over the flag: a page that fails to move the cursor on, or that
repeats a row already held, ends the loop and reports which. An environment answering `"Y"` while
ignoring the cursor would otherwise hand us one page forever.

## Traps

Each of these cost a capture to find.

**Money arrives as strings** — `"56780.25"` — and is parsed by moving the decimal point, never
through `Number`: `Number('56780.25') * 100` is `5678024.999999999`. Scale is not fixed either;
the same lien is `"5000.00"` in 365 and `"5000"` in 433. Amounts are held as integer paise
between the wire and the domain.

**Six date formats**, and only one states a zone:

| Format | Where |
|---|---|
| `2018-04-18T00:00:00.000` | 365, 393 — naive, no zone |
| `2018-04-18` | 595, the lien |
| `31-12-2099` | 442 |
| `23-Jul-2019` | `ckycGenDate` |
| `20061995` | `cibilDob` — DDMMYYYY, no separators |
| `2026-06-22T17:30:45Z` | 591 — the only zoned stamp |

The five naive shapes are read as wall-clock dates in the bank's own day and never turned into a
`Date`, which is where a timezone would otherwise get in.

**Absence has four spellings**: the key missing, `""`, the literal string `NULL` (402's `npaDate`
and `overdueDate`), and a genuine JSON `null` (473's `flowStartDate`).

**`EFFAVL` is the spendable floor and is not derivable.** It looked like `AVAIL` minus `LIEN`
exactly, and it holds on five of the six accounts. On the current account `660100100007`, `AVAIL`
is `248000.00` and `LIEN` is `2000.00`, and `EFFAVL` is `245000.00` rather than `246000.00` — a
further ₹1,000 withheld, which is what a minimum balance looks like. Computing the floor would
have credited that customer with a thousand rupees they cannot spend. 393 calls the same quantity
`userDefinedBalance`.

**Never derive a balance from transactions.** In the captured 393 the last row's running balance
is ₹344,483.14 while the ledger balance in the same payload is ₹56,780.25. The adapter drops the
per-row balance entirely when it fails to reconcile, because `derive()` took the minimum of it as
the twelve-month idle floor and reported ₹344,483 sitting idle in an account holding ₹56,780.

**538 and 402 disagree about the same loan.** For `660100100003` the overdue record reports
₹37,54,903 outstanding and the payoff enquiry reports ₹4,00,000 of principal pending — an order
of magnitude apart, one account, one bank, the same day. The payoff is the better answer to "what
would clearing this cost", and it is deliberately *not* mapped onto the liability: two
irreconcilable figures for one loan on one screen is worse than the one we can source
consistently. The gap is recorded on the mapping report instead, so an operator sees it, and it
becomes a mapping the day the fixtures agree.

**`custId` is not `cifId`.** 442's `customerSummary` is the only place both appear:
`custCifId: 98655854` and `customerID: 68453002`, for the same PRIYAPATIL.

- CIF (`98655854`) keys 394 and 442.
- Finacle id (`68453002`) is returned by 365 and keys 391 and 404.
- **402 keys on the CIF** — despite returning the Finacle id in its rows, and despite its `01`
  fixture wanting the Finacle id.

Which identifier an operation accepts is a property of the *fixture*, not of the operation. There
is nothing to infer, so requests are tried as an ordered list of candidates and the one that
worked is recorded on the mapping report.

**393's statements carry no categorising signal.** `txnDesc` is `"S1 TXN 1"` through
`"S1 TXN 20"` and `txnCat` is `TCI` on every row. There is no payment mode field at all, which is
why `TxnMode` has an `UNKNOWN` member: the alternative was letting the code map stamp `NEFT` on
lines that could be anything.

**595 does carry a mode on every row**, from a real vocabulary — UPI, NEFT, IMPS, ATM, CASH,
RTGS, NACH, ECS, CHEQUE, CARD, OTHERS, REMITTANCE — and narrations that are either prose
(`"Salary Credit"`) or a recognisable rail format (`"UPI/CR/21980/PAYEE0/ABCD"`). Payees are
still placeholders. This is the only feed our categoriser can read, and it is the reason the
consented path matters beyond other-bank accounts.

**433 is not an interest-rate API here.** It returns the whole per-customer record — 106 keys
across balances, lien, loans, overdues, leads, consent, CKYC and a full CIBIL response — keyed on
its interest-table code and nothing else. Adding the account number its name implies earns a
refusal. It is also why the bureau shapes could be mapped without spending a real credit pull on
408 or a registry search on 415.

**The sandbox's ledger ends on 2025-05-20.** Twenty transactions, one a day, for one account. A
2026 window answers zero rows, correctly. The adapter therefore discovers the window by asking
for a wide one and reading the rows back, and the session runs as-of that date with the clock
control visible — reporting today as today would leave every screen empty.

## What the sandbox holds, per customer

Established by asking, and reading which keys it said it could not place.

| | Priya Patil | Neha Singh | Arjun Mehta |
|---|---|---|---|
| CIF | 98655854 | 88234567 | — |
| Finacle id | 68453002 | 88823456 | 77712345 |
| Branch | 105 | 107 | 106 |
| Accounts | 660100100003 | …0006, 0007, 0008, 0009 | 660100100004 |
| 394 account list | ✅ base | ✅ `test01` only | ❌ |
| 365 enquiry | ✅ base | ✅ `test01` (0008 in both) | ✅ base |
| 393 own statement | ✅ | ❌ | ❌ |
| 402 overdues | ✅ (CIF) | ✅ (`test01`, Finacle id) | ❌ |
| 391 loan terms | ✅ 660100100003 only | ❌ | ❌ |
| 362 lien | ✅ | ❌ | ❌ |
| 433 record | ✅ | ❌ | ❌ |
| 591 consents | ✅ base | ✅ `test01` | ❌ |
| 595 statement | ✅ `CONSENT-0001` | ✅ `CONSENT-0003-*`, one per account | ❌ |
| Date of birth | 433 | 595 holder block | **nowhere** |

Arjun is registered and kept out of the picker: the bank holds his account enquiry and nothing
else, so there is no file to advise on and no age to gate suitability with.

591 and 595 do not agree about what a consent is called. 591 reports `CONSENT123456001` for Neha
while 595's fixtures are keyed on `CONSENT-0003-SAV` and its siblings, one per account — so the
pairs that actually answer are recorded per customer in `api/customers.ts`, with 591's own answer
tried first so a consistent environment needs nothing recorded.

## The Account Aggregator flow

590 raises a handle → 592 turns it into the OneMoney URL → **497 is IDBI calling us** → 593
decrypts what the browser returns with → 591 says what the consent is → 595 reads the accounts.

Two things to know before trusting it:

- **592 pins the redirect URL.** It validates against its fixture and refuses anything but
  `https://myapp.com/consent/callback`, so the sandbox can only ever send a customer back to
  somebody else's domain. `AA_REDIRECT_URL` overrides the default the day IDBI widens it.
- **593 does not validate the token.** The spec's stale sample `ecres` decrypts happily, so a
  success there says nothing about whether a real one would.

Our webhook (`POST /api/v1/webhooks/idbi/consent`) is unauthenticated because the bank has no
session and cannot be given one. It therefore **grants nothing**: it appends an event and
returns, making no bank call and unable to move a consent to `ACTIVE`. Only 591 does that.
Without that rule, anyone who could guess a consent handle could cause the app to pull a
customer's statements.

## What no operation provides

The catalogue has no mutual fund, deposit book, NPS or insurance endpoint, and a consented pull
returns deposit accounts held at other banks rather than a portfolio. It also carries nothing
resembling declared income, employment type, dependents, marital status, preferred language, risk
profile or tax regime — 433 comes closest, with a hundred and six keys, and has none of them.

Both are APIs of our own rather than defaults: `/api/v1/profile` and `/api/v1/holdings`. Record →
Your data labels those blocks `declared`, and every screen that spends the numbers says where
they came from. A term deposit held at IDBI is deliberately *not* recorded in holdings — it
arrives as an account on 394 and would otherwise be counted twice in every net-worth figure.

591 sends no consent expiry either. `validTo` is a year from creation, marked on the mapping
report as the assumption it is, and short rather than long: erring short costs a
re-verification, while erring long means acting on a consent that has lapsed.

## For IDBI

Worth raising, in rough order of how much it costs us:

1. **Seed real narrations in 393.** `"S1 TXN 14"` with `txnCat: "TCI"` on every row means the
   categorising engine cannot run on the bank's own statement. 595 already shows what good looks
   like.
2. **Make the fixtures agree on identifiers.** 402 taking the CIF on one path and the Finacle id
   on another, and 394 needing `txn` on one and not the other, means a client cannot be written
   against a rule.
3. **Reconcile 591 with 595.** A consent id from 591 is refused by 595.
4. **Reconcile 538 with 402.** ₹4,00,000 of pending principal against ₹37,54,903 outstanding,
   for one account. We cannot show a payoff figure until we know which is meant.
5. **Three of your own exported samples are rejected by your own sandbox**: 362 and 391 sample 2
   on an address the fixture does not hold, and 428 sample 3 on the PAN `ABCDX99995`, which fails
   the `AAAAA9999A` rule that same endpoint enforces.
6. **Widen 592's `redirectUrl`**, or the redirect leg cannot be tested by anyone.
7. **Populate `responses` in the OpenAPI exports.** Twenty-eight of twenty-nine are `{}`.
8. **State the balance semantics.** `EFFAVL` differing from `AVAIL − LIEN` on a current account
   is almost certainly a minimum balance, but we are inferring that.
9. **Send a consent expiry in 591**, and a payment mode in 393.

## Where the code is

| | |
|---|---|
| `api/operations.ts` | the twenty-four operations, their envelope family, tier and paging |
| `api/envelope.ts` | the three unwrap rules, the three refusals, the trace headers |
| `api/scalars.ts` | exact-paise money, the six date formats, the four spellings of absent |
| `api/schemas.ts` | a zod schema per operation, written from a captured body |
| `api/transport.ts` | one POST, the read cache, the breaker, the trace log |
| `api/paging.ts` | the row cursor and `pageDetails`, both with a stall guard |
| `api/gateway.ts` | operations composed into domain reads, with candidate requests |
| `api/to-domain.ts` | IDBI's wire to the domain, in one hop |
| `api/customers.ts` | the keys and the coverage table above |
| `api/replay.ts` | a `fetch` answering from the captures, refusals included |
| `captured/` | forty-two responses, each with the request that produced it |
| `scripts/capture-idbi.sh` | re-capture everything; writes and bureau are behind flags |
