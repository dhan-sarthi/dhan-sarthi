# Dhan Sarthi: sandbox data requirements

IDBI Innovate 2026 · Problem Statement 1 · Team Atomic

Request parameters and expected response fields for the retail wealth-advisory prototype. Formatted to match the GSTN reference schema supplied by the organisers. All development runs on synthetic or consented sandbox data.

> **This is what we asked for, not what exists.** IDBI's sandbox implements none of it: every one
> of its twenty-four APIs is a `POST` to `/Development/<op>test` with a camelCase Finacle body,
> there is no `data_blocks` selector, no `response_status`, and no endpoint at all for holdings,
> the product shelf or any declared profile field. Read
> [`idbi-sandbox.md`](idbi-sandbox.md) for what the bank really returns. This document is kept as
> the record of the request — it is what a bank would need to build for the product to run on one
> feed instead of four — and the field list still drives the fallback decisions in the engine.

- Retail customer feed
- 8 field groups
- 93 response fields
- Consent-gated

## 00. Request parameters

A single customer identifier drives every call, matching the pattern of the GSTN sample. The consent reference is passed alongside so no call can be made without an auditable consent artefact.

| API Field Name | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| customer_id | String | 20 | Mandatory | IDBI0009182731 | IDBI CIF / customer identifier. Primary key for all wealth-advisory calls, equivalent to GSTN in the reference schema. |
| consent_id | String | 50 | Mandatory | CONS_AA_982731 | Consent artefact reference (Account Aggregator or bank-issued). Call is rejected without an active consent. |
| data_period_from | Date | 10 | Mandatory | 01-08-25 | Start of the observation window. We request 12 months to establish behavioural baselines. |
| data_period_to | Date | 10 | Mandatory | 31-07-26 | End of the observation window. |
| data_blocks | String | 200 | Optional | PROFILE,TXN,HOLDINGS | Comma-separated block selector so the prototype can request only what a given screen needs, rather than the full payload on every call. |

## 01. Customer profile

Drives risk profiling, goal horizons and the age-progressed avatar. Date of birth is genuinely load-bearing here: it sets both the retirement horizon in every projection and the target age of the future-self rendering.

| Response Field | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| date_of_birth | Date | 10 | Mandatory | 14-06-1991 | Sets goal horizon, retirement year and the target age for the future-self avatar. Age alone is acceptable if DOB cannot be shared. |
| age | Integer | 3 | Mandatory | 35 | Derived age in years, if DOB is withheld. |
| gender | String | 10 | Optional | Female | Used for avatar rendering and life-expectancy assumptions in decumulation planning. |
| marital_status | String | 15 | Optional | Married | Informs goal inference (spouse, joint goals) and protection adequacy. |
| dependents_count | Integer | 2 | Optional | 2 | Drives the term-insurance adequacy calculation and education-goal inference. |
| employment_type | String | 30 | Mandatory | Salaried | Salaried, self-employed, business, retired. Changes income-stability assumptions and salary-day trigger logic. |
| declared_annual_income | Integer | 18,2 | Mandatory | 1450000.00 | Declared income on record. Cross-checked against inferred income from salary credits. |
| city | String | 50 | Optional | Bengaluru | Cost-of-living assumptions in corpus targets; metro versus non-metro benchmarking. |
| state_code | String | 2 | Optional | 29 | State code, same convention as the GSTN reference. |
| preferred_language | String | 10 | Mandatory | hi-IN | BCP-47 language tag. Selects the language of the voice conversation and all generated explanations. |
| risk_profile | String | 20 | Optional | Moderate | Existing SEBI risk category on record, if the bank already holds one. Absent this, we profile conversationally. |
| risk_profile_date | Date | 10 | Optional | 12-03-26 | Date of last risk assessment. Drives re-profiling prompts when stale. |
| kyc_status | String | 20 | Mandatory | Verified | KYC state. Gates whether any investment action can be offered. |
| customer_since_date | Date | 10 | Optional | 08-11-16 | Relationship tenure, used for segment context. |

## 02. Accounts and balances

Establishes the idle-surplus baseline. The average-balance fields matter more than the point-in-time balance, because surplus detection compares current balance against the customer's own normal.

| Response Field | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| account_number_masked | String | 20 | Mandatory | XXXXXX7412 | Masked account identifier. Full number is never required by the prototype. |
| account_type | String | 20 | Mandatory | Savings | Savings, current, salary. Salary accounts enable payday triggers. |
| current_balance | Integer | 18,2 | Mandatory | 184500.00 | Balance as at data_freshness_date. |
| avg_monthly_balance_3m | Integer | 18,2 | Mandatory | 156200.00 | Three-month average balance. Core input to idle-surplus detection. |
| avg_monthly_balance_12m | Integer | 18,2 | Optional | 142800.00 | Twelve-month average, for seasonality and trend. |
| min_balance_12m | Integer | 18,2 | Optional | 18400.00 | Lowest balance in the window. Sets a safe emergency-buffer floor before any surplus is proposed. |
| account_opening_date | Date | 10 | Optional | 08-11-16 | Account vintage. |

## 03. Transactions

The behaviour engine runs on this block; it is the single most important group in the request. If the bank cannot supply a spend category, narration plus MCC is sufficient because we categorise on our side.

| Response Field | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| txn_id | String | 30 | Mandatory | TXN20260811A4471 | Unique transaction reference, for idempotency and audit linkage. |
| txn_date | Date | 10 | Mandatory | 11-08-26 | Value date of the transaction. |
| txn_amount | Integer | 18,2 | Mandatory | 2450.00 | Transaction amount. |
| txn_type | String | 6 | Mandatory | DEBIT | DEBIT or CREDIT. |
| txn_mode | String | 20 | Mandatory | UPI | UPI, NEFT, IMPS, card, ATM, standing instruction, cash. |
| narration | String | 200 | Mandatory | UPI/SWIGGY/4471 | Raw narration. Primary signal for our categorisation model where no category is provided. |
| merchant_name | String | 100 | Optional | Swiggy | Normalised merchant, if the bank enriches it. |
| mcc_code | String | 4 | Optional | 5812 | Merchant category code. Materially improves categorisation accuracy. |
| spend_category | String | 30 | Optional | Food and Dining | Bank-assigned category if one exists. We fall back to our own classifier when absent. |
| is_salary_credit | Boolean | 1 | Optional | true | Salary-credit flag. Drives the payday nudge, our highest-conversion trigger moment. Inferable from narration if unavailable. |
| is_recurring | Boolean | 1 | Optional | true | Recurring-payment flag, for subscription-leakage detection. |
| balance_after_txn | Integer | 18,2 | Optional | 182050.00 | Running balance, for intra-month cash-flow curves. |
| counterparty_vpa | String | 100 | Optional | swiggy@icici | UPI VPA of the counterparty, masked or hashed is acceptable. |

## 04. Holdings and existing investments

Needed so advice is incremental rather than duplicative, and so allocation drift can be detected. The FD maturity date is a trigger in its own right: a maturing deposit is the moment a customer is most open to reallocating.

| Response Field | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| holding_type | String | 20 | Mandatory | MUTUAL_FUND | MUTUAL_FUND, FD, RD, INSURANCE, EQUITY, PPF, NPS, GOLD. |
| scheme_or_product_name | String | 150 | Mandatory | HDFC Flexi Cap Fund | Product name as held. |
| isin | String | 12 | Optional | INF179K01YV8 | ISIN, for unambiguous product matching and overlap analysis. |
| asset_class | String | 20 | Mandatory | Equity | Equity, debt, hybrid, gold, cash. Basis of the allocation and drift view. |
| invested_amount | Integer | 18,2 | Mandatory | 240000.00 | Cost basis. |
| current_value | Integer | 18,2 | Mandatory | 318400.00 | Current market value. |
| units | Integer | 18,4 | Optional | 4128.6210 | Units held, where applicable. |
| sip_active | Boolean | 1 | Mandatory | true | Whether a systematic plan is running. Determines whether we propose a new SIP or a step-up. |
| sip_amount | Integer | 18,2 | Optional | 5000.00 | Monthly instalment. |
| sip_debit_day | Integer | 2 | Optional | 5 | Day of month, so nudges do not collide with existing debits. |
| maturity_date | Date | 10 | Optional | 14-11-26 | FD/RD/policy maturity. Drives the maturity-reallocation trigger. |
| interest_rate | Integer | 5,2 | Optional | 7.10 | Contracted rate on deposits, for real-return comparisons. |
| insurer_name | String | 50 | Optional | LIC of India | For insurance holdings. Identifies existing LIC relationships. |
| policy_type | String | 30 | Optional | Endowment | Term, endowment, ULIP, annuity, health. Term versus savings-linked is the key distinction for gap analysis. |
| sum_assured | Integer | 18,2 | Optional | 1500000.00 | Existing life cover. Required to compute the protection gap against an income-multiple rule. |
| premium_amount | Integer | 18,2 | Optional | 24000.00 | Premium outgo, counted in committed monthly cash flow. |

## 05. Liabilities

Without this, investable surplus is overstated and advice becomes unsafe. It also enables the prepay-versus-invest comparison, which is the question Indian retail customers ask most.

| Response Field | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| loan_type | String | 30 | Mandatory | Home Loan | Home, auto, personal, education, gold, credit card. |
| outstanding_principal | Integer | 18,2 | Mandatory | 3850000.00 | Principal outstanding. |
| emi_amount | Integer | 18,2 | Mandatory | 34200.00 | Monthly obligation. Deducted from surplus before any investment is recommended. |
| loan_interest_rate | Integer | 5,2 | Mandatory | 8.65 | Rate on the loan. The comparison point for prepay-versus-invest advice. |
| tenure_remaining_months | Integer | 3 | Optional | 184 | Remaining tenure. |
| dpd_status | Integer | 3 | Optional | 0 | Days past due. Any stress here suppresses investment nudges and routes to assistance instead. |
| credit_card_limit | Integer | 18,2 | Optional | 450000.00 | Sanctioned limit. |
| credit_card_outstanding | Integer | 18,2 | Optional | 28400.00 | Revolving balance. High-cost debt is always addressed before investing. |

## 06. Product shelf

A recommendation cannot pass a suitability check against products we cannot see. This block is what makes advice actionable rather than generic, and it is where the LIC shelf becomes usable.

| Response Field | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| product_id | String | 30 | Mandatory | IDBI_MF_00184 | Distributable product identifier on IDBI's shelf. |
| product_name | String | 150 | Mandatory | Nifty 50 Index Fund | Display name. |
| product_category | String | 40 | Mandatory | Index Fund | SEBI scheme category, or deposit/insurance class. |
| riskometer | String | 20 | Mandatory | Very High | SEBI riskometer band. The hard input to our suitability gate; a product cannot be recommended above the customer's profile. |
| min_investment | Integer | 18,2 | Mandatory | 500.00 | Minimum lump sum or SIP ticket. |
| expense_ratio | Integer | 5,2 | Optional | 0.20 | Total expense ratio, for cost-drag explanations. |
| plan_type | String | 10 | Optional | Direct | Direct or regular. Disclosed to the customer alongside the recommendation. |
| return_1y / _3y / _5y | Integer | 7,2 | Optional | 14.82 | Trailing returns, shown with mandated disclaimers only. Never used as a projection input. |
| insurance_product_flag | Boolean | 1 | Optional | true | Marks LIC bancassurance products, enabling protection-first recommendations. |
| is_transactable_sandbox | Boolean | 1 | Mandatory | true | Whether a simulated order can be placed against this product in the sandbox. |

## 07. Derived behavioural signals

The organisers' reference schema is full of pre-computed features rather than raw records, so we are requesting the same treatment here. Every field below is optional and we can compute all of them from the transaction block, but each one the bank supplies is a week we spend on advice quality instead of on rebuilding a categoriser.

| Response Field | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| avg_monthly_surplus_3m | Integer | 18,2 | Optional | 27200.00 | Average investable surplus after committed outflows. The single most important derived number in the product; the entire advice conversation opens on it. |
| salary_credit_amount | Integer | 18,2 | Optional | 95000.00 | Most recent recognised salary credit. Anchors inferred income against declared income. |
| salary_credit_day | Integer | 2 | Optional | 1 | Typical day of month salary lands. Drives the payday nudge, our highest-conversion moment. |
| avg_monthly_inflow_3m | Integer | 18,2 | Optional | 98400.00 | Average total credits per month over three months. |
| avg_monthly_outflow_3m | Integer | 18,2 | Optional | 71200.00 | Average total debits per month over three months. |
| surplus_volatility_pct | Integer | 7,2 | Optional | 18.40 | Variability of monthly surplus. A volatile surplus means we recommend a smaller, safer SIP. |
| spend_by_category_12m | String | 500 | Optional | {"Food":184000,"Rent":420000} | JSON map of categorised annual spend. If unavailable we derive it from narration and MCC. |
| discretionary_spend_pct | Integer | 7,2 | Optional | 34.20 | Share of outflow that is discretionary. Identifies realistic room to increase investing. |
| recurring_debit_total | Integer | 18,2 | Optional | 4820.00 | Monthly total of recurring debits, for subscription-leakage insights. |
| emi_to_income_ratio_pct | Integer | 7,2 | Optional | 28.60 | Debt-service ratio. A hard input to the suitability gate; above threshold we advise debt reduction, not investment. |
| savings_rate_pct | Integer | 7,2 | Optional | 22.40 | Share of income saved or invested. Headline metric on the financial-health view. |
| emergency_fund_months | Integer | 5,2 | Optional | 2.30 | Liquid balance expressed in months of outflow. Protection-first advice is gated on this before any equity recommendation. |
| inflow_stability_score | Integer | 5,2 | Optional | 0.87 | Regularity of income, 0 to 1. Lower scores shift recommendations toward liquidity. |
| balance_trend_6m_pct | Integer | 7,2 | Optional | 6.80 | Direction of balance accumulation, following the growth-trend convention in the reference schema. |
| investment_to_networth_pct | Integer | 7,2 | Optional | 18.70 | How much of net worth is actually invested versus sitting idle. The headline gap the product exists to close. |
| first_investment_date | Date | 10 | Optional | 12-05-22 | Investing tenure, a proxy for experience. Changes the tone and depth of explanations. |

## 08. Consent, audit and response metadata

Mirrors the consent and status fields in the organisers' reference schema. These are not incidental for us: the consent reference and freshness date are written into every stored recommendation, which is what makes the five-year audit trail defensible.

| Response Field | Type | Max Len | M/O | Sample Value | Description |
|---|---|---|---|---|---|
| consent_reference | String | 50 | Mandatory | CONS_SYN_982731 | Consent and audit reference, echoed back on the response. |
| consent_purpose | String | 100 | Mandatory | Wealth advisory | Declared purpose, recorded against every use of the data. |
| consent_valid_to | Date | 10 | Mandatory | 31-07-27 | Consent expiry. Advice generation halts on expiry rather than degrading silently. |
| consent_status | String | 20 | Mandatory | ACTIVE | ACTIVE, EXPIRED, REVOKED. Revocation must be reflected here. |
| data_period_from | Date | 10 | Mandatory | 01-08-25 | Start of the observation window covered by this response. |
| data_period_to | Date | 10 | Mandatory | 31-07-26 | End of the observation window. |
| data_freshness_date | Date | 10 | Mandatory | 20-08-26 | Date through which the feed is considered available. Surfaced in the UI so advice is never presented as fresher than its data. |
| response_status | String | 20 | Mandatory | SUCCESS | API processing result. |
| error_code | String | 20 | Optional | CONSENT_EXPIRED | Machine-readable failure reason, so the app can degrade to a specific message rather than a generic error. |

**On mandatory versus optional.** Only the fields the prototype genuinely cannot function without are marked Mandatory. Everything else is marked Optional with a stated fallback, because we would rather degrade gracefully on a thinner feed than hold up sandbox provisioning while a field is sourced. Where a field is unavailable, we derive it: spend category from narration, salary flag from credit patterns, age from a range if date of birth cannot be shared.

---

Team Atomic · Problem Statement 1, Digital Wealth Management · IDBI Innovate 2026. Field naming, types and length conventions follow the GSTN reference schema circulated by the organisers. No production customer data is requested; the prototype is developed against synthetic fixtures and, where available, consented sandbox records.
