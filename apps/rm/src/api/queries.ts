/**
 * One TanStack Query hook per route the console reads, and one mutation per thing it does.
 *
 * Pages never call `api()` directly: they use these, so a query key, a cache lifetime and what a
 * mutation invalidates are decided once. Every type is the route's own, from the contracts.
 */
import type { BodyInputOf, SuccessOf } from '@dhan/contracts'
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isApiError } from './client.ts'
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

export function useMe() {
  return useQuery({
    queryKey: keys.me(),
    queryFn: ({ signal }) => api('rmMe', { signal }),
    staleTime: 5 * 60_000,
  })
}

export function useBook() {
  return useQuery({ queryKey: keys.book(), queryFn: ({ signal }) => api('rmBook', { signal }) })
}

/** Refetched on focus: a handoff raised from the app while the RM was elsewhere should be there. */
export function useToday() {
  return useQuery({
    queryKey: keys.today(),
    queryFn: ({ signal }) => api('rmToday', { signal }),
    refetchOnWindowFocus: true,
  })
}

/**
 * Opening a customer writes a "viewed" entry to the access log, so this query is never refetched
 * behind the RM's back: no refetch on focus, a long stale time. A reload is a new open, and is
 * logged as one.
 */
export function useCustomer(cif: string, purpose?: string) {
  return useQuery({
    queryKey: keys.customer(cif),
    queryFn: ({ signal }) =>
      api('rmCustomer', { params: { cif }, ...(purpose ? { query: { purpose } } : {}), signal }),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    enabled: cif !== '',
  })
}

export function useJourney(cif: string) {
  return useQuery({
    queryKey: keys.journey(cif),
    queryFn: ({ signal }) => api('rmJourney', { params: { cif }, signal }),
    enabled: cif !== '',
  })
}

export function useRecord(cif: string) {
  return useQuery({
    queryKey: keys.record(cif),
    queryFn: ({ signal }) => api('rmCustomerRecord', { params: { cif }, signal }),
    enabled: cif !== '',
  })
}

export function useInsights() {
  return useQuery({
    queryKey: keys.insights(),
    queryFn: ({ signal }) => api('rmInsights', { signal }),
  })
}

export function useRefusals() {
  return useQuery({
    queryKey: keys.refusals(),
    queryFn: ({ signal }) => api('rmRefusals', { signal }),
  })
}

export function useAccessLog() {
  return useQuery({
    queryKey: keys.accessLog(),
    queryFn: ({ signal }) => api('rmAccessLog', { signal }),
  })
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
    mutationFn: () => api('rmBrief', { params: { cif } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.accessLog() }),
  })
}

export function useAsk(cif: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: BodyInputOf<'rmAsk'>) => api('rmAsk', { params: { cif }, body }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.accessLog() }),
  })
}
