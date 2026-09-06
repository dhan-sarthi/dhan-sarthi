# Catalogue boundary and adversarial review

The supplied catalogue establishes the identities of 25 services. It does not establish a
working endpoint URL, HTTP method, authentication mechanism, date format, code vocabulary, or
which fields a live success or failure must contain. Registry entries distinguish documentation
verification from execution verification and remain planned. Body examples do not prove POST.
Service 415 describes XML; a universal JSON transport would be incorrect.

This document records engineering conclusions without reproducing the restricted workbook or
its samples. The earlier guessed block adapter and its GET paths have been removed.

## Implemented seam

[`catalogue.ts`](../../apps/api/src/adapters/idbi-sandbox/catalogue.ts) validates supported
statement, lien, overdue and limit observations. It keeps unsupported financial meanings
separate from the advisory domain. [`catalogue-client.ts`](../../apps/api/src/adapters/idbi-sandbox/catalogue-client.ts)
implements bounded statement traversal with explicit caller-supplied URL, method, headers,
date decoder and direction/flag mappings. It persists raw responses before parsing, preserves
request filters while advancing the cursor, and aborts on incomplete or inconsistent captures.
There is no live bank transport configured in the application composition.

[`catalogue-seed.ts`](../../apps/api/src/adapters/idbi-sandbox/catalogue-seed.ts) produces
synthetic request/response captures plus a separately identified supplement for facts absent
from the catalogue. Postgres seeding and the sandbox composition both run the complete packet
through `projectCatalogueSeedPayload`; the replay adapter also checks each displayed statement
window. Transactions come through the statement parser. Lien/floating observations supply the
fixture's liquidity terms; available and ledger balances must reconcile with those terms and
the ledger. DPD and the synthetic NPA flag affect loan risk. Unsupported deposit-linked and
user-defined balance conventions are rejected, while limit history remains inspection data
and never becomes owned cash. Every block remains fixture-origin.
The replay wrapper rejects non-fixture or missing incoming provenance before recapture, so
wrapping another provider cannot relabel observed data as synthetic.

[`0009_catalogue_registry.sql`](../../apps/api/migrations/0009_catalogue_registry.sql) registers
all 25 documented identities with execution unverified and status planned.
[`0010_fixture_liquidity.sql`](../../apps/api/migrations/0010_fixture_liquidity.sql) stores the
synthetic liquidity terms and NPA flag.
[`0011_catalogue_field_mappings.sql`](../../apps/api/migrations/0011_catalogue_field_mappings.sql)
records descriptive metadata for the implemented projection into existing columns. These rows
do not drive a generic runtime interpreter, and their required flags describe application
admission rules, not the bank's mandatory fields.

## Keep the conversion at the API boundary

Keep the public contract as finite numeric rupees for this integration step. Parse incoming
decimal strings exactly into minor units before converting to the domain number, with an
explicit safe range. Accept numeric JSON values only when finite, within that range and with
no precision beyond paise. Require the returned number's JSON decimal representation to preserve
the original minor units; `toFixed(2)` alone can hide a lost cent near the numeric limit.
The HTTP client checks the original numeric JSON token before JSON parsing can hide excessive
precision. Reject malformed, blank, non-finite, excessively precise or unsafe amounts instead
of silently rounding or defaulting them to zero. A future integer-money domain
is a separate migration requiring every calculation and consumer to move together.

Money objects, bare amounts and rates are distinct input shapes. Validate an object's currency;
bare amounts require an explicit, verified currency context. Do not assume every scalar is INR
or that percentages need the same precision as money. Retain raw source values for replay.

Dates likewise need an explicit endpoint decoder. The earlier DD-MM-YY convention came from an
unrelated reference and is not established here. Synthetic ISO dates are a replay convention.

## Ownership and reachable money are different facts

Retain ledger, available, floating, deposit-linked and other bank balances separately. No
formula between the five statement balances is documented, and the account enquiry's balance
type vocabulary is unknown. The account-list balance has no demonstrated availability meaning.

For a supported CASA account with explicit same-currency ledger and available observations and
known active lien coverage at the same instant, a conservative ceiling on reachable owned money
is `min(max(ledger - knownActiveLien, 0), max(available, 0))`. This is our bound, not a claimed
bank formula. The lien is subtracted only from the ledger side; an already-available amount is
not reduced again. It does not establish reachability when a required observation is absent,
stale or unresolved. Bank confirmation is needed for account types whose available amount
includes credit, sweep deposits or other facilities. Preserve negative ledger amounts as debt
information even when usable cash is zero.

Never add drawing power or credit limits to emergency savings. Never subtract a lien again
from an amount already supplied as available. A lien's old and new amounts describe alternatives,
not two simultaneous liens; deletion flags, validity and identity must be handled before any
independent lien total is used. Unknown meanings must remain unknown.

The historical statement floor is a ledger observation, not proof that the same amount can be
transferred today. Bound a proposed idle-cash transfer by current reachable owned cash. Do not
retroactively subtract today's lien from every historical running balance. The daily spending
envelope is derived from cashflow; keep that definition.

A deposit can appear in both account and holding views. Explicitly linked deposits now count
once in net position through the snapshot's `holdings.outsideAccounts` subtotal.
Any balance that already includes a sweep deposit also needs deduplication before adding the
deposit account. Account identity matters: the minimum across unrelated accounts' running
balances is not a household cash floor.

## Unsupported facts stay explicit

| Domain fact                     | What the catalogue establishes                                           | Boundary decision                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Profile and suitability inputs  | Dedupe search can identify candidates; it is not a full advisory profile | Dependents, employment, declared income, risk profile and tax regime need app-held declarations with their own origin |
| Loan amount                     | The loan detail service describes contract and repayment fields          | Disbursed or sanctioned money is not outstanding principal                                                            |
| Loan overdue state              | Overdue service supplies outstanding balance, DPD and NPA fields         | Outstanding balance is not proven principal-only; missing DPD is not proof of zero arrears                            |
| Loan payoff                     | A closure inquiry separates principal and several interest components    | A closure quote is time-specific; it is not a general EMI or tenure feed                                              |
| Remaining tenure                | Contract periods and rescheduling fields exist                           | Opening date plus original period is not authoritative after holidays or rescheduling                                 |
| Credit card debt                | No card account/APR feed is demonstrated                                 | Priya's APR and card facts remain synthetic until a source is supplied                                                |
| MF, insurance and SIP positions | No complete supported payload is demonstrated                            | Keep fixture or separately declared origin; `fiType` alone does not establish an AA capability                        |
| Deposits                        | Account discovery and AA deposit-shaped examples exist                   | Rate, maturity and account identity still require the appropriate supported payload                                   |
| Product shelf                   | No shelf read is demonstrated; creating a lead consumes product input    | Shelf stays fixture or banker-curated, with independent verification status                                           |
| CIBIL score                     | The named response shows a decision/status, not an actual score          | Never derive or invent a score from the service title                                                                 |

Storage and origin must remain distinct. Loading synthetic rows from Postgres does not make
them bank facts; replaying their values through a provider-shaped schema does not either. A
mixed profile needs field-level evidence or a conservative mixed/fixture block designation.
The absence of a holdings response is unavailable information, not verified zero holdings.

## Endpoint and paging rules

Use per-service envelopes. Statement responses have no documented `errors` array, other
services put errors at different depths, and some AA examples are too malformed to settle the
envelope at all. A populated error on an HTTP success must prevent projection; absent errors
must not alone reject a valid statement. Do not recursively guess which object is the result.

The statement request carries a cursor with balance, posting date, transaction date, transaction
ID and serial number. A replay can construct it from the last raw returned row; preserve raw
values before any date sorting or money conversion. That correspondence still needs a live
confirmation. The whole-statement client rejects an initial continuation cursor, so it cannot
begin midway through history and call the result complete. Reject a continuing page with no
rows, a repeated cursor and a page limit hit;
none is a successfully completed ledger. The AA response's page counters do not establish its
next-page request syntax. The loan overdue position inquiry has a separate set-number protocol.

Keep account identity, transaction ID and serial number for statement deduplication. Public
transaction identity is an opaque hash of that tuple; raw identifiers stay in server-side
capture metadata. Synthetic fixtures restore their own IDs only after verifying a bijection
with the separate enrichment records. Several
parts of a transaction may share its transaction ID, and different accounts may reuse one.
Unknown transaction direction must stop projection; unknown category or mode must not become a
claimed bank classification. Preserve the raw category and derive only supported enrichment.

## Fixture readers reject live inputs

The Postgres adapter reconstructs CASA balances from transaction running balances and the
projected synthetic liquidity terms. It also reconstructs loan principal through fixture as-of
arithmetic instead of reading the observed outstanding principal. That arithmetic assumes
calendar instalments are paid and can automatically remove a liability. Synthetic SIP values
are also projected by a fixture return assumption. Source guards now reject non-fixture
customer, profile, statement, account, deposit, loan, SIP, MF and insurance inputs before these
operations can treat them as synthetic. A separate reader for dated observed data is required
before connecting a live feed. Unknown or stale liquidity has a zero action ceiling; that
ceiling is not evidence that the customer's actual available balance is zero.

## Required regression cases

The parser, transport, seed and adversarial suites under `apps/api/test/contract/` exercise the
implemented boundary. The fixture suites retain persona and roadmap outcomes, and the Postgres
integration suite exercises migration and seed parity in an isolated database. The cases below
also state requirements for future live integration; they do not imply live verification.

1. Decimal objects and bare values: parse `"0.01"`, `"184500.25"` and numeric equivalents;
   reject blank strings, exponent strings, non-finite numbers, unsafe magnitude, `"1.005"`, and
   a USD object in an INR projection. `"90071992547409.91"` must not be accepted when the
   returned number JSON-serializes as `90071992547409.9`. Preserve negative balances while
   rejecting ambiguous transaction amount/direction combinations.
2. Ledger 100, available 70, active lien 30 yields reachable cash 70, not 40. Ledger 100,
   available 90, active lien 30 is conservatively capped at 70. Ledger 100, available 150 with
   credit capacity and confirmed zero liens yields no more than 100 owned reachable money. Never
   add drawing power. Missing available data must not be described as verified unrestricted cash.
3. Old lien 10, new lien 30 never becomes a lien total of 40. A deleted lien is not active;
   an unknown flag is not silently treated as inactive. A current lien cannot rewrite an old
   statement's running balances.
4. CASA 100 plus an FD 200 represented in both account and holding views yields total assets 300. Multiple accounts with different running balances do not use one account's minimum as
   a combined historical floor.
5. Statement page one has no `errors`; accept it when otherwise valid. A supported endpoint
   with populated errors is rejected even under HTTP 200. Reject account/currency mismatch,
   unknown direction, and missing fields needed for a continuing cursor.
6. Keep the exact raw last row for the next cursor, including posting date and serial number.
   Duplicate transaction IDs with distinct serials survive. Repeating the cursor, continuing
   without rows, exceeding the page bound or failing a later page never returns partial success.
7. A loan with no principal-only source, unknown DPD or unknown remaining tenure does not
   become debt-free. A live overdue loan survives a simulated calendar advance until a fresh
   observation confirms repayment. CIF-level aggregate exposure is not added to per-loan debt.
   Reject fractional DPD strings such as `"1.0000000000000000001"` before numeric conversion
   can round them into an integer.
8. A synthetic workbook-shaped replay remains fixture-origin through memory, Postgres and
   the sandbox view. Missing MF/insurance data is not advertised as a verified AA capability.
   Calculator, staff, lead-write and inbound-webhook entries never join a customer-read loop.
9. Regenerate each persona at the anchor and six clock positions. Compare transactions,
   snapshots, refusal verdicts and roadmap actions. Existing fixture outcomes must hold unless
   a deliberately corrected money bug has its own explicit expected result.
