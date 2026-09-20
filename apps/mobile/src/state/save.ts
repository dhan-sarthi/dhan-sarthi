// The savings pot, read once per screen that shows it.
//
// /save is a payload of its own rather than part of /view, and four screens need it: the
// Grow tab's Save pane, the hacks list, the settings sheet and the one-hack editor. Three of
// them had copied the same `useFocusEffect(useCallback(() => { api.save().then(setSave)
// .catch(() => setSave(null)) }, []))` block, comment and all — one payload, three readers,
// three chances for them to disagree about what a failed read means.
//
// On focus rather than on mount, which is the reason this is not simply `usePayload`: every
// one of those screens pushes another that changes what the pot says, and coming back to
// "3 of 5 on" after turning a fourth one on is the sheet arguing with the screen the
// customer just used.
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { api } from '~/api/client'
import { usePayload, type Payload } from '~/state/payload'
import type { SaveView } from '@dhan/contracts'

/**
 * `reloadOn` re-reads when that value changes, on top of the refetch on focus: the Grow tab
 * passes the snapshot, because a clock moved or a decision taken moves the pot too and that
 * tab is already in front of the customer when it happens.
 */
export function useSaveView(reloadOn?: unknown): Payload<SaveView> {
  const payload = usePayload(api.save, reloadOn)
  const { reload } = payload

  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload]),
  )

  return payload
}
