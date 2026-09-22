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
// computed from, so the screen offers the questions the engine answers exactly, and after every
// answer offers the next one it can — rather than an open box that invites one it cannot.
//
// Three tiers, in the order they are tried: live avatar → text → offline. This screen owns the
// middle one and reports honestly on the first — including the one case the customer must not
// be lied to about, a provider that has refused and will keep refusing.
//
// The conversation is the customer's, and nothing the app does in the background may take it
// away. It used to be seeded by one effect keyed on the whole view, so a pull-to-refresh on
// Spend — a new view object, the same day — wiped the transcript back to the opening line. The
// work is split by what actually changes it now: the opening line follows the snapshot's date
// and is replaced where it stands; availability is re-read whenever the tab comes into focus;
// and a question handed over from anywhere else in the app (`?ask=`) is asked once, then
// cleared, so coming back to the tab never asks it twice.
import { useCallback, useEffect, useRef, useState } from 'react'
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router'
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { UDAY_PORTRAIT } from '@dhan/assets'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Thinking } from '~/ui/Thinking'
import { Reveal } from '~/ui/Reveal'
import { dur, easeOut, layoutMove, useReducedMotion } from '~/ui/motion'
import { Chip } from '~/ui/Chip'
import { Button } from '~/ui/Button'
import { Glyph } from '~/ui/Glyph'
import { ChatCanvas } from '~/ui/ChatCanvas'
import { AnswerText } from '~/ui/AnswerText'
import { Evidence } from '~/ui/Evidence'
import { Bubble, Suggestion } from '~/ui/Suggestion'
import { Composer } from '~/ui/Composer'
import { api } from '~/api/client'
import { useSnapshot } from '~/state/snapshot'
import { payoffSummary } from '@dhan/core'
import { color, control, space } from '@dhan/design'
import { AvatarStage } from '~/avatar/AvatarStage'
import { useAvatarCall, type CallMode } from '~/avatar/useAvatarCall'
import type { Answer, AskTurn, AvatarAvailability } from '@dhan/contracts'

type Turn = {
  id: string
  from: 'you' | 'uday'
  text: string
  evidence?: string[]
  matched?: boolean
  /** What the engine took the question to mean — the category and the dates it summed. */
  scope?: Answer['resolved']
  /** Its follow-ups have been used: one was asked, or the screen one pointed at was opened. */
  resolved?: boolean
  /** A sentence standing in for one that could not be fetched, and what retrying it re-does. */
  error?: 'opening' | 'ask'
}

/** Which way round the tab is. `call` is where you land. */
type Mode = 'call' | 'chat'

/** A choice on the chat sheet: the words on it, the words VoiceOver says, what it does. */
type Pill = { key: string; label: string; spoken?: string; onPress: () => void }

/** The sparkle's word on the tray, and the turn it was said about. */
type Toggle = { at: string; open: boolean }

/**
 * Below this height the sheet's pills go in one row that scrolls sideways. Wrapped, two
 * follow-ups took a row each, and at 320×568 the sheet was 40% of the screen and cut the answer
 * off after two lines.
 */
const COMPACT_HEIGHT = 700

/**
 * How much of the exchange travels back with the next question.
 *
 * The server keeps no transcript — it holds a snapshot and a ledger, not a conversation — so
 * a follow-up only resolves because the screen sends what it already shows. Six is three
 * exchanges: enough for a follow-up, short enough that the request stays small.
 */
const HISTORY_TURNS = 6

/** The one sentence for a file the app could not reach, whichever read it was. */
export const FILE_UNREACHABLE = "I couldn't reach your file. Try again in a moment."

/** The opening turn's id. It is replaced where it stands, never appended. */
const OPENING = 'opening'

/**
 * The openers as they sit on a pill.
 *
 * The engine offers whole questions, and a whole question on a pill wraps to two lines at
 * 375pt — three of them were a third of the screen. Cleo's replies are a few words each. The
 * pill carries the short form and VoiceOver hears the question in full; a question this map has
 * never seen shows as it is, so a new opener on the server is never hidden.
 */
const OPENER_LABEL: Record<string, string> = {
  'What did I spend on food last month?': 'Food last month',
  'What do my subscriptions cost me?': 'My subscriptions',
  'Should I invest or clear my debt first?': 'Invest or clear debt?',
  'My cousin says I should take a LIC savings plan': "My cousin's LIC plan",
  'What can I spend today?': 'Safe to spend today',
  'Why are you telling me this?': 'Why tell me this?',
  'Can I afford a ₹5,000 purchase?': 'Can I afford ₹5,000?',
  'How is my emergency fund?': 'My safety net',
  'What should I do first?': 'What comes first?',
}

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

/** The opening goes first: in its old place when it has one, at the top when it arrives late. */
function placeOpening(turns: Turn[], opening: Turn): Turn[] {
  const at = turns.findIndex((t) => t.id === OPENING)
  return at === -1 ? [opening, ...turns] : turns.map((t, i) => (i === at ? opening : t))
}

/**
 * The exchange as the model should see it: no error sentences, and no question that only ever
 * got one — a retried question would otherwise travel twice.
 */
function historyOf(turns: Turn[]): AskTurn[] {
  return turns
    .filter((t, i) => t.error === undefined && !(t.from === 'you' && turns[i + 1]?.error))
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.from === 'you' ? 'user' : 'assistant', text: t.text }))
}

/**
 * The opener without its vocative. The engine opens "Karan, ₹1,92,000 comes in…", and under
 * "Hello Karan" that is the name twice in two lines.
 */
function withoutName(text: string, first: string | null): string {
  if (!first || !text.startsWith(`${first}, `)) return text
  const rest = text.slice(first.length + 2)
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/** Months between two ISO dates, counted by calendar month. */
function monthsBetween(from: string, to: string): number {
  const [fy = 0, fm = 0] = from.split('-').map(Number)
  const [ty = 0, tm = 0] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** Every period the engine reads out of a question (`core/query.ts` resolveWindow). */
const PERIOD =
  /\b(?:last|previous) month\b|\bthis month(?: so far)?\b|\bso far\b|\bthis year\b|\b(?:over )?(?:the )?last 12 months\b|\blast (?:week|7 days)\b/i

/**
 * The same question over a different stretch of time — the one follow-up the engine can
 * always answer from the file.
 *
 * The plan asked for "And the month before?", and the engine cannot answer it: it reads "last
 * month", "this month", "last week" and "the last 12 months", and nothing else, so that pill
 * came back "I do not have the month before" every time. A pill that always fails is a dead
 * button. So the follow-up swaps the period inside the customer's own question — their words
 * are what the engine resolved the category from the first time, so it resolves it again.
 */
function widened(
  question: string,
  scope: Answer['resolved'],
): { label: string; question: string } | null {
  if (!scope?.from || !scope.to) return null
  const year = monthsBetween(scope.from, scope.to) >= 12
  const period = year ? 'last month' : 'over the last 12 months'
  const bare = question.trim().replace(/[?.!\s]+$/, '')
  const next = PERIOD.test(bare) ? bare.replace(PERIOD, period) : `${bare} ${period}`
  return { label: year ? 'And last month?' : 'And the last 12 months?', question: `${next}?` }
}

/**
 * A question about what the customer owes: the engine's own debt words (`core/query.ts`), plus
 * "borrow" and "repayment", which a customer typing uses for the same thing. Asked about a debt
 * the plan is paying off, the next step is the payoff itself, so the sheet offers it.
 */
const DEBT_WORDS =
  /\b(?:debts?|loans?|emis?|credit cards?|cards?|interest|owe|owed|owing|borrow(?:ing|ed)?|repay(?:ment|ments)?)\b/i

export default function Uday() {
  const { data: view, asOf } = useSnapshot()
  /*
   * What the customer tapped to get here.
   *
   * Every "Ask Uday about this" in the app navigates here with `{ ask }`. Onboarding's hand-off
   * does not: since 22 Sep 2026 "Meet Uday" lands on the call screen with nothing asked, the
   * owner's call. It drives both tiers: the chat opens having asked it, and a call started
   * afterwards hands the last question to the brief builder so Uday's first sentence is about it.
   */
  const { ask: asked } = useLocalSearchParams<{ ask?: string }>()
  const navigation = useNavigation<{
    setParams: (params: Record<string, string | undefined>) => void
  }>()
  const topic = typeof asked === 'string' && asked.trim() ? asked.trim() : null
  const [mode, setMode] = useState<Mode>('call')
  const [turns, setTurns] = useState<Turn[]>([])
  const [questions, setQuestions] = useState<string[]>([])
  const [availability, setAvailability] = useState<AvatarAvailability | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  // The first opening read has come back, one way or the other. A handed-over question waits
  // for it, so "Hello Karan" is always above the question rather than arriving on top of it.
  const [settled, setSettled] = useState(false)
  const [busy, setBusy] = useState(false)
  /*
   * The chat's own state, held here rather than in `ChatMode`, because going face to face
   * unmounts the chat and used to take a half-typed question and the sparkle's word with it.
   * `seen` is every turn already on screen when the customer left, so coming back shows them
   * where they were instead of animating each one in a second time.
   */
  const [typed, setTyped] = useState('')
  const [toggled, setToggled] = useState<Toggle | null>(null)
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set())
  const scroller = useRef<ScrollView>(null)
  // See `ask` below: the synchronous half of the one-question-at-a-time guard.
  const inFlight = useRef(false)
  // The question behind the latest answer, for retrying it and for the call's opening topic.
  const lastAsked = useRef<string | null>(null)
  // `ask` builds its history from this rather than from `turns`, so it does not become a new
  // function on every turn and re-run everything that depends on it.
  const turnsNow = useRef<Turn[]>(turns)
  const reduced = useReducedMotion()
  const call = useAvatarCall()
  const { height } = useWindowDimensions()

  useEffect(() => {
    turnsNow.current = turns
  }, [turns])

  /*
   * Availability, every time the tab comes into view.
   *
   * It was read once, with the opening, and then never again — so a queue that cleared, or a
   * day's minutes that ran out, stayed wrong for as long as the tab stayed mounted, which in a
   * tab navigator is the whole session.
   */
  useFocusEffect(
    useCallback(() => {
      let live = true
      api
        .avatarAvailability()
        .then((next) => {
          if (!live) return
          setAvailability(next)
          setUnreachable(false)
        })
        .catch(() => {
          if (!live) return
          setAvailability(null)
          setUnreachable(true)
        })
      return () => {
        live = false
      }
    }, []),
  )

  /*
   * The opening line, keyed on the snapshot's date and on nothing else.
   *
   * The sequence number is what lets a slow read lose to a fast one: only the latest request
   * may write. A success replaces the opening where it stands; a failure only fills an empty
   * chat, because a conversation already on screen is worth more than a fresh first line.
   */
  const openSeq = useRef(0)
  const loadOpening = useCallback(() => {
    const mine = ++openSeq.current
    api
      .suggestions()
      .then(({ opening, questions: qs }) => {
        if (mine !== openSeq.current) return
        setQuestions(qs)
        setTurns((t) =>
          placeOpening(t, {
            id: OPENING,
            from: 'uday',
            text: opening.text,
            evidence: opening.evidence,
            matched: true,
          }),
        )
      })
      .catch(() => {
        if (mine !== openSeq.current) return
        setTurns((t) =>
          t.length === 0
            ? [{ id: OPENING, from: 'uday', text: FILE_UNREACHABLE, error: 'opening' }]
            : t,
        )
      })
      .finally(() => {
        if (mine === openSeq.current) setSettled(true)
      })
  }, [])

  useEffect(() => {
    loadOpening()
  }, [asOf, loadOpening])

  const ask = useCallback(
    async (raw: string) => {
      /*
       * A ref, not `busy`, because `busy` cannot guard the case this exists for.
       *
       * Two calls in the same tick both read the *pre-update* `busy` — the first has only
       * scheduled `setBusy(true)`, not applied it — so both sail past the state check and fire
       * two `/ask` requests. `busy` stays as the prop that greys out the composer and the
       * pills; the ref is what makes the guard true at the moment it is read.
       */
      const question = raw.trim().slice(0, 500)
      if (inFlight.current || !question) return
      inFlight.current = true
      lastAsked.current = question
      setBusy(true)
      // An opening that failed stays at the top of the chat, and its own "Try again" goes the
      // moment anything is asked under it. Every question is a chance to replace it: the read
      // goes out beside this one, and a success swaps it in where it stands.
      if (turnsNow.current[0]?.error === 'opening') loadOpening()
      // Taken before the question is appended, so the model is not handed the question twice.
      const history = historyOf(turnsNow.current)
      setTurns((t) => [...t, { id: turnId('you'), from: 'you', text: question }])
      // Scroll on the way *in*, not on the way out: the one moment the customer needs
      // acknowledging is the moment they asked, so their words and the dots come into view
      // before the round trip, not after it.
      requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: !reduced }))
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
            ...(answer.resolved === undefined ? {} : { scope: answer.resolved }),
          },
        ])
        // iOS only: Android and the web hear the answer through its live region, and saying
        // it twice is worse than saying it once.
        if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(answer.text)
      } catch {
        setTurns((t) => [
          ...t,
          { id: turnId('err'), from: 'uday', text: FILE_UNREACHABLE, error: 'ask' },
        ])
        if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(FILE_UNREACHABLE)
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [reduced, loadOpening],
  )

  /*
   * A question handed over from elsewhere opens the conversation on it.
   *
   * Asked once per new value, then cleared from the route, so coming back to the tab does not
   * ask it again. The latch resets when the param goes away, which is what lets the same
   * question be handed over a second time (the same "Ask Uday about this" tapped twice), where
   * the old latch held the first value forever and ignored it.
   * Chat rather than the call screen, because tapping a written finding is a request to read,
   * not to be phoned; the call is one tap away in the header.
   */
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (topic === null) {
      opened.current = null
      return
    }
    if (!settled || busy || opened.current === topic) return
    opened.current = topic
    setMode('chat')
    void ask(topic)
    navigation.setParams({ ask: undefined })
  }, [topic, settled, busy, ask, navigation])

  const retryOpening = (): void => {
    setTurns((t) => t.filter((x) => x.id !== OPENING))
    loadOpening()
  }

  const retryAsk = (): void => {
    const question = lastAsked.current
    if (!question) return
    // Drop the failed pair, then ask again: the question reappears with its answer under it,
    // rather than twice with an apology between.
    setTurns((t) => {
      const last = t[t.length - 1]
      const before = t[t.length - 2]
      if (last?.error !== 'ask') return t
      return t.slice(0, before?.from === 'you' ? -2 : -1)
    })
    void ask(question)
  }

  const resolve = (id: string): void =>
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, resolved: true } : x)))

  // Switching to text does not hang up. The call keeps running behind the feed and the video
  // element is handed back to the stage on the way in, because a customer who wanted to read a
  // number mid-conversation did not ask to end the conversation.
  const onCall = call.mode === 'connecting' || call.mode === 'live'
  const callable = Boolean(availability?.available) && !call.providerDown

  // Leaving the chat for the call: what is on screen now is remembered as read.
  const toCall = (): void => {
    setSeen(new Set(turnsNow.current.map((t) => t.id)))
    setMode('call')
  }

  if (mode === 'chat') {
    const firstName = view?.snapshot.customer.name.trim().split(/\s+/)[0] ?? null
    const latest = turns[turns.length - 1]
    const started = turns.some((t) => t.from === 'you')
    const compact = height < COMPACT_HEIGHT
    const room = compact ? 2 : 3
    const said = new Set(turns.filter((t) => t.from === 'you').map((t) => t.text))
    const opener = (q: string): Pill => ({
      key: q,
      label: OPENER_LABEL[q] ?? q,
      spoken: q,
      onPress: () => void ask(q),
    })
    const unasked = questions.filter((q) => !said.has(q))
    const openers = (unasked.length > 0 ? unasked : questions).slice(0, room).map(opener)

    /*
     * What the sheet offers, in Cleo's shape: the pills are replies to the latest turn, not a
     * menu. A failure offers the retry; an answer the engine could not give offers what it can;
     * an answer with a category and a period offers the next question about it, and one about
     * a debt the plan is paying off offers the payoff; any other answer, a follow-up already
     * used, and a fresh chat offer the openers not yet asked, so the sheet never ends at the
     * composer alone.
     */
    let tray: { title?: string; pills: Pill[] } = { pills: [] }
    if (latest?.error) {
      tray = {
        pills: [
          {
            key: 'retry',
            label: 'Try again',
            onPress: latest.error === 'opening' ? retryOpening : retryAsk,
          },
        ],
      }
    } else if (latest?.from === 'uday' && latest.matched === false) {
      tray = {
        title: 'Try one of these',
        pills: [
          ...openers,
          ...(callable ? [{ key: 'face', label: 'Ask Uday face to face', onPress: toCall }] : []),
        ],
      }
    } else if (latest?.from === 'uday' && latest.id !== OPENING) {
      const prev = turns[turns.length - 2]
      const question = prev?.from === 'you' ? prev.text : null
      const category = latest.scope?.category
      // A limit only means something on money the customer chooses to spend, and the
      // snapshot's discretionary list is the engine's own word on which that is: food and
      // shopping, never an EMI. It is also the list the limit screen offers rows for.
      const cappable =
        category !== undefined &&
        (view?.snapshot.discretionary.byCategory ?? []).some(([c]) => c === category)
      const wider = question === null ? null : widened(question, latest.scope)
      // Plan opens its payoff numbers only where the plan's payment clears the debt stage
      // (plan.tsx `NumbersPane`), so the pill is offered on exactly that condition and never
      // lands on some other pane.
      const rate = view?.snapshot.debt.highestRate ?? 0
      const debtStage = view?.roadmap.stages.find(
        (s) => s.kind === 'clear_debt' && s.targetAmount > 0,
      )
      const payoff =
        question !== null &&
        DEBT_WORDS.test(question) &&
        debtStage !== undefined &&
        rate > 0 &&
        payoffSummary(debtStage.targetAmount, rate, debtStage.monthly) !== null
      const next: Pill[] = latest.resolved
        ? []
        : [
            ...(cappable
              ? [
                  {
                    key: 'limit',
                    label: `Set a limit for ${category}`,
                    onPress: () => {
                      resolve(latest.id)
                      router.push({ pathname: '/set-limit', params: { category } })
                    },
                  },
                ]
              : []),
            ...(payoff
              ? [
                  {
                    key: 'payoff',
                    label: 'See your path to zero',
                    onPress: () => {
                      resolve(latest.id)
                      router.navigate({
                        pathname: '/(tabs)/plan',
                        params: { pane: 'projection', stage: 'clear_debt' },
                      })
                    },
                  },
                ]
              : []),
            ...(wider === null
              ? []
              : [
                  {
                    key: 'wider',
                    label: wider.label,
                    spoken: wider.question,
                    onPress: () => {
                      resolve(latest.id)
                      void ask(wider.question)
                    },
                  },
                ]),
          ]
      tray = { pills: next.length > 0 ? next : openers }
    } else if (!started) {
      tray = { pills: openers }
    }

    return (
      <ChatMode
        turns={turns}
        tray={tray}
        openers={openers}
        busy={busy}
        onAsk={ask}
        typed={typed}
        onType={setTyped}
        toggled={toggled}
        onToggle={setToggled}
        seen={seen}
        onBack={toCall}
        onCall={onCall}
        callable={callable}
        compact={compact}
        scroller={scroller}
        firstName={firstName}
        asOf={asOf}
        reduced={reduced}
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
        <View className="px-pad pt-sm">
          <View className="flex-row items-center justify-between">
            {/* The plate's width again on the left, so the name stays centred on the screen. */}
            <View className="w-plate-lg" />
            <Type role="title" tone="onInk">
              Uday
            </Type>
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => router.push('/profile')}
              scale={0.92}
              hitSlop={4}
              className="h-plate-lg w-plate-lg items-center justify-center rounded-pill bg-on-ink/15"
            >
              <Glyph name="person" size={22} tint={color.onInk} />
            </Tap>
          </View>
          <CallBadge mode={call.mode} />
        </View>

        <Animated.View entering={FadeIn.duration(dur.enter)} className="gap-md px-pad pb-lg">
          <CallLine
            availability={availability}
            unreachable={unreachable}
            onCall={onCall}
            reason={call.reason}
          />
          {onCall ? (
            <Button label="End the call" variant="light" onPress={call.hangUp} />
          ) : callable ? (
            // Offered, never dialled for you: one slot, a daily minute budget, and a
            // microphone prompt are three things a customer should tap into knowingly.
            <View className="gap-sm">
              <Button
                label={call.mode === 'ended' ? 'Call Uday again' : 'Start a call'}
                variant="light"
                haptic="selection"
                onPress={() => void call.start(lastAsked.current ?? topic)}
              />
              <Type role="caption" tone="onInk" className="text-center">
                {`${Math.floor(availability?.minutesLeftToday ?? 0)} min left today`}
              </Type>
            </View>
          ) : null}

          {/* One button on a call, as on any video call: the owner's call, 22 September 2026.
              Ending it brings this screen back, with text one tap away again. */}
          {!onCall && (
            <Button
              label="Chat in text"
              variant="outlineLight"
              haptic="selection"
              onPress={() => setMode('chat')}
            />
          )}
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
 * The sheet's pills are replies to the latest turn, the way Cleo's are, and the sparkle to the
 * left of the field (Cleo's bolt) shows and hides them. It replaced a chevron handle that
 * opened a list of six: a menu that grew over the answer it was meant to sit under.
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
  tray,
  openers,
  busy,
  onAsk,
  typed,
  onType,
  toggled,
  onToggle,
  seen,
  onBack,
  onCall,
  callable,
  compact,
  scroller,
  firstName,
  asOf,
  reduced,
}: {
  turns: Turn[]
  tray: { title?: string; pills: Pill[] }
  /** What the sparkle shows when the latest turn has no replies of its own. */
  openers: Pill[]
  busy: boolean
  onAsk: (q: string) => void
  /** The field's words, kept by the screen so a trip to the call does not clear them. */
  typed: string
  onType: (text: string) => void
  toggled: Toggle | null
  onToggle: (next: Toggle) => void
  /** Turns already shown before the customer went to the call: drawn, not animated in. */
  seen: ReadonlySet<string>
  onBack: () => void
  onCall: boolean
  /** A call can be started from the call screen, so the header is a door to it. */
  callable: boolean
  /** A short screen: the pills go in one sideways row and the fade is shallower. */
  compact: boolean
  scroller: React.RefObject<ScrollView | null>
  firstName: string | null
  asOf: string | null
  reduced: boolean
}) {
  // The sparkle's word on the tray, for the latest turn only: a new turn brings its own replies
  // back without the customer having to ask for them.
  const latestKey = turns[turns.length - 1]?.id ?? 'none'
  const contextual = tray.pills.length > 0
  const open = toggled?.at === latestKey ? toggled.open : contextual
  const pills = open ? (contextual ? tray.pills : openers) : []
  const title = contextual ? tray.title : undefined
  const canToggle = contextual || openers.length > 0

  // Where each turn starts, and which answer the scroller has already been sent to. When an
  // answer lands, the question it answers goes to the top of the screen, so a long reply opens
  // at its first word with the question still above it — scrolling to the end instead opened
  // the customer halfway down the answer.
  const tops = useRef(new Map<string, number>())
  const anchored = useRef<string | null>(null)
  const lastUdayAt = turns.map((t) => t.from).lastIndexOf('uday')
  const lastUday = lastUdayAt === -1 ? undefined : turns[lastUdayAt]
  const anchor =
    lastUdayAt > 0 && turns[lastUdayAt - 1]?.from === 'you' ? turns[lastUdayAt - 1] : undefined

  // The wash at the foot of the transcript. Its height follows the transcript's, so a short one
  // on a small phone is not half fog — and on a short screen it is half the usual depth, because
  // there the line it washes out is one of the three or four lines of answer on show.
  const [paneHeight, setPaneHeight] = useState(0)
  const fade = Math.min(compact ? control.chatFade / 2 : control.chatFade, paneHeight * 0.25)

  // The header goes back to the call only when there is a call to go back to, or one to start.
  // Otherwise the call screen would only say that face to face is not on offer, so the header
  // is a name, not a button.
  const door = onCall || callable

  const send = (): void => {
    const q = typed.trim()
    if (!q || busy) return
    onType('')
    onAsk(q)
  }

  const pillViews = pills.map((p, i) => (
    <Reveal key={`${latestKey}:${p.key}`} i={i}>
      <Suggestion
        label={p.label}
        {...(p.spoken === undefined ? {} : { accessibilityLabel: p.spoken })}
        disabled={busy}
        onPress={p.onPress}
      />
    </Reveal>
  ))

  const identity = (
    <>
      {/* 48pt. It was 66 — half again the 44 it started at — and at 66 the header was
          ~86pt of a 852pt screen spent on a picture, a name and a caption, on a screen
          whose entire content is one answer. The tab bar keeps his plate permanently
          filled, so he is already asserted; this only has to be the door back. */}
      <Image
        source={UDAY_PORTRAIT}
        className="h-plate-xl w-plate-xl rounded-pill"
        contentFit="cover"
        accessible={false}
        accessibilityIgnoresInvertColors
      />
      <View className="flex-1">
        {/* The screen's heading when the header is only a name; inside the door, the button's
            label speaks for it. */}
        <Type role="heading" plain={door}>
          Uday
        </Type>
        {door ? (
          <Type role="caption" tone="mid">
            {onCall ? 'On a call — tap to go back' : 'Tap to go face to face'}
          </Type>
        ) : null}
      </View>
      {onCall && <Chip tone="success">Live</Chip>}
    </>
  )

  return (
    <View className="flex-1">
      {/* The lit ground, behind everything and moving with nothing. */}
      <ChatCanvas />

      <StatusBar style="dark" />

      {/* No `bg-` on the SafeAreaView: the canvas is what shows through. */}
      <SafeAreaView edges={['top']} className="flex-1">
        {/* The way back to the face. It says "live" when a call is still running behind this,
            because leaving a call up unknowingly is leaving money running. */}
        {door ? (
          <Tap
            accessibilityRole="button"
            // Without this VoiceOver reads the concatenated children — "Uday, Tap to go face to
            // face, button" — with the word "Tap" as literal content.
            accessibilityLabel={
              onCall ? 'On a call with Uday. Go back to the call.' : 'Uday. Go face to face.'
            }
            onPress={onBack}
            scale={0.985}
            className="flex-row items-center gap-md px-pad pb-md pt-xs"
          >
            {identity}
          </Tap>
        ) : (
          <View className="flex-row items-center gap-md px-pad pb-md pt-xs">{identity}</View>
        )}

        {/* The scroll area and the wash that ends it. Without it the sheet guillotines
            whatever line happens to be at the boundary, mid-word, which reads as a rendering
            fault rather than as something you can scroll. It fades to the same white wash the
            sheet is made of, so the two meet as one value instead of as a two-tone step. */}
        <View className="flex-1" onLayout={(e) => setPaneHeight(e.nativeEvent.layout.height)}>
          <ScrollView
            ref={scroller}
            className="flex-1"
            contentContainerClassName="px-pad pb-xxl pt-sm gap-xl"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {turns.length === 0 ? (
              // The opening is on its way. The same three dots as the splash: Uday is about to
              // speak, which is the one thing this app has a gesture for.
              <Thinking className="py-xs" accessibilityLabel="Reading your file" />
            ) : null}

            {turns.map((turn) => (
              <TurnView
                key={turn.id}
                turn={turn}
                latest={turn === lastUday}
                greeting={turn.id === OPENING ? firstName : null}
                asOf={asOf}
                reduced={reduced}
                fresh={!seen.has(turn.id)}
                onMeasure={(y) => {
                  tops.current.set(turn.id, y)
                  if (turn !== lastUday || anchor === undefined) return
                  if (anchored.current === turn.id) return
                  anchored.current = turn.id
                  const top = tops.current.get(anchor.id) ?? y
                  // Back from the call, the latest exchange is where the customer left it:
                  // put there at once, not scrolled to from the top.
                  scroller.current?.scrollTo({
                    y: Math.max(0, top - space.md),
                    animated: !reduced && !seen.has(turn.id),
                  })
                }}
              />
            ))}

            {busy && <Thinking className="py-xs" />}
          </ScrollView>

          <LinearGradient
            colors={[color.canvasFadeIn, color.canvasFadeOut]}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: fade,
              pointerEvents: 'none',
            }}
          />
        </View>

        {/* Only the sheet lifts for the keyboard — the transcript stays where it is and simply
            has less room. iOS pads; Android, whose window already resizes, takes the height. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* The sheet: a wash of white over the bloom rather than an opaque panel. Opaque
              white cut the canvas in half exactly where the eye spends the most time; a wash
              lets the light carry through it, which is what makes it read as a pane lifted off
              a lit surface instead of a second screen stapled to the first. 28pt corners, the
              reference's, and a hairline at 7% rather than 12% — against a wash, 12% draws a
              line where what is wanted is an edge. */}
          <View className="rounded-t-xl border-t border-hairline bg-sheet-wash px-pad pb-sm pt-md">
            {/* Flushed right, which is the whole reason these read as things *you* are about
                to say: the right edge is the only aligned edge on the screen, and it is the
                same edge your own messages sit on. Wrapped rather than scrolled horizontally —
                a question half off the edge of the screen is a question nobody reads — except
                on a short screen, where a second row of pills costs two lines of the answer.
                There they sit in one row, still flush right while they fit, running to the
                screen's edge so the one that does not fit is visibly cut rather than hidden. */}
            {pills.length > 0 && (
              <Animated.View layout={layoutMove(reduced)} className="mb-md gap-sm">
                {title === undefined ? null : (
                  <Type role="label" tone="mid" className="text-right">
                    {title}
                  </Type>
                )}
                {compact ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    style={{ flexGrow: 0, flexShrink: 0 }}
                    className="-mx-pad"
                    contentContainerClassName="grow justify-end gap-sm px-pad"
                  >
                    {pillViews}
                  </ScrollView>
                ) : (
                  <View className="flex-row flex-wrap justify-end gap-sm">{pillViews}</View>
                )}
              </Animated.View>
            )}

            <Composer
              value={typed}
              onChangeText={onType}
              onSend={send}
              busy={busy}
              leading={
                canToggle ? (
                  // A bare mark, as Cleo's bolt is: the pills appearing above it are the state.
                  // Pulled 8pt into the gutter so the mark and the field land where the
                  // reference puts them, 36pt and 60pt in.
                  <Tap
                    accessibilityRole="button"
                    accessibilityLabel={open ? 'Hide suggestions' : 'Show suggestions'}
                    accessibilityState={{ expanded: open }}
                    // react-native-web reads the ARIA prop, not `accessibilityState`.
                    aria-expanded={open}
                    haptic="selection"
                    onPress={() => onToggle({ at: latestKey, open: !open })}
                    scale={0.92}
                    className="-ml-sm h-target w-target items-center justify-center rounded-pill"
                  >
                    <Glyph name="sparkle" size={24} tint={color.ink} />
                  </Tap>
                ) : null
              }
            />
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
  greeting,
  asOf,
  reduced,
  fresh,
  onMeasure,
}: {
  turn: Turn
  latest: boolean
  /** The customer's first name, on the opening turn only. */
  greeting: string | null
  asOf: string | null
  reduced: boolean
  /** Not on screen before: it enters. A turn the customer already read is simply there. */
  fresh: boolean
  onMeasure: (y: number) => void
}) {
  // The one event this screen exists for gets its own entrance — no stagger, no delay, because
  // it is not an item in a list, it is the thing the customer has been waiting for. Reduce
  // Motion keeps the fade and drops the travel, which is this codebase's convention
  // everywhere: someone who asked for less movement did not ask for content to teleport.
  const entering = !fresh
    ? undefined
    : reduced
      ? FadeIn.duration(dur.state).reduceMotion(ReduceMotion.Never)
      : FadeInDown.duration(dur.enter).easing(easeOut)

  return (
    <Animated.View entering={entering} onLayout={(e) => onMeasure(e.nativeEvent.layout.y)}>
      {turn.from === 'you' ? (
        // Near-white and opaque, which on a screen where nothing else is opaque is what makes
        // it lift — without spending any colour on it. It used to be `bg-ink`, making the
        // customer's own question the darkest object on the display and the first place the
        // eye landed. A question is a receipt; it should be quieter than the reply. Capped at
        // 80% of the column, because uncapped a long question stretched the full width, at
        // which point sitting on the right stopped meaning anything.
        <View
          accessible
          accessibilityLabel={`You asked: ${turn.text}`}
          style={{ maxWidth: '80%' }}
          className="self-end"
        >
          <Bubble tone="raised">
            <Type role="body" tone="ink">
              {turn.text}
            </Type>
          </Bubble>
        </View>
      ) : (
        <View className="gap-md">
          {/* Cleo opens "Hey you" at display size; the name is what we have that it does not. */}
          {greeting === null ? null : <Type role="display">{`Hello ${greeting}`}</Type>}

          <AnswerText
            text={turn.id === OPENING ? withoutName(turn.text, greeting) : turn.text}
            role="answer"
            tone={latest ? 'ink' : 'mid'}
            // A new answer landing is the one thing on this screen a screen-reader user must
            // be told about without having to go looking for it. iOS is told directly in
            // `ask`; this is the region Android and the web listen to.
            {...(latest ? { accessibilityLiveRegion: 'polite' as const } : {})}
          />

          {/* Every answer shows what it was computed from. An advisor that states a number
              without being able to point at the transactions behind it is indistinguishable
              from one that guessed. */}
          {turn.evidence && turn.evidence.length > 0 && (
            <Evidence lines={turn.evidence} asOf={asOf} />
          )}

          {/* No marker under an answer the engine could not match. It said "Not in your file",
              which is the wrong reason — the file is fine, the question is one Uday does not
              answer — under a sentence that is itself citing the file. The answer already says
              he is not sure, and the sheet's "Try one of these" says what he can answer. */}
        </View>
      )}
    </Animated.View>
  )
}

/** The line under his name while a call is starting or running. */
function CallBadge({ mode }: { mode: CallMode }) {
  if (mode === 'live') {
    return (
      <View className="mt-sm flex-row justify-center">
        <Chip tone="success">Live</Chip>
      </View>
    )
  }
  if (mode === 'connecting') {
    return (
      <Type role="caption" tone="onInk" className="mt-xs text-center">
        Connecting…
      </Type>
    )
  }
  return null
}

/**
 * Why there is, or is not, a call button — said where the button is.
 *
 * Three states the customer must be able to tell apart, because they mean different things to
 * do next: face to face is not switched on for this account at all; it is on but not free now
 * (a queue, or the day's minutes gone); or it is free, and the button says so by being there. A
 * refusal from the call itself outranks all three: the minutes counter is ours and the credits
 * are the provider's, and only one of those two actually stops a call.
 */
function CallLine({
  availability,
  unreachable,
  onCall,
  reason,
}: {
  availability: AvatarAvailability | null
  unreachable: boolean
  onCall: boolean
  reason: string | null
}) {
  const line = onCall
    ? null
    : reason !== null
      ? reason
      : unreachable
        ? 'Not available right now'
        : availability === null
          ? 'Checking whether Uday is free…'
          : !availability.enabled
            ? "Face to face isn't switched on for this account."
            : availability.available
              ? null
              : availability.queueLength > 0
                ? `${availability.queueLength} ahead of you${
                    availability.estimatedWaitSeconds === null
                      ? ''
                      : ` · about ${Math.max(1, Math.ceil(availability.estimatedWaitSeconds / 60))} min`
                  }`
                : availability.minutesLeftToday <= 0
                  ? 'No minutes left today'
                  : 'Not available right now'
  if (line === null) return null
  return (
    <Type role="body" tone="onInk" className="text-center">
      {line}
    </Type>
  )
}
