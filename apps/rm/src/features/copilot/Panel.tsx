import type { Customer360 } from '@dhan/contracts'
import { skipToken, useQuery } from '@tanstack/react-query'
import { Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { keys } from '../../api/queries.ts'
import { formatDate } from '../../lib/format.ts'
import { slideFromRight } from '../../lib/motion.ts'
import {
  Avatar,
  IconButton,
  Kbd,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  modKey,
} from '../../ui/index.ts'
import { AskView } from './Ask.tsx'
import { BriefView } from './Brief.tsx'
import { firstName } from './names.ts'
import {
  PANEL_ID,
  closeCopilot,
  copilotUi,
  setCopilotMode,
  toggleCopilot,
  useCopilotUi,
  type CopilotMode,
} from './store.ts'

/**
 * The customer page's copy of the file, read from the cache and never fetched. Opening a file
 * writes to the access log, so a second observer that refetched a stale copy would log a view the
 * RM never made; `skipToken` makes this one read-only.
 */
function useCachedCustomer(cif: string): Customer360 | undefined {
  return useQuery<Customer360>({ queryKey: keys.customer(cif), queryFn: skipToken }).data
}

/**
 * Mounted once by the customer layout. It owns the Cmd/Ctrl-J shortcut while a customer page is
 * open, closes itself when the RM leaves that customer, and draws the panel in a portal so no
 * transformed ancestor can pin it to the page instead of the window.
 */
export function CopilotPanel({ cif }: { cif: string }) {
  const ui = useCopilotUi()
  const customer = useCachedCustomer(cif)
  const open = ui.openCif === cif && customer !== undefined

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'j' || !(event.metaKey || event.ctrlKey)) return
      if (event.altKey || event.shiftKey || event.repeat) return
      // A modal (the search palette, a reveal reason) owns the keyboard while it is open.
      if (document.querySelector('[role="dialog"][data-state="open"]:not([data-copilot-panel])'))
        return
      event.preventDefault()
      toggleCopilot(cif)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cif])

  // Leaving the customer (another file, another page) closes the panel: a brief is about one
  // person, and must never sit open beside someone else's file.
  useEffect(
    () => () => {
      if (copilotUi().openCif === cif) closeCopilot()
    },
    [cif],
  )

  return createPortal(
    <AnimatePresence>
      {open ? <PanelSurface key={cif} cif={cif} customer={customer} mode={ui.mode} /> : null}
    </AnimatePresence>,
    document.body,
  )
}

const GAP = 12

/**
 * Keeps the panel clear of the customer's header. Where any part of the header (the name, the CIF,
 * Log a call) reaches into the panel's column, the panel starts below it; where nothing does, as
 * on a narrower window where the actions wrap under the name, it rises to the top bar and keeps
 * the height for the brief. Once the header scrolls away the panel follows it up. Written straight
 * to the element on scroll, so following the page costs no React render.
 */
function followHeader(panel: HTMLElement | null): (() => void) | undefined {
  if (!panel) return undefined
  const topbar =
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--spacing-topbar'),
    ) || 56
  const header = document.querySelector<HTMLElement>('#main header')
  let frame = 0
  const place = () => {
    frame = 0
    // From the layout, not the box: the slide-in moves the box sideways while it plays.
    const left = window.innerWidth - GAP - panel.offsetWidth
    let below = 0
    if (header?.isConnected) {
      for (const el of header.querySelectorAll<HTMLElement>('*')) {
        // Leaves and controls only: the header's own rows span the page and always "overlap".
        if (el.childElementCount > 0 && el.tagName !== 'BUTTON') continue
        const box = el.getBoundingClientRect()
        if (box.width > 0 && box.right > left - GAP && box.bottom > below) below = box.bottom
      }
    }
    // A header reaching past half the window is not one the panel should shrink for.
    if (below > window.innerHeight / 2) below = 0
    panel.style.top = `${Math.max(topbar, below) + GAP}px`
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(place)
  }
  place()
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  }
}

/**
 * A slide-over, not a modal: it starts under the customer's header and leaves the header and the
 * file beside it in view and usable, so the RM can check a figure on the page against the brief.
 * Focus moves into it on open and back to where it was on close; Esc closes it.
 */
function PanelSurface({
  cif,
  customer,
  mode,
}: {
  cif: string
  customer: Customer360
  mode: CopilotMode
}) {
  const ref = useRef<HTMLElement>(null)
  const titleId = useId()
  const fullName = customer.profile.name
  const name = firstName(fullName)
  const asOf = formatDate(customer.asOf)

  useEffect(() => {
    const panel = ref.current
    if (!panel) return
    const target = panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel
    target.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => followHeader(ref.current), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const panel = ref.current
      const active = document.activeElement
      // Esc belongs to the panel when focus is in it, on the button that opened it, or nowhere.
      // Focus elsewhere on the page means the RM is working there, and Esc is theirs.
      const ours =
        active === null ||
        active === document.body ||
        (panel?.contains(active) ?? false) ||
        (active instanceof HTMLElement && active.dataset.copilotTrigger !== undefined)
      if (!ours) return
      event.preventDefault()
      closeCopilot()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <motion.section
      ref={ref}
      id={PANEL_ID}
      role="dialog"
      aria-modal={false}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-copilot-panel
      {...slideFromRight}
      className="fixed top-[calc(var(--spacing-topbar)+0.75rem)] right-3 bottom-3 z-30 flex w-rail max-w-[calc(100vw-1.5rem)] max-[85rem]:w-100 flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-overlay outline-none"
    >
      <Tabs
        value={mode}
        onValueChange={(value) => setCopilotMode(value as CopilotMode)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header className="shrink-0">
          <div className="flex items-center gap-2.5 px-5 pt-4">
            <span
              aria-hidden
              className="inline-flex size-7 items-center justify-center rounded-md bg-brand-wash text-brand"
            >
              <Sparkles className="size-4" />
            </span>
            <h2 id={titleId} className="text-heading text-ink">
              Copilot
              <span className="sr-only">, about {fullName}</span>
            </h2>
            <div className="ml-auto flex items-center gap-2">
              <span aria-hidden className="flex items-center gap-0.5">
                <Kbd>{modKey()}</Kbd>
                <Kbd>J</Kbd>
              </span>
              <IconButton
                label="Close the copilot"
                icon={<X aria-hidden />}
                size="sm"
                onClick={closeCopilot}
                className="-mr-1.5"
              />
            </div>
          </div>
          <div className="mt-3 px-5">
            <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-hairline bg-surface pr-3 pl-1 text-label">
              <Avatar
                name={fullName}
                initials={customer.profile.initials}
                size="sm"
                className="size-5 text-micro tracking-normal"
              />
              <span className="shrink-0 font-normal text-ink-faint">About</span>
              <span className="min-w-0 truncate text-ink">{fullName}</span>
            </span>
          </div>
          <TabsList aria-label="Copilot mode" className="mt-2 px-5">
            <TabsTrigger value="brief">Brief me</TabsTrigger>
            <TabsTrigger value="ask">Ask</TabsTrigger>
          </TabsList>
        </header>

        <TabsContent value="brief" className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
          <BriefView cif={cif} name={name} asOf={asOf} onAsk={() => setCopilotMode('ask')} />
        </TabsContent>
        <TabsContent value="ask" className="flex min-h-0 flex-1 flex-col pt-0">
          <AskView cif={cif} name={name} asOf={asOf} prompts={customer.copilotPrompts} />
        </TabsContent>
      </Tabs>
    </motion.section>
  )
}
