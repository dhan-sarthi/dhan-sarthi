# Design language — "a module inside IDBI GO Mobile+"

The web app must look like a screen the bank shipped, not a fintech demo bolted onto it. The
values below were sampled from GO Mobile+ App Store / Play Store captures and the IDBI logo.
Tokens live in `src/styles/tokens.css` (`:root`) and are exposed to Tailwind v4 through `@theme`
in `src/styles/app.css`, so every utility named here resolves without configuration.

Green and white, and nothing else. The reference this app is built against — HDFC's SmartWealth
— is navy and white and never reaches for a second hue: chrome, actions and surfaces are one
colour at different weights, and everything else is white, ink, or a state. This is the same idea
in IDBI's green. There is no orange, no warm tint and no decorative wash anywhere. Two colours are
not green and both earn it: `danger` is red because a refusal that is not red is not read as one,
and `ink` is near-black because body text is. One large number still leads each card.

## Three gotchas before you write a class

1. **`tokens.css` is imported unlayered**, so any legacy class (`.card`, `.btn`, `.pill`, ...)
   beats a Tailwind utility on the same element. Never mix a legacy class with utilities —
   drop the legacy class entirely. The legacy classes are being retired.
2. **Preflight *is* loaded**, whatever this file used to say. `app.css` imports
   `tailwindcss/preflight.css` into `layer(base)` and `tokens.css` says so above its own base
   rules; checked in the browser, a bare `<button>` has no border and no fill and an `h1` has no
   margin. Much of the tree therefore carries a defensive `border-0` / `m-0` that nothing needs.
   Leave those — they are correct, just belt and braces — and keep writing an explicit
   `border-solid` beside a width, because a border that silently draws as `none` is the one
   mistake here nobody spots in review.
3. **`.ds-press` sets `overflow: hidden`.** It has to, to keep the ripple inside the pill, and it
   clips anything reaching past the control's edge just as happily. A count badge on a corner, a
   raised card, the advisor disc: none of them can be a *child* of the pressable element. Make
   them a sibling and give the pressable one `relative z-[1]`.

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
| `bg-accent` / `text-accent` | #00735d | Every action, and small green text. 5.8:1 on white both ways. |
| `text-on-accent` | #ffffff | The label on a filled action. 5.8:1 — the orange this replaced managed 2.59:1. |
| `bg-accent-soft` | #e3f2ed | Attention pill background; soft bar fill. |
| `text-accent-text` | #00735d | Alias of `accent`. The split existed only because orange could not be both a fill and an ink. |
| `text-danger` / `bg-danger` | #b3261e | Refusals; the hang-up button. |
| `bg-danger-soft` | #fbe3e0 | Bad pill background. |
| `text-good` | #00836c | Alias of brand for "good" values. |
| `bg-tint-sage` | #eef6f3 | The one card tint. A card is white; a card that must step forward is this. |
| `bg-tint-sky` | #eef6f3 | Alias of `tint-sage`. The three tints collapsed to one when the palette did. |
| `bg-tint-clay` | #eef6f3 | Alias of `tint-sage`. No warm tint exists any more. |
| `bg-tint-ink` | #164c3f | The one hero card per screen, with `text-on-dark`. Aliases `brand-deep`. |
| `bg-legend-chip` | #eef6f3 | Neutral pill / section legend chip, with `text-brand-deep`. |
| `to-header-mint` | #dfeee9 | Bottom stop of the header slab gradient. |
| `from-nav-top` / `to-nav-bottom` | #2b8271 → #0a6a58 | The tab bar gradient. The top stop is darker than the bank's so 11px white labels clear AA — measured at 4.63:1, where the previous stop was 4.13:1 and did not. |
| `bg-chart-hi` | #00735d | The one bar you are meant to look at, in a single-series chart. |
| `bg-chart-1` … `bg-chart-5` | see Charts | The categorical ramp: donut slices and allocation-bar segments. |
| `border-hairline` | green 26% | Action and form cards; secondary button edge uses `border-accent`. |
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
- **Do not assemble that by hand — use `Screen` (`src/components/Screen.tsx`).** It is the
  invariant above, made the only way the pieces fit together:
  `header · notice · tabs · .scroll · footer · after`. `onRefresh` wraps the scroller in
  `PullToRefresh`; `footer` is the sticky bar (`Sheet`'s footer recipe, pinned to a screen);
  `after` is where sheets go, and they must, because a `position: fixed` panel inside the
  scroller's entrance transform positions against the transform instead of the viewport.
- **The card that overlaps the header** is `Screen`'s `scrollHeader` + `overlap`, with
  `Head overlap`. It cannot be done with a `flex-none` header — the card would have to hang out
  of `.scroll`, and `overflow-y: auto` clips at the padding box — so the bar moves inside the
  scroller and scrolls away with the content, which is what the reference does too. Opt in; the
  four re-homed screens do not.
- Gutters `px-4` (16px), cards `p-4`, 12px between cards (Card carries its own `mb-3`; do not also
  wrap Card lists in `space-y-3`).
- Body 15px / 1.45. `h2` inside a Card is 18px/600 `text-ink` (Card styles it for you via
  `[&_h2]:…`). No letter-spaced caps except eyebrows and CTA labels.

## Component recipes (the exact strings in `src/components/ui.tsx`)

### Head — the app bar. Three variants, one slab
```
slab:    flex flex-none items-start justify-between gap-3 rounded-b-lg bg-gradient-to-b from-white to-header-mint px-4 pt-4 pb-4 shadow-card
default: h1 m-0 text-[26px] font-semibold leading-tight text-ink
         sub mb-0 mt-1 text-sm text-ink-mid    (not ink-soft: the slab fades to mint under it)
back:    items-center · IconButton tone="bordered" with ArrowLeft 18/2.3 · h1 truncate text-[20px]
         font-semibold · sub mt-0.5 text-[13px] text-ink-mid
greeting: items-center · size-10 rounded-pill bg-tint-sage text-[15px] font-bold text-brand-deep
         initials disc · h1 "Hi, <name>" at 20px
overlap: pb-[68px] instead of pb-4, for the card that starts up inside the slab
```
Trailing actions (`right`) are 0–2 `IconButton`s; `Head` lays them out in a
`flex flex-none items-center gap-2`. Do not wrap them yourself.

### IconButton — a glyph with a tap target
```
base:     ds-press grid flex-none place-items-center rounded-pill disabled:opacity-40
sizes:    sm size-9 · md size-10 · lg size-11
grey:     border-0 bg-ground-deep text-ink-mid            (sheet close, stepper)
bordered: border border-solid border-hairline-mint bg-white text-ink   (header chips)
ghost:    border-0 bg-transparent text-inherit            (on a dark surface)
danger:   border-0 bg-danger-soft text-danger
count:    a sibling span, -right-0.5 -top-0.5, h-[17px] min-w-[17px] rounded-pill bg-accent
          px-1 text-[10.5px] font-bold text-on-accent     (sibling, not child — gotcha 3)
```
`label` is required and becomes `aria-label`. There is no other accessible name.

### TextLink — a word you can press
```
ds-press inline-flex h-10 shrink-0 items-center gap-1 rounded-pill border-0 bg-transparent
px-2 font-semibold text-brand-deep underline-offset-2 hover:underline disabled:opacity-60
md text-[15px] · sm text-sm · flush px-0 (aligns with the paragraph above it)
```
A link is `brand-deep`, not `accent`: `accent` means "this is the action" and a link must not compete with a primary
button. `brand-deep`, not `brand` — 9.8:1 against 4.71:1.

### ListRow — one row of a list
```
row:   flex min-h-[68px] w-full items-center gap-3 border-0 bg-transparent py-3 text-left
tile:  size-10 rounded-sm bg-legend-chip text-brand-deep grid place-items-center   (22px glyph)
title: text-[15px] font-semibold text-ink      sub: mt-0.5 text-[13px] text-ink-soft
badge: rounded-pill bg-legend-chip px-2.5 py-1 text-xs font-bold text-brand-deep
```
68px, which is SmartWealth's list height and the one to hold. Pressable rows get `ds-press` and a
`ChevronRight 18/2.2 text-ink-faint`; a row with no `onClick` gets neither. Group rows under a
full-bleed band: `-mx-4 bg-ground-deep px-4 py-2.5` carrying the eyebrow type.

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

### Segments — tabs inside a screen. Two variants
```
pill (default, 2–3 cells, an in-screen switch)
track: mx-4 my-3 flex flex-none rounded-md bg-ground-deep p-1        role=tablist
pill:  absolute bottom-1 top-1 rounded-sm bg-accent, one span that slides on transform
cell:  relative z-[1] h-10 min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent px-1 text-sm font-semibold text-ink-mid transition-colors duration-200 aria-selected:text-on-accent

underline (4 cells, SmartWealth's screen-level tab row)
row:   flex flex-none overflow-x-auto border-0 border-b-[1.5px] border-solid border-hairline-mint bg-surface px-4
cell:  ds-press -mb-[1.5px] h-11 flex-none whitespace-nowrap border-0 border-b-[3px] border-solid border-transparent bg-transparent px-3 text-[15px] font-semibold text-ink-mid first:pl-0 last:pr-0 aria-selected:border-accent aria-selected:font-bold aria-selected:text-accent-text
```
The underline row scrolls and its cells size to their text, because four labels do not fit a
375px phone as equal quarters. That is also why the indicator is a border on each cell rather
than one span that slides: a sliding span has to be measured, and there is nothing to measure
against once the row can be scrolled out from under it.

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

One series is green in its grey track: `bg-chart-hi` on `bg-chart-idle`. That is the bank's own
chart and it is unchanged. Five *kinds* — asset classes, market caps, anything where the slices
are categories rather than degrees — use the ramp, which is new. The reasoning and the
colour-blindness check live in the comment above it in `tokens.css`; what you need at the keyboard
is below.

| Utility | Hex | On white | Takes | Asset class | Market cap |
| --- | --- | --- | --- | --- | --- |
| `chart-1` | #022a21 | 17.4:1 | `text-on-dark` | Equity | Large cap |
| `chart-2` | #005a46 | 8.3:1 | `text-on-dark` | Debt | Mid cap |
| `chart-3` | #009474 | 3.4:1 | `text-on-dark` (≥18px or 14px bold) | Balanced | Small cap |
| `chart-4` | #5cc2a6 | 1.9:1 | `text-ink` (8.8:1) | Commodities | — |
| `chart-5` | #d6ece4 | 1.3:1 | `text-ink` (13.6:1) | Others | Others |

**Assign by position, never by meaning.** Take them in order and give "Others" `chart-5` — so four
asset classes are 1 2 3 4 and three market caps are 1 2 3. Do not reach for a hue because it feels
like the category; that is exactly how the source app ended up with sky meaning Commodities on one
screen and Debt on another. Every pair in the ramp is separated far enough that order does not
matter, so a donut re-sorted by weight is safe.

- **Donut** (`charts/DonutChart.tsx`). Filled annulus sectors, `fill-chart-N`, 138px outer / 68px
  inner (the measured 0.49 ratio, held at every size), first slice starting at **3 o'clock** and
  running clockwise, square-cut ends, a **2px gap** on each boundary — about 2° at 138px — so the
  card shows through and each slice has an edge. `fill-*` and `stroke-*` resolve for these tokens,
  which is why they are named through `--color-*`.
- **Allocation bar** (`charts/Bars.tsx` → `SegmentedBar`). A `flex h-2.5` (not `h-2` — at 8px the
  two light slices lose their hue) of `bg-chart-N` spans inside `overflow-hidden rounded-pill`.
  Segments total 100%, so the `bg-chart-idle` track is only visible on a bar that is deliberately
  partial. `BarList` beside it is the other shape: a stack of *independent* 12px pill bars, one
  per row, label and bold figure above each.
- **The whole is a decision, not the sum.** Every one of them takes `total`. Omit it for
  quantities and the sum is the whole; pass `total={100}` when the values are already
  percentages, and a series that sums to 95 then draws 95% of a ring with the rest in
  `bg-chart-idle`, instead of quietly restating 60/20/10/05 as 63/21/11/5. Nothing overdraws: a
  series summing past its total falls back to proportions of itself.
- **Legend is not optional.** `chart-3` and `chart-5` are light on purpose, so a slice is read
  against its neighbours rather than against the page. Every chart gets a legend row — swatch,
  label, figure — and colour is never the only channel.
- Never use a ramp colour for a control, and never use `bg-accent` for a slice. The action green means
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
on ink:    primary stays the action green; secondary becomes border-white/40 text-on-dark bg-transparent
press:     transition-transform duration-100 active:scale-[0.985]   whitespace-nowrap
```
Never a dark-green filled button.

### Clock (`src/components/Clock.tsx`) — the attention card
```
card:    mb-3 min-w-0 rounded-md bg-tint-clay p-4 pb-3.5
eyebrow: text-[11px] font-semibold uppercase tracking-wide text-accent-text
date:    mt-0.5 text-[18px] font-semibold leading-tight tabular-nums text-ink
Reset:   quiet button (text-brand-deep)         +1 day / +1 week / +1 month: three identical secondary pills, flex-1
note:    mb-0 mt-3 text-xs leading-relaxed text-ink-soft
```

### TabBar (`src/components/TabBar.tsx`) — Discover · Dashboard · (Ask) · Plan · More
```
nav:    grid min-h-[68px] flex-none grid-cols-5 rounded-t-lg bg-gradient-to-b from-nav-top to-nav-bottom pb-[env(safe-area-inset-bottom,0px)] text-white
cell:   relative flex min-w-0                                    (a wrapper, not the button)
item:   ds-press relative z-[1] flex min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-lg border-0 bg-transparent px-1 pb-1.5 pt-2
card:   pointer-events-none absolute inset-x-1 -top-2 bottom-1 rounded-lg bg-surface shadow-lift
        active scale-100 opacity-100 · inactive scale-90 opacity-0, 200ms
icon:   lucide-react, size 22, strokeWidth 1.75 → 2.3 when active (Compass, LayoutGrid, Route, Menu)
label:  truncate text-[11px] leading-[14px]   active: font-bold, inactive: font-medium
ink:    active text-accent-text (on the white card) · inactive text-white (on the gradient)
disc:   ds-press grid size-[60px] -translate-y-4 -mb-[22px] place-items-center rounded-pill border-4 border-solid border-white bg-brand-deep shadow-lift ring-2 ring-accent   (Video icon, size 26)
```
Two lifted shapes and they mean different things: the disc is a destination that is always there,
the card is *where you are*. Both are siblings or self-pressable rather than children of a
`.ds-press` button — see gotcha 3. The active item used to be told by weight alone, which was
right while both states were white on green; once it moves onto a white card it needs an ink that
survives there, and `text-accent` is 2.6:1 on white where `accent-text` is 5.5:1.

### Ask Uday (call screen)
Full bleed `bg-gradient-to-b from-brand-deep to-brand-night`; portrait card `rounded-lg shadow-lift`;
name `text-white text-[22px] font-bold`, bank line `text-white/70`; status pill
`bg-white/15 text-white`; Talk = primary green pill full width; mute = `bg-white/20` circle;
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
- Don't position the TabBar absolutely; it is a flex sibling of `.scroll`. Don't hand-assemble a
  screen either — `Screen` exists so that ordering cannot be got wrong twice.

## Spot illustration (`src/components/Art.tsx`)

Six marks, one system. Flat vector, the green ladder and nothing else, drawn on transparency:

| Name | Where |
| --- | --- |
| `jar-create` | SmartJars, the "set a new target" promo card |
| `empty-jars` | SmartJars, nothing on the route accumulates yet |
| `empty-commitments` | Commitments, nothing in the statements repeats yet |
| `rebalance-balance` | (light grounds — currently unused; keep for a white rebalance surface) |
| `rebalance-balance-dark` | Rebalancing, the hero on `tint-ink` |
| `profile-result` | Investment profile, the computed result |
| `order-recorded` | Order placed |
| `hero-holdings` | Dashboard · Overview, beside the "What you hold" total |
| `hero-plan` | Plan, the "Where you are going" hero |

Rules:

- **Pick by ground.** The marks are drawn in the dark end of the ladder and read on white; they
  vanish on `tint-ink`. The `-dark` variant is drawn in the light end for that one case. Verified
  at 0% of pixels below 1.6:1 against `#164c3f`.
- **The two `hero-` marks are landscape** and sized by height (80px), not by the square steps.
  They sit *beside* a headline number rather than above copy, so they find their own width.
- **Three sizes only** for the square marks — `sm` 80px, `md` 128px, `lg` 160px. A mark at an arbitrary width on each
  screen stops reading as a system. The files are 512px square, 2x the largest step.
- **Always decorative.** Every mark sits beside copy that already says the same thing, so each is
  `alt=""` and `aria-hidden`. Never let one carry a meaning on its own.
- **Never a substitute for an empty state's words.** The illustration is why the screen feels
  finished; the sentence underneath is why it is useful.
- Files are quantised to a 48-colour palette — flat art, so it is lossless in practice: 4.2 MB of
  source became 46 KB shipped.

## Illustrated icons (`public/icons`)

Two sets in one folder and one style. **Fourteen product-category icons**, one per category the
shelf carries, rendered at 56px in the Discover grid by `screens/invest/CategoryGrid.tsx`. **Ten
`goal-*` icons** — the eight dreams the jar catalogue offers plus `goal-buffer` and `goal-debt` for
the two pots the plan opens itself — used by `screens/goals/**` at three sizes: inside the jar on a
catalogue tile, on the plate of a create-form carousel card, and on the 44px tile of a jar card and
the 48px thumbnail in a jar's app bar. Both sets follow the rules below without exception.

**They carry more colour than the rest of the app, and that is the rule, not an exception.** The
chrome is one green; the illustration is where a bank is allowed to be warm. The reference makes
the same split — SmartWealth's brand is navy and white, and its Explore grid is gold, coral, green
and violet. An app whose *icons* are monochrome reads as a wireframe however good its tokens are.

What keeps fourteen of them looking like one set:

- **Green is the constant.** Every icon is built from the green ladder (`#164c3f` → `#d6ece4`).
- **One accent per icon, and only as a highlight** — roughly a tenth of the artwork. The four
  accents in use are gold `#e0a33a`, coral `#e2705a`, sky `#4aa8d8`, violet `#8a6fd0`. Adding a
  fifth is a design decision, not an implementation detail.
- **No black.** The darkest value is `#0d3b30`.
- Filled, softly dimensional, chunky enough to read at 56px. No gloss, no hard gradient, no
  drop shadow.

The app frames them; the file does not. Icons are drawn on transparency with no tile, circle or
card behind them, because `CategoryGrid`, `ListRow` and `goals/JarMark` supply that.

**They are drawn for a light ground, and that is what makes one file serve every placement.** The
jar catalogue is a dark surface, so the jar's glass is filled pale and the icon sits inside it
rather than in a hole cut through the outline — see the note in `screens/goals/JarMark.tsx`. Do not
generate a `dark`-kind variant of an icon that already exists; light the container instead.

Files are 224px (4x the 56px render) quantised to 64 colours: 21 MB of source, 125 KB shipped.
