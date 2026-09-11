/**
 * `Edit Details` and `+Add More Schemes`, neither of which was ever filmed.
 *
 * The reference names both controls and the narration confirms what the first one does — "adjust
 * the investment amount and change the SIP date" — but the flow file lists the editor and the
 * picker among the screens the video does not contain. So these are designed, and they are sheets
 * rather than pushed screens because every editing surface in this app is a sheet
 * (`AddSchemeInvest`'s own header says so).
 *
 * The editor is deliberately narrower than `AddSchemeInvest`. That screen sets up a scheme from
 * scratch — mode, amount, date, instalments, folio — and switching a basket line from a SIP to a
 * one-off would move it into the other group and out from under the split that produced it. What
 * a basket line can be edited to is: a different amount, a different debit day, a different number
 * of instalments. Change your mind about the mode and the amount screen is one back arrow away.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ShelfProduct } from '@dhan/contracts'
import { Sheet } from '../../components/Sheet.tsx'
import { Choice, Field, MoneyInput } from '../../components/Form.tsx'
import { Button, ListRow } from '../../components/ui.tsx'
import { SchemeGlyph } from '../invest/SchemeMark.tsx'
import { dayMonth, inr } from '../../lib/money.ts'
import { SIP_DAYS, nextOnDay } from '../../lib/order.ts'
import type { OrderLine } from '../../lib/order.ts'
import { lockLabel } from './compose.ts'

type CountId = '12' | '24' | '36' | 'open'

const countOf = (installments: number | null | undefined): CountId =>
  installments === null || installments === undefined ? 'open' : (String(installments) as CountId)

export function EditLine({
  line,
  product,
  asOf,
  onSave,
  onClose,
}: {
  /** Null closes the sheet. The sheet is keyed on the line id so it opens with fresh state. */
  line: OrderLine | null
  product: ShelfProduct | undefined
  asOf: string
  onSave: (line: OrderLine) => void
  onClose: () => void
}): ReactNode {
  const [amount, setAmount] = useState(line?.amount ?? 0)
  const [day, setDay] = useState(line?.startDate ? Number(line.startDate.slice(8, 10)) : 1)
  const [count, setCount] = useState<CountId>(countOf(line?.installments))

  /*
   * Re-seed the fields when the sheet is pointed at a different line.
   *
   * During render, not in an effect. The sheet is mounted for the life of the screen — it has to
   * be, because unmounting it would cut the closing animation off at the knees — so switching
   * lines is a prop change rather than a remount, and React's own answer to "adjust state when a
   * prop changes" is to do it while rendering. An effect here is a second commit and the lint
   * rule that catches cascading renders is right about it.
   */
  const [seed, setSeed] = useState<string | null>(line?.id ?? null)
  if (line && seed !== line.id) {
    setSeed(line.id)
    setAmount(line.amount)
    setDay(line.startDate ? Number(line.startDate.slice(8, 10)) : 1)
    setCount(countOf(line.installments))
  }

  const dates = useMemo(
    () =>
      SIP_DAYS.map((d) => ({ day: d, on: nextOnDay(d, asOf) })).sort((a, b) =>
        a.on < b.on ? -1 : 1,
      ),
    [asOf],
  )

  const min = product?.minInvestment ?? 0
  const below = amount < min
  const recurring = line?.mode === 'sip'

  return (
    <Sheet
      open={line !== null}
      onClose={onClose}
      title={line ? line.name : 'Edit'}
      {...(product
        ? {
            sub: `${product.manufacturer} · ${product.riskometer} risk · ${lockLabel(product.lockInYears)}`,
          }
        : {})}
      footer={
        <Button
          full
          disabled={below}
          onClick={() => {
            if (!line) return
            onSave({
              ...line,
              amount,
              startDate: recurring ? nextOnDay(day, asOf) : null,
              installments: recurring && count !== 'open' ? Number(count) : null,
            })
          }}
        >
          Save
        </Button>
      }
    >
      <Field
        label={recurring ? 'Monthly amount' : 'Amount'}
        hint={
          below
            ? `${inr(min)} is this scheme's own minimum.`
            : `Minimum ${inr(min)} for this scheme.`
        }
      >
        <MoneyInput value={amount} onChange={setAmount} ariaLabel="Amount" />
      </Field>
      {recurring ? (
        <>
          <Field label="First debit" hint="The days of the month the AMC accepts a mandate on.">
            <Choice
              options={dates.map((d) => ({ id: String(d.day), label: dayMonth(d.on) }))}
              value={String(day)}
              onChange={(v) => setDay(Number(v))}
            />
          </Field>
          <Field label="Instalments" hint="You can stop or pause a SIP at any time.">
            <Choice
              options={[
                { id: '12' as CountId, label: '12' },
                { id: '24' as CountId, label: '24' },
                { id: '36' as CountId, label: '36' },
                { id: 'open' as CountId, label: 'Until you stop' },
              ]}
              value={count}
              onChange={setCount}
            />
          </Field>
        </>
      ) : null}
    </Sheet>
  )
}

export function AddScheme({
  open,
  options,
  onPick,
  onClose,
}: {
  open: boolean
  /** Everything eligible for a basket that is not already in this one. */
  options: readonly ShelfProduct[]
  onPick: (p: ShelfProduct) => void
  onClose: () => void
}): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a scheme"
      sub="Everything on IDBI's shelf a basket may hold. Adding one does not re-split the others."
    >
      <div className="divide-y divide-solid divide-hairline-mint pb-2">
        {options.length === 0 ? (
          <p className="mb-0 mt-0 py-4 text-sm leading-relaxed text-ink-soft">
            This basket already holds everything its rule allows.
          </p>
        ) : (
          options.map((p) => (
            <ListRow
              key={p.productId}
              /* The issuer's mark, the same one the shelf and the basket lines carry. This was
                 the one list of products in the app with nothing in the leading slot, which read
                 as a settings menu of scheme names beside four lists that read as a shelf. */
              icon={<SchemeGlyph manufacturer={p.manufacturer} />}
              title={p.name}
              sub={`${p.riskometer} risk · ${lockLabel(p.lockInYears)} · from ${inr(p.minInvestment)}`}
              onClick={() => onPick(p)}
            />
          ))
        )}
      </div>
    </Sheet>
  )
}
