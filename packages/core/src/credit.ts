/**
 * What IDBI can see about how somebody borrows, and what it cannot.
 *
 * Not a credit score, and the type names say so: `conductScore`, on 0–100, from the IDBI file
 * alone. 55% of a bureau's weight has no input in a `CustomerFile` — utilisation needs a limit
 * that does not exist on `Liability` (`types.ts:214-224`) and whose numerator is manufactured
 * anyway (`asof.ts:139`), credit age needs an origination date `generate.ts:1140-1149` drops,
 * enquiries have no field anywhere. A 300–900 figure built from what is left would be the
 * largest violation of this codebase's own rule that a module could contain, and in India it
 * would be a bank rendering its own arithmetic on a licensed bureau's regulated scale.
 *
 * So the gap is *typed*. `blind` is a closed union of the four things a bureau weighs that a
 * bank file cannot see. The unknowns are engine output, not component copy: a fifth blind spot
 * is a compile error in an exhaustive map rather than a silent fall-through, the screen and the
 * avatar cannot drift, and when a bureau pull lands the array shrinks and the UI follows with
 * no edit.
 *
 * `components` exists for the same reason `Evidence` does. The figure sits inside
 * `meta.snapshotHash`, so a bank could be asked to reproduce it — and a composite whose parts
 * are not on the wire is a number nobody can reproduce from the payload. Every weight, every
 * cut-off and every rate below is a citation rather than a preference, in the discipline
 * `packages/fixtures/src/calibration.ts:1-17` sets: if a figure here cannot be traced to a
 * source named beside it, it is a figure we invented.
 *
 * The parameter is structural rather than core's own `Snapshot`, for `networth.ts:7-10`'s
 * reason: the clients read the wire mirror from `@dhan/contracts`, and a cast at the call site
 * would be the definition quietly disagreeing with itself.
 */

/** What a bureau weighs that a bank file cannot see. Typed, so the gap cannot drift into copy. */
export type CreditBlindSpot = 'utilisation' | 'credit_age' | 'enquiries' | 'other_lenders'

/** Every blind spot there is, in the order the screen lists them: by a bureau's own weight. */
export const CREDIT_BLIND_SPOTS: readonly CreditBlindSpot[] = [
  'utilisation',
  'credit_age',
  'enquiries',
  'other_lenders',
]

export type CreditComponentId = 'repayment' | 'cost' | 'load'

export interface CreditComponent {
  id: CreditComponentId
  /** Points this component is worth when its input is readable. */
  weight: number
  /** Points earned. Null where the input is unreadable — never zero, which is a verdict. */
  earned: number | null
}

export interface CreditFacts {
  /**
   * 0–`outOf`, and deliberately never 300–900: a number on the bureau's own scale IS a bureau
   * score in an Indian customer's head whatever the label above it says. Null where there is
   * no borrowing at all on the file, because there is then nothing to judge — which is a real
   * state (Rohan's education loan clears in February 2027) and not an error.
   */
  conductScore: number | null
  /**
   * The denominator, always stated, because it moves. A component whose input is unreadable is
   * dropped from the numerator **and** the denominator rather than quietly costing the customer
   * its weight — `derive.ts:560-572`'s rule for a ratio with an unknown denominator, applied to
   * a composite. Null with the score.
   */
  outOf: number | null
  /**
   * The score was held down by a live delinquency rather than earned at this level. The gate
   * refuses every non-protection product on `dpdStatus > 0` (`suitability.ts:133`), so a figure
   * reading "one thing to tidy" while the gate refuses everything would be two surfaces
   * disagreeing about one customer in front of the person it is about.
   */
  capped: boolean
  /** The working. Present so the figure inside `meta.snapshotHash` is reproducible from the payload. */
  components: readonly CreditComponent[]
  /** The scalar, not the boolean `debt.missedRepayment` collapses it to. Worst across the file. */
  dpdDays: number
  /** Repeated from `DebtFacts` so a client holding only this block can word the cost row. */
  highestRate: number
  /** `debt.monthlyOutgo / income.monthly`. Null where no income is observable in the statement. */
  emiToIncome: number | null
  revolvingBalance: number
  instalmentBalance: number
  liabilityCount: number
  /** Always all four today. It shrinks when a bureau pull lands, and the UI follows. */
  blind: readonly CreditBlindSpot[]
}

/** Only the fields the derivation needs, so `@dhan/contracts`' mirror satisfies it unchanged. */
export interface CreditBasis {
  liabilities: readonly {
    outstandingPrincipal: number
    emiAmount: number
    loanInterestRate: number
    dpdStatus: number
    isRevolving?: boolean
  }[]
  income: { monthly: number }
  debt: { monthlyOutgo: number; highestRate: number }
}

export interface CreditOptions {
  /**
   * The rate at or above which the cost component reads zero. Passed in rather than restated:
   * it is `DeriveOptions.highInterestThreshold` (24), the same number `HIGH_INTEREST_DEBT`
   * refuses on, and two definitions of "expensive" is one too many.
   */
  highInterestThreshold: number
}

/*
 * Everything from here to `INDICATIVE_RATES` is a citation, not a preference — the discipline
 * `packages/fixtures/src/calibration.ts:1-17` sets for every derived figure in this repo.
 * `[convention]` marks a value that is market practice rather than a published rule.
 */

/**
 * 50 · 30 · 20. Repayment is half of it because it is the only component the suitability gate
 * refuses outright on, and the weighting has to agree with the gate or the two surfaces argue.
 * Cost is 30 for the same reason: `HIGH_INTEREST_DEBT` is `RULES[0]` and blocks every
 * non-protection product, so the component must be able to reach zero on its own. Load is 20 —
 * the only one of the three no rule in the book refuses on, so it may shade the figure and may
 * not decide it. Deliberately NOT a bureau's 35/30/25/20: those weights are unpublished
 * aggregator estimates, and borrowing them would claim a model we do not have.
 */
export const CONDUCT_WEIGHTS: Record<CreditComponentId, number> = {
  repayment: 50,
  cost: 30,
  load: 20,
}

/**
 * Days-past-due buckets, from the reporting convention every Indian lender files against —
 * 0, 1–30, 31–60, 61–90, 90+ (RBI's own SMA/NPA classification boundaries). [convention]
 * A bucket table rather than a curve: a bank reports a bucket, and inventing a smooth function
 * over days would be arithmetic nobody upstream performs.
 */
export const DPD_BUCKETS: readonly { maxDays: number; share: number }[] = [
  { maxDays: 0, share: 1 },
  { maxDays: 30, share: 0.4 },
  { maxDays: 60, share: 0.2 },
  { maxDays: 90, share: 0.1 },
  { maxDays: Number.POSITIVE_INFINITY, share: 0 },
]

/**
 * Below `RATE_CLEAN_BELOW` the cost component is full; it ramps to zero at the gate's own
 * high-interest threshold and stays there. 18% is the top of the published personal-loan band
 * for a well-priced Indian borrower (Axis and ICICI both advertise from 9.99%, market band to
 * ~24%), so a loan under it is not what this screen is about. [convention]
 */
export const RATE_CLEAN_BELOW = 18

/**
 * FOIR — the fixed-obligation-to-income ratio Indian lenders underwrite on. Comfortable to
 * about 40%, and 60% is the ceiling past which a file is not lent against. [convention]
 * This is the one component on the screen that is the number a lender actually prices, which
 * is why it earns a place beside two the gate already refuses on.
 */
export const FOIR_CLEAN_BELOW = 0.4
export const FOIR_ZERO_AT = 0.6

/**
 * The band table, in core and nowhere else, so two screens cannot disagree about what 64 means.
 * Every caption is about the customer's file **with IDBI** — "with us", not "on your credit
 * file". Bureau vocabulary attached to an IDBI-only composite is the exact claim this whole
 * module refuses to make, and no disclaimer undoes it.
 *
 * The floors are percentages of whatever the denominator turned out to be, never raw points.
 * `outOf` shrinks when a component could not be read, and a caption compared against a fixed
 * 85 would then undo the shrinking it exists to do: 80 of 80 is a file with nothing wrong in
 * it, and reading it as 80 of 100 captions a customer "One thing to tidy" for a gap in the
 * *bank's* data. `conductBand` takes both halves of the fraction for that reason.
 */
export const CONDUCT_BANDS: readonly { min: number; caption: string }[] = [
  { min: 85, caption: 'Nothing wrong here' },
  { min: 65, caption: 'One thing to tidy' },
  { min: 40, caption: 'This is costing you' },
  { min: 0, caption: 'You are behind with us' },
]

/**
 * The caption for a file with no borrowing on it, which is not a band and must never be read
 * as the bottom one. "You are behind with us" against somebody who owes us nothing would be
 * the module accusing a customer of the single thing its own arithmetic just said it could
 * not see, and that is a worse failure than showing no caption at all.
 */
export const CONDUCT_BAND_NONE = 'Too soon to tell'

/**
 * A live delinquency may not lift the figure into a band whose caption contradicts a gate that
 * is refusing everything. So the cap is the ceiling of the band below "One thing to tidy" — a
 * value read off `CONDUCT_BANDS` rather than chosen, which is the difference between a rule and
 * a magic number.
 *
 * A percentage, not a point count, for `conductBand`'s reason: against an `outOf` of 80 a raw
 * 64 is 80% and lands in the very band the cap exists to keep a delinquent file out of.
 */
export const DELINQUENCY_CAP = 64

/** The cap in points, for one file's denominator. Floored: a cap that rounds up is not a cap. */
export function delinquencyCeiling(outOf: number): number {
  return Math.floor((outOf * DELINQUENCY_CAP) / 100)
}

/**
 * 300–900 for all four CICs, and this is a direction rather than a convention: clause 9(1)(h)
 * of the Reserve Bank of India (Credit Information Reporting) Directions, 2025. The band names
 * are market practice, not an RBI taxonomy — the direction binds the range, not the labels.
 * [convention on the names]
 */
export const BUREAU_BANDS: readonly { min: number; max: number; name: string }[] = [
  { min: 750, max: 900, name: 'Excellent' },
  { min: 650, max: 749, name: 'Good' },
  { min: 550, max: 649, name: 'Fair' },
  { min: 300, max: 549, name: 'Poor' },
]

/**
 * What each band is worth in rupees, from the September 2026 market and IDBI's own captured
 * `rateInfo`. `null` where no product is realistically on offer — and the screen renders that
 * as a dash in the full value style with the label swapped for a sentence, which is Cleo's own
 * verified behaviour and costs no geometry.
 *
 * No credit-card APR by band, deliberately: in India that would be false. Card interest is a
 * near-flat 3.00–3.75% a month whatever the file says; the score decides whether a card is
 * issued and at what limit. `card` carries that sentence instead of a rate, which is the
 * honest Indian insight and the one that connects to the 34.8% this app already argues about.
 */
export interface IndicativeRate {
  band: string
  /** Home loan, salaried. Null where it is not realistically on offer. */
  home: string | null
  /** Car loan, new. Null where it is not realistically on offer. */
  car: string | null
  /** What the band decides about a card, which is never the rate. */
  card: string
}

export const INDICATIVE_RATES: readonly IndicativeRate[] = [
  {
    band: 'Excellent',
    home: '7.10–7.65%',
    car: '8.50–9.50%',
    card: 'A card is yours for the asking, and at the limit you ask for.',
  },
  {
    band: 'Good',
    home: '7.65–9.50%',
    car: '9.50–13.00%',
    card: 'A card, but a smaller limit than you would like.',
  },
  {
    band: 'Fair',
    home: null,
    car: '13.00–16.00%',
    card: 'A card is not certain, and the limit will be small.',
  },
  {
    band: 'Poor',
    home: null,
    car: null,
    card:
      'A card is unlikely. That matters more than the rate: in India a card charges about 3% ' +
      'a month whoever you are, so the score decides whether you get one at all — and a ' +
      'balance left on one is the 34.8% this app refuses to invest around.',
  },
]

/** The caption for a figure, or the null caption where there is nothing to judge. */
export function conductBand(score: number | null, outOf: number | null): string {
  if (score === null || outOf === null || outOf <= 0) return CONDUCT_BAND_NONE
  // Normalised before the lookup, because `outOf` moves. See `CONDUCT_BANDS`.
  const pct = (score / outOf) * 100
  const band = CONDUCT_BANDS.find((b) => pct >= b.min)
  return band ? band.caption : CONDUCT_BAND_NONE
}

/** The bureau band a 300–900 figure falls in. Used only by the simulator, never by the hero. */
export function bureauBand(score: number): string {
  // Ordered high to low, so the first row whose floor the figure clears is its band. A figure
  // below 300 is off the regulated scale entirely and can only have come from a caller that
  // made it up; it reads as the bottom band rather than throwing, because this function's one
  // caller is a picker of four fixed bands and has no arm for an error.
  const band = BUREAU_BANDS.find((b) => score >= b.min) ?? BUREAU_BANDS.at(-1)
  return band ? band.name : 'Poor'
}

/** The indicative rates for one bureau band name. Undefined for a name not in `BUREAU_BANDS`. */
export function ratesForBand(bandName: string): IndicativeRate | undefined {
  return INDICATIVE_RATES.find((r) => r.band === bandName)
}

/** 0..1. The ramps below are linear between two published cut-offs and flat outside them. */
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/**
 * Everything IDBI can say about how somebody borrows, and the typed list of what it cannot.
 * Pure, deterministic, as of the date its caller derived `basis` for. No I/O, no ledger read.
 */
export function creditFacts(basis: CreditBasis, options: CreditOptions): CreditFacts {
  /*
   * Computed before the empty-file return rather than after it, because a customer with no
   * borrowing still has an observable — or unobservable — income, and reporting `emiToIncome`
   * as null there would say "we could not read this" about a ratio we read perfectly well and
   * that is simply zero.
   */
  const emiToIncome =
    basis.income.monthly === 0 ? null : basis.debt.monthlyOutgo / basis.income.monthly

  if (basis.liabilities.length === 0) {
    /*
     * Nothing to judge is a state, not an error, and it is reachable: Rohan's education loan
     * clears in February 2027, so the time machine walks a judge into this arm. The blind
     * spots still ship — a bank that can say nothing about how you borrow still owes you the
     * list of what it would have needed.
     */
    return {
      conductScore: null,
      outOf: null,
      capped: false,
      components: [],
      dpdDays: 0,
      highestRate: 0,
      emiToIncome,
      revolvingBalance: 0,
      instalmentBalance: 0,
      liabilityCount: 0,
      blind: CREDIT_BLIND_SPOTS,
    }
  }

  // Worst across the file, not an average. One account ninety days down is not softened by
  // three that are current, and a lender does not read it that way either.
  const dpdDays = Math.max(...basis.liabilities.map((l) => l.dpdStatus))

  let revolvingBalance = 0
  let instalmentBalance = 0
  for (const l of basis.liabilities) {
    if (l.isRevolving === true) revolvingBalance += l.outstandingPrincipal
    else instalmentBalance += l.outstandingPrincipal
  }

  // The last bucket's ceiling is infinity, so `find` cannot miss — but the compiler cannot know
  // that, and a `!` here would be the one place in this file where an assertion stands in for
  // an argument. Zero is the right share for a file past every bucket anyway.
  const bucket = DPD_BUCKETS.find((b) => dpdDays <= b.maxDays)
  const repayment: CreditComponent = {
    id: 'repayment',
    weight: CONDUCT_WEIGHTS.repayment,
    // Never null: `dpdStatus` is always present on a `Liability` (`asof.ts:143` defaults it),
    // so this is the one component whose input a bank file can never fail to carry.
    earned: CONDUCT_WEIGHTS.repayment * (bucket ? bucket.share : 0),
  }

  /*
   * A rate of zero is not the cheapest money in the world, it is money whose price nobody read.
   * Nothing lends at 0%, and the bank's own adapter says so out loud: when operation 391 returns
   * no terms for an account, `to-domain.ts:497` writes `facts.interestRate ?? 0` and the miss is
   * explicitly anticipated one line above it. Fed to the ramp below, that zero is the single
   * most flattering value it can take — full marks on the one component `HIGH_INTEREST_DEBT`
   * exists to be able to zero out.
   *
   * `every`, not `some`: `highestRate` is a max over the set, so one unread member could be the
   * highest and the max would never know. A partial read is not a read.
   */
  const rateReadable = basis.liabilities.every((l) => l.loanInterestRate > 0)

  const rate = basis.debt.highestRate
  const costShare =
    rate < RATE_CLEAN_BELOW
      ? 1
      : rate >= options.highInterestThreshold
        ? 0
        : (options.highInterestThreshold - rate) /
          (options.highInterestThreshold - RATE_CLEAN_BELOW)
  const cost: CreditComponent = {
    id: 'cost',
    weight: CONDUCT_WEIGHTS.cost,
    earned: rateReadable ? CONDUCT_WEIGHTS.cost * costShare : null,
  }

  /*
   * The same gap on the numerator of the FOIR. `debt.monthlyOutgo` is a sum of `emiAmount`, and
   * `to-domain.ts:496` writes a zero for an instalment it could not read, exactly as it does for
   * the rate — so an unknown EMI is indistinguishable from no EMI, and `clamp01` pays the full
   * 20 to a customer whose obligations were never seen.
   *
   * Revolving credit is the deliberate exception: a card has no instalment to read, so a zero
   * on one is the truth rather than a miss, and requiring an EMI of it would null this component
   * for every customer holding a card.
   */
  const outgoReadable = basis.liabilities.every((l) => l.isRevolving === true || l.emiAmount > 0)

  const load: CreditComponent = {
    id: 'load',
    weight: CONDUCT_WEIGHTS.load,
    /*
     * The only component that can come back unreadable, and the only one that must. Over
     * IDBI's own statement an income is often not observable at all, and a FOIR of zero
     * against an unknown salary would read as a customer with no obligations — the flattering
     * direction, which is the one a bank may never round towards.
     */
    earned:
      emiToIncome === null || !outgoReadable
        ? null
        : CONDUCT_WEIGHTS.load *
          clamp01((FOIR_ZERO_AT - emiToIncome) / (FOIR_ZERO_AT - FOIR_CLEAN_BELOW)),
  }

  /*
   * A null component is carried rather than dropped, and then excluded from both halves of the
   * fraction. Carried, because `components` is the working and a reader reproducing the figure
   * from the payload has to be able to see that load exists, is worth 20, and was unreadable —
   * an absent row and a zero row look identical from outside. Excluded, because weighting an
   * unknown at zero is `derive.ts:560-572`'s exact failure: it charges the customer twenty
   * points for something the bank could not read about them.
   */
  const components: readonly CreditComponent[] = [repayment, cost, load]
  const readable = components.filter((c) => c.earned !== null)
  const outOf = readable.reduce((sum, c) => sum + c.weight, 0)
  const raw = readable.reduce((sum, c) => sum + (c.earned ?? 0), 0)

  const scored = Math.round(raw)
  // Against this file's own denominator, not a notional hundred. `delinquencyCeiling` says why.
  const ceiling = delinquencyCeiling(outOf)
  const capped = dpdDays > 0 && scored > ceiling

  return {
    conductScore: capped ? ceiling : scored,
    outOf,
    capped,
    components,
    dpdDays,
    highestRate: basis.debt.highestRate,
    emiToIncome,
    revolvingBalance,
    instalmentBalance,
    liabilityCount: basis.liabilities.length,
    blind: CREDIT_BLIND_SPOTS,
  }
}
