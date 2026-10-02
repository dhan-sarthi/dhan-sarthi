import { ListCardSkeleton, ProseCardSkeleton } from '../placeholder.tsx'

/** The Overview tab, until its builder replaces it. */
export function CustomerOverview() {
  return (
    <div className="grid content-start gap-6">
      <ProseCardSkeleton />
      <ListCardSkeleton rows={5} />
    </div>
  )
}
