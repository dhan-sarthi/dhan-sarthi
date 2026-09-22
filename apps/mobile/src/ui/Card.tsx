import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'
import { cn } from '~/ui/cn'

/**
 * A white card on the cream ground. The hairline is what separates it, not a shadow.
 *
 * The corner is the 24 Cleo draws on every card, and it is the one radius a card takes; a
 * tighter corner belongs to the things inside it. The rest of `ViewProps` passes through so a
 * card can carry a role — the Plan tiles are a `radiogroup`, and the group has to be the card.
 */
export function Card({
  children,
  className,
  ...rest
}: Omit<ViewProps, 'children' | 'className'> & { children: ReactNode; className?: string }) {
  return (
    <View {...rest} className={cn('rounded-card border border-hairline bg-surface', className)}>
      {children}
    </View>
  )
}
