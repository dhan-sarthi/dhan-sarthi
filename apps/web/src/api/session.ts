/**
 * What the browser keeps: a bearer token and the customer it was issued for. Nothing else.
 *
 * The clock, the caps, the goal override and every decision live in the reviewer's session row
 * on the server, which is what makes "no customer data in the browser" a claim somebody can
 * check in DevTools rather than a promise in a slide. The `cif` sits beside the token only so the
 * offline tier knows which synthetic customer to simulate when the API cannot be reached; it is
 * the id printed on the picker, not a secret.
 *
 * `token` is null for a pick made while offline — there is no server row to be a bearer for.
 * The first successful reconnect exchanges the cif for a real session.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'dhan.session.v2'
/** The pre-API shape: slug, clock and decisions in the browser. Cleared, never migrated. */
const LEGACY_KEY = 'dhan.session.v1'

export interface StoredSession {
  token: string | null
  cif: string
}

function read(): StoredSession | null {
  try {
    localStorage.removeItem(LEGACY_KEY)
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (typeof parsed.cif !== 'string' || parsed.cif === '') return null
    return { token: typeof parsed.token === 'string' ? parsed.token : null, cif: parsed.cif }
  } catch {
    // A private window, cleared site data, or a browser blocking storage. None of those are
    // errors worth surfacing — the app simply starts at the picker.
    return null
  }
}

let current: StoredSession | null = read()
const listeners = new Set<() => void>()

export function getSession(): StoredSession | null {
  return current
}

export function getToken(): string | null {
  return current?.token ?? null
}

export function setSession(next: StoredSession | null): void {
  current = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* nothing to do, and nothing worth telling the customer about */
  }
  for (const fn of listeners) fn()
}

export function clearSession(): void {
  setSession(null)
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useStoredSession(): StoredSession | null {
  return useSyncExternalStore(subscribe, getSession, getSession)
}
