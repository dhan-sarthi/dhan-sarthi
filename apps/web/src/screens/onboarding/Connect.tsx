/**
 * Step 1 — read the accounts, then show what came back.
 *
 * Two beats, and the second one is new. The wait is still four live calls ticking one at a time,
 * because a wait that shows what it is doing is a different experience from a wait that does
 * not. But the reference does something after its fetch that this screen never did: on
 * `02-onboarding/05-profile-kyc-details` it renders the fetched file straight back at the
 * customer — a dark header with their name and a verified chip, then `BANK DETAILS`,
 * `DEMAT DETAILS`, `PERSONAL DETAILS` as full-bleed bands over a two-column label/value grid.
 * It is the most considered screen in the feature and it is the one ours most obviously wanted:
 * we were already fetching all of this and reporting it as four one-line summaries.
 *
 * So the rows do the waiting and the card does the telling. When the last reply lands the rows
 * fold into a strip of four ticked chips — the record that all four calls answered, kept, but
 * no longer taking a third of the screen — and the card opens underneath.
 *
 * What is not on the card, because IDBI does not send it: PAN, demat, gender, marital status.
 * The reference has a row for each. Fabricating them is the one thing this flow cannot do.
 */
import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { Band, Detail, DetailGrid, Funnel } from './Chrome.tsx'
import { PROBES, monthYear } from './facts.ts'
import type { Facts, Probe, StepKey } from './facts.ts'

export function Connect({
  first,
  ticked,
  facts,
  failed,
  onRetry,
  onNext,
}: {
  first: string | null
  ticked: StepKey[]
  /** Filled in reply by reply, so each row reports its own call rather than the batch. */
  facts: Facts
  failed: string | null
  onRetry: () => void
  onNext: () => void
}): ReactNode {
  const settled = ticked.length === PROBES.length && failed === null
  return (
    <Funnel
      at="Accounts"
      /* Not a clean third: the rail moves inside the step as the calls land, which is what the
         reference's ~16%-at-step-1 fill is doing too. */
      fill={settled ? 0.22 : 0.08}
      action={
        <Button full disabled={!settled} onClick={onNext}>
          {settled ? 'Next' : 'Reading your accounts…'}
          {settled ? <ArrowRight size={17} strokeWidth={2.6} /> : null}
        </Button>
      }
    >
      <h1 className="m-0 text-[26px] font-semibold leading-tight text-ink">
        {first === null ? 'Reading your accounts' : `Reading ${first}’s accounts`}
      </h1>
      <p className="m-0 mb-5 mt-2 text-[14.5px] leading-normal text-ink-mid">
        Straight from IDBI, live. Nothing here is stored in this browser.
      </p>

      {settled ? (
        <>
          <div className="ds-fade mb-4 flex gap-1.5">
            {/* Narrower than `Pill` on purpose: four of these have to sit on one line at 430px,
                and four chips that wrap to two rows read as a list rather than as a receipt. */}
            {PROBES.map((probe) => (
              <span
                key={probe.key}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-pill bg-legend-chip px-1.5 py-[5px] text-[11.5px] font-semibold text-brand-deep"
              >
                <Check size={12} strokeWidth={3} className="flex-none" />
                <span className="truncate">{LANDED[probe.key]}</span>
              </span>
            ))}
          </div>
          <FileCard facts={facts} />
        </>
      ) : (
        <ul className="m-0 list-none p-0">
          {PROBES.map((probe, i) => (
            <ProbeRow
              key={probe.key}
              probe={probe}
              index={i}
              done={ticked.includes(probe.key)}
              facts={facts}
            />
          ))}
        </ul>
      )}

      {failed !== null ? (
        <div className="ds-rise mt-6">
          <p role="alert" className="m-0 mb-3 text-[13.5px] leading-normal text-danger">
            {failed}
          </p>
          <Button tone="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </Funnel>
  )
}

/** One word each, because the chips are a receipt and not a summary. */
const LANDED: Record<StepKey, string> = {
  accounts: 'Accounts',
  statement: 'Statement',
  consents: 'Consents',
  holdings: 'Holdings',
}

/**
 * The reference's profile card, on IDBI's data.
 *
 * A `bg-brand-deep` head is the honest translation of its navy one: it is the *mechanism* that
 * makes a white card read as a file the bank handed over, and `03-PALETTE-MAP.md` §2 is explicit
 * that the trick has to be rebuilt in green rather than recoloured out of existence. The
 * verified chip on the reference is green-on-navy; ours is `accent-soft` on the deep green,
 * because green-on-green is the one pairing this palette cannot make.
 */
function FileCard({ facts }: { facts: Facts }): ReactNode {
  const c = facts.customer
  const a = facts.account
  if (c === null) return null
  return (
    <div className="ds-rise mb-3 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface">
      <div className="flex flex-col items-center bg-brand-deep px-4 pb-4 pt-5 text-on-dark">
        <span className="grid size-16 place-items-center rounded-pill bg-surface text-[21px] font-bold text-brand-deep">
          {initials(c.name)}
        </span>
        <span className="mt-2.5 text-[20px] font-bold leading-tight">{c.name}</span>
        <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-accent-soft px-[11px] py-[5px] text-xs font-semibold text-brand-deep">
          <Check size={13} strokeWidth={3} />
          Read from IDBI
        </span>
      </div>

      <div className="px-4 pb-1">
        <Band>Bank details</Band>
        <DetailGrid>
          <Detail
            label="Accounts"
            value={`${facts.accounts} ${facts.accounts === 1 ? 'account' : 'accounts'}`}
          />
          <Detail label="Total balance" value={inr(facts.balance)} />
          {a !== null ? (
            <>
              <Detail label="Account number" value={a.accountNumberMasked} />
              <Detail label="Type" value={a.accountType} />
              {a.branchIfsc !== undefined ? <Detail label="IFSC" value={a.branchIfsc} /> : null}
              <Detail label="With IDBI since" value={monthYear(a.accountOpeningDate)} />
            </>
          ) : null}
        </DetailGrid>

        <Band>What the statement shows</Band>
        <DetailGrid>
          <Detail label="Lines read" value={`${facts.lines}${facts.more ? '+' : ''}`} />
          <Detail
            label="History"
            value={
              facts.months > 0
                ? `${facts.months} ${facts.months === 1 ? 'month' : 'months'}`
                : 'Not enough to say'
            }
          />
          {facts.debt > 0 ? (
            <>
              <Detail label="Borrowing" value={inr(facts.debt)} />
              {/* Only where the bank reported an instalment. Neha's loans come back with no
                  monthly outgo at all, and "₹0 a month" is a claim rather than a gap. */}
              <Detail
                label="Repaid monthly"
                value={facts.outgo > 0 ? inr(facts.outgo) : 'Not reported'}
              />
            </>
          ) : null}
        </DetailGrid>

        {/* Two rows, not the reference's six. Its PAN, gender and marital status are not on this
            feed; the locale code is, and `en-IN` is not a fact to show a customer; and dependents
            is the next screen's question, so answering it here with the profile's default would
            be the flow contradicting itself. */}
        <Band>Personal details</Band>
        <DetailGrid>
          <Detail label="Age" value={`${c.age}`} />
          <Detail label="City" value={c.city} />
        </DetailGrid>

        <Band>Elsewhere</Band>
        <DetailGrid>
          <Detail
            label="Already recorded"
            value={
              facts.holdings === 0
                ? 'Nothing yet'
                : `${facts.holdings} ${facts.holdings === 1 ? 'thing' : 'things'}`
            }
          />
          <Detail
            label="Linked at the aggregator"
            value={facts.consents === 0 ? 'None' : `${facts.consents} live`}
          />
        </DetailGrid>
      </div>

      <p className="m-0 border-0 border-t border-solid border-hairline-mint px-4 py-3 text-xs leading-relaxed text-ink-soft">
        This is what IDBI sends. There is no PAN, no demat and no KYC status on the feed, so there
        is no row for one.
      </p>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

function ProbeRow({
  probe,
  index,
  done,
  facts,
}: {
  probe: Probe
  index: number
  done: boolean
  facts: Facts
}): ReactNode {
  const Icon = probe.icon
  return (
    <li
      className="ds-rise ds-stagger mb-2.5 flex items-center gap-3 rounded-md border border-solid border-hairline-mint bg-surface p-3.5"
      style={{ '--i': index } as CSSProperties}
    >
      <span
        className={`grid size-9 flex-none place-items-center rounded-pill ${
          done ? 'bg-brand text-on-dark' : 'bg-ground-deep text-ink-soft'
        }`}
      >
        {/* The subject of the call while it is in flight, a tick once it lands. A spinner in
            every row would say four times over what the moving line underneath already says. */}
        {done ? (
          <span className="ds-tick grid place-items-center">
            <Check size={17} strokeWidth={3} />
          </span>
        ) : (
          <Icon size={17} strokeWidth={2.2} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-snug text-ink">
          {probe.doing}
        </span>
        {done ? (
          <span className="ds-fade block text-[12.5px] leading-snug text-ink-soft">
            {probe.done(facts)}
          </span>
        ) : (
          <span className="relative mt-1.5 block h-1 overflow-hidden rounded-pill bg-ground-deep text-accent-soft">
            <span className="ds-track absolute inset-0 block" />
          </span>
        )}
      </span>
    </li>
  )
}
