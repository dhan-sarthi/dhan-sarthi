/**
 * The customers this RM opened most recently, for Cmd-K before anything is typed.
 *
 * Held in memory only, like the book itself (`api/session.ts`: nothing about a customer is kept in
 * the browser's storage). So the list lasts for the tab's life, belongs to one RM, and is gone at
 * sign-out or reload; the access log is the durable record of what was opened. Only CIFs are kept;
 * names and segments are read from the book when the palette draws them.
 */
import { useSyncExternalStore } from 'react'

/** Enough to cover a morning's calls without turning into a second book. */
export const RECENT_LIMIT = 5

interface State {
  rmId: string | null
  cifs: readonly string[]
}

let state: State = { rmId: null, cifs: [] }
const listeners = new Set<() => void>()

function set(next: State): void {
  state = next
  for (const fn of listeners) fn()
}

/** Puts a customer at the top of the list. Another RM's list is dropped, never mixed in. */
export function recordCustomerOpen(rmId: string, cif: string): void {
  if (state.rmId === rmId && state.cifs[0] === cif) return
  const prior = state.rmId === rmId ? state.cifs.filter((c) => c !== cif) : []
  set({ rmId, cifs: [cif, ...prior].slice(0, RECENT_LIMIT) })
}

/** At sign-out, so the next person at the desk starts with an empty list. */
export function clearRecentCustomers(): void {
  if (state.rmId === null && state.cifs.length === 0) return
  set({ rmId: null, cifs: [] })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const snapshot = (): State => state

/** This RM's recent CIFs, newest first. */
export function useRecentCustomers(rmId: string | null): readonly string[] {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)
  return rmId !== null && current.rmId === rmId ? current.cifs : []
}
