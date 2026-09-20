import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { Glyph } from '~/ui/Glyph'
import { color } from '@dhan/design'

/** A heading, and — where the list it names continues on another screen — a way in. */
export function Section({ title, onMore }: { title: string; onMore?: () => void }) {
  if (onMore === undefined) {
    return (
      <Type role="heading" className="mt-lg">
        {title}
      </Type>
    )
  }
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${title} — see all`}
      onPress={onMore}
      scale={0.98}
      className="mt-lg flex-row items-center justify-between"
    >
      <Type role="heading">{title}</Type>
      <Glyph name="chevronRight" size={20} tint={color.inkSoft} />
    </Tap>
  )
}
