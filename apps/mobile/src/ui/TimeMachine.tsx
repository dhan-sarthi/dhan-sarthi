// The clock, made movable and made visible.
//
// Everything on every screen is derived from a snapshot taken at a date: the daily action,
// the safe-to-spend envelope, the roadmap, the insights. A demo that cannot move that date
// can only assert the numbers are computed. Moving it proves it — advance thirty days and
// the deposit matures, the action changes, the envelope resets on payday.
//
// It is labelled as a simulation and lives inside the record rather than in the chrome,
// because a customer of a real bank must never wonder whether the date they are looking at
// is real. The API gates it behind `capabilities.simulatedClock` for the same reason.
import { useState } from 'react'
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { Button, ButtonStack } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { api, ApiError } from '~/api/client'
import { fullDate } from '~/lib/money'
import type { SessionState } from '@dhan/contracts'

export function TimeMachine({
  session,
  onMoved,
}: {
  session: SessionState
  onMoved: (next: SessionState) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!session.capabilities.simulatedClock) return null

  async function move(label: string, run: () => Promise<SessionState>) {
    setBusy(label)
    setError(null)
    try {
      onMoved(await run())
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? 'Past the end of the generated ledger. Reset instead.'
          : err instanceof ApiError && err.status === 409
            ? 'The clock moved somewhere else first. Reopen this screen.'
            : 'Could not move the clock.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Card>
        <View className="px-lg py-lg">
          <Type role="caption" tone="soft">
            SIMULATED CLOCK
          </Type>
          <Type role="heading" className="mt-xs">
            Today is {fullDate(session.asOf)}
          </Type>
          <Type role="body" tone="soft" className="mt-xs">
            Every number in the app is derived from this date. Move it and watch them change — the
            deposit matures, the plan re-cuts, the envelope resets on payday.
          </Type>

          <View className="mt-lg">
            <ButtonStack>
              <Button
                label="Move forward 30 days"
                loading={busy === '30'}
                onPress={() => void move('30', () => api.advanceClock(30, session.version))}
              />
              <Button
                label="Move forward 7 days"
                variant="secondary"
                loading={busy === '7'}
                onPress={() => void move('7', () => api.advanceClock(7, session.version))}
              />
              <Button
                label="Back to the start"
                variant="secondary"
                loading={busy === 'reset'}
                onPress={() => void move('reset', () => api.resetClock(session.version))}
              />
            </ButtonStack>
          </View>

          {error && (
            <Type role="caption" tone="danger" className="mt-md">
              {error}
            </Type>
          )}
        </View>
      </Card>

      <Type role="caption" tone="faint">
        Ledger runs {fullDate(session.ledgerHorizon.from)} to {fullDate(session.ledgerHorizon.to)}.
        The clock cannot go past the end of it.
      </Type>
    </>
  )
}
