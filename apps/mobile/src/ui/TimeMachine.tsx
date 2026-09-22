// The clock, made movable and made visible.
//
// Everything on every screen is derived from a snapshot taken at a date: the daily action,
// the safe-to-spend figure, the roadmap, the insights. A demo that cannot move that date
// can only assert the numbers are computed. Moving it proves it — advance thirty days and
// the deposit matures, the action changes, the budget resets on payday.
//
// It is labelled as a simulation and lives inside the record rather than in the chrome,
// because a customer of a real bank must never wonder whether the date they are looking at
// is real. The API gates it behind `capabilities.simulatedClock` for the same reason.
//
// The three moves are a dial of round buttons — Cleo's Add cash · Card details row — rather
// than a stack of full-width pills. They are three sizes of one move, and three stacked pills
// read as three different commitments. Each move ends in a toast naming the new date, and
// every failure says what to do next: past the end of the ledger, go back to the start; beaten
// to it by another screen, here is where the clock is now; anything else, try again.
//
// A move carries the session version, so two screens pressing +30 cannot double-advance the
// ledger. The card keeps the session it last got back until the parent's re-read catches up:
// without that, a second press inside the gap would send the old version and lose to itself.
import { useState } from 'react'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Section } from '~/ui/Section'
import { ActionDial } from '~/ui/ActionDial'
import { useToast } from '~/ui/Toast'
import { api, ApiError } from '~/api/client'
import { fullDate } from '~/lib/money'
import type { SessionState } from '@dhan/contracts'

type Move = '7' | '30' | 'reset'

const FAILED = "Couldn't move the clock. Try again."

export function TimeMachine({
  session,
  onMoved,
}: {
  session: SessionState
  onMoved: (next: SessionState) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState<Move | null>(null)
  // What the last move came to, when it did not simply land. A clock moved elsewhere is news,
  // not a failure, so it is not drawn in the failure colour.
  const [error, setError] = useState<{ text: string; tone: 'danger' | 'ink' } | null>(null)
  const [moved, setMoved] = useState<SessionState | null>(null)

  // Whichever is newer: the parent's read, or the answer this card got back itself.
  const live = moved !== null && moved.version > session.version ? moved : session

  if (!live.capabilities.simulatedClock) return null

  async function run(move: Move) {
    setBusy(move)
    setError(null)
    try {
      const next =
        move === 'reset'
          ? await api.resetClock(live.version)
          : await api.advanceClock(move === '7' ? 7 : 30, live.version)
      setMoved(next)
      onMoved(next)
      toast.show(
        move === 'reset' ? `Back to ${fullDate(next.asOf)}` : `Today is now ${fullDate(next.asOf)}`,
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Another screen moved it first. Showing where it is now beats asking for a reopen.
        try {
          const current = await api.session()
          setMoved(current)
          onMoved(current)
          setError({ text: 'The clock had moved. Showing the new date.', tone: 'ink' })
        } catch {
          setError({ text: FAILED, tone: 'danger' })
        }
      } else if (err instanceof ApiError && err.status === 422) {
        setError({
          text: 'The ledger ends before then. Go back to the start instead.',
          tone: 'danger',
        })
      } else {
        setError({ text: FAILED, tone: 'danger' })
      }
    } finally {
      setBusy(null)
    }
  }

  const held = (move: Move) => busy !== null && busy !== move

  return (
    <>
      <Section title="The clock" />
      <Card className="p-lg">
        <Chip tone="streak" label="Simulation" />
        <Type role="heading" className="mt-md">
          Today is {fullDate(live.asOf)}
        </Type>

        {/* The dial sits under the date it moves, the way Cleo's sits under the balance, and
            the explanation follows it. Last in the card, the dial fell exactly where the toast
            floats when the page is scrolled to its foot, so a second move within the toast's
            two seconds landed on the toast instead. */}
        <ActionDial
          className="mt-lg"
          actions={[
            {
              id: '7',
              glyph: 'calendar',
              label: '+7 days',
              accessibilityLabel: 'Move forward 7 days',
              busy: busy === '7',
              disabled: held('7'),
              onPress: () => void run('7'),
            },
            {
              id: '30',
              glyph: 'arrowRight',
              label: '+30 days',
              accessibilityLabel: 'Move forward 30 days',
              busy: busy === '30',
              disabled: held('30'),
              onPress: () => void run('30'),
            },
            {
              id: 'reset',
              glyph: 'refresh',
              label: 'Reset',
              accessibilityLabel: 'Back to the start',
              busy: busy === 'reset',
              disabled: held('reset'),
              onPress: () => void run('reset'),
            },
          ]}
        />

        {error === null ? null : (
          <Type
            role="label"
            tone={error.tone}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="mt-lg"
          >
            {error.text}
          </Type>
        )}
        <Type role="body" tone="mid" className="mt-lg">
          Every number comes from this date. Move it and watch them change — the deposit matures,
          the plan re-cuts, the budget resets on payday.
        </Type>
        <Type role="label" tone="mid" className="mt-sm">
          The ledger runs to {fullDate(live.ledgerHorizon.to)}.
        </Type>
      </Card>
    </>
  )
}
