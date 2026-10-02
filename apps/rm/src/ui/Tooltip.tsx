import { Slot, Tooltip as TooltipPrimitive } from 'radix-ui'
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cn } from '../lib/cn.ts'
import { useInInteractiveRow } from './interactive-row.tsx'

/**
 * The dark ink tooltip, shared with the charts so a hover reads the same everywhere. One
 * provider at the root sets the delay; a tooltip is a label, never the only place a fact lives.
 */
const OPEN_DELAY_MS = 250

export function TooltipProvider({
  delayDuration = OPEN_DELAY_MS,
  skipDelayDuration = 150,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  )
}

export const tooltipSurface =
  'rounded-md bg-chart-tooltip px-2.5 py-1.5 text-caption text-chart-tooltip-text shadow-popover'

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'animate-pop z-50 max-w-72 origin-(--radix-tooltip-content-transform-origin) text-balance',
          tooltipSurface,
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-chart-tooltip" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export interface TooltipProps {
  content: ReactNode
  /** A single focusable element: the tooltip opens on its hover and its keyboard focus. */
  children: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  className?: string
  /**
   * A tap opens it, and a second tap or a tap elsewhere closes it. For an explanation behind a
   * badge or a chip (segment, strength, allocation, the as-of date), which a finger cannot hover.
   * Not for a button's label: there the tap is the button's.
   */
  openOnTap?: boolean
}

/**
 * Inside a clickable row the tooltip is mounted only when the pointer rests on its badge: a
 * 38-row book carried a hundred-odd idle tooltip trees through every render of the table, and
 * there the badge has no Tab stop of its own (`interactive-row.tsx`), so hover is the only way
 * in. A tap on such a badge is the row's, so `openOnTap` does not apply inside a row.
 */
export function Tooltip(props: TooltipProps) {
  return useInInteractiveRow() ? <RowTooltip {...props} /> : <TooltipRoot {...props} />
}

function TooltipRoot({
  content,
  children,
  side = 'top',
  align = 'center',
  className,
  openOnTap = false,
  defaultOpen = false,
}: TooltipProps & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  // Radix closes the tooltip on pointerdown and again on click; a tap has to know whether it
  // found the tooltip open before either ran.
  const tap = useRef<{ touch: boolean; wasOpen: boolean }>({ touch: false, wasOpen: false })
  const tapHandlers = openOnTap
    ? {
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
          tap.current = { touch: event.pointerType !== 'mouse', wasOpen: open }
        },
        onClick: (event: MouseEvent<HTMLElement>) => {
          if (!tap.current.touch) return
          event.preventDefault()
          setOpen(!tap.current.wasOpen)
        },
      }
    : {}
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild {...tapHandlers}>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipContent side={side} align={align} {...(className ? { className } : {})}>
        {content}
      </TooltipContent>
    </TooltipPrimitive.Root>
  )
}

function RowTooltip(props: TooltipProps) {
  const [mounted, setMounted] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  if (mounted) return <TooltipRoot {...props} openOnTap={false} defaultOpen />
  return (
    <Slot.Root
      onPointerEnter={(event: PointerEvent<HTMLElement>) => {
        if (event.pointerType !== 'mouse') return
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setMounted(true), OPEN_DELAY_MS)
      }}
      onPointerLeave={() => window.clearTimeout(timer.current)}
    >
      {props.children}
    </Slot.Root>
  )
}
