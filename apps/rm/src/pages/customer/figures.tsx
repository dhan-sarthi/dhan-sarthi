import { cn } from '../../lib/cn.ts'
import { rupees, rupeesShort, rupeesTitle } from './prose.ts'

/*
 * Rupee figures by core's rules, kept apart from parts.tsx: the shell's route fallbacks import
 * that file eagerly, and this one pulls in `@dhan/core`, which belongs in the customer page's own
 * chunk, not the first one.
 */

/**
 * A rupee figure inside a sentence, by the API's sentence rule: exact under a lakh, short from
 * there up (₹22,501, ₹1.86L, ₹2.28Cr), with the exact figure on hover. The same function wrote the
 * signal titles beside it, so one fact never reads two ways on the file. Figure cells and tables
 * keep the kit's `<Money>`.
 */
export function ProseInr({ value, className }: { value: number; className?: string }) {
  return (
    <span title={rupees(value)} className={cn('tabular whitespace-nowrap', className)}>
      {sign(value)}
      {rupeesTitle(Math.abs(value))}
    </span>
  )
}

/**
 * A headline figure always in short form (₹42.8L, ₹3.25L), by the same rule as `ProseInr`, so the
 * highlights strip and the sentences under it never round one figure two ways.
 */
export function ShortInr({ value, className }: { value: number; className?: string }) {
  return (
    <span title={rupees(value)} className={cn('tabular whitespace-nowrap', className)}>
      {sign(value)}
      {rupeesShort(Math.abs(value))}
    </span>
  )
}

/** The console's true minus sign, where core's formatters would print a hyphen. */
function sign(value: number): string {
  return Math.round(value) < 0 ? '−' : ''
}
