/**
 * The disc on a transaction row.
 *
 * It used to be `t.spendCategory[0]` — one capital letter. That is the same placeholder the fund
 * rows carried until `screens/invest/SchemeMark.tsx` got drawn marks, and it fails worse here,
 * because the categories are a closed set of fifteen in which `Transport` and `Transfers` both
 * render `T`, and so do `Food & dining` on a busy statement's other half. A letter that collides
 * is not an abbreviation, it is noise with a font.
 *
 * ## Why a lucide glyph and not a drawn mark
 *
 * This disc is **32px**. `SchemeMark` establishes that a mark drawn on a 24-unit grid holds at 40
 * with a heavy silhouette and one accent, and 32 is a fifth smaller again — the point at which
 * the accent is two pixels and the two-tone shading is one. `screens/more/MoreMenu.tsx` already
 * refused the illustrated set at 34 for the same reason and was right to.
 *
 * More to the point, this is not the logo slot. A transaction row is a dense scanning list where
 * the disc's job is to sort fifteen kinds at a glance while the merchant name beside it carries
 * the meaning — which is what a monochrome stroke glyph is *for*, and what `ListRow` uses
 * everywhere else in the app. A drawn illustration here would be the only coloured object in a
 * list of forty rows and would pull the eye off the amounts.
 *
 * So: a glyph, one per category, in the disc's inherited ink. Not a letter.
 */
import type { ReactNode } from 'react'
import type { SpendCategory } from '@dhan/contracts'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Bus,
  Clapperboard,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Percent,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react'

/**
 * One glyph per category, and the union is closed, so `Record` makes the compiler the thing that
 * notices a sixteenth rather than a reviewer noticing a blank disc in a screenshot.
 *
 * `Loan EMI` takes the bank building rather than a coin: an EMI is a debit to a lender, and every
 * other money-shaped glyph in the list is already spoken for. `Fees & charges` takes the percent
 * sign because that is what a charge on a statement is, and it is a symbol rather than a letter.
 */
const GLYPH: Readonly<Record<SpendCategory, typeof Home>> = {
  Income: HandCoins,
  'Rent & bills': Home,
  Groceries: ShoppingBasket,
  'Food & dining': UtensilsCrossed,
  Transport: Bus,
  Shopping: ShoppingBag,
  Entertainment: Clapperboard,
  Health: HeartPulse,
  Education: GraduationCap,
  Investment: TrendingUp,
  Insurance: ShieldCheck,
  'Loan EMI': Landmark,
  Cash: Banknote,
  Transfers: ArrowLeftRight,
  'Fees & charges': Percent,
}

export function SpendGlyph({
  category,
  direction,
  size = 16,
}: {
  /**
   * The category, or `null` for a line that names nobody — a rail and a reference, which has no
   * category to show. Those rows fall back to the direction of the money, which is the only thing
   * the statement actually told us.
   */
  category: SpendCategory | null
  direction: 'CREDIT' | 'DEBIT'
  size?: number
}): ReactNode {
  const Icon = category ? GLYPH[category] : direction === 'CREDIT' ? ArrowDownLeft : ArrowUpRight
  return <Icon size={size} strokeWidth={2.1} aria-hidden="true" />
}
