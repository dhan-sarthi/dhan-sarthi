/**
 * Figures in the customer file's sentences, by the API's rule.
 *
 * `@dhan/core` prints a rupee figure in a sentence through `rupeesTitle`: exact under a lakh
 * (₹22,501), short from there up (₹1.86L, ₹2.28Cr). Every signal title, queue line and handoff
 * reason the API sends was written with it, so the customer page writes its own sentences with
 * the same function: "₹2.28Cr short on life cover" in Uday's read is then the same string as the
 * signal beside it, not ₹2.3Cr or ₹2,27,70,000.
 *
 * A plan stage's label and reason are the engine's sentences, re-voiced by the API but with every
 * figure in full ("₹2,27,70,000 of cover is missing", "₹11,10,00,000 by September 2042").
 * `shortenFigures` re-prints the figures of a lakh and more in them by the same rule; figures
 * under a lakh, percentages and every other word are left exactly as the engine wrote them. It
 * reads the engine's English, so `prose.test.ts` pins it to the stage lines the API sends today.
 *
 * Pure: `prose.test.ts` runs it under `node --test`.
 */
import { rupees, rupeesShort, rupeesTitle } from '@dhan/core'

export { rupees, rupeesShort, rupeesTitle }

/**
 * "₹2,27,70,000" (Indian grouping, at least a lakh) and nothing smaller. Not part of a longer
 * figure, and not one with paise ("₹1,86,240.50" is left whole rather than read as ₹1.86L.50).
 */
const FULL_FIGURE = /₹(\d{1,2}(?:,\d{2})+,\d{3})(?![\d,]*\d|\.\d)/g

/** "₹2,27,70,000 of cover is missing" → "₹2.28Cr of cover is missing". */
export function shortenFigures(text: string): string {
  return text.replace(FULL_FIGURE, (whole, digits: string) => {
    const value = Number(digits.replace(/,/g, ''))
    return Number.isFinite(value) && value >= 1e5 ? rupeesTitle(value) : whole
  })
}

/** "As at 1 Sep 2026" mid-sentence: "as at 1 Sep 2026". Only the first letter moves. */
export function midSentence(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1)
}
