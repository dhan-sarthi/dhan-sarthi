// Uday — the advisor you can look in the eye.
//
// This tab sits in the slot Cleo gives its assistant, and the brief requires it: the
// hackathon asks for an avatar-based product, and a live face is what Dhan Sarthi has that
// a chat bubble does not. So the call is the screen, not a card on it. You land on Uday's
// face filling the display, and text is the thing you choose.
//
// That ordering is the opposite of the safe one, and it is deliberate. When the avatar was a
// 220px tile above a chat feed, the product read as a chatbot that happened to have a picture.
// The face has to be the first thing, or there is no point paying for it.
//
// The important architectural fact is that a model writes sentences in both modes and decides
// nothing in either. `/ask` computes its figures in `core/query.ts` and its product verdicts in
// `core/suitability.ts` before a completion is asked for, and the avatar's own model reaches the
// same engine through tools. So text is not a degraded fallback that makes things up when the
// face is busy; it is the same answers, without the face — and with no key at all it is still
// the same answers, in the engine's own plainer words. Every reply carries the evidence it was
// computed from, which is why a closed set of questions is offered rather than an open box that
// invites one the engine cannot answer.
//
// Three tiers, in the order they are tried: live avatar → text → offline. This screen owns the
// middle one and reports honestly on the first — including the one case the customer must not
// be lied to about, a provider that has refused and will keep refusing.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { UDAY_PORTRAIT } from '@dhan/assets'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Thinking } from '~/ui/Thinking'
import { Reveal } from '~/ui/Reveal'
import { dur, easeOut, to, useReducedMotion } from '~/ui/motion'
import { Chip } from '~/ui/Chip'
import { Button } from '~/ui/Button'
import { Glyph } from '~/ui/Glyph'
import { ChatCanvas } from '~/ui/ChatCanvas'
import { AnswerText } from '~/ui/AnswerText'
import { Evidence } from '~/ui/Evidence'
import { Suggestion } from '~/ui/Suggestion'
import { Composer } from '~/ui/Composer'
import { api } from '~/api/client'
import { useSnapshot } from '~/state/snapshot'
import { color, space } from '@dhan/design'
import { AvatarStage } from '~/avatar/AvatarStage'
import { useAvatarCall } from '~/avatar/useAvatarCall'
import type { Answer, AskTurn, AvatarAvailability } from '@dhan/contracts'

type Turn = {
  id: string
  from: 'you' | 'uday'
  text: string
  evidence?: string[]
  matched?: boolean
}

/** Which way round the tab is. `call` is where you land. */
type Mode = 'call' | 'chat'

/**
 * How much of the exchange travels back with the next question.
 *
 * The server keeps no transcript — it holds a snapshot and a ledger, not a conversation — so
 * "and the month before that?" only resolves because the screen sends what it already shows.
 * Six is three exchanges: enough for a follow-up, short enough that the request stays small.
 */
const HISTORY_TURNS = 6

/*
 * Turn ids, from a counter rather than from the clock.
 *
 * These were `` `uday-${Date.now()}` ``, which is unique only if no two turns are ever created
 * in the same millisecond — and two of them routinely were, because one Enter on the web target
 * used to fire the composer's send twice (fixed in `Composer.tsx`). Two turns then carried the
 * identical key and React reported "Encountered two children with the same key", rendering one
 * and dropping the other. That is why the screenshot showed one question and two answers: the
 * duplicated *questions* collided and collapsed to one, while the answers landed a few
 * milliseconds apart and both survived.
 *
 * The send is latched now, so this is the second line of defence rather than the fix. It is
 * still worth having: an id that is unique by construction cannot be made non-unique by a
 * future caller that happens to append twice in a tick.
 */
let seq = 0
const turnId = (who: string): string => `${who}-${++seq}`

export default function Uday() {
  const { data: view } = useSnapshot()
  /*
   * What the customer tapped to get here.
   *
   * `spend.tsx` has always pushed `{ ask: insight.headline }` with "Talk me through this", and
   * this screen never read it — so the button was an ordinary deep link into the tab and the
   * customer landed on the generic call screen having to re-ask the question they had just
   * pressed a button about. Reading it here is what makes that button mean what it says.
   *
   * It drives both tiers: the chat opens having already asked it, and a call started from this
   * screen hands it to the brief builder so Uday's first sentence is about that finding.
   */
  const { ask: asked } = useLocalSearchParams<{ ask?: string }>()
  const topic = typeof asked === 'string' && asked.trim() ? asked.trim() : null
  const [mode, setMode] = useState<Mode>('call')
  const [turns, setTurns] = useState<Turn[]>([])
  const [questions, setQuestions] = useState<string[]>([])
  const [availability, setAvailability] = useState<AvatarAvailability | null>(null)
  const [busy, setBusy] = useState(false)
  const scroller = useRef<ScrollView>(null)
  // Where the newest answer starts. Scrolling to the end of the content puts the *last line* of
  // a long answer at the bottom of the screen, which means the customer opens on its middle;
  // this scrolls to its first word instead.
  const latestTop = useRef(0)
  // See `ask` below: the synchronous half of the one-question-at-a-time guard.
  const inFlight = useRef(false)
  const call = useAvatarCall()

  useEffect(() => {
    api
      .suggestions()
      .then(({ opening, questions: qs }) => {
        setTurns([
          {
            id: 'opening',
            from: 'uday',
            text: opening.text,
            evidence: opening.evidence,
            matched: true,
          },
        ])
        setQuestions(qs)
      })
      .catch(() =>
        setTurns([
          {
            id: 'opening',
            from: 'uday',
            text: 'I cannot reach your file right now.',
            matched: false,
          },
        ]),
      )
    api
      .avatarAvailability()
      .then(setAvailability)
      .catch(() => setAvailability(null))
  }, [view])

  const ask = useCallback(
    async (question: string) => {
      /*
       * A ref, not `busy`, because `busy` cannot guard the case this exists for.
       *
       * Two calls in the same tick both read the *pre-update* `busy` — the first has only
       * scheduled `setBusy(true)`, not applied it — so both sail past the state check and fire
       * two `/ask` requests. `busy` stays as the prop that greys out the composer and the
       * pills; the ref is what makes the guard true at the moment it is read.
       */
      if (inFlight.current) return
      inFlight.current = true
      void Haptics.selectionAsync()
      setBusy(true)
      // Taken before the question is appended, so the model is not handed the question twice.
      const history: AskTurn[] = turns.slice(-HISTORY_TURNS).map((t) => ({
        role: t.from === 'you' ? 'user' : 'assistant',
        text: t.text,
      }))
      setTurns((t) => [...t, { id: turnId('you'), from: 'you', text: question }])
      // Scroll on the way *in*, not on the way out.
      //
      // This used to happen only once the answer had landed, which meant tapping a question
      // appended your own words and the thinking dots below the fold and then showed you a
      // motionless screen for the whole round trip. The one moment the customer needs
      // acknowledging is the moment they asked.
      requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }))
      try {
        const answer: Answer = await api.ask(question, history)
        setTurns((t) => [
          ...t,
          {
            id: turnId('uday'),
            from: 'uday',
            text: answer.text,
            evidence: answer.evidence,
            matched: answer.matched,
          },
        ])
      } catch {
        setTurns((t) => [
          ...t,
          {
            id: turnId('err'),
            from: 'uday',
            text: 'I could not reach your file. Try again.',
            matched: false,
          },
        ])
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [turns, scroller],
  )

  /*
   * Arriving from a tapped insight opens the conversation on it.
   *
   * Gated on `turns.length` so the question lands *after* the opening line rather than racing
   * it, and latched on the topic itself so a re-render — or a second visit to the tab with the
   * same param still in the URL — cannot ask it twice. Chat rather than the call screen,
   * because tapping a written finding is a request to read, not to be phoned; the call is one
   * tap away in the header and carries the same topic when it is.
   */
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!topic || opened.current === topic || turns.length === 0) return
    opened.current = topic
    setMode('chat')
    void ask(topic)
  }, [topic, turns.length, ask])

  // Switching to text does not hang up. The call keeps running behind the feed and the video
  // element is handed back to the stage on the way in, because a customer who wanted to read a
  // number mid-conversation did not ask to end the conversation.
  const onCall = call.mode === 'connecting' || call.mode === 'live'
  const callable = Boolean(availability?.available) && !call.providerDown

  if (mode === 'chat') {
    return (
      <ChatMode
        turns={turns}
        questions={questions}
        busy={busy}
        onAsk={ask}
        onBack={() => setMode('call')}
        onCall={onCall}
        scroller={scroller}
        latestTop={latestTop}
      />
    )
  }

  return (
    <View className="flex-1 bg-hero">
      <StatusBar style="light" />
      <View className="absolute inset-0">
        <AvatarStage call={call} />
      </View>

      {/* `relative z-10`, and not for tidiness: the stage above is absolutely positioned, and a
          positioned element paints over a static sibling whatever the DOM order says. Without
          this the stage's bottom scrim sits on top of the controls and greys them out. */}
      <SafeAreaView edges={['top']} className="relative z-10 flex-1 justify-between">
        <View className="items-center px-pad pt-sm">
          <Type role="title" tone="onInk">
            Uday
          </Type>
          <CallStatus
            availability={availability}
            providerDown={call.providerDown}
            mode={call.mode}
            reason={call.reason}
          />
        </View>

        <Animated.View entering={FadeIn.duration(280)} className="gap-sm px-pad pb-lg">
          {onCall ? (
            <Button label="End the call" variant="light" onPress={call.hangUp} />
          ) : callable ? (
            // Offered, never dialled for you: one slot, a daily minute budget, and a
            // microphone prompt are three things a customer should tap into knowingly.
            <Button
              label={call.mode === 'ended' ? 'Call Uday again' : 'Start the call'}
              variant="light"
              onPress={() => void call.start(topic)}
            />
          ) : null}

          <Tap
            accessibilityRole="button"
            haptic="selection"
            onPress={() => setMode('chat')}
            className="h-control w-full flex-row items-center justify-center rounded-pill border border-on-ink/35"
          >
            <Type role="heading" tone="onInk">
              {callable || onCall ? 'Chat instead' : 'Continue in text'}
            </Type>
          </Tap>
        </Animated.View>
      </SafeAreaView>
    </View>
  )
}

/**
 * The text tier, in Cleo's shape rather than a chat log's.
 *
 * The first version of this was a transcript: small grey body copy, bubbles, a strip of chips
 * pinned under it. It read like a support ticket. The second overcorrected — the latest answer
 * was set at 26pt bold, which on a six-line reply about four rupee figures is not emphasis but
 * a wall, and it left the evidence and the sheet fighting over what was left.
 *
 * What the reference actually does, measured rather than remembered: the answer is **18pt
 * regular**, the same size every answer ever gets, and it wins the screen by having most of
 * the screen. The hierarchy comes from three things that are not size — a warm bloom of light
 * behind the conversation, bold runs on the figures inside the sentence, and about half the
 * display left deliberately empty. Nothing is resized when the next answer arrives; the old
 * one recedes in tone and then scrolls away.
 *
 * The depth system is the other half of it, and it is subtractive. Canvas, sheet, pill and
 * composer are four planes inside ten points of lightness, each a further wash of white over
 * the *same* bloom — no shadows anywhere, because this app has none anywhere, and no new
 * colour, because colour in this product is load-bearing and a conversation is not a claim.
 *
 * Three departures from the reference, each deliberate:
 *
 *   1. **Uday keeps his face in the header.** Cleo's chat chrome is two bare circles. Ours is
 *      the route back to a live call, and the portrait is the product — but it is 48pt now,
 *      not 66, because at 66 it was competing with the answer for the top of the screen.
 *   2. **The round button sends; it does not listen.** Cleo's is voice input. Ours is the
 *      commit, and the way back to the face is the header.
 *   3. **Evidence stays under every answer.** Cleo can be breezy because nothing it says has
 *      to be defensible. Every figure here can be pointed at — so the working is always on
 *      screen, but quietly: a hairline and a column of 13pt, not a white card with six ticks.
 */
function ChatMode({
  turns,
  questions,
  busy,
  onAsk,
  onBack,
  onCall,
  scroller,
  latestTop,
}: {
  turns: Turn[]
  questions: string[]
  busy: boolean
  onAsk: (q: string) => void
  onBack: () => void
  onCall: boolean
  scroller: React.RefObject<ScrollView | null>
  latestTop: React.RefObject<number>
}) {
  const lastUdayAt = turns.map((t) => t.from).lastIndexOf('uday')
  const lastUday = lastUdayAt === -1 ? undefined : turns[lastUdayAt]
  // What the newest answer is an answer *to*. Anchoring on the answer alone scrolled the
  // question that prompted it clean off the top of the screen, which loses the half of the
  // exchange that says what is being answered; the reference always keeps your own words
  // visible above the reply. Falls back to the answer itself for the opening line, which
  // was not asked for.
  const before = lastUdayAt > 0 ? turns[lastUdayAt - 1] : undefined
  const anchor = before?.from === 'you' ? before : lastUday

  // Cleo offers two choices. The engine can answer six, and six stacked pills is a sheet that
  // eats the answer it is meant to sit under — so three, and the chevron opens the rest.
  const [expanded, setExpanded] = useState(false)

  /*
   * The openers are an opener. Once the customer has asked anything, they go.
   *
   * They used to stay for the whole conversation, which cost about a third of the display
   * permanently — three pills and a chevron sitting under every answer, offering to start a
   * conversation that had already started. Worse, they are *generic* prompts: after a specific
   * question they read as the app ignoring what was asked.
   *
   * Keyed on whether the customer has spoken, not on a count, because the opening line is
   * itself a turn: `turns` is never empty, so `turns.length > 1` would hide them on arrival.
   */
  const started = turns.some((t) => t.from === 'you')
  const visible = started ? [] : expanded ? questions : questions.slice(0, 3)
  const hidden = questions.length - visible.length
  const [typed, setTyped] = useState('')
  const reduced = useReducedMotion()

  // Which answer the scroller has already been sent to. The anchor used to fire from an 80ms
  // timer, which raced `onLayout` and could still be holding the *previous* answer's y when it
  // went off; driving it from the layout callback itself means the number is always the one
  // that was just measured.
  const anchored = useRef<string | null>(null)

  const ask = (q: string): void => {
    // A sheet opened to show all six questions is two thirds of the display, and leaving it
    // open over the answer you just asked for is showing you the menu instead of the food.
    setExpanded(false)
    onAsk(q)
  }

  const send = (): void => {
    const q = typed.trim()
    if (!q || busy) return
    setTyped('')
    ask(q)
  }

  return (
    <View className="flex-1">
      {/* The lit ground, behind everything and moving with nothing. */}
      <ChatCanvas />

      <StatusBar style="dark" />

      {/* No `bg-` on the SafeAreaView: the canvas is what shows through. */}
      <SafeAreaView edges={['top']} className="flex-1">
        {/* The way back to the face. It says "live" when a call is still running behind this,
            because leaving a call up unknowingly is leaving money running. */}
        <Tap
          accessibilityRole="button"
          // Without this VoiceOver reads the concatenated children — "Uday, Tap for face to
          // face, button" — with the word "Tap" as literal content.
          accessibilityLabel={
            onCall ? 'On a call with Uday. Tap to go back.' : 'Uday. Tap to go face to face.'
          }
          onPress={onBack}
          scale={0.985}
          className="flex-row items-center gap-md px-pad pb-md pt-xs"
        >
          {/* 48pt. It was 66 — half again the 44 it started at — and at 66 the header was
              ~86pt of a 852pt screen spent on a picture, a name and a caption, on a screen
              whose entire content is one answer. The tab bar keeps his plate permanently
              filled, so he is already asserted; this only has to be the door back. */}
          <Image
            source={UDAY_PORTRAIT}
            className="h-12 w-12 rounded-pill"
            contentFit="cover"
            accessible={false}
          />
          <View className="flex-1">
            <Type role="heading">Uday</Type>
            <Type role="caption" tone="mid">
              {onCall ? 'On a call — tap to go back' : 'Tap for face to face'}
            </Type>
          </View>
          {onCall && <Chip tone="success">Live</Chip>}
        </Tap>

        {/* The scroll area and the wash that ends it. Without it the sheet guillotines
            whatever line happens to be at the boundary, mid-word, which reads as a rendering
            fault rather than as something you can scroll. It fades to the same white wash the
            sheet is made of, so the two meet as one value instead of as a two-tone step. */}
        <View className="flex-1">
          <ScrollView
            ref={scroller}
            className="flex-1"
            contentContainerClassName="px-pad pb-xxl pt-sm gap-xl"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {turns.map((turn) => (
              <TurnView
                key={turn.id}
                turn={turn}
                latest={turn === lastUday}
                reduced={reduced}
                onMeasure={(y) => {
                  if (turn === lastUday) latestTop.current = y
                  // Put the top of the exchange at the top of the screen — the question, then
                  // the answer under it. Scrolling to the end of the content instead would
                  // land the *last* line of a long answer at the bottom of the display, which
                  // opens the customer halfway through it.
                  //
                  // Keyed on the answer's id rather than the anchor's, so this fires once per
                  // reply and not again every time the row is re-measured.
                  if (turn === anchor && lastUday && anchored.current !== lastUday.id) {
                    anchored.current = lastUday.id
                    scroller.current?.scrollTo({ y: Math.max(0, y - space.md), animated: true })
                  }
                }}
              />
            ))}

            {/* The same three dots as the splash. Uday is composing a reply, which is the one
                thing this app has a gesture for; a greyed-out word would be a second
                vocabulary for the same event. */}
            {busy && <Thinking className="py-xs" />}
          </ScrollView>

          <LinearGradient
            colors={[color.canvasFadeIn, color.canvasFadeOut]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 }}
            pointerEvents="none"
          />
        </View>

        {/* The keyboard was not handled anywhere in this app, and the composer is where that
            bites: ~336pt of keyboard covers the field, all three questions and the bottom of
            the answer, so you cannot see what you are typing. Only the sheet lifts — the
            transcript stays where it is and simply has less room. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* The sheet: a wash of white over the bloom rather than an opaque panel. Opaque
              white cut the canvas in half exactly where the eye spends the most time; a wash
              lets the light carry through it, which is what makes it read as a pane lifted off
              a lit surface instead of a second screen stapled to the first. 20pt corners, and
              a hairline at 7% rather than 12% — against a wash, 12% draws a line where what is
              wanted is an edge. */}
          <View className="rounded-t-lg border-t border-hairline bg-sheet-wash px-pad pb-sm pt-sm">
            {/* The handle states the direction of travel: it points down at what is hidden and
                turns to point up once it is shown. It used to be a 4pt bar at 2.22:1 that
                rendered identically when it was disabled — an affordance that was inert and
                indistinguishable from the live one. Now it is simply absent when there is
                nothing to disclose. */}
            {!started && questions.length > 3 && (
              <Tap
                accessibilityRole="button"
                accessibilityLabel={
                  expanded ? 'Show fewer questions' : `Show ${hidden} more questions`
                }
                accessibilityState={{ expanded }}
                haptic="selection"
                onPress={() => setExpanded((e) => !e)}
                dim
                className="items-center gap-xs pb-sm"
              >
                <Chevron up={expanded} reduced={reduced} />
                <Type role="caption" tone="mid">
                  {expanded
                    ? 'Fewer questions'
                    : `${hidden} more question${hidden === 1 ? '' : 's'}`}
                </Type>
              </Tap>
            )}

            {/* Flushed right, which is the whole reason these read as things *you* are about
                to say: the right edge is the only aligned edge on the screen, and it is the
                same edge your own messages sit on. Left-aligned they were a settings list.
                Wrapped rather than scrolled horizontally — a question half off the edge of the
                screen is a question nobody reads. */}
            {visible.length > 0 && (
              <Animated.View
                layout={reduced ? undefined : LinearTransition.duration(dur.move).easing(easeOut)}
                className="flex-row flex-wrap justify-end gap-sm"
              >
                {visible.map((q, i) => (
                  <Reveal key={q} i={i}>
                    <Suggestion label={q} disabled={busy} onPress={() => ask(q)} />
                  </Reveal>
                ))}
              </Animated.View>
            )}

            <View className={visible.length > 0 ? 'mt-md' : undefined}>
              <Composer value={typed} onChangeText={setTyped} onSend={send} busy={busy} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

/**
 * One exchange.
 *
 * The asymmetry is the hierarchy and it is deliberate: your words get a container, his do not.
 * A bubble around the answer would turn the bloom back into wallpaper — the canvas *is* Uday's
 * voice, so his sentences sit directly on it.
 *
 * The one thing that must not happen here is the old demotion, where an answer dropped from
 * 26pt bold ink to 15pt regular mid the instant the next one arrived. Three variables changing
 * at once made the same sentence a visually different species of object, which broke the
 * transcript's reading as one conversation. Now only the tone moves.
 */
function TurnView({
  turn,
  latest,
  reduced,
  onMeasure,
}: {
  turn: Turn
  latest: boolean
  reduced: boolean
  onMeasure?: (y: number) => void
}) {
  // The one event this screen exists for gets its own entrance — no stagger, no delay, because
  // it is not an item in a list, it is the thing the customer has been waiting for. Reduce
  // Motion keeps the fade and drops the travel, which is this codebase's convention
  // everywhere: someone who asked for less movement did not ask for content to teleport.
  const entering = reduced
    ? FadeIn.duration(dur.state).reduceMotion(ReduceMotion.Never)
    : FadeInDown.duration(dur.enter).easing(easeOut)

  return (
    <Animated.View
      entering={entering}
      {...(onMeasure ? { onLayout: (e) => onMeasure(e.nativeEvent.layout.y) } : {})}
    >
      {turn.from === 'you' ? (
        // Near-white and opaque, which on a screen where nothing else is opaque is what makes
        // it lift — without spending any colour on it. It used to be `bg-ink`, making the
        // customer's own question the darkest object on the display and the first place the
        // eye landed. A question is a receipt; it should be quieter than the reply.
        // `max-w-[80%]` because there was no cap at all and a 500-character question stretched
        // the full width, at which point `self-end` stopped meaning anything.
        <View
          accessibilityLabel={`You asked: ${turn.text}`}
          className="max-w-[80%] self-end rounded-chip border border-hairline-soft bg-surface-raised px-lg py-md"
        >
          <Type role="body" tone="ink">
            {turn.text}
          </Type>
        </View>
      ) : (
        <View className="gap-md" accessibilityLabel={`Uday said: ${turn.text}`}>
          <AnswerText
            text={turn.text}
            role="answer"
            tone={latest ? 'ink' : 'mid'}
            // A new answer landing is the one thing on this screen a screen-reader user must
            // be told about without having to go looking for it.
            {...(latest ? { accessibilityLiveRegion: 'polite' as const } : {})}
          />

          {/* Every answer shows what it was computed from. An advisor that states a number
              without being able to point at the transactions behind it is indistinguishable
              from one that guessed. */}
          {turn.evidence && turn.evidence.length > 0 && <Evidence lines={turn.evidence} />}

          {turn.matched === false && (
            <Chip tone="streak">I could not answer that one from your file</Chip>
          )}
        </View>
      )}
    </Animated.View>
  )
}

/** The sheet's handle, pointing at where the rest of the questions are. */
function Chevron({ up, reduced }: { up: boolean; reduced: boolean }) {
  const turn = useSharedValue(up ? 1 : 0)

  useEffect(() => {
    turn.value = reduced ? (up ? 1 : 0) : to.state(up ? 1 : 0)
  }, [up, reduced, turn])

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }))

  return (
    <Animated.View style={style}>
      <Glyph name="chevronDown" size={20} tint={color.inkSoft} />
    </Animated.View>
  )
}

/**
 * One line under his name, over the video, in the customer's terms.
 *
 * A refusal from the provider outranks whatever availability still claims: the minutes counter
 * is ours and the credits are the provider's, and only one of those two actually stops a call.
 */
function CallStatus({
  availability,
  providerDown,
  mode,
  reason,
}: {
  availability: AvatarAvailability | null
  providerDown: boolean
  mode: string
  reason: string | null
}) {
  if (mode === 'live') {
    return (
      <Chip tone="success" className="mt-sm">
        Live
      </Chip>
    )
  }
  if (mode === 'connecting') {
    return (
      <Type role="caption" tone="onInk" className="mt-xs opacity-80">
        Connecting…
      </Type>
    )
  }
  if (reason) {
    return (
      <Type role="caption" tone="onInk" className="mt-sm px-lg text-center opacity-80">
        {reason}
      </Type>
    )
  }
  if (providerDown) {
    return (
      <Chip tone="ground" className="mt-sm">
        Face to face is offline — I can answer in text
      </Chip>
    )
  }
  if (!availability) {
    return (
      <Type role="caption" tone="onInk" className="mt-xs opacity-70">
        Checking whether Uday is free…
      </Type>
    )
  }
  if (!availability.enabled) {
    return (
      <Chip tone="ground" className="mt-sm">
        Text only in this build
      </Chip>
    )
  }
  // Nothing when he is free. A customer standing in front of an available advisor does not
  // need to be told he is available — the "Start the call" button under his face says it — and
  // the minutes left are our cost accounting, not their business.
  if (availability.available) return null
  return (
    <Chip tone="streak" className="mt-sm">
      {availability.queueLength > 0
        ? `${availability.queueLength} ahead of you`
        : 'With another customer'}
    </Chip>
  )
}
