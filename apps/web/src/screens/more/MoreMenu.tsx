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
 * down another screen. `Switch customer` is a demo control and is grouped and labelled as one
 * rather than mixed in with the customer's own settings.
 *
 * The footer replaces the reference's `HDFC BANK / SmartWealth` lockup and `App Version
 * v11.0.11`. A build number is a placeholder in their demo and would be one here; what a
 * reviewer of *this* app wants in that slot is where the numbers came from and what date they
 * are true on.
 */
import type { ReactNode } from 'react'
import {
  FileSpreadsheet,
  Link2,
  ScrollText,
  SlidersHorizontal,
  UserRound,
  UsersRound,
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
  onOpenRiskProfile,
  onOpenProfile,
  onEditHoldings,
  onLinkAccounts,
  onSwitchCustomer,
  onRefresh,
}: {
  view: View
  /** Rows in the advice record. The count badge, and the reason the row is worth pressing. */
  decisions: number
  onOpenRecord: () => void
  onOpenReports: () => void
  onOpenRiskProfile: () => void
  onOpenProfile: () => void
  onEditHoldings: () => void
  onLinkAccounts: () => void
  onSwitchCustomer: () => void
  onRefresh: () => Promise<void>
}): ReactNode {
  const { snapshot } = view
  const profile = snapshot.customer.riskProfile

  return (
    <Screen header={<Head title="More" sub={snapshot.customer.name} />} onRefresh={onRefresh}>
      <Section label="Track and manage" />
      <Group>
        <ListRow
          icon={<ScrollText {...GLYPH} />}
          title="Record"
          sub="Every recommendation, and the rule that decided it"
          badge={decisions}
          onClick={onOpenRecord}
        />
        <ListRow
          icon={<FileSpreadsheet {...GLYPH} />}
          title="Reports"
          sub="Transaction and holding statements, as a file you can keep"
          onClick={onOpenReports}
        />
      </Group>

      <Section label="Your profile" />
      <Group>
        <ListRow
          icon={<SlidersHorizontal {...GLYPH} />}
          title="Investment profile"
          sub="The highest risk band you can be offered"
          value={<Pill>{profile}</Pill>}
          onClick={onOpenRiskProfile}
        />
        <ListRow
          icon={<UserRound {...GLYPH} />}
          title="About you"
          sub="Income, dependants, marital status, tax regime"
          onClick={onOpenProfile}
        />
        <ListRow
          icon={<Wallet {...GLYPH} />}
          title="What you already own"
          sub="Funds, deposits, PPF and NPS, insurance in force"
          onClick={onEditHoldings}
        />
        <ListRow
          icon={<Link2 {...GLYPH} />}
          title="Linked accounts"
          sub="Account Aggregator consent, checked with the bank"
          badge={view.accounts.length}
          onClick={onLinkAccounts}
        />
      </Group>

      <Section label="This demo" />
      <Group>
        <ListRow
          icon={<UsersRound {...GLYPH} />}
          title="Switch customer"
          sub="Each persona fires a different suitability rule"
          onClick={onSwitchCustomer}
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
 */
function Section({ label }: { label: string }): ReactNode {
  return (
    <div className="-mx-4 mt-2 bg-ground-deep px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
      {label}
    </div>
  )
}

/**
 * Rows inside one band, hairlined between and not around.
 *
 * The source draws a divider under the last row of a section as well, immediately above the next
 * band. Against a tinted band that reads as a double rule, so it is dropped here — `divide-y`
 * puts a line between siblings and none at either end.
 */
function Group({ children }: { children: ReactNode }): ReactNode {
  return <div className="divide-y divide-solid divide-hairline-mint">{children}</div>
}

function Footer({ view }: { view: View }): ReactNode {
  const { meta } = view
  return (
    <div className="mt-8 pb-2 text-center">
      <div className="text-[15px] font-semibold text-ink">Dhan Sarthi</div>
      <p className="m-0 mt-1 text-xs leading-relaxed text-ink-soft">
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
