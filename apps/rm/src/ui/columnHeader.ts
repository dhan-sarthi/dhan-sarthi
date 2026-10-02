/**
 * How a column header reads on every table on the console, the kit's and a page's own: caption
 * size in the tertiary grey, sentence case, on a hairline. A page that draws its own table (the
 * advice ledger, Insights' movers) uses this rather than a header style of its own.
 *
 * A module of its own, not part of `DataTable.tsx`: a page that only wants the header style would
 * otherwise import the table and its library (the 56 kB DataTable chunk) to read one string.
 */
export const columnHeaderClass =
  'h-9 border-b border-hairline px-3 text-caption text-ink-faint whitespace-nowrap'
