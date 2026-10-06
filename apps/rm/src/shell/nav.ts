import {
  BookUser,
  ChartNoAxesColumn,
  ScrollText,
  ShieldCheck,
  Sunrise,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** One line for the command palette and the tooltip on a collapsed rail. */
  hint: string
}

/** The five places, in the order the RM's day runs: who to call, the book, the trends, the proof. */
export const NAV: readonly NavItem[] = [
  { to: '/', label: 'Today', icon: Sunrise, hint: 'Who to call today, and why' },
  { to: '/book', label: 'Book', icon: BookUser, hint: 'Every customer in your book' },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesColumn, hint: 'How the book is moving' },
  { to: '/record', label: 'Advice record', icon: ShieldCheck, hint: 'Every refusal, hash-chained' },
  { to: '/access', label: 'Access log', icon: ScrollText, hint: 'Every file you opened, and why' },
]
