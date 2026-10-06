/**
 * Suggested next actions, said to the RM.
 *
 * The engine writes each action to the customer ("Pay ₹22,501 off the card", "Change it whenever
 * you like"), and the API turns its pronouns round, which leaves lines that are still the
 * customer's: "Keep this up and it clears in 10 months", "Here is what each one costs a year".
 * On the RM's desk an action is something the RM does or proposes, about a named customer, with
 * the figure that makes it worth a call. So each line is rebuilt here from the action's own
 * fields (its kind, its amount, the signal behind it), reading the engine's line only for the one
 * figure it alone carries (the months a card takes to clear, a category's cap), and falling back
 * to the API's line, never to a guess, where that figure is not there.
 *
 * Those reads are regular expressions over the engine's English, so they are a stopgap: the
 * structured fields (months, cover amount, product, cap) belong in the contract, and until they
 * are there `next-actions.test.ts` pins every pattern to the line the API sends today and to its
 * fallback, so a rewording fails a test rather than silently changing a title.
 *
 * The signal an action answers is its reason, so it is said once, under the action; the signals
 * no action answers are listed apart, one line each. And the engine's standing offer of a person
 * (the `human_handoff` insight, on every customer's list so a request has an action to be recorded
 * against) is not a step for the RM: an actual open request is, and it goes first.
 *
 * Pure, no React: `next-actions.test.ts` runs it under `node --test`.
 */
import type {
  ActionKind,
  Customer360Action,
  Signal,
  SignalKind,
  SignalSeverity,
} from '@dhan/contracts'
import { rupeesTitle } from '@dhan/core'

/** A customer's open request to talk, as the console knows it. */
export interface OpenRequest {
  /** The handoff id, for marking it contacted or resolved. */
  id: string
  requestedOn: string
  /** Whole days from the request to the as-of date, never negative. */
  waitingDays: number
  /** What was on top of their file the day they asked, in the RM's words; null if unknown. */
  reason: string | null
}

export interface RmAction {
  id: string
  kind: ActionKind | 'open_request'
  /** What to do, said to the RM, with its figure. */
  title: string
  /** Why: the signal it answers, figure first, or what the customer asked about. */
  reason: string | null
  severity: SignalSeverity | null
  /** The customer's own request to talk: pinned first, and marked as theirs. */
  asked: boolean
  /** The action as the API sent it, for its "Why?"; null on an open request. */
  source: Customer360Action | null
}

export interface Who {
  /** First name: "Karan". */
  name: string
  /** As the bank records it: "Male", "Female", or anything else. */
  gender: string
}

/** "she", "he", or "they" where the record says neither. */
export function pronoun(gender: string): 'she' | 'he' | 'they' {
  const g = gender.trim().toLowerCase()
  if (g === 'female' || g === 'f') return 'she'
  if (g === 'male' || g === 'm') return 'he'
  return 'they'
}

/** "today", "yesterday", "3 days ago": how long a request has waited, said in a sentence. */
export function waited(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** What a call about a signal is about, in the words an RM would say on the phone. */
const TOPIC: Record<SignalKind, string> = {
  missed_repayment: 'the missed repayment',
  expensive_debt: 'the card',
  buffer_thin: 'their savings',
  protection_gap: 'life cover',
  idle_cash: 'the idle cash',
  deposit_maturing: 'the maturing deposit',
  emi_ending: 'the loan that is ending',
  subscription_review: 'the subscriptions',
  price_increase: 'the price rise',
  category_drift: 'the spending',
  habit_cost: 'the spending',
}

/** "₹1 crore" or "₹50 lakh", as the engine speaks a cover amount, in the console's short form. */
function spokenToShort(spoken: string): string {
  const crore = /^₹([\d.]+) crore$/.exec(spoken)
  if (crore) return `₹${crore[1]}Cr`
  const lakh = /^₹([\d.]+) lakh$/.exec(spoken)
  if (lakh) return `₹${lakh[1]}L`
  return spoken
}

/**
 * The RM's line for one action, or null where the action is not a step for the RM (the standing
 * offer of a person, which the open request replaces). `rupeesTitle` is the API's own rule for a
 * figure in a sentence, so "₹2.28Cr" here is "₹2.28Cr" in the signal beside it.
 */
export function rmTitle(action: Customer360Action, who: Who): string | null {
  const { name } = who
  const amount = rupeesTitle(action.amount)
  const signal = action.why.signal
  switch (action.kind) {
    case 'talk_to_rm':
      return signal ? `Call ${name} about ${TOPIC[signal.kind]}` : null

    case 'pay_down_card': {
      const months = Number(/clears in (\d+) months?\b/.exec(action.detail)?.[1])
      return Number.isInteger(months) && months > 0
        ? `${name} can clear the card in ${months} month${months === 1 ? '' : 's'} at ${amount} a month`
        : `${name} can pay ${amount} a month off the card`
    }

    case 'buy_term_cover': {
      const cover = /^Take (₹[\d.]+ (?:crore|lakh)) of cover/.exec(action.label)?.[1]
      return cover
        ? `Offer ${name} ${spokenToShort(cover)} of term cover at ${amount} a month`
        : `Offer ${name} term cover at ${amount} a month`
    }

    case 'enrol_pmjjby': {
      const product = /^Enrol in (.+)$/.exec(action.label)?.[1]
      return product ? `Offer ${name} ${product}` : action.label
    }

    case 'open_sweep_in':
      return signal?.kind === 'deposit_maturing' || /^Move /.test(action.label)
        ? `${name} can move ${amount} from the maturing deposit into a sweep-in`
        : `${name} can sweep ${amount} of idle cash into a deposit`

    case 'start_sip':
      return `${name} can start a ${amount} monthly SIP`

    case 'increase_sip':
      return `${name} can add ${amount} a month to the SIP`

    case 'cancel_subscription':
      return `Go through the subscriptions with ${name}`

    case 'set_category_cap': {
      const cap = /^Cap (.+) at (₹[\d,]+) a month$/.exec(action.label)
      return cap ? `${name} could cap ${cap[1]} at ${cap[2]} a month` : action.label
    }

    default:
      // Kinds the daily plan does not build today; the API's line is the honest fallback.
      return action.label
  }
}

/** The open request's line: "Call Sneha back: she asked 3 days ago". */
export function requestTitle(request: OpenRequest, who: Who): string {
  return `Call ${who.name} back: ${pronoun(who.gender)} asked ${waited(request.waitingDays)}`
}

/**
 * The action list as the RM reads it: the open request first, whatever the severities below it,
 * then the engine's actions in the engine's order (less its own "call them", which the request
 * already is). Alongside, every signal no action answers, in the engine's order, so nothing the
 * engine flagged is lost by folding the rest into actions.
 */
export function rmActions(
  actions: readonly Customer360Action[],
  signals: readonly Signal[],
  who: Who,
  request: OpenRequest | null,
): { actions: RmAction[]; alsoSeen: Signal[] } {
  const out: RmAction[] = []
  if (request) {
    out.push({
      id: `request:${request.id}`,
      kind: 'open_request',
      title: requestTitle(request, who),
      // A snapshot from the day they asked, said as one: the queue's reason may have moved since.
      reason: request.reason ? `On the file that day: ${request.reason}` : null,
      severity: null,
      asked: true,
      source: null,
    })
  }
  const answered = new Set<SignalKind>()
  for (const action of actions) {
    const title = rmTitle(action, who)
    if (title === null) continue
    const signal = action.why.signal
    if (signal) answered.add(signal.kind)
    // With a request pinned, the engine's own "call them" is the same call: one line, not two.
    if (request && action.kind === 'talk_to_rm') continue
    out.push({
      id: action.id,
      kind: action.kind,
      title,
      reason: signal ? signal.title : null,
      severity: signal ? signal.severity : null,
      asked: false,
      source: action,
    })
  }
  return { actions: out, alsoSeen: signals.filter((s) => !answered.has(s.kind)) }
}

/**
 * The reason inside a journey's handoff line: "Card at 34.8% — ₹2.23L outstanding. Open, waiting
 * 3 days." → "Card at 34.8% — ₹2.23L outstanding". Null when the line does not end in a status.
 */
export function requestReason(detail: string | null): string | null {
  if (!detail) return null
  const match = /^(.*?)\.\s+(?:Open|Contacted|Resolved)\b[^]*$/.exec(detail)
  return match?.[1]?.trim() || null
}
