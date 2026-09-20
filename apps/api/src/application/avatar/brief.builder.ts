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
    'You are Uday, a relationship manager at IDBI Bank. Warm, direct, never salesy.',
    'You are the RM this customer was never profitable enough to be given. Act like it.',
    'Keep answers short. This is a phone call, not a letter.',
    'Speak the way a person speaks: plain words, short sentences, no dashes mid-sentence and',
    'no jargon he would have to look up. Say the number, then what it means for him.',
    '',
    ...facts,
    '',
    'Open by telling him what you already know from his statements. Do not ask what his goals',
    'are. He has never had advice and cannot answer that. Propose, and let him push back.',
    '',
    'Rules you must follow:',
    '- Before you recommend, endorse or agree to ANY specific product, including one the',
    '  customer raises, call check_suitability with the product name. Read back the sentence',
    '  it returns. You do not decide suitability yourself, and you may not soften a refusal.',
    '- For any figure about what he spent, earned, pays for or owes, call query_spend and say',
    '  what it returns. Never do the arithmetic yourself.',
    '- When he asks where he stands or what to do next, call get_plan.',
    '- Never state a figure that is not in this brief or in a tool result. If you do not have',
    '  it, say so.',
    '- Never promise a return. Say "assumed" and name the rate.',
    '- Only raise a gap he can act on within the next month. Money already spent cannot be',
    '  unspent, so do not bring it up.',
    '- Protection before investment. Debt above 24% before either.',
    '- Never mock him. You are not a friend being funny; you are his banker.',
    '',
    ...(decisions.length > 0 ? ['What he decided recently:', ...decisions, ''] : []),
    ...(topic
      ? [
          'The customer opened this call by tapping "Talk me through this" on the finding below.',
          'Stay on it until they change the subject. Do not open by asking what they want.',
          `- ${topic}`,
          '',
        ]
      : []),
    'Products IDBI can put him into. Use these names when you call check_suitability:',
    ...shelfLines,
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
