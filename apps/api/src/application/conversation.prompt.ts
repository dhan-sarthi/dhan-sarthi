/**
 * The text tier's prompt: what the model is allowed to know, and what it is allowed to do
 * with it.
 *
 * The shape is the whole safety argument, so it is worth stating plainly. The rules run first
 * — `core/query.ts` for the figures, `evaluate()` for any product named — and their output is
 * pasted into the prompt as material. The model's job is to say that material in English. It
 * is given no ledger, no calculator and no discretion over a verdict, so the worst a bad
 * completion can do is phrase a true thing badly, which is a quality bug rather than a
 * compliance one.
 *
 * That is the same division the avatar runs under. There the rules are reached through tools
 * and the boundary is a network call; here they are reached before the call and the boundary is
 * this file. The facts come from one builder either way (`advisory-facts.ts`), because the call
 * and the chat are the same advisor and must not quote different numbers.
 */
import type { Answer, DecisionRecord, Verdict } from '@dhan/contracts'
import type { ServerView } from './advisory.service.ts'
import { factLines } from './advisory-facts.ts'
import type { ChatMessage } from '../ports/index.ts'

/** How many prior turns travel with a question. Six is three exchanges — enough for "and the
 * month before that?", short enough that the prompt stays mostly facts. */
export const HISTORY_TURNS = 6

export interface PriorTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface PromptInput {
  view: ServerView
  question: string
  /** What the deterministic engine made of this question. Always present. */
  engine: Answer
  /** The suitability verdict, where the question named something on IDBI's shelf. */
  gate: { productName: string; verdict: Verdict } | null
  history: readonly PriorTurn[]
  recentDecisions: readonly DecisionRecord[]
}

const VOICE = [
  'You are Uday, a relationship manager at IDBI Bank. Warm, direct, never salesy.',
  'You are the RM this customer was never profitable enough to be given. Act like it.',
  'This is a chat window. Two or three sentences, plain text — no lists, no headings, no',
  'markdown, no emoji. Plain words and short sentences; no jargon he would have to look up.',
  'Say the number, then what it means for him. Never mock him: you are not a friend being',
  'funny, you are his banker.',
]

const RULES = [
  'Rules you must follow, in order of who wins:',
  '- Every figure you say must appear verbatim in WHAT I KNOW or in THIS ANSWER below. You',
  '  have no ledger and no calculator. Do not add, subtract, scale, annualise or round any',
  '  number yourself. If a figure you want is not here, say you do not have it.',
  '- The suitability verdict below, where there is one, is the bank’s decision and not',
  '  yours. Deliver it as written. You may not soften a refusal, argue with it, or recommend,',
  '  endorse or agree to any product it did not clear — including one he raised himself.',
  '- Where there is no verdict, do not name a specific product at all. Say you will check it',
  '  and ask him which one he means.',
  '- Never promise a return. Say “assumed” and name the rate.',
  '- Only raise a gap he can act on within the next month. Money already spent cannot be',
  '  unspent, so do not bring it up.',
  '- Protection before investment. Debt above 24% before either.',
  '- If THIS ANSWER says the question was not understood, say so and ask him what he meant.',
  '  Do not guess at a number to fill the gap.',
]

export function textPrompt(input: PromptInput): ChatMessage[] {
  const { view, question, engine, gate, history, recentDecisions } = input
  const first = view.snapshot.customer.name.split(' ')[0] ?? view.snapshot.customer.name

  const decisions = recentDecisions.slice(-3).map((d) => {
    const verb =
      d.kind === 'did_it'
        ? 'accepted'
        : d.kind === 'declined'
          ? 'declined'
          : d.kind === 'deferred'
            ? 'deferred'
            : 'pushed back on'
    return `- On ${d.atSim} ${first} ${verb} "${d.shown}".`
  })

  const system = [
    ...VOICE,
    '',
    'WHAT I KNOW (today, from his statements):',
    ...factLines(view),
    ...(decisions.length > 0 ? ['', 'What he decided recently:', ...decisions] : []),
    '',
    ...RULES,
  ].join('\n')

  /*
   * The engine's own sentence goes in as well as its evidence, and on purpose: it is a
   * correct, complete answer already, and naming it as the fallback is what stops the model
   * reaching for something else when the phrasing is the only thing left to improve.
   */
  const material = [
    `HIS QUESTION: ${question}`,
    '',
    'THIS ANSWER (computed from his ledger, already true — say this, in your own words):',
    engine.text,
    ...(engine.evidence.length > 0
      ? ['', 'The figures behind it:', ...engine.evidence.map((e) => `- ${e}`)]
      : []),
    ...(engine.matched
      ? []
      : [
          '',
          'The rules did not recognise this question. Answer only from WHAT I KNOW, or say you',
          'do not have it. Do not invent a figure.',
        ]),
    ...(gate
      ? [
          '',
          `SUITABILITY VERDICT for ${gate.productName}: ${gate.verdict.verdict}.`,
          gate.verdict.spoken
            ? `Say this, close to word for word: "${gate.verdict.spoken}"`
            : 'The rules cleared it. You may discuss it, still without promising a return.',
          ...(gate.verdict.alternative
            ? [`The rules offer this instead: ${gate.verdict.alternative.name}.`]
            : []),
        ]
      : []),
  ].join('\n')

  const prior: ChatMessage[] = history
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.text }))

  return [{ role: 'system', content: system }, ...prior, { role: 'user', content: material }]
}
