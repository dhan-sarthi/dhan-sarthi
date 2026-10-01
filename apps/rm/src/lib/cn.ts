import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import { web } from '@dhan/design'

/**
 * `clsx` for conditions, `tailwind-merge` so a caller's `className` wins over a component's
 * default. tailwind-merge has to be told the token names: without it `text-label` (a type role)
 * looks like a colour, and `cn('text-label', 'text-ink')` would silently drop the role.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(web.type),
      radius: Object.keys(web.radius),
      shadow: ['popover', 'overlay', 'raised'],
      spacing: [
        'sidebar',
        'topbar',
        'rail',
        'row',
        'row-dense',
        'control',
        'control-sm',
        'control-lg',
      ],
      container: ['content'],
      tracking: ['micro'],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
