/**
 * Narrations are written for reconciliation, not for people. These helpers turn one into a name.
 */

/** `UPI/SWIGGY/412683940281` reads as "Swiggy" to a person. */
export function prettyMerchant(narration: string): string {
  const parts = narration
    .split(/[/-]/)
    .map((p) => p.trim())
    .filter(Boolean)
  const named = parts.find(
    (p) =>
      p.length > 2 &&
      !/^\d+$/.test(p) &&
      !['UPI', 'POS', 'NEFT', 'IMPS', 'ACH', 'D', 'CR', 'SI', 'ATW', 'P2A'].includes(p),
  )
  const raw = named ?? parts[0] ?? narration
  return raw
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
