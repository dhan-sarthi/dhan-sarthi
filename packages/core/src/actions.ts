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

export interface Action {
  id: string
  kind: ActionKind
  /** The button. Short, imperative, and specific about the amount. */
  label: string
  /** One line of what happens if they tap it. */
  detail: string
  /** Monthly rupees, or the one-off amount for a transfer. Zero for behavioural actions. */
  amount: number
  /**
   * How `amount` is meant to be read, and the reason this field exists at all.
   *
   * The suitability gate runs twice on a money action: once here, when the action is
   * proposed, and again in the decision route when the customer accepts it. AFFORDABILITY
   * checks a monthly commitment against `surplus.deployable` and a lump sum against the
   * balance, so the two runs only agree if both know which one this is. They did not: the
   * cadence was passed at proposal time and then thrown away, so accepting "move your
   * ₹2,00,000 maturing deposit into a sweep-in" was re-read as "commit ₹2,00,000 a month"
   * and refused every time. The product's own headline recommendation refused itself.
   *
   * Optional, defaulting to `monthly`, which is the stricter of the two: an action written
   * before this field existed keeps exactly the behaviour it had.
   */
  cadence?: 'monthly' | 'lump_sum'
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
