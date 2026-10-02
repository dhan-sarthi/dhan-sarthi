/**
 * The copilot's working memory for each customer: the latest brief and the conversation so far.
 *
 * Both live in the query cache under the console's own key, for three reasons. The panel can be
 * closed while a brief is still being written, and the answer must still land. Coming back to a
 * customer within the session shows what was already asked, without paying for it again (every
 * brief is a model call and an access-log entry). And signing in or out clears the cache, so one
 * RM's conversation is never on screen for the next.
 *
 * The requests themselves go through `useBrief` and `useAsk` in api/queries.ts, which also keep
 * the access log fresh.
 */
import type { RmAnswer, RmBrief } from '@dhan/contracts'
import { skipToken, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAsk, useBrief, keys } from '../../api/queries.ts'
import { historyOf } from './cite.ts'

/* ---------------------------------------------------------------- Shapes */

/**
 * A brief being written keeps the one before it, so regenerating never blanks the panel and a
 * failed rewrite can still show what the RM was reading. `startedAt` is a real instant: the
 * progress line counts from it even if the panel was closed and opened again in between.
 */
export type BriefEntry =
  | { status: 'loading'; startedAt: number; previous: RmBrief | null }
  | { status: 'ready'; brief: RmBrief }
  | { status: 'error'; error: unknown; previous: RmBrief | null }

export type Turn =
  | { id: string; question: string; status: 'pending'; startedAt: number }
  | { id: string; question: string; status: 'done'; answer: RmAnswer }
  | { id: string; question: string; status: 'error'; error: unknown }

const copilotKeys = {
  brief: (cif: string) => [...keys.all, 'copilot', cif, 'brief'] as const,
  turns: (cif: string) => [...keys.all, 'copilot', cif, 'turns'] as const,
}

// Read-only observers: these entries are only ever written by the actions below, never fetched,
// so `skipToken` keeps TanStack from trying. Kept for the session rather than the default ten
// minutes, so a brief the RM paid for is still there after a long call.
const KEEP = 60 * 60_000

/* ---------------------------------------------------------------- Brief */

export function useBriefSession(cif: string) {
  const client = useQueryClient()
  const { mutateAsync } = useBrief(cif)
  const entry = useQuery<BriefEntry>({
    queryKey: copilotKeys.brief(cif),
    queryFn: skipToken,
    gcTime: KEEP,
  }).data

  const generate = useCallback(() => {
    const key = copilotKeys.brief(cif)
    const current = client.getQueryData<BriefEntry>(key)
    // One brief at a time per customer. Read from the cache, not the render, so React's
    // double-invoked effects in development cannot start a second model call.
    if (current?.status === 'loading') return
    const previous = current?.status === 'ready' ? current.brief : (current?.previous ?? null)
    const put = (next: BriefEntry) => client.setQueryData<BriefEntry>(key, next)
    put({ status: 'loading', startedAt: Date.now(), previous })
    mutateAsync().then(
      (brief) => put({ status: 'ready', brief }),
      (error: unknown) => put({ status: 'error', error, previous }),
    )
  }, [mutateAsync, cif, client])

  return { entry, generate }
}

/* ---------------------------------------------------------------- Conversation */

let turnSeq = 0
const nextTurnId = (): string => `turn-${Date.now().toString(36)}-${(turnSeq += 1)}`

function updateTurns(client: QueryClient, cif: string, fn: (turns: Turn[]) => Turn[]): void {
  client.setQueryData<Turn[]>(copilotKeys.turns(cif), (old) => fn(old ?? []))
}

export function useConversation(cif: string) {
  const client = useQueryClient()
  const { mutateAsync } = useAsk(cif)
  const turns =
    useQuery<Turn[]>({ queryKey: copilotKeys.turns(cif), queryFn: skipToken, gcTime: KEEP }).data ??
    []

  /**
   * Sends a question with the answered turns before it as history. `replace` re-asks a turn that
   * failed in place, so the thread does not grow a second copy of the same question.
   */
  const send = useCallback(
    (question: string, replace?: string) => {
      const text = question.trim()
      if (!text) return
      const all = client.getQueryData<Turn[]>(copilotKeys.turns(cif)) ?? []
      const cut = replace ? all.findIndex((t) => t.id === replace) : -1
      const before = cut >= 0 ? all.slice(0, cut) : all
      const history = historyOf(
        before.flatMap((t) =>
          t.status === 'done' ? [{ question: t.question, sentences: t.answer.sentences }] : [],
        ),
      )
      const id = replace ?? nextTurnId()
      const pending: Turn = { id, question: text, status: 'pending', startedAt: Date.now() }
      updateTurns(client, cif, (old) =>
        replace ? old.map((t) => (t.id === replace ? pending : t)) : [...old, pending],
      )
      const settle = (turn: Turn) =>
        updateTurns(client, cif, (old) => old.map((t) => (t.id === id ? turn : t)))
      mutateAsync({ question: text, ...(history.length > 0 ? { history } : {}) }).then(
        (answer) => settle({ id, question: text, status: 'done', answer }),
        (error: unknown) => settle({ id, question: text, status: 'error', error }),
      )
    },
    [mutateAsync, cif, client],
  )

  const busy = turns.some((t) => t.status === 'pending')
  return { turns, send, busy }
}
