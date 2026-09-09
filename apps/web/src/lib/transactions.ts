/**
 * Statement lines for Money → Spending, a page at a time.
 *
 * `/transactions` is cursor-paged and bounded by the session's as-of date, so the list starts
 * over whenever the clock moves. The source is a function rather than a route so the offline
 * tier can page its own ledger through the same hook.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpendCategory, Transaction, TransactionsPage } from '@dhan/contracts'
import { isApiError } from '../api/client.ts'

export type TransactionSource = (
  cursor: string | null,
  limit: number,
  /** One of the fifteen categories, or null for everything. Filtered by the server. */
  category: SpendCategory | null,
) => Promise<TransactionsPage>

const PAGE = 20

interface Loaded {
  key: string
  items: Transaction[]
  nextCursor: string | null
  error: string | null
  more: boolean
}

export interface TransactionsState {
  items: Transaction[]
  hasMore: boolean
  loading: boolean
  error: string | null
  loadMore: () => Promise<void>
}

const describe = (err: unknown): string =>
  isApiError(err) ? err.message : 'Could not read the statement.'

export function useTransactions(
  source: TransactionSource,
  resetKey: string,
  /** Changing this starts the list over, because a cursor is only valid for one filter. */
  category: SpendCategory | null = null,
): TransactionsState {
  const [state, setState] = useState<Loaded>({
    key: '',
    items: [],
    nextCursor: null,
    error: null,
    more: false,
  })
  const runRef = useRef(0)

  // The filter is part of the identity of the list: a cursor issued under one category means
  // nothing under another, so changing it has to reset rather than append.
  const key = `${resetKey}|${category ?? 'all'}`

  useEffect(() => {
    runRef.current += 1
    const run = runRef.current
    void source(null, PAGE, category)
      .then((page) => {
        if (run !== runRef.current) return
        setState({
          key,
          items: page.items,
          nextCursor: page.nextCursor,
          error: null,
          more: false,
        })
      })
      .catch((err: unknown) => {
        if (run !== runRef.current) return
        setState({ key, items: [], nextCursor: null, error: describe(err), more: false })
      })
  }, [source, key, category])

  const loadMore = useCallback(async (): Promise<void> => {
    if (!state.nextCursor || state.more) return
    const run = runRef.current
    setState((s) => ({ ...s, more: true }))
    try {
      const page = await source(state.nextCursor, PAGE, category)
      if (run !== runRef.current) return
      setState((s) => ({
        ...s,
        items: [...s.items, ...page.items],
        nextCursor: page.nextCursor,
        more: false,
      }))
    } catch (err) {
      if (run !== runRef.current) return
      setState((s) => ({ ...s, error: describe(err), more: false }))
    }
  }, [source, state.nextCursor, state.more, category])

  const current = state.key === key
  return {
    items: current ? state.items : [],
    hasMore: current && state.nextCursor !== null,
    loading: !current || state.more,
    error: current ? state.error : null,
    loadMore,
  }
}
