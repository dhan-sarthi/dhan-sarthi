# RM console: reference screens

Pulled from Mobbin on 2 Oct 2026 for the relationship-manager console (`apps/rm`). The
images are references for structure and density only; colour comes from `packages/design/tokens.json`,
never from these screens. Cite the Mobbin link, not the image, when discussing one.

## Home, book and portfolio

Go light, calm and typographic, built like a banking product rather than a SaaS admin. Use a warm off-white canvas, white cards with hairline borders and an 8–12px radius, one IDBI-green accent, and red/amber reserved for risk. Numbers carry the hierarchy: large tabular numerals with superscript paise, delta pills, and small uppercase grey section labels (Copilot Money, Adaline, Mercury). The RM home should be a few cards that each answer one question: book AUM and growth, a Xero-style counted 'Today' task list (idle cash, KYC due, suitability refusals), and an upcoming-events list. The book should be an Attio-dense table topped by Semrush-style segment tabs with counts, with an AUM sparkline and a thin allocation bar in every row. Selecting a row opens a Copilot-style right rail (AUM chart, allocation bars, holdings), so the RM never loses the list. For data viz, prefer small multiples, thin labelled bars, and grey series with one highlighted. Use a donut only for top-level allocation, with direct labels.

### [Copilot Money](https://mobbin.com/screens/4e13cc80-a9e1-48b0-8882-c8857758acc5) — `A01-copilotmoney-home-cards.jpg`

Dashboard home: card grid with monthly spending pace chart, net worth (assets vs debts with delta pills, 1W-ALL range), top categories progress bars, 'Transactions to review' empty state, 'Next two weeks' upcoming list with category pills

**Take from it:** Use it as the layout for the RM home. Book AUM card with an assets vs liabilities split and delta pills. A 'Next two weeks' card listing upcoming SIP dates, goal reviews and maturities, each with a coloured category pill. A 'Needs review' card whose empty state reads 'You're all caught up'. Each card gets an eyebrow title plus a 'View all' link.

### [Xero](https://mobbin.com/screens/13c4c8b7-213f-4ccc-b6e7-2c07c431dc94) — `A02-xero-overview-tasks.jpg`

Business Overview: Tasks card (count + label + chevron rows), invoices-owed and bills stacked bar charts with two big figures each, recent payments mini-table, cash in/out bars

**Take from it:** Build the RM 'Today' list in this format: '6  Customers with idle cash > 1L', '3  KYC re-verification due', '2  Suitability refusals to review' (the hash-chained audit records), each row linking to a filtered book view. For charts, draw grey bars and use dark only for the series that needs action (e.g. overdue reviews).

### [Adaline](https://mobbin.com/screens/4ff7d2c3-8b4a-4740-b543-8d964db2704b) — `A03-adaline-kpi-small-multiples.jpg`

Project monitor: oversized period selector ('24 hrs'), KPI header grid with up/down arrows, then a 2-column grid of small-multiple area charts each titled with its live value

**Take from it:** For the 'Book growth' analytics section, use small multiples instead of one crowded chart: AUM, net inflows, SIP book, active customers, goal on-track %, Uday sessions. Each chart is titled with its current value and a delta arrow, all share one x-axis, and all use one IDBI green fill at low opacity. Put a large period switcher ('30 days') at the top left.

### [Attio](https://mobbin.com/screens/2cec0848-cd58-49a5-b528-9eaef81a95f6) — `A04-attio-contacts-table.jpg`

Contacts list: dense spreadsheet-style table with avatar + name, email chips, company chips with logos, last-contact column, Status column with coloured dot labels (Negotiation, In Progress, New Lead, Closed-Won), saved-view dropdown, Sort/Filter, count + 'Add calculation' footer

**Take from it:** Use it as the base for the customer book table. Columns: avatar + name, segment chip, an AUM cell with a sparkline, risk profile, goal-health dot ('On track' / 'At risk' / 'Off track'), last Uday interaction ('3 hours ago'), next action. Add a saved-view dropdown ('All customers', 'HNI', 'Idle cash'), and footer aggregates such as count, Σ AUM and avg returns.

### [Semrush](https://mobbin.com/screens/c2ea4534-58e7-49c8-8405-eb3ddf3e9a4d) — `A05-semrush-segment-tabs-sparkline-table.jpg`

Topics & Sources: KPI tab strip across the top (each tab = label + count, selected one tinted), sub-filter pills with counts, then a sortable table with an inline area-sparkline column, numeric columns and a stacked multi-colour 'Intent' bar per row

**Take from it:** Turn the top tab strip into segment selectors with counts: 'All 142', 'HNI 18', 'At risk 9', 'Idle cash 23', 'New this month 6'. In each row, show a 90-day AUM sparkline and a thin stacked bar for allocation (equity/debt/gold/cash), so the RM can spot an over-concentrated customer without opening the profile. Tint the sorted column header. Drop Semrush's bright blue buttons.

### [Mercury](https://mobbin.com/screens/38664478-d88e-4575-a0b0-78ec6c218ce9) — `A06-mercury-summary-band-table.jpg`

Transactions: summary band above the table: net change this month (with vs last month, money in/out legend), cumulative area chart, and a grouped 'To/From' bar chart with hover tooltip; then filter row (Data Views, Filters, Date, Keywords, Amount) and a dense ledger table

**Take from it:** Put a summary band at the top of the Book page: 'Book AUM ₹48.2 Cr, +₹1.3 Cr vs last month' with an inflow/outflow legend, a cumulative AUM area chart, and a bar chart by segment, all recomputing when the RM filters the table below. Show paise and decimals as superscripts. Copy the dark tooltip style exactly.

### [Copilot Money](https://mobbin.com/screens/5a4565a3-f085-4353-9d15-02ea3778b5cd) — `A07-copilotmoney-investments-allocation.jpg`

Investments: performance vs benchmark dual-line chart with two headline % values, 'Your top movers for today' horizontal sparkline cards with delta pills, grouped accounts list with 1W balance change, right detail rail with mini chart, Allocations bars (by percentage) and Holdings with delta pills

**Take from it:** For the Portfolio/AUM view: put 'Book return vs Nifty 50' at the top as two lines with the headline % for each. Below it, a 'Top movers in your book' sparkline-card row showing the customers with the biggest AUM change this week, each with a delta pill. Then the customer list. Clicking a customer opens a rail with a mini AUM chart, asset-class allocation bars by %, and top holdings.

### [YNAB](https://mobbin.com/screens/3c933417-3b9b-47f0-98c9-86699dcbe294) — `A08-ynab-allocation-donut-ranked-bars.jpg`

Spending Breakdown: large donut with total in centre and direct callout labels per slice (name, amount, %), Categories/Groups segmented toggle, right rail ranked list with coloured progress bars and %, stats footer (average monthly, most frequent, largest outflow)

**Take from it:** Use this structure for book-level asset allocation: a donut with 'Total AUM ₹48.2 Cr' in the centre and direct labels (Equity MF 52%, Debt 21%, FD 14%, Gold 8%, Cash 5%), plus a toggle for 'Asset class / Product / Risk bucket'. Next to it, a ranked bar list. Below, a stats strip: avg ticket size, most-held fund, largest outflow. Re-colour with a muted green-to-neutral ramp.

### [Monarch](https://mobbin.com/screens/4c3dcc4f-3cf7-4e02-a973-099061b3c3db) — `A09-monarch-accounts-aum-summary.jpg`

Accounts: net-worth line/area chart with headline value + green 1-month change, grouped collapsible account sections (Cash, Investments) each with group total and change, right Summary card with Totals/Percent toggle and a single stacked assets bar

**Take from it:** Use grouped, collapsible sections with subtotals and a '1 month change' delta. Group the book by segment (HNI / Affluent / Mass) or by product (MF / FD / Insurance / Loans), with the AUM trend chart above. Copy the Summary rail: one stacked bar for the book's mix with a Totals/Percent toggle and a 'Download CSV' link. Branch heads will want that export.

## Customer page, AI and sign-in

For the RM console, borrow Attio and Lightfield's three-zone record layout: a compact header, tabs, a timeline down the centre and a typed attribute rail on the right. Draw it in Clay and Origin's restrained palette, mostly neutral, with IDBI green only for status, deltas and the primary action. Build the data viz the Copilot Money and Origin way: thin lines with dotted benchmarks and projections, legends that double as KPIs, range pills, horizontal allocation bars instead of donuts, and tabular numbers in small rounded delta chips. Put AI where the work happens. That means a dated, regenerable 'Uday summary' card (HubSpot), a 'Why this was suggested' explanation on every next action and suitability refusal (Lightfield), and a copilot scoped to one customer that returns cited briefs rather than chat text (Rox). Use letter-spaced small-caps section labels with a serif reserved for login and hero moments to give it a private-bank calm. Make it dense but quiet: hairline dividers instead of heavy cards, and no shadows except on popovers.

### [Attio](https://mobbin.com/screens/d76ba56f-98c3-463f-9e1d-bbe4831ee47a) — `B01-attio-record-activity-timeline.jpg`

Company record page: Activity tab with grouped timeline (attribute diffs like Stage -> Meeting, Owner, close confidence stars), tab strip (Activity/Emails/Team/Notes/Tasks/Files), right Details + Lists panel

**Take from it:** Use the three-zone layout as the RM customer page: header, tabs (Journey / Portfolio / Goals / Advice log / Documents), timeline centre, and a profile rail on the right (risk profile, KYC, segment, RM, last contact). Copy the collapsible 'X changed Stage and 7 other attributes' event so a risk-profile or goal change shows as a before -> after diff.

### [HubSpot](https://mobbin.com/screens/f93e89bd-1b63-4d1d-92d6-9753e9f4c8ba) — `B02-hubspot-contact-ai-record-summary.jpg`

Contact record Overview tab: left 'About this contact' column with quick-action icons, centre Data highlights row and Recent activities feed, right 'Breeze record summary' AI card with Generated date, refresh, thumbs and 'Ask a question'

**Take from it:** Add an 'Uday summary' card at the top of the right rail: 4-5 sentences on the customer's recent journey, a generated-at timestamp, regenerate, thumbs, and an 'Ask Uday about this customer' chip that opens the copilot. Add a 3-4 cell highlights strip under the header: Onboarded, Lifecycle stage, Last app session, Next review.

### [Lightfield](https://mobbin.com/screens/20d23a30-3f9a-45c3-89fe-6ccb534f3b25) — `B03-lightfield-account-ai-summary-why-suggested.jpg`

Account Overview: Suggested tasks box with Accept/Dismiss all, 'Why this was suggested' popover (reason, source email, date suggested), AI Account summary paragraph, activity log, docked 'Ask Lightfield' input, right Account details rail

**Take from it:** Map this onto the suitability engine. Show 'Suggested next actions' (e.g. 'Discuss SIP top-up', 'Review insurance gap'). Each gets a 'Why?' popover citing the rule or insight, the data source and the date, and refused products appear with the rule ID and audit hash. Dock an 'Ask Uday' composer at the bottom of the centre column.

### [Clay](https://mobbin.com/screens/c07d9c2d-69c0-43ab-97c6-a609297e16f5) — `B04-clay-relationship-strength-timeline.jpg`

Dark People home: today/yesterday feed on the left, person panel on the right with Network strength HIGH badge, mini timeline (met / emailed / imported), Properties, and a one-sentence Sources summary ('You last chatted with Alex 2 weeks ago... 70 meetings')

**Take from it:** Add a 'Relationship strength' badge (High / Medium / At risk) computed from app engagement plus RM touchpoints, with a sentence under it like 'Last spoke 12 days ago via call; 6 Uday sessions this month; 2 goals on track.' Use small-caps section labels and this compact mini-timeline style in the right rail.

### [Copilot Money](https://mobbin.com/screens/f2ccaef0-8c6c-4560-9153-a513e15da099) — `B05-copilotmoney-networth-allocations-holdings.jpg`

Accounts: Assets vs Debts dual-line chart with 1W-ALL range pills, grouped account list (Depository / Investments / Loans) with % change pills, right panel for the selected account showing a sparkline, Allocations bars and a Holdings table with red/green change chips

**Take from it:** For the Portfolio tab, use an assets vs liabilities chart (net worth = gap) with range pills, holdings grouped by type (Savings / FDs / Mutual funds / Loans) with delta chips, and a click-to-open right panel per holding. Use horizontal allocation bars (Equity / Debt / Gold / Cash) against the customer's suitable target band.

### [Origin](https://mobbin.com/screens/61bcb749-be67-42ae-8966-a231eaf49ed5) — `B06-origin-networth-forecast-ai-summary.jpg`

Forecast: net worth projection to age 90 with milestone markers on the line, explanatory tooltip card ('Social security benefits... age 62 in 2057'), Net Worth / Cash Flow / Success % toggles, AI 'Summary' strip under the chart, Exploration and Compare scenarios below

**Take from it:** For the Goals/Roadmap view, plot the customer's projected corpus by age with goal markers (child education 2034, home 2030, retirement 60) and a tooltip showing goal amount, funded % and SIP needed. Under every major chart, add a one-line 'Uday insight' strip (e.g. 'Retirement is 18% underfunded; the main driver is the low equity allocation for age').

### [Origin](https://mobbin.com/screens/3a516cce-bf0f-4eb8-90d7-1625e5d49c32) — `B07-origin-portfolio-vs-benchmark.jpg`

Invest overview: portfolio performance line vs S&P 500 dotted benchmark, legend doubling as a KPI row (Portfolio +4.25%, S&P 500 -1.39%, Stocks, Int. Stocks, Bonds), hover tooltip comparing both, range pills, Holdings with Top movers sparklines

**Take from it:** Build the growth chart for each customer and for the RM's whole book this way: customer portfolio vs Nifty 50 / FD-rate benchmark (dotted), with legend-as-KPI (XIRR, benchmark, equity, debt, gold). Reuse the Top movers mini-sparkline rows for 'Customers with biggest change this month' on the RM home.

### [Rox](https://mobbin.com/screens/b352f022-e416-4a9d-af25-09ada9e5a884) — `B08-rox-ai-account-report-copilot.jpg`

Account Report: left AI chat ('Thought for 33s', generated artifact card, warm-tinted Suggested actions, 'Ask about the selected account' composer with account scope chip), right generated report with tag pills, 4 KPI tiles with footnote citations [1][2][3], and a Revenue Growth bar chart

**Take from it:** Build the RM copilot as a split view. Left: Uday chat scoped by a customer chip ('Ask about Priya Sharma'), with suggested actions like 'Prep me for my review meeting', 'Which goals are off track?' and 'Draft a WhatsApp nudge'. Right: a generated 'Review brief' with KPI tiles, each footnoted to its source (snapshot, goal engine, suitability rule, audit record).

### [Origin](https://mobbin.com/screens/78f8e79a-9f51-48e8-a2dd-46990e75a959) — `B09-origin-login-split.jpg`

Sign-in: left card with serif 'Welcome back', Apple/Google buttons, 'SSO through employer', email + password, black Sign in button, build hash; right panel with starry-sky photo, serif tagline 'Track spend, ask anything. Own your wealth.', laurel 100K+ members badge and a frosted-glass spending chart card

**Take from it:** For the RM login: a left card with 'Sign in with IDBI SSO' as the primary button, employee ID + password as the fallback, and a small build/version stamp. The right panel is a deep IDBI green with a serif line ('Every customer, every goal, one view.') and a frosted card previewing a book-growth sparkline.
