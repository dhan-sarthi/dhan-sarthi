# Component gap — SmartWealth's 33 against what `apps/web` already has

`../../smartwealth-reference/spec/02-DESIGN-SYSTEM.md` lists 33 components that three or more
of the fourteen independent agents named while reading SmartWealth's videos. That convergence is
what makes them the system rather than one screen's furniture, so they are the build list.

This file says, for each of them, whether we already have it. Every verdict was reached by
reading the component, not by matching a filename — `Leader` sounds nothing like `LegendRow` and
is nearly it; `Tile` sounds like `IconTile` and is not it at all.

**9 exist. 13 have something close that needs extending. 11 are net-new.**

Verdicts mean:

- **Exists** — usable as it stands, or with a prop. Do not rebuild it.
- **Extend** — the shape is already in the tree, sometimes hand-rolled in two or three places.
  Lift it or add a variant. The named file is where the working code is.
- **New** — nothing in the tree does this job.

Names in `code` are exports from `src/components/`; everything else is an inline block in a
screen, which is exactly why it needs extracting.

---

## Chrome — 0 exist · 5 extend · 1 new

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `AppBar` | **Extend** | `Head` in `src/components/ui.tsx` — white→mint slab, title, optional sub, a `right` slot | No back affordance and no compact variant. Palette-map conflict 2 is here: SmartWealth's navy bar is load-bearing because cards overlap up into it. That trick has to be rebuilt against `brand-deep`, not recoloured. |
| `BottomNav` | **Extend** | `src/components/TabBar.tsx` — five tabs, gradient bar, raised centre disc, dot indicator, ripple | SmartWealth is three tabs and the *active* one sits in a raised white card. Ours raises a fixed centre item instead. The bar, the gradient and the flex-sibling rule all stay; the raise moves. |
| `StatusBar` | **New** | nothing | The 34pt OS band. On web this is `env(safe-area-inset-top)` padding on the shell, not a component with content. `TabBar` and `Sheet` already handle the bottom inset; the top is unhandled. |
| `SegmentedTabs` | **Extend** | `Segments` in `ui.tsx` — sliding orange pill, `role=tablist`, `aria-selected` | Two or three cells today, four in SmartWealth, and theirs is an underline tab row rather than a filled pill. Add the underline variant; keep the sliding pill for in-card switches. |
| `FilterChipRow` | **Extend** | the category filter in `Recent` (`src/screens/Money.tsx`) — horizontally scrolling `aria-pressed` pills, orange when on | Working code, never extracted. Lift it verbatim; it is already the right shape. |
| `StickyFooterBar` | **Extend** | `Sheet`'s `footer` prop (`src/components/Sheet.tsx`) — `flex-none`, hairline top, `pb-[max(16px,env(safe-area-inset-bottom))]` | Exists only inside a sheet. The transaction spine needs the same bar pinned to a *screen*, as a flex sibling of `.scroll`. Same recipe, different parent. |

## Actions — 3 exist · 2 extend · 0 new

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `PrimaryButton` | **Exists** | `Button tone="primary"` in `ui.tsx` — orange pill, `text-on-accent`, ripple, `busy` spinner | Nothing. Note it is a full pill, not SmartWealth's 8px rectangle — conflict 1, already decided. |
| `OutlinedButton` | **Exists** | `Button tone="secondary"` — white fill, 1.5px `border-accent`, `text-accent-text` | Nothing. |
| `SecondaryButton` | **Exists** | `Button tone="quiet"` — filled `bg-ground-deep`, `text-ink-mid` | Nothing. This is the filled-tonal button; `tone="secondary"` is the outlined one. |
| `IconButton` | **Extend** | hand-rolled four times: `Sheet`'s close (h-9), `Stepper`'s ± (h-11, `src/components/Form.tsx`), `QueueCard`'s dismiss, `CHIP` in `src/screens/Today.tsx` (size-10 with a count badge) | One component, sizes 9/10/11, tones grey / bordered / transparent, optional count badge. Four copies of `grid place-items-center rounded-pill` is the tell. |
| `TextLink` | **Extend** | two hand-rolled copies with near-identical strings: `StageCard`'s "Why this first?" (`src/screens/Plan.tsx`) and Reset in `src/components/Clock.tsx` — `border-0 bg-transparent text-brand-deep underline-offset-2 hover:underline` | `Button`'s `quiet` tone was taken by the filled grey pill, so the actual text link has no home. Add a `link` tone or extract the copies. |

## Input — 2 exist · 1 extend · 2 new

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `OutlinedTextField` | **Exists** | `TextInput` + `Field` + `MoneyInput` in `src/components/Form.tsx` — 48px, hairline border, `focus:border-accent`, label and hint | Nothing. `MoneyInput` already groups Indian digits as you type. |
| `Checkbox` | **New** | nothing. `Choice` is a `role="radio"` group; the consent control in `src/screens/Record.tsx` is a `role="switch"` pill | A real checkbox. The OTP and cart-review screens need one for terms. |
| `OtpInput` | **New** | nothing | Six boxed digits, auto-advance, paste-the-whole-code, resend timer. The transaction spine dead-ends here, so it is early in the build order. |
| `RiskSlider` | **Extend** | a bare `<input type="range">` in two places: `src/screens/Plan.tsx` (assumed return) and `src/screens/GoalSheet.tsx` (target amount, `h-11` for thumb reach) | Both already use `accent-accent`. Wrap once, with ticks, end labels and a value read-out. Keep the 44px minimum. |
| `BottomSheet` | **Exists** | `src/components/Sheet.tsx` | Nothing — and do not reimplement it. It has the scrim, Escape, a real Tab trap, focus return, and an exit animation that survives unmount. Every editing surface in SmartWealth is a sheet; they all get this one. |

## Data display — 2 exist · 4 extend · 3 new

| SmartWealth | Verdict | What we have | What it needs |
| --- | --- | --- | --- |
| `ListRow` | **Extend** | the same skeleton twice: statement rows in `Recent` (`src/screens/Money.tsx`) — 32px disc, name/sub, right-aligned figure, `divide-y` — and `ProbeRow` in `src/screens/Onboarding.tsx` | One row: leading disc or icon, title, subtitle, trailing value or chevron, optional press. SmartWealth's is 68pt; ours is ~54. Pick 68 for list screens and hold it. |
| `StatCard` | **Exists** | `Tile` in `ui.tsx` — `Amount size="md" fit`, label under, alternates sage/clay, turns white inside a tinted card | Nothing. This is StatCard with a better name. |
| `FundRow` | **New** | nothing — `AccountCard` (`src/screens/Money.tsx`) is a card, not a row | Fund logo, name, category chip, NAV, return %, chevron. Build it on the extracted `ListRow`; it is the row every fund list in Discover is made of. |
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
| `InfoBanner` | **Extend** | `src/components/OfflineBadge.tsx` — full-width `tint-clay` strip, message, inline action button | Structurally exactly an InfoBanner, hardwired to one message. Generalise it: tone (clay / sage / danger-soft), text, optional action. `mostlyNameless` in `src/screens/Money.tsx` is a second, inline instance. |
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
- **`AmountInWords`** — every money input shows `₹2,416` large with
  `Rupees Two Thousand Four Hundred Sixteen Only` under it. `src/lib/money.ts` has `inr`, `parts`
  and `approx` but no number-to-words, so this is a lib function plus a line of markup.
- **The card that overlaps the header** — a layout affordance rather than a component, but it is
  what makes SmartWealth's chrome read as a backdrop. It has to be rebuilt against the IDBI
  header slab; there is nothing to extend.

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
independently and should be, before any screen is built on a copy of it — there are already four
copies of `IconButton` in the tree and that is the cost of not doing this first.
