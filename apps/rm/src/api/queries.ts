/**
 * One TanStack Query hook per route the console reads, and one mutation per thing it does.
 *
 * Pages never call `api()` directly: they use these, so a query key, a cache lifetime and what a
 * mutation invalidates are decided once. Every type is the route's own, from the contracts.
 */
import type { BodyInputOf, SuccessOf } from '@dhan/contracts'
import {
  QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api, COPILOT_TIMEOUT_MS, isApiError } from './client.ts'
import { clearSession, setSession } from './session.ts'

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The client already retries a GET once on a network failure or a 5xx; a second layer of
        // retries would turn one outage into four requests and a long silence.
        retry: false,
        staleTime: 30_000,
        gcTime: 10 * 60_000,
      },
      mutations: { retry: false },
    },
  })
}

/** Every key in one place, so an invalidation names exactly what it means. */
export const keys = {
  all: ['rm'] as const,
  me: () => [...keys.all, 'me'] as const,
  book: () => [...keys.all, 'book'] as const,
  today: () => [...keys.all, 'today'] as const,
  insights: () => [...keys.all, 'insights'] as const,
  refusals: () => [...keys.all, 'refusals'] as const,
  accessLog: () => [...keys.all, 'access-log'] as const,
  customer: (cif: string) => [...keys.all, 'customer', cif] as const,
  journey: (cif: string) => [...keys.customer(cif), 'journey'] as const,
  record: (cif: string) => [...keys.customer(cif), 'record'] as const,
}

/* ---------------------------------------------------------------- Reads */

/*
 * Each read's options, written once and used twice: by its hook below, and by the route that
 * opens the page (`shell/RouteBoundary.tsx`), which starts the request beside the page's code so
 * the data does not wait for the chunk and React's reveal throttle first. Same key, same function,
 * same stale time, so a prefetched answer is the one the hook would have asked for.
 */
export const queries = {
  me: () =>
    queryOptions({
      queryKey: keys.me(),
      queryFn: ({ signal }) => api('rmMe', { signal }),
      staleTime: 5 * 60_000,
    }),

  /**
   * Not refetched on focus. The whole book is about 130 kB, and the RM switches between this
   * console and core banking all day; a write here (a logged call, a handoff) invalidates it, and
   * the figures are as at the as-of date, so a return to the tab has nothing new to fetch.
   */
  book: () =>
    queryOptions({
      queryKey: keys.book(),
      queryFn: ({ signal }) => api('rmBook', { signal }),
      refetchOnWindowFocus: false,
    }),

  /** Refetched on focus: a handoff raised from the app while the RM was elsewhere should be there. */
  today: () =>
    queryOptions({
      queryKey: keys.today(),
      queryFn: ({ signal }) => api('rmToday', { signal }),
      refetchOnWindowFocus: true,
    }),

  /**
   * Opening a customer writes a "viewed" entry to the access log, so this query is never refetched
   * behind the RM's back: no refetch on focus, a long stale time. A reload is a new open, and is
   * logged as one. The route prefetches it with exactly these options (no purpose, as here), so
   * the open is still logged once.
   *
   * The abort signal is left unused on purpose. React Query cancels a query whose function read
   * the signal when its last observer unmounts, and the remount then sends a second request; under
   * StrictMode's mount-unmount-mount that wrote every open to the log twice. Without the signal the
   * remount joins the request already in flight, and an open the server has logged is not undone
   * by dropping its reply anyway.
   */
  customer: (cif: string, purpose?: string) =>
    queryOptions({
      queryKey: keys.customer(cif),
      queryFn: () =>
        api('rmCustomer', { params: { cif }, ...(purpose ? { query: { purpose } } : {}) }),
      staleTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      enabled: cif !== '',
    }),

  journey: (cif: string) =>
    queryOptions({
      queryKey: keys.journey(cif),
      queryFn: ({ signal }) => api('rmJourney', { params: { cif }, signal }),
      enabled: cif !== '',
    }),

  record: (cif: string) =>
    queryOptions({
      queryKey: keys.record(cif),
      queryFn: ({ signal }) => api('rmCustomerRecord', { params: { cif }, signal }),
      enabled: cif !== '',
    }),

  insights: () =>
    queryOptions({
      queryKey: keys.insights(),
      queryFn: ({ signal }) => api('rmInsights', { signal }),
    }),

  /** Not refetched on focus, for the book's reason: the ledger changes only when Uday refuses. */
  refusals: () =>
    queryOptions({
      queryKey: keys.refusals(),
      queryFn: ({ signal }) => api('rmRefusals', { signal }),
      refetchOnWindowFocus: false,
    }),

  /**
   * The log is written by reads elsewhere (opening a file, a refused attempt on one outside the
   * book), which invalidate nothing here, so the page asks again every time it is opened rather
   * than showing a copy from before the RM's last open. The one exception is an answer fetched for
   * this very open: the route starts the request beside the page's code, and the page arriving a
   * moment later must not send it a second time.
   */
  accessLog: () =>
    queryOptions({
      queryKey: keys.accessLog(),
      queryFn: ({ signal }) => api('rmAccessLog', { signal }),
      staleTime: 0,
      refetchOnMount: (query) => Date.now() - query.state.dataUpdatedAt > JUST_FETCHED_MS,
    }),
}

/** How fresh a prefetched answer has to be for the page that asked for it to use it as it is. */
const JUST_FETCHED_MS = 2_000

export function useMe() {
  return useQuery(queries.me())
}

export function useBook() {
  return useQuery(queries.book())
}

/**
 * The sidebar's badge: the open requests to talk. It subscribes to the book for one number, so a
 * change anywhere else in the book does not redraw the sidebar. (The book is still fetched whole;
 * a light count on `/me` needs a contract change.)
 */
export function useOpenHandoffCount(): number {
  return useQuery({ ...queries.book(), select: (book) => book.totals.openHandoffs }).data ?? 0
}

export function useToday() {
  return useQuery(queries.today())
}

export function useCustomer(cif: string, purpose?: string) {
  return useQuery(queries.customer(cif, purpose))
}

export function useJourney(cif: string) {
  return useQuery(queries.journey(cif))
}

export function useRecord(cif: string) {
  return useQuery(queries.record(cif))
}

export function useInsights() {
  return useQuery(queries.insights())
}

export function useRefusals() {
  return useQuery(queries.refusals())
}

export function useAccessLog() {
  return useQuery(queries.accessLog())
}

/* ---------------------------------------------------------------- Session */

export function useSignIn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: BodyInputOf<'rmSignIn'>) => api('rmSignIn', { body }),
    onSuccess: (reply: SuccessOf<'rmSignIn'>) => {
      // A different RM on the same browser must never see the last one's cached book.
      client.clear()
      setSession({ token: reply.token, expiresAt: reply.expiresAt, rm: reply.rm })
    },
  })
}

/**
 * Signing out revokes the token on the server and then forgets it here. If the server cannot be
 * reached the local session still ends: the RM asked to be signed out, and they are.
 */
export function useSignOut() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        await api('rmSignOut')
      } catch (error) {
        if (!isApiError(error)) throw error
      }
    },
    onSettled: () => {
      clearSession('signed_out')
      client.clear()
    },
  })
}

/* ---------------------------------------------------------------- Writes */

export function useAddNote(cif: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: BodyInputOf<'rmAddNote'>) => api('rmAddNote', { params: { cif }, body }),
    onSuccess: () => {
      // A logged call changes the journey, last activity and strength, and is itself logged.
      void client.invalidateQueries({ queryKey: keys.journey(cif) })
      void client.invalidateQueries({ queryKey: keys.book() })
      void client.invalidateQueries({ queryKey: keys.today() })
      void client.invalidateQueries({ queryKey: keys.accessLog() })
    },
  })
}

export function useUpdateHandoff() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ handoffId, ...body }: { handoffId: string } & BodyInputOf<'rmUpdateHandoff'>) =>
      api('rmUpdateHandoff', { params: { handoffId }, body }),
    onSuccess: (reply) => {
      void client.invalidateQueries({ queryKey: keys.today() })
      void client.invalidateQueries({ queryKey: keys.book() })
      void client.invalidateQueries({ queryKey: keys.journey(reply.handoff.cif) })
      void client.invalidateQueries({ queryKey: keys.accessLog() })
    },
  })
}

/** Resolves with the unmasked value. It is not cached: the caller holds it, and only briefly. */
export function useReveal(cif: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: BodyInputOf<'rmReveal'>) => api('rmReveal', { params: { cif }, body }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.accessLog() }),
  })
}

export function useVerifyRecord(cif: string) {
  return useMutation({
    mutationFn: () => api('rmVerifyCustomerRecord', { params: { cif } }),
  })
}

export function useVerifyBook() {
  return useMutation({ mutationFn: () => api('rmVerifyBook') })
}

export function useBrief(cif: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api('rmBrief', { params: { cif }, timeoutMs: COPILOT_TIMEOUT_MS }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.accessLog() }),
  })
}

export function useAsk(cif: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: BodyInputOf<'rmAsk'>) =>
      api('rmAsk', { params: { cif }, body, timeoutMs: COPILOT_TIMEOUT_MS }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.accessLog() }),
  })
}
