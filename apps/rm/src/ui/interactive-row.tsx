import { createContext, useContext, type ReactNode } from 'react'

/*
 * A badge whose meaning lives in a tooltip (segment, strength, allocation) takes a Tab stop of its
 * own, so a keyboard user can open the tooltip. Inside a row that is itself a Tab stop (a clickable
 * table row, a queue item) that turned one row into four stops, and a 38-row book into 150. Inside
 * such a row the badge gives its stop up: the row is the stop, the arrow keys walk the rows, and
 * the badge's words still reach a screen reader through its label.
 */
const InteractiveRowContext = /* @__PURE__ */ createContext(false)

/**
 * Marks everything inside as sitting in a row that is already one Tab stop. `DataTable` wraps its
 * clickable rows in this; a page with its own clickable list (a call queue, say) wraps each item.
 */
export function InteractiveRow({ children }: { children: ReactNode }) {
  return <InteractiveRowContext.Provider value>{children}</InteractiveRowContext.Provider>
}

/** True inside a row that is already one Tab stop (a clickable table row, a queue item). */
export function useInInteractiveRow(): boolean {
  return useContext(InteractiveRowContext)
}

/** The `tabIndex` a hover-only badge takes: a stop of its own, unless its row already is one. */
export function useBadgeTabIndex(): 0 | undefined {
  return useContext(InteractiveRowContext) ? undefined : 0
}
