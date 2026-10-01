// The design system, in one place.
//
// tokens.json is the single source of truth and is consumed twice: here, for
// anything that needs a raw value at runtime (StatusBar, SVG fills, gradients,
// the Expo splash), and by tailwind-preset.cjs, which turns the same values
// into NativeWind utility classes. Prefer the utility classes in components;
// reach for these constants only where a className cannot go.
import tokens from '../tokens.json' with { type: 'json' }

export const color = tokens.color
export const radius = tokens.radius
export const space = tokens.space
export const type = tokens.type
export const control = tokens.control
// Runtime numbers for the things a class cannot size: a plate drawn with `style`, a track
// measured for a chart, a hitSlop worked out from a 44pt target.
export const size = tokens.size
export const stroke = tokens.stroke
export const motion = tokens.motion
// The desktop console's additions (apps/rm). Separate groups rather than new keys in the ones
// above, so the NativeWind preset, which reads those groups by name, cannot change underneath
// the mobile app. `web` is the desktop type scale, radii, layout sizes and soft fills; `chart`
// is the validated chart palette; `elevation` is the one place a shadow is allowed.
export const web = tokens.web
export const chart = tokens.chart
export const elevation = tokens.elevation
export default tokens

export type ColorName = keyof typeof tokens.color
