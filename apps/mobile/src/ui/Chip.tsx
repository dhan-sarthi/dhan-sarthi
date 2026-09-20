import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'

/** The small pill Cleo uses for reassurance ("Secured by…") and status. */
export function Chip({
  children,
  tone = 'success',
  className,
}: {
  children: ReactNode
  tone?: 'success' | 'streak' | 'budget' | 'ground' | 'danger'
  className?: string
}) {
  const fill = {
    success: 'bg-success',
    streak: 'bg-streak',
    budget: 'bg-budget',
    ground: 'bg-ground-deep',
    // The soft fill, not the solid one: this chip prints ink on it, and `danger` is a
    // ground for white. Added for the severity map in `ui/severity.ts`, where `urgent` has
    // to be distinguishable from `important` at a glance.
    danger: 'bg-danger-soft',
  }[tone]
  return (
    <View className={cn('self-start rounded-pill px-md py-xs', fill, className)}>
      <Type role="caption" tone="ink">
        {children}
      </Type>
    </View>
  )
}
