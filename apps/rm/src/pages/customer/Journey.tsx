import { ListCardSkeleton, ProseCardSkeleton } from '../placeholder.tsx'

/** The Journey tab, until its builder replaces it. */
export function CustomerJourney() {
  return (
    <div className="grid content-start gap-6">
      <ProseCardSkeleton />
      <ListCardSkeleton rows={5} />
    </div>
  )
}
