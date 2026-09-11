/**
 * `cas-sync-success` — "Portfolio synced successfully".
 *
 * The frame is a bottom-anchored composition on white: a green check disc ringed by four-colour
 * confetti, a bold headline, three lines of grey copy, and `View Holdings` at the foot. Ours is
 * the same beat in the shape `onboarding/Ready.tsx` established for this app — a full-bleed
 * tinted band carrying the mark and the headline, so the top of the screen is a surface rather
 * than 400px of white, and the action pinned at the bottom where the frame has it.
 *
 * Two things this screen says that the frame's does not.
 *
 * **What actually landed.** Theirs says "have been fetched successfully" and shows no count, no
 * amount and no timestamp. A success beat that names nothing is indistinguishable from one that
 * happened to nothing, so this one prints the number of folios, what they are worth and what
 * they cost — the three figures the record now holds because of the last tap.
 *
 * **That nothing was fetched.** The strip at the foot is the same one the two screens before it
 * carried. This is the screen where the claim would be strongest — "synced", "fetched
 * successfully" — so it is the screen where the qualification matters most.
 *
 * A `role="status"` announcement rather than a heading change: a customer using a screen reader
 * needs to hear the outcome, not to discover it by exploring.
 */
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'
import { Art } from '../../components/Art.tsx'
import { Button, Card, Head, Leader } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { DemoStrip } from './parts.tsx'
import type { CasFolio } from './cas.ts'

export function CasSynced({
  written,
  persisted,
  skipped,
  onViewHoldings,
  onDone,
}: {
  /** The folios this run brought in. */
  written: readonly CasFolio[]
  /** They went onto the record. False: they are held for this session and nowhere else. */
  persisted: boolean
  /** Folios already imported before this run, so nothing was done for them. */
  skipped: number
  onViewHoldings: () => void
  onDone: () => void
}): ReactNode {
  const value = written.reduce((n, f) => n + f.value, 0)
  const invested = written.reduce((n, f) => n + f.invested, 0)
  const sip = written.reduce((n, f) => n + f.sipMonthly, 0)
  const count = written.length

  return (
    <Screen
      header={
        <Head
          title="Statement imported"
          sub={
            persisted
              ? 'Held outside IDBI, now on your record'
              : 'Held outside IDBI, and held here for this session'
          }
        />
      }
      footer={
        <div className="flex gap-2">
          <Button tone="quiet" onClick={onDone}>
            Done
          </Button>
          <Button full onClick={onViewHoldings}>
            View holdings
            <ArrowRight size={17} strokeWidth={2.6} />
          </Button>
        </div>
      }
    >
      <div className="-mx-4 -mt-3 flex flex-col items-center bg-tint-sage px-6 pb-7 pt-6 text-center">
        <Art name="external-synced" size="md" />
        <h1 role="status" className="m-0 mt-3 text-[26px] font-semibold leading-tight text-ink">
          {count === 0
            ? 'Nothing left to import'
            : `${count} ${count === 1 ? 'folio' : 'folios'} added`}
        </h1>
        <p className="m-0 mt-2 max-w-[32ch] text-[14.5px] leading-normal text-ink-mid">
          {count === 0
            ? 'Every folio on the statement had already been imported, so nothing was done twice.'
            : persisted
              ? 'They are ordinary holdings now — counted in your totals, charted in the analytics, and read by the suitability gate before it lets you buy another fund.'
              : 'They are on the list on the next screen and nowhere else: this data source owns the holdings block, so nothing was written to your record.'}
        </p>
      </div>

      {count > 0 ? (
        <Card>
          <h2>{persisted ? 'What went in' : 'What is on the list'}</h2>
          <div className="mt-1.5">
            <Leader label="Folios" value={String(count)} />
            <Leader label="Cost recorded" value={inr(invested)} />
            {sip > 0 ? <Leader label="Monthly mandates" value={`${inr(sip)} a month`} /> : null}
            <Leader total label="Value on the statement" value={inr(value)} />
          </div>
          {skipped > 0 ? (
            <p className="mb-0 mt-2 text-[13px] leading-snug text-ink-soft">
              {skipped} {skipped === 1 ? 'folio had' : 'folios had'} already been imported and{' '}
              {skipped === 1 ? 'was' : 'were'} left alone.
            </p>
          ) : null}
        </Card>
      ) : null}

      <DemoStrip>
        Nothing was fetched. The folios above came from the fixture this build ships, not from MF
        Central.{' '}
        {persisted ? (
          <>
            They were written into your holdings by the same call <i>What you own</i> uses — which
            is also where you can change or remove any of them.
          </>
        ) : (
          <>
            They were not written anywhere: this data source serves its own holdings, so the list
            holds them for the length of this session and they are gone when the app reloads.
          </>
        )}
      </DemoStrip>
    </Screen>
  )
}
