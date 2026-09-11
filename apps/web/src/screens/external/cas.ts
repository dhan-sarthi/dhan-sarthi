/**
 * The consolidated account statement this app can actually produce.
 *
 * A CAS is what an Indian investor gets from MF Central, CAMS or KFintech: every mutual-fund
 * folio they hold, across every fund house, in one statement. SmartWealth's flow pulls one with
 * an OTP consent and folds the folios into the portfolio, and `07-DECISIONS.md` §5 puts that
 * flow back in scope — with one condition that shapes this whole file:
 *
 * > A screen may be driven by demo data, but it may never *claim* the data is real.
 *
 * **There is no MF Central integration here and there is not going to be one.** So the statement
 * below is a fixture: four folios, fixed, shipped with the app, the same for every customer and
 * every run. Every screen in `screens/external/**` says so, in the register `Clock` and
 * `invest/VerifyOtp` already set — a labelled strip that names the thing that did not happen,
 * rather than a disclaimer nobody reads.
 *
 * ## What is a fixture and what is not
 *
 * Only the *fetch* is invented. Everything downstream of it is the real machinery:
 *
 * - the consent is a real consent control, and it is not pre-ticked (see `CasConsent`);
 * - the import is a real `POST /api/v1/holdings` per folio, carrying `heldOutsideIdbi: true`;
 * - once written, the folios are ordinary declared holdings — the Dashboard counts them, the
 *   analytics chart them, the suitability gate reads them before it lets you buy another equity
 *   fund, and `HoldingsSheet` can edit or delete any of them.
 *
 * That is the honest shape of "the flow is real, the fetch is a fixture": nothing here pretends a
 * statement arrived, and everything that happens after one would have arrived is exactly what
 * would happen.
 *
 * ## Why the fund names are generic
 *
 * The reference's folios are `HDFC Retirement Savings Fund Equity Plan`, `ICICI Prudential
 * Smallcap…`, `Kotak Emerging Equity…` — real schemes from real fund houses, used as filler.
 * Printing a named competitor's scheme, with a valuation and a gain, inside a bank's app is a
 * claim about a product this app has never priced. These are category names instead: they carry
 * the same information (what kind of thing it is, what it is worth, what it cost) with nothing
 * to mistake for a quote.
 *
 * ## What a folio carries that a holding cannot
 *
 * `HoldingSchema` has no folio number and no fund house, so neither survives the import. They are
 * shown on the statement screens — a statement without folio numbers is not a statement — and
 * they stop at the write, which is why the imported row is matched back by name.
 */

/** One line of the statement. Values are rupees, as recorded, never a live NAV. */
export interface CasFolio {
  /** The folio number as a registrar prints it. Display only — nothing stores it. */
  folio: string
  /** The registrar the folio sits with. Display only, for the same reason. */
  registrar: string
  name: string
  assetClass: 'Equity' | 'Debt' | 'Gold'
  /** What went in, across every instalment. */
  invested: number
  /** What the statement values it at. */
  value: number
  /** 0 where no mandate is running against the folio. */
  sipMonthly: number
  sipDay: number | null
}

/**
 * The fixture statement. Four folios, two fund houses' worth of registrars, three asset classes
 * — enough for the donut on the payoff screen to have something to say, and small enough that a
 * reviewer can check every number on it against the total.
 */
export const CAS_FOLIOS: readonly CasFolio[] = [
  {
    folio: '40284/75828',
    registrar: 'CAMS',
    name: 'Nifty 50 Index Fund — Direct Growth',
    assetClass: 'Equity',
    invested: 180_000,
    value: 236_400,
    sipMonthly: 5_000,
    sipDay: 5,
  },
  {
    folio: '70284/75893',
    registrar: 'KFintech',
    name: 'Flexi Cap Fund — Regular Growth',
    assetClass: 'Equity',
    invested: 120_000,
    value: 141_750,
    sipMonthly: 0,
    sipDay: null,
  },
  {
    folio: '90284/75801',
    registrar: 'CAMS',
    name: 'Corporate Bond Fund — Direct Growth',
    assetClass: 'Debt',
    invested: 90_000,
    value: 98_460,
    sipMonthly: 0,
    sipDay: null,
  },
  {
    folio: '10284/75774',
    registrar: 'KFintech',
    name: 'Gold Savings Fund — Direct Growth',
    assetClass: 'Gold',
    invested: 40_000,
    value: 52_180,
    sipMonthly: 2_000,
    sipDay: 12,
  },
]

export const casTotal = (folios: readonly CasFolio[]): number =>
  folios.reduce((n, f) => n + f.value, 0)

export const casInvested = (folios: readonly CasFolio[]): number =>
  folios.reduce((n, f) => n + f.invested, 0)

/** Six digits from the platform CSPRNG, the way `invest/Invest.tsx` mints the order code. */
export function mintCode(): string {
  const [n = 0] = crypto.getRandomValues(new Uint32Array(1))
  return String(n % 1_000_000).padStart(6, '0')
}
