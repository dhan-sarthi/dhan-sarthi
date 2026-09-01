/**
 * The conversational avatar.
 *
 * Runway Characters runs the whole conversation: it hears the microphone, thinks, and speaks
 * in the Character's own cloned voice while publishing video locked to it. The transport is
 * WebRTC — a LiveKit room the Character worker joins as a second participant — so this file is
 * a room join, a microphone publish, and two elements to attach:
 *
 *   mic ──▶ LiveKit room ──▶ Runway Character worker ──▶ <video> + <audio>, frame-locked
 *
 * Three things come back over the same connection besides audio and video, and they are the
 * reason this is a product rather than a talking head:
 *
 *   transcript     streaming deltas on the data channel, interim and final, attributed by
 *                  participant. This is what feeds semantic memory and the audit record, and
 *                  it arrives *during* the conversation rather than after it.
 *
 *   client events  the Character calling a tool that belongs to the UI — show this artifact,
 *                  now, as the sentence is being said. Fire-and-forget by design.
 *
 *   speaking       who currently holds the floor, which is how the UI reflects barge-in.
 *
 * We keep the room plumbing on livekit-client and borrow only the payload parsers from
 * Runway's SDK. That is deliberate: the SDK's own entry points do the `/consume` call in the
 * browser, which would mean shipping a session key to the client. Ours is consumed server-side
 * and the browser only ever holds a single-room JWT.
 *
 * Everything degrades to null. No key, no credential, no video inside the timeout, and the
 * caller falls back to the voice-only path with its own renderer.
 */

const VIDEO_TIMEOUT_MS = 20_000

/**
 * Open a conversation.
 *
 * @param {object} o
 * @param {HTMLVideoElement} o.videoEl
 * @param {HTMLAudioElement} o.audioEl
 * @param {string} o.cif                    which customer — the only thing the client chooses;
 *                                          the brief itself is built server-side
 * @param {(entries:Array)=>void} [o.onTranscript]  every update, interim included
 * @param {(tool:string,args:object)=>void} [o.onClientEvent]
 * @param {(who:'user'|'avatar'|null)=>void} [o.onSpeaking]
 * @param {(detail:string)=>void} [o.onError]
 * @returns {Promise<{sessionId:string, interrupt():void, setMuted(b:boolean):void, stop():Promise<void>}|null>}
 */
export async function startAvatar({
  videoEl, audioEl, cif, onTranscript, onClientEvent, onSpeaking, onError,
}) {
  if (!videoEl || !audioEl || !cif) return null

  let session
  try {
    const res = await fetch('/api/avatar/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cif }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.info('[avatar] not available, falling back:', body.error || res.status)
      return null
    }
    session = await res.json()
  } catch (err) {
    console.info('[avatar] session request failed, falling back:', err.message)
    return null
  }

  let mic
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
  } catch {
    onError?.('mic-denied')
    release(session.sessionId)
    return null
  }

  try {
    return await join({ session, mic, videoEl, audioEl, onTranscript, onClientEvent, onSpeaking, onError })
  } catch (err) {
    onError?.(err.message)
    mic.getTracks().forEach((t) => t.stop())
    release(session.sessionId)
    return null
  }
}

/** Best-effort teardown. keepalive so it still fires if the tab is closing. */
function release(sessionId) {
  if (!sessionId) return
  fetch(`/api/avatar/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE', keepalive: true })
    .catch(() => { /* the worker expires on its own at maxDuration */ })
}

async function join({ session, mic, videoEl, audioEl, onTranscript, onClientEvent, onSpeaking, onError }) {
  const [{ Room, RoomEvent, Track }, { TranscriptAccumulator, parseClientEvent }] = await Promise.all([
    import('livekit-client'),
    import('@runwayml/avatars'),
  ])

  const room = new Room({ adaptiveStream: false, dynacast: false })

  // interim: true because a caption that appears only when a sentence finishes is not a live
  // caption, and the artifacts are meant to land while the sentence is still being said.
  const transcript = new TranscriptAccumulator({ interim: true })
  transcript.on('update', (entries) => onTranscript?.(entries))

  let attached = false
  const gotVideo = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), VIDEO_TIMEOUT_MS)
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        track.attach(videoEl)
        clearTimeout(timer)
        if (!attached) { attached = true; resolve(true) }
      } else if (track.kind === Track.Kind.Audio) {
        // The Character's voice, already locked to its video. This is the one to play.
        track.attach(audioEl)
      }
    })
  })

  // Transcript and tool calls share the data channel. The accumulator handles both the
  // LiveKit segment shape and Runway's flat streaming deltas, so we hand it everything and
  // separately look for the tool payloads.
  room.on(RoomEvent.DataReceived, (payload, participant) => {
    const event = parseClientEvent(payload)
    if (event) { onClientEvent?.(event.tool, event.args); return }
    transcript.ingestDataChannel(payload, participant?.identity ?? 'avatar')
  })
  room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
    transcript.ingestNative(segments, participant?.identity ?? 'avatar')
  })

  room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    const local = room.localParticipant?.identity
    if (!speakers.length) return onSpeaking?.(null)
    onSpeaking?.(speakers.some((p) => p.identity === local) ? 'user' : 'avatar')
  })
  room.on(RoomEvent.Disconnected, (reason) => {
    if (attached) onError?.(`disconnected: ${reason ?? 'unknown'}`)
  })

  await room.connect(session.serverUrl, session.token)
  await room.localParticipant.publishTrack(mic.getAudioTracks()[0], {
    source: Track.Source.Microphone,
  })

  if (!(await gotVideo)) {
    onError?.(`no character video within ${VIDEO_TIMEOUT_MS / 1000}s`)
    mic.getTracks().forEach((t) => t.stop())
    try { await room.disconnect() } catch { /* already down */ }
    release(session.sessionId)
    return null
  }

  return {
    sessionId: session.sessionId,

    /**
     * Barge-in needs no plumbing here. Runway's worker hears the microphone continuously and
     * stops speaking when the customer starts, the same way a person does — there is no
     * buffer of ours to flush. Kept so callers can treat all drivers alike.
     */
    interrupt() {},

    setMuted(muted) {
      mic.getAudioTracks().forEach((t) => { t.enabled = !muted })
    },

    async stop() {
      // Tell the worker the call is over before dropping the socket, so it shuts down
      // gracefully instead of waiting out its timeout on our credit.
      try {
        await room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: 'END_CALL' })),
          { reliable: true },
        )
      } catch { /* the DELETE below is the real backstop */ }
      transcript.dispose()
      mic.getTracks().forEach((t) => t.stop())
      try { await room.disconnect() } catch { /* already down */ }
      release(session.sessionId)
    },
  }
}
