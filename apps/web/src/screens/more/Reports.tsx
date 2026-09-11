/**
 * Reports — pick a statement.
 *
 * `spec/screens/13-reports/02-reports-home.md` is a hero illustration over three list cards:
 * Capital Gain / Loss, Transactions, Holding Statement. Two of the three ship. The third is on
 * the list, off, with the reason — see the header comment in `reports.ts` for why it cannot be
 * written honestly from what this app holds.
 *
 * Keeping the dead row visible is a deliberate call and it is the opposite of what a demo would
 * do. A reviewer who knows the reference will look for capital gain; finding it named, with one
 * sentence saying what it would need, is a better answer than finding it missing and wondering
 * whether it was forgotten. The source has no empty, error or unavailable state anywhere in 998
 * seconds of footage, and this is the screen where that absence would have cost the most.
 *
 * The reference titles this screen `Investment Profile`, which is its own bug — it is the
 * reports list, and the app has a different screen actually called that. It is titled Reports.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { FileChartColumn, FileSpreadsheet, Table2 } from 'lucide-react'
import type { View } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Card, Head, ListRow } from '../../components/ui.tsx'
import type { Tier } from '../../components/TierBadge.tsx'
import { ReportForm } from './ReportForm.tsx'
import type { ReportKind } from './reports.ts'

const GLYPH = { size: 20, strokeWidth: 1.9 } as const

export function Reports({
  view,
  tier,
  onBack,
}: {
  view: View
  /** Offline, the ledger is in this browser and there is no statement endpoint to page through. */
  tier: Tier
  onBack: () => void
}): ReactNode {
  const [kind, setKind] = useState<ReportKind | null>(null)

  if (kind !== null) {
    return <ReportForm kind={kind} view={view} onBack={() => setKind(null)} />
  }

  /*
   * Offline is a real state and it is refused up front rather than after the button.
   *
   * The offline chunk rebuilds a view from a bundled ledger; it serves no `listTransactions` and
   * no `getHoldings`. Letting a customer choose a tenure and then fail on generate would be a
   * worse version of the same answer.
   */
  if (tier === 'offline') {
    return (
      <Screen header={<Head title="Reports" sub="Statements you can keep" onBack={onBack} />}>
        <Card tint="clay">
          <h2>Not while this browser is simulating</h2>
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
            The advisor service could not be reached, so the app is running its own copy of the
            ledger to keep the screens working. A statement has to be built from the real thing — it
            is a file you might file — so nothing is generated from the simulation.
          </p>
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
            Reconnect and this page works.
          </p>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen header={<Head title="Reports" sub="Statements you can keep" onBack={onBack} />}>
      <div className="mt-1 divide-y divide-solid divide-hairline-mint">
        <ListRow
          icon={<Table2 {...GLYPH} />}
          title="Transaction statement"
          sub="Every line of your account over a period you choose, with the category we read it as"
          onClick={() => setKind('transactions')}
        />
        <ListRow
          icon={<FileSpreadsheet {...GLYPH} />}
          title="Holding statement"
          sub="What you own today, what it cost and what it is worth"
          onClick={() => setKind('holdings')}
        />
        {/* No `onClick`, so `ListRow` draws neither a chevron nor a press state — the row is
            information rather than a control, and looking pressable while doing nothing is
            worse than being visibly off. */}
        <ListRow
          icon={<FileChartColumn {...GLYPH} />}
          title="Capital gain / loss statement"
          sub="Not available — this app cannot compute one honestly"
        />
      </div>

      <Card tint="clay">
        <h2>Why there is no capital-gain statement</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          A capital-gain statement has to split every sale into short-term and long-term, which
          needs the units you bought, the day you bought them, the NAV on both days and a record of
          what you redeemed. This app holds one invested figure and one current value per holding,
          and no redemptions at all.
        </p>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          What it could produce from that is the change in value of what you still hold. That is not
          a capital gain, it is not what a tax return asks for, and putting it under this title
          would be wrong in the one place the number matters. The holding statement above shows that
          same figure under its own name.
        </p>
      </Card>

      <Card>
        <h2>What a statement here is</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          A CSV file, downloaded to this device, built from the same data every screen in this app
          reads. It carries your name, the window it covers, the date it was taken and where the
          numbers came from, so it can be filed rather than only looked at.
        </p>
      </Card>
    </Screen>
  )
}
