/**
 * What the browser keeps about the signed-in RM: the bearer, who it was issued to, and when it
 * lapses. Nothing about any customer is ever stored here; the book is fetched, held in memory by
 * the query cache, and gone when the tab closes.
 *
 * A `useSyncExternalStore` store so the auth guard re-renders the moment the session ends,
 * whether the RM signed out or a request came back 401.
 */
import type { RmProfile } from '@dhan/contracts'
import { useSyncExternalStore } from 'react'

const KEY = 'dhan.rm.session.v1'

export interface RmSession {
  token: string
  expiresAt: string
  rm: RmProfile
}

/** Why the last session ended, for one sentence on the sign-in page. Never persisted. */
export type EndReason = 'signed_out' | 'expired'

function isProfile(v: unknown): v is RmProfile {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return ['rmId', 'employeeNo', 'name', 'initials', 'desk', 'city'].every(
    (k) => typeof p[k] === 'string',
  )
}

function read(): RmSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RmSession>
    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.expiresAt !== 'string' ||
      !isProfile(parsed.rm)
    ) {
      return null
    }
    // An expired token is not worth a round trip to learn it is expired.
    if (Date.parse(parsed.expiresAt) <= Date.now()) return null
    return { token: parsed.token, expiresAt: parsed.expiresAt, rm: parsed.rm }
  } catch {
    // A private window, cleared site data, or storage blocked outright: start signed out.
    return null
  }
}

let current: RmSession | null = read()
let endReason: EndReason | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

export function getSession(): RmSession | null {
  return current
}

export function getToken(): string | null {
  return current?.token ?? null
}

export function setSession(next: RmSession): void {
  current = next
  endReason = null
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage refused: the session still works for this tab, it just will not survive a reload.
  }
  emit()
}

export function clearSession(reason: EndReason): void {
  if (current === null) return
  current = null
  endReason = reason
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to remove, or nothing we are allowed to touch */
  }
  emit()
}

/**
 * Why the last session ended, for the sign-in page. A plain read (React may call a state
 * initialiser twice in development); the next sign-in clears it.
 */
export function getEndReason(): EndReason | null {
  return endReason
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useSession(): RmSession | null {
  return useSyncExternalStore(subscribe, getSession, getSession)
}

// Another tab signing out (or in) should not leave this one holding a dead token.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return
    const next = read()
    if (next === null && current !== null) {
      current = null
      endReason = 'signed_out'
      emit()
    } else if (next !== null && next.token !== current?.token) {
      current = next
      emit()
    }
  })
}
