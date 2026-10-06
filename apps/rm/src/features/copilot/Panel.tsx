import type { Customer360 } from '@dhan/contracts'
import { skipToken, useQuery } from '@tanstack/react-query'
import { Sparkles, X } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router'
import { keys } from '../../api/queries.ts'
import { formatDate } from '../../lib/format.ts'
import { duration, ease, slideFromRight } from '../../lib/motion.ts'
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
  COPILOT_PARAM,
  PANEL_ID,
  closeCopilot,
  copilotUi,
  isCopilotMode,
  openCopilot,
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
 * open, opens itself when the address asks (`?copilot=brief`), closes itself when the RM leaves
 * that customer, and draws the sheet in a portal so no transformed ancestor can pin it to the
 * page instead of the window.
 */
export function CopilotPanel({ cif }: { cif: string }) {
  const ui = useCopilotUi()
  const customer = useCachedCustomer(cif)
  const open = ui.openCif === cif && customer !== undefined
  useOpenFromAddress(cif)

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
      {open ? <Scrim key={`${cif}-scrim`} /> : null}
      {open ? <PanelSurface key={cif} cif={cif} customer={customer} mode={ui.mode} /> : null}
    </AnimatePresence>,
    document.body,
  )
}

/**
 * `?copilot=brief` or `?copilot=ask` opens the panel on that mode, then leaves the address, so
 * Back and a reload show the file as the RM left it rather than reopening the panel.
 */
function useOpenFromAddress(cif: string) {
  const [params, setParams] = useSearchParams()
  const asked = params.get(COPILOT_PARAM)
  useEffect(() => {
    if (!isCopilotMode(asked)) return
    openCopilot(cif, asked)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(COPILOT_PARAM)
        return next
      },
      { replace: true },
    )
  }, [asked, cif, setParams])
}

/**
 * A light wash over the file while the sheet is open, so the sheet reads as on top of the page
 * rather than a card dropped onto it. The sidebar and the top bar stay clear and live. A click on
 * the wash closes the sheet, as Esc does; the file stays readable through it.
 */
function Scrim() {
  return (
    <m.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: duration.state, ease: ease.out } }}
      exit={{ opacity: 0, transition: { duration: duration.feedback, ease: ease.in } }}
      onClick={closeCopilot}
      // From the shell's own left edge: the full sidebar, the icon rail, or none on a phone.
      className="fixed top-topbar right-0 bottom-0 left-0 z-30 bg-overlay-soft tablet:left-sidebar-rail laptop:left-sidebar"
    />
  )
}

/**
 * A side sheet, full height under the top bar, not a modal: the sidebar, the search and the top
 * bar stay usable, and the file shows through the wash beside it so the RM can hold a figure on
 * the page against the brief. Focus moves into it on open and back to where it was on close; Esc
 * and a click on the wash close it.
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
    <m.section
      ref={ref}
      id={PANEL_ID}
      role="dialog"
      aria-modal={false}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-copilot-panel
      {...slideFromRight}
      className="fixed top-topbar right-0 bottom-0 z-30 flex w-rail max-w-full flex-col overflow-hidden border-l border-hairline bg-surface shadow-overlay outline-none max-[72rem]:w-100 min-[90rem]:w-120"
    >
      <Tabs
        value={mode}
        onValueChange={(value) => setCopilotMode(value as CopilotMode)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0">
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
              <span className="shrink-0 text-label-plain text-ink-faint">About</span>
              <span className="min-w-0 truncate text-ink">{fullName}</span>
            </span>
          </div>
          <TabsList aria-label="Copilot mode" className="mt-2 px-5">
            <TabsTrigger value="brief">Brief me</TabsTrigger>
            <TabsTrigger value="ask">Ask</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="brief" className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
          <BriefView
            cif={cif}
            name={name}
            asOf={asOf}
            file={customer}
            onAsk={() => setCopilotMode('ask')}
          />
        </TabsContent>
        <TabsContent value="ask" className="flex min-h-0 flex-1 flex-col pt-0">
          <AskView cif={cif} name={name} asOf={asOf} prompts={customer.copilotPrompts} />
        </TabsContent>
      </Tabs>
    </m.section>
  )
}
