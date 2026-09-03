/**
 * The Runway avatar session.
 *
 * Runway Characters owns the whole conversation: microphone in, its own cloned voice out,
 * photorealistic video out over WebRTC via LiveKit. We do not generate the voice, and the client
 * never holds a Runway key — it asks our API for a short-lived LiveKit token, which is the rule
 * from CONTRIBUTING.md that a client able to reach a provider directly is a client that can leak a key.
 *
 * The request carries the bearer and an empty body. The personality brief is built on the
 * server from the session's own view, because a brief the browser can edit is a compliance claim
 * the browser can undo. The server also registers the suitability tool and opens the RPC gate
 * before it hands back credentials; an ungated session is never issued.
 *
 * The three states below are the fallback ladder from `docs/product/decisions.md`, and it is
 * built in from the start rather than bolted on, because judges will use this unsupervised and
 * possibly several at once:
 *
 *   live      a session was granted; video and voice
 *   text      no session available — busy, no key, quota gone, or offline. Same engine, typed
 *   error     something we did not anticipate. Says so plainly and offers text
 *
 * Tier 1 is a *designed state*, not a spinner. Runway's Tier 1 allows one concurrent session, so
 * "Uday is with another customer" is a thing a real judge will genuinely see — and when it
 * happens the 409 carries a waitlist ticket, which this hook polls until the slot is claimable.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Room } from 'livekit-client'
import type { AvatarGrant } from '@dhan/contracts'
import { ApiError, api, isApiError, newIdempotencyKey } from '../api/client.ts'
import { getToken } from '../api/session.ts'

export type AvatarMode = 'idle' | 'connecting' | 'live' | 'text' | 'error'

export interface QueuePlace {
  ticket: string
  /** waiting: in line · claimable: the slot is held for us and `joinFromQueue` wins it · expired: the hold lapsed. */
  state: 'waiting' | 'claimable' | 'expired'
  position: number
  estimatedWaitSeconds: number | null
  /** When the hold lapses, while claimable. The card counts down to it. */
  holdUntil: string | null
  /** The hold window as first seen, so the countdown has a full bar to drain. */
  holdSeconds: number
}

export interface AvatarSession {
  mode: AvatarMode
  /** Why we are in text mode, in the server's words. */
  reason: string | null
  /** Where we stand when the one slot is taken. */
  queue: QueuePlace | null
  /** Callback ref for the <video>. A function, so the hook hands out no ref object. */
  attachVideo: (el: HTMLVideoElement | null) => void
  start: () => Promise<void>
  joinFromQueue: () => Promise<void>
  leaveQueue: () => void
  stop: () => void
  muted: boolean
  toggleMute: () => void
  /** True once frames are actually decoding, not merely once a track has been subscribed. */
  videoLive: boolean
  /**
   * How loudly he is speaking, 0 to 1, smoothed.
   *
   * This exists because of a gap in the connect sequence: the worker publishes audio several
   * seconds before the video track is decodable, so for a while you hear him talking to a
   * photograph. Rather than hold the audio back — which would cut the first words off his
   * greeting — the portrait responds to his voice, so the stillness reads as "connecting" and
   * not as "frozen".
   */
  audioLevel: number
  /** Seconds left on the session's cap, so the customer is never cut off without warning. */
  secondsLeft: number | null
}

const QUEUE_POLL_MS = 3_000

/**
 * The grant is the one request in the app that legitimately takes longer than the client's
 * six-second ceiling: Runway's create call alone is about four seconds, then the worker has to
 * reach READY, our RPC handler has to join the room, and only then is the session consumed —
 * twelve seconds on the first live call through this build. The client's timeout abandoned
 * that grant at six seconds, the server finished it anyway, and Runway ended the session
 * eighteen seconds later for want of a participant. So this call gets its own deadline.
 */
const GRANT_TIMEOUT_MS = 45_000
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

const GRANT_TIMED_OUT = 'Uday did not pick up in time. Let us continue in text.'
const GRANT_UNREACHABLE = 'Could not reach the voice service. Let us continue in text.'
const CALL_FAILED = 'The call could not be connected. Let us continue in text.'
const CALL_ENDED = 'The call ended. Carry on here, or call again.'

async function requestGrant(ticket: string | undefined): Promise<AvatarGrant> {
  const token = getToken()
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Your session has ended.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GRANT_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/api/v1/avatar/session`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'idempotency-key': newIdempotencyKey(),
        ...(ticket ? { 'x-waitlist-ticket': ticket } : {}),
      },
      body: '{}',
      signal: controller.signal,
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (res.ok) return json as AvatarGrant

    const body =
      typeof json === 'object' && json !== null && 'code' in json && 'message' in json
        ? (json as ApiError['body'])
        : null
    throw new ApiError(
      res.status,
      body?.code ?? (res.status >= 500 ? 'INTERNAL' : 'VALIDATION'),
      body?.message ?? `The advisor service replied ${res.status}.`,
      body,
    )
  } catch (err) {
    if (isApiError(err)) throw err
    if (controller.signal.aborted) throw new ApiError(0, 'TIMEOUT', GRANT_TIMED_OUT)
    throw new ApiError(0, 'NETWORK', GRANT_UNREACHABLE)
  } finally {
    clearTimeout(timer)
  }
}

export function useAvatar(): AvatarSession {
  const [mode, setMode] = useState<AvatarMode>('idle')
  const [reason, setReason] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueuePlace | null>(null)
  const [muted, setMuted] = useState(false)
  const [videoLive, setVideoLive] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const roomRef = useRef<Room | null>(null)
  const sessionRef = useRef<string | null>(null)
  const meterRef = useRef<{ ctx: AudioContext; raf: number } | null>(null)
  const countdownRef = useRef<number | null>(null)
  const audioElsRef = useRef<HTMLMediaElement[]>([])
  const mutedRef = useRef(false)
  /** Set while we are the ones hanging up, so the room's Disconnected event is not read as a drop. */
  const hangingUpRef = useRef(false)

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el
  }, [])

  /**
   * Read his speaking level off the incoming track.
   *
   * Web Audio rather than LiveKit's speaker events: those are boolean and arrive late, and what
   * the portrait needs is a continuous level to breathe against.
   *
   * **`createMediaStreamSource`, not `createMediaElementSource`.** LiveKit attaches by setting
   * `srcObject` to a MediaStream, and taking an element source off that yields silence in
   * Chrome — the meter sat at zero and the waveform never moved. Reading the track directly also
   * means the graph never carries the audio, so `connect(destination)` must *not* happen here or
   * the customer hears him twice.
   *
   * The context is closed on teardown; leaving them open is how a page ends up with a dozen
   * suspended AudioContexts.
   */
  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext()
      // Autoplay policy can hand back a suspended context even here.
      void ctx.resume().catch(() => undefined)

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)

      const buf = new Uint8Array(analyser.frequencyBinCount)
      let smoothed = 0

      const tick = (): void => {
        analyser.getByteFrequencyData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] ?? 0
        const raw = Math.min(1, sum / buf.length / 90)
        // Rise quickly, fall slowly — speech is bursty and a linear meter looks like a strobe.
        smoothed = raw > smoothed ? raw : smoothed * 0.86 + raw * 0.14
        setAudioLevel(smoothed)
        const raf = requestAnimationFrame(tick)
        if (meterRef.current) meterRef.current.raf = raf
      }

      meterRef.current = { ctx, raf: requestAnimationFrame(tick) }
    } catch {
      // No Web Audio, or autoplay policy refused the context. The call still works; the
      // portrait simply will not breathe.
    }
  }, [])

  const stopMeter = useCallback(() => {
    if (!meterRef.current) return
    cancelAnimationFrame(meterRef.current.raf)
    void meterRef.current.ctx.close().catch(() => undefined)
    meterRef.current = null
    setAudioLevel(0)
  }, [])

  const stopCountdown = useCallback(() => {
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current)
    countdownRef.current = null
    setSecondsLeft(null)
  }, [])

  /** The audio elements LiveKit attached to the page. Left behind, a second call plays two voices. */
  const dropAudioElements = useCallback(() => {
    for (const el of audioElsRef.current) el.remove()
    audioElsRef.current = []
  }, [])

  /**
   * Hand the credential back.
   *
   * Runway bills from session creation until the worker dies, and Tier 1 allows one live session
   * per credential — so a call the customer walked away from is both money and the next person's
   * turn. `keepalive` lets this survive the page unloading.
   */
  const release = useCallback((runwaySessionId: string | null) => {
    if (!runwaySessionId) return
    void api('endAvatarSession', { params: { runwaySessionId }, keepalive: true }).catch(
      () => undefined,
    )
  }, [])

  /** Everything a call holds in the page, whichever way it ended. */
  const teardown = useCallback(() => {
    stopMeter()
    stopCountdown()
    dropAudioElements()
    roomRef.current = null
    release(sessionRef.current)
    sessionRef.current = null
    mutedRef.current = false
    setMuted(false)
    setVideoLive(false)
  }, [dropAudioElements, release, stopCountdown, stopMeter])

  const stop = useCallback(() => {
    hangingUpRef.current = true
    const room = roomRef.current
    teardown()
    void room?.disconnect().finally(() => {
      hangingUpRef.current = false
    })
    setReason(null)
    setMode('idle')
  }, [teardown])

  // A closed tab is the common case, not the exception.
  useEffect(() => {
    const onHide = (): void => {
      if (sessionRef.current) release(sessionRef.current)
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [release])

  const start = useCallback(
    async (ticket?: string) => {
      setMode('connecting')
      setReason(null)

      try {
        // The LiveKit client is imported here rather than at module scope so it is not in the
        // initial bundle — most sessions never open a call. It loads while the grant is in
        // flight, because the browser has roughly twenty seconds after the grant to join the
        // room before Runway gives up on the session, and a slow download must not eat them.
        const [grant, { Room, RoomEvent, Track }] = await Promise.all([
          requestGrant(ticket),
          import('livekit-client'),
        ])
        setQueue(null)
        sessionRef.current = grant.runwaySessionId

        const room = new Room({ adaptiveStream: true, dynacast: true })

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video && videoRef.current) {
            const el = videoRef.current
            track.attach(el)

            // Wait for a frame to actually be *presented*, not merely for the track to arrive: a
            // subscribed track sits black through keyframe warm-up, and revealing the video then
            // is the difference between "connecting" and "it is broken".
            //
            // `requestVideoFrameCallback` fires on the first composited frame, which is both the
            // precise signal and earlier than polling for `currentTime` — worth a second or so of
            // the gap this is all trying to close.
            const withFrameCallback = el as HTMLVideoElement & {
              requestVideoFrameCallback?: (cb: () => void) => number
            }

            if (typeof withFrameCallback.requestVideoFrameCallback === 'function') {
              withFrameCallback.requestVideoFrameCallback(() => setVideoLive(true))
            } else {
              const poll = (): void => {
                if (el.videoWidth > 0 && el.currentTime > 0) setVideoLive(true)
                else window.setTimeout(poll, 120)
              }
              poll()
            }
          }
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach()
            el.autoplay = true
            document.body.appendChild(el)
            audioElsRef.current.push(el)

            // Meter the track itself. The element plays it; the analyser only observes.
            const raw = track.mediaStreamTrack
            if (raw) startMeter(new MediaStream([raw]))
          }
        })

        // The room going away under us — the cap reached, the worker gone, the network dropped —
        // is not the same as the customer hanging up. The credential is handed back either
        // way, and the screen says what happened rather than silently showing the text tier.
        room.on(RoomEvent.Disconnected, () => {
          if (hangingUpRef.current) return
          teardown()
          setReason(CALL_ENDED)
          setMode('text')
        })

        await room.connect(grant.url, grant.token)
        roomRef.current = room
        // The tile goes up the moment the room is joined, not once the microphone is published:
        // opening the device took five seconds on the first live call, and the worker's greeting
        // was already playing behind a screen that still said "Calling…".
        setMode('live')

        try {
          await room.localParticipant.setMicrophoneEnabled(true)
        } catch {
          // A call he cannot hear is not a call. Hand the slot back and say why.
          hangingUpRef.current = true
          teardown()
          void room.disconnect().finally(() => {
            hangingUpRef.current = false
          })
          setReason('The microphone could not be opened, so the call was ended. Text still works.')
          setMode('text')
          return
        }

        if (grant.expiresInSeconds > 0) {
          setSecondsLeft(grant.expiresInSeconds)
          const started = Date.now()
          countdownRef.current = window.setInterval(() => {
            const left = grant.expiresInSeconds - Math.round((Date.now() - started) / 1000)
            setSecondsLeft(Math.max(0, left))
            if (left <= 0) stopCountdown()
          }, 1000)
        }
      } catch (err) {
        // A grant that was issued but never joined is still billing and still holds the slot.
        if (sessionRef.current) teardown()

        if (isApiError(err)) {
          // The server's own wording, always. Hardcoding one message here made "our pool is
          // full" and "Runway's account limit is full" look identical on screen, and only one of
          // those is fixed by adding credentials.
          setReason(err.message)
          const body = err.body
          if (err.status === 409 && typeof body?.['ticket'] === 'string') {
            setQueue({
              ticket: body['ticket'],
              state: 'waiting',
              position: typeof body['position'] === 'number' ? body['position'] : 1,
              estimatedWaitSeconds:
                typeof body['estimatedWaitSeconds'] === 'number'
                  ? body['estimatedWaitSeconds']
                  : null,
              holdUntil: null,
              holdSeconds: 0,
            })
          }
          setMode('text')
          return
        }
        // Offline, blocked, or a browser without H.264 — all of which end in the same place, and
        // the same place is a working product rather than a broken screen.
        setReason(err instanceof Error && err.message ? err.message : CALL_FAILED)
        setMode('text')
      }
    },
    [startMeter, stopCountdown, teardown],
  )

  // While in line, ask every few seconds where we stand. The server holds a claimable slot for
  // a short window, so the poll is what turns "you are next" into a call.
  useEffect(() => {
    if (queue?.state !== 'waiting' || mode === 'live' || mode === 'connecting') return
    const ticket = queue.ticket
    const timer = window.setInterval(() => {
      void api('getWaitlist', { params: { ticket } })
        .then((status) => {
          setQueue((prev) => {
            if (prev?.ticket !== ticket) return prev
            const holdSeconds =
              status.state === 'claimable' && status.holdUntil
                ? Math.max(
                    1,
                    Math.round((new Date(status.holdUntil).getTime() - Date.now()) / 1000),
                  )
                : 0
            return {
              ticket,
              state: status.state,
              position: status.position,
              estimatedWaitSeconds: status.estimatedWaitSeconds,
              holdUntil: status.holdUntil,
              holdSeconds,
            }
          })
        })
        .catch((err: unknown) => {
          // The ticket is gone — expired server-side, or a session that is no longer ours.
          if (isApiError(err) && (err.status === 404 || err.status === 403)) {
            setQueue((prev) => (prev?.ticket === ticket ? { ...prev, state: 'expired' } : prev))
          }
        })
    }, QUEUE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [queue, mode])

  // A claimable ticket is held for a short window. Once it lapses the server has moved on to
  // the next in line, so the card must stop promising a call the ticket can no longer win.
  useEffect(() => {
    if (queue?.state !== 'claimable' || !queue.holdUntil) return
    const ticket = queue.ticket
    const remaining = new Date(queue.holdUntil).getTime() - Date.now()
    const timer = window.setTimeout(
      () => setQueue((prev) => (prev?.ticket === ticket ? { ...prev, state: 'expired' } : prev)),
      Math.max(0, remaining),
    )
    return () => window.clearTimeout(timer)
  }, [queue])

  const joinFromQueue = useCallback(async () => {
    if (queue?.state === 'claimable') await start(queue.ticket)
  }, [queue, start])

  const leaveQueue = useCallback(() => {
    const ticket = queue?.ticket
    const wasQueued = queue?.state !== 'expired'
    setQueue(null)
    setReason(null)
    if (ticket && wasQueued)
      void api('leaveWaitlist', { params: { ticket } }).catch(() => undefined)
  }, [queue])

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    void roomRef.current?.localParticipant.setMicrophoneEnabled(!next).catch(() => undefined)
  }, [])

  return {
    mode,
    reason,
    queue,
    attachVideo,
    start: () => start(),
    joinFromQueue,
    leaveQueue,
    stop,
    muted,
    toggleMute,
    videoLive,
    secondsLeft,
    audioLevel,
  }
}
