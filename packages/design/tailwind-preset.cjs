/* eslint-disable */
// NativeWind preset generated from tokens.json. Adding a colour here means adding
// it to tokens.json first — this file never declares a value of its own.
const t = require('./tokens.json')

const px = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}px`]))

// The fixed sizes a control is drawn at — the 44pt target, the plates behind glyphs, a radio
// and its dot, the chart track. Named once so `h-plate-md` is a plate and `h-target` is a
// target wherever they appear, and no screen spells the number.
const sized = {
  target: `${t.size.target}px`,
  ring: `${t.size.ring}px`,
  'plate-sm': `${t.size.plateSm}px`,
  'plate-md': `${t.size.plateMd}px`,
  'plate-lg': `${t.size.plateLg}px`,
  'plate-xl': `${t.size.plateXl}px`,
  radio: `${t.size.radio}px`,
  'radio-dot': `${t.size.radioDot}px`,
  track: `${t.size.track}px`,
}
// Line weights — a progress rail, a meter, a sheet handle. Heights only: nothing is that wide.
const strokes = {
  rail: `${t.stroke.rail}px`,
  meter: `${t.stroke.meter}px`,
  handle: `${t.stroke.handle}px`,
}
const controls = {
  control: `${t.control.height}px`,
  field: `${t.control.fieldHeight}px`,
  chip: `${t.control.chipHeight}px`,
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: t.color.ink,
          mid: t.color.inkMid,
          soft: t.color.inkSoft,
          faint: t.color.inkFaint,
          hint: t.color.inkHint,
        },
        'on-ink': t.color.onInk,
        // `fade` is the cream at zero alpha: the transparent end of a gradient laid over the
        // ground, so an edge fade dissolves into the page instead of into grey.
        ground: { DEFAULT: t.color.ground, deep: t.color.groundDeep, fade: t.color.groundFade },
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
        Object.entries(t.type).map(([k, v]) => [
          k,
          [`${v.size}px`, { lineHeight: `${v.leading}px` }],
        ]),
      ),
      letterSpacing: {
        figure: '-2.5px',
        display: '-1px',
        title: '-0.6px',
        answer: '-0.2px',
        flat: '0px',
      },
      height: { ...controls, ...sized, ...strokes },
      width: sized,
      // `min-h` rather than `h` for anything that holds text: a label wrapping at a large
      // type size grows the control instead of clipping inside it.
      minHeight: { ...controls, ...sized },
      minWidth: sized,
    },
  },
}
