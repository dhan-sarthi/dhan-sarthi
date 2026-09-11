/**
 * `cas-landing` — what a consolidated account statement is, and the one button that starts one.
 *
 * The frame is a navy app bar, a line of grey copy, then a tall green gradient card carrying an
 * illustration, `External Investments`, two lines of subtitle and a blue `Generate CAS` button;
 * under it a white panel offering to upload a CAMS CAS you already have, and a help link.
 *
 * ## How that lands here
 *
 * **The green is the bar, not the card.** `DESIGN.md` is explicit that `Head tone="brand"` exists
 * for one job — giving a white card something to overlap — and that a hero drawn as a second dark
 * slab on the same screen throws the hierarchy away. So the reference's composition is rebuilt
 * rather than recoloured: the band is green, the hero is the white card hanging up into it, and
 * it carries the same four things in the same order (mark, title, two lines, primary action).
 *
 * **The intro paragraph moved below the hero.** It is above it in the frame, but the overlap
 * needs the card to be the screen's first block; a paragraph pushed into the green band would be
 * white-on-green body copy, which this app does not do. It reads as well underneath, and the
 * subtitle inside the card already says what the feature is for.
 *
 * ## What is omitted, and why
 *
 * - **`Upload Now` — a CAMS CAS file the user already has.** There is no parser behind it. A
 *   file picker that accepts a PDF and does nothing with it is the one thing §5 forbids.
 * - **`Learn how to manually generate CAMS CAS ›`.** A help destination that does not exist.
 * - **The `10:00` status bar.** Device chrome; the web does not draw it.
 *
 * ## What is here that the frame has not got
 *
 * The statement itself, printed before you consent to anything. This is the honesty condition of
 * `07-DECISIONS.md` §5 made concrete: the four folios are a fixture, so rather than asking a
 * reviewer to take that on trust behind an OTP, the screen shows exactly what the "fetch" will
 * return and exactly what pressing the button will bring in.
 */
import type { ReactNode } from 'react'
import { Download, FileText } from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'
import { Art } from '../../components/Art.tsx'
import { Amount, Button, Card, Head, Skeleton } from '../../components/ui.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { inr } from '../../lib/money.ts'
import { CAS_FOLIOS, casInvested, casTotal } from './cas.ts'
import type { CasFolio } from './cas.ts'
import { DemoStrip, FolioRow } from './parts.tsx'

export function CasLanding({
  loading,
  persisted,
  missing,
  imported,
  error,
  onGenerate,
  onViewHoldings,
  onBack,
}: {
  /** The holdings block has not come back yet, so it is not yet known what is already in it. */
  loading: boolean
  /**
   * Does this source let the app own holdings? False on `memory` and `postgres`, where the feed
   * serves its own portfolio — the import then holds the folios for the session instead, and
   * says so here before the customer starts rather than after.
   */
  persisted: boolean
  /** Folios on the statement that are not in the record yet. */
  missing: readonly CasFolio[]
  /** Folios on the statement an earlier run already brought in. */
  imported: readonly CasFolio[]
  error: string | null
  onGenerate: () => void
  onViewHoldings: () => void
  onBack: () => void
}): ReactNode {
  const all = imported.length > 0 && missing.length === 0
  return (
    <Screen
      scrollHeader
      overlap
      header={
        <Head
          tone="brand"
          overlap
          onBack={onBack}
          backLabel="Back to money held elsewhere"
          title="Account statement"
          sub="Mutual funds you hold outside IDBI"
        />
      }
    >
      {/* The hero. White on the green band, which is the overlap doing its one job. */}
      <Card tint="white">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2>External investments</h2>
            <p className="mb-0 mt-1.5 text-[14px] leading-normal text-ink-mid">
              Bring in the folios you hold with other fund houses, so every figure counts all your
              money, not just the part IDBI can see.
            </p>
          </div>
          <Art name="external-folios" size="sm" className="-mr-1 -mt-1" />
        </div>

        <div className="mt-4">
          {all ? (
            <Button full onClick={onViewHoldings}>
              <FileText size={17} strokeWidth={2.4} />
              View imported holdings
            </Button>
          ) : (
            <Button full disabled={loading} onClick={onGenerate}>
              <Download size={17} strokeWidth={2.4} />
              Generate CAS
            </Button>
          )}
        </div>

        {!persisted && !loading ? (
          <StatusBand tone="quiet" label="This data source serves its own holdings,">
            so the app cannot write to your record. The import is held for this session instead, and
            every row it adds says so.
          </StatusBand>
        ) : null}
      </Card>

      {error !== null ? (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}

      <DemoStrip>
        <b className="font-semibold text-ink">MF Central is not connected to this app.</b> No
        statement is requested and no code is sent. The {CAS_FOLIOS.length} folios below are a
        fixture — the same four, every run, for every customer.{' '}
        {persisted ? (
          <>
            What is real is everything after: they go on your record as holdings held outside IDBI,
            read there by the plan, the analytics and the suitability gate, and editable in{' '}
            <i>What you own</i>.
          </>
        ) : (
          <>
            Here they are shown for this session and go no further; on the IDBI seam the same button
            writes them to your record for good.
          </>
        )}
      </DemoStrip>

      <Card>
        <h2>What a CAS is</h2>
        <p className="mb-0 mt-1.5 text-[14px] leading-normal text-ink-mid">
          One statement listing every mutual-fund folio you hold, across every fund house. You ask
          MF Central, and the registrars — CAMS and KFintech — answer against the mobile number and
          PAN on your folios, after a one-time code.
        </p>
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2>The statement</h2>
          <span className="text-[12.5px] text-ink-soft">
            {CAS_FOLIOS.length} folios · {inr(casInvested(CAS_FOLIOS))} in
          </span>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <Amount value={casTotal(CAS_FOLIOS)} size="lg" />
          <span className="text-[13px] text-ink-soft">valued on the statement</span>
        </div>

        {loading ? (
          <div className="mt-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={54} className="mb-2" />
            ))}
          </div>
        ) : (
          <div className="mt-2 divide-y divide-solid divide-hairline-mint">
            {CAS_FOLIOS.map((f) => (
              <FolioRow key={f.folio} folio={f} muted={imported.some((i) => i.name === f.name)} />
            ))}
          </div>
        )}

        {/* Only ever drawn from what the record actually holds, so it cannot claim an import
            that did not happen — and it is why running the flow twice does not duplicate a
            folio: the second run has nothing left to write. */}
        {imported.length > 0 ? (
          <StatusBand
            tone="good"
            label={
              all
                ? `All ${CAS_FOLIOS.length} folios have already been imported,`
                : `${imported.length} of these ${imported.length === 1 ? 'has' : 'have'} already been imported,`
            }
            action={{ label: 'View', onClick: onViewHoldings }}
          >
            {all
              ? 'so there is nothing left to bring in.'
              : `so only the other ${missing.length} would be brought in.`}
          </StatusBand>
        ) : null}
      </Card>
    </Screen>
  )
}
