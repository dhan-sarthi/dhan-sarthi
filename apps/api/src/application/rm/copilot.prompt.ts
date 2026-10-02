/**
 * What the copilot's model is told: who it is writing for, what it may use, and the shape its
 * answer must come back in.
 *
 * The same division as the customer's text tier (`conversation.prompt.ts`): code owns the
 * numbers and the verdicts, the model owns the words. Here the reader is a relationship manager
 * rather than the customer, so the voice is a colleague's and the customer is "Karan", never
 * "you". The material is the numbered facts and nothing else, and the shape — one sentence a
 * line, each ending with the ids it rests on — is what lets `copilot.guard.ts` check every
 * sentence before the RM reads it. The rules below ask; the guard enforces.
 */
import type { AskTurn, Fact } from '@dhan/contracts'
import type { ChatMessage } from '../../ports/index.ts'
import { dated } from './copilot.facts.ts'

/** Prior turns that travel with a question: three exchanges, as the customer's chat keeps. */
export const COPILOT_HISTORY_TURNS = 6

/** The brief's four parts, in order, as the console titles them. */
export const BRIEF_SECTIONS = [
  'Since the last contact',
  'Talk about',
  'Be careful about',
  'They may ask',
] as const
export type BriefSection = (typeof BRIEF_SECTIONS)[number]

/**
 * A line that is one of the four headings, however the model decorated it ("## Talk about:",
 * "**TALK ABOUT**"), as the console's title; null for any other line.
 */
export function briefHeading(line: string): BriefSection | null {
  const bare = line
    .replace(/[#*_:]/g, '')
    .trim()
    .toLowerCase()
  return BRIEF_SECTIONS.find((s) => s.toLowerCase() === bare) ?? null
}

export interface PromptPeople {
  rmName: string
  customerName: string
  first: string
  asOf: string
}

const RULES = (first: string): string[] => [
  'Rules, in order of who wins:',
  "- Use only the numbered facts. They are the bank's record. What is not in them is not known:",
  '  do not guess it, and do not fill a gap with general knowledge.',
  '- Never calculate. Every figure you write (an amount, a rate, a count, a date, a number of',
  '  months) must appear, written the same way, in a fact the sentence cites. Do not add,',
  '  subtract, round, convert to lakh or crore, or work out a difference or a total.',
  '- Keep each figure to what its fact says it is, beside the same word: the balance a customer',
  '  can reach is not the shortfall, and the cover needed is not the cover held. A sentence that',
  '  gives a figure another meaning is deleted.',
  `- You never decide whether a product suits ${first}; the bank's rules do. Name a product only`,
  '  where a cited fact names it. Never put forward a product a fact says was refused, and never',
  '  put forward an investment while a fact says the rules hold investments back. Report a',
  '  refusal as the fact states it: do not soften it, argue with it or look for a way round it.',
  '- Never promise or predict a return.',
  `- Repeat what ${first} was told only inside quotation marks, word for word.`,
  '- Never use these words: envelope, deployable surplus, DPD, indicative requirement.',
  '- Plain text: no markdown, no bullets, no numbering, no emoji.',
]

const CITE_RULE =
  'End every sentence with the ids of the facts it rests on, in square brackets, like [F2] or ' +
  '[F4, F9]. One sentence per line, under 30 words; never two sentences on one line. A ' +
  'sentence with no ids, an id that does not exist, or a figure its cited facts do not ' +
  'contain is deleted before the RM sees it. A second sentence on a line is split off and ' +
  'shown as its own point.'

function factBlock(people: PromptPeople, facts: readonly Fact[]): string {
  return [
    `FACTS ABOUT ${people.customerName.toUpperCase()}, AS AT ${dated(people.asOf).toUpperCase()}:`,
    ...facts.map((f) => `${f.id}. ${f.text}`),
  ].join('\n')
}

export function briefPrompt(people: PromptPeople, facts: readonly Fact[]): ChatMessage[] {
  const { rmName, customerName, first } = people
  const system = [
    `You are briefing ${rmName}, a relationship manager at IDBI Bank, before a conversation with`,
    `${customerName}, a customer in their book. Write the way one colleague briefs another before`,
    'a meeting: short sentences, plain words, nothing an RM would not say out loud.',
    `Call the customer ${first}, in the third person, by name rather than "he" or "she". Uday is`,
    `the bank's digital advisor.`,
    '',
    ...RULES(first),
    '',
    'Write four parts, in this order, each under its heading on a line of its own, exactly:',
    ...BRIEF_SECTIONS.map((s) => s.toUpperCase()),
    'Under each heading write two or three sentences.',
    CITE_RULE,
    '',
    'What each part is for:',
    `- Since the last contact: what has happened since the RM last spoke to ${first} (requests,`,
    '  decisions, refusals, what the statement shows), or, where no contact is on record, what is',
    '  new on the record.',
    '- Talk about: the two or three things worth raising. The facts that open "Urgent:",',
    '  "Important:" or "Opportunity:" are the signals, listed in the order the bank ranks them.',
    '  Write about them in that order, one point per sentence that stands on its own. Do not write',
    '  "Urgent", "Important" or "Opportunity" yourself, and do not number or sequence the points',
    '  ("first", "next"): the console orders them by that ranking and adds the tag.',
    '- Be careful about: what not to offer and why, any refusal and the words the customer heard,',
    '  and anything that would make advice wrong.',
    `- They may ask: questions ${first} is likely to raise, each with the short answer the facts give.`,
  ].join('\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${factBlock(people, facts)}\n\nWrite the brief.` },
  ]
}

export interface AskPromptInput {
  people: PromptPeople
  facts: readonly Fact[]
  question: string
  history: readonly AskTurn[]
  /** The id of the line holding a suitability check the question triggered, if it did. */
  verdictFact: string | null
}

export function askPrompt(input: AskPromptInput): ChatMessage[] {
  const { people, facts, question, history, verdictFact } = input
  const { rmName, customerName, first } = people
  const system = [
    `You are answering ${rmName}, a relationship manager at IDBI Bank, about ${customerName}, a`,
    'customer in their book. Answer the way a colleague who has the file open would: direct,',
    `short, plain words. Call the customer ${first}, in the third person, by name rather than "he"`,
    'or "she".',
    '',
    ...RULES(first),
    '',
    'Answer in one to three sentences.',
    CITE_RULE,
    'Where the facts do not answer the question, say so in one sentence, then say what the record',
    'does show that comes closest, citing it.',
    '',
    factBlock(people, facts),
  ].join('\n')

  const material = [
    `QUESTION: ${question}`,
    ...(verdictFact === null
      ? []
      : [
          '',
          `The question names a product, and the bank's suitability rules were run on it just now: ${verdictFact}.`,
          `State that outcome first, citing ${verdictFact}, exactly as it is. You may explain it from`,
          'the other facts. You may not soften it, argue with it or go beyond it.',
        ]),
  ].join('\n')

  const prior: ChatMessage[] = history
    .slice(-COPILOT_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.text }))

  return [{ role: 'system', content: system }, ...prior, { role: 'user', content: material }]
}
