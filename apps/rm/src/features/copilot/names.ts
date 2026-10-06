/**
 * How the copilot names a customer: by first name, as an RM does on a call ("Karan's card"), and
 * never "he" or "she", which the record cannot vouch for.
 */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/** "Karan" → "Karan’s". */
export function possessive(name: string): string {
  return `${name}’s`
}

/**
 * "at 6:58 am" for a brief written today, "on 1 Oct at 6:58 am" for one written earlier, to follow
 * "Written". A real instant in the RM's own time zone: it says when the words were written, not
 * the record's date.
 */
export function writtenAt(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  if (at.toDateString() === now.toDateString()) return `at ${time}`
  const day = at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `on ${day} at ${time}`
}
