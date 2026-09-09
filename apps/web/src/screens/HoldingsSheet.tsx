/**
 * What the customer already owns, editable.
 *
 * IDBI has no holdings endpoint. No mutual fund, no deposit book, no NPS, no insurance, and a
 * consented pull returns other banks' deposit accounts rather than a portfolio. So this block
 * is the app's own, and without it the advice is given into a vacuum: an equity fund suggested
 * to somebody already holding three, or a protection gap reported for cover that exists.
 *
 * Adding one is deliberately quick. A customer who has to fill in eight fields to record a fund
 * will not record it, and a portfolio that is half entered is worse than one that is empty,
 * because the gap analysis then runs on a number nobody meant.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { HoldingsResponse } from '@dhan/contracts'
import { Sheet } from '../components/Sheet.tsx'
import { Button, Skeleton } from '../components/ui.tsx'
import { Choice, Field, MoneyInput, TextInput } from '../components/Form.tsx'
import { api, isApiError } from '../api/client.ts'
import { inr } from '../lib/money.ts'
import { useRipple } from '../lib/motion.ts'

/**
 * The five things a customer can name, and what each one implies.
 *
 * Not the domain's six holding types: `RD` and `PPF` are both "money put aside that pays
 * interest" to the person entering them, and asking somebody to tell a recurring deposit from a
 * provident fund before they can save a row is a form designed for the schema rather than the
 * person. The asset class is what the engine reads, and it is inferred here.
 */
const KINDS = [
  { id: 'fund', label: 'A fund' },
  { id: 'deposit', label: 'A deposit' },
  { id: 'ppf', label: 'PPF or NPS' },
  { id: 'cover', label: 'Insurance' },
] as const
type Kind = (typeof KINDS)[number]['id']

const SHAPE: Record<
  Kind,
  {
    holdingType: 'MUTUAL_FUND' | 'FD' | 'PPF' | 'INSURANCE'
    assetClass: 'Equity' | 'Debt' | 'Protection'
  }
> = {
  fund: { holdingType: 'MUTUAL_FUND', assetClass: 'Equity' },
  deposit: { holdingType: 'FD', assetClass: 'Debt' },
  ppf: { holdingType: 'PPF', assetClass: 'Debt' },
  cover: { holdingType: 'INSURANCE', assetClass: 'Protection' },
}

interface Draft {
  kind: Kind
  name: string
  value: number
  invested: number
  sip: number
}

const EMPTY: Draft = { kind: 'fund', name: '', value: 0, invested: 0, sip: 0 }

export function HoldingsSheet({
  open,
  onClose,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  onChanged: (message: string) => void
}): ReactNode {
  const [held, setHeld] = useState<HoldingsResponse | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ripple = useRipple()

  const load = useCallback(async (): Promise<void> => {
    try {
      const next = await api('getHoldings')
      setHeld(next)
      setError(null)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Your holdings could not be read.')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // Off the effect's own tick, as everywhere else in this app: state changes when the reply
    // arrives, never during the effect that asked for it.
    queueMicrotask(() => void load())
  }, [open, load])

  const add = async (): Promise<void> => {
    const shape = SHAPE[draft.kind]
    const name = draft.name.trim()
    if (name === '' || draft.value <= 0) return
    setBusy(true)
    setError(null)
    try {
      await api('addHolding', {
        body: {
          holdingType: shape.holdingType,
          assetClass: shape.assetClass,
          name,
          // A policy's cover goes in `investedAmount` and its value stays zero: cover is not
          // capital, and a net worth that counted a sum assured would be wrong by the cover.
          investedAmount: draft.kind === 'cover' ? draft.value : draft.invested || draft.value,
          currentValue: draft.kind === 'cover' ? 0 : draft.value,
          sipActive: draft.sip > 0,
          ...(draft.sip > 0 ? { sipAmount: draft.sip } : {}),
        },
      })
      setDraft(EMPTY)
      setAdding(false)
      await load()
      onChanged('Added. Your plan has been recalculated.')
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be added.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (holdingId: string, name: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await api('removeHolding', { params: { holdingId } })
      await load()
      onChanged(`Removed ${name}.`)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  const rows = held === null ? [] : [...held.holdings, ...held.policies]
  const readOnly = held !== null && !held.editable

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What you own"
      sub="The bank has no record of this. It is what you tell us, and the advice is built on it."
      footer={
        readOnly ? null : adding ? (
          <div className="flex gap-2">
            <Button tone="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              full
              busy={busy}
              disabled={draft.name.trim() === '' || draft.value <= 0}
              onClick={() => void add()}
            >
              Add it
            </Button>
          </div>
        ) : (
          <Button full tone="secondary" onClick={() => setAdding(true)}>
            <Plus size={17} strokeWidth={2.6} />
            Add something you own
          </Button>
        )
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-3 mt-1 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}

      {held === null ? (
        <div className="pt-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={62} className="mb-2.5" />
          ))}
        </div>
      ) : adding ? (
        <div className="pt-1">
          <Field label="What kind of thing is it?">
            <Choice
              options={KINDS}
              value={draft.kind}
              onChange={(k) => setDraft({ ...draft, kind: k })}
            />
          </Field>
          <Field label="What is it called?">
            <TextInput
              ariaLabel="Name"
              value={draft.name}
              maxLength={80}
              placeholder={draft.kind === 'cover' ? 'Term Life, HDFC' : 'Nifty 50 Index Fund'}
              onChange={(v) => setDraft({ ...draft, name: v })}
            />
          </Field>
          <Field
            label={
              draft.kind === 'cover' ? 'How much are you covered for?' : 'What is it worth today?'
            }
          >
            <MoneyInput
              ariaLabel="Value"
              value={draft.value}
              onChange={(n) => setDraft({ ...draft, value: n })}
            />
          </Field>
          {draft.kind !== 'cover' ? (
            <>
              <Field
                label="What did you put in?"
                hint="Leave blank if you would rather not work it out."
              >
                <MoneyInput
                  ariaLabel="Invested"
                  value={draft.invested}
                  onChange={(n) => setDraft({ ...draft, invested: n })}
                />
              </Field>
              <Field
                label="Anything going in each month?"
                hint="A SIP or a standing instruction. Leave at zero if not."
              >
                <MoneyInput
                  ariaLabel="Monthly amount"
                  value={draft.sip}
                  onChange={(n) => setDraft({ ...draft, sip: n })}
                />
              </Field>
            </>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <div className="ds-rise rounded-md bg-tint-sage p-4">
          <p className="m-0 text-[14.5px] font-semibold leading-snug text-ink">
            Nothing recorded yet
          </p>
          <p className="m-0 mt-1.5 text-[13px] leading-normal text-ink-mid">
            Without this we cannot tell whether you already hold what we are about to suggest, or
            whether the cover you have is enough.
          </p>
        </div>
      ) : (
        <ul className="m-0 list-none p-0 pt-1">
          {rows.map((h, i) => (
            <li
              key={h.holdingId}
              className="ds-rise ds-stagger mb-2.5 flex items-center gap-3 rounded-md border border-solid border-hairline-mint bg-surface p-3"
              style={{ '--i': i } as React.CSSProperties}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold leading-snug text-ink">
                  {h.name}
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink-soft">
                  {h.assetClass === 'Protection'
                    ? `${inr(h.investedAmount)} of cover`
                    : `${inr(h.currentValue)}${h.sipActive && h.sipAmount ? ` · ${inr(h.sipAmount)} a month` : ''}`}
                </div>
              </div>
              {readOnly ? null : (
                <button
                  type="button"
                  aria-label={`Remove ${h.name}`}
                  disabled={busy}
                  onPointerDown={ripple}
                  onClick={() => void remove(h.holdingId, h.name)}
                  className="ds-press grid h-10 w-10 flex-none place-items-center rounded-pill border-0 bg-danger-soft text-danger disabled:opacity-50"
                >
                  <Trash2 size={16} strokeWidth={2.3} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {readOnly ? (
        <p className="mb-1 mt-4 text-xs leading-relaxed text-ink-soft">
          This data source brings its own holdings, so there is nothing here for the app to change.
        </p>
      ) : null}
    </Sheet>
  )
}
