// The picture on a statement row.
//
// A list of forty transactions with no imagery is a spreadsheet, and the reason Cleo's
// version reads as an app is that every row has a mark. Three sources, in order:
//
//   1. The brand's real logo, where the merchant is a brand with one.
//   2. A tinted plate with the spend category's glyph, where it is not — a kirana store, a chai
//      stall, a landlord. The row genuinely is "groceries", and the plate says so in the same
//      stroked marks as every other plate in the app: Cleo's category rows are a glyph on a
//      soft colour, not a picture.
//   3. A plate with the first letter, if even the category is unknown.
//
// The drawn illustrations (a pizza, a chai glass) used to sit between 1 and 2. They were
// pictures standing in for icons, in a style nothing else on the screen shares, and they went
// for the same reason emoji did not come in.
//
// A logo that fails to load falls to the letter, not to a blank circle: the row still says
// whose it is. `recyclingKey` is what makes that failure belong to one merchant — a list
// recycles its rows, and without it a failed logo's fallback would follow the cell onto the
// next merchant that scrolled into it.
import { useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { merchantLogo } from '@dhan/assets'
import type { SpendCategory } from '@dhan/contracts'
import { GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'

/**
 * Each category's glyph and the soft fill behind it. Every category has one, so a new member of
 * the enum is a compile error here rather than a letter plate nobody chose. The fills are the
 * light tints ink reads on; the glyph is always ink.
 */
const CATEGORY_PLATE: Record<SpendCategory, readonly [GlyphName, string]> = {
  'Food & dining': ['fork', 'bg-streak/35'],
  Groceries: ['basket', 'bg-success/50'],
  Transport: ['bus', 'bg-budget/50'],
  Shopping: ['bag', 'bg-ground-deep'],
  'Rent & bills': ['home', 'bg-budget/50'],
  Entertainment: ['film', 'bg-streak/35'],
  Health: ['heart', 'bg-danger-soft'],
  'Loan EMI': ['moneybag', 'bg-ground-deep'],
  Transfers: ['arrowRight', 'bg-ground-deep'],
  Income: ['paycheck', 'bg-success/50'],
  Investment: ['grow', 'bg-success/50'],
  Insurance: ['shield', 'bg-budget/50'],
  Education: ['pencil', 'bg-streak/35'],
  Cash: ['wallet', 'bg-ground-deep'],
  'Fees & charges': ['receipt', 'bg-ground-deep'],
}

/** The engine's category strings arrive as plain strings; this is the narrowing. */
const isCategory = (value: string | undefined): value is SpendCategory =>
  value !== undefined && value in CATEGORY_PLATE

export function MerchantMark({
  merchant,
  category,
  size = 40,
  className,
}: {
  merchant: string | null | undefined
  category?: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const logo = merchantLogo(merchant)
  const key = merchant ?? category ?? ''

  // `failed` remembers *which* merchant's logo failed, so a row that is handed a different
  // merchant tries its logo afresh instead of inheriting the last one's fallback.
  if (logo && failed !== key) {
    // Never draw a logo larger than it actually is. Most of these brands publish only a
    // favicon, and stretching a 48px mark across a 40pt plate is the blur that made this
    // look broken; rendered at its own size it reads as a contained logo instead.
    //
    // The hairline is what makes it contained. The plate is white and so is every card these
    // rows sit on, so a small favicon — BookMyShow's — floated loose and read smaller than the
    // full-bleed logos beside it. Cleo ring their logos the same way (the Apple row under
    // "Bills due"), and with the ring every mark in a list is the same circle.
    const drawn = Math.min(size, logo.width)
    return (
      <View
        className={cn(
          'items-center justify-center overflow-hidden rounded-pill border border-hairline bg-surface',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          source={logo.src}
          style={{ width: drawn, height: drawn }}
          contentFit="contain"
          transition={120}
          recyclingKey={key}
          onError={() => setFailed(key)}
          accessible={false}
        />
      </View>
    )
  }

  if (!logo && isCategory(category)) {
    const [glyph, fill] = CATEGORY_PLATE[category]
    return <GlyphPlate name={glyph} fill={fill} size={size} className={className} />
  }

  return (
    <View
      className={cn('items-center justify-center rounded-pill bg-ground-deep', className)}
      style={{ width: size, height: size }}
    >
      <Type role="label" tone="soft">
        {(merchant ?? category ?? '?').charAt(0).toUpperCase()}
      </Type>
    </View>
  )
}
