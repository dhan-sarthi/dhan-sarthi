/**
 * Which products the customer's own plan already names.
 *
 * A separate module from `ShelfList` for a boring reason — Fast Refresh only works on a file
 * that exports components and nothing else — and a useful one: the ribbon is the only judgement
 * a row carries, so what backs it should be one function anybody can read.
 *
 * `Stage.productId` is the roadmap's own answer to "what should this customer do next", computed
 * by the engine over their statements. That is the whole of what `In your plan` may mean.
 */
import type { Roadmap } from '@dhan/contracts'

export function plannedIds(roadmap: Roadmap): ReadonlySet<string> {
  const out = new Set<string>()
  for (const stage of roadmap.stages) if (stage.productId) out.add(stage.productId)
  return out
}
