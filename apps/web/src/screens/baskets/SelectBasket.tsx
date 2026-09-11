/**
 * `select-basket` — three baskets, their constituents, and the only way out of here.
 *
 * The frames give the whole shape: three text tabs with a thick underline indicator, two outlined
 * summary pills, then collapsible groups whose headers are pale-green bands carrying a dot, a
 * name, a total and a chevron, then one three-band card per scheme, then a dashed outline button.
 * `parts.tsx` draws those pieces; this file is the screen they make.
 *
 * Four decisions the frames do not settle.
 *
 * **The tabs are named after their rule, not numbered.** `Basket 1 / Basket 2 / Basket 3` tells a
 * customer nothing, and the reference's own spec records that nothing else on the screen tells
 * them either — no name, no return, no risk level. Each tab here is the rule it applies, and the
 * rule is repeated in full under the tab row where it can be checked against the cards.
 *
 * **There is a bottom action bar.** The reference has none in any frame and its flow file lists
 * the whole invest half as never filmed. This app has a transaction spine and a suitability gate,
 * so the way out of a basket is the gate: one button, and it says what it does.
 *
 * **The trash icon and the bulk-delete mode are the same feature.** Frame `21` is a separate
 * multi-select screen with a pinned `Select All · Delete (2)` bar, which its own spec suspects
 * belongs to a holdings list rather than to a basket. Rebuilt here as a *mode* of this screen —
 * the app bar's toggle turns every card's checkbox from "include this" into "remove this" and
 * swaps the footer for the counted action — because two screens that both delete funds from a
 * list is one screen too many.
 *
 * **What that mode does not carry.** Frame `21` puts a gold `Recommended` ribbon on every row and
 * an `Invested Value / Market Value (+16%)` strip under each. Neither exists here: the shelf has
 * no recommendation flag, and a basket nobody has bought has no market value to compare against.
 */
import type { ReactNode } from 'react'
import { ListChecks, Wallet, X } from 'lucide-react'
import type { ShelfProduct } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { AllocationCard } from '../../components/charts/index.ts'
import { Checkbox } from '../../components/Form.tsx'
import { Button, Card, Head, IconButton, Segments, TextLink } from '../../components/ui.tsx'
import { Art } from '../../components/Art.tsx'
import { dayMonth, inr } from '../../lib/money.ts'
import { totals } from '../../lib/order.ts'
import type { OrderLine } from '../../lib/order.ts'
import { BASKETS, lockLabel } from './compose.ts'
import type { BasketId, Group } from './compose.ts'
import { DashedButton, FundCard, GroupHead, SummaryChips } from './parts.tsx'

const GROUP_LABEL = (g: Group, n: number): string =>
  g.mode === 'sip'
    ? `${n} SIP${n === 1 ? '' : 's'} to start`
    : `${n} one-off purchase${n === 1 ? '' : 's'}`

export function SelectBasket({
  basketId,
  groups,
  shelf,
  collapsed,
  selecting,
  selected,
  placing,
  gateError,
  onBasket,
  onCollapse,
  onSelecting,
  onSelect,
  onSelectAll,
  onRemoveSelected,
  onToggleLine,
  onEdit,
  onRemove,
  onAdd,
  onPlace,
  onBack,
}: {
  basketId: BasketId
  groups: readonly Group[]
  shelf: readonly ShelfProduct[]
  collapsed: ReadonlySet<string>
  selecting: boolean
  selected: ReadonlySet<string>
  placing: boolean
  gateError: string | null
  onBasket: (id: BasketId) => void
  onCollapse: (mode: string) => void
  onSelecting: (on: boolean) => void
  onSelect: (id: string, on: boolean) => void
  onSelectAll: (on: boolean) => void
  onRemoveSelected: () => void
  onToggleLine: (id: string) => void
  onEdit: (line: OrderLine) => void
  onRemove: (id: string) => void
  onAdd: (mode: Group['mode']) => void
  onPlace: () => void
  onBack: () => void
}): ReactNode {
  const spec = BASKETS.find((b) => b.id === basketId) ?? BASKETS[0]
  const all = groups.flatMap((g) => g.lines)
  const t = totals(all)
  const dropped = groups.reduce((n, g) => n + g.dropped, 0)

  const chips = groups
    .filter((g) => g.lines.length > 0)
    .map((g) => {
      const inc = g.lines.filter((l) => l.included)
      const sum = inc.reduce((n, l) => n + l.amount, 0)
      return g.mode === 'sip'
        ? `${inc.length} SIP${inc.length === 1 ? '' : 's'} · ${inr(sum)} a month`
        : `${inc.length} one-off · ${inr(sum)}`
    })

  const everySelected = all.length > 0 && all.every((l) => selected.has(l.id))

  /*
   * A swapped-in alternative need not obey the basket's rule — `TAX_BENEFIT_UNAVAILABLE` sends an
   * ELSS to an index fund with no lock-in, which is the right advice and the wrong shape for
   * `Locked away`. The rule sentence is printed above the cards where it can be checked against
   * them, so the moment it stops being true of all of them it has to say so rather than stand
   * there being false.
   */
  const offRule = all.filter((l) => {
    const p = shelf.find((s) => s.productId === l.productId)
    return p !== undefined && spec !== undefined && !spec.holds(p)
  }).length

  return (
    <Screen
      header={
        <Head
          onBack={selecting ? () => onSelecting(false) : onBack}
          backLabel={selecting ? 'Leave selection' : 'Back to the amount'}
          title={selecting ? 'Remove schemes' : 'Choose a basket'}
          right={
            selecting || all.length === 0 ? undefined : (
              <IconButton
                label="Select schemes to remove"
                tone="bordered"
                onClick={() => onSelecting(true)}
              >
                <ListChecks size={18} strokeWidth={2.2} />
              </IconButton>
            )
          }
        />
      }
      tabs={
        selecting ? undefined : (
          <Segments
            variant="underline"
            options={BASKETS.map((b) => ({ id: b.id, label: b.tab }))}
            value={basketId}
            onChange={onBasket}
          />
        )
      }
      footer={
        all.length === 0 ? undefined : selecting ? (
          <div className="flex items-center gap-2">
            <Checkbox checked={everySelected} onChange={onSelectAll} label="Select every scheme" />
            <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">Select all</span>
            <Button
              tone="danger"
              size="sm"
              disabled={selected.size === 0}
              onClick={onRemoveSelected}
            >
              Remove ({selected.size})
            </Button>
            <IconButton
              label="Leave selection"
              tone="grey"
              size="sm"
              onClick={() => onSelecting(false)}
            >
              <X size={17} strokeWidth={2.4} />
            </IconButton>
          </div>
        ) : (
          <>
            {gateError ? (
              <p role="alert" className="mb-2.5 mt-0 text-[13px] leading-snug text-danger">
                {gateError}
              </p>
            ) : null}
            <div className="mb-2.5 flex items-baseline gap-2 text-[13px] text-ink-soft">
              <span className="min-w-0 flex-1">
                {t.monthly > 0 ? <b className="font-semibold text-ink">{inr(t.monthly)}</b> : null}
                {t.monthly > 0 ? ' a month' : null}
                {t.monthly > 0 && t.today > 0 ? ' · ' : null}
                {t.today > 0 ? <b className="font-semibold text-ink">{inr(t.today)}</b> : null}
                {t.today > 0 ? ' today' : null}
              </span>
              <span className="flex-none">
                {t.count} scheme{t.count === 1 ? '' : 's'}
              </span>
            </div>
            <Button full busy={placing} disabled={t.count === 0} onClick={onPlace}>
              Check and place this basket
            </Button>
          </>
        )
      }
    >
      {selecting ? null : (
        <p className="mb-0 mt-3 text-[14px] leading-relaxed text-ink-mid">
          {spec?.rule}
          {offRule > 0 ? (
            <>
              {' '}
              <b className="font-semibold text-ink">
                You have changed it: {offRule} scheme{offRule === 1 ? '' : 's'} no longer
                {offRule === 1 ? ' matches' : ' match'} that rule.
              </b>
            </>
          ) : null}
        </p>
      )}
      {selecting ? null : <SummaryChips chips={chips} />}

      {dropped > 0 && all.length > 0 ? (
        <Card tint="clay">
          <p className="mb-0 mt-0 text-[13.5px] leading-relaxed text-ink-mid">
            {dropped} scheme{dropped === 1 ? '' : 's'} left out: your amount does not divide far
            enough to clear every scheme&rsquo;s own minimum. Raise it and{' '}
            {dropped === 1 ? 'it comes' : 'they come'} back.
          </p>
        </Card>
      ) : null}

      {all.length === 0 ? (
        /*
         * Designed, not observed: the source has no empty state anywhere and its brief says so.
         * A basket can be emptied two ways — the amount will not carry a single scheme above its
         * minimum, or the customer removed everything — and both land here. Which one it was is
         * the difference between the two sentences.
         */
        <div className="mt-8 flex flex-col items-center px-2 text-center">
          <Art name="empty-basket" size="md" />
          <h2 className="m-0 mt-4 text-[18px] font-semibold text-ink">This basket is empty</h2>
          <p className="mb-0 mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            {dropped > 0
              ? `Your amount will not clear any of this basket's own minimums. Raise it, or try another basket.`
              : 'You have taken everything out. Add a scheme back, or try another basket.'}
          </p>
          <div className="mt-5 w-full">
            <Button full tone="secondary" onClick={() => onAdd(groups[0]?.mode ?? 'sip')}>
              Add a scheme
            </Button>
          </div>
          <div className="mt-2">
            <TextLink onClick={onBack}>Change the amount</TextLink>
          </div>
        </div>
      ) : null}

      {(all.length === 0 ? [] : groups).map((g) => {
        const included = g.lines.filter((l) => l.included)
        const open = !collapsed.has(g.mode)
        const sum = included.reduce((n, l) => n + l.amount, 0)
        return (
          <div key={g.mode}>
            <GroupHead
              label={GROUP_LABEL(g, included.length)}
              total={sum}
              open={open}
              onToggle={() => onCollapse(g.mode)}
            />
            {open ? (
              <div className="pt-3">
                {g.lines.map((line) => {
                  const p = shelf.find((s) => s.productId === line.productId)
                  return (
                    <FundCard
                      key={line.id}
                      line={line}
                      sub={
                        p
                          ? `${p.manufacturer} · ${p.riskometer} risk · ${lockLabel(p.lockInYears)}`
                          : line.manufacturer
                      }
                      cells={
                        line.mode === 'sip'
                          ? [
                              { label: 'SIP amount', value: inr(line.amount) },
                              {
                                label: 'First debit',
                                value: line.startDate ? dayMonth(line.startDate) : '—',
                              },
                              {
                                label: 'Instalments',
                                value:
                                  line.installments === null
                                    ? 'Until you stop'
                                    : String(line.installments),
                              },
                            ]
                          : [
                              { label: 'Amount', value: inr(line.amount) },
                              { label: 'Riskometer', value: p?.riskometer ?? '—' },
                              { label: 'Lock-in', value: lockLabel(p?.lockInYears ?? 0) },
                            ]
                      }
                      selecting={selecting}
                      selected={selected.has(line.id)}
                      onToggle={(next) =>
                        selecting ? onSelect(line.id, next) : onToggleLine(line.id)
                      }
                      onEdit={() => onEdit(line)}
                      onRemove={() => onRemove(line.id)}
                    />
                  )
                })}
                {selecting ? null : (
                  <DashedButton onClick={() => onAdd(g.mode)}>
                    + Add a scheme to this {g.mode === 'sip' ? 'SIP' : 'one-off'}
                  </DashedButton>
                )}
                {/* The split, after the schemes rather than before them: it is a reading of the
                    cards above it, and putting it first pushed every scheme below the fold. */}
                {included.length > 1 && !selecting ? (
                  <div className="mt-3">
                    <AllocationCard
                      title="Where this splits"
                      icon={<Wallet size={20} strokeWidth={2} />}
                      note={g.mode === 'sip' ? 'Every month' : 'Once, today'}
                      donutSize={84}
                      slices={included.map((l) => ({
                        label: l.name,
                        value: l.amount,
                        display: inr(l.amount),
                      }))}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}

      {selecting || all.length === 0 ? null : (
        <p className="mb-6 mt-5 text-xs leading-relaxed text-ink-soft">
          Nothing here is checked yet. The suitability gate runs on the whole basket when you place
          it — {t.count} scheme{t.count === 1 ? '' : 's'}, {t.count} evaluation
          {t.count === 1 ? '' : 's'}, and one refusal stops all of it.
        </p>
      )}
    </Screen>
  )
}
