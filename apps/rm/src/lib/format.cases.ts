/**
 * The short rupee figures every formatter on the console must print, value for value. Near a unit
 * boundary two formatters that each look right will disagree (₹1Cr against ₹100L, ₹1L against
 * ₹100k), so the cases sit here, where any page's own formatter can be tested against them, and
 * `format.test.ts` holds `formatInr(…, { short: true })` to every row.
 *
 * The rule: round first, then choose the unit; at most three significant figures; a true minus.
 */
export const SHORT_INR_CASES: readonly (readonly [value: number, short: string])[] = [
  [950, '₹950'],
  [4_500, '₹4.5k'],
  [48_000, '₹48k'],
  [99_500, '₹1L'],
  [99_960, '₹1L'],
  [1_00_000, '₹1L'],
  [1_86_240, '₹1.86L'],
  [4_82_448, '₹4.82L'],
  [48_20_000, '₹48.2L'],
  [99_70_000, '₹1Cr'],
  [99_96_000, '₹1Cr'],
  [99_99_000, '₹1Cr'],
  [1_20_00_000, '₹1.2Cr'],
  [2_27_70_000, '₹2.28Cr'],
  [1_23_45_67_890, '₹123Cr'],
  [-2_23_000, '−₹2.23L'],
  [-1_86_000, '−₹1.86L'],
]
