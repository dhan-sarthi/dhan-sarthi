import { ListCardSkeleton, ProseCardSkeleton } from '../placeholder.tsx'

/** The Goals & plan tab, until its builder replaces it. */
export function CustomerGoals() {
  return (
    <div className="grid content-start gap-6">
      <ProseCardSkeleton />
      <ListCardSkeleton rows={5} />
    </div>
  )
}
