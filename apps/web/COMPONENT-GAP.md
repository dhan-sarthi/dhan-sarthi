# Component gap — SmartWealth's 33 against what `apps/web` already has

`../../smartwealth-reference/spec/02-DESIGN-SYSTEM.md` lists 33 components that three or more
of the fourteen independent agents named while reading SmartWealth's videos. That convergence is
what makes them the system rather than one screen's furniture, so they are the build list.

This file says, for each of them, whether we already have it. Every verdict was reached by
reading the component, not by matching a filename — `Leader` sounds nothing like `LegendRow` and
is nearly it; `Tile` sounds like `IconTile` and is not it at all.

**9 exist. 13 have something close that needs extending. 11 are net-new.**

Rows marked **Built** were closed by a later step and say which. Everything else still reads as
step 1 left it.

Verdicts mean:

- **Exists** — usable as it stands, or with a prop. Do not rebuild it.
- **Extend** — the shape is already in the tree, sometimes hand-rolled in two or three places.
  Lift it or add a variant. The named file is where the working code is.
- **New** — nothing in the tree does this job.

Names in `code` are exports from `src/components/`; everything else is an inline block in a
screen, which is exactly why it needs extracting.

---

## Chrome — 0 exist · 5 extend · 1 new  ·  *4 built by step 2 (the shell)*

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `AppBar` | **Built** (step 2) | `Head` in `src/components/ui.tsx` | Three variants on the one slab: default, `onBack` (arrow + 20px title + 0–2 trailing actions) and `greeting` (initials disc + "Hi, <name>"). The overlap trick is `Screen`'s `scrollHeader`+`overlap` with `Head overlap` — see below; it needed the bar to scroll, not a recolour. |
| `BottomNav` | **Built** (step 2) | `src/components/TabBar.tsx` — Discover · Dashboard · (Ask) · Plan · More | Both raises, merged rather than swapped: the centre disc stays the advisor and the other four get the reference's lifted white card. The dot indicator is gone — the card replaces it. Active ink is `accent-text`, because weight alone stops working once the item is on white. |
| `StatusBar` | **New** | nothing | The 34pt OS band. On web this is `env(safe-area-inset-top)` padding on the shell, not a component with content. `TabBar` and `Sheet` already handle the bottom inset; the top is unhandled. |
| `SegmentedTabs` | **Built** (step 2) | `Segments` in `ui.tsx`, `variant="pill" \| "underline"` | The underline row scrolls and sizes cells to their text, so four labels fit a 375px phone; its indicator is a border per cell rather than a sliding span, which cannot be measured in a scroller. Dashboard uses it; Record keeps the pill. |
| `FilterChipRow` | **Extend** | the category filter in `Recent` (`src/screens/Money.tsx`) — horizontally scrolling `aria-pressed` pills, orange when on | Working code, never extracted. Lift it verbatim; it is already the right shape. |
| `StickyFooterBar` | **Built** (step 2) | `Screen`'s `footer` prop (`src/components/Screen.tsx`), same recipe as `Sheet`'s | Nothing. Step 3 is its first caller — every screen of the transaction spine hangs its CTA off it, which is what it was lifted for. |

## Actions — 3 exist · 2 extend · 0 new  ·  *both extends built by step 2*

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `PrimaryButton` | **Exists** | `Button tone="primary"` in `ui.tsx` — orange pill, `text-on-accent`, ripple, `busy` spinner | Nothing. Note it is a full pill, not SmartWealth's 8px rectangle — conflict 1, already decided. |
| `OutlinedButton` | **Exists** | `Button tone="secondary"` — white fill, 1.5px `border-accent`, `text-accent-text` | Nothing. |
| `SecondaryButton` | **Exists** | `Button tone="quiet"` — filled `bg-ground-deep`, `text-ink-mid` | Nothing. This is the filled-tonal button; `tone="secondary"` is the outlined one. |
| `IconButton` | **Built** (step 2) | `IconButton` in `ui.tsx`; all five copies replaced — `Sheet`, `Stepper`, `QueueCard`, the header chips (now Dashboard's) and `HoldingsSheet`'s delete | Nothing. Sizes sm/md/lg = 9/10/11, tones grey / bordered / ghost / danger, optional count. `label` is required, which is the half of it that was actually broken. |
| `TextLink` | **Built** (step 2) | `TextLink` in `ui.tsx`; the two named copies plus a third in `App.tsx`'s gate | Nothing. `brand-deep` everywhere — two of the three were `brand`, which is 4.71:1 against 9.8:1. `flush` drops the side padding where the link has to line up with a paragraph. |

## Input — 2 exist · 1 extend · 2 new

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `OutlinedTextField` | **Exists** | `TextInput` + `Field` + `MoneyInput` in `src/components/Form.tsx` — 48px, hairline border, `focus:border-accent`, label and hint | Nothing. `MoneyInput` already groups Indian digits as you type. |
| `Checkbox` | **Built** (step 3) | `Checkbox` in `src/components/Form.tsx` | Nothing. The whole row is the target rather than the 20px box, because a 20px tap target is one a thumb misses. Used for the cart's terms line and its per-line include control. |
| `OtpInput` | **Built** (step 3) | `src/components/OtpInput.tsx` | Nothing. **One** `<input maxLength={6} autoComplete="one-time-code">` laid transparently over six presentational cells — six real inputs breaks paste, SMS autofill and backspace, and announces six unlabelled fields. The digits are shown rather than masked; the source's `*` is a mock artefact and its own spec says so. |
| `RiskSlider` | **Extend** | a bare `<input type="range">` in two places: `src/screens/Plan.tsx` (assumed return) and `src/screens/GoalSheet.tsx` (target amount, `h-11` for thumb reach) | Both already use `accent-accent`. Wrap once, with ticks, end labels and a value read-out. Keep the 44px minimum. |
| `BottomSheet` | **Exists** | `src/components/Sheet.tsx` | Nothing — and do not reimplement it. It has the scrim, Escape, a real Tab trap, focus return, and an exit animation that survives unmount. Every editing surface in SmartWealth is a sheet; they all get this one. |

## Data display — 2 exist · 4 extend · 3 new

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `ListRow` | **Extend** — canonical one exists | `ListRow` in `ui.tsx` (step 2, at 68px, built for the More menu) | The component is there; the two copies are **not** collapsed onto it yet. Statement rows in `Recent` (`src/screens/Money.tsx`) and `ProbeRow` in `src/screens/Onboarding.tsx` still hand-roll it at ~54px. Lift them when the screen they are on is next touched. |
| `StatCard` | **Exists** | `Tile` in `ui.tsx` — `Amount size="md" fit`, label under, alternates sage/clay, turns white inside a tinted card | Nothing. This is StatCard with a better name. |
| `FundRow` | **New** | nothing — `AccountCard` (`src/screens/Money.tsx`) is a card, not a row | Fund logo, name, category chip, NAV, return %, chevron. Build it on the extracted `ListRow`; it is the row every fund list in Discover is made of. **Step 3 deliberately did not**: the shelf list into the transaction spine (`src/screens/invest/ShelfList.tsx`) is the canonical `ListRow`, because this app computes no NAV, no returns and no rating, and five invented metrics a row is not density. Step 5 owns it, with the data. |
| `GoalCard` | **Extend** | `StageCard` in `src/screens/Plan.tsx` (pills, title, expand-for-why) and the goal summary block in `src/screens/GoalSheet.tsx` (target, by-year, monthly, reachable) | Neither has a progress ring or the status footer band. Merge the two and add both. |
| `ProgressBar` | **Exists** | `Bar` in `ui.tsx` — 8px, `bg-chart-idle` track, two segments, animated on `transform` not `width` | Exists for one-or-two segments. Allocation bars need *n* segments from the chart ramp — add a `segments` variant rather than a second component, and read the comment above `Bar` first: the reason it positions absolutely instead of flexing is a bug that drew every bar at `u²/100`. |
| `DonutChart` | **New** | nothing. The only SVG in the tree is three icons in `src/screens/Ask.tsx` | SVG arcs, `stroke-chart-N`, `fill="none"`, 2° gaps, centre slot for a total. See the Charts section of `DESIGN.md`. |
| `LegendRow` | **Extend** | `Leader` in `ui.tsx` — dot, label, dotted rule, value | Very close, and the dot is already there. SmartWealth's legend is a square-ish swatch, a label, a percentage *and* an amount, with no dotted rule. Add a `legend` variant taking a ramp colour. |
| `AllocationCard` | **New** | nothing | A card composing `DonutChart` + `LegendRow` + a segmented `Bar`. Blocked on those three; build it last of the four. |
| `ProfileCard` | **Extend** | the customer rows in `src/screens/Pick.tsx` — mint-hairline card, 44px `bg-tint-sage` initials disc, chevron | The disc, the row and the chevron are done. Needs the KYC/risk-profile metadata line and the status band. |

## Signals — 2 exist · 1 extend · 5 new

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `StatusPill` | **Exists** | `Pill` in `ui.tsx` — `plain` / `warn` / `bad` / `ok`, which map onto SmartWealth's On Track / In Process / Needs Attention / Success | Nothing. But see the note below: SmartWealth's *primary* status treatment is a band, not a pill. |
| `TagChip` | **Exists** | `Pill tone="plain"` | Nothing. |
| `RibbonBadge` | **New** | nothing | "Recommended" as a corner tab clipped into a card's top-left edge, not a badge floating in the padding. `accent-soft` fill with `accent-text` ink is the IDBI reading of their gold; do not add a gold token for it. |
| `InfoBanner` | **Built** (step 3) | `src/components/InfoBanner.tsx`; `OfflineBadge` is now three lines on top of it | Three tones (clay / sage / danger), each pairing the tint with the ink that clears AA on it, plus an optional inline action. It goes in `Screen`'s `notice` slot. `mostlyNameless` in `src/screens/Money.tsx` is still a second, inline instance and should be lifted when that screen is next touched. |
| `PromoCard` | **New** | nothing | |
| `PromoBanner` | **New** | nothing | Distinct from `PromoCard`: full-bleed, in the scroll, usually a carousel. |
| `IconTile` | **New** | nothing. `Tile` is a value-and-label stat tile, not a launcher | Glyph over a short label, in a 3- or 4-up grid. The 32px category disc in `Recent` is the glyph half of it. |
| `RatingStar` | **New** | nothing | Fund ratings, 1–5, half-stars. Never colour-only: give it a numeric label. |

---

## Three things the list of 33 misses, and one screen needs them

`02-DESIGN-SYSTEM.md` names these under "patterns worth stealing" rather than as components, but
they are components once you build them, and all three are net-new here.

- **`StatusBand`** — the full-bleed tinted strip clipped to a card's *footer*, which is how
  SmartWealth actually shows state down a list. `Pill` is the floating version and we have it;
  the band we do not. This is the more distinctive of the two and probably the more used.
- **`AmountInWords`** — **Built by step 3**, as `words` and `inWords` in `src/lib/money.ts` plus a
  line of markup in `AddSchemeInvest`. Indian grouping, not western: 1,22,841 is "One Lakh Twenty
  Two Thousand Eight Hundred Forty One", never "One Hundred Twenty Two Thousand …", and past
  ninety-nine crore it keeps counting crores rather than reaching for arab. It is not decoration —
  ₹50,000 and ₹5,00,000 look alike at a glance and read nothing alike, and this is the only place
  a customer catches the extra zero.
- **The card that overlaps the header** — a layout affordance rather than a component, but it is
  what makes SmartWealth's chrome read as a backdrop. **Built by step 2** as `Screen`'s
  `scrollHeader` + `overlap`, against the IDBI header slab. It could not be done with a
  `flex-none` header at all — the card has to hang out of `.scroll`, which clips it — so the bar
  moves inside the scroller and scrolls away, which is what the reference does. `Discover` is the
  only screen taking it today.

## Order

`DonutChart` → `LegendRow` → segmented `Bar` → `AllocationCard` is the one hard chain, and all four
depend on the chart ramp, which now exists.

**That chain is built**, in `src/components/charts/` — `DonutChart`, `LegendRow`, `SegmentedBar`
and `BarList`, `AllocationCard` (which carries `RibbonTab`, the `RibbonBadge` of the Signals
section) and `AllocationCompare`. They all draw one model, `charts/series.ts`, and three things
about it are worth knowing before you use them. Colour is assigned by position and "Others" is
always the grey, so nothing picks a hue for a category. `total` is the whole: omit it and the sum
is the whole, pass `100` for values that are already percentages, and a series that sums to 95
draws a visible 5% hole rather than restating every figure. And the states the source never showed
— empty, a single slice, and a long tail folded into "Others" — are all in there.

`Bar` in `ui.tsx` is deliberately untouched: it is still the single-series envelope bar, and the
categorical ones are their own components rather than a variant of it. Everything else in the **Extend** column can be lifted
independently and should be, before any screen is built on a copy of it.

Step 2 took the chrome half of that column — `AppBar`, `BottomNav`, `SegmentedTabs`,
`StickyFooterBar` — plus `IconButton` and `TextLink`, whose five and three copies are now one
each. Step 3 took `Checkbox`, `OtpInput`, `InfoBanner` and `AmountInWords`, which is everything
the transaction spine needed that did not already exist.

What is still open in **Extend**: `FilterChipRow`, `RiskSlider`, `GoalCard`, `ProfileCard`, and
the two `ListRow` copies that a canonical `ListRow` now exists to absorb. Still **New**:
`StatusBar`, `FundRow`, `PromoCard`, `PromoBanner`, `IconTile`, `RatingStar` and `StatusBand`.
