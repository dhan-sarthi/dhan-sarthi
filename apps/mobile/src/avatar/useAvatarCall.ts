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
// Both platforms run through here. On the web a transport puts its own `<video>` in the stage;
// on a phone, which has no DOM, it hands up a stream URL (`videoURL`) for `CallVideo` to render,
// and the view reports the first painted frame back through `presented`. Metro picks each
// transport's `.native.ts` twin on a phone, and the phone needs a build containing WebRTC — the
// APK, not Expo Go.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ApiError, api } from '~/api/client'
import type { AvatarGrant } from '@dhan/contracts'
import type { LiveConnection, TransportModule } from '~/avatar/transports/types'

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
  /**
   * The live video's width over its height, once it has reported one. The stage frames the call
   * by it: Runway sends landscape, Anam portrait, and one crop cannot suit both.
   */
  videoAspect: number | null
  /**
   * Native only: the remote video for `CallVideo` to render, once the transport has one. Always
   * null on the web, where the transport puts its own element in the stage.
   */
  videoURL: string | null
  reason: string | null
  start: (topic?: string | null) => Promise<void>
  hangUp: () => void
  attach: (node: HTMLDivElement | null) => void
  /** Native only: the video view painted a frame of this size. The web transports report their own. */
  presented: (width: number, height: number) => void
}

// Uday's own words, so first person and contracted like everything else he says. FAILED and
// DROPPED are the ones a retry can fix, and the screen keeps the call button up under them;
// the other two are states a second tap would only repeat.
const BUSY = "I'm with another customer. I'll answer in text for now."
const NO_CALL = "No live call right now. I'll answer in text."
const FAILED = "Couldn't connect. Try again."
/** The stream went away under a call that had started — not the same event as never starting. */
const DROPPED = 'The call dropped. Try again.'

/**
 * Loaded on demand, so a build that only ever talks to one provider only ever downloads that
 * provider's SDK. A grant from before `transport` existed is a LiveKit grant.
 */
const TRANSPORTS: Record<string, () => Promise<TransportModule>> = {
  livekit: () => import('~/avatar/transports/livekit'),
  anam: () => import('~/avatar/transports/anam'),
}

/**
 * The customer's microphone, opened on the tap rather than after the call connects.
 *
 * The permission prompt, the device start and the grant round trip then overlap instead of
 * queueing, and a page that is capturing audio is one the browser lets play Uday's voice. Null
 * when refused or unavailable: the call still goes ahead, and text is one tap away.
 */
function openMic(): Promise<MediaStream | null> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
  if (!devices?.getUserMedia) return Promise.resolve(null)
  return devices
    .getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    .catch(() => null)
}

/**
 * How many times one visit to the screen readies a call. A readied call is free on Runway but
 * lives about twenty seconds, and each one is one of the account's fifty sessions a day — so a
 * customer who lingers gets two windows' worth, then the tap builds its own as it always did.
 */
const PREPARE_ROUNDS = 2

/**
 * A named moment on the page's own clock — tap, grant, connected, first frame — readable in the
 * browser's performance panel and by the harness that measures the call. Free where unsupported.
 */
function mark(name: string): void {
  try {
    performance.mark(`avatar:${name}`)
  } catch {
    // No performance timeline here; nothing is lost but the measurement.
  }
}

export function useAvatarCall(): CallState {
  const [mode, setMode] = useState<CallMode>('idle')
  const [videoLive, setVideoLive] = useState(false)
  const [videoAspect, setVideoAspect] = useState<number | null>(null)
  const [videoURL, setVideoURL] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [providerDown, setProviderDown] = useState(false)

  const stage = useRef<HTMLDivElement | null>(null)
  const live = useRef<LiveConnection | null>(null)
  const sessionId = useRef<string | null>(null)
  const mic = useRef<MediaStream | null>(null)
  /*
   * Which tap the screen is waiting on. A hang-up while connecting, or a fresh tap after one,
   * moves it on, and a connect that lands for an older tap hands back what it opened instead of
   * taking the screen over. Before this, "End the call" during "Connecting…" was undone a moment
   * later by the connection arriving, and the session it had leased kept billing.
   */
  const attempt = useRef(0)

  // Fetch the SDK while the customer is still looking at the screen, not after they tap. Runway
  // is tried first, so its SDK is the one that matters; Anam's follows at leisure.
  useEffect(() => {
    const later = setTimeout(() => {
      void TRANSPORTS.livekit?.()
        .then((m) => m.preload())
        .then(() => TRANSPORTS.anam?.())
        .then((m) => m?.preload())
        .catch(() => undefined)
    }, 0)
    return () => clearTimeout(later)
  }, [])
  const hangingUp = useRef(false)
  // Read inside the focus effect, which must not re-run every time the call changes state.
  const modeNow = useRef(mode)
  modeNow.current = mode
  const downNow = useRef(providerDown)
  downNow.current = providerDown

  // Ready a call while the customer is looking at Uday. The provider's slow part — creating the
  // session, waiting for it, opening the gate — then happens before the tap rather than after
  // it, which on Runway is several seconds of the wait. Quiet by design: whatever the server
  // answers, the tap still works exactly as it did without this.
  useFocusEffect(
    useCallback(() => {
      let focused = true
      let rounds = 0
      let again: ReturnType<typeof setTimeout> | null = null
      const ready = (): void => {
        const busy = modeNow.current === 'connecting' || modeNow.current === 'live'
        if (!focused || busy || downNow.current || rounds >= PREPARE_ROUNDS) return
        rounds += 1
        void api
          .prepareAvatarSession()
          .then((r) => {
            if (!focused || !r.prepared || r.usableForSeconds === null) return
            again = setTimeout(ready, (r.usableForSeconds + 1) * 1000)
          })
          .catch(() => undefined)
      }
      ready()
      return () => {
        focused = false
        if (again) clearTimeout(again)
      }
    }, []),
  )

  const cleanUp = useCallback(() => {
    setVideoLive(false)
    setVideoAspect(null)
    setVideoURL(null)
    // Off the moment the call is, so the browser's recording light does not outlive it.
    mic.current?.getTracks().forEach((t) => t.stop())
    mic.current = null
    const id = sessionId.current
    sessionId.current = null
    // Hand the credential back so the next customer is not queued behind a dead session.
    if (id) void api.endAvatarSession(id).catch(() => undefined)
  }, [])

  const hangUp = useCallback(() => {
    hangingUp.current = true
    attempt.current += 1
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
      const mine = ++attempt.current
      const superseded = (): boolean => mine !== attempt.current
      setMode('connecting')
      setReason(null)
      hangingUp.current = false
      mark('tap')
      // Opened now, while the server is still picking an account and waking the worker.
      const micReady = openMic().then((stream) => {
        if (superseded()) {
          stream?.getTracks().forEach((t) => t.stop())
          return null
        }
        mic.current = stream
        return stream
      })

      try {
        const grant = (await api.avatarSession(topic)) as AvatarGrant
        mark('grant')
        if (superseded()) {
          // Hung up while the server was leasing, so the hang-up had no session to hand back.
          void api.endAvatarSession(grant.runwaySessionId).catch(() => undefined)
          return
        }
        const load = TRANSPORTS[grant.transport ?? 'livekit']
        if (!load) throw new Error(`no client transport for ${String(grant.transport)}`)

        // The session id is stored before the connection is attempted, so a connection that
        // fails halfway still hands the credential back on the way out.
        sessionId.current = grant.runwaySessionId

        const [{ connect }, stream] = await Promise.all([load(), micReady])
        const connection = await connect({
          grant,
          stage: stage.current,
          mic: stream,
          onVideoStream: (url) => {
            if (!superseded()) setVideoURL(url)
          },
          onVideoSize: (w, h) => {
            if (!superseded()) setVideoAspect(w / h)
          },
          onVideoLive: () => {
            if (superseded()) return
            mark('video')
            setVideoLive(true)
          },
          onLost: () => {
            // The stream going away under us — the cap reached, the worker gone, the network
            // dropped — is not the customer hanging up, and should not read as if it were.
            if (hangingUp.current || superseded()) return
            live.current = null
            setMode('unavailable')
            setReason(DROPPED)
            cleanUp()
          },
        })
        if (superseded()) {
          // Hung up while connecting. The hang-up handed the session back; this closes the room.
          void connection.disconnect().catch(() => undefined)
          return
        }
        live.current = connection
        mark('connected')
        setMode('live')
      } catch (err) {
        // A refused grant must not leave the microphone open behind it.
        void micReady.then((stream) => stream?.getTracks().forEach((t) => t.stop()))
        // A hang-up already put the screen right; a stale failure must not overwrite it.
        if (superseded()) return
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
      attempt.current += 1
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

  // Marked every time the size changes, which after the first frame is rare: a timeline with a
  // repeated mark reads the same as one without, and the native view has no "first" to offer.
  const presented = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) setVideoAspect(width / height)
    mark('video')
    setVideoLive(true)
  }, [])

  return {
    mode,
    videoLive,
    videoAspect,
    videoURL,
    reason,
    providerDown,
    start,
    hangUp,
    attach,
    presented,
  }
}
