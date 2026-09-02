/**
 * The Runway avatar session.
 *
 * Runway Characters owns the whole conversation: microphone in, its own cloned voice out,
 * photorealistic video out over WebRTC via LiveKit. We do not generate the voice, and the client
 * never holds a Runway key — it asks our API for a short-lived LiveKit token, which is the rule
 * from CONTRIBUTING.md that a client able to reach a provider directly is a client that can leak a key.
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
 * "Uday is with another customer" is a thing a real judge will genuinely see.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type AvatarMode = 'idle' | 'connecting' | 'live' | 'text' | 'error'

export interface AvatarSession {
  mode: AvatarMode
  /** Why we are in text mode, in words a customer can read. */
  reason: string | null
  /** The element the LiveKit video track is attached to. */
  videoRef: React.RefObject<HTMLVideoElement | null>
  start: () => Promise<void>
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

interface SessionGrant {
  url: string
  token: string
  sessionId: string
  /**
   * How long after connecting the worker actually starts publishing decodable frames. Measured
   * at ~5s in the verification run, and the reason this screen needs a designed waiting state
   * rather than an empty `<video>` — for the first few seconds there is genuinely nothing.
   */
  expectVideoAfterMs?: number
  expiresInSeconds?: number
}

export function useAvatar(personality: string): AvatarSession {
  const [mode, setMode] = useState<AvatarMode>('idle')
  const [reason, setReason] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [videoLive, setVideoLive] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const roomRef = useRef<{ disconnect: () => void } | null>(null)
  const sessionRef = useRef<string | null>(null)
  const meterRef = useRef<{ ctx: AudioContext; raf: number } | null>(null)

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

  /**
   * Hand the credential back.
   *
   * Runway bills from session creation until the worker dies, and Tier 1 allows one live session
   * per credential — so a call the customer walked away from is both money and the next person's
   * turn. `keepalive` lets this survive the page unloading.
   */
  const release = useCallback((sessionId: string | null) => {
    if (!sessionId) return
    void fetch(`/api/avatar/session/${sessionId}/end`, { method: 'POST', keepalive: true }).catch(
      () => undefined,
    )
  }, [])

  const stop = useCallback(() => {
    stopMeter()
    roomRef.current?.disconnect()
    roomRef.current = null
    release(sessionRef.current)
    sessionRef.current = null
    setVideoLive(false)
    setSecondsLeft(null)
    setMode('idle')
  }, [release, stopMeter])

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

  const start = useCallback(async () => {
    setMode('connecting')
    setReason(null)

    try {
      const res = await fetch('/api/avatar/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personality }),
      })

      if (!res.ok) {
        // Use the server's own wording. Hardcoding one message here made "our pool is full" and
        // "Runway's account limit is full" look identical on screen, and only one of those is
        // fixed by adding credentials.
        const detail = (await res.json().catch(() => null)) as { error?: string } | null
        setReason(
          detail?.error ??
            (res.status === 503
              ? 'The voice service is not configured in this build.'
              : `The voice service replied ${res.status}.`),
        )
        setMode('text')
        return
      }

      const grant = (await res.json()) as SessionGrant
      sessionRef.current = grant.sessionId ?? null

      // Imported here rather than at module scope so the LiveKit client is not in the initial
      // bundle. Most sessions never open a call, and this screen has to paint fast.
      const { Room, RoomEvent, Track } = await import('livekit-client')
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

          // Meter the track itself. The element plays it; the analyser only observes.
          const raw = track.mediaStreamTrack
          if (raw) startMeter(new MediaStream([raw]))
        }
      })

      room.on(RoomEvent.Disconnected, () => {
        stopMeter()
        setVideoLive(false)
        setSecondsLeft(null)
        setMode('idle')
      })

      await room.connect(grant.url, grant.token)
      await room.localParticipant.setMicrophoneEnabled(true)

      roomRef.current = room
      setMode('live')

      if (grant.expiresInSeconds) {
        setSecondsLeft(grant.expiresInSeconds)
        const started = Date.now()
        const tick = window.setInterval(() => {
          const left = grant.expiresInSeconds! - Math.round((Date.now() - started) / 1000)
          setSecondsLeft(Math.max(0, left))
          if (left <= 0) window.clearInterval(tick)
        }, 1000)
      }
    } catch (err) {
      // Offline, blocked, or a browser without H.264 — all of which end in the same place, and
      // the same place is a working product rather than a broken screen.
      setReason(err instanceof Error ? err.message : 'Could not reach the voice service.')
      setMode('text')
    }
  }, [personality, startMeter, stopMeter])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      const room = roomRef.current as { localParticipant?: { setMicrophoneEnabled: (v: boolean) => void } } | null
      room?.localParticipant?.setMicrophoneEnabled(!next)
      return next
    })
  }, [])

  return {
    mode,
    reason,
    videoRef,
    start,
    stop,
    muted,
    toggleMute,
    videoLive,
    secondsLeft,
    audioLevel,
  }
}
