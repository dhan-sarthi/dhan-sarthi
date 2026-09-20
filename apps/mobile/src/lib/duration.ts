/** Months, said the way a person would. 372 months is a number nobody holds in their head. */
export function duration(months: number): string {
  if (months === 1) return 'This month'
  if (months < 24) return `${months} months`
  return `${Math.round(months / 12)} years`
}
