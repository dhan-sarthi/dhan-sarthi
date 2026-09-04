/**
 * Ask Uday — a call when the line is free, and the same advisor in text when it is not.
 *
 * Talking to your banker is a call: you see him, you press one button, you talk. But Runway's
 * Tier 1 allows one live session, so a second reviewer will genuinely find him busy — and the
 * fallback ladder says that reviewer still gets the diagnosis and, above all, the refusal. So the
 * screen has two faces. On a call it is the portrait tile and two controls. Off a call it is a
 * short conversation over `/ask` (the deterministic engine, no model) with a "Check a product"
 * affordance that runs the same suitability gate the avatar's tool calls, writing the same
 * advice record.
 *
 * `/avatar/availability` is read before the Call button is drawn. A button that leads to a busy
 * signal misleads; a sentence saying he is with another customer does not.
 *
 * **Why the video sits in a tile rather than filling the screen.** Runway publishes a landscape
 * track — 1088×704, about 1.55:1 — and a phone is 390×844, about 0.46:1. Filling that with
 * `object-fit: cover` keeps **30% of the source width**, which is why he arrived cropped to the
 * bridge of his nose. A 4:5 tile keeps a little over half the width, which is close to the
 * head-and-shoulders framing the source was composed for.
 *
 * **The surfaces.** This screen is the hero — full-bleed brand green carrying the bank's wave —
 * so it never puts a hero panel on top of one. The other two roles are translated onto the green
 * rather than dropped: the *card* is white with ink on it and is spent on one thing only, Uday's
 * turns, because his answers are the part that has to be read carefully; everything else is a
 * *bare row* — the customer's own question, the unavailable sentence, the suggestions — white type
 * straight onto the green with no container at all. Two speakers rendered as two blocks of the
 * same shape is what made a transcript read as wallpaper.
 */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { AvatarAvailability, ShelfProduct, Verdict } from '@dhan/contracts'
import { isApiError } from '../api/client.ts'
import type { AskBackend } from '../lib/ask.ts'
import { useAvatar } from '../lib/avatar.ts'
import type { QueuePlace } from '../lib/avatar.ts'
import { inr } from '../lib/money.ts'
import { riseDelay } from '../lib/motion.ts'
import { QueueCard } from '../components/QueueCard.tsx'
import type { Tier } from '../components/TierBadge.tsx'
import { Wave } from '../components/Wave.tsx'

/** While in line, availability is re-read this often so the queue length and minutes stay honest. */
const WAITING_POLL_MS = 5_000

/**
 * The demo's climax, spotted in the suggestions core hands us.
 *
 * `suggestedQuestions()` offers the cousin's LIC savings plan fourth of six, which on a 390px
 * screen puts it past the right edge of a scrolling strip of identical pills — the one tap the
 * whole product is built around, hidden behind a swipe. It is matched here, promoted to the front
 * and given the only filled chip on the screen. The wording is core's, untouched.
 */
const CLIMAX = /\bLIC\b|ULIP|endowment|savings plan/i

interface Turn {
  id: number
  who: 'uday' | 'you'
  text: string
  evidence?: string[]
  verdict?: Verdict
}

export function Ask({
  backend,
  shelf,
  monthlyAmount,
  tier,
  availability,
  onOpen,
  onClose,
}: {
  backend: AskBackend
  shelf: ShelfProduct[]
  /** What a product check proposes per month: the deployable surplus, so the verdict is real. */
  monthlyAmount: number
  tier: Tier
  availability: AvatarAvailability | null
  /** Re-read availability; called once when the screen opens. */
  onOpen: () => void
  onClose: () => void
}): ReactNode {
  // The callback ref is taken out here on purpose: once a property of `avatar` is passed to a
  // `ref` prop, the React Compiler lint treats every later read of `avatar` as a ref read.
  const { attachVideo, ...avatar } = useAvatar()

  useEffect(() => {
    onOpen()
  }, [onOpen])

  const waiting = avatar.queue?.state === 'waiting'
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(onOpen, WAITING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [waiting, onOpen])

  const connecting = avatar.mode === 'connecting'
  const connected = avatar.mode === 'live'
  const onCall = connecting || connected
  // Two different things. The room connects in about a second; the worker publishes nothing for
  // roughly five more. Swapping the poster for the video on connection alone makes a working
  // call look broken, so this waits for frames to actually decode.
  const showVideo = connected && avatar.videoLive

  // He is audible before he is visible — the worker publishes audio several seconds ahead of a
  // decodable video track. Holding the audio back would cut the first words off his greeting, so
  // instead the portrait responds to his voice while we wait. Stillness then reads as connecting
  // rather than frozen.
  const speaking = connected && !avatar.videoLive && avatar.audioLevel > 0.06
  const glow = Math.min(1, avatar.audioLevel * 1.7)

  // The countdown only appears when it is nearly up. A visible timer for the whole call makes a
  // conversation feel metered, and the only thing it needs to do is stop somebody being cut off
  // mid-sentence without warning.
  const runningOut = avatar.secondsLeft !== null && avatar.secondsLeft <= 120

  const inLine = avatar.queue !== null && avatar.queue.state !== 'expired'
  const canCall = tier === 'live' && availability?.available === true && !inLine
  const status = connected
    ? avatar.videoLive
      ? runningOut
        ? `${fmt(avatar.secondsLeft ?? 0)} left`
        : 'Live'
      : speaking
        ? 'Speaking'
        : 'Joining…'
    : connecting
      ? 'Calling…'
      : inLine && avatar.queue
        ? avatar.queue.state === 'claimable'
          ? 'Your turn'
          : `In line · ${avatar.queue.position}`
        : canCall
          ? null
          : 'Text'

  return (
    <div className="absolute inset-0 isolate flex flex-col overflow-hidden bg-gradient-to-b from-brand to-brand-deep text-white">
      {/* IDBI's wave, on the deep end of the gradient where the account cards in GO Mobile+ carry
          it. The band is kept to a third of the screen so the curves stay the bank's proportion
          rather than stretching into a single sweep across 844px. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[38%]"
      >
        <Wave tone="dark" />
      </div>

      {/* --------------------------------------------------- Top bar */}
      <div className="flex flex-none items-center gap-2.5 px-4 pb-1.5 pt-[max(16px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            avatar.stop()
            onClose()
          }}
          aria-label="Close"
          className="grid size-[38px] flex-none place-items-center rounded-pill border-0 bg-white/15 text-white"
        >
          <CloseIcon />
        </button>
        <div className="flex-1" />
        {status ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-white/15 px-3 py-1.5 text-[11.5px] font-bold text-white">
            <span
              className={`size-[7px] rounded-pill ${connected ? 'bg-tint-sage' : 'bg-accent'} ${
                connecting ? 'animate-pulse' : ''
              }`}
            />
            {status}
          </span>
        ) : null}
      </div>

      {onCall ? (
        <>
          {/* --------------------------------------------------- The tile */}
          <div className="flex min-h-0 flex-1 flex-col justify-center px-4">
            <div
              className="relative aspect-[4/5] max-h-full w-full overflow-hidden rounded-lg bg-brand-deep shadow-lift transition-[box-shadow,transform] duration-100 ease-out"
              style={{
                // Three: a hairline inside the edge so the tile reads as a window cut into the
                // green rather than a photograph pasted onto it, the settled lift, and a mint
                // ring that swells with his voice.
                boxShadow: `inset 0 0 0 1px rgb(255 255 255 / 0.18), var(--shadow-lift), 0 0 0 ${(2 + glow * 5).toFixed(1)}px rgb(224 241 235 / ${(glow * 0.5).toFixed(2)})`,
                transform: `scale(${(1 + glow * 0.008).toFixed(4)})`,
              }}
            >
              {/* His actual reference portrait, pulled from the Character and served locally —
                  Runway's own image URL carries an expiring token, so the browser cannot hold it. */}
              <img
                src="/uday.jpg"
                alt="Uday, your IDBI advisor"
                // Longer than feels necessary, on purpose: the poster and the first video frame
                // are the same man in the same chair, so a slow dissolve reads as him settling
                // into focus. A quick swap reads as a glitch.
                className={`absolute inset-0 size-full object-cover object-[center_28%] transition-[opacity,filter] duration-[900ms] ease-in-out ${
                  showVideo ? 'opacity-0' : 'opacity-100'
                } ${connecting ? 'brightness-[0.7] saturate-[0.85]' : ''}`}
              />

              <video
                ref={attachVideo}
                autoPlay
                playsInline
                className={`absolute inset-0 size-full object-cover object-[center_28%] transition-opacity duration-[900ms] ease-in-out ${
                  showVideo ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* A permanent, very soft scrim on the lower third. It settles him into the green
                  instead of leaving a hard-edged rectangle floating on it, and it is what the
                  name underneath reads up into. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-brand-deep/45 to-transparent"
              />

              {/* Only ever one line, and only while something is happening. */}
              {connecting || (connected && !avatar.videoLive) ? (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[9px] bg-gradient-to-t from-brand-deep/90 to-transparent px-4 pb-4 pt-11 text-center text-[13.5px] text-white">
                  {speaking ? <Waveform level={avatar.audioLevel} /> : null}
                  {connecting
                    ? 'Connecting to Uday…'
                    : speaking
                      ? 'He is already talking — one moment'
                      : 'Uday is joining…'}
                </div>
              ) : null}

              {avatar.muted && connected ? (
                <span className="absolute left-3.5 top-3.5 rounded-pill bg-danger px-[11px] py-[5px] text-[11.5px] font-bold text-white">
                  Muted
                </span>
              ) : null}
            </div>

            <div className="px-1 pt-4 text-center">
              <div className="text-[23px] font-bold leading-tight text-white">Uday</div>
              <div className="mt-1 text-sm text-white/70">
                {connected
                  ? avatar.videoLive
                    ? 'He can hear you'
                    : 'Listen — he is introducing himself'
                  : 'IDBI Bank'}
              </div>
            </div>
          </div>

          {/* --------------------------------------------------- Controls */}
          <div className="flex-none px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5">
            {connected ? (
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={avatar.toggleMute}
                  aria-label={avatar.muted ? 'Unmute' : 'Mute'}
                  className={`${ROUND} ${avatar.muted ? 'bg-white text-brand-deep' : 'bg-white/20 text-white'}`}
                >
                  <MicIcon />
                </button>
                <button
                  type="button"
                  onClick={avatar.stop}
                  aria-label="End call"
                  className={`${ROUND} bg-danger text-white`}
                >
                  <EndIcon />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled
                className="flex h-12 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-pill border-0 bg-accent px-5 text-[15px] font-semibold text-white disabled:bg-accent/55"
              >
                <MicIcon />
                Connecting…
              </button>
            )}
          </div>
        </>
      ) : (
        <TextTier
          backend={backend}
          shelf={shelf}
          monthlyAmount={monthlyAmount}
          tier={tier}
          availability={availability}
          canCall={canCall}
          reason={avatar.reason}
          queue={avatar.queue}
          onCall={() => void avatar.start()}
          onJoin={() => void avatar.joinFromQueue()}
          onLeaveQueue={avatar.leaveQueue}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Text tier */

/** Why there is no Call button, in one sentence. The server's own words win when it spoke. */
function unavailableLine(
  tier: Tier,
  availability: AvatarAvailability | null,
  reason: string | null,
): string | null {
  if (reason) return reason
  if (tier === 'offline') return 'A call needs the advisor service. Text works offline.'
  if (!availability) return 'The voice service could not be reached. Text still works.'
  if (!availability.enabled) return 'Voice calls are switched off in this build.'
  if (availability.minutesLeftToday < 2) return 'Today’s call time is used up.'
  if (!availability.available) {
    const wait = availability.estimatedWaitSeconds
    return wait
      ? `Uday is with another customer — about ${Math.max(1, Math.round(wait / 60))} min.`
      : 'Uday is with another customer right now.'
  }
  return null
}

function TextTier({
  backend,
  shelf,
  monthlyAmount,
  tier,
  availability,
  canCall,
  reason,
  queue,
  onCall,
  onJoin,
  onLeaveQueue,
}: {
  backend: AskBackend
  shelf: ShelfProduct[]
  monthlyAmount: number
  tier: Tier
  availability: AvatarAvailability | null
  canCall: boolean
  reason: string | null
  queue: QueuePlace | null
  onCall: () => void
  onJoin: () => void
  onLeaveQueue: () => void
}): ReactNode {
  const [turns, setTurns] = useState<Turn[]>([])
  const [questions, setQuestions] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [product, setProduct] = useState(shelf[0]?.productId ?? '')
  const [thinking, setThinking] = useState(false)
  const [checking, setChecking] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Turn ids, so React keys survive a bubble being appended while an answer is in flight.
  const idRef = useRef(0)
  const nextId = (): number => {
    idRef.current += 1
    return idRef.current
  }

  const push = (turn: Omit<Turn, 'id'>): void => {
    const id = nextId()
    setTurns((prev) => [...prev, { ...turn, id }])
  }

  // The opening line is the diagnosis: what the statements already say. It replaces "what are
  // your goals?", which a customer who has never had advice cannot answer.
  useEffect(() => {
    let cancelled = false
    backend
      .suggestions()
      .then((s) => {
        if (cancelled) return
        setTurns([
          { id: nextId(), who: 'uday', text: s.opening.text, evidence: s.opening.evidence },
        ])
        setQuestions(s.questions)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setTurns([
          {
            id: nextId(),
            who: 'uday',
            text: isApiError(err) ? err.message : 'I could not read your statements just now.',
          },
        ])
      })
    return () => {
      cancelled = true
    }
  }, [backend])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  const ask = async (question: string): Promise<void> => {
    const q = question.trim()
    if (!q || thinking) return
    setDraft('')
    push({ who: 'you', text: q })
    setThinking(true)
    try {
      const a = await backend.ask(q)
      push({ who: 'uday', text: a.text, evidence: a.evidence })
    } catch (err) {
      push({
        who: 'uday',
        text: isApiError(err) ? err.message : 'I could not answer that just now.',
      })
    } finally {
      setThinking(false)
    }
  }

  const check = async (): Promise<void> => {
    const p = shelf.find((s) => s.productId === product)
    if (!p || checking) return
    const amount = Math.max(0, Math.round(monthlyAmount))
    push({
      who: 'you',
      text:
        amount > 0
          ? `Should I put ${inr(amount)} a month into ${p.name}?`
          : `Is ${p.name} right for me?`,
    })
    setChecking(true)
    try {
      const v = await backend.evaluate(p.productId, amount)
      push({ who: 'uday', text: v.spoken ?? v.recorded, verdict: v })
    } catch (err) {
      push({
        who: 'uday',
        text: isApiError(err) ? err.message : 'I could not check that just now.',
      })
    } finally {
      setChecking(false)
    }
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void ask(draft)
  }

  // A failed attempt explains itself even when the line is free again: the server's sentence
  // (or the client's — "Uday did not pick up in time") stays up beside a working Call button.
  const line = reason ?? (canCall ? null : unavailableLine(tier, availability, null))

  // Presentation order only: the same six strings core sent, with the one the demo turns on
  // pulled to the front so it is not sitting off the right edge of the strip.
  const lead = questions.find((q) => CLIMAX.test(q)) ?? null
  const rest = lead === null ? questions : questions.filter((q) => q !== lead)

  return (
    <>
      {/* --------------------------------------------------- Who you are talking to
          The one thing on this screen: his face and one button. A larger portrait with a soft
          ring and a presence dot reads as a person sitting there waiting to be called; a 56px
          thumbnail in a flat row read as an avatar in a contacts list. */}
      <div className="rise flex flex-none items-center gap-3.5 px-4 pb-3.5 pt-1">
        <span className="relative flex-none">
          <img
            src="/uday.jpg"
            alt="Uday, your IDBI advisor"
            className="size-[68px] rounded-pill object-cover object-[center_28%] shadow-lift ring-[3px] ring-white/25"
          />
          {/* Mint when the line is his to take, dim when it is not — the same two colours the
              status pill at the top of the screen already uses. */}
          <span
            aria-hidden="true"
            className={`absolute bottom-0.5 right-0.5 size-3.5 rounded-pill border-[2.5px] border-solid border-brand ${
              canCall ? 'bg-tint-sage' : 'bg-white/45'
            }`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[21px] font-bold leading-tight text-white">Uday</div>
          <div className="mt-0.5 text-[13px] text-white/70">IDBI Bank</div>
        </div>
        {canCall ? (
          <button
            type="button"
            onClick={onCall}
            className="flex h-12 flex-none items-center gap-2 whitespace-nowrap rounded-pill border-0 bg-accent px-5 text-[15px] font-semibold text-white shadow-lift transition-transform duration-100 active:scale-[0.985]"
          >
            <MicIcon />
            Call
          </button>
        ) : null}
      </div>

      {/* Why there is no Call button hangs off a rule as an aside, not as a floating sentence. */}
      {line ? (
        <p
          className="rise m-0 mx-4 mb-3 flex-none border-0 border-l-2 border-solid border-white/35 pl-2.5 text-[13px] leading-normal text-white/80"
          style={riseDelay(1)}
        >
          {line}
        </p>
      ) : null}

      {queue ? (
        <QueueCard place={queue} onJoin={onJoin} onLeave={onLeaveQueue} onCallAgain={onCall} />
      ) : null}

      {/* --------------------------------------------------- The conversation */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-1" aria-live="polite">
        {turns.map((t) => (
          <Bubble key={t.id} turn={t} />
        ))}
        {/* Waiting is a line, not a third block: giving the pause the same white card as an
            answer promises something has arrived when nothing has. */}
        {thinking || checking ? (
          <div className="mb-3 flex items-center gap-2 text-[13.5px] leading-snug text-white/75">
            <span
              aria-hidden="true"
              className="size-[7px] flex-none animate-pulse rounded-pill bg-tint-sage"
            />
            {checking ? 'Checking the rules…' : 'Reading your statements…'}
          </div>
        ) : null}
      </div>

      {/* --------------------------------------------------- Ways to ask
          Not six pills of equal weight in a strip nobody scrolls. The cousin's savings plan sits
          on its own line as the one filled thing here — orange is the action colour, and this tap
          is the action the product exists to answer. The rest stay a quiet, smaller row. */}
      <div className="flex-none px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        {lead ? (
          <button
            type="button"
            onClick={() => void ask(lead)}
            disabled={thinking}
            className="rise mb-2 flex w-full items-center gap-2.5 rounded-pill border-0 bg-accent px-4 py-2.5 text-left text-[13.5px] font-semibold leading-snug text-white transition-transform duration-100 active:scale-[0.985] disabled:opacity-55"
          >
            <span className="min-w-0 flex-1">{lead}</span>
            <ArrowIcon />
          </button>
        ) : null}

        {rest.length > 0 ? (
          <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {rest.map((q, i) => (
              <button
                key={q}
                type="button"
                onClick={() => void ask(q)}
                disabled={thinking}
                style={riseDelay(i + 1)}
                className="rise h-8 flex-none whitespace-nowrap rounded-pill border border-solid border-white/35 bg-transparent px-3 text-[12.5px] font-semibold text-white/85 transition-transform duration-100 active:scale-[0.985] disabled:opacity-55"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}

        <form onSubmit={submit} className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about your money"
            aria-label="Your question"
            maxLength={500}
            className="h-11 min-w-0 flex-1 rounded-pill border-0 bg-white/15 px-4 text-[15px] text-white placeholder:text-white/55 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={thinking || draft.trim() === ''}
            className="h-11 flex-none rounded-pill border-0 bg-accent px-4 text-[15px] font-semibold text-white transition-transform duration-100 active:scale-[0.985] disabled:opacity-55"
          >
            Ask
          </button>
        </form>

        {/* One instrument, not a raw select next to a button of the same size. The chooser sits
            in a sunk trough with the platform's arrow suppressed and ours drawn instead, and the
            action is a solid white pill inset into it — the same white-on-green weight the mute
            control uses, so the screen's one orange stays with Call and Ask. */}
        {shelf.length > 0 ? (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-pill bg-white/12 p-1">
            <span className="relative min-w-0 flex-1">
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                aria-label="Product to check"
                className="h-10 w-full min-w-0 appearance-none truncate rounded-pill border-0 bg-transparent pl-3.5 pr-8 text-[13.5px] font-semibold text-white focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {shelf.map((p) => (
                  <option key={p.productId} value={p.productId} className="text-ink">
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronIcon />
            </span>
            <button
              type="button"
              onClick={() => void check()}
              disabled={checking}
              className="h-10 flex-none whitespace-nowrap rounded-pill border-0 bg-white px-3.5 text-[13.5px] font-bold text-brand-deep transition-transform duration-100 active:scale-[0.985] disabled:opacity-55"
            >
              Check a product
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}

/**
 * One turn, in one of two shapes that are not the same shape.
 *
 * The customer's question is a bare line hung off an orange edge — no container, because it is
 * a prompt and it is already in their head. Uday's turn is the screen's one card: white with ink
 * on it, so a refusal and its evidence are read at full contrast rather than at whatever
 * white-on-green survives a phone in daylight.
 */
function Bubble({ turn }: { turn: Turn }): ReactNode {
  const [open, setOpen] = useState(false)
  const v = turn.verdict

  if (turn.who === 'you') {
    return (
      <div className="rise mb-3 flex justify-end">
        <p className="m-0 max-w-[86%] border-0 border-r-[2.5px] border-solid border-accent pr-3 text-right text-[14.5px] leading-snug text-white">
          {turn.text}
        </p>
      </div>
    )
  }

  return (
    <section className="rise mb-3 max-w-[93%] rounded-md rounded-bl-sm bg-surface px-3.5 py-3 text-ink">
      {v ? (
        <span
          className={`mb-2 inline-flex rounded-pill px-2.5 py-1 text-[11px] font-bold ${
            v.verdict === 'PASS' ? 'bg-tint-sage text-brand-deep' : 'bg-danger text-white'
          }`}
        >
          {v.verdict === 'PASS' ? 'Suitable' : `Refused · ${v.ruleId ?? 'rule'}`}
        </span>
      ) : null}
      <p className="m-0 text-[14.5px] leading-normal text-ink">{turn.text}</p>
      {v?.alternative ? (
        <p className="mb-0 mt-1.5 text-[13px] leading-normal text-ink-mid">
          Instead: <b className="font-semibold text-ink">{v.alternative.name}</b>
          {v.alternative.monthly > 0 ? ` at ${inr(v.alternative.monthly)} a month` : ''}.
        </p>
      ) : null}
      {turn.evidence && turn.evidence.length > 0 ? (
        <>
          {/* The evidence is an annotation on the answer, so it hangs off a vertical rule rather
              than sitting under a horizontal one that would read as a second section. */}
          {open ? (
            <div className="mt-2.5 border-0 border-l-[1.5px] border-solid border-hairline-mint pl-3">
              {turn.evidence.map((e) => (
                <div key={e} className="py-[3px] text-[12.5px] leading-normal text-ink-mid">
                  · {e}
                </div>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-2 border-0 bg-transparent p-0 text-[13px] font-medium text-brand underline underline-offset-2"
          >
            {open ? 'Hide the numbers' : 'Show me the numbers'}
          </button>
        </>
      ) : null}
    </section>
  )
}

/**
 * A voice meter, so the wait before the video arrives has something moving in it.
 *
 * Five bars driven off the same smoothed level as the tile's glow. Each is offset a little so
 * they do not pump in unison, which reads as a progress bar rather than a voice.
 */
function Waveform({ level }: { level: number }): ReactNode {
  const offsets = [0.55, 0.85, 1, 0.8, 0.5]
  return (
    <span aria-hidden="true" className="inline-flex h-[15px] items-center gap-[3px]">
      {offsets.map((o, i) => (
        <span
          key={i}
          className="w-[3px] rounded-pill bg-tint-sage transition-[height] duration-[110ms] ease-out"
          style={{ height: `${Math.max(3, Math.min(15, level * 22 * o + 3)).toFixed(1)}px` }}
        />
      ))}
    </span>
  )
}

/* ---------------------------------------------------------------- Bits */

/** mm:ss, for the session countdown — nobody should be cut off without warning. */
const fmt = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/* The two in-call controls: 62px discs, coloured by the caller. */
const ROUND = 'grid size-[62px] flex-none place-items-center rounded-pill border-0'

/* Inline SVG rather than emoji: 🎙 renders as a tofu box wherever the platform ships no emoji
   font, and these are the only controls on the screen. */
function MicIcon(): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EndIcon(): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* The lead suggestion is a sentence, not a label, so it gets a direction rather than sitting
   there looking like a title. */
function ArrowIcon(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="flex-none"
    >
      <path
        d="M5 12h13M13 6.5 18.5 12 13 17.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* The platform's own select arrow is a different grey on every OS and sits in a different place;
   this one is ours, and the native one is suppressed with `appearance-none`. */
function ChevronIcon(): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70"
    >
      <path
        d="M6 9.5 12 15.5 18 9.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon(): ReactNode {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
