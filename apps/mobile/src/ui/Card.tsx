import type { ReactNode } from 'react'
import { View } from 'react-native'
import { cn } from '~/ui/cn'

/** A white card on the cream ground. The hairline is what separates it, not a shadow. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={cn('rounded-lg border border-hairline bg-surface', className)}>
      {children}
    </View>
  )
}
