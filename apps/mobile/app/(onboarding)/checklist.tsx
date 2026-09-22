// Step 3c — what is left.
//
// Cleo's "You're on a roll" screen: what is done gets a filled check, what is next
// gets a numbered dark circle, what is still to come stays sunk into the ground. It is
// the only screen in the flow that shows the shape of the whole flow, so it sits in
// the middle rather than at the start.
//
// The states are read from the draft, not written down. The list used to be three fixed
// rows, so a customer who backed out of the risk question onto this screen was told the step
// they had just finished was still next. Now "Two things about you" ticks once both of its
// screens are answered, "Where you're headed" becomes the way in after it, and the card that
// is next is itself a button — Next only says the same thing at the bottom of the screen.
//
// No ×. It replaced the whole flow with the mobile step, which threw away a signed-in session
// and a statement already read; from here the only way is on.
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Button } from '~/ui/Button'
import { Checklist } from '~/ui/Checklist'
import { aboutDone, useOnboarding } from '~/state/onboarding'

export default function ChecklistStep() {
  const { draft } = useOnboarding()
  const answered = aboutDone(draft)
  const about = () => router.push('/(onboarding)/about')
  const goal = () => router.push('/(onboarding)/goal')

  return (
    <Screen
      title="You're nearly there"
      subtitle="Two short steps, then I show you what I found."
      footer={<Button label="Next" haptic="none" onPress={answered ? goal : about} />}
    >
      <Checklist
        variant="cards"
        className="mt-xxl"
        steps={[
          { id: 'read', title: 'Read your statement', state: 'done' },
          {
            id: 'you',
            title: 'Two things about you',
            state: answered ? 'done' : 'current',
            onPress: about,
          },
          {
            id: 'goal',
            title: "Where you're headed",
            state: answered ? 'current' : 'locked',
            ...(answered ? { onPress: goal } : {}),
          },
        ]}
      />
    </Screen>
  )
}
