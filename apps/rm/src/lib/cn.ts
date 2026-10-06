import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import { elevation, web } from '@dhan/design'

/** `captionPlain` → `caption-plain`, as `scripts/tokens-css.mjs` names the class. */
const kebab = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/**
 * `clsx` for conditions, `tailwind-merge` so a caller's `className` wins over a component's
 * default. tailwind-merge has to be told the token names: without it `text-label` (a type role)
 * looks like a colour, and `cn('text-label', 'text-ink')` would silently drop the role. The lists
 * are read from the same tokens the theme is generated from, so a new role or size merges
 * correctly the day it is added.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(web.type).map(kebab),
      radius: Object.keys(web.radius).map(kebab),
      shadow: Object.keys(elevation).map(kebab),
      spacing: Object.keys(web.size)
        .filter((k) => k !== 'content')
        .map(kebab),
      container: ['content'],
      tracking: ['micro'],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
