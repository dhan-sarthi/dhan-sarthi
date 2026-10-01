import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * The dark ink tooltip, shared with the charts so a hover reads the same everywhere. One
 * provider at the root sets the delay; a tooltip is a label, never the only place a fact lives.
 */
export function TooltipProvider({
  delayDuration = 250,
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
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side} align={align} {...(className ? { className } : {})}>
        {content}
      </TooltipContent>
    </TooltipPrimitive.Root>
  )
}
