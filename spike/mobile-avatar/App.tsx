/**
 * Spike: does Uday survive the reflowing split on a real phone?
 *
 * This answers exactly one question and is meant to be thrown away. `destination.md` picked
 * layout A — the video region shrinks from full-bleed to ~55% of the screen and re-crops to keep
 * his face centred, with the advice card taking the solid ground beneath it. That choice is
 * conditional on Runway's actual framing: if the Character is composed centre-of-frame with
 * headroom, cropping to 55% may cut across his chin, and the fallback is the lower third.
 *
 * Nothing here is production code. It talks to the real API and burns a real billed session,
 * because a fake provider tells you nothing about framing, which is the whole question.
 *
 * Run it, tap Call, wait for video, then toggle the card and look at his face.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  registerGlobals,
  useTracks,
} from '@livekit/react-native'
import { Track } from 'livekit-client'

/* ------------------------------------------------------------------ config */

/**
 * Your machine's LAN address, not localhost — localhost on a handset is the handset.
 * Find it with `ipconfig getifaddr en0` (macOS). The API must be reachable from the phone,
 * so both must be on the same wifi.
 */
const API_BASE = 'http://192.168.1.10:8080'

/** Which persona to call as. Rohan is the design target. */
const PREFERRED_CIF = 'IDBI0009182731'

/* ------------------------------------------------------------------ tokens
 * Verbatim from apps/web/src/styles/tokens.css, so the crop is judged against the real chrome. */
const T = {
  brandDeep: '#164c3f',
  brandNight: '#0e3329',
  ink: '#1d1d1d',
  inkSoft: '#66696a',
  accent: '#00735d',
  onAccent: '#ffffff',
  danger: '#b3261e',
  ground: '#ffffff',
  hairlineMint: '#bbdbd6',
} as const

/** 460 / 844 from the mock, expressed as a ratio so it holds on any handset. */
const SPLIT_RATIO = 460 / 844

/* ------------------------------------------------------------------ api */

type Grant = {
  url: string
  token: string
  runwaySessionId: string
  expectVideoAfterMs: number
  expiresInSeconds: number
}

function idempotencyKey() {
  return `spike-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function json(res: Response, what: string) {
  const body = await res.text()
  if (!res.ok) throw new Error(`${what} → ${res.status}\n${body.slice(0, 400)}`)
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`${what} → not JSON\n${body.slice(0, 200)}`)
  }
}

/** customers → session token → avatar grant. Three calls, the same order the web client uses. */
async function getGrant(log: (s: string) => void): Promise<Grant> {
  log('GET /api/v1/customers')
  const customers = await json(await fetch(`${API_BASE}/api/v1/customers`), 'customers')
  if (!Array.isArray(customers) || customers.length === 0) throw new Error('no customers returned')

  const picked = customers.find((c: { cif?: string }) => c.cif === PREFERRED_CIF) ?? customers[0]
  log(`picked ${picked.custName ?? picked.cif}`)

  log('POST /api/v1/sessions')
  const session = await json(
    await fetch(`${API_BASE}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cif: picked.cif }),
    }),
    'sessions',
  )

  log('POST /api/v1/avatar/session')
  const grant = await json(
    await fetch(`${API_BASE}/api/v1/avatar/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.token}`,
        'idempotency-key': idempotencyKey(),
      },
      // The body is strict-empty. The brief is built server-side; a brief the client can edit
      // is a compliance claim the client can undo.
      body: JSON.stringify({}),
    }),
    'avatar/session',
  )

  log(`granted · video expected in ~${grant.expectVideoAfterMs}ms`)
  return grant as Grant
}

/* ------------------------------------------------------------------ video */

/** Renders whatever remote camera track the room is publishing, cropped to fill its box. */
function UdayVideo() {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true })
  const remote = tracks.find((t) => !t.participant.isLocal)

  if (!remote?.publication?.track) {
    return (
      <View style={styles.waiting}>
        <ActivityIndicator color="#6fdcb8" />
        <Text style={styles.waitingText}>waiting for his first frame…</Text>
      </View>
    )
  }

  return (
    <VideoTrack
      trackRef={remote}
      style={StyleSheet.absoluteFill}
      // The whole question: `cover` crops to fill the box. If his chin goes, it's the
      // lower third instead.
      objectFit="cover"
    />
  )
}

/* ------------------------------------------------------------------ screen */

function CallScreen({ onHangUp }: { onHangUp: () => void }) {
  const { height } = Dimensions.get('window')
  const [card, setCard] = useState<'none' | 'action' | 'refusal'>('none')

  const videoHeight = card === 'none' ? height : Math.round(height * SPLIT_RATIO)

  return (
    <View style={styles.call}>
      <View style={[styles.video, { height: videoHeight }]}>
        <UdayVideo />
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {card === 'action' ? (
        <View style={styles.card}>
          <Text style={styles.kicker}>NO LIFE COVER</Text>
          <Text style={styles.figure}>
            ₹1,040<Text style={styles.figureUnit}> / month</Text>
          </Text>
          <Text style={styles.note}>Term cover · ₹1 crore · 30 years</Text>
          <View style={styles.actions}>
            <View style={[styles.btn, styles.btnPrimary]}>
              <Text style={styles.btnPrimaryText}>Do it</Text>
            </View>
            <View style={[styles.btn, styles.btnQuiet]}>
              <Text style={styles.btnQuietText}>Not now</Text>
            </View>
          </View>
        </View>
      ) : null}

      {card === 'refusal' ? (
        <View style={[styles.card, styles.cardRefusal]}>
          <Text style={[styles.kicker, { color: T.danger }]}>I WON'T RECOMMEND THIS</Text>
          <Text style={styles.refusalLine}>
            The ULIP buries its costs and does two jobs badly. Term cover protects your family for
            about a fifth of it.
          </Text>
        </View>
      ) : null}

      {/* Spike controls — not part of the design. */}
      <View style={styles.rig}>
        {(['none', 'action', 'refusal'] as const).map((c) => (
          <Pressable
            key={c}
            onPress={() => setCard(c)}
            style={[styles.rigBtn, card === c && styles.rigBtnOn]}
          >
            <Text style={[styles.rigText, card === c && styles.rigTextOn]}>{c}</Text>
          </Pressable>
        ))}
        <Pressable onPress={onHangUp} style={[styles.rigBtn, styles.rigEnd]}>
          <Text style={styles.rigTextOn}>end</Text>
        </Pressable>
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ app */

registerGlobals()

export default function App() {
  const [grant, setGrant] = useState<Grant | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    // Without this the phone routes audio to the earpiece and you will think it is broken.
    AudioSession.startAudioSession()
    return () => {
      AudioSession.stopAudioSession()
    }
  }, [])

  const log = useCallback((s: string) => {
    setLines((prev) => [...prev, s])
  }, [])

  const call = useCallback(async () => {
    setBusy(true)
    setError(null)
    setLines([])
    try {
      const g = await getGrant(log)
      if (mounted.current) setGrant(g)
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [log])

  if (grant) {
    return (
      <LiveKitRoom
        serverUrl={grant.url}
        token={grant.token}
        connect
        audio={true}
        video={false}
        onDisconnected={() => setGrant(null)}
      >
        <StatusBar barStyle="light-content" />
        <CallScreen onHangUp={() => setGrant(null)} />
      </LiveKitRoom>
    )
  }

  return (
    <SafeAreaView style={styles.lobby}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>Uday · framing spike</Text>
      <Text style={styles.sub}>
        Answers one thing: does his face survive a crop to {Math.round(SPLIT_RATIO * 100)}% of the
        screen. Tap Call, wait for video, then switch the card and look at his chin.
      </Text>

      <Pressable onPress={call} disabled={busy} style={[styles.cta, busy && { opacity: 0.5 }]}>
        <Text style={styles.ctaText}>{busy ? 'Connecting…' : 'Call Uday'}</Text>
      </Pressable>

      <Text style={styles.api}>{API_BASE}</Text>

      <ScrollView style={styles.logBox} contentContainerStyle={{ padding: 12 }}>
        {lines.map((l, i) => (
          <Text key={i} style={styles.logLine}>
            {l}
          </Text>
        ))}
        {error ? <Text style={styles.errText}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ styles */

const styles = StyleSheet.create({
  lobby: { flex: 1, backgroundColor: T.ground, padding: 22, gap: 14 },
  title: { fontSize: 24, fontWeight: '600', color: T.ink, marginTop: 24 },
  sub: { fontSize: 15, color: T.inkSoft, lineHeight: 21 },
  cta: {
    backgroundColor: T.accent,
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 6,
  },
  ctaText: { color: T.onAccent, fontSize: 16, fontWeight: '600' },
  api: {
    fontSize: 12,
    color: '#929292',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logBox: { flex: 1, backgroundColor: '#f4f4f4', borderRadius: 14 },
  logLine: {
    fontSize: 12,
    color: T.inkSoft,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 3,
  },
  errText: {
    fontSize: 12,
    color: T.danger,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 8,
  },

  call: { flex: 1, backgroundColor: T.brandNight },
  video: { width: '100%', backgroundColor: T.brandDeep, overflow: 'hidden' },
  waiting: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  waitingText: { color: 'rgba(255,255,255,0.72)', fontSize: 13 },
  live: {
    position: 'absolute',
    top: 58,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: '#6fdcb8' },
  liveText: { color: 'rgba(255,255,255,0.72)', fontSize: 11, letterSpacing: 1 },

  card: { backgroundColor: T.ground, padding: 20, gap: 8 },
  cardRefusal: { backgroundColor: '#fbe3e0' },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: T.inkSoft },
  figure: { fontSize: 34, fontWeight: '600', color: T.ink },
  figureUnit: { fontSize: 17, fontWeight: '400', color: T.inkSoft },
  note: { fontSize: 14, color: T.inkSoft },
  refusalLine: { fontSize: 16, color: '#4a1512', lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  btnPrimary: { backgroundColor: T.accent },
  btnPrimaryText: { color: T.onAccent, fontSize: 15, fontWeight: '600' },
  btnQuiet: { borderWidth: 1, borderColor: T.hairlineMint },
  btnQuietText: { color: T.inkSoft, fontSize: 15, fontWeight: '600' },

  rig: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  rigBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  rigBtnOn: { backgroundColor: T.accent },
  rigEnd: { backgroundColor: T.danger },
  rigText: { color: 'rgba(255,255,255,0.72)', fontSize: 12 },
  rigTextOn: { color: '#fff', fontSize: 12, fontWeight: '600' },
})
