/**
 * The realistic avatar, driven by the voice we already have.
 *
 * The service is a mouth, not a speaker. gpt-realtime produces the audio — with its prosody
 * and its sub-second barge-in — and we hand that same MediaStreamTrack to Simli, which returns
 * a face moving in time with it. No second TTS pass, so nothing about the voice changes.
 *
 *   gpt-realtime ──WebRTC──▶ audio track ──▶ Simli ──▶ <video> + <audio>, frame-locked
 *
 * Two details that matter more than the integration itself:
 *
 *   Play the audio Simli returns, not the original track. It is our own PCM passed through,
 *   but it comes back locked to the video. Playing gpt-realtime's track alongside drifts
 *   within seconds and the lips stop matching.
 *
 *   Barge-in has to propagate. When the user interrupts, gpt-realtime stops mid-word and the
 *   mouth must stop with it, or you get a face chewing silence — worse than no face at all.
 *   That is what interrupt() is for, and it should be called the moment speech is detected.
 *
 * Everything degrades to null. No key, no network, a failed session: the stage falls back to
 * its own renderer and the demo still runs.
 */

export async function startAvatar({ videoEl, audioEl, audioTrack, onSpeaking, onError }) {
  if (!videoEl || !audioEl || !audioTrack) return null

  let session
  try {
    const res = await fetch('/api/avatar/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.info('[avatar] not available, using the built-in renderer:', body.error || res.status)
      return null
    }
    session = await res.json()
  } catch (err) {
    console.info('[avatar] session request failed, using the built-in renderer:', err.message)
    return null
  }

  let SimliClient
  try {
    // Imported from dist/client.js rather than the package root on purpose. simli-client@3.0.2
    // ships dist/client.js but its index does require("./Client") with a capital C, so the
    // package root fails to resolve on any case-sensitive filesystem — which is every Linux
    // box, including whatever the sandbox runs on. Reaching past the broken barrel file is
    // the least invasive fix; revisit if they publish a corrected build.
    ({ SimliClient } = await import('simli-client/dist/client.js'))
  } catch (err) {
    console.warn('[avatar] simli-client unavailable:', err.message)
    return null
  }

  const client = new SimliClient(
    session.sessionToken,
    videoEl,
    audioEl,
    session.iceServers ?? null,
  )

  client.on('speaking', () => onSpeaking?.(true))
  client.on('silent', () => onSpeaking?.(false))
  client.on('error', (detail) => onError?.(detail))
  client.on('startup_error', (detail) => onError?.(detail))

  try {
    await client.start()
    // The whole trick, in one line: the face listens to the voice we already have.
    client.listenToMediastreamTrack(audioTrack)
  } catch (err) {
    onError?.(err.message)
    try { await client.stop() } catch { /* already down */ }
    return null
  }

  return {
    /** Call the instant the user starts speaking, so the mouth stops with the voice. */
    interrupt() {
      try { client.ClearBuffer() } catch { /* nothing buffered */ }
    },
    async stop() {
      try { await client.stop() } catch { /* already down */ }
    },
  }
}
