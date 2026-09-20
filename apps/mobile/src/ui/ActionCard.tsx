// Today's one thing, and what the customer did about it.
//
// This card is the product's whole argument, so it gets the loudest surface in the system
// and sits above the balances — the one place the layout deliberately departs from Cleo,
// who leads Spend with their own card.
//
// Three responses, not one. "Did it", "not now" and "not for me" are different facts and
// the engine treats them differently: a deferral comes back tomorrow, a decline does not
// and the reason is kept. Offering only the accept button would make the audit record a
// log of what we sold rather than of what was decided.
//
// All three answers land through the same sequence in `Verdict.tsx`, and the whole card sits in
// a `VerdictFrame` so the height morphs instead of jumping when one replaces another. The
// refusal is the case it was built for, but a confirmation earns the same treatment: "Done — it
// is on your record" is a claim about a regulated audit trail, and hard-cutting to it would
// make it look like a toast.
import { useState } from 'react'
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Glyph } from '~/ui/Glyph'
import { Tap } from '~/ui/Tap'
import { Reveal } from '~/ui/Reveal'
import { BEAT, Beat, VerdictFrame, VerdictSurface } from '~/ui/Verdict'
import { color } from '@dhan/design'
import { ApiError } from '~/api/client'
import { rupees } from '~/lib/money'
import type { Action, AdviceRecord, DecisionKind, DecisionResponse } from '@dhan/contracts'

const CHOICES: ReadonlyArray<{ kind: DecisionKind; label: string }> = [
  { kind: 'deferred', label: 'Not now' },
  { kind: 'declined', label: 'Not for me' },
]

export function ActionCard({
  action,
  onDecide,
}: {
  action: Action
  onDecide?: (kind: DecisionKind) => Promise<DecisionResponse>
}) {
  const [busy, setBusy] = useState<DecisionKind | null>(null)
  const [done, setDone] = useState<DecisionKind | null>(null)
  const [blocked, setBlocked] = useState<AdviceRecord | null>(null)
  const [failed, setFailed] = useState<'retry' | 'already' | null>(null)

  async function decide(kind: DecisionKind) {
    if (!onDecide || busy) return
    setBusy(kind)
    setFailed(null)
    try {
      const outcome = await onDecide(kind)
      // Accepting is a request, not a result. The suitability gate runs server-side on the
      // re-derived snapshot and can refuse, and when it does the refusal is the screen —
      // showing a green tick over a blocked recommendation would be the one unforgivable
      // bug in a product whose whole claim is that it says no.
      if (outcome.adviceRecord?.verdict === 'BLOCKED') setBlocked(outcome.adviceRecord)
      else setDone(kind)
    } catch (err) {
      // One decision per action is the server's rule, and a 409 means this one already has
      // one. Telling the customer to try again would be advice that cannot work.
      setFailed(err instanceof ApiError && err.status === 409 ? 'already' : 'retry')
    } finally {
      setBusy(null)
    }
  }

  if (blocked) {
    return (
      <VerdictFrame>
        <VerdictSurface
          tone="blocked"
          className="rounded-lg border border-danger bg-danger-soft p-lg"
        >
          <Beat at={BEAT.ruling}>
            <Type role="caption" tone="danger">
              NOT SUITABLE · {blocked.ruleId ?? 'BLOCKED'}
            </Type>
            <Type role="title" className="mt-xs">
              I am not going to do that
            </Type>
          </Beat>

          <Beat at={BEAT.reasoning}>
            <Type role="body" className="mt-sm opacity-85">
              {blocked.spoken ?? blocked.recorded}
            </Type>

            {blocked.alternative && (
              <View className="mt-lg rounded-md bg-surface p-md">
                <Type role="caption" tone="soft">
                  INSTEAD
                </Type>
                {/* An object on the wire (`AlternativeSchema`) and never a string. This
                    rendered the object straight into a `<Type>` child, so every refusal
                    carrying an alternative took the tab down with it. */}
                <Type role="body" className="mt-xs">
                  {blocked.alternative.name}
                  {blocked.alternative.monthly > 0
                    ? `, ${rupees(blocked.alternative.monthly)} a month`
                    : ''}
                </Type>
              </View>
            )}
          </Beat>

          {/* Which rules it did clear matters as much as the one it did not: it says the
              refusal came from a specific test, not from a blanket unwillingness to act. And it
              is the last beat, so it is the sentence still arriving as the motion stops. */}
          <Beat at={BEAT.provenance}>
            {blocked.rulesPassed.length > 0 && (
              <Type role="caption" tone="mid" className="mt-lg">
                Passed {blocked.rulesPassed.length} of 9 checks. Stopped at {blocked.ruleId}.
              </Type>
            )}

            <Type role="caption" tone="mid" className="mt-xs opacity-70">
              This refusal is saved with its reasoning, same as any advice.
            </Type>
          </Beat>
        </VerdictSurface>
      </VerdictFrame>
    )
  }

  if (done) {
    return (
      <VerdictFrame>
        <VerdictSurface tone="passed" className="rounded-lg bg-success p-lg">
          <Beat at={BEAT.ruling}>
            <View className="flex-row items-center gap-sm">
              <Glyph name="check" size={18} tint={color.ink} />
              <Type role="heading">
                {done === 'did_it'
                  ? 'Done — it is on your record'
                  : done === 'deferred'
                    ? 'Parked for now'
                    : 'Noted'}
              </Type>
            </View>
          </Beat>
          <Beat at={BEAT.reasoning}>
            <Type role="body" className="mt-sm opacity-80">
              {done === 'did_it'
                ? 'The decision, the evidence and the rules it passed are all saved. Read it any time.'
                : done === 'deferred'
                  ? 'I will bring it up again while it still matters.'
                  : 'I will not suggest this one again.'}
            </Type>
          </Beat>
        </VerdictSurface>
      </VerdictFrame>
    )
  }

  return (
    <VerdictFrame>
      {/* The brand green, and the only card on Spend that wears it.

          The terracotta this replaces was Cleo's coral, and it sat 150 degrees from the green —
          near-complementary, which is the one interval that reads as two colours arguing rather
          than as a pair. It survived while the green was near-black enough to pass for a neutral
          and stopped surviving the moment the green became #016A4D.

          Putting the bank's own colour on the card where the bank actually speaks is the more
          honest answer than finding a second hue to shout with. What it costs is the contrast
          against the balance card, which was also green — so that one drops to ink. The line
          between them is real rather than decorative: a balance is a fact the customer can
          already read in GO Mobile+, and the advice is the thing only this app has. Derived,
          advisory surfaces are brand green; raw account figures are ink. */}
      <View className="rounded-lg bg-brand p-lg">
        <Type role="caption" tone="onInk" className="opacity-85">
          TODAY
        </Type>
        <Type role="title" tone="onInk" className="mt-xs">
          {action.label}
        </Type>
        <Type role="body" tone="onInk" className="mt-sm opacity-85">
          {action.detail}
        </Type>

        {/* The evidence deals itself out. These lines are the reason the action is being put
            forward at all, and a customer who watches them arrive one at a time has read them;
            a customer handed four grey lines at once has read the first. */}
        {action.evidence.length > 0 && (
          <View className="mt-lg gap-xs">
            {action.evidence.map((line, i) => (
              <Reveal key={line} i={i} delay={BEAT.reasoning}>
                <View className="flex-row items-start gap-sm">
                  <View className="mt-[5px]">
                    <Glyph name="check" size={12} tint={color.onInk} />
                  </View>
                  <Type role="caption" tone="onInk" className="flex-1 opacity-85">
                    {line}
                  </Type>
                </View>
              </Reveal>
            ))}
          </View>
        )}

        <View className="mt-lg">
          <Button
            label="Do it"
            variant="light"
            loading={busy === 'did_it'}
            onPress={() => void decide('did_it')}
          />
        </View>

        <View className="mt-md flex-row justify-center gap-xl">
          {CHOICES.map((c) => (
            <Tap
              key={c.kind}
              accessibilityRole="button"
              disabled={busy !== null}
              haptic="light"
              dim
              onPress={() => void decide(c.kind)}
              className="py-xs"
            >
              <Type role="label" tone="onInk" className="opacity-85 underline">
                {busy === c.kind ? 'Saving…' : c.label}
              </Type>
            </Tap>
          ))}
        </View>

        {failed && (
          <Reveal>
            <Type role="caption" tone="onInk" className="mt-md text-center opacity-85">
              {failed === 'already'
                ? 'You already answered this one.'
                : 'That did not save. Try again.'}
            </Type>
          </Reveal>
        )}
      </View>
    </VerdictFrame>
  )
}
