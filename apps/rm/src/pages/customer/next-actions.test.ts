import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Customer360Action, Signal } from '@dhan/contracts'
import {
  pronoun,
  requestReason,
  requestTitle,
  rmActions,
  rmTitle,
  waited,
  type OpenRequest,
} from './next-actions.ts'

/*
 * The literals are the API's own lines for Karan, Sneha and Vikram Nair on a memory boot, so a
 * change to the engine's wording that breaks a figure read here fails this file, not the screen.
 */

const KARAN = { name: 'Karan', gender: 'Male' }
const SNEHA = { name: 'Sneha', gender: 'Female' }

function signal(kind: Signal['kind'], severity: Signal['severity'], title: string): Signal {
  return { kind, severity, title, detail: '', figure: 0, deadlineDays: null, evidence: [] }
}

function action(
  kind: Customer360Action['kind'],
  label: string,
  detail: string,
  amount: number,
  why: Signal | null,
): Customer360Action {
  return {
    id: `2026-09-01:${why?.kind ?? 'human_handoff'}:${kind}`,
    kind,
    label,
    detail,
    amount,
    why: { signal: why, evidence: [], rulesPassed: null, verdict: null },
  }
}

const missed = signal('missed_repayment', 'urgent', '₹30,500 a month in EMIs, a repayment missed')
const card = signal('expensive_debt', 'urgent', 'Card at 34.8% — ₹1.86L outstanding')
const cover = signal('protection_gap', 'important', '₹2.28Cr short on life cover — 2 dependents')
const netflix = signal('price_increase', 'opportunity', '₹1,800 a year more for Netflix')
const subs = signal('subscription_review', 'opportunity', '₹39,132 a year on 7 subscriptions')
const idle = signal('idle_cash', 'opportunity', '₹13.9L idle in savings for 11 months')

test('every action is said to the RM, about the customer, with its figure', () => {
  assert.equal(
    rmTitle(action('talk_to_rm', 'Call them', 'Uday suggests…', 0, missed), KARAN),
    'Call Karan about the missed repayment',
  )
  assert.equal(
    rmTitle(
      action(
        'pay_down_card',
        'Pay ₹22,501 off the card',
        '34.8% interest. Keep this up and it clears in 10 months.',
        22501,
        card,
      ),
      KARAN,
    ),
    'Karan can clear the card in 10 months at ₹22,501 a month',
  )
  assert.equal(
    rmTitle(
      action(
        'buy_term_cover',
        'Take ₹1 crore of cover for ₹985 a month',
        'LIC Term Assurance, ₹1 crore cover. Pure cover — nothing paid back at the end, so it is cheap.',
        985,
        cover,
      ),
      KARAN,
    ),
    'Offer Karan ₹1Cr of term cover at ₹985 a month',
  )
  assert.equal(
    rmTitle(
      action(
        'cancel_subscription',
        'Check their subscriptions',
        'Here is what each one costs a year. They decide which to keep.',
        0,
        netflix,
      ),
      KARAN,
    ),
    'Go through the subscriptions with Karan',
  )
  assert.equal(
    rmTitle(
      action(
        'set_category_cap',
        'Cap Food & dining at ₹41,826 a month',
        'That is what it was three months ago. Change it whenever they like.',
        0,
        null,
      ),
      KARAN,
    ),
    'Karan could cap Food & dining at ₹41,826 a month',
  )
})

test('a figure of a lakh or more is short, as the API writes it in a sentence', () => {
  assert.equal(
    rmTitle(
      action(
        'open_sweep_in',
        'Sweep ₹11,10,510 into a deposit',
        'IDBI Sweep-in Fixed Deposit, about 6.8%. No lock-in — take it out any day.',
        1110510,
        idle,
      ),
      { name: 'Vikram', gender: 'Male' },
    ),
    'Vikram can sweep ₹11.1L of idle cash into a deposit',
  )
})

test('a line whose figure is missing falls back to what the record holds, never a guess', () => {
  assert.equal(
    rmTitle(
      action(
        'pay_down_card',
        'Pay ₹5,000 off the card',
        '42% interest. Every rupee off it beats any investment.',
        5000,
        card,
      ),
      KARAN,
    ),
    'Karan can pay ₹5,000 a month off the card',
  )
  assert.equal(
    rmTitle(action('set_category_cap', 'Something new', '', 0, null), KARAN),
    'Something new',
  )
})

test('the standing offer of a person is not a step for the RM', () => {
  const escape = action(
    'talk_to_rm',
    'Call them',
    'Uday suggests a person handles this one, and the customer has been offered a call.',
    0,
    null,
  )
  assert.equal(rmTitle(escape, SNEHA), null)
  const { actions } = rmActions([escape], [], SNEHA, null)
  assert.deepEqual(actions, [])
})

test('an open request goes first, ahead of every severity, and says how long it waited', () => {
  const request: OpenRequest = {
    id: 'h1',
    requestedOn: '2026-08-29',
    waitingDays: 3,
    reason: 'Card at 34.8% — ₹2.23L outstanding',
  }
  const subsAction = action(
    'cancel_subscription',
    'Check their subscriptions',
    'Here is what each one costs a year.',
    0,
    subs,
  )
  const { actions } = rmActions([subsAction], [subs], SNEHA, request)
  assert.equal(actions[0]?.title, 'Call Sneha back: she asked 3 days ago')
  assert.equal(actions[0]?.asked, true)
  assert.equal(actions[0]?.reason, 'On the file that day: Card at 34.8% — ₹2.23L outstanding')
  assert.equal(actions[1]?.title, 'Go through the subscriptions with Sneha')
  assert.equal(
    requestTitle({ ...request, waitingDays: 0 }, KARAN),
    'Call Karan back: he asked today',
  )
})

test('with a request pinned, the engine’s own call is not a second line', () => {
  const request: OpenRequest = {
    id: 'h2',
    requestedOn: '2026-08-31',
    waitingDays: 1,
    reason: '₹9,800 a month in EMIs, a repayment missed',
  }
  const out = rmActions(
    [action('talk_to_rm', 'Call them', '', 0, missed)],
    [missed],
    { name: 'Imran', gender: 'Male' },
    request,
  )
  assert.deepEqual(
    out.actions.map((a) => a.title),
    ['Call Imran back: he asked yesterday'],
  )
  // Its signal is still answered, by the call: it does not drop to "Also seen".
  assert.deepEqual(out.alsoSeen, [])
})

test('each signal is said once: under its action, or in the list no action answers', () => {
  const actions = [
    action('talk_to_rm', 'Call them', '', 0, missed),
    action('pay_down_card', 'Pay ₹22,501 off the card', 'clears in 10 months.', 22501, card),
    action('cancel_subscription', 'Check their subscriptions', '', 0, netflix),
  ]
  const out = rmActions(actions, [missed, card, cover, netflix, subs], KARAN, null)
  assert.deepEqual(
    out.actions.map((a) => a.reason),
    [missed.title, card.title, netflix.title],
  )
  assert.deepEqual(
    out.alsoSeen.map((s) => s.kind),
    ['protection_gap', 'subscription_review'],
  )
})

test('the reason is read off a journey handoff line, or left out', () => {
  assert.equal(
    requestReason('Card at 34.8% — ₹2.23L outstanding. Open, waiting 3 days.'),
    'Card at 34.8% — ₹2.23L outstanding',
  )
  assert.equal(
    requestReason('₹9,800 a month in EMIs, a repayment missed. Contacted.'),
    '₹9,800 a month in EMIs, a repayment missed',
  )
  assert.equal(requestReason('Something else entirely'), null)
  assert.equal(requestReason(null), null)
})

test('pronouns and waiting time read as a sentence', () => {
  assert.equal(pronoun('Female'), 'she')
  assert.equal(pronoun('Male'), 'he')
  assert.equal(pronoun('Prefer not to say'), 'they')
  assert.equal(waited(1), 'yesterday')
  assert.equal(waited(6), '6 days ago')
})
