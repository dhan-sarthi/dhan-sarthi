/**
 * Bounded fan-out.
 *
 * The sandbox is a shared box behind an IP allow-list and its round trips are 150-1300 ms, so
 * the difference between doing independent reads one at a time and doing a handful at a time is
 * most of a view. The difference between a handful and all of them is not, and firing thirty
 * requests at somebody else's demo environment is rude — hence a limit rather than a
 * `Promise.all` over everything.
 */

/** Run `work` over `items` with at most `limit` in flight, keeping the results in input order. */
export async function mapWithLimit<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  work: (item: TIn) => Promise<TOut>,
): Promise<TOut[]> {
  const out: TOut[] = new Array<TOut>(items.length)
  let next = 0
  const runner = async (): Promise<void> => {
    for (;;) {
      const i = next++
      const item = items[i]
      if (item === undefined) return
      out[i] = await work(item)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runner))
  return out
}
