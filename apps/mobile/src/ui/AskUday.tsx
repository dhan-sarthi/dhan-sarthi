// "Ask Uday about this", drawn one way.
//
// Handing Uday a question is the one action every screen in this app can honestly offer, and the
// round-2 review found it in four shapes: an underlined link on Debt and Protect, an outlined pill
// on Record, Grow and Credit, a full-width ink button on Plan's Numbers pane, the gate sheet and
// the transaction sheet, and an arrow row among Plan's stage links. Four shapes for one action
// make the customer learn it again on every screen.
//
// Cleo's version is "What's this transaction?", the underlined line at the foot of the thing it
// asks about, so this is a `MenuLink`. It sits under a card's own action without competing with
// it, and on a card with no action of its own it still reads as the way to ask. The question goes
// in the hint, so a screen reader says what will be asked before the chat opens.
//
// It is the secondary shape, and Cleo keeps it even where it is the only thing to press: "What's
// this transaction?" is the one action on its transaction detail. A screen whose whole job is
// the answer would take a primary `Button` and call `useAskUday` itself. None does today.
//
// The hand-off goes through `useToTab`, so the link works inside the tabs and from a screen
// pushed over them (the record, the statement, a sheet) without stacking a second tab bar.
import { useCallback } from 'react'
import { MenuLink } from '~/ui/MenuRow'
import { useToTab } from '~/ui/NavRow'

export const ASK_LABEL = 'Ask Uday about this'

/** Opens Uday's chat with `question` already asked, from either side of the tabs. */
export function useAskUday(): (question: string) => void {
  const toTab = useToTab()
  return useCallback(
    (question: string) => toTab({ pathname: '/(tabs)/uday', params: { ask: question } }),
    [toTab],
  )
}

export function AskUday({
  question,
  label = ASK_LABEL,
  onBefore,
  tone,
  className,
}: {
  /** Worded so Uday can answer it: take it from `~/lib/ask`, never write one inline. */
  question: string
  /** A narrower ask ("Ask Uday whether to prepay"). The default suits most places. */
  label?: string
  /** Runs before the hand-off. A sheet closes itself here, or the chat opens underneath it. */
  onBefore?: () => void
  /** `ink` on a saturated fill, where the link's mid tone is under 4.5:1 (MenuLink). */
  tone?: 'mid' | 'ink'
  className?: string
}) {
  const ask = useAskUday()
  return (
    <MenuLink
      label={label}
      hint={`Asks Uday: ${question}`}
      {...(tone === undefined ? {} : { tone })}
      {...(className === undefined ? {} : { className })}
      onPress={() => {
        onBefore?.()
        ask(question)
      }}
    />
  )
}
