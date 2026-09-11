/**
 * The investment profile, and the questions behind it.
 *
 * ## Three profiles, not the source's five
 *
 * `spec/screens/03-profiling/*` shows a five-stop scale — Risk Averse, Conservative, Moderate,
 * Aggressive, Very Aggressive — visualised three ways. This app cannot ship that scale, and
 * mapping it down would be worse than not shipping it.
 *
 * `RiskProfileSchema` in `@dhan/contracts` is `Conservative | Balanced | Growth`, and it is the
 * only value the suitability gate consumes: `RISK_CEILING` in `packages/core/src/suitability.ts`
 * reads `snapshot.customer.riskProfile` and looks it up in a three-row table. A questionnaire
 * that produced "Very Aggressive" would have to collapse it to `Growth` before the PATCH, so the
 * customer would be shown a distinction the gate cannot act on — five names for three outcomes,
 * two of which change nothing. That is exactly the kind of thing this app exists not to do. So
 * the scale here has three stops, they are the three the gate enforces, and the result screen
 * says so.
 *
 * The second half of that honesty is uncomfortable and is also on screen: of the three, only
 * `Conservative` narrows anything under `RISK_CEILING`. `Balanced` and `Growth` share the ceiling
 * `Very High`, because SEBI's riskometer puts essentially every diversified equity fund there and
 * capping a balanced investor below it would exclude index funds. `PROFILE_CEILING`'s own comment
 * in `suitability.ts` says this. What protects a balanced investor is `VOLATILITY_VS_HORIZON`,
 * which is about time rather than temperament — and the profile screen names that rather than
 * implying a choice does more than it does.
 *
 * `effect` below is the sentence shown to the customer for each profile. `risk.test.ts` proves
 * each one against the live gate rather than against a copy of its table, so the day
 * `PROFILE_CEILING` changes, the claim on screen goes red.
 *
 * ## Where the questions came from
 *
 * Two of the six are the source's, verbatim: question 1 and question 6 are the only ones legible
 * in the footage. Question 5 is ~60% occluded and `spec/flows/03-profiling.md` says in terms not
 * to invent the missing words; questions 2, 3 and 4 never appear at all.
 *
 * So four of these are **written for this build**, and every one of them is labelled `authored`
 * on screen — the badge next to the question number says which. They are not reconstructions and
 * they are not presented as observed.
 *
 * They also deliberately measure only two things: temperament and experience. A conventional
 * suitability questionnaire also asks about horizon, income and how much you could afford to
 * lose — this app already knows all three from the ledger and the declared profile, derives them
 * in `packages/core/src/derive.ts`, and enforces them in rules of their own. Asking a customer to
 * re-type facts the app holds, and then trusting the typed answer over the statement, would make
 * the assessment worse.
 */
import type { DeclaredProfileResponse } from '@dhan/contracts'

/** The wire type, taken from the PATCH body rather than restated. */
export type RiskProfile = DeclaredProfileResponse['riskProfile']

/** Ordered, narrowest first. The order the scale and the stepper are drawn in. */
export const PROFILES = ['Conservative', 'Balanced', 'Growth'] as const

export interface ProfileCopy {
  /** What the scale stop is called under the name. Not a second name for the profile. */
  tagline: string
  /** What it means, in the customer's terms. Authored — the source's own copy is mis-wired. */
  body: string
  /** The highest SEBI riskometer band the gate allows. Checked against `evaluate` in the test. */
  ceiling: 'Moderate' | 'Very High'
  /** What choosing it actually changes. Also checked. */
  effect: string
}

/*
 * The descriptions are this build's. `spec/flows/03-profiling.md` flags that the source's
 * `Moderate` card and its `Risk Averse` result carry byte-for-byte the same paragraph — one of
 * them is wired to the wrong profile in the demo build — and instructs that the copy come from a
 * real lookup instead. This is that lookup.
 */
export const PROFILE_COPY: Record<RiskProfile, ProfileCopy> = {
  Conservative: {
    tagline: 'Keep what I have',
    body:
      'Getting the money back matters more than growing it. You would rather earn a little and ' +
      'know the figure than earn more and have to watch it.',
    ceiling: 'Moderate',
    effect:
      'Anything the riskometer rates above Moderate is refused outright — which is most equity ' +
      'funds, including index funds. You will be offered deposits, liquid and debt.',
  },
  Balanced: {
    tagline: 'Grow it, within reason',
    body:
      'You can live with a bad year if the decade is good. You want the money to beat inflation ' +
      'without thinking about it every week.',
    ceiling: 'Very High',
    effect:
      'Nothing on the shelf is refused on risk band alone. What still refuses a fund is the date ' +
      'on your goal: anything that can fall is blocked for a goal less than three years away.',
  },
  Growth: {
    tagline: 'Grow it, and I can wait',
    body:
      'A fall is the price of the return, and you have the time and the spare income to sit ' +
      'through one without selling.',
    ceiling: 'Very High',
    effect:
      'The same ceiling as Balanced — risk band alone refuses nothing. The gate still checks your ' +
      'horizon, your buffer, your debt and what you can afford each month.',
  },
}

/* ---------------------------------------------------------------- Questions */

/** Where a question's wording came from. Shown on screen beside the number. */
export type Source = 'source' | 'authored'

export interface Answer {
  label: string
  /** 0 is the most cautious answer, 3 the least. */
  score: 0 | 1 | 2 | 3
}

export interface Question {
  id: string
  from: Source
  prompt: string
  /** What this one is for. Shown under the options, because a hidden scoring rule is a black box. */
  measures: string
  options: readonly [Answer, Answer, Answer, Answer]
}

export const QUESTIONS: readonly Question[] = [
  {
    id: 'objectives',
    // Verbatim from `spec/screens/03-profiling/02-profile-question.md`, frame 05.
    from: 'source',
    prompt: 'What are your objectives / expectations from investments?',
    measures: 'What you want the money to do.',
    options: [
      { label: 'Preservation of capital', score: 0 },
      { label: 'Returns above deposit rates', score: 1 },
      { label: 'Growth that beats the index tracker', score: 2 },
      { label: 'Maximise returns with suitable products', score: 3 },
    ],
  },
  {
    id: 'drawdown',
    from: 'authored',
    prompt: 'Three months in, this is worth 20% less than you put in. What do you do?',
    measures: 'What you do in a fall, which predicts more than what you say about risk.',
    options: [
      { label: 'Sell it and go back to a deposit', score: 0 },
      { label: 'Move most of it somewhere safer', score: 1 },
      { label: 'Leave it alone and wait', score: 2 },
      { label: 'Put more in at the lower price', score: 3 },
    ],
  },
  {
    id: 'experience',
    from: 'authored',
    prompt: 'Which of these have you put your own money into?',
    measures: 'What you have actually held, not what you have read about.',
    options: [
      { label: 'Nothing yet — this would be the first', score: 0 },
      { label: 'Deposits, PPF or a recurring deposit', score: 1 },
      { label: 'Mutual funds, through a SIP or a lump sum', score: 2 },
      { label: 'Shares I picked myself, or derivatives', score: 3 },
    ],
  },
  {
    id: 'path',
    from: 'authored',
    prompt: 'Two funds averaged the same over ten years. Which would you rather have held?',
    measures: 'Whether the ride matters to you as much as the destination.',
    options: [
      { label: 'About 7% almost every year', score: 0 },
      { label: 'Mostly steady, with the odd flat year', score: 1 },
      { label: 'Swinging between −5% and +18%', score: 2 },
      { label: 'Swinging between −25% and +40%', score: 3 },
    ],
  },
  {
    id: 'stopping',
    from: 'authored',
    prompt: 'What would make you stop a monthly investment?',
    measures: 'How long you would stay in, which is what a SIP depends on.',
    options: [
      { label: 'Any month it is worth less than I put in', score: 0 },
      { label: 'A few months of falling', score: 1 },
      { label: 'A year or more of going nowhere', score: 2 },
      { label: 'Nothing, short of needing the money', score: 3 },
    ],
  },
  {
    id: 'knowledge',
    // Verbatim from `spec/screens/03-profiling/02-profile-question.md`, frame 07.
    from: 'source',
    prompt:
      'What best describes your level of investment knowledge about financial markets and products?',
    measures: 'How much of the above you have seen happen rather than imagined.',
    options: [
      { label: 'Very limited knowledge', score: 0 },
      { label: 'Basic knowledge with some experience', score: 1 },
      { label: 'Good knowledge and some investment experience', score: 2 },
      { label: 'Strong knowledge and experience', score: 3 },
    ],
  },
]

/** The most a full set of answers can score. Derived, so adding a question re-bands correctly. */
export const MAX_SCORE = QUESTIONS.reduce(
  (sum, q) => sum + Math.max(...q.options.map((o) => o.score)),
  0,
)

/** One answer per question: the index of the chosen option, or null while it is unanswered. */
export type Answers = readonly (number | null)[]

export const EMPTY_ANSWERS: Answers = QUESTIONS.map(() => null)

/**
 * The profile a fraction of the maximum score lands on.
 *
 * Thirds, which is the whole rule. Three equal bands over six questions of four options is a
 * scale a compliance reviewer can check by hand, and a weighted one would need a defence this
 * app has no data to write.
 */
export function profileForFraction(fraction: number): RiskProfile {
  if (fraction <= 1 / 3) return 'Conservative'
  if (fraction <= 2 / 3) return 'Balanced'
  return 'Growth'
}

export interface Outcome {
  /** Where the answers so far land. Null until at least one is answered. */
  profile: RiskProfile | null
  answered: number
  score: number
  /** The most the answered questions could have scored. */
  possible: number
  complete: boolean
}

/**
 * Score what has been answered.
 *
 * The running readout is computed over the answered questions only and scaled, rather than
 * treating the unanswered ones as zero. Counting a question nobody has reached yet as
 * "preservation of capital" would show every customer `Conservative` for the first four screens
 * and then jump — which is what the source's demo build appears to do, reading `Conservative` on
 * every frame and `Risk Averse` at the end. The screen labels it as provisional either way.
 */
export function outcomeOf(answers: Answers): Outcome {
  let score = 0
  let possible = 0
  let answered = 0
  QUESTIONS.forEach((q, i) => {
    const choice = answers[i]
    if (choice === null || choice === undefined) return
    const option = q.options[choice]
    if (!option) return
    answered += 1
    score += option.score
    possible += Math.max(...q.options.map((o) => o.score))
  })
  return {
    profile: possible === 0 ? null : profileForFraction(score / possible),
    answered,
    score,
    possible,
    complete: answered === QUESTIONS.length,
  }
}

/** Narrower, wider, or the same. Drives what the result screen says the change will do. */
export function compare(from: RiskProfile, to: RiskProfile): 'narrower' | 'wider' | 'same' {
  const a = PROFILES.indexOf(from)
  const b = PROFILES.indexOf(to)
  if (a === b) return 'same'
  return b < a ? 'narrower' : 'wider'
}
