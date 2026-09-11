/**
 * Configure a statement and generate it.
 *
 * The form is `spec/screens/13-reports/03-report-capital-gain-config.md`: a tenure radio group
 * with a conditional From/To pair, a hairline, a delivery radio group, two lines of helper text
 * and one full-width button. Three things about it are deliberately not reproduced.
 *
 * **The years are computed.** The source shows `Current Financial Year (2022 -  2023)` above
 * `Previous Financial Year (2022 -  2023)`. Only one of those can be right, and its own spec
 * flags it. Here each radio also carries the dates it resolves to, because a customer who has to
 * work out what "current financial year" means on 1 September is being asked to trust a window
 * they cannot see.
 *
 * **The delivery choice is honest about being one option.** The source's helper line names a
 * registered email address, and its success dialog names a different one — two unbound demo
 * strings. This app holds no address at all, so the email option is present, off, and says why.
 *
 * **Nothing is generated blind.** `Continue` in the source goes straight to a green tick with no
 * loading, validation, empty or failure state anywhere in the footage. Here the range is checked
 * against the ledger before the button is live, an empty result is a message rather than a file
 * with only headers in it, and a failure says what failed.
 *
 * ## What frame 09 corrected
 *
 * The radios were bordered cards. The frame has none — a 20px ring, a label beside it, a ~44dp
 * pitch and white between them. Six cards on a two-question form read as six decisions; the form
 * asks two. `OptionRow size="bare"` is that row, and the ring moved to the left of the label
 * because a radio list is read down its ring column.
 *
 * The holding sheet (`05-report-holding-statement-sheet.md`, frame 05) is one centred question:
 * a title, two centred grey lines, an outlined `Date` field with a calendar adornment, and the
 * button. This app cannot answer that question — `getHoldings` returns a current position with no
 * history behind it, so there is no earlier date to pick and a picker would be a control that
 * lies. The field is therefore drawn and *locked*: the frame's shape, holding the one date that
 * is true, with the reason under it. Filling the slot with a paragraph instead, which is what the
 * first build did, left two-thirds of the screen empty and lost the composition entirely.
 *
 * The From/To pair runs to the gutter, flush with the radios above it, not indented to the
 * label column — the spec text says "indented to the radio-label column" and frame 09 plainly
 * does not: heading, ring and field box all share one left edge. The picture wins.
 *
 * The helper text sits *above* the button in every frame, under the full-width hairline that
 * separates the footer from the form — it is a note about what the button will do, and a note
 * that follows the button it explains is a note nobody reads. `Screen`'s footer already draws
 * that hairline, so the fix was only the order.
 *
 * And the success dialog leads with a large thin-stroke green ring holding a check, which is the
 * only piece of the reference's report flow that is purely emotional and the reason a customer
 * believes the file exists. `--good` is an alias of `--brand`, so their bright green survives the
 * palette translation as the ring it already is.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, Check, Download } from 'lucide-react'
import type { Transaction, View } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Sheet } from '../../components/Sheet.tsx'
import { Button, Head, Leader } from '../../components/ui.tsx'
import { Field, TextInput } from '../../components/Form.tsx'
import { api, isApiError } from '../../api/client.ts'
import { longDate } from '../../lib/money.ts'
import { OptionRow } from './parts.tsx'
import {
  DELIVERY_UNAVAILABLE,
  coverage,
  fileName,
  financialYear,
  holdingsCsv,
  rangeFor,
  transactionsCsv,
} from './reports.ts'
import type { DateRange, ReportKind, ReportMeta, Tenure } from './reports.ts'

/** One page is 200 lines and the ledger is two years; the cap is a runaway guard, not a limit. */
const MAX_PAGES = 40

const TITLE: Record<ReportKind, string> = {
  transactions: 'Transaction statement',
  holdings: 'Holding statement',
}

interface Done {
  name: string
  rows: number
  range: DateRange | null
}

export function ReportForm({
  kind,
  view,
  onBack,
}: {
  kind: ReportKind
  view: View
  onBack: () => void
}): ReactNode {
  const { meta, snapshot } = view
  const horizon = meta.ledgerHorizon

  const [tenure, setTenure] = useState<Tenure>('previous-fy')
  const [custom, setCustom] = useState<DateRange>({ from: horizon.from, to: horizon.to })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [done, setDone] = useState<Done | null>(null)

  const requested = rangeFor(tenure, meta.asOf, custom)
  const cover = coverage(requested, horizon)
  /* Holdings have no period at all — see below — so the tenure gate does not apply to them. */
  const ready = kind === 'holdings' || cover.range !== null

  const reportMeta: ReportMeta = {
    customerName: snapshot.customer.name,
    snapshotId: meta.snapshotId,
    asOf: meta.asOf,
    source: SOURCE_LABEL[meta.source],
  }

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setEmpty(false)
    try {
      if (kind === 'holdings') {
        const held = await api('getHoldings')
        const rows = held.holdings.length + held.policies.length
        if (rows === 0) {
          setEmpty(true)
          return
        }
        const name = fileName('holdings', null, meta.asOf)
        download(name, holdingsCsv(held.holdings, held.policies, reportMeta))
        setDone({ name, rows, range: null })
        return
      }

      const range = cover.range
      if (!range) return
      const items = await readAll(range)
      if (items.length === 0) {
        setEmpty(true)
        return
      }
      const name = fileName('transactions', range, meta.asOf)
      download(name, transactionsCsv(items, range, reportMeta))
      setDone({ name, rows: items.length, range })
    } catch (err) {
      setError(
        isApiError(err)
          ? err.unreachable
            ? 'The advisor service could not be reached, so there was nothing to build the statement from. Nothing was downloaded.'
            : err.message
          : 'The statement could not be built. Nothing was downloaded.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      header={<Head title={TITLE[kind]} sub={snapshot.customer.name} onBack={onBack} />}
      footer={
        <>
          <p className="mb-3 mt-0 text-center text-xs leading-snug text-ink-soft">
            A <b className="font-semibold text-ink-mid">CSV file</b>, saved to this device. It opens
            in Excel and in any spreadsheet.
          </p>
          <Button full busy={busy} disabled={!ready} onClick={() => void generate()}>
            <Download size={17} strokeWidth={2.3} />
            {busy ? 'Building it' : 'Download statement'}
          </Button>
        </>
      }
      after={
        <Sheet
          open={done !== null}
          onClose={() => setDone(null)}
          title="Statement downloaded"
          footer={
            <Button full onClick={() => setDone(null)}>
              Okay
            </Button>
          }
        >
          {done ? (
            <div className="pt-1">
              <SuccessRing />
              <p className="m-0 mb-4 mt-3 text-center text-[15px] leading-snug text-ink-mid">
                Saved to this device as{' '}
                <b className="break-all font-semibold text-ink">{done.name}</b>
              </p>
              <Leader label="Lines in the file" value={String(done.rows)} filled />
              {done.range ? (
                <Leader
                  label="Period"
                  value={`${longDate(done.range.from)} – ${longDate(done.range.to)}`}
                />
              ) : (
                <Leader label="As on" value={longDate(meta.asOf)} />
              )}
              <Leader label="Source" value={reportMeta.source} />
              <p className="mb-1 mt-4 text-[13px] leading-relaxed text-ink-soft">
                Check your downloads if your browser did not offer to save it. Nothing was emailed
                and nothing left this device — the file was built here, from data already on screen.
              </p>
            </div>
          ) : null}
        </Sheet>
      }
    >
      {kind === 'transactions' ? (
        <>
          <h2 className="m-0 mb-2 mt-4 text-[17px] font-semibold text-ink">Select tenure</h2>
          <div role="radiogroup" aria-label="Select tenure">
            <TenureOption
              tenure="current-fy"
              selected={tenure}
              onSelect={setTenure}
              label={`Current financial year (${financialYear(meta.asOf).label})`}
              asOf={meta.asOf}
            />
            <TenureOption
              tenure="previous-fy"
              selected={tenure}
              onSelect={setTenure}
              label={`Previous financial year (${financialYear(meta.asOf, 1).label})`}
              asOf={meta.asOf}
            />
            <OptionRow
              size="bare"
              label="Custom dates"
              selected={tenure === 'custom'}
              onSelect={() => setTenure('custom')}
            />
          </div>

          {tenure === 'custom' ? (
            <div className="mb-1 mt-2 grid grid-cols-2 gap-4">
              <Field label="From">
                <TextInput
                  type="date"
                  ariaLabel="From date"
                  value={custom.from}
                  onChange={(v) => setCustom((c) => ({ ...c, from: v }))}
                />
              </Field>
              <Field label="To">
                <TextInput
                  type="date"
                  ariaLabel="To date"
                  value={custom.to}
                  onChange={(v) => setCustom((c) => ({ ...c, to: v }))}
                />
              </Field>
            </div>
          ) : null}

          <Coverage cover={cover} horizon={horizon} />

          <div className="-mx-4 my-5 border-0 border-t border-solid border-hairline-mint" />

          <h2 className="m-0 mb-2 text-[17px] font-semibold text-ink">
            How do you want your report?
          </h2>
          <div role="radiogroup" aria-label="How do you want your report?">
            <OptionRow
              size="bare"
              label="Download to this device"
              selected
              onSelect={() => undefined}
            />
            <OptionRow
              size="bare"
              label="Email it to your registered address"
              sub={DELIVERY_UNAVAILABLE}
              selected={false}
              disabled
              onSelect={() => undefined}
            />
          </div>
        </>
      ) : (
        <AsOnDate asOf={meta.asOf} />
      )}

      {empty ? (
        <div
          role="status"
          className="mb-3 mt-3 rounded-md bg-tint-clay p-3.5 text-[13.5px] leading-relaxed text-accent-text"
        >
          {kind === 'holdings'
            ? 'You have not recorded anything you own, so there is nothing to put in a holding statement. Add it under More → What you already own and try again.'
            : 'There is not a single line in that window, so the file would be nothing but column headings. Nothing was downloaded — widen the dates and try again.'}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-3 mt-3 rounded-md bg-danger-soft p-3.5 text-[13.5px] leading-relaxed text-danger"
        >
          {error}
        </div>
      ) : null}
    </Screen>
  )
}

/* ---------------------------------------------------------------- Pieces */

/**
 * The holding statement's date, drawn as frame 05's field and locked.
 *
 * Outlined box, floating label, calendar adornment, centred copy above it — their sheet's whole
 * composition. What differs is that the control does not open: `ink-faint` on `ground-deep`
 * rather than the live field's white, and a sentence saying why rather than a disabled attribute
 * and silence. `DESIGN.md` keeps `ink-faint` for furniture, and a date you cannot change is
 * furniture; the date itself stays `ink` because it is the fact the screen is about.
 */
function AsOnDate({ asOf }: { asOf: string }): ReactNode {
  return (
    <div className="mx-auto mt-6 max-w-[330px]">
      <p className="m-0 text-center text-[15px] leading-snug text-ink-mid">
        The date this statement is taken on.
      </p>

      <div className="relative mt-6">
        <span className="absolute -top-2 left-3 bg-surface px-1 text-[12px] font-medium text-ink-soft">
          Date
        </span>
        <div className="flex h-[54px] items-center gap-3 rounded-md border-[1.5px] border-solid border-hairline-mint bg-ground-deep px-3.5">
          <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-ink">
            {longDate(asOf)}
          </span>
          <CalendarDays
            size={20}
            strokeWidth={1.9}
            className="flex-none text-ink-faint"
            aria-hidden="true"
          />
        </div>
      </div>

      <p className="m-0 mt-3.5 text-[13px] leading-relaxed text-ink-soft">
        There is no other date to pick. A holding statement for an earlier day would need a record
        of what you held on that day, and this app keeps only your current position — one invested
        figure and one current value per holding, as you or the bank last told it. So this is
        today&rsquo;s position, and the file says so on its first page rather than leaving you to
        assume it.
      </p>
    </div>
  )
}

/**
 * The green ring, from `06-report-success-dialog.md`.
 *
 * A ~150dp thin-stroke circle holding a bold check, above the confirmation. It is the one part of
 * the source's report flow that carries no information at all, and dropping it for a tidy row of
 * facts was what made the first build of this sheet feel like a receipt rather than a result.
 * `border-brand` because `--good` aliases `--brand`, so their `#50CD35` needs no invention here.
 *
 * `aria-hidden`, and the sentence under it is what a screen reader gets — a tick is decoration
 * even when it is the biggest thing on the panel.
 */
function SuccessRing(): ReactNode {
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      <span className="grid size-[118px] place-items-center rounded-pill border-[7px] border-solid border-brand text-brand">
        <Check size={54} strokeWidth={3.2} />
      </span>
    </div>
  )
}

const SOURCE_LABEL: Record<View['meta']['source'], string> = {
  'idbi-sandbox': 'IDBI',
  postgres: 'Seeded database',
  memory: 'Synthetic ledger',
}

/** A financial-year radio that also shows the window it means. */
function TenureOption({
  tenure,
  selected,
  onSelect,
  label,
  asOf,
}: {
  tenure: Exclude<Tenure, 'custom'>
  selected: Tenure
  onSelect: (t: Tenure) => void
  label: string
  asOf: string
}): ReactNode {
  const fy = financialYear(asOf, tenure === 'previous-fy' ? 1 : 0)
  return (
    <OptionRow
      size="bare"
      label={label}
      sub={`${longDate(fy.from)} to ${longDate(fy.to)}`}
      selected={selected === tenure}
      onSelect={() => onSelect(tenure)}
    />
  )
}

/**
 * What the ledger can actually answer for the chosen window.
 *
 * Three states, none of which the source has: the range is backwards, the ledger holds none of
 * it, or the ledger holds part of it. The third is the common one — a twenty-four-month ledger
 * covers the current financial year only up to today — and saying it before the file is built is
 * what stops a customer filing a statement that silently stops in September.
 */
function Coverage({
  cover,
  horizon,
}: {
  cover: ReturnType<typeof coverage>
  horizon: DateRange
}): ReactNode {
  if (cover.inverted) {
    return (
      <p
        role="alert"
        className="m-0 mt-3 rounded-md bg-danger-soft p-3 text-[13px] leading-snug text-danger"
      >
        The From date is after the To date.
      </p>
    )
  }
  if (!cover.range) {
    return (
      <p
        role="alert"
        className="m-0 mt-3 rounded-md bg-danger-soft p-3 text-[13px] leading-snug text-danger"
      >
        Nothing in that window is held. The ledger runs from {longDate(horizon.from)} to{' '}
        {longDate(horizon.to)}.
      </p>
    )
  }
  if (cover.clipped) {
    return (
      <p
        role="status"
        className="m-0 mt-3 rounded-md bg-tint-clay p-3 text-[13px] leading-snug text-accent-text"
      >
        The ledger only reaches part of that. The statement will cover{' '}
        <b className="font-semibold">
          {longDate(cover.range.from)} to {longDate(cover.range.to)}
        </b>
        , and says so on its first page.
      </p>
    )
  }
  return null
}

/* ---------------------------------------------------------------- Plumbing */

/** Every page in the window. The API is cursor-paged and a financial year is more than one page. */
async function readAll(range: DateRange): Promise<Transaction[]> {
  const items: Transaction[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res: { items: Transaction[]; nextCursor: string | null } = await api('listTransactions', {
      query: { from: range.from, to: range.to, limit: 200, ...(cursor ? { cursor } : {}) },
    })
    items.push(...res.items)
    cursor = res.nextCursor
    if (cursor === null) break
  }
  return items
}

/**
 * Hand the file to the browser.
 *
 * The BOM is not superstition: without it Excel on Windows reads the file as the system code page
 * and every ₹ and every non-ASCII name in it comes out as mojibake. The revoke is deferred
 * because revoking on the same tick as the click cancels the save in some browsers.
 */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}
