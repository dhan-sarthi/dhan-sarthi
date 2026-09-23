// Step 6 — the destination.
//
// Cleo asks "What are you saving for?" and offers four shapes rather than a free
// text box, because a named shape is something the product can plan against. Ours
// offers the five goal kinds the roadmap ladder already knows how to sequence, in
// the order it considers them — a customer who picks the long game still gets the
// safety net first, and the roadmap will say so.
//
// This is the last step, so it is also where the draft is committed: the profile goes to the
// API here, then the goal, and only now does anything exist server-side. The goal is written
// into the draft only once both land — a save that failed must not leave the next screen reading
// back a goal as if it were set. A failure keeps the choice on screen and says so above the
// button, and the button is the retry — one control, not a Try again beside a button that does
// the same thing. A retry after the profile landed and the goal did not sends both again, and
// neither repeat changes anything: the same profile is the same profile, and the same goal kind
// a second time is a no-op on the server.
//
// The pick is stored: `setGoal` records the kind on the session, and the roadmap Uday speaks from
// is built around it from the next read. Built *around* it, not straight to it — the stages the
// ladder puts first stay first, so the long game picked with a card at 34.8% still opens on the
// card. And a pick with nothing to aim at (a payoff with nothing costly owed, cover with no gap)
// leaves the engine's own goal in place while the choice stays on record, which is why the ready
// screen reads the pick back without promising the plan is built on it.
//
// That next read is made here, before the ready screen. The reading step loaded the plan the tabs
// open on, before there was a pick to build it around, and nothing reads it again on its own: the
// Plan tab, Uday's opening line and the goal screen all read what the snapshot module holds. Left
// alone, they showed the engine's own goal while the server planned around the customer's, and
// the pick looked as though it had not been saved. `refresh` never rejects; a read that fails
// leaves the plan it had, and the tabs say so the way they always do.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { SelectCard } from '~/ui/SelectCard'
import { leave } from '~/ui/NavRow'
import { GOALS, useOnboarding, type GoalKind } from '~/state/onboarding'
import { useSnapshot } from '~/state/snapshot'
import { api } from '~/api/client'

export default function GoalStep() {
  const { draft, set } = useOnboarding()
  const { refresh } = useSnapshot()
  const [choice, setChoice] = useState<GoalKind | null>(draft.goal)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function commit() {
    if (choice === null || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const patch = {
        ...(draft.dependents !== null ? { dependents: draft.dependents } : {}),
        ...(draft.annualIncome !== null ? { declaredAnnualIncome: draft.annualIncome } : {}),
        ...(draft.risk !== null ? { riskProfile: draft.risk } : {}),
      }
      // A customer who skipped the optional steps has nothing to save, and the route is right
      // to refuse an empty patch — "the patch named no fields to change" is a real mistake
      // worth catching. It just is not this one, so do not make the call.
      if (Object.keys(patch).length > 0) await api.patchProfile(patch)
      await api.setGoal({ kind: choice })
      await refresh()
      set({ goal: choice })
      router.push('/(onboarding)/ready')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      step={5}
      steps={5}
      onBack={() => leave('/(onboarding)/checklist')}
      title={'What are you\nworking towards?'}
      // No promise of where the plan starts: the pick is stored and the plan is built around it,
      // but the ladder's first stages stay first, and a pick with nothing to aim at leaves the
      // engine's own goal in place.
      subtitle="Pick the one that matters most to you right now."
      footer={
        <View className="gap-md">
          {failed && !busy ? (
            <Type
              role="caption"
              tone="danger"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              Couldn't save. Try again.
            </Type>
          ) : null}
          <Button
            label="That's the one"
            loading={busy}
            haptic="none"
            disabled={choice === null}
            onPress={() => void commit()}
          />
        </View>
      }
    >
      <View className="mt-xl">
        <Card
          accessibilityRole="radiogroup"
          accessibilityLabel="What you're working towards"
          className="overflow-hidden"
        >
          {GOALS.map((g, i) => (
            <SelectCard
              key={g.kind}
              title={g.title}
              description={g.description}
              selected={choice === g.kind}
              divide={i > 0}
              onPress={() => {
                setChoice(g.kind)
                setFailed(false)
              }}
            />
          ))}
        </Card>
      </View>
    </Screen>
  )
}
