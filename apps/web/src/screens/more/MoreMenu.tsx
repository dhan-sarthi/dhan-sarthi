/**
 * The account menu — the grouped list `spec/screens/13-reports/01-more-menu.md` specs in detail.
 *
 * The *shape* is theirs and is followed closely: a flat white list with no cards, full-bleed
 * tinted section bands carrying an all-caps label, 68pt rows of glyph · title · sub-label ·
 * optional count · chevron, hairline dividers inside a group and none across a band, and a
 * footer pinned to the content rather than the viewport.
 *
 * The *rows* are this app's, and mapping them honestly is the whole job. The reference's
 * `TRACK AND MANAGE` group is Demat, Order History, Reports and My Family; of those, only a
 * report has a counterpart here. There is no demat account, no family tagging, and — the
 * interesting one — no order history, because this app has never placed an order.
 *
 * What it has instead is the **Record**: a hash-chained row per recommendation carrying the
 * snapshot it was judged against, the rule that decided it, and the exact sentence the customer
 * was shown, including every refusal. That is the same slot in the menu as Order History and a
 * far better thing to put in it, so it leads the group and carries the count badge the source
 * gives My Family.
 *
 * Two rows the source has no equivalent for are here because they had nowhere else to live:
 * "What you already own" and "Linked accounts" were both reachable only from a button halfway
 * down another screen. `Switch customer` used to sit under a `This demo` band here; it went
 * when the app stopped being a demo. Nothing in this list is scaffolding now.
 *
 * The footer replaces the reference's `HDFC BANK / SmartWealth` lockup and `App Version
 * v11.0.11`. A build number is a placeholder in their demo and would be one here; what a
 * reviewer of *this* app wants in that slot is where the numbers came from and what date they
 * are true on. The *shape* is theirs though — a two-part lockup, bank above product, centred in
 * the white below the last row — because that is what makes the list end rather than stop.
 *
 * ## What the frames corrected, once they were opened
 *
 * The first build of this screen was written from the spec text and got three things wrong that
 * only the pictures say.
 *
 * **The band label is quiet.** It was an `Eyebrow` — 11px, green, `text-accent-text` — which is
 * the app's "here comes something" type. In the frames the band label is `#8D9299` on `#F0F5FA`:
 * grey on grey, letter-spaced, one step *below* the rows it introduces. A section band is
 * furniture. Making it the loudest thing on the screen inverted the hierarchy, and green there
 * also collided with the count badge and the profile pill, which are the two things on this list
 * that are meant to be green.
 *
 * **The rows are looser than 68.** `01-more-menu.md` measures ~68dp for a bare row and ~90dp
 * once a sub-label is under the title, and the frames bear that out at about 79 and 84. 68 is
 * `ListRow`'s default because it is the height of SmartWealth's *compact* lists; a grouped
 * settings list is not one. Hence `tall`.
 *
 * **The sub-labels are captions, not sentences.** Theirs are four words — `Check transaction
 * history`, `Families you are tagged to`. Ours were clauses that wrapped to two lines, which
 * made every row a different height and turned the list into prose. The rewrite says the same
 * things shorter; where a row genuinely needs a paragraph, the paragraph belongs on the screen
 * the row opens.
 *
 * ## Illustrated marks were considered here and are not used
 *
 * `public/icons` has fourteen drawn category marks and they carry the Discover grid. They do not
 * belong on this list, on two counts. The set is drawn to read at 56px — `genart.py`'s `icon`
 * kind says so in the prompt — and at the 34px a 40px `ListRow` tile leaves them, the one accent
 * each carries shrinks to a speck and the object reads as a sticker rather than a signpost. And
 * the frames do not ask for it: the reference's own menu rows are near-black 1.5dp mono-line
 * glyphs with no tile behind them at all. Illustration here would be diverging from the source,
 * not converging on it. Lucide at 20px in the `legend-chip` tile stays.
 */
import type { ReactNode } from 'react'
import {
  FileSpreadsheet,
  Link2,
  ScrollText,
  SlidersHorizontal,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import type { View } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Head, ListRow, Pill } from '../../components/ui.tsx'
import { longDate } from '../../lib/money.ts'

const GLYPH = { size: 20, strokeWidth: 1.9 } as const

/** What the source's `Source` field means in words, for the footer. */
const SOURCE_LABEL: Record<View['meta']['source'], string> = {
  'idbi-sandbox': 'Read from IDBI',
  postgres: 'Seeded database',
  memory: 'Synthetic ledger',
}

export function MoreMenu({
  view,
  decisions,
  onOpenRecord,
  onOpenReports,
  onOpenFamily,
  onOpenRiskProfile,
  onOpenProfile,
  onEditHoldings,
  onLinkAccounts,
  onRefresh,
}: {
  view: View
  /** Rows in the advice record. The count badge, and the reason the row is worth pressing. */
  decisions: number
  onOpenRecord: () => void
  onOpenReports: () => void
  onOpenFamily: () => void
  onOpenRiskProfile: () => void
  onOpenProfile: () => void
  onEditHoldings: () => void
  onLinkAccounts: () => void
  onRefresh: () => Promise<void>
}): ReactNode {
  const { snapshot } = view
  const profile = snapshot.customer.riskProfile

  return (
    <Screen header={<Head title="More" sub={snapshot.customer.name} />} onRefresh={onRefresh}>
      <Section label="Track and manage" />
      <Group>
        <ListRow
          tall
          icon={<ScrollText {...GLYPH} />}
          title="Record"
          sub="Every recommendation, and why"
          badge={decisions}
          onClick={onOpenRecord}
        />
        <ListRow
          tall
          icon={<FileSpreadsheet {...GLYPH} />}
          title="Reports"
          sub="Transaction and holding statements"
          onClick={onOpenReports}
        />
        {/* The reference's `My Family` sits in this group, and its absence here used to be
            honest: there was no household in the data model. There is one now — the customer's
            own figures are real and the rest of the household is declared demo people, which the
            surface says on every screen it has. The sub-label says it here too, before the tap. */}
        <ListRow
          tall
          icon={<Users {...GLYPH} />}
          title="My family"
          sub="Household wealth · demo members"
          onClick={onOpenFamily}
        />
      </Group>

      <Section label="Your profile" />
      <Group>
        <ListRow
          tall
          icon={<SlidersHorizontal {...GLYPH} />}
          title="Investment profile"
          sub="How much risk you can be offered"
          value={<Pill>{profile}</Pill>}
          onClick={onOpenRiskProfile}
        />
        <ListRow
          tall
          icon={<UserRound {...GLYPH} />}
          title="About you"
          sub="Income, dependants, tax regime"
          onClick={onOpenProfile}
        />
        <ListRow
          tall
          icon={<Wallet {...GLYPH} />}
          title="What you already own"
          sub="Funds, deposits, PPF, NPS, insurance"
          onClick={onEditHoldings}
        />
        <ListRow
          tall
          icon={<Link2 {...GLYPH} />}
          title="Linked accounts"
          sub="Account Aggregator consent"
          badge={view.accounts.length}
          onClick={onLinkAccounts}
        />
      </Group>

      <Footer view={view} />
    </Screen>
  )
}

/**
 * The full-bleed band between groups.
 *
 * `-mx-4` escapes `.scroll`'s gutter and `px-4` puts the label back on it, which is the whole
 * trick: the band runs edge to edge and its text still lines up with every row above and below.
 *
 * ~40dp tall with the label optically centred, and the label grey rather than green — see the
 * header comment. `tracking-[0.09em]` is the frames' letter-spacing, which is wider than the
 * `tracking-wide` an `Eyebrow` carries; at 12px on a band that is the difference between a
 * heading and a rule with a name on it.
 *
 * No divider above or below, and none under the last row of the group before it either. The
 * source draws one there and against a tinted band it reads as a double rule; the band's own
 * top edge is already the line.
 */
function Section({ label }: { label: string }): ReactNode {
  return (
    <div className="-mx-4 flex min-h-10 items-center bg-ground-deep px-4 text-[12px] font-semibold uppercase leading-none tracking-[0.09em] text-ink-soft">
      {label}
    </div>
  )
}

/**
 * Rows inside one band, hairlined between and not around.
 *
 * The source draws a divider under the last row of a section as well, immediately above the next
 * band. Against a tinted band that reads as a double rule, so it is dropped here — the rule goes
 * *between* siblings and at neither end. The one under the final row of the list is real and
 * lives on `Footer`, which is where the list actually stops.
 *
 * `divide-y` draws none of them until `ListRow` stops carrying `border-0`, which it did until
 * this screen was screenshotted: the shorthand and `divide-y`'s `border-top-width` are the same
 * specificity, the shorthand won, and every grouped list in the app — here, `Today`, `Money`,
 * `Holdings`, `Record` — was drawing its rows flush. The fix is in `ui.tsx`, with the reasoning.
 */
function Group({ children }: { children: ReactNode }): ReactNode {
  return <div className="divide-y divide-solid divide-hairline-mint">{children}</div>
}

/**
 * The lockup at the end of the list.
 *
 * Their shape — bank line above product name, centred, in the white below the last row, with a
 * grey caption under it — carrying this app's content instead of a build number. The hairline
 * across the top is the divider the frames draw under the final row; put it here rather than on
 * the group so that a band never gets one immediately above it.
 */
function Footer({ view }: { view: View }): ReactNode {
  const { meta } = view
  return (
    <div className="-mx-4 border-0 border-t border-solid border-hairline-mint px-4 pb-2 pt-9 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
        IDBI Bank
      </div>
      <div className="mt-0.5 text-[19px] font-bold leading-tight tracking-tight text-brand-deep">
        Dhan Sarthi
      </div>
      <p className="m-0 mt-2.5 text-[11.5px] leading-relaxed text-ink-soft">
        {SOURCE_LABEL[meta.source]} · {meta.ledgerHorizon.from.slice(0, 4)}–
        {meta.ledgerHorizon.to.slice(0, 4)} ledger
        <br />
        Everything on screen is true as at {longDate(meta.asOf)}
        {meta.dataFreshnessDate !== meta.asOf
          ? `, data to ${longDate(meta.dataFreshnessDate)}`
          : ''}
      </p>
    </div>
  )
}
