# Design language — "a module inside IDBI GO Mobile+"

The web app must look like a screen the bank shipped, not a fintech demo bolted onto it. The
values below were sampled from GO Mobile+ App Store / Play Store captures and the IDBI logo.
Tokens live in `src/styles/tokens.css` (`:root`) and are exposed to Tailwind v4 through `@theme`
in `src/styles/app.css`, so every utility named here resolves without configuration.

Three deliberate departures from the bank's own app, all of them contrast: small orange text uses
`text-accent-text` (#a94f08) rather than the raw #f58220; a filled orange button is labelled
`text-on-accent` (the body ink, 6.5:1) rather than white, which was 2.59:1; and the dark surfaces
sit on `brand-deep` or below, because #00836c carries white at only 4.71:1. Plus one that is not:
one large number leads each card. `tokens.css` states each of them at the group it applies to —
where this file and that one disagree, `tokens.css` is the value that ships.

## Two gotchas before you write a class

1. **`tokens.css` is imported unlayered**, so any legacy class (`.card`, `.btn`, `.pill`, ...)
   beats a Tailwind utility on the same element. Never mix a legacy class with utilities —
   drop the legacy class entirely. The legacy classes are being retired.
2. **Preflight is not loaded.** Buttons keep the browser's outset border and grey fill; `h1`/`p`
   keep their margins; borders default to `none`. So: every button gets `border-0` (or an
   explicit `border-[..] border-solid border-<color>`) and an explicit background; every border
   utility is paired with `border-solid` / `border-dotted`; headings and paragraphs get `m-0`.

## Tokens

| Utility | Value | Use |
| --- | --- | --- |
| `bg-ground` / `bg-surface` | #ffffff | Ground and cards. The phone is white. |
| `bg-ground-deep` | #f4f4f4 | Body behind the phone shell; segment track. |
| `bg-surface-sunk` / `bg-chart-idle` | #ececec | Sunk containers; progress track. |
| `text-ink` | #1d1d1d | Body text, titles, money. |
| `text-ink-mid` | #4a4a4a | Leader labels, quiet buttons, the header subtitle. |
| `text-ink-soft` | #66696a | Subtitles, notes, tile labels. Clears 4.5:1 on the tints, not just on white. |
| `text-ink-faint` | #929292 | Chevrons and placeholders only — fails AA for copy. |
| `text-on-dark` | #ffffff | Text on a brand-deep surface or darker. |
| `bg-brand` / `text-brand` | #00836c | Surface and money colour. Carries white at 4.71:1, so: chips, icons, dots. Never body text. |
| `bg-brand-deep` / `text-brand-deep` | #164c3f | The green that holds a paragraph, and the green that *is* text: totals, quiet links, the raised Ask Uday disc. |
| `bg-brand-night` | #0e3329 | Bottom stop of the call-screen gradient. |
| `bg-accent` / `text-accent` | #f58220 | Every action. Fills only — never small text on white. |
| `text-on-accent` | #1d1d1d | The label on a filled orange. White was 2.59:1 on it; this is 6.5:1. |
| `bg-accent-soft` | #fdf0e8 | Attention pill background; soft bar fill. |
| `text-accent-text` | #a94f08 | Small orange text: eyebrows, secondary button labels, attention pills. |
| `text-danger` / `bg-danger` | #b3261e | Refusals; the hang-up button. |
| `bg-danger-soft` | #fbe3e0 | Bad pill background. |
| `text-good` | #00836c | Alias of brand for "good" values. |
| `bg-tint-sage` | #e0f1eb | Mint card: money and position. |
| `bg-tint-sky` | #dff6f3 | Sky card: plans and projections. |
| `bg-tint-clay` | #fff3e7 | Peach card: the clock, anything wanting attention. |
| `bg-tint-ink` | #164c3f | The one hero card per screen, with `text-on-dark`. Aliases `brand-deep`. |
| `bg-legend-chip` | #e9fcfa | Neutral pill / section legend chip, with `text-brand-deep`. |
| `to-header-mint` | #bce3db | Bottom stop of the header slab gradient. |
| `from-nav-top` / `to-nav-bottom` | #2f8b78 → #0a6a58 | The tab bar gradient. A stop darker than the bank's, so 11px labels clear AA on it. |
| `bg-chart-hi` | #fa7401 | The one bar you are meant to look at, in a single-series chart. |
| `bg-chart-1` … `bg-chart-5` | see Charts | The categorical ramp: donut slices and allocation-bar segments. |
| `border-hairline` | orange 38% | Action and form cards; secondary button edge uses `border-accent`. |
| `border-hairline-mint` | #bbdbd6 | Neutral cards, dotted leader rules, header chips, customer rows. |
| `rounded-sm` / `-md` / `-lg` / `-pill` | 10 / 14 / 20 / 999px | Tiles / cards / header slab / buttons. |
| `shadow-card` | soft green | Phone shell, header slab. |
| `shadow-lift` | stronger green | Raised disc, portrait card. |
| `font-sans` | system stack | The only family. It is what renders ₹ reliably. |

## Layout invariants

- `.app` (in tokens.css, kept) is the phone: fixed `100dvh`, `overflow: hidden`, flex column,
  max 430px, white, `shadow-lift` at ≥480px. `.scroll` is the one scrolling region
  (`flex: 1 1 auto; min-height: 0`). Header, Segments and TabBar are `flex-none` siblings of
  `.scroll`, never absolutely positioned.
- Gutters `px-4` (16px), cards `p-4`, 12px between cards (Card carries its own `mb-3`; do not also
  wrap Card lists in `space-y-3`).
- Body 15px / 1.45. `h2` inside a Card is 18px/600 `text-ink` (Card styles it for you via
  `[&_h2]:…`). No letter-spaced caps except eyebrows and CTA labels.

## Component recipes (the exact strings in `src/components/ui.tsx`)

### Head — the header slab
```
header: flex flex-none items-start justify-between gap-3 rounded-b-lg bg-gradient-to-b from-white to-header-mint p-4 shadow-card
h1:     m-0 text-[26px] font-semibold leading-tight text-ink
sub:    mb-0 mt-1 text-sm text-ink-mid          (not ink-soft: the slab fades to mint under it)
```
Header chips (the `right` slot): white pills, `size-10 rounded-pill border border-solid border-hairline-mint bg-white grid place-items-center`, count badge `bg-accent text-white text-[10.5px] font-bold`.

### Card
```
base:      mb-3 min-w-0 rounded-md p-4 [&>*]:min-w-0 [&_h2]:m-0 [&_h2]:text-[18px] [&_h2]:leading-tight [&_h2]:font-semibold
default:   bg-surface border border-solid border-hairline-mint        (neutral content)
white:     bg-surface border border-solid border-hairline             (actions, forms)
sage/sky/clay: bg-tint-sage | bg-tint-sky | bg-tint-clay
ink:       bg-tint-ink text-on-dark                                   (the one hero card)
flat:      mb-3 min-w-0 bg-transparent px-0 py-4
```
Tinted cards also set `[--tile-a:var(--surface)] [--tile-b:var(--surface)]` so Tiles inside them
turn white. Section title as a legend chip at the top of a card:
`inline-flex rounded-pill bg-legend-chip px-[11px] py-[5px] text-xs font-semibold text-brand-deep`.

### Amount — one number leads each card
```
wrapper: flex min-w-0 items-baseline leading-none tracking-tight tabular-nums
xl 34px: text-[34px] font-bold      lg 28px: text-[28px] font-bold
md 22px: text-[22px] font-bold      sm 18px: text-[18px] font-semibold
fit:     text-[clamp(17px,6.2vw,22px)] font-bold           (half-width tiles)
cur:     mr-[0.06em] text-[0.55em] opacity-70              frac: text-[0.55em] opacity-70
```
Colour is inherited (ink by default, white on an ink card). Positive / "good" values may sit in
a `text-brand` wrapper.

### Segments — tabs inside a screen
```
track: mx-4 my-3 flex flex-none rounded-md bg-ground-deep p-1        role=tablist
pill:  absolute bottom-1 top-1 rounded-sm bg-accent, one span that slides on transform
cell:  relative z-[1] h-10 min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent px-1 text-sm font-semibold text-ink-mid transition-colors duration-200 aria-selected:text-on-accent
```

### Leader — label ··· value
```
row:   flex items-baseline gap-2 py-[7px] text-[15px] leading-snug
dot:   size-2 shrink-0 -translate-y-px rounded-pill  + (bg-brand | border-[1.5px] border-solid border-brand)
label: text-ink-mid                      total: font-semibold text-ink
rule:  flex-1 -translate-y-1 border-b-[1.5px] border-dotted border-hairline-mint
value: font-semibold tabular-nums text-ink   total: text-brand-deep
```
`filled` = committed figure (solid dot); `total` = the sum line (brand-green value).

### Bar — progress
```
track:   flex h-2 overflow-hidden rounded-pill bg-chart-idle
fill:    h-full bg-accent        soft: h-full bg-accent-soft     width via style={{ width: pct }}
```

### Charts — the categorical ramp

One series is orange in its grey track: `bg-chart-hi` on `bg-chart-idle`. That is the bank's own
chart and it is unchanged. Five *kinds* — asset classes, market caps, anything where the slices
are categories rather than degrees — use the ramp, which is new. The reasoning and the
colour-blindness check live in the comment above it in `tokens.css`; what you need at the keyboard
is below.

| Utility | Hex | On white | Takes | Asset class | Market cap |
| --- | --- | --- | --- | --- | --- |
| `chart-1` | #0d5f50 | 7.58:1 | `text-on-dark` | Equity | Large cap |
| `chart-2` | #0a90b4 | 3.71:1 | `text-ink` (4.54:1) | Debt | Mid cap |
| `chart-3` | #f5c04c | 1.68:1 | `text-ink` (10.1:1) | Balanced | Small cap |
| `chart-4` | #d1520f | 4.26:1 | `text-on-dark` (4.26:1 — ≥18px or 14px bold only) | Commodities | — |
| `chart-5` | #bcc3c4 | 1.79:1 | `text-ink` (9.4:1) | Others | Others |

**Assign by position, never by meaning.** Take them in order and give "Others" `chart-5` — so four
asset classes are 1 2 3 4 and three market caps are 1 2 3. Do not reach for a hue because it feels
like the category; that is exactly how the source app ended up with sky meaning Commodities on one
screen and Debt on another. Every pair in the ramp is separated far enough that order does not
matter, so a donut re-sorted by weight is safe.

- **Donut.** SVG arcs, `stroke-chart-N` with `fill="none"`, `stroke-width` about a third of the
  radius, and a **2° gap** between segments so the card shows through and each slice has an edge.
  `fill-*` and `stroke-*` resolve for these tokens, which is why they are named through `--color-*`.
- **Allocation bar.** A `flex h-2.5` (not `h-2` — at 8px the two light slices lose their hue) of
  `bg-chart-N` spans inside `overflow-hidden rounded-pill`. Segments total 100%, so the
  `bg-chart-idle` track is only visible on a bar that is deliberately partial.
- **Legend is not optional.** `chart-3` and `chart-5` are light on purpose, so a slice is read
  against its neighbours rather than against the page. Every chart gets a legend row — swatch,
  label, figure — and colour is never the only channel.
- Never use a ramp colour for a control, and never use `bg-accent` for a slice. Orange means
  "press this" everywhere else in the app; `chart-4` is deep enough not to be mistaken for it.

### Tiles — 2-column grid
```
grid:  grid grid-cols-2 gap-2.5 mt-4
tile:  min-w-0 overflow-hidden rounded-sm p-3 odd:bg-[color:var(--tile-a,var(--tint-sage))] even:bg-[color:var(--tile-b,var(--tint-clay))]
value: <Amount size="md" fit />         label: mt-1 text-xs text-ink-soft
```
On the white ground tiles alternate sage / clay; inside any tinted Card they read the card's
`--tile-a/--tile-b` and turn white. `tone="sage" | "clay" | "white"` forces one.

### Pill / badge
```
base:  inline-flex items-center gap-1 rounded-pill px-[11px] py-[5px] text-xs font-semibold
plain: bg-legend-chip text-brand-deep   warn: bg-accent-soft text-accent-text
bad:   bg-danger-soft text-danger        ok:   bg-brand text-on-dark
```

### Eyebrow
```
mb-2.5 mt-6 text-[11px] font-semibold uppercase tracking-wide text-accent-text
```

### Buttons — always a full pill, 44–48px, 15px semibold
```
primary:   h-12 w-full rounded-pill border-0 bg-accent px-5 text-[15px] font-semibold text-on-accent
secondary: h-11 rounded-pill border-[1.5px] border-solid border-accent bg-white px-3 text-[15px] font-semibold text-accent-text
quiet:     h-10 rounded-pill border-0 bg-transparent px-2 text-[15px] font-semibold text-brand-deep
           underline-offset-2 hover:underline      (Button's own `quiet` tone is the filled grey
           pill instead: bg-ground-deep text-ink-mid)
danger:    rounded-pill border-0 bg-danger-soft text-danger        (Button tone; the hang-up
           circle on Ask is the solid bg-danger text-white one)
on ink:    primary stays orange; secondary becomes border-white/40 text-on-dark bg-transparent
press:     transition-transform duration-100 active:scale-[0.985]   whitespace-nowrap
```
Never a dark-green filled button.

### Clock (`src/components/Clock.tsx`) — the peach attention card
```
card:    mb-3 min-w-0 rounded-md bg-tint-clay p-4 pb-3.5
eyebrow: text-[11px] font-semibold uppercase tracking-wide text-accent-text
date:    mt-0.5 text-[18px] font-semibold leading-tight tabular-nums text-ink
Reset:   quiet button (text-brand-deep)         +1 day / +1 week / +1 month: three identical secondary pills, flex-1
note:    mb-0 mt-3 text-xs leading-relaxed text-ink-soft
```

### TabBar (`src/components/TabBar.tsx`)
```
nav:    grid min-h-16 flex-none grid-cols-5 rounded-t-lg bg-gradient-to-b from-nav-top to-nav-bottom pb-[env(safe-area-inset-bottom,0px)] text-white
item:   flex min-w-0 flex-col items-center justify-end gap-1 border-0 bg-transparent px-1 pb-1.5 pt-2 text-white
icon:   lucide-react, size 22, strokeWidth 1.75 (Home, Route, IndianRupee, ScrollText)
label:  truncate text-[11px] leading-[14px]   active: font-bold, inactive: font-medium  (weight only, no colour change)
disc:   grid size-[60px] -translate-y-4 -mb-[22px] place-items-center rounded-pill border-4 border-solid border-white bg-brand-deep shadow-lift ring-2 ring-accent   (Video icon, size 26)
```

### Ask Uday (call screen)
Full bleed `bg-gradient-to-b from-brand-deep to-brand-night`; portrait card `rounded-lg shadow-lift`;
name `text-white text-[22px] font-bold`, bank line `text-white/70`; status pill
`bg-white/15 text-white`; Talk = primary orange pill full width; mute = `bg-white/20` circle;
end = `bg-danger` circle.

### Pick screen
White ground; eyebrow `text-accent-text`; title `text-[30px] font-bold text-ink`; customer rows
`rounded-md border border-solid border-hairline-mint bg-white` with a 44px initials disc
`size-11 rounded-pill bg-tint-sage text-brand-deep font-bold` and a chevron `text-ink-faint`; footer
note `text-sm text-ink-soft`.

## Do / don't

- Do lead each card with one number; everything else on the card is smaller than it.
- Do tell card kinds apart by tint, not by border weight or shadow. Cards are flat.
- Do use `text-accent-text` for any orange text under 16px bold. `text-accent` is for fills.
- Do keep `aria-*`, `role`, `aria-current` and `aria-selected` exactly as they are — the
  styling hooks off them (`aria-selected:bg-accent`) rather than off extra classes.
- Do keep dynamic values (`width: pct`, CSS variables) in `style={{}}`; nothing else belongs there.
- Do take the chart ramp in order and give "Others" `chart-5`. Picking a hue because it suits the
  category is how the same blue ends up meaning two different asset classes.
- Don't put a dark-green fill on a button. Green is a surface and a money colour.
- Don't add a sixth chart colour. Five is what the ramp was checked at; a sixth would have to be
  re-checked against all five, and the honest fix for a sixth category is to fold it into "Others".
- Don't use `text-ink-faint` for copy; it is for chevrons and placeholders.
- Don't add a legacy class from tokens.css to a component that uses utilities — it wins.
- Don't letter-space or uppercase anything except eyebrows and CTA labels.
- Don't load a web font. The system stack is the only one that renders ₹ everywhere.
- Don't position the TabBar absolutely; it is a flex sibling of `.scroll`.
