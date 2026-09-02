/**
 * The action vocabulary — fixed, and closed.
 *
 * A model may never emit an action outside this list. That is the difference between an advisor
 * that proposes things the bank can actually do and a chatbot that invents products; and it is
 * what makes an audit trail possible, because every row has a known shape.
 *
 * Notably absent: anything resembling `cover_bill`. Cleo can front a customer money before an
 * overdraft. That is lending, and we are not doing it.
 *
 * See `docs/product/decisions.md` §A2 for why each one is here.
 */
export type ActionKind =
  /** IDBI's own. The zero-risk answer to idle cash — no lock-in, no risk profile, no new KYC. */
  | 'open_sweep_in'
  /** IDBI's own recurring deposit. The right first product for a Conservative customer. */
  | 'start_ssp'
  | 'move_to_liquid_fund'
  | 'start_sip'
  | 'increase_sip'
  /** An advisor who cannot say "stop for two months" is not an advisor. */
  | 'pause_sip'
  | 'buy_term_cover'
  /** ₹436 a year when term cover is unaffordable. Pays the bank nothing, which is the point. */
  | 'enrol_pmjjby'
  | 'buy_health_cover'
  | 'pay_down_card'
  /** Behavioural. Directly grows the surplus. */
  | 'cancel_subscription'
  /** Behavioural. The daily loop's only real lever. */
  | 'set_category_cap'
  /** The escape hatch that keeps the whole thing defensible. */
  | 'talk_to_rm'

/** Whether an action moves money, changes a limit, or is something the customer does. */
export const ACTION_EFFECT: Record<ActionKind, 'money' | 'limit' | 'behaviour' | 'referral'> = {
  open_sweep_in: 'money',
  start_ssp: 'money',
  move_to_liquid_fund: 'money',
  start_sip: 'money',
  increase_sip: 'money',
  pause_sip: 'money',
  buy_term_cover: 'money',
  enrol_pmjjby: 'money',
  buy_health_cover: 'money',
  pay_down_card: 'money',
  cancel_subscription: 'behaviour',
  set_category_cap: 'limit',
  talk_to_rm: 'referral',
}

export interface Action {
  id: string
  kind: ActionKind
  /** The button. Short, imperative, and specific about the amount. */
  label: string
  /** One line of what happens if they tap it. */
  detail: string
  /** Monthly rupees, or the one-off amount for a transfer. Zero for behavioural actions. */
  amount: number
  productId?: string
  productName?: string
  /**
   * The transactions or facts behind this. "Why this?" is answerable on every recommendation,
   * and it is answered with evidence rather than a restatement.
   */
  evidence: string[]
  /**
   * What the deterministic gate said. Null for behavioural actions, which recommend no product
   * and therefore have nothing to be suitable or unsuitable *for*.
   */
  verdictId?: string | null
  /**
   * Never presented as certain. A long-horizon action carries what the money becomes under the
   * assumed rate, always with the rate stated.
   */
  projected?: { years: number; ratePct: number; becomes: number }
}

/** What the customer did with a proposal. The feedback that changes the next roadmap. */
export type DecisionKind = 'did_it' | 'declined' | 'deferred' | 'pushed_back'

export interface Decision {
  actionId: string
  kind: DecisionKind
  /** Their words, where they gave any. This is what memory should actually remember. */
  note?: string
  at: string
}
