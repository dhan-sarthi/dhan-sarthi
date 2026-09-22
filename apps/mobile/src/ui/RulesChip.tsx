// The suitability gate's verdict as a chip, worded and coloured one way.
//
// The round-2 review found the same pass in two voices: "All 9 rules passed" on a sage chip on
// Plan, and "Passed all 9" on a lime chip on Record. The gate sheet, where the verdict is
// actually given, says "All 9 rules passed" on lime with a tick. The sheet's words and colour
// win: lime and a tick for a pass, the soft red and the alert mark for a refusal, and a refusal
// names the rule it stopped at by its place in the nine, never by its id.
//
// Plain numbers in rather than a verdict, so the sheet, the record and the plan can all use it
// without this file importing the gate's rule table from the sheet that draws it.
import { Chip } from '~/ui/Chip'

export function rulesLabel({
  blocked,
  of,
  passed,
  at = 0,
}: {
  blocked: boolean
  /** How many rules there are: `RULE_ORDER.length`. */
  of: number
  /** How many it cleared. A pass that cleared them all, or did not say, is "All N". */
  passed?: number
  /** The refusing rule's place in the order, from 1. Zero when the verdict does not name one. */
  at?: number
}): string {
  if (blocked) return at > 0 ? `Not suitable · rule ${at} of ${of}` : 'Not suitable'
  return passed === undefined || passed >= of
    ? `All ${of} rules passed`
    : `${passed} of ${of} rules passed`
}

export function RulesChip({
  className,
  ...verdict
}: Parameters<typeof rulesLabel>[0] & { className?: string }) {
  return (
    <Chip
      tone={verdict.blocked ? 'danger' : 'success'}
      glyph={verdict.blocked ? 'alert' : 'check'}
      {...(className === undefined ? {} : { className })}
    >
      {rulesLabel(verdict)}
    </Chip>
  )
}
