/**
 * Where a projected corpus came from: what was already there, what gets paid in, and what
 * the assumed rate does on top.
 *
 * This lived in the Plan tab's render body, three subtractions deep, and it had been wrong:
 * it netted `existingCorpus` out twice, because `Scenario.contributed` **folds the existing
 * corpus in** and the line that reads it assumed the opposite. `Scenario.contributed`'s own
 * doc — "of which, contributed rather than earned" — invites the wrong reading, and nothing
 * anywhere pinned which it meant, so the arithmetic was silently rewritable in either
 * direction. `contribution.test.ts` pins it against `project()` itself, so a change to that
 * definition fails here rather than on a card a customer is reading.
 *
 * The split is deliberately **not** clamped at zero. The three parts sum to `corpus` by
 * construction, and that identity is the only thing making the card's three rows add up to
 * the headline figure above them. A `Math.max(0, …)` on each part would keep a broken
 * upstream quiet and break the sum instead, which is the failure a reader cannot see.
 */

/** Only the two fields the split needs, so the wire's `Projection` satisfies it unchanged. */
export interface ProjectionBasis {
  /** Anything already invested that keeps compounding alongside the new contributions. */
  existingCorpus: number
}

/** Likewise structural: `@dhan/contracts`' `Scenario` and core's own both satisfy it. */
export interface ScenarioBasis {
  /** Nominal corpus at the horizon. */
  corpus: number
  /** Everything put in — the existing corpus **and** every monthly contribution after it. */
  contributed: number
}

export interface ContributionSplit {
  /** What was already invested on day one. */
  already: number
  /** What the monthly contributions add between now and the horizon. */
  paidIn: number
  /**
   * What the assumed rate earns on both. Negative only where the assumed rate is below
   * zero — in which case saying so is the honest rendering, not something to floor away.
   */
  growth: number
}

/**
 * Split a scenario's corpus three ways. `already + paidIn + growth === corpus`, always.
 */
export function contributionSplit(
  projection: ProjectionBasis,
  scenario: ScenarioBasis,
): ContributionSplit {
  return {
    already: projection.existingCorpus,
    paidIn: scenario.contributed - projection.existingCorpus,
    growth: scenario.corpus - scenario.contributed,
  }
}
