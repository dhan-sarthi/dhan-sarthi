// Minimal WebRTC client for the OpenAI Realtime API (GA), speech-to-speech.
// The API key is supplied at runtime and never leaves the browser except to api.openai.com.

const MODEL = 'gpt-realtime'

export async function startVoiceSession({
  apiKey,
  instructions,
  tools,
  toolHandler,
  onStatus,
  onCaption, // (text, isFinal) — assistant transcript
  onUserCaption, // (text) — user's transcribed speech
  onLevel, // 0..1 output-audio energy, drives the avatar's mouth
  onError,
}) {
  let pc, dc, mic, audioCtx, rafId
  const audioEl = new Audio()
  audioEl.autoplay = true

  const cleanup = () => {
    cancelAnimationFrame(rafId)
    try { dc?.close() } catch { /* already closed */ }
    try { pc?.getSenders().forEach((s) => s.track?.stop()) } catch { /* no senders */ }
    try { mic?.getTracks().forEach((t) => t.stop()) } catch { /* no mic */ }
    try { pc?.close() } catch { /* already closed */ }
    try { audioCtx?.close() } catch { /* already closed */ }
    audioEl.srcObject = null
  }

  const fail = (why, detail) => {
    cleanup()
    onError?.(why, detail)
  }

  try {
    onStatus?.('mic')
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
  } catch {
    onError?.('mic-denied')
    return null
  }

  onStatus?.('connecting')
  pc = new RTCPeerConnection()
  mic.getTracks().forEach((t) => pc.addTrack(t, mic))

  pc.ontrack = (e) => {
    const stream = e.streams[0]
    audioEl.srcObject = stream
    // analyser drives the talking-avatar animation
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const src = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const buf = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      onLevel?.(Math.min(1, Math.sqrt(sum / buf.length) * 4))
      rafId = requestAnimationFrame(tick)
    }
    tick()
  }

  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected'].includes(pc.connectionState)) fail('connection-lost')
  }

  dc = pc.createDataChannel('oai-events')
  const send = (obj) => { if (dc.readyState === 'open') dc.send(JSON.stringify(obj)) }

  dc.onopen = () => {
    // Core session config (shape verified against the GA API)
    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions,
        audio: { output: { voice: 'cedar' } },
        tools,
      },
    })
    // Nice-to-haves: user-speech transcription for captions. Sent separately so a
    // schema mismatch can't break the core session; errors are ignored.
    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: {
          input: { transcription: { model: 'gpt-4o-mini-transcribe' } },
          output: { voice: 'cedar' },
        },
      },
    })
    // The instructions tell the avatar to greet first.
    send({ type: 'response.create' })
    onStatus?.('listening')
  }

  dc.onmessage = async (e) => {
    let ev
    try { ev = JSON.parse(e.data) } catch { return }

    switch (ev.type) {
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        onCaption?.(ev.delta, false)
        break
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        onCaption?.(ev.transcript, true)
        break
      case 'conversation.item.input_audio_transcription.completed':
        onUserCaption?.(ev.transcript)
        break
      case 'input_audio_buffer.speech_started':
        onStatus?.('listening')
        break
      case 'output_audio_buffer.started':
        onStatus?.('speaking')
        break
      case 'output_audio_buffer.stopped':
        onStatus?.('listening')
        break
      case 'response.output_item.done': {
        const item = ev.item
        if (item?.type === 'function_call') {
          let args = {}
          try { args = JSON.parse(item.arguments) } catch { /* leave empty */ }
          let result
          try { result = await toolHandler(item.name, args) } catch (err) {
            result = { error: String(err) }
          }
          send({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(result ?? { ok: true }) },
          })
          send({ type: 'response.create' })
        }
        break
      }
      case 'error':
        // non-fatal server events (e.g. optional session tweak rejected) — log only
        console.warn('realtime error event:', ev.error?.message)
        break
      default:
        break
    }
  }

  // SDP handshake
  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const res = await fetch(`https://api.openai.com/v1/realtime/calls?model=${MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      fail(res.status === 401 ? 'bad-key' : 'connect-failed', detail.slice(0, 200))
      return null
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })
  } catch (err) {
    fail('connect-failed', String(err))
    return null
  }

  return {
    stop() {
      cleanup()
      onStatus?.('ended')
    },
    setMuted(muted) {
      mic.getAudioTracks().forEach((t) => { t.enabled = !muted })
    },
    sendText(text) {
      send({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
      })
      send({ type: 'response.create' })
    },
  }
}
