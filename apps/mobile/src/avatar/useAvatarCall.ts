// A live call with Uday.
//
// This hook does not know which company is rendering Uday's face, and neither does any screen
// that uses it. The API picks the provider from `AVATAR_PROVIDER`, runs the same lease, budget,
// waitlist and tool gate either way, and says which client SDK to load in one field of the
// grant. So the only provider-shaped line in the whole client is the `TRANSPORTS` lookup below;
// everything else — the tiers, the copy, the states, the teardown — is shared.
//
// What the transports know between them, learned from billed calls on both providers: the
// worker publishes audio several seconds before a decodable video frame, so revealing the tile
// when the track *subscribes* shows a black rectangle and reads as broken; and a stream that
// goes away under us is not the same event as the customer hanging up.
//
// Web only for now. The video element is a DOM node, which exists because Expo's web target
// renders through react-dom. The native path needs a build that contains WebRTC, and lands with
// the Android build.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '~/api/client'
import type { AvatarGrant } from '@dhan/contracts'
import type { Connect, LiveConnection } from '~/avatar/transports/types'

export type CallMode = 'idle' | 'connecting' | 'live' | 'ended' | 'unavailable'

export type CallState = {
  mode: CallMode
  /**
   * The provider refused, and will keep refusing.
   *
   * `minutesLeftToday` is this app's own budget counter, not the provider's balance, so
   * /avatar/availability keeps reporting a call is possible after the provider has said it is
   * not — an out-of-credits account fails identically on every attempt. Offering the button
   * again would be promising something that cannot happen, so the tab stops offering it.
   */
  providerDown: boolean
  /** True only once a frame has actually been painted, not when the track arrives. */
  videoLive: boolean
  reason: string | null
  start: (topic?: string | null) => Promise<void>
  hangUp: () => void
  attach: (node: HTMLDivElement | null) => void
}

const BUSY = 'Uday is with another customer. I will answer in text for now.'
const NO_CALL = 'No live call right now. I will answer in text.'
const FAILED = 'The call would not connect. Let us carry on in text.'

/**
 * Loaded on demand, so a build that only ever talks to one provider only ever downloads that
 * provider's SDK. A grant from before `transport` existed is a LiveKit grant.
 */
const TRANSPORTS: Record<string, () => Promise<{ connect: Connect }>> = {
  livekit: () => import('~/avatar/transports/livekit'),
  anam: () => import('~/avatar/transports/anam'),
}

export function useAvatarCall(): CallState {
  const [mode, setMode] = useState<CallMode>('idle')
  const [videoLive, setVideoLive] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [providerDown, setProviderDown] = useState(false)

  const stage = useRef<HTMLDivElement | null>(null)
  const live = useRef<LiveConnection | null>(null)
  const sessionId = useRef<string | null>(null)
  const hangingUp = useRef(false)

  const cleanUp = useCallback(() => {
    setVideoLive(false)
    const id = sessionId.current
    sessionId.current = null
    // Hand the credential back so the next customer is not queued behind a dead session.
    if (id) void api.endAvatarSession(id).catch(() => undefined)
  }, [])

  const hangUp = useCallback(() => {
    hangingUp.current = true
    const active = live.current
    live.current = null
    setMode('ended')
    void active?.disconnect().finally(cleanUp)
    if (!active) cleanUp()
  }, [cleanUp])

  /**
   * Open a call.
   *
   * @param topic  The insight headline the customer tapped "Talk me through this" on, where
   *               they arrived from one. It reaches the provider only through the brief the
   *               server builds, so it can steer the opening and cannot introduce a figure.
   */
  const start = useCallback(
    async (topic?: string | null) => {
      if (mode === 'connecting' || mode === 'live') return
      setMode('connecting')
      setReason(null)
      hangingUp.current = false

      try {
        const grant = (await api.avatarSession(topic)) as AvatarGrant
        const load = TRANSPORTS[grant.transport ?? 'livekit']
        if (!load) throw new Error(`no client transport for ${String(grant.transport)}`)

        // The session id is stored before the connection is attempted, so a connection that
        // fails halfway still hands the credential back on the way out.
        sessionId.current = grant.runwaySessionId

        const { connect } = await load()
        live.current = await connect({
          grant,
          stage: stage.current,
          onVideoLive: () => setVideoLive(true),
          onLost: () => {
            // The stream going away under us — the cap reached, the worker gone, the network
            // dropped — is not the customer hanging up, and should not read as if it were.
            if (hangingUp.current) return
            live.current = null
            setMode('unavailable')
            setReason(FAILED)
            cleanUp()
          },
        })
        setMode('live')
      } catch (err) {
        const stale = live.current
        live.current = null
        void stale?.disconnect().catch(() => undefined)
        setMode('unavailable')
        const api502 = err instanceof ApiError && (err.status === 502 || err.status === 503)
        if (api502) setProviderDown(true)
        setReason(
          err instanceof ApiError && err.status === 409
            ? BUSY
            : err instanceof ApiError && (err.status === 429 || api502)
              ? NO_CALL
              : FAILED,
        )
        cleanUp()
      }
    },
    [mode, cleanUp],
  )

  // A customer who leaves the tab must not leave a credential leased behind them.
  useEffect(
    () => () => {
      hangingUp.current = true
      void live.current?.disconnect()
      live.current = null
      cleanUp()
    },
    [cleanUp],
  )

  const attach = useCallback((node: HTMLDivElement | null) => {
    stage.current = node
    live.current?.reattach(node)
  }, [])

  return { mode, videoLive, reason, providerDown, start, hangUp, attach }
}
