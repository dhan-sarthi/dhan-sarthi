import type { RmAnswer } from '@dhan/contracts'
import { ArrowUp, ChevronDown, RotateCw } from 'lucide-react'
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { cn } from '../../lib/cn.ts'
import { AiLabel, Button, SectionLabel, SkeletonText, describeError } from '../../ui/index.ts'
import { CitedText, SourcesList } from './Citations.tsx'
import { notesFor, numberCitations } from './cite.ts'
import { possessive } from './names.ts'
import { PulseDot } from './PulseDot.tsx'
import { useConversation, type Turn } from './session.ts'
import { draftOf, saveDraft } from './store.ts'
import { useElapsed } from './useElapsed.ts'
import { VerdictCard } from './VerdictCard.tsx'

/** The ask route's own limit, so the composer can say so before the server has to. */
const QUESTION_MAX = 500

interface AskProps {
  cif: string
  name: string
  asOf: string
  /** `Customer360.copilotPrompts`: written by the server from this customer's own record. */
  prompts: readonly string[]
}

/**
 * Ask: a conversation scoped to one customer. Each answer is footnoted like the brief, and a
 * question that names a product comes back with the rules' verdict drawn as its own card. The
 * thread is kept for the session; the composer sits at the bottom, as in every chat the RM uses.
 */
export function AskView({ cif, name, asOf, prompts }: AskProps) {
  const { turns, send, busy } = useConversation(cif)
  const thread = useRef<HTMLDivElement>(null)
  const last = useRef<HTMLLIElement>(null)

  const asked = new Set(turns.map((t) => normalise(t.question)))
  const unused = prompts.filter((p) => !asked.has(normalise(p)))

  // Bring the newest turn's question to the top of the thread when it is asked and again when
  // its answer lands, so a long answer is read from its start rather than its end.
  const signature = turns.map((t) => `${t.id}:${t.status}`).join('|')
  useEffect(() => {
    const box = thread.current
    const turn = last.current
    if (!box || !turn) return
    const top =
      turn.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 16
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
  }, [signature])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={thread} className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {turns.length === 0 ? (
          <Intro name={name} prompts={prompts} onPick={send} disabled={busy} />
        ) : (
          <>
            <ol role="log" aria-label={`Questions about ${name}`} className="grid gap-7">
              {turns.map((turn, i) => (
                <TurnView
                  key={turn.id}
                  ref={i === turns.length - 1 ? last : undefined}
                  turn={turn}
                  name={name}
                  asOf={asOf}
                  onRetry={() => send(turn.question, turn.id)}
                />
              ))}
            </ol>
            {!busy && unused.length > 0 ? (
              <div className="mt-8 grid gap-2.5">
                <SectionLabel as="h3">Ask next</SectionLabel>
                <PromptList prompts={unused.slice(0, 3)} onPick={send} disabled={busy} />
              </div>
            ) : null}
          </>
        )}
      </div>
      <Composer key={cif} cif={cif} name={name} busy={busy} onSend={send} />
    </div>
  )
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/* ---------------------------------------------------------------- Empty thread */

function Intro({
  name,
  prompts,
  onPick,
  disabled,
}: {
  name: string
  prompts: readonly string[]
  onPick: (question: string) => void
  disabled: boolean
}) {
  return (
    <div className="grid gap-7">
      <div className="grid gap-1.5">
        <h3 className="text-title text-ink">Ask about {name}</h3>
        <p className="text-label font-normal text-pretty text-ink-soft">
          Answers come only from {possessive(name)} record, and every sentence cites its source.
          Name a product and the suitability rules judge it first; the AI never does.
        </p>
      </div>
      {prompts.length > 0 ? (
        <div className="grid gap-2.5">
          <SectionLabel as="h3">Suggested</SectionLabel>
          <PromptList prompts={prompts} onPick={onPick} disabled={disabled} />
        </div>
      ) : null}
    </div>
  )
}

/** Suggested questions, after Rox: a tap asks it. The arrow says so before the RM tries. */
function PromptList({
  prompts,
  onPick,
  disabled,
}: {
  prompts: readonly string[]
  onPick: (question: string) => void
  disabled: boolean
}) {
  return (
    <ul className="grid gap-2">
      {prompts.map((prompt) => (
        <li key={prompt}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className={cn(
              'group flex w-full items-center justify-between gap-3 rounded-md bg-ground px-3 py-2.5 text-left text-label text-ink',
              'transition-colors duration-150 hover:bg-ground-deep',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <span className="min-w-0">{prompt}</span>
            <span
              aria-hidden
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-surface text-ink-soft transition-colors group-hover:text-brand"
            >
              <ArrowUp className="size-3.5" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------------- A turn */

function TurnView({
  turn,
  name,
  asOf,
  onRetry,
  ref,
}: {
  turn: Turn
  name: string
  asOf: string
  onRetry: () => void
  ref?: Ref<HTMLLIElement> | undefined
}) {
  return (
    <li ref={ref} className="grid gap-3.5">
      <p className="max-w-[85%] justify-self-end rounded-lg rounded-br-xs bg-ground px-3.5 py-2.5 text-body text-pretty text-ink">
        <span className="sr-only">You asked: </span>
        {turn.question}
      </p>
      {turn.status === 'pending' ? (
        <PendingAnswer name={name} startedAt={turn.startedAt} />
      ) : turn.status === 'error' ? (
        <TurnError error={turn.error} onRetry={onRetry} />
      ) : (
        <AnswerView answer={turn.answer} name={name} asOf={asOf} />
      )}
    </li>
  )
}

function AnswerView({ answer, name, asOf }: { answer: RmAnswer; name: string; asOf: string }) {
  const notes = useMemo(
    () => numberCitations(answer.sentences, answer.facts),
    [answer.sentences, answer.facts],
  )
  const [showSources, setShowSources] = useState(false)
  const sourcesId = useId()
  return (
    <div className="grid gap-3">
      {answer.verdict ? <VerdictCard verdict={answer.verdict} name={name} /> : null}
      {answer.sentences.length > 0 ? (
        <p className="text-body text-pretty text-ink">
          {answer.sentences.map((sentence, i) => (
            <Fragment key={i}>
              {i > 0 ? ' ' : null}
              <CitedText text={sentence.text} notes={notesFor(sentence, notes)} asOf={asOf} />
            </Fragment>
          ))}
        </p>
      ) : (
        <p className="text-body text-ink-soft">
          Nothing on {possessive(name)} record answers this.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <AiLabel phrasedBy={answer.phrasedBy} />
        {notes.size > 0 ? (
          <button
            type="button"
            aria-expanded={showSources}
            aria-controls={sourcesId}
            onClick={() => setShowSources((v) => !v)}
            className="inline-flex items-center gap-1 rounded-sm text-caption text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <ChevronDown
              aria-hidden
              className={cn(
                'size-3.5 transition-transform duration-150',
                showSources && 'rotate-180',
              )}
            />
            {notes.size === 1 ? '1 source' : `${notes.size} sources`}
          </button>
        ) : null}
      </div>
      {showSources ? (
        <div id={sourcesId} className="rounded-md bg-canvas-top px-3.5 py-3">
          <SourcesList notes={notes} />
        </div>
      ) : null}
    </div>
  )
}

/** The wait for an answer: what is happening and for how long. No words are faked into place. */
function PendingAnswer({ name, startedAt }: { name: string; startedAt: number }) {
  const elapsed = useElapsed(startedAt)
  return (
    <div role="status" className="grid gap-3">
      <p className="flex items-center gap-2 text-caption text-ink-soft">
        <PulseDot />
        Reading {possessive(name)} record
        {elapsed >= 2 ? <span className="tabular text-ink-faint">· {elapsed} s</span> : null}
      </p>
      <SkeletonText lines={2} className="max-w-[92%]" />
    </div>
  )
}

function TurnError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="grid justify-items-start gap-1.5 rounded-md border border-danger/15 bg-danger-soft/50 px-3.5 py-3"
    >
      <p className="text-label text-ink">No answer came back</p>
      <p className="text-caption font-normal text-ink-soft">{describeError(error)}</p>
      <Button size="sm" icon={<RotateCw aria-hidden />} onClick={onRetry} className="mt-1.5">
        Ask again
      </Button>
    </div>
  )
}

/* ---------------------------------------------------------------- Composer */

/**
 * The question box. Enter sends and Shift+Enter breaks the line, as in every chat; the box grows
 * to five lines and then scrolls. While an answer is on its way the RM can keep typing, but the
 * next question waits, so each one is asked with the full conversation before it.
 */
function Composer({
  cif,
  name,
  busy,
  onSend,
}: {
  cif: string
  name: string
  busy: boolean
  onSend: (question: string) => void
}) {
  const [text, setText] = useState(() => draftOf(cif))
  const box = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const hintId = `${id}-hint`

  useEffect(() => saveDraft(cif, text), [cif, text])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  const length = text.trim().length
  const tooLong = length > QUESTION_MAX
  const canSend = length > 0 && !tooLong && !busy

  function submit() {
    if (!canSend) return
    onSend(text)
    setText('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="shrink-0 border-t border-hairline-soft px-4 pt-3 pb-4"
    >
      <label htmlFor={id} className="sr-only">
        Ask about {name}
      </label>
      <div
        className={cn(
          'rounded-lg border border-hairline bg-surface shadow-raised transition-[border-color,box-shadow] duration-150',
          'focus-within:border-brand focus-within:ring-3 focus-within:ring-focus/40',
          tooLong && 'border-danger focus-within:border-danger focus-within:ring-danger/20',
        )}
      >
        <textarea
          id={id}
          ref={box}
          data-autofocus
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={hintId}
          aria-invalid={tooLong || undefined}
          placeholder={`Ask about ${possessive(name)} money, plan or record`}
          className="block max-h-30 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-body text-ink placeholder:text-ink-hint focus-visible:outline-none"
        />
        <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-3">
          <p
            id={hintId}
            className={cn(
              'min-w-0 truncate text-caption font-normal',
              tooLong ? 'text-danger' : 'text-ink-hint',
            )}
          >
            {tooLong
              ? `${length} characters; questions stop at ${QUESTION_MAX}`
              : busy
                ? 'Waiting for the answer before the next question'
                : 'Enter to send · Shift+Enter for a new line'}
          </p>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            aria-label="Send question"
            disabled={!canSend}
            icon={<ArrowUp aria-hidden />}
            className="w-control-sm px-0"
          />
        </div>
      </div>
    </form>
  )
}
