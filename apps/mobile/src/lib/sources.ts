// Where the numbers came from, grouped by the place that holds them.
//
// `HoldingSchema.custodian` is described in the contract as "the honest form of
// `heldOutsideIdbi`" — `Zerodha`, `EPFO`, `Protean CRA`, `HDFC Life`, `IDBI Bank` — and until
// now nothing in the app rendered it. The Holdings pane drew one flat chip reading "Held
// elsewhere", which tells a customer that some of this is not ours without telling them whose
// it is, and a customer who cannot name the place cannot go and check the figure.
//
// A source is not a connection in the plumbing sense. It is the place a number is true at:
// EPFO knows the provident fund balance, Zerodha knows the folios, IDBI knows its own book.
// Grouping eleven holdings by custodian turns them into five places, and five places is a
// thing a person can hold in their head and reason about switching off.
import type { HoldingRecordResponse, Provenance } from '@dhan/contracts'

/** IDBI's own book. The one place on the list that is not "elsewhere". */
export const HOME_CUSTODIAN = 'IDBI Bank'

/**
 * What a holding known to be held away from IDBI, but with no custodian on the record, is
 * called.
 *
 * Three of Karan's sixteen are exactly this: `heldOutsideIdbi` is true and `custodian` is
 * absent, because the consolidated statement said the holding exists without saying who keeps
 * it. Grouping those under "Held elsewhere" put a phrase where an institution's name goes and
 * the strip then read "EPFO, Zerodha, Held elsewhere" — three names, one of which is not a
 * place. Naming the gap as a gap is the honest form, and it sorts below every place that does
 * have a name so the strip spends its three slots on real ones.
 */
export const UNNAMED_CUSTODIAN = 'Place not recorded'

/**
 * What sort of place this is, which is the only thing the app can honestly draw for it.
 *
 * There are no institution logos in `@dhan/assets` — it carries retail merchants, because
 * that is what a statement line needs — so a mark here is either a grey letter or a drawing of
 * something true. The kind is true: a custodian holding an EPF balance is a retirement account
 * whatever its name, and that is more use to a customer scanning the list than a monogram.
 */
export type SourceKind = 'home' | 'market' | 'retirement' | 'cover'

export type Source = {
  name: string
  kind: SourceKind
  /** False where the statement gave no custodian, so `name` is a placeholder, not a place. */
  named: boolean
  /** IDBI's own book, which did not need anybody's permission to be read. */
  isHome: boolean
  count: number
  value: number
  /** Share of everything held. The figure that says which place actually matters. */
  share: number
  /** Asset classes held here, most valuable first. */
  classes: string[]
}

/**
 * Who holds this holding.
 *
 * `custodian` where the record carries one, and the boolean behind it where it does not: a
 * holding recorded before the field existed still knows whether it is ours, and falling back
 * to the vaguer answer beats dropping the row out of its own total.
 */
export function custodianOf(h: HoldingRecordResponse): string {
  if (h.custodian !== undefined && h.custodian.trim() !== '') return h.custodian.trim()
  return h.heldOutsideIdbi === true ? UNNAMED_CUSTODIAN : HOME_CUSTODIAN
}

const KIND_OF_TYPE: Record<HoldingRecordResponse['holdingType'], SourceKind> = {
  MUTUAL_FUND: 'market',
  EQUITY: 'market',
  FD: 'market',
  RD: 'market',
  INSURANCE: 'cover',
  NPS: 'retirement',
  PPF: 'retirement',
  EPF: 'retirement',
}

/** The kind that most of the money here is in, not the kind of the first row. */
function kindOf(items: HoldingRecordResponse[], isHome: boolean): SourceKind {
  if (isHome) return 'home'
  const weight = new Map<SourceKind, number>()
  for (const h of items) {
    const kind = KIND_OF_TYPE[h.holdingType]
    weight.set(kind, (weight.get(kind) ?? 0) + Math.max(h.currentValue, 1))
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]
  return ranked ? ranked[0] : 'market'
}

function classesOf(items: HoldingRecordResponse[]): string[] {
  const weight = new Map<string, number>()
  for (const h of items) {
    weight.set(h.assetClass, (weight.get(h.assetClass) ?? 0) + Math.max(h.currentValue, 1))
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

/**
 * The holdings, as places.
 *
 * Sorted by value, with two exceptions, both of which put the useful rows first. Holdings whose
 * custodian was never recorded sit below every place that has a name, because a row the
 * customer cannot go and check is the weakest row on the screen. IDBI's own book sits last of
 * all however much it holds: the screen exists to answer "where else is this coming from", and
 * opening with our own name buries the answer under the one row they already knew about.
 */
export function sourcesOf(holdings: readonly HoldingRecordResponse[]): Source[] {
  const total = holdings.reduce((sum, h) => sum + h.currentValue, 0)
  const grouped = new Map<string, HoldingRecordResponse[]>()
  for (const h of holdings) {
    const name = custodianOf(h)
    const list = grouped.get(name) ?? []
    list.push(h)
    grouped.set(name, list)
  }

  return [...grouped.entries()]
    .map(([name, items]) => {
      const isHome = name === HOME_CUSTODIAN
      const value = items.reduce((sum, h) => sum + h.currentValue, 0)
      return {
        name,
        kind: kindOf(items, isHome),
        named: name !== UNNAMED_CUSTODIAN,
        isHome,
        count: items.length,
        value,
        share: total > 0 ? value / total : 0,
        classes: classesOf(items),
      }
    })
    .sort((a, b) => {
      if (a.isHome !== b.isHome) return a.isHome ? 1 : -1
      if (a.named !== b.named) return a.named ? -1 : 1
      return b.value - a.value
    })
}

/**
 * How a block of the file reached us, said to a customer rather than to an engineer.
 *
 * The three store-shaped values — `fixture`, `memory`, `postgres` — are one thing from where
 * the customer sits: figures this build was seeded with rather than read from a bank. A screen
 * whose entire subject is provenance is the last place that may call seeded numbers a feed, so
 * all three say so. `declared` is the customer's own account of something no bank endpoint
 * carries, which is most of the holdings list.
 */
export function provenanceLabel(p: Provenance): string {
  if (p === 'idbi') return 'Read from IDBI'
  if (p === 'declared') return 'You told us'
  return 'Demo data'
}
