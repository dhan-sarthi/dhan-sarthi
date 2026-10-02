import { ListCardSkeleton, ProseCardSkeleton } from '../placeholder.tsx'

/** The Money tab, until its builder replaces it. */
export function CustomerMoney() {
  return (
    <div className="grid content-start gap-6">
      <ProseCardSkeleton />
      <ListCardSkeleton rows={5} />
    </div>
  )
}
