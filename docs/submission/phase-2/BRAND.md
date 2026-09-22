# Deck design direction

The deck should look like the app. Same palette, same restraint, same type discipline.
A judge who sees a slide and then the app should not notice the seam.

## Palette

Lifted verbatim from `packages/design/tokens.json`, which is the app's single source of
truth. **Do not introduce a colour that is not on this list.**

| Token | Hex | Use in the deck |
|---|---|---|
| `ink` | `#0E3329` | All body text. Dark section backgrounds. The darkest thing on any slide |
| `brand` | `#016A4D` | IDBI green. Hero panels, the one emphasis per slide, chart series 1 |
| `brandDeep` | `#01513B` | Pressed/darker variant, gradient ends |
| `ground` | `#F6F2EA` | **The default slide background.** Warm cream, never white |
| `groundDeep` | `#EFE9DE` | Secondary panels, table row banding |
| `surface` | `#FFFFFF` | Cards sitting on the cream ground |
| `success` | `#D6EC8C` | Pale lime. "Passed all 9" chips, positive deltas |
| `streak` | `#E8B54A` | Amber. Chart series 2, "attention" without alarm |
| `budget` | `#A8C9B5` | Muted sage. Chart series 3, secondary fills |
| `danger` | `#B3261E` | **Only** for the refusal and for negative money. Never decorative |
| `dangerSoft` | `#FBE3E0` | The "Not suitable · rule N of 9" chip background |
| `hairline` | `rgba(14,51,41,0.12)` | Every rule, divider and table border |

**The rule that makes it look like the app:** the ink never changes, the surface under it
does. A slide is cream with dark-green text, or dark-green with cream text. Not both at once.

`danger` red appears on **at most two slides** in the whole deck — the refusal on slide 2
or 6, and the refusal again on slide 13. Its scarcity is why it lands.

## Type

The app uses the system stack, on purpose, so the ₹ glyph always renders. For the deck use
**Inter** (or the system UI stack) — a geometric grotesque with real weight contrast. The
app's seven roles map onto slides like this:

| Role | Size (app) | Deck equivalent |
|---|---|---|
| `display` | 32 / 700 | Slide titles — set them **large and tight**, weight 700, leading ≈1.1 |
| `title` | 26 / 700 | Section headings inside a slide |
| `heading` | 19 / 650 | Card titles, table headers |
| `body` | 15 / 400 | Body copy. Never below 14pt on a slide |
| `label` | 13 / 500 | Chip text, axis labels |
| `caption` | 11 / 500 | Sources, disclaimers, the footer band |

Numbers are the point of this product. **Set every figure in the heaviest weight on the
slide** — `₹34,65,599` should read before the sentence around it does. Indian digit
grouping throughout (`₹1,86,240`, not `₹186,240`), and the ₹ sign never separated from its
number by a line break.

## Layout

- **Cream ground, generous margins, one idea per slide.** If a slide has two ideas, it is
  two slides
- **One emphasis per slide.** One thing in `brand` green or at display size. Everything
  else is ink on cream
- Phone screenshots go in a **thin, neutral device frame** — a 1px hairline rounded
  rectangle, radius ~28px, no glossy bezel, no drop shadow, no perspective tilt. The
  screenshots are 390×844 @2x (780×1688 actual) so they hold up at full-bleed height
- Tables: hairline rules only. No filled header row, no zebra stripes darker than
  `groundDeep`
- **Never** a stock photo, a gradient mesh, a 3D icon, or a generic "AI brain" graphic.
  The app has real photographic onboarding art — if the deck needs a human face, take it
  from `assets/onboarding/01-welcome.png`

## Tone check

Before a line goes on a slide, test it against the product's own copy rule:
**say the thing, then the reason, in as few words as possible.**

Banned in the deck as in the app: *seamless, leveraging, empowering, revolutionary,
game-changing, holistic, which is why, cutting-edge*, and any jargon a customer would not
use — *envelope, deployable surplus, DPD*. The app's own copy is the style guide; when in
doubt, quote the app.
