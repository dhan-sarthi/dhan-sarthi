import { ListCardSkeleton, ProseCardSkeleton } from '../placeholder.tsx'

/** The Advice record tab, until its builder replaces it. */
export function CustomerRecord() {
  return (
    <div className="grid content-start gap-6">
      <ProseCardSkeleton />
      <ListCardSkeleton rows={5} />
    </div>
  )
}
