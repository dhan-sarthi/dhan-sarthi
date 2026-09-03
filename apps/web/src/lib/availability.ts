/**
 * Whether Uday can take a call right now. Public and cheap, so it is read before the Call
 * button is drawn: a reviewer who sees "Talk to Uday" and gets a busy signal has been misled by
 * the screen, and the fallback ladder is supposed to be honest before the tap, not after.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AvatarAvailability } from '@dhan/contracts'
import { api } from '../api/client.ts'

export interface AvailabilityState {
  /** Null until read, or when the read failed — in which case there is no call to offer. */
  availability: AvatarAvailability | null
  checked: boolean
  refresh: () => Promise<void>
}

export function useAvailability(enabled: boolean): AvailabilityState {
  const [state, setState] = useState<{ availability: AvatarAvailability | null; checked: boolean }>(
    { availability: null, checked: false },
  )
  const runRef = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return
    runRef.current += 1
    const run = runRef.current
    try {
      const availability = await api('avatarAvailability')
      if (run === runRef.current) setState({ availability, checked: true })
    } catch {
      if (run === runRef.current) setState({ availability: null, checked: true })
    }
  }, [enabled])

  useEffect(() => {
    // Off the effect's own tick: state changes when the reply arrives, never during the effect.
    queueMicrotask(() => void refresh())
  }, [refresh])

  return {
    availability: enabled ? state.availability : null,
    checked: enabled ? state.checked : true,
    refresh,
  }
}
