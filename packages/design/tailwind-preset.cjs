/* eslint-disable */
// NativeWind preset generated from tokens.json. Adding a colour here means adding
// it to tokens.json first — this file never declares a value of its own.
const t = require('./tokens.json')

const px = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}px`]))

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: t.color.ink, mid: t.color.inkMid, soft: t.color.inkSoft, faint: t.color.inkFaint, hint: t.color.inkHint },
        'on-ink': t.color.onInk,
        ground: { DEFAULT: t.color.ground, deep: t.color.groundDeep },
        surface: t.color.surface,
        brand: { DEFAULT: t.color.brand, deep: t.color.brandDeep },
        'on-brand': t.color.onBrand,
        streak: t.color.streak,
        budget: t.color.budget,
        success: t.color.success,
        hero: t.color.hero,
        danger: { DEFAULT: t.color.danger, soft: t.color.dangerSoft },
        hairline: { DEFAULT: t.color.hairline, soft: t.color.hairlineSoft },
        scrim: t.color.scrim,
        // The chat canvas. `bloom` and `floor` are the radial's stops and are drawn by
        // SVG rather than a class; the two washes and the raised near-white are fills.
        'canvas-top': t.color.canvasTop,
        'canvas-bloom': t.color.canvasBloom,
        'canvas-floor': t.color.canvasFloor,
        'sheet-wash': t.color.sheetWash,
        'pill-wash': t.color.pillWash,
        'surface-raised': t.color.surfaceRaised,
      },
      borderRadius: { ...px(t.radius), pill: '999px' },
      spacing: px(t.space),
      // Size and leading only. Weight is a separate utility (font-bold, font-semibold)
      // because NativeWind maps fontWeight through its own class, not the size tuple.
      fontSize: Object.fromEntries(
        Object.entries(t.type).map(([k, v]) => [k, [`${v.size}px`, { lineHeight: `${v.leading}px` }]]),
      ),
      letterSpacing: { display: '-1px', title: '-0.6px', answer: '-0.2px', flat: '0px' },
      height: {
        control: `${t.control.height}px`,
        field: `${t.control.fieldHeight}px`,
        chip: `${t.control.chipHeight}px`,
      },
    },
  },
}
