/** Two series, so a key: the solid line is every bank, the dashed one the part with IDBI. */
export function SeriesKey() {
  return (
    <ul className="flex shrink-0 gap-3 text-caption text-ink-soft" aria-hidden>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full bg-chart-1" />
        All banks
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="w-3 border-t-2 border-dashed border-chart-comparison" />
        With IDBI
      </li>
    </ul>
  )
}
