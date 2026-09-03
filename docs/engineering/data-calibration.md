# Synthetic data calibration

What a real IDBI savings-account statement looks like, and the public numbers the generator in `packages/fixtures` is calibrated against. Compiled 3 September 2026; every figure carries its source and period.

**Status.** The realism pass of 3 September 2026 implemented items 1–11 of the change list below. The code that reads these numbers is [`packages/fixtures/src/calibration.ts`](../../packages/fixtures/src/calibration.ts) — one constant table with a citation on every row — and the emergent statistics are held inside published bands by [`packages/fixtures/src/realism.test.ts`](../../packages/fixtures/src/realism.test.ts). What has **not** been done, and why, is listed at the bottom. Keep this document and that file in step: the file is what the generator reads, this is what a reviewer reads.

## Ranked datasets
1. AgamiAI/Indian-Bank-Statements (HF, Apache-2.0) — narration grammar per rail; business accounts only.
2. raptar231/indian-bank-statement-parser (GitHub, Apache-2.0) — realistic Axis/HDFC/ICICI/SBI fixtures; usable as a parser oracle.
3. karthiksagarn/bank-statement-categorization (HF) — 7,512 narration→category rows; enrichment test set.
4. PhonePe Pulse (CDLA-Permissive-2.0) — state × quarter category mix and seasonality.
5. NPCI P2P/P2M monthly (Dataful #431), RBI Payment Systems Report, MoSPI HCES 2023-24 factsheet — calibration.

## Narration formats (verbatim examples)
- NPCI UPI standard: `UPI/DR/800412179072/BuntyG/IOBA/123412341234/Mutual Fund`, `UPI/CR/800412179072/Rajesh/IBKL/567856785678/Mutual Fund/`
- Axis: `UPI/P2M/645988432875/Euronet Services Indi/UPI/AXIS BANK`, `UPI/P2A/626181509069/TARAPADA /UTIB/Payment/`, `IMPS/P2A/534132328296/925020022629072/1010225/AXISBANKLTD/`, `ACH-DR-NSEClearingLimited-3267148017-14-04-2026 UTIB70224042`, `NEFT-HDFCH01022962916-MIINFOTECH SOFTWARE SERVICES LLP-0001SALARY MAY 2026-50200007377194-HDFC00000`, `CreditCard Payment XX 1184 Ref#O2S96OJ4SZUMI8`
- HDFC: `UPI-RAJESH KUMAR-9812345678@YBL-HDFC0000314-120555000001-UPI`, `UPI-GROWW SECURITIES LTD-GROWWLTD D.RZP1.BRK@VALIDAXIS-UTIB0000029-877000012345-PAY VIA RAZORPAY`, `NEFT CR-CITI0000004-GLOBEX-1608-SALARY PAYMENT-JOHN DOE-CITIN26600012345`, `ACH D- TP ACH ZEDLEAFIN-1610362127`, `ACH C- RELIANCE INDUSTRIES-44820001`
- ICICI: `UPI/KANNAN/kannantn441-1@okhdfc/Payment fr/AXIS BANK/559218097793/IBL295d...`, `MMT/IMPS/827421001288/Rent/HDFC0000444`, `NFS/CASH WDL/609519430140/MCRM1774/PARAMAKUD/05-04-26`, `BIL/BBPS/TATA POWER/Electricity Bill/500110030885`, `ACH/CAPITAL TRUST CR LTD./IN30290249302927`
- SBI: `BY TRANSFER- NEFT*UTIB0004920*AXIS`, `ATM WDL-ATM CASH 10021`, `CREDIT INTEREST--`
- Charges/interest: `INT.PD:01-01-2025 to 30-01-2025`, `ACH/D/LIC OF INDIA/Premium/500110042882`, `ATW/ATM CASH/HDFC ATM ANDHERI/500110038440`
- IDBI: IFSC prefix IBKL; UPI handle @idbi; e-statement columns `Srl | Txn Date | Value Date | Description | Cheque No | CR/DR | CCY | Trxn Amount | Balance`. Real IDBI branches: Indore IBKL0000001/0000155 (Vijay Nagar)/0001040; Kochi IBKL0000084/0000137/0001058; Nagpur IBKL0000041/0000510 (Sitabuldi)/0000543. No verbatim IDBI narration obtained; NPCI form with IBKL is the defensible default.

### What the generator now emits

One builder per rail in [`packages/fixtures/src/narration.ts`](../../packages/fixtures/src/narration.ts), each derived from a form above. `realism.test.ts` asserts that **every** generated line matches one of these templates, and that every template is exercised by at least one persona.

| Rail | Template | Example |
|---|---|---|
| UPI to a merchant or a person | `UPI/DR/<RRN12>/<PAYEE>/<BANK4>/<vpa>/<REMARK>` | `UPI/DR/824112340987/SWIGGY/ICIC/swiggy.rzp@icici/ORDER` |
| UPI inward | `UPI/CR/<RRN12>/<PAYER>/<BANK4>/<vpa>/<REMARK>` | `UPI/CR/824112340987/VINOD SHARMA/SBIN/vinod@okaxis/SHOP SALE` |
| IMPS account-to-account | `IMPS/P2A/<RRN12>/<NAME>/<IFSC11>/<REMARK>` | `IMPS/P2A/826110045521/SUDHIR PATEL/SBIN0030164/RENT` |
| Salary or settlement inward | `NEFT/<UTR16>/<REMITTER>/<IFSC11>/SALARY <MON YYYY>` | `NEFT/HDFCN262130004411/ACME TECHNOLOGIES PVT LTD/HDFC0000523/SALARY AUG 2026` |
| Outward NEFT | `NEFT/DR/<BENEFICIARY>/<IFSC11>/<REMARK>` | `NEFT/DR/ORANGE CITY HOSPITAL/HDFC0000212/ADMISSION` |
| Loan instalment (NACH) | `ACH-DR-<CREDITOR>-<UMRN20>-<dd-mm-yyyy>` | `ACH-DR-IDBI BANK RETAIL ASSETS-IBKLBI653Z5UWN4H60G5-07-09-2026` |
| Mutual-fund SIP (NACH) | `ACH-DR-<CLEARING CORP>-<UMRN20>-<dd-mm-yyyy>` | `ACH-DR-INDIAN CLEARING CORP-IBKL5T2XW1KQ9ZR7C4NM-05-09-2026` |
| Insurance premium | `ACH/D/<INSURER>/PREMIUM/<policy ref>` | `ACH/D/PMJJBY LIC OF INDIA/PREMIUM/500110066214` |
| Subscription | `SI/<MERCHANT>/AUTOPAY` | `SI/NETFLIX/AUTOPAY` |
| Utility bill | `BIL/BBPS/<BILLER>/<consumer no>/BBPS<10>` | `BIL/BBPS/KSEB/418290471/BBPS0026734512` |
| Card at a terminal | `POS 4XXXXXXXXXXX<last4> <MERCHANT> <CITY>` | `POS 4XXXXXXXXXXX5188 DMART INDORE` |
| Card online | `ECOM 4XXXXXXXXXXX<last4> <MERCHANT>` | `ECOM 4XXXXXXXXXXX5188 AMAZON` |
| Card bill payment | `CreditCard Payment XX <last4> Ref#<13>` | `CreditCard Payment XX 1184 Ref#O2S96OJ4SZUMI8` |
| Another bank's ATM | `NFS/CASH WDL/<RRN12>/<ATM id>/<LOCALITY>/<dd-mm-yy>` | `NFS/CASH WDL/609519430140/HDFC1774/VIJAY NAGAR/05-04-26` |
| IDBI's own ATM | `ATW/ATM CASH/IDBI ATM <LOCALITY>/<12>` | `ATW/ATM CASH/IDBI ATM SITABULDI/500110038440` |
| Cash deposit | `CDM/CASH DEP/<LOCALITY>/<12>` | `CDM/CASH DEP/SITABULDI/500110038440` |
| Quarterly interest | `SB INT CR <dd-mm-yyyy> TO <dd-mm-yyyy>` | `SB INT CR 01-07-2026 TO 30-09-2026` |
| Charges | `SMS ALERT CHGS <n> MSG <dd-mm-yyyy>`, `MIN BAL CHGS <MON YYYY>`, `NACH RETURN CHGS <dd-mm-yyyy>` | |
| Tax on a charge | `GST @18% ON <charge> <dd-mm-yyyy>` | `GST @18% ON SMS ALERT CHGS 30-09-2026` |

Reference numbers are shaped, not random. An RRN is the last digit of the year plus the three-digit day of the year plus an eight-digit switch trace, so it decodes back to its own date; a NEFT UTR is `<BANK4>N<YY><DDD><6>`; a UMRN is twenty alphanumerics and is **stable per mandate**, not per debit. The statement's own transaction id carries the rail's reference where the rail has one, and a Finacle-style `S########` otherwise.

**A consequence worth recording.** These forms broke `seriesKey` in `@dhan/core`, silently. A NACH line ends `-07-09-2026`; splitting on the hyphen before stripping the date leaves `07` and `09` in the key, so the same EMI produced a different key every month and the most regular debit in the ledger formed no series at all. The same held for `SALARY AUG 2026` and for `Ref#…` on a card payment. `seriesKey` now strips dates, month-year periods, card references and long alphanumeric codes *before* splitting, and `engine.test.ts` pins each case.

## MCC map
Swiggy/Zomato 5812; cafés 5814; groceries 5411; kirana 5499; Rapido/Uber/Ola 4121; fuel 5541; IRCTC 4112; transit 4111; Amazon/Flipkart 5399/5999; Myntra 5651; Croma 5732; PVR 7832; OTT 5815; pharmacy 5912; hospital 8062; labs 8071; gym 7997; electricity/gas 4900; telecom 4814; broadband 4816; insurance 6300; SIP/AMC 6211; EMI/card bill 6012; school 8211; MakeMyTrip 4722; hotels 7011; airlines 4511; P2P none.

Implemented as `MCC` in `calibration.ts` and carried on `Transaction.mccCode`. Every card line and every UPI payment to a merchant or a biller has one; mandates, transfers and the bank's own charges have none, and `realism.test.ts` asserts both directions. `counterpartyVpa` is populated on UPI merchant lines; `merchantName` on every card line and on roughly 40% of UPI lines, deliberately — an enricher that has only ever seen the enriched half has not been tested.

## Utilities by city
Indore: MPPKVVCL, Avantika Gas, Jio Fiber (ACT is NOT in Indore/Kochi/Nagpur). Kochi: KSEB, IOAGPL/LPG, Asianet Broadband. Nagpur: MSEDCL, LPG (Indane/HP), Jio/Airtel.

Implemented as `CITIES` in `calibration.ts`, together with the branch IFSC, the ATM localities and the regional festival for each city. Nagpur's gas is a cylinder rather than a piped connection, so it is billed every second month — a different shape for recurring detection to handle, and asserted as such. `realism.test.ts` also proves the negative: no persona is ever billed by another city's discom, and no persona shops at a merchant scoped to a city they do not live in.

## Calibration table (source, period)
- UPI avg ticket ₹1,217 (Aug 2026); P2M ticket ₹606, P2P ₹2,396 (NPCI Jul 2026); 86% of P2M below ₹500 (RBI PSR).
- Txns per onboarded user ≈36–44/month (FY26).
- HCES 2023-24 urban MPCE ₹6,996: food 39.7%, conveyance 8.5%, rent 6.6%, education 6.0%, medical 5.9%, fuel & light 5.6%.
- SIP avg ₹3,228/contributing account (AMFI Jul 2026); min ₹500.
- IDBI card finance charge 2.90% p.m. (34.8% p.a. simple) — **implemented**; the persona's 42% is gone.
- IDBI savings 2.50% (≤₹1L) / 2.55% / 2.60%; quarterly credit — **implemented** as marginal slabs on the daily closing balance. IDBI FD 1y 6.20%, >2–<3y 6.50%, 3–<5y 6.35%, special 700d 6.45% (to 30 Sep 2026).
- PMJJBY ₹436/yr, PMSBY ₹20/yr, auto-debit before 1 June — **implemented** for Sunil, with the matching policies on his file.
- LIC Digi Term ₹1cr non-smoker age 29 ≈ ₹11,800/yr ex-GST (≈₹985/mo) — **implemented**; the shelf's ₹880 is gone.
- Niva Bupa ReAssure 2.0 ₹10L 2A+1C age 29: ₹15–20k/yr estimate — still **[verify]**; the shelf carries ₹1,450/month.
- IDBI charges: SMS ₹0.25/alert, GST 18% — **implemented**, always as two lines. Minimum average balance: this note previously said 5% per month; IDBI's own Advantage Savings schedule of fees says **6% per month of the shortfall, capped** (₹600 metro / ₹300 urban / ₹150 semi-urban / ₹60 rural) after one month's grace, and the schedule wins. The tier for Indore, Kochi and Nagpur is **[inference]** — the schedule names bands without listing branches, and all three are treated as urban (MAB ₹10,000, cap ₹300).

### Where the ledger lands, and one place it deliberately cannot

`realism.test.ts` holds these bands; `calibration.ts` carries them as constants with the published figure beside each.

| Statistic | Published | Band enforced | Rohan | Priya | Sunil |
|---|---|---|---|---|---|
| UPI debits per month | 36–44 (NPCI, per onboarded user) | 34–50 | 41.4 | 39.6 | 46.3 |
| Share of P2M payments under ₹500 | 86% (RBI PSR) | 74–90% | 80.6% | 77.9% | 81.9% |
| Mean P2M ticket | ₹606 (NPCI Jul 2026) | ₹300–520 | ₹356 | ₹406 | ₹370 |

**The mean is the one figure that cannot be reproduced, and the reason is arithmetic rather than tuning.** For any account, `mean ticket × payment count = the money that left through UPI`. Rohan spends about ₹14,000 a month at merchants over UPI. Forty payments out of that envelope is a mean of ₹350; a mean of ₹606 is twenty-three payments. NPCI's 36–44 and NPCI's ₹606 are both published, and at this envelope they are mutually exclusive — the national mean averages over a population that includes merchants paying merchants and businesses paying suppliers, which none of these three personas is. So the generator holds the two figures a banker actually eyeballs, how many lines a month and how many of them are small, and lets the mean fall where the arithmetic puts it. Moving a persona into the ₹606 band would mean either giving them ₹24,000 a month of discretionary spending they do not have, or eleven UPI payments a week. Both are less true than the gap.

Ticket sizes are drawn from a **Gamma** distribution around each merchant's own mean, clamped into its plausible band. A uniform draw inside a band puts the median and the mean on the same number, which is the one thing no statement anywhere looks like — and it is what made "86% under ₹500" unreachable at any mean. `realism.test.ts` asserts the median stays below 70% of the mean, so a uniform draw cannot creep back in unnoticed.

## Generator changes, priority order

Items 1–11 were implemented on 3 September 2026. What each one turned into:

1. **NPCI UPI narration form** — `narration.ts`, `upiDebit` and `upiCredit`; P2M lines carry an MCC and a VPA, P2A lines carry neither.
2. **Salary NEFT from the employer's bank, 16-character UTR, IBKL branch on the header, `IDIB` gone** — `PersonaSpec.employer` is now `{ name, ifsc }`, `Account.branchIfsc` comes from the city table, and a test asserts no line anywhere contains `IDIB`.
3. **Bank-generated lines** — `bank-lines.ts`: quarterly interest at the slab rates on daily closing balances, SMS alert charge plus GST as separate lines, minimum-balance charge, PMJJBY/PMSBY, NACH return charge. Computed in a second pass over the sealed behavioural ledger, because interest is the daily product of a balance that does not exist until the first pass has run.
4. **Mandates** — `ACH-DR-<creditor>-<UMRN>-<date>` for loans, `ACH-DR-INDIAN CLEARING CORP-…` for the SIP, and Priya's card as `CreditCard Payment XX 1184 Ref#…` with a variable amount rather than a fixed instalment.
5. **City-correct utilities and broadband via BBPS shapes** — `CITIES` in `calibration.ts`, `billersFor()` in `merchants.ts`.
6. **Ticket-size calibration** — Gamma draws, micro-ticket merchants, and a per-persona `cardShare` that decides how much of the envelope goes through UPI at all. See the table above for where it lands.
7. **`mccCode`, `merchantName`, `counterpartyVpa`, `valueDate`; rail-shaped ids; paise** — all on `Transaction`, mirrored in `packages/contracts`, written by the seed CLI and read back by the Postgres adapter. Paise appear where a bank puts them (metered bills, charges, GST) and nowhere else; interest is rounded to the rupee, as RBI's Master Direction requires.
8. **Year-specific festival dates** — `FESTIVAL_DAYS`, with Onam scoped to Kochi and Ganesh Chaturthi to Nagpur. Diwali 2025 fell on 20 October and Diwali 2026 falls on 8 November; a fixed calendar window put the spike in the wrong month roughly half the time.
9. **Persona facts** — card at 34.8%, Netflix stepping ₹499 → ₹649 (two published tiers), term premium ₹985, hospital lumps by card or NEFT rather than as an impossible ₹74,000 UPI payment.
10. **ATM narration** — both the NFS form for another bank's machine and IDBI's own `ATW/ATM CASH/…`.
11. **A calibration test** — `realism.test.ts`: 29 assertions over narration grammar, the fields the real feed carries, city correctness, the bank's own lines and the emergent statistics.

### Not done, and why

- **`kharchalens` merchant rules in CI** (item 11's second half). The recognition dictionary in `packages/core` was extended instead — lenders, clearing corporations, KSEB, IOAGPL, Lulu, the Finacle `CHGS` abbreviation, the one-word `CreditCard` spelling — and coverage stays above 98% with zero disagreements against the bank's own labels. Running a third-party rule set in CI is still worth doing, because our dictionary and our generator are two tables we wrote, and agreement between them proves less than it looks.
- **Value date beyond the card lag.** Card lines post the day after the purchase and are value-dated back to it; charges are back-valued to the period they belong to. Cheque clearing, the working-day roll and `ref.bank_holidays` are not implemented — no persona writes a cheque.
- **Finacle channel and transaction-type codes** (`channel_code` beyond the existing mode mapping, `finacle_tran_type`, `part_tran_srl_num`). The schema has the columns; the generator does not fill them.
- **Failures and reversals**, the FD lifecycle with TDS, `bank.card_snapshots`, `bank.mandates` as ground truth, and the AA-shaped XML export — items 8, 10, 11, 12 and 13 of section F in the schema README. All are ingestion-path realism rather than statement realism, and none changes what a reviewer sees on a screen.
- **A minimum-balance charge on a persona.** The charge is implemented and tested directly against `bankGeneratedLines` with a thin ledger, but no persona is ever charged one: all three keep five figures every month. Forcing one below ₹10,000 to exercise the code path would be inventing behaviour to satisfy a test.
- **Niva Bupa's premium** and the 2027–2028 festival dates remain `[verify]`. Both are inside the seeded horizon; neither is reachable in a demo.

## Regenerating the figures

`pnpm --filter @dhan/fixtures figures` prints the derived headline numbers and the suitability verdict for every persona at the anchor, which is where the README table, `docs/product/autopilot.md` and the test assertions get their numbers. `pnpm --filter @dhan/fixtures summary` prints the ledger aggregates behind them. Anything quoted in a document comes from one of those two commands, never from a keyboard.

The seed's content hash changes whenever the generator does. That is expected after this pass: `pnpm --filter @dhan/api seed:check` reports drift against a database seeded before it, and the fix is to reseed.
