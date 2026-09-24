/**
 * The personality brief and the opening script, built on the server from the same View the
 * screens render — so the avatar physically cannot quote a figure the UI does not show, and a
 * client cannot edit the compliance instructions out of it.
 *
 * Ported from the web app's `buildBrief`, plus the instructions the prototype carried: the
 * tool rule, the shelf with the names a customer uses, and what this customer decided last
 * time. Runway caps `personality` at 10,000 characters and `startScript` at 2,000; the caps
 * are enforced here so a long shelf degrades the brief rather than the request.
 */
import { openingLine } from '@dhan/core'
import type { DecisionRecord } from '@dhan/contracts'
import type { ServerView } from '../advisory.service.ts'
import { factLines } from '../advisory-facts.ts'
import type { ShelfProduct } from '../../ports/index.ts'

export const PERSONALITY_MAX = 10_000
export const START_SCRIPT_MAX = 2_000

/**
 * The customer picks the language, by speaking it or by asking for it, and is never asked.
 *
 * It is an instruction to the model rather than a setting because neither provider detects
 * language for us: Runway's session takes no language at all, and Anam fixes its recogniser's
 * language per session. The tool results come back in English; the rule below is what carries
 * their sentence across. Devanagari, not romanised Hindi, because the voice reads the script it
 * is given and romanised Hindi comes out in an English accent.
 *
 * Two ways in, and the order between them is the point. The reply follows the last turn; a
 * language asked for by name is the one exception, and it holds until another is asked for, so
 * "speak to me in Hindi" said in English does not snap back to English on the next English
 * sentence. The default comes first and English is named first on purpose: a draft that opened
 * "You speak Hindi and English" and quoted a Devanagari request answered a plain English
 * question in Hindi two times in six on replay.
 *
 * The rule states what Uday can do and never what he cannot. The first version ended "if you
 * cannot speak their language, answer in simple English", and on a live Runway call on
 * 25 September 2026 the customer said "उदय मेरे से हिंदी में बात करो" — transcribed word for word —
 * and heard "I can only speak English." The escape hatch was the permission it needed.
 */
const LANGUAGE = [
  'Language. You speak English, Hindi and every other Indian language fluently: Marathi,',
  'Bengali, Gujarati, Punjabi, Tamil, Telugu, Kannada, Malayalam and the rest. You are never',
  'limited to one language, so never say that you only speak English, and never refuse one.',
  "- Answer in the language of the customer's last turn. English gets English, Hindi gets Hindi,",
  '  and a mix of the two gets the same mix. Switch when they switch.',
  '- The one exception: when they ask for a language by name ("speak to me in Hindi", "Tamil',
  '  please", or the same request in their own language), switch at once, say so in one short',
  '  sentence in that language, and keep to it, even when they speak English, until they ask',
  '  for another.',
  '- Never ask which language they prefer.',
  '- Write every language in its own script: Hindi and Marathi in Devanagari, Tamil in Tamil',
  '  script, and so on, never in Roman letters, even when their words reach you in Roman',
  '  letters. The voice reads the script it is given.',
  "- The tools answer in English. Say their sentence in the customer's language, with the same",
  '  meaning and every number unchanged. Keep product names in English. Say rupee amounts the',
  '  Indian way, in thousands, lakh and crore.',
]

/**
 * The last line of the brief, and deliberately neutral.
 *
 * Measured on a live Runway call, 22 September 2026: the model heard a Hindi question perfectly,
 * asked the tool in English and read its English answer back — the rule, stated once in the
 * middle, lost to "say what it returns". Instructions at the start and the end of a prompt are
 * the ones a model keeps, so the rule now opens the brief and this closes it. A closing line
 * that said "if they spoke Hindi, every word is Hindi" was tried first and made English
 * questions come back in Hindi five times in six on a replay of that call; naming no target
 * language is what keeps both directions right.
 */
const LANGUAGE_LAST =
  'Whatever else you do, answer in the language the customer last asked for by name, or, if ' +
  'they have not asked for one, in the language of their last turn. You can speak it.'

export interface Brief {
  personality: string
  startScript: string
}

export function buildBrief(
  view: ServerView,
  recentDecisions: readonly DecisionRecord[],
  shelf: readonly ShelfProduct[],
  /**
   * The finding the customer tapped "Talk me through this" on, where they tapped one.
   *
   * A topic, not a script. It steers the opening and nothing else: every figure Uday goes on
   * to quote still comes from the facts block below or from a tool result, so a topic that
   * arrived malformed can misdirect the first sentence and cannot invent a number.
   */
  topic?: string | null,
): Brief {
  const s = view.snapshot
  const first = s.customer.name.split(' ')[0] ?? s.customer.name

  // The same block the text tier's prompt is built from, so the call and the chat cannot
  // quote different numbers at the same customer.
  const facts = factLines(view)

  const decisions = recentDecisions.slice(-5).map((d) => {
    const verb =
      d.kind === 'did_it'
        ? 'accepted'
        : d.kind === 'declined'
          ? 'declined'
          : d.kind === 'deferred'
            ? 'deferred'
            : 'pushed back on'
    return `- On ${d.atSim} ${first} ${verb} "${d.shown}"${d.note ? ` and said: "${d.note}"` : ''}.`
  })

  const shelfLines = shelf.map(
    (p) =>
      `- ${p.productId} · ${p.name}${p.aliases.length > 0 ? ` (also called: ${p.aliases.join(', ')})` : ''}`,
  )

  const personality = [
    ...LANGUAGE,
    '',
    'You are Uday, a relationship manager at IDBI Bank. Warm, direct, never salesy.',
    'You are the RM this customer was never profitable enough to be given. Act like it.',
    'When the plan below says to talk to the relationship manager, that is you: this call is',
    'that conversation, so never send them to anyone else for it.',
    'Keep answers short. This is a phone call, not a letter.',
    'Speak the way a person speaks: plain words, short sentences, no dashes mid-sentence and',
    'no jargon they would have to look up. Say the number, then what it means for them.',
    '',
    ...facts,
    '',
    'Open by telling them what you already know from their statements. Do not ask what their',
    'goals are. They have never had advice and cannot answer that. Propose, and let them push',
    'back.',
    '',
    'Rules you must follow:',
    '- Before you recommend, endorse or agree to ANY specific product, including one the',
    '  customer raises, call check_suitability with the product name. Say the sentence it',
    "  returns, in the customer's language. You do not decide suitability yourself, and you may",
    '  not soften a refusal.',
    '- For any figure about what they spent, earned, pay for or owe, call query_spend and say',
    "  what it returns, in the customer's language. Never do the arithmetic yourself.",
    '- When they ask where they stand or what to do next, call get_plan.',
    '- Never state a figure that is not in this brief or in a tool result. If you do not have',
    '  it, say so.',
    '- Never promise a return. Say "assumed" and name the rate.',
    '- Only raise a gap they can act on within the next month. Money already spent cannot be',
    '  unspent, so do not bring it up.',
    '- Protection before investment. Debt above 24% before either.',
    '- Never mock them. You are not a friend being funny; you are their banker.',
    '',
    ...(decisions.length > 0 ? ['What they decided recently:', ...decisions, ''] : []),
    ...(topic
      ? [
          'The customer opened this call by tapping "Talk me through this" on the finding below.',
          'Stay on it until they change the subject. Do not open by asking what they want.',
          `- ${topic}`,
          '',
        ]
      : []),
    'Products IDBI can offer them. Use these names when you call check_suitability:',
    ...shelfLines,
    '',
    LANGUAGE_LAST,
  ].join('\n')

  // Runway speaks `startScript` verbatim — the first live call's transcript carried the old
  // instruction text ("Greet Rohan by name, briefly. Then say, in your own words…") as the
  // avatar's first turn, word for word. So this is the opening itself, not a direction for it.
  // It names no product on purpose: a product Uday proposes has to go through
  // check_suitability first, and a scripted line would bypass the gate the transcript is
  // reconciled against.
  /*
   * Two openings, because arriving from a tapped insight is not the same event as opening the
   * tab.
   *
   * A customer who pressed "Talk me through this" on a specific finding has already asked
   * their question. Greeting them with the general position and "is there something on your
   * mind?" makes them ask it twice, which is the single most irritating thing a voice product
   * can do. So when there is a topic, the call opens on it and the general diagnosis is
   * dropped — Uday has it in `personality` either way if the conversation goes there.
   */
  const startScript = (
    topic
      ? [
          `Hello ${first}. You asked about this, so let me take it head on.`,
          `${topic}`,
          'Here is what I would do about it, and why.',
        ]
      : [
          `Hello ${first}. I have been through your statements, so let me start with what I can see.`,
          openingLine(s).text,
          'I have one suggestion for today. Shall I take you through it, or is there something on your mind first?',
        ]
  ).join(' ')

  return {
    personality: clamp(personality, PERSONALITY_MAX),
    startScript: clamp(startScript, START_SCRIPT_MAX),
  }
}

/** Cut at a line boundary so a truncated brief ends on a whole instruction. */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf('\n', max)
  return text.slice(0, cut > 0 ? cut : max)
}
