// The picture on a statement row.
//
// A list of forty transactions with no imagery is a spreadsheet, and the reason Cleo's
// version reads as an app is that every row has a mark. Three sources, in order:
//
//   1. The brand's real logo, where the merchant is a brand with one.
//   2. The spend-category illustration, where it is not — a kirana store, a chai stall,
//      a landlord. This is the honest answer rather than a generic grey square: the row
//      genuinely is "groceries", and the picture says so.
//   3. A tinted plate with the first letter, if even the category is unknown.
//
// Both sources are bundled, so a row never waits on the network to become legible.
import { View } from 'react-native'
import { Image } from 'expo-image'
import { SPEND_ICON, merchantKindIcon, merchantLogo } from '@dhan/assets'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'

type SpendCategory = keyof typeof SPEND_ICON

/** The engine's category strings arrive as plain strings; this is the narrowing. */
const isCategory = (value: string | undefined): value is SpendCategory =>
  value !== undefined && value in SPEND_ICON

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
  // Three tiers, most specific first. The brand's own mark where there is one; failing that a
  // drawing of what the merchant *is* — a pizza, a chai glass, a fuel pump; and failing that the
  // spend category, which is always true even when it is not very interesting.
  const logo = merchantLogo(merchant)
  const icon =
    logo?.src ??
    merchantKindIcon(merchant) ??
    (isCategory(category) ? SPEND_ICON[category] : undefined)

  if (icon) {
    // Never draw a logo larger than it actually is. Most of these brands publish only a
    // favicon, and stretching a 48px mark across a 40pt plate is the blur that made this
    // look broken; rendered at its own size it reads as a contained logo instead. The
    // illustrations are drawn large and have no such limit.
    const drawn = logo ? Math.min(size, logo.width) : size * 0.92
    return (
      <View
        className={cn(
          'items-center justify-center overflow-hidden rounded-pill bg-surface',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          source={icon}
          style={{ width: drawn, height: drawn }}
          contentFit="contain"
          transition={120}
        />
      </View>
    )
  }

  return (
    <View
      className={cn('items-center justify-center rounded-pill bg-ground-deep', className)}
      style={{ width: size, height: size }}
    >
      <Type role="label" tone="soft">
        {(merchant ?? '?').charAt(0).toUpperCase()}
      </Type>
    </View>
  )
}
