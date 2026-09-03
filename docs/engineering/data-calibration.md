# Synthetic data calibration

What a real IDBI savings-account statement looks like, and the public numbers the generator in `packages/fixtures` is calibrated against. Compiled 3 September 2026; every figure carries its source and period.

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

## MCC map
Swiggy/Zomato 5812; cafés 5814; groceries 5411; kirana 5499; Rapido/Uber/Ola 4121; fuel 5541; IRCTC 4112; Amazon/Flipkart 5399/5999; Myntra 5651; Croma 5732; PVR 7832; OTT 5815; pharmacy 5912; hospital 8062; labs 8071; gym 7997; electricity/gas 4900; telecom 4814; broadband 4816; insurance 6300; SIP/AMC 6211; EMI/card bill 6012; school 8211; MakeMyTrip 4722; hotels 7011; airlines 4511; P2P none.

## Utilities by city
Indore: MPPKVVCL, Avantika Gas, Jio Fiber (ACT is NOT in Indore/Kochi/Nagpur). Kochi: KSEB, IOAGPL/LPG, Asianet Broadband. Nagpur: MSEDCL, LPG (Indane/HP), Jio/Airtel.

## Calibration table (source, period)
- UPI avg ticket ₹1,217 (Aug 2026); P2M ticket ₹606, P2P ₹2,396 (NPCI Jul 2026); 86% of P2M below ₹500 (RBI PSR).
- Txns per onboarded user ≈36–44/month (FY26).
- HCES 2023-24 urban MPCE ₹6,996: food 39.7%, conveyance 8.5%, rent 6.6%, education 6.0%, medical 5.9%, fuel & light 5.6%.
- SIP avg ₹3,228/contributing account (AMFI Jul 2026); min ₹500.
- IDBI card finance charge 2.90% p.m. (34.8% p.a. simple) — persona's 42% should become ~35%.
- IDBI savings 2.50% (≤₹1L) / 2.55% / 2.60%; quarterly credit. IDBI FD 1y 6.20%, >2–<3y 6.50%, 3–<5y 6.35%, special 700d 6.45% (to 30 Sep 2026).
- PMJJBY ₹436/yr, PMSBY ₹20/yr, auto-debit before 1 June.
- LIC Digi Term ₹1cr non-smoker age 29 ≈ ₹11,800/yr ex-GST (≈₹985/mo) — shelf says ₹880/mo.
- Niva Bupa ReAssure 2.0 ₹10L 2A+1C age 29: ₹15–20k/yr estimate (unverified).
- IDBI charges: SMS ₹0.25/alert, MAB shortfall 5%/month, GST 18%.

## Generator changes, priority order
1. NPCI UPI narration form with RRN, payee, bank code, VPA (`brand.rzp@bank`), remark; P2M vs P2A; mcc per merchant.
2. Salary NEFT from the employer's bank with 16-char UTR; persona's own IBKL branch in the account header; drop IDIB.
3. Bank-generated lines: quarterly interest credit, SMS charge + GST, MAB shortfall, PMJJBY/PMSBY debits, ECS return charge for the missed EMI.
4. SIP/EMI mandates as `ACH-DR-INDIAN CLEARING CORP…` / `ACH-DR-NSEClearingLimited…` / `ACH D- TP ACH <LENDER>`; revolving card as variable card-bill payments, not an EMI.
5. City-correct utilities and broadband via BBPS shapes.
6. Ticket-size calibration: P2M mean ≈ ₹600, ~85% under ₹500, 35–45 UPI debits/month; Gamma-skewed amounts; micro-tickets.
7. Populate mcc_code, merchant_name, counterparty_vpa, value date; 16-char UTR/RRN ids; paise amounts.
8. Year-specific festival dates (Diwali 2024-11-01, 2025-10-20, 2026-11-08; Onam for Kochi; Ganesh Chaturthi for Nagpur); per-persona pay policy.
9. Persona facts: card rate 34.8%, Netflix tiers 149/199/499/649, IMPS with RRN+IFSC, hospital lumps by card/NEFT.
10. ATM narration `NFS/CASH WDL/<RRN>/<ATM ID>/<LOCALITY>/<dd-mm-yy>`.
11. A calibration test asserting emergent stats stay within published bands; run narrations through kharchalens merchant rules in CI.
