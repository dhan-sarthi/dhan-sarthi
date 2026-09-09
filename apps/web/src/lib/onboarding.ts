/**
 * Whether this browser has been through the first run for a customer.
 *
 * Per cif, not per session: a reviewer who reloads should not be walked through it again, and a
 * reviewer who picks a different customer should. The only thing kept is the fact that it
 * happened — the answers themselves go to the server, because they are the customer's profile
 * and not a browser preference.
 *
 * Storage can throw in a private window or with site data blocked, so both sides swallow: the
 * worst case is seeing the introduction twice, which is a great deal better than a crash.
 */
const KEY = 'dhan.onboarded.v1'

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : []
  } catch {
    return []
  }
}

export function hasOnboarded(cif: string): boolean {
  return read().includes(cif)
}

export function markOnboarded(cif: string): void {
  try {
    const next = [...new Set([...read(), cif])]
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* nothing to do about it and nothing worth saying */
  }
}
