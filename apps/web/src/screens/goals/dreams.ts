/**
 * The eight dreams the catalogue offers, and what each one is allowed to mean.
 *
 * SmartWealth's `jar-catalogue` is a grid of goal *types* — Dream Car, Dream Home, Study Abroad,
 * Golden Years, Ideal Wedding, Exotic Vacation, Wealth Creation, and a dashed `Create your own`
 * slot first. That set is kept, one for one, because it is the set an Indian retail customer
 * recognises and because eight tiles is what fills the screen the frames show.
 *
 * **A dream is a name and a picture and nothing else, and every surface that uses one says so.**
 * `PATCH /api/v1/session/goal` takes `targetAmount` and `amountBasis`. It does not take a kind,
 * a purpose or an illustration, and `packages/core` is not this screen's to change — so picking
 * `A car` cannot re-point the plan at a car. What it does is name the target the customer is
 * about to set and give the funnel a picture to carry. `CreateJar`'s footer already prints that
 * sentence for the name and the date; the catalogue prints it before the choice rather than
 * after it, because a screen that looks like it opens a second pot and does not is worse than a
 * screen that opens no pots and admits it.
 *
 * Which is why there is no target amount, no suggested tenure and no "typical cost" on any tile.
 * The reference has none either; had it, they would be numbers this app cannot source.
 */

export interface Dream {
  id: string
  /** The tile label, and the name the create form opens with. Short — it is a jar title. */
  label: string
  /** The illustrated icon in `public/icons`, drawn for a light ground. */
  icon: string
  /**
   * The dashed slot. One only, and it is first, because the reference puts the escape hatch
   * where a customer whose goal is not on the grid will look first rather than last.
   */
  custom?: true
}

export const DREAMS: readonly Dream[] = [
  { id: 'custom', label: 'Something else', icon: 'goal-custom', custom: true },
  { id: 'car', label: 'A car', icon: 'goal-car' },
  { id: 'home', label: 'A home', icon: 'goal-home' },
  { id: 'education', label: 'Study abroad', icon: 'goal-education' },
  { id: 'retirement', label: 'Retirement', icon: 'goal-retirement' },
  { id: 'wedding', label: 'A wedding', icon: 'goal-wedding' },
  { id: 'holiday', label: 'A holiday', icon: 'goal-holiday' },
  { id: 'wealth', label: 'Build wealth', icon: 'goal-wealth' },
]

/** The slot the create funnel falls back to when it was reached without passing the catalogue. */
export const CUSTOM_DREAM: Dream = DREAMS[0] as Dream

/**
 * The picture for a jar the plan built rather than the customer picked.
 *
 * The roadmap's own stages are a buffer, a debt and the goal, and none of them came through the
 * catalogue — so the card needs an icon without a dream behind it. Mapping the stage kind to one
 * of the same eight keeps the list and the funnel drawn from one set instead of leaving the
 * engine's own jars wearing a stroke glyph while the customer's wears an illustration.
 *
 * `grow` takes the wealth gem rather than a goal-specific picture on purpose: the stage is "put
 * money into the market towards the target", and the target's own dream is not on the record.
 */
export const STAGE_ICON: Record<string, string> = {
  build_buffer: 'goal-buffer',
  clear_debt: 'goal-debt',
  grow: 'goal-wealth',
  free_up: 'goal-wealth',
  get_cover: 'goal-buffer',
}

/**
 * Whether the catalogue has anything to say about this goal.
 *
 * A `debt_payoff` target is a balance somebody already owes. It has no dream behind it, no date
 * the customer picks and no name worth choosing — `CreateJar`'s debt branch says all three — so
 * offering `A wedding` as the label for it would be the catalogue's one genuinely misleading
 * outcome: a jar called `A home` above a card explaining that a balance accrues at 34.8%. The
 * funnel skips the grid there and opens the form directly, which is where it opened before.
 *
 * It is the goal *kind* and not the stage kind, because the catalogue names the target the
 * customer is about to set, and that is always the goal.
 */
export function dreamsApplyTo(kind: string): boolean {
  return kind !== 'debt_payoff'
}
