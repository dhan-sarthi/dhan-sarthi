/**
 * Whether the copilot is open, for which customer, and on which mode.
 *
 * The buttons that open it (the header's Brief me, the Overview's Ask about) and the panel that
 * draws it live in different parts of the customer page, so they share this small store rather
 * than threading state through a layout this feature does not own. It holds no customer data:
 * briefs and answers live in the query cache, which is cleared when an RM signs in or out.
 */
import { useSyncExternalStore } from 'react'
import { getToken } from '../../api/session.ts'

export type CopilotMode = 'brief' | 'ask'

/** The panel's element id, for the buttons' `aria-controls`. */
export const PANEL_ID = 'rm-copilot-panel'

/**
 * `?copilot=brief` on a customer's address opens the file with the copilot already on that mode,
 * so a page outside the file (Today's call row) can hand the RM straight to a brief. The panel
 * reads it once and takes it off the address, so Back and a reload do not open it again.
 */
export const COPILOT_PARAM = 'copilot'

export function isCopilotMode(value: string | null): value is CopilotMode {
  return value === 'brief' || value === 'ask'
}

/** `/customers/IDBI0003308471?copilot=brief` */
export function copilotHref(cif: string, mode: CopilotMode = 'brief'): string {
  return `/customers/${encodeURIComponent(cif)}?${COPILOT_PARAM}=${mode}`
}

interface CopilotUi {
  /** The customer the panel is open on, or null when it is closed. */
  openCif: string | null
  mode: CopilotMode
}

let state: CopilotUi = { openCif: null, mode: 'brief' }
const listeners = new Set<() => void>()

/**
 * Where focus was when the panel opened, so closing it puts the RM back where they were rather
 * than at the top of the page. Not state: nothing renders from it.
 */
let returnFocus: HTMLElement | null = null

function set(next: CopilotUi): void {
  state = next
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useCopilotUi(): CopilotUi {
  return useSyncExternalStore(subscribe, () => state)
}

/** For effects and handlers, which must read the state as it is now rather than as rendered. */
export function copilotUi(): CopilotUi {
  return state
}

export function openCopilot(cif: string, mode: CopilotMode): void {
  if (state.openCif === null) {
    const active = document.activeElement
    returnFocus = active instanceof HTMLElement && active !== document.body ? active : null
  }
  set({ openCif: cif, mode })
}

export function closeCopilot(): void {
  if (state.openCif === null) return
  set({ ...state, openCif: null })
  const target = returnFocus
  returnFocus = null
  // After the panel's exit has been committed, so focus does not land on a node being removed.
  if (target?.isConnected) requestAnimationFrame(() => target.focus({ preventScroll: true }))
}

export function setCopilotMode(mode: CopilotMode): void {
  if (state.mode !== mode) set({ ...state, mode })
}

/**
 * A button press: open on this mode, or close if the panel already shows exactly that. A press
 * for the other mode switches to it, so "Ask about Karan" never closes a brief the RM is reading.
 */
export function pressCopilot(cif: string, mode: CopilotMode): void {
  if (state.openCif === cif && state.mode === mode) closeCopilot()
  else openCopilot(cif, mode)
}

/** The keyboard shortcut: open on the last mode used, or close. */
export function toggleCopilot(cif: string): void {
  if (state.openCif === cif) closeCopilot()
  else openCopilot(cif, state.mode)
}

/* ---------------------------------------------------------------- Drafts */

/**
 * A half-typed question survives switching to the brief and back, and closing the panel to check
 * a figure on the page. Kept per customer, in memory only, and dropped once sent. Keyed by the
 * session too, so a second RM signing in on the same tab never finds the first one's words.
 */
const drafts = new Map<string, string>()
const draftKey = (cif: string): string => `${getToken() ?? ''}|${cif}`

export function draftOf(cif: string): string {
  return drafts.get(draftKey(cif)) ?? ''
}

export function saveDraft(cif: string, text: string): void {
  if (text) drafts.set(draftKey(cif), text)
  else drafts.delete(draftKey(cif))
}
