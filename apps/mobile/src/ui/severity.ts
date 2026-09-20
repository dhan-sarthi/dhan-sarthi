// How hard a finding pushes, said the same way everywhere it is shown.
//
// Two screens show the same `Insight` list: the Spend tab's carousel, which colours a plate
// behind each card's mark, and Noticed, which words the severity on a chip. They each kept
// their own map, and the maps had drifted — the carousel gave `urgent` a red plate and
// `important` a muted one, while Noticed gave both the identical streak chip. So the ranking
// the engine computed was invisible on the one screen whose entire job is to rank findings
// by what they cost.
//
// One map, both renderings. Typed against the engine's own union so a severity nobody drew
// is a compile error rather than a silent fall-through: the previous version of this table
// carried a `useful` key `findInsights` has never emitted, which is how every `opportunity`
// insight ended up labelled by a `??` instead of by its own severity.
import type { Insight } from '@dhan/contracts'

export type SeverityLook = {
  /** The chip's fill, where the severity is also worded. */
  tone: 'danger' | 'streak' | 'budget'
  /** What that chip says. */
  label: string
  /** The plate behind a mark, where colour is carrying the ranking on its own. */
  plate: string
}

export const SEVERITY: Record<Insight['severity'], SeverityLook> = {
  urgent: { tone: 'danger', label: 'Worth doing now', plate: 'bg-danger-soft' },
  important: { tone: 'streak', label: 'Worth a look', plate: 'bg-streak/35' },
  opportunity: { tone: 'budget', label: 'Noticed', plate: 'bg-budget/50' },
}
