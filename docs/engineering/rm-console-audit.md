# RM console: Impeccable audit, 2 Oct 2026 (before and after fixes)

A technical audit of `apps/rm`, the RM console, on branch `rm-console` at `70a1472`. Everything up
to [After fixes](#after-fixes-2-oct-2026) was taken before any fix; that last section re-measures
each finding once the fixes had landed. It follows the Impeccable 4.3.1 audit playbook across five
dimensions. There is no PRODUCT.md or DESIGN.md, so the incumbent code is the design authority. The
console is judged in Operate mode: scanability, consistency and the RM's real working day outrank
expression.

Three product decisions are out of scope and are not reported: light theme only, the system font
stack, and a desktop-first layout for 1280–1600 px. The third still requires that tablet and phone
widths do not break, and several findings are about exactly that.

How the evidence was gathered: a local API (`BANK_SOURCE=memory`, `RM_SIMULATE=1`) with the Vite dev
server, plus the production build, driven by headless Chrome over CDP. axe-core 4.10.2 (WCAG 2.0–2.2
A and AA, plus best practice) ran on 14 page states and 4 overlays. Performance was traced at 1x and
4x CPU and on a 150 ms RTT / 1.6 Mbps link. Layout was measured on emulated viewports from 320 to
1600 px, with 200% zoom emulated as half the CSS viewport at DPR 2, and gestures were exercised with
synthesized touch. The Impeccable detector ran on the sources and on rendered pages. Not tested: a
physical device, iOS Safari, pinch-zoom and the on-screen keyboard. Findings reported by more than
one dimension are merged, and each lists every category it belongs to. Finding IDs (F01–F45) are
stable so the fix pass can refer to them.

## Audit Health Score

| #         | Dimension                | Score     | Key Finding                                                                                                     |
| --------- | ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| 1         | Accessibility            | 2         | Focus ring is 1.7:1 on every surface, and every modal drops focus to `<body>` when it closes (F02, F05)         |
| 2         | Performance              | 3         | Each route's data waits behind React's 300 ms Suspense throttle, behind a 571 kB entry chunk (F16, F17)         |
| 3         | Responsive Design        | 1         | No shell layout below 1024: every signed-in page scrolls sideways at 768, at 390 and at 200% zoom (F03)         |
| 4         | Theming                  | 3         | The focus token fails 3:1, and 47 ad-hoc opacity mixes stand in for state tokens that do not exist (F02, F28)   |
| 5         | Implementation Integrity | 2         | "82% IDBI" under Relationship value is a share of balances, and the kit has been forked page by page (F01, F34) |
| **Total** |                          | **11/20** | **Acceptable (significant work needed)**                                                                        |

## Implementation Integrity Verdict

**Fail, narrowly.** The token layer is coherent and specific to this product. The component layer
and one headline figure are not.

What passes. `apps/rm/src` contains no hex, `rgb()`, `hsl()` or `oklch()` literal and no arbitrary
colour class. Tailwind's palette, type scale, radii and shadows are reset to `initial`, so
off-system values cannot compile. Every rendered text, background, border and stroke colour across
the 11 signed-in routes and `/login` maps to a `tokens.json` value, every font size sits on the
8-step web scale, and every shadow is an elevation token. The generated theme is byte-identical to a
fresh regeneration. The console also reads as itself rather than a template: IDBI green on cream, a
"Demo data" chip in the top bar, a copilot that says "Written by the rules from the record" instead
of implying a model, a rule count taken from `@dhan/core`'s `ruleBook`, and an advice record whose
chains can be verified on screen. `impeccable detect --json apps/rm/src` returned `[]`.

What fails:

- **One figure misleads (F01).** On the Book, the most-used table, "82% IDBI" sits under
  Relationship value but is a share of bank balances. The preview rail beside it gives the right
  figure, so the screen contradicts itself.
- **The status vocabulary changes between pages (F33).** "Worth knowing" is an olive chip on
  Overview, a grey icon on Today and a green icon in the copilot. "Priority" is a black chip on
  Today and a pale green one on the Book. The kit's own promise is "the same words in the same
  colour on every page".
- **The kit has been forked (F34, F35).** Stat, MaskedField, SegmentTabs, the month charts,
  sparklines, stacked bars and ranked bars were rebuilt inside pages, and the originals stay in the
  kit as `/kit`-only code. `/kit` therefore no longer describes the product.
- **The same data is drawn and formatted in different ways (F36, F37)**, and some facts are
  recovered from the API's English sentences with regular expressions (F39).
- **Eyebrows sit above headings in four places (F38)**, which the craft floor bans outright.

Rendered-detector findings, each checked in context:

- **Real:** `text-overflow` 255 times at 390 px against 8 at 1440 (F03); `codex-grid-background` on
  `/login` (F44); `tiny-text` 11 px body text 6 times on `/insights` (F30); `all-caps-body` on the
  login eyebrow (F38).
- **False positives:** `cream-palette` ×11 is the committed ground `#F6F2EA`. `ai-color-palette` on
  `/login` is the brand green inside a `color-mix`. `layout-transition` ×11 is Sonner's toast CSS,
  not app code. `cramped-padding` is the fixed-height `Chip` in 58 of 61 hits, and the other 3 are
  `DataTable` wrappers that are flush by design. `dark-glow` on login is the `shadow-overlay` token.
  `first-viewport-column-overflow` on Journey and Money is an ordinary main-plus-rail layout.
  `nested-cards` are `CardFooter`s, strip bands and inset diff wells. The 10 px document overflow at
  1440 came from the detector's own label overlay; it measured 0 px before injection.

To pass: fix F01, give severity and segment one definition in `ui/status.tsx` (F33), and fold the
forks back into the kit (F34, F35).

## Executive Summary

- Audit Health Score: **11/20** (Acceptable: significant work needed).
- Issues found: **45** after merging duplicates across dimensions. **P0: 0, P1: 8, P2: 31, P3: 6.**
- Top issues:
  1. **"82% IDBI" misstates wallet share on the Book and the customer header (F01).** An RM reads
     ₹1.59Cr with IDBI where the real figure is ₹65.8L.
  2. **The focus ring is 1.7:1 everywhere (F02).** Keyboard is the RM's main way through the Book
     and Cmd-K, and the ring all but disappears on every surface.
  3. **No layout below 1024 px (F03, F04).** Every signed-in page scrolls sideways at tablet, phone
     and 200% zoom. At 200% zoom on a 1280×800 laptop the Log-a-call buttons sit below the screen,
     and on a phone the dialog cannot be submitted at all.
  4. **Keyboard users lose their place (F05, F06).** Every modal drops focus to `<body>` when it
     closes, and Tab from a Book row re-targets the preview rail through every remaining row, so the
     RM can log a call against the wrong customer.
  5. **The kit has drifted page by page (F33–F35).** Status colours mean different things on
     different pages, and a fix made in the kit does not reach the live screens.
- Recommended next steps: fix the eight P1s first. Most sit in a few shared places: one token (F02),
  the shell (F03), the dialog wrapper (F04, F05), `DataTable` (F06), a title hook (F07) and the
  Book's rail and band (F08), plus one wording change in two places (F01). Then work through the P2s
  by command, starting with the shared kit (`ui/`, `shell/`, the token generator), because many page
  findings disappear once the kit has the role or variant the page was improvising.

## Detailed Findings by Severity

### P0 Blocking

None. Every core task can be completed at the supported desktop widths.

### P1 Major

#### F01 [P1] "82% IDBI" under Relationship value is a share of bank balances, not of the figure above it

- **Location**: `pages/book/columns.tsx:159-166` (Book row);
  `pages/customer/CustomerHeader.tsx:230-235` (Highlights hint); `pages/customer/Overview.tsx`
  around line 193 (Uday's read)
- **Category**: Implementation Integrity
- **Impact**: An RM reads "₹1.94Cr / 82% IDBI" as about ₹1.59Cr held with IDBI. The real figure is
  ₹65.8L, 34% of the relationship value. The preview rail beside the row says "₹65.8L with IDBI ·
  82% of balances", so the screen contradicts itself. The line is hidden where balances are 100%
  IDBI, so Madhuri Gokhale's ₹79.4L reads as all-IDBI when ₹57.5L (72%) is. This is the wallet-share
  number the RM uses to decide whom to call.
- **WCAG/Standard**: Implementation integrity: labels must not overclaim the data. The spec defines
  wallet share as With IDBI ÷ all balances (`docs/product/rm-console.md:84`).
- **Evidence**: `/rm/book` for Vikram Nair returns `relationshipValue` ₹193.7L, `withIdbi` ₹65.8L
  and `walletSharePct` 82.3. `withIdbi` ÷ relationship value is 34.0%; `withIdbi` ÷ cash (₹80.0L) is
  82.3%. Harsh Shah shows 59%, which is 19% of his relationship value. The row renders
  `{formatPct(Math.round(share))} IDBI` under `<Money value={r.relationshipValue}>`, only when
  `share < 99.5`. The correctly qualified wording already exists elsewhere: the header line "82% of
  balances with IDBI", the Book strip "91.4% of balances", and `Preview.tsx:136`. The row's
  sparkline in the same cell draws `balanceSeries.total` (₹74.1L), a third basis.
- **Recommendation**: Under Relationship value, show With IDBI in rupees ("₹65.8L with IDBI"), as
  the rail does. Wherever a share appears, keep the qualifier ("82% of balances"). Show the line at
  100% too. Label the sparkline as balances, or move it, so it does not read as the trend of the
  relationship value.
- **Suggested command**: `/impeccable clarify`

#### F02 [P1] Focus ring is 1.7:1 against every surface: the 2 px outline is a 35%-alpha tint

- **Location**: `packages/design/tokens.json:73` (`web.color.focus` `rgba(1,106,77,0.35)`);
  `apps/rm/src/styles/app.css:34-37` (global `:focus-visible`); 59 `focus-visible:outline-focus`
  uses, for example `ui/Button.tsx:18`, `ui/IconButton.tsx:9`, `shell/Sidebar.tsx:31`,
  `ui/DataTable.tsx:215` and `:296`, `ui/Tabs.tsx:17`, `ui/SegmentTabs.tsx:69`,
  `pages/today/CallQueue.tsx:218` (`::after` ring); `ring-focus/40` at `ui/Field.tsx:14` and
  `features/copilot/Ask.tsx:349`
- **Category**: Accessibility, Theming
- **Impact**: Keyboard is the primary workflow on this console (Book arrow keys, Cmd-K, Enter to
  open), and the ring nearly disappears against the cream ground, white cards and the green selected
  row. Low-vision RMs lose track of focus altogether. Every focusable element uses this one
  indicator.
- **WCAG/Standard**: WCAG 2.2 1.4.11 Non-text Contrast (AA) as applied to focus indicators; 2.4.7
  Focus Visible (AA); short of 2.4.13 Focus Appearance (AAA)
- **Evidence**: A Tab walk over 7 pages: every stop computes
  `outline: solid 2px rgba(1, 106, 77, 0.35)`, including 9 inset rings at offset −2 px. Composited
  over the surface it sits on, the ring measures 1.76:1 on surface, 1.72:1 on ground, 1.70:1 on
  ground-deep, 1.73:1 on brand-wash, 1.72:1 on row-selected and 1.70:1 on brand-soft. A ring pixel
  sampled at 3x, (160,195,179) beside ground (246,242,234), is 1.72:1. The field halo
  `ring-focus/40` is an alpha of an alpha (0.35 × 0.40) and measures 1.24:1. Fields pass only
  because of the separate `focus:border-brand` (6.62:1).
- **Recommendation**: Make the ring opaque at 3:1 or more against ground and surface: solid brand
  `#016A4D` (6.62:1 on white, 5.48:1 on ground-deep), or at least alpha 0.70, the measured minimum
  for 3:1 on ground and ground-deep. Keep the 2 px width and 2 px offset, so the ring also reads
  around the green primary button. If the soft tint is wanted, keep it only as a separate outer-halo
  token. Remove the `/40` modifier on `ring-focus` in `Field.tsx:14` and `Ask.tsx:349`, and use one
  inset spelling instead of mixing `outline-offset-[-2px]` (×9) and `-outline-offset-2`
  (`CallQueue.tsx:218`). `web.*` in `tokens.json` is read only by the console
  (`apps/rm/scripts/tokens-css.mjs`, `lib/cn.ts`, `pages/Kit.tsx`), so the change does not reach the
  mobile app.
- **Suggested command**: `/impeccable harden`

#### F03 [P1] The app shell has no layout below 1024 px: fixed sidebar and gutters and a top bar that cannot shrink, so every page scrolls sideways at tablet, phone and 200% zoom

- **Location**: `shell/Sidebar.tsx:16` (`fixed inset-y-0 left-0 z-30 flex w-sidebar`);
  `shell/AppShell.tsx:29` (`pl-sidebar`) and `:31` (`px-8`); `shell/TopBar.tsx:27` (header `px-8`,
  no wrap or overflow handling), `:31` (search button `w-full max-w-md` with `min-width: auto`),
  `:41` (chip cluster); `--spacing-sidebar: 232px`. Affects all 11 signed-in routes.
- **Category**: Responsive, Accessibility, Implementation Integrity
- **Impact**: At 768 px (tablet portrait) the "As of" chip and the Help button sit off-screen on
  every page. At 390 px the content column is 158 px wide (94 px inside the gutters): the Today KPI
  figures, the customer Highlights and the Book band overprint into illegible text, and "Brief me"
  covers the avatar. Fixed overlays are positioned against the stretched layout viewport: at 390
  only 99 px of the 400 px copilot panel is visible and its Close button is off-screen, at 768 the
  panel spans x 479–879 with Close off-screen, and the Cmd-K palette spans x 16–567 in a 390 px
  viewport. A low-vision RM who zooms a 1280×800 laptop to 200% gets a 408 px content column and
  239–329 px of sideways scroll; at 400% (320 CSS px) the content column is 88 px and the Book title
  wraps one word per line.
- **WCAG/Standard**: WCAG 2.2 1.4.10 Reflow (AA), 1.4.4 Resize Text (AA); the brief's rule that
  tablet and phone must not break
- **Evidence**: `scrollWidth` against `clientWidth`: 768×1024: Today, Book and all 5 customer tabs
  879/768, Insights 954, Advice record 969, Access 999. 390×844: 650–999 (260–609 px of overflow).
  320: main 88 px, `scrollWidth` 582 (Today), 702 (Book), 724 (customer). 640×400 at DPR 2 (200% of
  1280×800): main 408 px, overflow 239–329. 720×450 at DPR 2 (200% of 1440×900): overflow 159–249.
  At 1024 and above: 0 px on every page. The search button measures 323 px with `min-width: auto`,
  because its `truncate` span sets a no-wrap min-content width; injecting
  `header.sticky > button { min-width: 0 }` alone brings Today and Book at 768 from 879 to 768.
  `src/styles` has no `@media` rule except reduced motion, and `shell/` has no responsive class.
  `nav.ts:14` documents a "tooltip on a collapsed rail" that was never built. The rendered detector
  logged 255 text-overflow findings at 390 against 8 at 1440.
- **Recommendation**: Give the shell a narrow mode. Below about 1100 px, collapse the sidebar to a
  56 px icon rail with tooltips (the `hint` text in `nav.ts` is already written for them) and drop
  `pl-sidebar` to match. Below about 768 px, move the nav into an off-canvas drawer opened from a
  menu button in the top bar, and reduce `px-8` to `px-4`. In `TopBar`, add `min-w-0` to the search
  button, let the "Demo data" and "As of" chips fall back to icon-only or hide at narrow widths, and
  keep Help visible. Once the page stops overflowing, the copilot (`max-w-full`), the palette and
  the dialogs (`w-[calc(100%-2rem)]`) size correctly on their own. 1280–1600 px stays exactly as it
  is.
- **Suggested command**: `/impeccable adapt`

#### F04 [P1] The Log-a-call and Add-note dialog cannot be submitted on short or narrow viewports

- **Location**: `ui/Dialog.tsx:46` (`fixed top-[18vh] left-1/2 … w-[calc(100%-2rem)]`, no
  max-height, no `overflow-y`); used by `pages/customer/NoteDialog.tsx:165` and
  `pages/customer/RevealField.tsx:111`
- **Category**: Responsive
- **Impact**: Logging a call is the console's core write action. At 200% zoom on a 1280×800 laptop
  the Cancel and Log call buttons sit below the bottom of the screen and the dialog cannot be
  scrolled to them; only a blind Tab and Enter reaches them. On a 390 px phone the submit button
  sits off-screen to the right, and Radix's scroll lock blocks the touch pan that would reveal it,
  so the task cannot be completed.
- **WCAG/Standard**: WCAG 2.2 1.4.10 Reflow (AA), 1.4.4 Resize Text (AA)
- **Evidence**: 640×400 at DPR 2: dialog rect top 72, bottom 491; the "Log call" button at y 430–466
  with `innerHeight` 400; computed `overflowY: visible`, `maxHeight: none`, body `overflow: hidden`;
  `dialog.scrollTop` stays 0 after scrolling it by 500. 390×844 with touch: submit at x 469–545 with
  `visualViewport.width` 390; a 200 px touch pan moves `visualViewport.offsetLeft` by 0 px with the
  dialog open, against 279 px without it. At 1280×800 and 1366×768 the dialog fits (bottom 563 and
  557).
- **Recommendation**: In `DialogContent`, cap the height at `max-h-[calc(100dvh-2rem)]`, add
  `overflow-y-auto`, and clamp the top (for example
  `top-[max(1rem,min(18vh,calc(100dvh-100%-1rem)))]`, or centre it with a flex wrapper). Make
  `DialogFooter` sticky at the bottom of the scroll area so the primary action is always on screen.
  Fixing the shell overflow (F03) also stops the horizontal mispositioning on phones.
- **Suggested command**: `/impeccable adapt`

#### F05 [P1] Every modal drops focus to `<body>` when it closes (Add note, Log a call, Reveal, Cmd-K)

- **Location**: `ui/Dialog.tsx:11` (`DialogTrigger` is exported but used only in the Kit);
  `pages/customer/Customer.tsx:78` and `CustomerHeader.tsx:80` (`NoteDialog` opened by a plain
  `onClick`); `pages/customer/RevealField.tsx:104,110` (`onClick={() => setOpen(true)}` with a
  controlled `Dialog`); `ui/CommandPalette.tsx` root, controlled from `shell/AppShell.tsx:30` and
  `TopBar.tsx:30`
- **Category**: Accessibility
- **Impact**: After a dialog closes, keyboard and screen-reader users lose their place. The next Tab
  restarts at "Skip to content", so they must Tab back through the sidebar, the top bar and the
  customer header. After a successful Reveal the trigger button is replaced by text, so nothing is
  focused at all.
- **WCAG/Standard**: WCAG 2.4.3 Focus Order (A); WAI-ARIA APG Dialog pattern (return focus to the
  invoking element)
- **Evidence**: Radix `react-dialog` `dist/index.mjs:154-156` restores focus with
  `context.triggerRef.current?.focus()`, and `triggerRef` is null when no `DialogTrigger` is used.
  Measured: Add note opened from its button, then Esc: `activeElement` is `BODY`; Cancel: `BODY`,
  and the next Tab lands on "Skip to content". Log a call, Esc: `BODY`. Reveal, Esc: `BODY`; Reveal
  success: `BODY`. Cmd-K opened with focus on the Book nav link, then Esc: `BODY`. The copilot gets
  this right: `copilot/store.ts` `returnFocus` restores focus to "Brief me".
- **Recommendation**: Fix it once in the `ui/Dialog.tsx` and `CommandPalette` wrappers: capture
  `document.activeElement` when the dialog opens and restore it in `onCloseAutoFocus` (call
  `preventDefault`, then focus it), as `copilot/store.ts` already does. Use
  `<DialogTrigger asChild>` where a page can. After a Reveal succeeds, focus the revealed value or
  the "Revealed and logged" text (`tabIndex={-1}`).
- **Suggested command**: `/impeccable harden`

#### F06 [P1] The Book preview rail cannot be reached by keyboard for the chosen customer: the preview follows Tab through every row

- **Location**: `pages/book/Book.tsx:261-263` (`onRowFocus` selects any row that receives focus);
  `ui/DataTable.tsx:282` (`tabIndex={clickable ? 0 : undefined}`: every row is a Tab stop, no roving
  tabindex)
- **Category**: Accessibility
- **Impact**: A keyboard or screen-reader RM who opens the preview for one customer and Tabs toward
  its actions (Log call, Open profile) passes through every remaining row. Each row re-targets the
  rail, so they arrive in the rail for the last customer in the list and can log a call against the
  wrong person. Every pass also costs 38 or more Tab stops.
- **WCAG/Standard**: WCAG 2.1.1 Keyboard (A); 2.4.3 Focus Order (A); APG grid and listbox roving
  tabindex
- **Evidence**: Focus row 1 and press Enter: the rail reads "Preview of Vikram Nair". It took 38 Tab
  presses for focus to enter the rail, which then read "Preview of Rohit Kale" (the last row), with
  focus on its "Log call" button. The table has 38 rows, each with `tabindex=0`.
- **Recommendation**: Use a roving tabindex in `DataTable`: only the active or selected row has
  `tabIndex={0}`, the rest `-1`, and the arrow keys move focus (and the preview) as they do now. Tab
  from the row then goes straight into the rail. In `Book.tsx`, follow focus only on arrow-key
  moves, never on Tab.
- **Suggested command**: `/impeccable harden`

#### F07 [P1] Every route has the same `<title>`, and route changes are not announced

- **Location**: `apps/rm/index.html:12` (`<title>RM Desk · IDBI Bank</title>`); no `document.title`
  anywhere in `src/`; the `shell/AppShell.tsx` `Outlet` has no route focus or announcement
- **Category**: Accessibility
- **Impact**: Screen-reader users get no confirmation that a page or a customer file opened. Browser
  tabs, history and window switchers all read "RM Desk · IDBI Bank", so an RM with several customer
  files open cannot tell them apart.
- **WCAG/Standard**: WCAG 2.4.2 Page Titled (A); 4.1.3 Status Messages (AA) for the route
  announcement
- **Evidence**: `document.title` is "RM Desk · IDBI Bank" on `/login`, `/`, `/book`, all 5 tabs of
  `/customers/IDBI0003308471`, `/insights`, `/record`, `/access` and the 404. After choosing a
  customer in Cmd-K, focus is on `BODY`. After Enter on the sidebar Insights link, focus stays on
  the link and no live region fires.
- **Recommendation**: Add a per-route title hook, for example "Karan Deshpande · Money · RM Desk" or
  "Book (38) · RM Desk". On a route change, move focus to the page `h1` (`tabIndex={-1}`) or
  announce the new title in a polite visually hidden region. In-page tab switches may keep focus
  where it is, but should still update the title.
- **Suggested command**: `/impeccable harden`

#### F08 [P1] The Book with the preview rail open breaks at the spec's 1024 px floor: band figures overprint, the sort control sits under the rail, and at 768 the customer names disappear

- **Location**: `pages/book/SummaryBand.tsx:155`
  (`<span className="shrink-0 text-heading text-ink">{value}</span>` inside a `min-w-0` cell);
  `pages/book/Toolbar.tsx:52` (`flex items-center gap-3`, no wrap), `:70` (`min-w-44 flex-1`),
  `:104` (`ml-auto flex shrink-0`), `:117` (`w-52`); `ui/SideRail.tsx:30` (fixed rail track
  `grid-cols-[minmax(0,1fr)_var(--spacing-rail)]`); `pages/book/Book.tsx:60-61` (380 px rail below
  1440, no narrower fallback)
- **Category**: Responsive
- **Impact**: The spec says the console is "usable down to 1024". At 1024, walking the book with the
  preview open, the page's main flow, prints the four headline figures (Book value, With IDBI, SIP
  book, Asked for you) over each other, and the sort-direction button cannot be clicked. At 768 the
  list column shrinks to 72 px and the Customer column to 0 px, so a row shows a value with no name.
  The same overprint appears at 200% zoom with the rail closed.
- **WCAG/Standard**: Spec `docs/product/rm-console.md:131-132` ("usable down to 1024")
- **Evidence**: 1024×768 with `?cif=` open: band cells 21 px wide holding 60 px values (Book value
  at x 285–345 runs into With IDBI, which starts at 330), rendered as "₹10.6C₹5.16C₹4.43L4" under
  labels cut to "B… W… S… A…". The sort select spans x 452–660 and the rail starts at 612; at the
  centre of the sort-direction button ("Descending: switch to ascending", x 666–702)
  `elementFromPoint` returns the rail's `aside`. 768 with the rail: list column x 264–336 (72 px),
  table 108 px, the Customer header 0 px wide, rail x 356–736. The overprint stops above about 1060
  px (at 1093 the cells are 38 px with no overlap).
- **Recommendation**: Let a band figure shrink and truncate (drop `shrink-0`), or wrap the band to a
  2×2 grid under a container query (it is already an `@container`). Give the toolbar `flex-wrap`, or
  move sort into an icon button at `@max-lg`. Below about 1100 px of window width, render the
  preview as an overlay sheet over the list instead of a 380 px grid column, so the list keeps its
  width and its names.
- **Suggested command**: `/impeccable adapt`

### P2 Minor

#### F09 [P2] The AreaChart wrapper adds an unnamed focus stop (`svg role=application`) and keeps month values mouse-only

- **Location**: `ui/charts.tsx:223` (`figure role=img` around Recharts 3 with its default
  `accessibilityLayer`); used at `pages/customer/Money.tsx:216-222` and
  `pages/book/Preview.tsx:362-374`
- **Category**: Accessibility
- **Impact**: Keyboard users land on a nameless "application" stop, which is the first stop inside
  the Book rail, and it announces nothing. Screen-reader users hear "Month-end balances from Sep
  2025 to Aug 2026" with none of the 12 values the chart shows on hover.
- **WCAG/Standard**: WCAG 4.1.2 Name, Role, Value (A); 1.1.1 Non-text Content (A)
- **Evidence**: `svg.recharts-surface` has `tabindex="0"`, `role="application"` and no `aria-label`,
  inside `figure[role=img]`, on `/customers/IDBI0003308471/money` and in the Book rail. ArrowRight
  on it produced no tooltip text. The Insights `MonthLines` and `MonthColumns` labels, by contrast,
  list every month ("Sep 2025: ₹4.26Cr; Oct 2025: ₹4.28Cr; …").
- **Recommendation**: Pass `accessibilityLayer={false}` (or `tabIndex={-1}`) in the wrapper so the
  figure stays a single image, and build its `aria-label` from the series as Insights does: first
  and last value, the change, and the month list.
- **Suggested command**: `/impeccable harden`

#### F10 [P2] `aria-label` on role-less `<span>`s carries information most screen readers drop

- **Location**: `ui/status.tsx:139-142` (`StrengthBadge`); `pages/today/parts.tsx:90-93`
  (`SourceChip`); `pages/access/Access.tsx:366` ("No detail")
- **Category**: Accessibility
- **Impact**: In Book rows the strength badge has no Tab stop (`interactive-row.tsx`), so its reason
  ("Active 17 days ago · 2 IDBI products · 82% of balances with IDBI") exists only in a hover
  tooltip and in this label. VoiceOver and NVDA in browse mode read just "High". The Today signal
  severity ("Act now") has the same problem outside the `aria-describedby` path.
- **WCAG/Standard**: WAI-ARIA 1.2 (`aria-label` is prohibited on generic elements); WCAG 1.3.1 Info
  and Relationships (A)
- **Evidence**: axe `aria-prohibited-attr` (needs review): "aria-label attribute is not well
  supported on a span with no valid role attribute". 38 nodes on `/book`, 6 on Today, 1 on each
  customer tab and in the rail, 1 on `/access`
  (`<span class="text-label text-ink-hint" aria-label="No detail">—</span>`).
- **Recommendation**: Put the words in the DOM: a visually hidden span with the reason inside the
  badge (the visible text stays "High"), or `role="img"` with the label where the content is purely
  graphic. For the dash, render visually hidden "No detail" text and `aria-hidden` the "—".
- **Suggested command**: `/impeccable harden`

#### F11 [P2] Cmd-K does not expose the highlighted result after typing, and never announces the result count

- **Location**: `ui/CommandPalette.tsx:77` (`Command.Input` in controlled `shouldFilter={false}`
  mode)
- **Category**: Accessibility
- **Impact**: A screen-reader user types a name and presses Enter on a result they never heard. With
  a single match, ArrowDown does not change the selection, so nothing is ever announced.
- **WCAG/Standard**: WCAG 4.1.2 Name, Role, Value (A); 4.1.3 Status Messages (AA); APG combobox
  pattern
- **Evidence**: On open, `aria-activedescendant` is null while the option "Today" has
  `aria-selected=true`; after ArrowDown it is set correctly. After typing "Karan",
  `aria-activedescendant` is null while "Karan Deshpande" has `aria-selected=true`, and ArrowDown
  leaves it null (1 item). No live or status text changes as results filter.
- **Recommendation**: Keep cmdk's `value` controlled and set `aria-activedescendant` to the selected
  item's id whenever the ranked groups change, or re-select the first item after each query. Add a
  polite visually hidden status ("3 customers, 1 page").
- **Suggested command**: `/impeccable harden`

#### F12 [P2] Submit-time validation errors are silent (sign-in, note dialog)

- **Location**: `pages/login/Login.tsx:98-102` (`setMissing`, focus stays on submit);
  `ui/Field.tsx:112-115` (error `<p>` with no live role); `pages/customer/NoteDialog.tsx:230`
  ("Write a line or two first.")
- **Category**: Accessibility
- **Impact**: A screen-reader RM presses Sign in or Add note and hears nothing. The errors render
  and the fields get `aria-invalid`, but focus stays on the button. After a failed sign-in, a later
  empty submit also shows the stale server alert beside the new field errors.
- **WCAG/Standard**: WCAG 3.3.1 Error Identification (A); 4.1.3 Status Messages (AA)
- **Evidence**: A clean empty sign-in renders "Enter your employee number." and "Enter your
  password." with no role, `aria-invalid` on both inputs, no live-region mutation, and focus on
  "Sign in". A wrong password and then an empty submit leaves `role=alert` reading "That employee
  number and password do not match." An empty note renders "Write a line or two first." and focus
  stays on "Add note".
- **Recommendation**: On a failed submit, move focus to the first invalid field; its
  `aria-describedby` already reads the error. Clear the sign-in error state when the client-side
  check fails.
- **Suggested command**: `/impeccable harden`

#### F13 [P2] Heading and landmark gaps: skipped levels, no `h1` on the 404, no `main` on sign-in, a second banner in the copilot

- **Location**: `ui/Timeline.tsx:64` (Journey months are `h3` directly under the `h1`);
  `pages/record/Record.tsx:322` (`SectionLabel as="h3"` "Latest refusal" before any `h2`);
  `pages/NotFound.tsx` (the `EmptyState` title is a `<p>`); `pages/login/Login.tsx:50` (root
  `<div>`, no `<main>`); `features/copilot/Panel.tsx:194` (`<header>` inside `section[role=dialog]`
  becomes a banner)
- **Category**: Accessibility
- **Impact**: Screen-reader users who move by heading or landmark find holes: the Journey tab has no
  `h2`, the 404 has no `h1`, sign-in has no `main` to jump to, and the open copilot adds a second
  banner.
- **WCAG/Standard**: WCAG 1.3.1 Info and Relationships (A); 2.4.6 Headings and Labels (AA); axe best
  practice
- **Evidence**: axe `heading-order` on `/customers/…/journey` ("h3 August 2026") and `/record` ("h3
  Latest refusal"); `page-has-heading-one` on `/nope`; `landmark-one-main` and `region` (11 nodes)
  on `/login`; `landmark-no-duplicate-banner` with the copilot open.
- **Recommendation**: Journey: add an `h2` ("Activity, by month") or make the month labels `h2`.
  Record: make "Latest refusal" an `h2`. `EmptyState`: render the title as an `h1` at `size="page"`,
  which fixes the 404. Login: wrap the form column in `<main>`. Copilot: use a `div` for the panel
  header.
- **Suggested command**: `/impeccable harden`

#### F14 [P2] Text field boundaries are 1.25:1: inputs on white cards are barely outlined

- **Location**: `ui/Field.tsx:11-17` (`control`: `border border-hairline bg-surface`, shared by
  `Input`, `Textarea` and `Select`); token `packages/design/tokens.json:26` hairline
  `rgba(14,51,41,0.12)`
- **Category**: Accessibility
- **Impact**: On the sign-in card, in the dialogs and in the Book and Access toolbars, the field's
  edge is the only cue that a field exists, and it measures 1.25:1. Low-vision users struggle to
  find where to type.
- **WCAG/Standard**: WCAG 1.4.11 Non-text Contrast (AA), user-interface component boundaries
- **Evidence**: The composited hairline is 1.25:1 on surface and on ground. The field fill (surface)
  against ground is 1.12:1, and `shadow-raised` is 5% alpha. The login inputs sit on a `bg-surface`
  card, so the border is the only boundary.
- **Recommendation**: Give form controls their own border token at 3:1 or more against surface and
  ground (ink-hint `#5A7A6D` is 4.73:1 on white; a midpoint around 3.2:1 also works). Keep the
  hairline for cards and table rules.
- **Suggested command**: `/impeccable polish`

#### F15 [P2] ink-hint text passes AA only on pure white and fails on the app's own tints

- **Location**: token `color.inkHint` `#5A7A6D` (shared with the mobile app);
  `pages/customer/Goals.tsx:339` (stage index on `bg-brand-wash`, set at `:325`);
  `pages/record/AdviceLedger.tsx:502` inside rows tinted at `:211`; `ui/SegmentTabs.tsx:77` and
  `pages/book/BookTabs.tsx:97` (counts, on hover)
- **Category**: Accessibility, Theming
- **Impact**: Small meta text (step numbers, counts, basis lines) at 12–13 px drops below 4.5:1 as
  soon as it sits on a selected, current or tinted panel. The measured miss is small and the step
  number repeats the list order, but it is a real AA failure, and the token has almost no headroom
  (4.73:1 on white).
- **WCAG/Standard**: WCAG 1.4.3 Contrast (Minimum) (AA)
- **Evidence**: On `/customers/IDBI0003918862/goals` the stage index "1" (12 px/500,
  `rgb(90,122,109)` on `rgb(241,247,243)`) is 4.36:1; axe measured "3" at 4.37:1 on `#fdf4f3`.
  ink-hint against each surface token: surface 4.73, row-hover 4.46, canvas-top 4.42, brand-wash
  4.36, row-selected 4.26, ground 4.24, brand-soft 4.07, ground-deep 3.92, danger-soft 3.87.
  ink-faint is at least 4.60:1 on every one of them. Decorative `·` separators (4.24:1,
  `aria-hidden`) are exempt.
- **Recommendation**: Make ink-hint a surface-only role for text, and use ink-faint for any text on
  a tinted fill: swap `Goals.tsx:339`, `AdviceLedger.tsx:502` and the hover counts in
  `SegmentTabs.tsx:77` and `BookTabs.tsx:97`. Do not darken `inkHint` in place, because the token is
  shared with the mobile app.
- **Suggested command**: `/impeccable harden`

#### F16 [P2] Every cold load serialises the page's data behind React's 300 ms Suspense reveal throttle

- **Location**: `shell/pages.ts:34-52` (lazy pages) and `shell/RouteBoundary.tsx:51-58` (`Suspense`
  per route); the page queries live inside the lazy chunks: `pages/today/Today.tsx:20`,
  `pages/customer/customer-file.ts:38`, `pages/insights/Insights.tsx:25`,
  `pages/record/Record.tsx:51`, `pages/access/Access.tsx:70`
- **Category**: Performance
- **Impact**: Every reload, deep link (a customer link from email or Teams) or first Back/Forward to
  a route shows the skeleton for at least 300 ms, and only then does the page start its own request,
  so a real WAN adds a full API round trip on top. About 300 ms of every route's 360–520 ms LCP is
  this wait.
- **WCAG/Standard**: Core Web Vitals: LCP; avoid request waterfalls
- **Evidence**: Production build, cold cache. At 1x CPU the Today chunks finish by 61 ms and the
  shell's `/book` and `/me` start at 62 ms, but `/api/v1/rm/today` starts at 363 ms. The same gap
  appears on every route: `/customers/:cif` at 346 ms, `/insights` 331, `/refusals` 328,
  `/access-log` 336. At 4x CPU: shell 125 ms, then `/today` 423 ms. At 150 ms RTT / 1.6 Mbps: shell
  1717 ms, then `/today` 2014 ms. The gap is about 300 ms whatever the CPU speed, which matches
  react-dom 19.2.3's `FALLBACK_THROTTLE_MS = 300`: a retry commit is postponed until 300 ms after
  the last fallback, and `useQuery` subscribes only after that commit. Back/Forward to a preloaded
  but never-rendered route: skeleton at 51 ms, content at 362 ms, against 66 ms once the lazy
  component has rendered once.
- **Recommendation**: Start each route's query alongside its chunk: in the lazy factory or a route
  loader, call `queryClient.prefetchQuery` or `ensureQueryData` with the same keys `api/queries.ts`
  uses, next to `import()`, so the data arrives inside the throttle window. Prefetch only the route
  actually being opened, never from the speculative preload, because the customer read is logged as
  an access. Have `preloadPages` initialise the lazy components too (a `lazyWithPreload` that
  renders the module synchronously once loaded), so a preloaded route never suspends on Back/Forward
  or on a cold landing.
- **Suggested command**: `/impeccable optimize`

#### F17 [P2] A 571 kB entry chunk blocks first paint on every route; about 40% of it is motion and the zod route registry

- **Location**: `api/client.ts:25` and `:160`; `App.tsx:2,70`; `pages/login/Login.tsx:15`;
  `vite.config.ts:52`
- **Category**: Performance
- **Impact**: Sign-in and every page wait for 175 kB gzipped of JS before the first paint. On a 1.6
  Mbps / 150 ms branch link FCP is 1.6–1.8 s everywhere, sign-in included, and about 70 kB gzipped
  of that is code the first paint does not need.
- **WCAG/Standard**: Core Web Vitals: FCP and LCP; ship only what the first route needs
- **Evidence**: `vite build`: `index-CCG0nB5M.js` 570.82 kB, 178.77 kB gzipped. Sourcemap
  attribution: motion-dom, framer-motion and motion-utils 126.9 KiB minified (about 41.6 KiB
  gzipped); zod plus the `@dhan/contracts` registry 103.5 KiB (about 28.5 KiB gzipped: zod 54.6,
  contracts routes 27.6, domain 14.0); radix and floating-ui 90.4; app code 77.1; react-router 38.3;
  sonner 33.8; query-core 32.3; tailwind-merge 28.9. `client.ts:25`
  (`import { ROUTES } from '@dhan/contracts'`) is the console's only value import from contracts,
  and `client.ts` reads only `id`, `path`, `method`, `auth` and `cache` and never parses with zod,
  yet every route's schemas ship, including customer-app routes (save, challenges, avatar,
  operator). Motion is the full `motion` component (no `LazyMotion`), pulled in eagerly by Login and
  `MotionConfig`; `app.css` already defines the same slide (`rm-sheet-in`) as `lib/motion.ts`'s
  `slideFromRight`. Throttled: the entry downloads from 164 to 1585 ms; FCP 1636–1800 ms on every
  route, `/login` 1688 ms. `chunkSizeWarningLimit` is raised to 900 (`vite.config.ts:52`), which
  hides Vite's default 500 kB warning.
- **Recommendation**: Generate a schema-free route table (id → method, path, auth, cache) from
  `@dhan/contracts` at build time, the way `scripts/tokens-css.mjs` generates the theme, import it
  in `client.ts`, and keep the registry for `import type` only. That removes zod and every schema
  from the bundle. Switch to `LazyMotion` with `m` and load `domAnimation` asynchronously (`domMax`
  only where `CallQueue` uses `layout="position"`), or use the existing CSS keyframes for the Login
  fades and the rail and sheet slides. Lazy-load sonner's `Toaster`. Put the warning limit back to
  500 kB.
- **Suggested command**: `/impeccable optimize`

#### F18 [P2] The idle preload downloads all 24 chunks (460 kB) at first render, competing with the page's own data

- **Location**: `shell/pages.ts:58-71` (`preloadPages`, `requestIdleCallback` with a 4000 ms
  timeout); `shell/AppShell.tsx:19`
- **Category**: Performance
- **Impact**: The browser is idle the moment the skeleton paints, so the preload fires together with
  the page's API calls. On a constrained link the page's data then shares bandwidth with code for
  pages the RM has not opened, which pushes LCP out by 0.3–1.1 s.
- **WCAG/Standard**: Resource prioritisation: speculative fetches must not compete with critical
  requests
- **Evidence**: Cold load of `/` at 1x: preloads of Book, DataTable, charts (109.4 kB), Customer,
  Journey and the rest start at 78 ms, alongside `/book` and `/me`. At 150 ms RTT / 1.6 Mbps and 4x
  CPU, with the route-irrelevant chunks blocked as a stand-in for a deferred preload: Today LCP 3600
  → 2456 ms, Customer 3160 → 2596 ms, Book 3680 → 3356 ms. In the unmodified run, `/today` (21.6 kB)
  took from 2014 to 3458 ms while `charts-DP5L7dFm.js` downloaded from 1784 to 3771 ms. Production
  gzips `/api` (`content-encoding: gzip` on the live CloudFront distribution), so the data share is
  smaller there, but the 460 kB of chunk preload is the same.
- **Recommendation**: Start the preload only after the current page's queries have settled (first
  query success plus idle, or the load event plus a delay). Stage it by likelihood: from Today,
  fetch Book and Customer first. Use `<link rel="prefetch">` or a low-priority `modulepreload`
  rather than `import()`, so a preload never takes bandwidth from the page on screen.
- **Suggested command**: `/impeccable optimize`

#### F19 [P2] The Book's first render requires the 381 kB recharts chunk even when no chart is drawn

- **Location**: `pages/book/SummaryBand.tsx:7,209` and `pages/book/Preview.tsx:17,362` (static
  `AreaChart` imports); build manifest entry `src/pages/book/Book.tsx` → `_charts-DP5L7dFm.js`
- **Category**: Performance
- **Impact**: On a 1280–1439 px laptop the Book opens with the chart folded and the rail closed, yet
  it cannot render until the whole chart library arrives. The RM's main list waits on code that
  draws nothing.
- **WCAG/Standard**: Core Web Vitals: LCP
- **Evidence**: The manifest shows `Book.tsx` statically importing `_charts-DP5L7dFm.js` (381.43 kB
  minified, 111.58 kB gzipped: recharts 244.6 KiB plus d3, `@reduxjs/toolkit`, immer and
  decimal.js-light). `AreaChart` renders only when the band is unfolded (folded by default below
  `(min-width:1440px) and (min-height:960px)`, `Book.tsx:51`) or a rail row is open. Throttled cold
  `/book`: the charts chunk loads from 1611 to 3422 ms, and Book LCP is 3356–3680 ms.
- **Recommendation**: Lazy-load the chart inside `SummaryBand` and `Preview` (`React.lazy` over a
  small module that re-exports `AreaChart`, with a fixed-height placeholder). The Book then needs
  only its own chunk and `DataTable`, and recharts loads when the band unfolds or the rail opens.
- **Suggested command**: `/impeccable optimize`

#### F20 [P2] Opening or closing the Book rail re-renders the whole table every frame (animated `grid-template-columns` plus `ResizeObserver` state)

- **Location**: `ui/SideRail.tsx:27` (`transition-[grid-template-columns] duration-300`);
  `pages/book/fit.ts:96-108` (`useWidth` calls `setWidth` on every resize);
  `pages/book/Book.tsx:204-218` (`fitColumns` → columns and visibility)
- **Category**: Performance
- **Impact**: On slower bank desktops the rail stutters, and table columns appear or disappear one
  at a time during the slide, while the RM is walking the list. The cost grows with the book: rows
  are not virtualised and each row mounts several Radix tooltips.
- **WCAG/Standard**: Animate compositor-only properties (transform, opacity); avoid layout-property
  transitions
- **Evidence**: A dev-build React profile: opening the rail makes 29 commits and 25,979 component
  renders in 1.5 s; closing makes 20 commits and 32,561 renders, one commit every 15–20 ms for about
  340 ms. The visible cell count steps 114 → 190 → 266 → 304 as the width animates. Each full commit
  renders about 2,500 components for 38 rows, roughly half of them Radix tooltip plumbing (Tooltip
  ×232, Popper ×116, TooltipProvider ×116, TooltipTrigger ×116). Mounting the Book alone makes 3
  full-table commits because `useWidth` starts from a guessed 1140 px. Production at 4x CPU: 2–4
  frames over 50 ms in the 700 ms after opening (worst 117–133 ms), a 129 ms long animation frame
  with 78 ms blocking and 27 ms of forced style and layout inside React's commit, and INP 128–144 ms
  on a second open. At 1x it is smooth (43 frames, worst 17 ms).
- **Recommendation**: Stop animating `grid-template-columns`: snap the grid and animate only the
  rail's transform and opacity (`slideFromRight` already does this). Derive the column fit from the
  target width (container width minus the rail when open) rather than per-frame observations, or
  apply width changes only on `transitionend`. Mount row tooltips lazily (one shared tooltip per
  table, or the Radix root only on hover or focus) and memoise rows so unchanged rows skip
  rendering.
- **Suggested command**: `/impeccable animate`

#### F21 [P2] Whole collections are fetched for a single figure, on every page and on every return to the tab

- **Location**: `shell/Sidebar.tsx:11-13` (`useBook()` only for `totals.openHandoffs`);
  `pages/today/Refused.tsx:29-32` (`useRefusals()` only for the total and the oldest date);
  `api/queries.ts:19,51` (`staleTime` 30 s, default `refetchOnWindowFocus`)
- **Category**: Performance
- **Impact**: Every cold load of any route downloads and parses the full book just for the sidebar
  badge. Today waits for `/today` and only then fetches the full refusal ledger to fill one count.
  RMs switch between this console and core banking all day, and each return after 30 s refetches up
  to 178 kB. The book payload grows linearly with the RM's book.
- **WCAG/Standard**: None specific (efficiency)
- **Evidence**: `/api/v1/rm/book` is 130,230 bytes (38 rows, about 3.4 kB per row, about 16 kB
  gzipped) and is requested on `/`, `/book`, `/customers/:cif`, `/insights`, `/record` and
  `/access`. `/api/v1/rm/refusals` (28,262 bytes, 34 items plus `byRule`) fires only after `/today`
  has rendered: at 4x CPU `/today` ends at 423–427 ms and `/refusals` starts at 457 ms; throttled,
  `/today` ends at 3458 ms and `/refusals` runs 3492–3864 ms. After 31 s idle, a `visibilitychange`
  refetched `/book` (128.1 kB) on a customer page, and `/book` plus `/today` (21.6 kB) plus
  `/refusals` (28.5 kB) on Today.
- **Recommendation**: Serve the open-request badge count, the refusals total and the "since" date
  from a light field, for example on `/me` or `/today` (this needs a contract and API change). Load
  the full book only where it is listed (Book, Cmd-K on open, TopMovers). In the meantime, turn off
  `refetchOnWindowFocus` for the book and the refusals, or give them a longer `staleTime`.
- **Suggested command**: `/impeccable optimize`

#### F22 [P2] The Advice record and Access log tables have fixed column widths and no horizontal scroll container, so rows paint outside their card and the page scrolls sideways

- **Location**: `pages/record/AdviceLedger.tsx:66-71` (7 + 13.5 + 14 + 6.5 + 3 rem fixed) and
  `:136-137` (wrapper with no overflow, `table-fixed`); `pages/access/Access.tsx:306`, `:318`,
  `:324`, `:356` (184 + 212 + 196 + 140 px); `ui/DataTable.tsx:146` and `:172` (the page-scroll
  `inPage` mode adds no overflow wrapper)
- **Category**: Responsive
- **Impact**: Below about 1000 px (tablet, or 200% zoom on a 1440 laptop) the ledger rows run past
  the right edge of their white card onto the page ground, and the whole page scrolls sideways
  instead of the table.
- **WCAG/Standard**: WCAG 2.2 1.4.10 Reflow (AA), outside the data-table exception
- **Evidence**: 768×1024: the `/record` table is 704 px (exactly 44 rem) in a 472 px card, with 201
  px of page overflow; the `/access` table is 732 px, the card stretches to 734 px, and the page
  overflows by 231 px. 720×450 at DPR 2 (200% of 1440): `/record` overflows by 249 px. Adding
  `overflow-x: auto` to the table wrapper brings `/record` from 969 to 768 and `/access` from 998 to
  822 (the rest comes from the shell, F03).
- **Recommendation**: Wrap both tables in an `overflow-x-auto` box inside their card: a data table
  may scroll on its own axis, but the page must not. Better still, give the ledger and the access
  log the Book's column-dropping treatment (`fit.ts`), or stack each record into two lines below
  about 720 px of container width.
- **Suggested command**: `/impeccable adapt`

#### F23 [P2] The Insights "Twelve months" card grows past its column on tablet; page grids are keyed to the viewport, not to the room left after the sidebar

- **Location**: `pages/insights/Insights.tsx:90` (`grid gap-6`, implicit `auto` track);
  `pages/insights/TrendBand.tsx:69` (`md:grid-cols-2 xl:grid-cols-3`). The same viewport-keyed
  pattern is in `pages/today/TodayGrid.tsx:24-26`, `pages/insights/Composition.tsx:29` and
  `pages/customer/Customer.tsx:70`.
- **Category**: Responsive
- **Impact**: At 768 the trend card is 186 px wider than its column: the right-hand tiles and month
  labels are cut off and the page scrolls sideways. Breakpoints such as `md:` fire at a 768 px
  window even though only 536 px is left after the sidebar, so layouts switch to several columns at
  the wrong width.
- **WCAG/Standard**: WCAG 2.2 1.4.10 Reflow (AA)
- **Evidence**: 768×1024: `section[aria-labelledby=insights-trends]` measures x 264–954 (690 px)
  inside a 472 px grid; the inner tiles are 344 px each; the month labels Feb, Apr, Jun and Aug sit
  at x 778–929; page `scrollWidth` 954. Forcing the page grids to
  `grid-template-columns: minmax(0,1fr)` brings the page to 768.
- **Recommendation**: Use `grid-cols-1` (`minmax(0,1fr)`) on page-level stacks, or `min-w-0` on
  their cards. Move tile grids from `md:`/`xl:` to container queries (`@container` with
  `@2xl:grid-cols-2`, as the Book already does) so they respond to the column, not the window.
- **Suggested command**: `/impeccable layout`

#### F24 [P2] The customer header and Highlights strip do not adapt: the headline figures truncate at 768 and the action buttons cover the name at 200% zoom

- **Location**: `pages/customer/CustomerHeader.tsx:212-213` (`HIGHLIGHT_COLS` fixed at 5 columns, no
  breakpoint), `:306` (`truncate text-title`), `:50` (`flex items-start justify-between gap-6`, no
  wrap), `:76` (actions `flex shrink-0`)
- **Category**: Responsive
- **Impact**: On a portrait tablet, the five figures the RM opens the file for (relationship value,
  net worth, monthly surplus, goal, last active) render as "₹1….", "₹24…", "₹2….", "17 d…". At 200%
  zoom and at 390 px the Brief me, Add note and Log a call cluster cannot shrink, squeezes the
  profile line to one word per row, and covers the customer's name.
- **WCAG/Standard**: WCAG 2.2 1.4.4 Resize Text (AA): content lost at 200%
- **Evidence**: 768×1024: Highlights show "₹1....", "₹24...", "₹2....", "17 d..." and the name
  truncates to "Vikram …". 640×400 at DPR 2: the buttons at y ≈ 176–248 cover the `h1`, and the meta
  line wraps as "Age / 44 / · / Mumbai / ·". 390: "Brief me" covers the avatar and the Highlights
  labels overprint as "RelaNetMoSDLast". At 1024 it holds; only "Last active" truncates to "17 days
  a…".
- **Recommendation**: Make the Highlights strip a container-query grid: five columns when there is
  room, 3 + 2 or 2 × 3 below about 760 px of container width, never truncating the figure line
  (truncate only the hint). Let the header row `flex-wrap` so the actions drop under the name when
  the row is narrow, and collapse "Brief me" to an icon button in the compact case, as "Add note"
  already does.
- **Suggested command**: `/impeccable adapt`

#### F25 [P2] Hover-only details cannot be reached by touch: Insights month tooltips vanish on lift or drag, and Radix tooltips never open on tap

- **Location**: `pages/insights/monthFrame.tsx:107` (`onPointerEnter={() => onActive(i)}`);
  `pages/insights/MonthColumns.tsx:52` and `MonthLines.tsx:95`
  (`onPointerLeave={() => setActive(null)}`); no `touch-action` anywhere in `src`;
  `shell/TopBar.tsx:45` and `:56` (chip tooltips); `ui/AllocationBar.tsx:82`
- **Category**: Responsive
- **Impact**: On a tablet, the per-month value in every Insights chart shows only while the finger
  is down, where the finger covers it. Any movement hands the gesture to page scroll and clears it,
  and lifting the finger clears it too. The explanations behind the "As of" and "Demo data" chips
  and the allocation breakdown never appear on tap. The per-month figures are otherwise only in the
  chart's `aria-label`.
- **WCAG/Standard**: Impeccable responsive: broken touch interaction; WCAG 2.2 1.4.13 Content on
  Hover or Focus
- **Evidence**: Synthesized touch (`Input.dispatchTouchEvent`) at 1024×768 and 768×1024 on "Balances
  at each month-end": 1 tooltip while the finger is down, `.bg-chart-tooltip` text null after a 150
  px horizontal drag, 0 tooltips after `touchEnd`. Tapping the "As of 1 Sep 2026" chip gives 0
  `[role=tooltip]` at both widths. The Recharts balance chart in the Book rail, by contrast, keeps
  its tooltip through a touch drag.
- **Recommendation**: Under a coarse pointer, make month bands tap-to-select: set the active month
  on `pointerdown` or click, keep it after `pointerup`, and clear it on an outside tap. Add
  `touch-action: pan-y` to the chart surface so a horizontal scrub stays with the chart. Give the
  chip explanations a tap target (a Popover, as Help already uses), or put the text inline.
- **Suggested command**: `/impeccable adapt`

#### F26 [P2] Controls keep mouse density under a coarse pointer (no `pointer-coarse` variants anywhere)

- **Location**: `shell/Sidebar.tsx:30` (nav links `h-9`) and `:77-83` (Sign out `size="sm"`);
  `ui/DataTable.tsx` sortable header buttons; `pages/customer/RevealField.tsx:99` (Reveal); Copy CIF
  in `CustomerHeader`; Book tabs; "Show chart" in `SummaryBand`; Today's "Whole book" link
- **Category**: Responsive
- **Impact**: On a touch tablet, sort headers, Reveal, Copy CIF and Sign out are well under the 44
  px touch guideline, so taps miss or hit neighbours. WCAG 2.5.8's 24 px minimum is mostly met
  through spacing, so this is a touch-comfort gap rather than an AA failure.
- **WCAG/Standard**: WCAG 2.2 2.5.8 Target Size (Minimum), mostly met; 44 px touch-target guideline
- **Evidence**: Touch emulation at 1024×768: on the Book, 24 of 62 visible targets are under 44 px,
  for example the sort headers "Customer" 72×16, "Relationship value" 121×16 and "Top signal" 75×16,
  the tab "All 38" 48×30, and "Show chart" 107×28. Shell: nav links 207×36, Sign out 28×28.
  Customer: Reveal 60×16, Copy CIF 24×24. Today: "Whole book" 84×16. No `pointer-coarse`,
  `pointer: coarse` or `hover: none` anywhere. The Today queue rows' 20 px buttons are excluded:
  their `after:absolute after:inset-0` hit area covers the row.
- **Recommendation**: Add a coarse-pointer density step: `pointer-coarse:h-11` on nav links, tabs
  and icon buttons, and make the whole `th` the sort hit area (`after:absolute after:inset-0` on the
  header button, as the queue rows already do). Pad inline actions such as Reveal and Copy CIF to a
  44 px box with a transparent hit area so the visual density stays the same.
- **Suggested command**: `/impeccable adapt`

#### F27 [P2] The same "broken / needs attention" surface is mixed in five different danger tints

- **Location**: `features/copilot/Ask.tsx:275`; `pages/record/VerifyBookStrip.tsx:47`;
  `pages/customer/record/ChainCheck.tsx:98`; `ui/Timeline.tsx:118`; `pages/customer/Goals.tsx:319`
  and `:328`; `pages/record/AdviceLedger.tsx:211`
- **Category**: Theming
- **Impact**: A failed Ask answer, a broken chain check, a broken ledger row and a "raise first"
  goal stage all mean the same thing but come out as visibly different pinks and edge strengths
  across pages. Severity stops reading as one system, and every new error surface will invent a
  sixth mix.
- **WCAG/Standard**: Design-token consistency (one token per role)
- **Evidence**: Backgrounds: `bg-danger-soft/50` (`Ask.tsx:275`), `/60` (`VerifyBookStrip.tsx:47`,
  `ChainCheck.tsx:98`), `/45` (`AdviceLedger.tsx:211`), `/40` (`Goals.tsx:328`), and solid
  (`Timeline.tsx:118`, `Goals.tsx:319`). Borders: `border-danger/15` (`Ask.tsx:275`), `/20`
  (`VerifyBookStrip.tsx:47`, `ChainCheck.tsx:98`), `/25` (`Timeline.tsx:118`), `/40`
  (`Goals.tsx:319`). The shared components agree with each other: `Chip.tsx:21`, `Notices.tsx:100`,
  `DeltaPill.tsx:54` and `ErrorState.tsx:72` all use solid `bg-danger-soft text-danger`.
  `tokens.json` has only `danger` and `dangerSoft`, with no wash or edge role.
- **Recommendation**: Add `web.color.dangerWash` (a pale panel fill, about `#FDF2F0`) and
  `dangerEdge` (about `rgba(179,38,30,0.2)`) next to `brandWash`. Replace the eight alpha mixes with
  `bg-danger-wash border-danger-edge`, and keep solid `danger-soft` for chips and pills.
- **Suggested command**: `/impeccable polish`

#### F28 [P2] 47 ad-hoc token/opacity mixes stand in for missing state tokens, and one fails AA

- **Location**: selected edge: `ui/SegmentTabs.tsx:71`, `pages/book/BookTabs.tsx:92`,
  `pages/record/RuleBars.tsx:62` (`ring-brand/25`), `pages/record/AdviceLedger.tsx:97` (`/20`),
  `pages/customer/journey/EventRow.tsx:211` (`/15`), `pages/customer/Journey.tsx:215`
  (`border-brand/30`), `features/copilot/index.tsx:50` (`/35`). Hover edge: `ui/Button.tsx:27`,
  `pages/customer/Journey.tsx:216` (`hover:border-ink-hint/40`) against `ui/Field.tsx:13` (`/45`).
  Text on brand: `pages/record/Intact.tsx:77` (`/75`) and `:88` (`/80`),
  `pages/customer/record/ChainCheck.tsx:163` (`/85`). Text on ink: `shell/Brand.tsx:47` (`/70`),
  `pages/login/Login.tsx:361` (`/80`) and `:377` (`/70`). Ghost hover: `ui/Button.tsx:28`,
  `ui/IconButton.tsx:15`, `shell/Sidebar.tsx:34` (`hover:bg-ink/5 active:bg-ink/8`). Scrim:
  `features/copilot/Panel.tsx:124` (`bg-ink/[0.07]`) against `ui/Dialog.tsx:20` (`bg-overlay`).
  Footer strip: `bg-canvas-top/60` (×8) against `/70` (×3).
- **Category**: Theming, Accessibility
- **Impact**: State colours drift by 5–10% alpha between components that do the same job (a selected
  tab, a pressed filter chip, a pressed copilot button). The secondary text on the green "intact"
  banner falls just below AA.
- **WCAG/Standard**: WCAG 1.4.3 Contrast (Minimum) (AA) for the on-brand caption; token consistency
  for the rest
- **Evidence**: Scanning class candidates with Tailwind 4.3.3's design system found 47 distinct
  colour/alpha classes, used 73 times, over 12 tokens: brand {bg/40, border/20, border/30,
  border/35, ring/15, ring/20, ring/25}, on-brand {text/75, /80, /85, bg/10, /15, /20, border/20},
  on-ink {text/70, /80, bg/10, /12, ring/15, /20}, ink-hint {border/40, /45, decoration/40, /50,
  bg/60}, ink {bg/5, /8, /[0.07]}. On `/record` after "Verify every chain", `span.text-on-brand/75`
  ("· not one word changed · 10:36 pm", 15 px/600 white at 0.75 on `rgb(1,106,77)`) is 4.47:1.
  Rendered ring shadows show three alphas for the same selected role (0.25, 0.2 and 0.15).
- **Recommendation**: Promote the recurring mixes to named tokens in `web.color`: `selectedEdge`
  (one brand alpha for tabs, chips and pressed buttons), `hoverEdge`, `onBrandMuted` (at least 0.80,
  which is 4.86:1), `onInkMuted`, `ghostHover` and `ghostPress`, and `footerWash`. Move the classes
  over to them. Afterwards, a search for `/[0-9]` on colour utilities should return only deliberate
  one-offs.
- **Suggested command**: `/impeccable polish`

#### F29 [P2] Three near-identical muted greys are used interchangeably for the same roles

- **Location**: tokens `color.inkSoft` `#426558`, `inkFaint` `#4F6E61`, `inkHint` `#5A7A6D`. Card
  footers: `ui/Card.tsx:74` (`CardFooter`) against `pages/customer/Goals.tsx:245`,
  `pages/customer/Overview.tsx:424`, `features/copilot/Citations.tsx:111`,
  `features/copilot/VerdictCard.tsx:72`. Series labels: `pages/book/SummaryBand.tsx:223`,
  `pages/book/Preview.tsx:377` against `pages/insights/TrendBand.tsx:108`. Column headers:
  `ui/DataTable.tsx:203`, `pages/record/AdviceLedger.tsx:152` against
  `pages/insights/TopMovers.tsx:58`
- **Category**: Theming
- **Impact**: Adjacent steps differ by only 1.155:1 (soft to faint) and 1.188:1 (faint to hint), so
  nobody can see which one a caption should use. Each page has picked differently, and the same role
  looks slightly different from page to page. This is the root of the caption drift.
- **WCAG/Standard**: Design-token consistency
- **Evidence**: Text nodes rendered across 12 routes: ink-faint 914, ink-soft 521, ink-hint 134.
  Lines pairing `text-caption` with each grey: ink-faint 137, ink-soft 49, ink-hint 14, ink 8. The
  shared `CardFooter` (`text-caption text-ink-soft`, weight 500, `px-5 py-3`) is used once
  (`Overview.tsx:105`), while five hand-rolled copies diverge (`Goals.tsx:245`
  `font-normal text-ink-soft`; `Overview.tsx:424` `font-normal text-ink-faint px-4 py-2.5`;
  `Citations.tsx:111` `font-normal text-ink-faint px-4 py-2`; `VerdictCard.tsx:72`
  `font-normal text-ink-faint`). Basis lines: `SummaryBand.tsx:223` and `Preview.tsx:377` use
  ink-hint, `TrendBand.tsx:108` uses ink-faint. Column headers: `DataTable.tsx:203` is
  `text-caption font-medium text-ink-faint`, sentence case, `border-hairline`; `TopMovers.tsx:58` is
  `text-micro tracking-micro text-ink-faint uppercase` with `border-hairline-soft`, so Insights
  shows "CUSTOMER / MONTH-END BALANCES" where the Book shows "Customer / Relationship value".
- **Recommendation**: Define two muted text roles with written rules: secondary is ink-soft
  (supporting copy, footers) and tertiary is ink-faint (meta, captions, column headers). Keep
  ink-hint for placeholders, icons and disabled states. Route every footer strip through
  `CardFooter`, adding a `note` variant for the 400-weight copy. Pick one column-header treatment
  for `DataTable`, `AdviceLedger` and `TopMovers`.
- **Suggested command**: `/impeccable polish`

#### F30 [P2] Type roles carry a weight that about half the call sites override, and micro is stripped back to a bare 11 px

- **Location**: `tokens.json` `web.type.caption` and `label` (weight 500), `micro` (600, tracking
  0.07em, uppercase); `apps/rm/scripts/tokens-css.mjs:93-95`; overrides throughout, for example
  `pages/access/Access.tsx:244`, `pages/insights/TrendBand.tsx:108` and `:115`,
  `pages/insights/monthFrame.tsx:30`, `features/copilot/Citations.tsx:80` and `:125`,
  `features/copilot/Panel.tsx:226`, `ui/Kbd.tsx:9`
- **Category**: Theming, Implementation Integrity
- **Impact**: The generator says a class is "a role, not a size" with its weight built in. In
  practice caption and label each render in two weights, and micro is overridden in six places. A
  caption's weight depends on the page rather than the role, so the type tokens no longer describe
  what ships. On Insights, the sentence caption under each tile overrides three of micro's four
  properties, sits below the caption scale and truncates.
- **WCAG/Standard**: Design-token consistency (type roles)
- **Evidence**: `font-normal` appears 224 times in `apps/rm/src`: 118 lines pair it with
  `text-caption` and 84 with `text-label`. Computed across 12 routes: 12/16 px at weight 400 on 572
  nodes against 500 on 525; 13/18 px at 400 on 384 against 500 on 878. Micro is reset to
  `text-micro leading-none font-normal tracking-normal` at `monthFrame.tsx:30` (11/11 px, 400) and
  `text-micro leading-4 font-normal tracking-normal` at `TrendBand.tsx:115` (11/16 px, 400). The
  rendered detector flags `tiny-text` 11 px body text 6 times on `/insights` (for example "Money in
  and out during each month, per statements").
- **Recommendation**: Make the scale match its use without changing existing roles: add a 400-weight
  variant of caption and label (for example `captionPlain` and `labelPlain`) and an 11 px `axis`
  role for numeric micro text that is not uppercase, then replace the `font-normal` and
  `tracking-normal` overrides with those roles. Use `text-caption` for the Insights source lines.
- **Suggested command**: `/impeccable typeset`

#### F31 [P2] Motion duration tokens are emitted under a namespace Tailwind never reads, so every class transition is off-token

- **Location**: `apps/rm/scripts/tokens-css.mjs:139-147` →
  `src/styles/tokens.generated.css:173-179`; 44 class uses such as `ui/DataTable.tsx:294`
  (`duration-100`), `ui/SegmentTabs.tsx:68` (`duration-150`), `pages/record/VerifyBookStrip.tsx:45`
  (`duration-300`), `pages/record/RuleBars.tsx:76` (`duration-200`)
- **Category**: Theming
- **Impact**: The tokens define tap 90, feedback 140, state 220 and move 320 ms, but
  `duration-feedback` cannot be written as a class. Authors fall back to Tailwind's numeric 100,
  150, 200 and 300, none of which matches a token. Hover and press feedback in classes and the
  overlay and JS motion therefore run on two different clocks, and a change to `tokens.json` motion
  never reaches the 44 class transitions.
- **WCAG/Standard**: Design-token pipeline integrity
- **Evidence**: Against the app's own `app.css`, Tailwind 4.3.3's design system compiles
  `duration-feedback` and `duration-state` to nothing, while `duration-150` compiles to
  `transition-duration: 150ms`. A control theme with `--transition-duration-feedback: 140ms` makes
  `duration-feedback` compile to `transition-duration: var(--transition-duration-feedback)`. The
  token values are consumed only by `app.css` keyframe utilities (6 `var(--duration-*)` uses) and
  `lib/motion.ts`.
- **Recommendation**: In `tokens-css.mjs`, also emit `--transition-duration-<name>` for each
  `motion.duration` entry (keep the `--duration-*` aliases `app.css` uses). Then replace
  `duration-100/150/200/300` with `duration-tap/feedback/state/move`.
- **Suggested command**: `/impeccable animate`

#### F32 [P2] Chart comparison, band-edge and context marks use palette steps below 3:1

- **Location**: `ui/charts.tsx:573-574` (`BAND_EDGE` = sequential 300, `BAND_COMPARISON` =
  neutral 400) and `:389` (non-highlighted bars neutral 300); `pages/insights/MonthLines.tsx:33-38`
  (comparison line); `pages/customer/Money.tsx:146`; `pages/insights/TopMovers.tsx:211`;
  `pages/insights/MonthColumns.tsx` (`bg-chart-neutral-300`)
- **Category**: Theming, Accessibility
- **Impact**: Data lines that carry information, such as the "Out" series in Insights' money in vs
  out, the "With IDBI" line in the Book preview and the goal band's low and high edges, sit at
  2.3–2.5:1 on the white card, and context bars at 1.74:1. They are hard to read under glare or with
  low vision, although the generator comment says the chart palette is validated to at least 3:1 on
  surface.
- **WCAG/Standard**: WCAG 1.4.11 Non-text Contrast (AA) for graphical objects
- **Evidence**: On surface `#FFFFFF`: neutral-400 `#9DA7A4` 2.47:1, seq-300 `#6DBA9B` 2.30:1,
  neutral-300 `#BEC6C3` 1.74:1; neutral-500 3.62:1, seq-400 3.90:1, and every categorical colour at
  least 3.21:1. Neutral-400 strokes render on `/insights` (6 paths), `/customers/:cif/money` and
  `/goals`; neutral-300 bars on `/insights` (23 nodes). `tokens-css.mjs:76` says "chart (validated:
  CVD-safe adjacent, first three all-pairs, >= 3:1 on surface)", but that validation covers only the
  categorical set.
- **Recommendation**: Add role tokens to `tokens.json` `chart`: `comparison` = neutral-500 (or 600),
  `bandEdge` = sequential 400, and `contextBar` = neutral-500 where the bars carry meaning.
  Reference those roles in `charts.tsx`, `MonthLines`, `Money` and `TopMovers` instead of raw ramp
  steps, and extend the validation note to cover them.
- **Suggested command**: `/impeccable colorize`

#### F33 [P2] The status vocabulary has been forked page by page: severity and segment colours differ by screen

- **Location**: `ui/status.tsx:20-31` (`SEVERITY`, `SEVERITY_ICON`, `SEGMENT`);
  `pages/today/parts.tsx:41-51` (re-declared `SEVERITY_ICON` and `SEVERITY_INK`);
  `features/copilot/Brief.tsx:213-226` (a second `SeverityMark`); `pages/book/SeverityMark.tsx` (a
  different `SeverityMark`); `pages/insights/Ranked.tsx:95-99` (`SEVERITY_FILL`);
  `pages/book/columns.tsx:45-49` (`SEGMENT_TINT` overriding `SegmentBadge`);
  `pages/book/SummaryBand.tsx:12-16` against `pages/insights/Composition.tsx:161-165` (two
  `SEGMENT_FILL` maps)
- **Category**: Implementation Integrity
- **Impact**: The kit promises that "At risk is the same words in the same colour on every page",
  but "Worth knowing" is an olive chip on Overview, a faint grey icon on Today and a green icon in
  the copilot Brief. "Priority" is a black chip on Today and the customer header but a pale green
  chip in the Book table and preview. Affluent and Mass are different greens on the Book and on
  Insights. An RM moving between pages has to relearn what the colours mean.
- **WCAG/Standard**: Design-system consistency (Nielsen heuristic 4)
- **Evidence**: Opportunity tone: `status.tsx`
  `opportunity: { label: 'Worth knowing', tone: 'budget' }`; `today/parts.tsx`
  `opportunity: 'text-ink-faint'`; `Brief.tsx` `'text-brand'`. Segment: `status.tsx`
  `priority: { tone: 'ink' }` against `columns.tsx` `priority: 'bg-brand-soft text-ink'`, both
  visible on the customer Overview and the Book. Fills: `SummaryBand`
  `affluent: 'bg-chart-seq-350', mass: 'bg-chart-seq-150'` against `Composition`
  `affluent: 'bg-chart-seq-400', mass: 'bg-chart-seq-300'`. Two components named `SeverityMark`,
  with different markup and colours.
- **Recommendation**: Move icon, ink, fill and chip tone for each severity and segment into
  `ui/status.tsx` as one record per level. Export a single `SeverityMark` with size variants, and
  one segment fill map used by both stacked bars. Delete the local maps. If the Book needs a quieter
  segment chip, make it a `SegmentBadge` variant rather than a className override.
- **Suggested command**: `/impeccable polish`

#### F34 [P2] Kit components have been forked into pages, and the originals left behind as `/kit`-only dead code

- **Location**: `ui/Stat.tsx` against `pages/today/KpiStrip.tsx:51-110` and
  `pages/book/SummaryBand.tsx:128-160`; `ui/MaskedField.tsx` against
  `pages/customer/RevealField.tsx`; `ui/SegmentTabs.tsx` against `pages/book/BookTabs.tsx`;
  `KindSwitch` at `pages/customer/NoteDialog.tsx:306` and `pages/customer/journey/Composer.tsx:183`;
  `ui/charts.tsx` `BarChart`, `Donut`, `SmallMultiple`; `ui/Timeline.tsx:197` `UdayMark`;
  `ui/DataTable.tsx:364` `CellStack`; `pages/placeholder.tsx` (`KpiStripSkeleton`,
  `ListCardSkeleton`, `ChartGridSkeleton`, `ProseCardSkeleton`); `lib/format.ts` `formatAgo`
- **Category**: Implementation Integrity
- **Impact**: `/kit`, which the README calls the reference for every component, shows Stat,
  MaskedField, BarChart, Donut and SmallMultiple, none of which production uses. The live versions
  are page-local copies with their own spacing, labels and order. A fix made in the kit never
  reaches the screens, and anyone reading the kit gets a false picture of the product.
- **WCAG/Standard**: Implementation integrity: design-system drift and dead code
- **Evidence**: An import scan of every non-test page, feature and shell file against `ui/index.ts`
  found no production import of `Stat`, `MaskedField`, `BarChart`, `Donut`, `SmallMultiple`,
  `CellStack` or `UdayMark`; `UdayMark` is not rendered on `/kit` either. The four placeholder
  skeletons are declared and referenced nowhere, and `formatAgo` is referenced only in
  `format.test.ts`. The forks say so in their comments: `KpiStrip.tsx` "drawn like the kit's `Stat`
  ... with three things ... `Stat` does not do yet"; `RevealField.tsx` "The kit's `MaskedField` asks
  for the reason as free text; this one offers...". `Composer.tsx:182` says "the same control the
  header's dialog uses", yet it uses a different order (Note/Call against Call/Note), different
  labels ("Note" against "A note") and a different size (`text-caption px-2.5` against
  `text-label px-3`). `SegmentTabs.tsx`'s doc still reads "The strip over the book", though the Book
  uses `BookTabs`.
- **Recommendation**: Fold each fork back into the kit as a variant: a `Stat` with `outOf` and a
  legend, a `MaskedField` `reasons` prop, a `SegmentTabs` grouped and fit mode, and a shared
  `ToggleGroup` for `KindSwitch`. Then delete the page copies, and delete the kit exports and
  skeletons nothing uses. Have `scripts/check-bundle.mjs` or a lint rule fail when a `ui/` export is
  imported only by `Kit.tsx`.
- **Suggested command**: `/impeccable distill`

#### F35 [P2] The chart system is split: pages hand-roll month charts, sparklines, stacked bars and ranked bars beside the kit's versions

- **Location**: `pages/insights/MonthLines.tsx`, `MonthColumns.tsx` and `monthFrame.tsx` (against
  `ui/charts.tsx` `SmallMultiple`, unused); `pages/insights/TopMovers.tsx:156-243` `WindowSparkline`
  (against `ui/Sparkline`); `pages/insights/Composition.tsx:233-258` `StackedBar` and
  `pages/book/SummaryBand.tsx:250-266` (against `ui/AllocationBar`); `pages/insights/Ranked.tsx:30`
  `RankedBars` and `pages/record/RuleBars.tsx` (against `ui/charts.tsx` `BarChart`, unused)
- **Category**: Implementation Integrity
- **Impact**: The header of `ui/charts.tsx` says "Every chart on the console goes through one of
  these", but none of the Insights charts do. Axis, tooltip, hover and colour rules now live in five
  places and drift: two ranked-bar lists have different row anatomy, and of three stacked bars one
  uses width percentages with no minimum, so a small segment can vanish on the Book but not on
  Insights.
- **WCAG/Standard**: Design-system consistency
- **Evidence**: `Composition.tsx`'s `StackedBar` matches `AllocationBar`'s bar line for line
  (`flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full`,
  `flexGrow: p.value, flexBasis: 0, minWidth: 3`). `SummaryBand`'s segment bar uses `gap-0.5` and
  ``style={{ width: `${s.sharePct}%` }}`` with no `minWidth`. `monthFrame.tsx:7-11` explains the
  fork ("needs two things the kit does not offer yet"). `BarChart`, `Donut` and `SmallMultiple` have
  no production import.
- **Recommendation**: Add the two missing capabilities to the kit (an unfilled line multiple with a
  latest-month axis, and a window-highlight sparkline) and move the Insights tiles onto it. Extract
  one `StackedBar` and one `RankedBars` into `ui/` and use them on the Book, Insights and the Advice
  record. Delete `BarChart` and `Donut` if no page will use them.
- **Suggested command**: `/impeccable distill`

#### F36 [P2] The same month-end balance series is drawn three different ways, one of which the code itself calls misleading

- **Location**: `pages/book/SummaryBand.tsx:209-221` and `pages/book/Preview.tsx:362` (`AreaChart`
  with `yAxis={false}`, `zeroBased={false}`); `pages/customer/Money.tsx:216` (`AreaChart` with a
  zero-based axis); `pages/insights/MonthLines.tsx:8-12` (line, no fill); the default lives in
  `ui/charts.tsx`
- **Category**: Implementation Integrity
- **Impact**: On the Book (summary band and preview rail) the area is shaded down to an unlabelled
  floor that is not zero, so a 25% rise looks like several times that. The Insights code calls this
  misleading, and Money draws the same kind of series from ₹0 with an axis. An RM comparing growth
  on the Book with Insights or Money sees different slopes for the same numbers.
- **WCAG/Standard**: Data-visualisation honesty
- **Evidence**: `MonthLines.tsx`: "an area shaded down to a floor that is not zero would draw a 25%
  rise as a five-fold one". `AreaChart` with `yAxis={false}` and `zeroBased={false}` falls back to
  `domain: ['auto','auto']`, and Recharts fills to the domain minimum. On the Book the series from
  ₹4.26Cr to ₹5.35Cr (+25.6%) climbs about 38 px of a 70 px plot; zero-based, it would climb about
  14 px. Money shows ₹0 to ₹80L ticks for the same kind of series.
- **Recommendation**: Pick one rule for balance series that are not zero-based and apply it in the
  kit: either `AreaChart` drops the fill when not zero-based (a line, as on Insights), or the Book
  charts set `zeroBased`. Then the Book, Money and Insights agree.
- **Suggested command**: `/impeccable polish`

#### F37 [P2] Two rupee short-form formatters disagree, so one customer's value can read differently on the Book and on the customer page

- **Location**: `apps/rm/src/lib/format.ts:69-90` (`shortNumber`, used by `<Money short>`) against
  `packages/core/src/rm/format.ts:35-60` (`rupeesShort` and `rupeesTitle`, used through
  `pages/customer/prose.ts` → `figures.tsx` `ShortInr`/`ProseInr`, `next-actions.ts` and the
  copilot's `tiles.ts`)
- **Category**: Implementation Integrity
- **Impact**: For values near a unit boundary, the Book row and Today print one figure and the
  customer header another, for the same customer. Negative figures also switch between a true minus
  and a hyphen. `format.ts` claims parity ("must not read ₹1.9L"), but no test enforces it.
- **WCAG/Standard**: Implementation integrity: one figure, one format
- **Evidence**: Both formatters run side by side: 99,70,000 → `Money` "₹1Cr" against `ShortInr`
  "₹99.7L"; 99,99,000 → "₹1Cr" against "₹100L"; 99,960 → "₹1L" against "₹100k"; 1,23,45,67,890 →
  "₹123Cr" against "₹123.5Cr"; −2,23,000 → "−₹2.23L" against "-₹2.23L". The `format.ts` docstring:
  'so ₹99,96,000 reads "1Cr", never "100L"'. No current book value falls in the 99.5L–1Cr band, so
  this is not visible today.
- **Recommendation**: Use one implementation in the console: route `ShortInr`, `ProseInr`,
  `next-actions.ts` and the copilot tiles through `lib/format.ts` (or fix core's unit choice to
  round first, as `shortNumber` does), and add a shared test table that every formatter must pass.
- **Suggested command**: `/impeccable harden`

#### F38 [P2] Eyebrows above headings, which the craft floor bans outright

- **Location**: `pages/record/Record.tsx:41-48` ("ADVICE RECORD" above the `h1` "Mis-sales
  prevented"); `pages/customer/Goals.tsx:110-111` (a `CardHeader` `h2` "GOAL" directly above the
  `h2` "Retirement"); `pages/login/Login.tsx:64-70` ("FOR IDBI BANK · RELATIONSHIP MANAGER DESK"
  above "Dhan Sarthi"); `features/copilot/VerdictCard.tsx:33-41` ("BLOCKED" or "PASS" above the
  product name)
- **Category**: Implementation Integrity
- **Impact**: Each adds a second uppercase label to read before every title, and on Goals it
  produces two `h2`s in a row, one of which is only a label.
- **WCAG/Standard**: Impeccable craft floor: the kicker/eyebrow ban
- **Evidence**: The `Record.tsx` comment calls it one: "The eyebrow above the title carries the
  sidebar's name". On Login the rendered detector reports `all-caps-body`
  (`text-transform: uppercase` on 41 characters) on `p.text-micro.tracking-micro`.
- **Recommendation**: Drop the eyebrow and let the heading carry the page. On the Advice record, the
  active sidebar item already names the page. On Goals, put the health dot beside the "Retirement"
  heading and remove the "Goal" `CardHeader`. In `VerdictCard`, put Blocked or Pass in a chip beside
  the product name. On Login, set the product name and put the bank on its own quiet line below.
- **Suggested command**: `/impeccable typeset`

#### F39 [P2] Structured facts are recovered with regular expressions from the API's English sentences

- **Location**: `pages/customer/next-actions.ts:93-96`, `:114`, `:121`, `:128`, `:147`, `:214`;
  `pages/record/advice.ts:115` (`refusedStake`); `pages/book/rows.ts:181` (`splitSignalTitle`);
  `pages/today/derive.ts:429`; `pages/customer/prose.ts:22-30` (`shortenFigures`)
- **Category**: Implementation Integrity
- **Impact**: Figures and labels the RM acts on, such as the months to clear a card, the cover
  amount, the product name, the cap amount and the Advice record's headline "₹3L a month", depend on
  the server's exact wording. If the API rewords a sentence, the console silently falls back or
  re-labels, with no type error and no failing test. For example, any refusal whose audit text does
  not literally contain "one-off" is summed as monthly.
- **WCAG/Standard**: Implementation integrity: a repeated shortcut
- **Evidence**: `const months = /clears in (\d+) months?/.exec(action.detail)?.[1]`;
  `/^Take (₹[\d.]+ (?:crore|lakh)) of cover/.exec(action.label)`;
  `if (/\bone-off\b/i.test(item.recorded)) oneOff += item.amount; else monthly += item.amount`. The
  refusals API returns `amount` with no cadence field (keys: id, at, cif, name, productId,
  productName, amount, source, verdict, ruleId, rulesPassed, spoken, recorded, hash, prevHash). In
  current data all 34 count as monthly (₹2,99,600).
- **Recommendation**: Add the structured fields to the contracts (months, cover amount, product,
  cadence, title head and tail) and read those instead. Until then, keep the regular expressions
  only as a fallback pinned by tests against the API's current wording.
- **Suggested command**: `/impeccable harden`

### P3 Polish

#### F40 [P3] JavaScript smooth scrolls ignore `prefers-reduced-motion`

- **Location**: `pages/customer/CustomerHeader.tsx:103`
  (`window.scrollTo({ top: 0, behavior: 'smooth' })`); `pages/record/AdviceLedger.tsx:132`
  (`scrollIntoView({ … behavior: 'smooth' })`)
- **Category**: Accessibility
- **Impact**: Users who asked for reduced motion still get a long animated scroll: 1600 px or more
  on the Money tab, and a full ledger jump on the Advice record. The CSS
  `scroll-behavior: auto !important` in `app.css` cannot override an explicit `behavior: 'smooth'`.
- **WCAG/Standard**: WCAG 2.3.3 Animation from Interactions (AAA); Impeccable motion-sensitivity
  check
- **Evidence**: With `prefers-reduced-motion: reduce` emulated, "Back to the top" from `scrollY`
  1600, sampled every 60 ms: 1600 → 1576 → 1388 → 800 → 505 → 291. `features/copilot/Ask.tsx:59`
  already does `behavior: reduce ? 'auto' : 'smooth'`.
- **Recommendation**: Use the same reduced-motion check at both call sites.
- **Suggested command**: `/impeccable animate`

#### F41 [P3] Type ignores the browser's default font-size setting (px-locked type tokens)

- **Location**: `src/styles/tokens.generated.css:108-126` (for example `--text-body: 14px`,
  `--text-display: 28px`), generated by `apps/rm/scripts/tokens-css.mjs` from
  `packages/design/tokens.json`
- **Category**: Responsive
- **Impact**: An RM who raises Chrome's font size (Settings, Appearance, Font size) sees no change
  anywhere on the console. Page zoom still works, so WCAG 1.4.4 is met that way.
- **WCAG/Standard**: WCAG 2.2 1.4.4 Resize Text (met through zoom)
- **Evidence**: `Page.setFontSizes({ standard: 32 })` at 1280×800 on `/book`: `html` computes 32 px,
  but `body` 14 px, `h1` 28 px and `td` 14 px.
- **Recommendation**: Emit the type scale in rem (14 px becomes 0.875rem) from `tokens-css.mjs`.
  Keep layout sizes (sidebar, rail, row heights) in px if density must hold, and check that rows
  grow with their text.
- **Suggested command**: `/impeccable typeset`

#### F42 [P3] Token values re-typed as literals in TypeScript and class names

- **Location**: top bar height 56: `ui/DataTable.tsx:122`, `ui/Timeline.tsx:50`,
  `pages/record/AdviceLedger.tsx:150`, `pages/book/Book.tsx:246` and `:377`,
  `pages/customer/CustomerHeader.tsx:123`. Rail: `pages/book/Book.tsx:61`. Radii:
  `ui/status.tsx:113` and `:154`, `pages/insights/Composition.tsx:211` and `:285`,
  `pages/insights/MonthColumns.tsx:81`, `pages/record/RuleBars.tsx:76`. Charts: `ui/charts.tsx:92`,
  `:344`, `:449-455`. Merge config: `lib/cn.ts:15-25`. Defaults: `ui/MaskedField.tsx:69`,
  `pages/customer/RevealField.tsx:89`, `shell/Sidebar.tsx:73`, `ui/Field.tsx:54`
- **Category**: Theming
- **Impact**: Nothing is wrong on screen today, but each literal is a silent fork. If the top bar
  height, the rail or the elevation set changes in `tokens.json`, sticky headers will misalign, the
  laptop rail will ignore it, and tailwind-merge will stop de-duplicating new shadow or spacing
  names.
- **WCAG/Standard**: Design-token pipeline integrity
- **Evidence**: `stickyTop = 56` and `style={{ top: 56 }}` sit beside `web.size.topbar = 56` and the
  existing `top-topbar` class. `Book.tsx:61` sets `'--spacing-rail': '380px'`, a second rail size
  that `tokens.json` does not have (rail: 440). Off-scale radii: `rounded-[1px]`, `rounded-[2px]`
  ×3, `rounded-t-[3px]` and `rounded-r-[4px]` (which equals `radius-xs`). `charts.tsx:92`
  (`fontSize: 11`) and `:450` (`fontSize={12}`) do not read `web.type`, and `charts.tsx:344` and
  `:449` use `chart.tooltip`, the tooltip background role, as label ink. `cn.ts:15` hard-codes the
  shadow list and `:16-25` a spacing list. The generator resets only colour, text, radius and
  shadow, so Tailwind's default `tracking-wide`, `leading-tight` and `leading-normal` still compile
  and are used.
- **Recommendation**: Use `top-topbar` or `var(--spacing-topbar)` (or import `web.size.topbar`) for
  sticky offsets. Add a laptop rail size to `web.size`. Add a 2 px "mark" radius to `web.radius` and
  use `rounded-xs` for 4 px. Read chart font sizes from `web.type` and label ink from `color.ink`.
  Derive the `cn.ts` lists from the tokens. Reset `--tracking-*` and `--leading-*` in the generator
  once their four callers move to roles.
- **Suggested command**: `/impeccable polish`

#### F43 [P3] Mobile-only colour tokens leak into the console theme as valid classes

- **Location**: `apps/rm/scripts/tokens-css.mjs:56-61` (emits all of `tokens.json` `color`) →
  `tokens.generated.css:10-42`
- **Category**: Theming
- **Impact**: `bg-scrim`, `bg-hero`, `text-ink-mid` and the canvas washes all compile in the console
  beside their web equivalents (`bg-overlay`, `bg-brand`). That makes it easy to pick the wrong name
  for a role, and it undercuts the generator's promise that the theme holds only what the console
  means to use.
- **WCAG/Standard**: Design-token consistency
- **Evidence**: 14 emitted colour tokens have no use in `apps/rm/src`: ink-mid, ground-fade, hero,
  scrim, scrim-fade, scrim-heavy, scrim-deep, canvas-bloom, canvas-floor, sheet-wash,
  canvas-fade-in, canvas-fade-out, pill-wash, surface-raised. `bg-scrim`, `bg-hero` and
  `text-ink-mid` compile. Same-value aliases: hero = brand = `#016A4D`, on-ink = ground = `#F6F2EA`.
- **Recommendation**: Give the generator an explicit console allow-list and emit only the shared
  colours the console uses, plus `web.*`, so a mobile-only token cannot be reached from a console
  class.
- **Suggested command**: `/impeccable distill`

#### F44 [P3] The sign-in panel's glow and grid lines are stock decoration

- **Location**: `pages/login/Login.tsx:338-355` (a radial-gradient glow plus a 56 px masked grid)
- **Category**: Implementation Integrity
- **Impact**: The split screen and the preview card are what the spec asks for
  (`docs/product/rm-console.md`, Sign in). The glow and grid on top of them are the stock SaaS
  treatment: they could belong to any product and add nothing specific to the desk.
- **WCAG/Standard**: Impeccable implementation integrity: structure interchangeable with an
  unrelated product
- **Evidence**: The rendered detector reports `codex-grid-background` (a two-axis grid-line gradient
  background) on `/login` at 1440 and at 390. Its `ai-color-palette` call on the same gradient is a
  false positive: the hue is brand `#016A4D`.
- **Recommendation**: Drop the grid and the glow. Keep the deep-green panel, the display line and
  the preview card.
- **Suggested command**: `/impeccable quieter`

#### F45 [P3] Two lines of copy claim more than the demo shows (a wording decision for the owner)

- **Location**: `pages/record/Record.tsx:41-48` (title "Mis-sales prevented");
  `pages/login/Login.tsx:362` ("Uday runs the daily loop for hundreds of customers")
- **Category**: Implementation Integrity
- **Impact**: On an audit page, "Mis-sales prevented: 34" claims an outcome, while the ledger only
  shows that 34 refusals happened, some for a missed repayment or no tax benefit, which are not
  mis-sales. The sign-in page promises "hundreds" of customers where the demo desks hold 38 and 12.
- **WCAG/Standard**: Implementation integrity: copy must not overclaim
- **Evidence**: The page's own subline is accurate ("28 customers in your book had a sale refused").
  The rule bars include "Missed repayment 3" and "No tax benefit to claim 3". Both phrases come from
  the spec: "Mis-sales prevented" is its defined metric and page title
  (`docs/product/rm-console.md:96`, `:171`), and "hundreds" is its product thesis (`:21`). The code
  follows the spec, so this is not a code defect.
- **Recommendation**: The owner decides. If the wording changes, title the page after what it holds
  ("Refused sales" or "Advice record") and keep "mis-sale" for the explanation, and replace
  "hundreds" with a claim the demo can show.
- **Suggested command**: `/impeccable clarify`

## Patterns & Systemic Issues

- **Contrast-bearing tokens were never checked against the surfaces they sit on.** The focus ring is
  1.7:1 (F02), the field border 1.25:1 (F14), ink-hint fails on 8 of the 9 surface tokens measured
  (F15), on-brand at 0.75 alpha is 4.47:1 (F28), and chart comparison and band-edge steps are
  2.3–2.5:1 (F32). The generator validates only the categorical chart colours. One check in
  `tokens-css.mjs` (each text role at 4.5:1 and each non-text role at 3:1 against every surface
  token) would have caught all five.
- **Overlay behaviour is left to each caller.** Focus return (F05) and height capping (F04) are
  missing from the shared `Dialog` and `CommandPalette` wrappers, and `DialogTrigger` goes unused.
  The copilot is the one overlay that restores focus, because it does so itself. Fixing the two
  wrappers fixes every dialog.
- **Layout is keyed to the window, and the window is never small.** The sidebar and gutters are
  fixed at every width (F03), and `md:`/`xl:` breakpoints fire on window width while 232 px of it is
  taken (F23). Fixed-width tables (F22), a fixed five-column strip (F24) and fixed-width rail and
  toolbar tracks (F08) all assume a 1280 px window. The Book's toolbar, tabs and band already use
  container queries correctly; they are the model for the rest.
- **When the kit lacks one capability, pages fork it, and the original stays behind.** Stat,
  MaskedField, SegmentTabs, `KindSwitch`, the month charts, sparklines, stacked bars, ranked bars
  and the severity and segment maps were all rebuilt in pages (F33–F35), and the fork comments say
  which capability was missing. The rule to adopt: extend the kit, never fork it, and fail the build
  on a `ui/` export only the Kit imports.
- **Roles live in modifiers instead of tokens.** There are 47 colour/alpha mixes (F27, F28), 224
  `font-normal` overrides (F30) and numeric `duration-*` classes where duration tokens exist but
  cannot be reached (F31). The token vocabulary lacks the roles authors need (selected edge, danger
  wash, plain caption, chart comparison), so they improvise per page.
- **Data arrives in the wrong shape for the screen.** Whole collections are fetched for one number
  (F21), facts are parsed out of English sentences (F39), two rupee formatters disagree (F37), and a
  share is printed under the wrong base (F01). The contracts lack the light, structured fields the
  console needs.
- **Mouse is assumed.** Details live only in hover tooltips, month charts react to `pointerenter`,
  and there is no `pointer-coarse` density step (F25, F26).
- **Loading is serial.** A route's data waits for its chunk and then for React's 300 ms throttle
  (F16), behind a 571 kB entry (F17), while the speculative preload competes for the same bandwidth
  (F18).

## Positive Findings

Accessibility

- axe-core 4.10.2 on `/login`, `/`, `/book` with and without the rail, all 5 customer tabs,
  `/insights`, `/record`, `/access`, the 404, the palette, the Add note and Reveal dialogs and the
  copilot found **zero critical or serious violations**. Only the moderate structural items above
  remained.
- Text contrast holds: a DOM-wide scan, composited through opacity and backgrounds, found no failing
  informative text on any page. ink-soft is 5.37–6.49:1 and ink-faint 4.65–5.62:1 on every surface;
  chips are 5.34–12.34:1, tooltip muted text 6.53:1, chart axis ticks 4.73:1 on white.
- Modal focus traps are correct: Note, Log a call, Reveal and Cmd-K cycle Tab and Shift-Tab inside,
  start on a sensible control and close on Esc. The non-modal copilot moves focus in on open and
  restores it to "Brief me" on Esc.
- Tables are done properly: a visually hidden `<caption>`, `th scope="col"`, sortable headers as
  buttons whose `aria-sort` updates, rows that open with Enter or Space and move with the arrows,
  and Esc that closes the preview with focus kept on the row.
- Live regions are used where they matter: Sonner's polite region for toasts ("CIF copied" is
  announced), the Book count in `aria-live`, `role=log` for copilot answers, `role=alert` in
  `ErrorState` and for a failed sign-in, and `role=status` in `LoadingRegion` with silent
  `aria-hidden` skeletons.
- The Insights charts set the standard: each `figure[role=img]` label lists every month's value, and
  the sparklines name the person and the trend ("down 38.3% in the last three").
- The skip link works, landmarks are labelled (nav "Main", nav "Customer file", aside "Customer
  details", aside "Preview of …"), each app page has one `h1`, and `lang` is `en-IN`.
- Forms are wired properly: `Field` ties label and input through `useId` and swaps
  `aria-describedby` from hint to error with `aria-invalid`; `IconButton` requires a label; the
  Reveal reasons are `aria-pressed` toggles in a labelled group; input focus shows as a brand border
  at 6.62:1.
- Reduced motion is handled with intent: `MotionConfig reducedMotion="user"` keeps an opacity-only
  fade on the copilot, and the CSS keyframes collapse to a single 1 ms run, so the skeleton shimmer
  and overlays stop looping without losing any state change.

Performance

- The API is not the bottleneck: every read the console makes has a median of 1.0–5.2 ms through the
  proxy, and production CloudFront gzips `/api`.
- Route splitting is thorough: 11 lazy pages, recharts kept out of the entry, react and lucide in
  cacheable vendor chunks, and `/kit` kept out of the production build by
  `scripts/check-bundle.mjs`.
- Layout is stable (CLS 0.0005 on every route; skeletons match the final layout), the main thread
  stays light (TBT at most 63 ms at 4x CPU), and nothing leaks (heap 12.39 → 12.69 → 12.90 MB over
  three full walks; DOM nodes and listeners identical after each).
- Interactions are responsive at 4x CPU: Book search INP at most 24 ms, customer tab switches 71–109
  ms, SPA navigation 70–220 ms once preloaded, and no re-renders while idle.
- Assets are cheap: no raster images, no web fonts and one 13.6 kB gzipped stylesheet. Recharts
  animation is off everywhere, the compact customer header uses an `IntersectionObserver`, and
  layout reads happen only in effects and observer callbacks. The access-logged customer read is
  never refetched behind the RM's back.

Responsive

- Zero horizontal page overflow on all 12 pages at 1600, 1440, 1280 and 1024 px, and the 1280
  layouts (Today, Book with the rail, the customer file) are dense and clean.
- The Book table fits its columns to its own measured width with a meaningful drop order (`fit.ts`),
  so it never overflows inside the supported range: 6 columns at 1280, 3 beside the rail.
- Container queries are already the primitive in the Book (toolbar, tabs, band), and the segment
  tabs scroll inside their own box rather than the page. Charts re-fit on a live resize from 1600 to
  1024 and back.
- Sign-in reflows cleanly at 390×844, and the copilot panel's own width is responsive and fits
  at 1024.
- Under synthesized touch, Book tabs, row-to-rail, Cmd-K from the top bar, the copilot tabs and the
  rail chart's tooltip drag all work.

Theming

- No hard-coded colours anywhere in `apps/rm/src`, no arbitrary colour or font-size classes, and
  Tailwind's own palette, type scale, radii and shadows reset so off-system values cannot creep in.
  All of about 839 compiled utility candidates resolve.
- Every rendered colour, font size and shadow across 12 routes maps to a token; the generated theme
  is byte-identical to a fresh build, gitignored and rebuilt before dev and build; the favicon comes
  from the same brand token.
- Charts and JS motion import `tokens.json` through `@dhan/design`, and tailwind-merge is extended
  with the token role names, so `cn('text-label', 'text-ink')` keeps both.
- Browser surfaces are themed from the palette: `::selection`, `caret-color`, `::placeholder`,
  hairline scrollbars, a global `:focus-visible`, `text-underline-offset` and a `tabular` utility
  for figures.

Implementation Integrity

- The shared primitives (`Chip`, `Notices`, `DeltaPill`, `ErrorState`, `Button`, `DataTable`) use
  one consistent token vocabulary; the drift is in page-level variants.
- The data is labelled honestly where it matters most: the "Demo data" chip, copilot text "Written
  by the rules from the record", the rule count from `@dhan/core`'s `ruleBook`, and wallet share
  qualified as "% of balances" in the Book strip and the preview rail.
- Every kit export goes through one barrel (`ui/index.ts`), so the drift above is easy to find and
  to reverse.

## Recommended Actions

1. **[P1] `/impeccable clarify`**: fix the "82% IDBI" line under Relationship value on the Book row
   and the customer header: show With IDBI in rupees, keep "% of balances" wherever a share appears,
   show it at 100% too, and label the balances sparkline (F01).
2. **[P1] `/impeccable harden`**: make the focus ring opaque brand at 2 px with a 2 px offset (F02);
   restore focus in the shared `Dialog` and `CommandPalette` wrappers and after Reveal (F05); add a
   roving tabindex to `DataTable` and follow focus only on arrow keys in the Book (F06); add
   per-route titles and a route-change announcement (F07).
3. **[P1] `/impeccable adapt`**: give the shell an icon rail below about 1100 px and a drawer below
   about 768 px, with a shrinkable top bar (F03); cap the dialog height and make its footer sticky
   (F04); make the Book's band, toolbar and rail work at 1024, with the rail as an overlay sheet
   below about 1100 px (F08).
4. **[P2] `/impeccable harden`**: the remaining accessibility gaps: chart focus stop and label
   (F09), `aria-label` on spans (F10), Cmd-K active descendant and count (F11), focus on the first
   invalid field (F12), headings and landmarks (F13), ink-hint on tints (F15). Also one rupee
   formatter with a shared test table (F37), and tests or contract fields for the regex-parsed facts
   (F39).
5. **[P2] `/impeccable optimize`**: prefetch each route's data alongside its chunk (F16); drop zod
   and the full motion bundle from the entry and restore the 500 kB warning (F17); defer and stage
   the idle preload (F18); lazy-load recharts on the Book (F19); stop fetching the whole book and
   refusal ledger for single figures (F21).
6. **[P2] `/impeccable animate`**: snap the Book rail's grid, animate only transform and opacity,
   and fit columns to the target width (F20); emit duration tokens Tailwind can read and move the 44
   class transitions onto them (F31).
7. **[P2] `/impeccable adapt`**: scroll containers for the Advice record and Access log tables
   (F22); a container-query Highlights strip and a wrapping customer header (F24); tap-to-select
   month charts and tappable chip explanations (F25); a coarse-pointer density step (F26).
8. **[P2] `/impeccable layout`**: `minmax(0,1fr)` page stacks and container-query tile grids on
   Insights, Today and the customer file (F23).
9. **[P2] `/impeccable polish`**: a 3:1 field border token (F14); danger wash and edge tokens (F27);
   named state tokens for the 47 alpha mixes (F28); two written muted-text roles and one
   `CardFooter` (F29); one severity and segment record in `ui/status.tsx` (F33); one fill rule for
   balance series that are not zero-based (F36).
10. **[P2] `/impeccable colorize`**: chart role tokens for comparison, band edge and context marks
    at 3:1 or more (F32).
11. **[P2] `/impeccable typeset`**: plain caption and label roles and an `axis` role in place of the
    224 overrides (F30); remove the four eyebrows (F38).
12. **[P2] `/impeccable distill`**: fold the forked components and charts back into the kit and
    delete the dead exports (F34, F35).
13. **[P3] `/impeccable animate`**: respect reduced motion in the two JavaScript smooth scrolls
    (F40).
14. **[P3] `/impeccable typeset`**: emit the type scale in rem (F41).
15. **[P3] `/impeccable distill`**: emit only the colour tokens the console uses (F43).
16. **[P3] `/impeccable polish`**: replace re-typed token literals with token references (F42).
17. **[P3] `/impeccable quieter`**: drop the grid and glow from the sign-in panel (F44).
18. **[P3] `/impeccable clarify`**: only if the owner chooses to change the spec's wording (F45).
19. **`/impeccable polish`**: a final pass over every page at 1280, 1024 and 768 px and at 200% zoom
    once the fixes above have landed.

Re-run `/impeccable audit` after the fixes to compare the score.

## After fixes (2 Oct 2026)

The same five dimensions, re-measured once with the same methods after the fix pass had landed.
The fix pass came in three groups: the kit (`ui/`, `shell/`, the token generator), pages A (Today,
the Book, Insights) and pages B (the customer file, the Advice record, Access, sign-in, the
copilot). This confirmation round then fixed what it found still open (listed below). The code is
`rm-console` at `70a1472` plus those uncommitted changes.

How it was measured: a local API (`BANK_SOURCE=memory`, `RM_SIMULATE=1`, journeys simulated)
behind the Vite dev server, and the production build behind `vite preview`. Both were driven by
headless Chrome over CDP. axe-core 4.10.2 (WCAG 2.0–2.2 A and AA plus best practice) ran on 13
page states and 6 overlays. The composited text-contrast scan covered 13 states, tinted ones
included. Keyboard walks covered the dialogs, the Book rail, the copilot and Cmd-K. Cold loads
were timed at 1x and 4x CPU and on a 150 ms RTT / 1.6 Mbps link. Overflow and screenshot sweeps
ran at 1440×900, 1024×768 and 768×1024 (both with touch), 390×844 at DPR 2 with touch, and
640×400 at DPR 2 (200% zoom). The class grep compared against a read-only export of `70a1472`.
The Impeccable detector ran on the sources and on the rendered pages, through its bundled
`detect.js`. On the customer file, the first audit's performance, sweep and detector runs used
Vikram Nair (`IDBI0003918862`) and its accessibility run used Karan Deshpande (`IDBI0003308471`).
This round used Karan for accessibility, performance and the sweep, and Vikram for the detector,
so the detector counts compare like for like. Not tested: a physical device, iOS Safari, a
screen reader, pinch-zoom, the on-screen keyboard, and a React profile for F20.

### Audit Health Score after fixes

| #         | Dimension                | Before    | After     | Key finding now                                                                                                             |
| --------- | ------------------------ | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1         | Accessibility            | 2         | 4         | axe finds 0 violations on 13 pages and 6 overlays, and every modal returns focus; no screen reader has been run             |
| 2         | Performance              | 3         | 3         | LCP 80–120 ms at 1x (was 380–432), but the whole 128 kB book still loads on every route for one badge (F21)                 |
| 3         | Responsive Design        | 1         | 3         | 0 px of sideways scroll at 1440, 1024, 768, 390 and 200% zoom; page-level controls stay under 44 px under touch (F26)       |
| 4         | Theming                  | 3         | 4         | Focus and field tokens pass 3:1 and the generator enforces contrast; 16 alpha mixes remain, no text colour                  |
| 5         | Implementation Integrity | 2         | 3         | Wallet share reads right and the kit is whole again; facts still come from API sentences (F39), two formatters remain (F37) |
| **Total** |                          | **11/20** | **17/20** | **Good (address weak dimensions)**                                                                                          |

Theming is scored without dark mode, which is out of scope by decision (light theme only).

### Implementation Integrity verdict after fixes

**Pass.** The headline figure is honest: under Relationship value the Book row reads "₹65.8L with
IDBI" on every row, the 100%-IDBI ones included. Every share keeps its base ("26% of balances with
IDBI", "91.4% of all balances"), and the balances sparkline has a column of its own. Severity and
segment have one record each in `ui/status.tsx`, so "Worth knowing" and "Priority" look the same on
every page. The forked Stat, MaskedField, SegmentTabs, month charts, stacked and ranked bars are
folded back into the kit, and the dead kit exports are gone. `check-kit` fails the build on any
kit export nothing uses (86 of 86 in use, none pending). Balance series that do not start at zero
are drawn as lines everywhere. The eyebrows and the sign-in grid are gone. The source detector
still returns `[]`. Of the real rendered-detector findings, `all-caps-body`,
`codex-grid-background`, `skipped-heading`, `tiny-text`, `text-occlusion` and
`clipped-overflow-container` are at 0, and `text-overflow` at 390 is down from 255 to 14 deliberate
truncations. What keeps it at 3 rather than 4: figures are still recovered from
the API's English sentences, now pinned by tests (F39), and two rupee formatters still print
figures in different places (F37).

### Finding by finding

38 fixed, 6 partly fixed, 1 not fixed (an owner decision), 0 regressed. Two of the fixed ones (F20,
F25) were verified by the fix pass and not re-run in this round.

| ID  | Status                       | Evidence after fixes                                                                                                                                                                                                                                                                     |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Fixed                        | Book rows read "₹65.8L with IDBI" under ₹1.94Cr, on every row; header and rail keep "% of balances"; the balances line has its own "Balances" column, shown from about 1480 px                                                                                                           |
| F02 | Fixed                        | Every Tab stop draws `solid 2px #016A4D` (2 px offset, or −2 px inset): 6.62:1 on white, 5.48:1 on ground-deep; `ring-focus/NN` 2 → 0                                                                                                                                                    |
| F03 | Fixed                        | Icon rail from 768 px, drawer below it; 0 px page overflow on every route at 1024, 768, 390 and 640×400 at DPR 2                                                                                                                                                                         |
| F04 | Fixed                        | Log a call at 640×400 at DPR 2: dialog at y 16–384 in a 400 px window, Log call button at y 299–335; at 390×844 the button is at x 273–349                                                                                                                                               |
| F05 | Fixed                        | Esc returns focus to Add note, Log a call, "Reveal date of birth", the Book nav link (Cmd-K) and Brief me (copilot)                                                                                                                                                                      |
| F06 | Fixed                        | 1 of 38 rows is a Tab stop; one Tab from the chosen row lands on that customer's "Log call" in the rail                                                                                                                                                                                  |
| F07 | Fixed                        | Every route has its own title ("Book (38) · RM Desk", "Karan Deshpande · Money · RM Desk", "Not found · RM Desk"); a live region reads the new title; after a Cmd-K pick focus is on `main`                                                                                              |
| F08 | Fixed                        | At 1024 and 768 the rail floats over the table only, the sort control stays clear, and the page does not overflow with the rail open                                                                                                                                                     |
| F09 | Fixed                        | No `role=application` stop on Money; the figure's label carries the start, the end and every month                                                                                                                                                                                       |
| F10 | Fixed                        | axe `aria-prohibited-attr` 51 nodes → 0                                                                                                                                                                                                                                                  |
| F11 | Fixed                        | The active descendant is set on open and after typing; "1 customer. Use the arrow keys to move, Enter to open." is announced                                                                                                                                                             |
| F12 | Fixed                        | An empty sign-in moves focus to the employee number field (`aria-invalid`); an empty note focuses the textarea (fix pass)                                                                                                                                                                |
| F13 | Fixed                        | axe `heading-order`, `page-has-heading-one`, `landmark-one-main`, `region` and `landmark-no-duplicate-banner` all at 0                                                                                                                                                                   |
| F14 | Fixed                        | Inputs, textareas and selects use `fieldEdge` `#718D81`: 3.60:1 on white, 3.23:1 on ground                                                                                                                                                                                               |
| F15 | Fixed (finished this round)  | The SegmentTabs counts (fix pass) and the goal-stage and ledger-rung numbers on tinted panels (this round) use ink-faint; 0 failing text nodes in 13 states, Vikram's tinted goal stages and an open ledger row included                                                                 |
| F16 | Fixed (finished this round)  | The route's read starts at 28–46 ms (was 328–363), and a loading page no longer suspends, so React's 300 ms reveal throttle no longer sets LCP: 80–120 ms at 1x (was 380–432)                                                                                                            |
| F17 | Fixed                        | Entry 570.8 → 362.3 kB (178.8 → 118.8 kB gzip); no zod in it; motion and sonner load later; the warning limit is back at 500 kB and no chunk exceeds it                                                                                                                                  |
| F18 | Partly                       | The preload waits for the page's data and goes in two batches, the likeliest pages first; it still uses `import()` rather than `<link rel=prefetch>`, an accepted trade-off                                                                                                              |
| F19 | Fixed                        | The Book chunk imports no chart code; recharts arrives with "Show chart" or the rail                                                                                                                                                                                                     |
| F20 | Fixed (not re-run)           | The grid snaps, rows are memoised and row tooltips mount on hover (fix pass); no React profile was taken in this round                                                                                                                                                                   |
| F21 | Partly                       | Book and refusals no longer refetch on focus; the whole 128 kB book still loads on every route for the sidebar badge                                                                                                                                                                     |
| F22 | Fixed                        | The ledger and access-log tables scroll inside their cards; `/record` and `/access` do not overflow at 768, 390 or 200% zoom                                                                                                                                                             |
| F23 | Fixed                        | Page grids follow their container; `/insights` overflow 186 → 0 px at 768 and 564 → 0 px at 390                                                                                                                                                                                          |
| F24 | Fixed                        | The Highlights reflow to 2 + 2 + 1 on a phone, the header wraps, and Brief me and Add note fold to icons                                                                                                                                                                                 |
| F25 | Fixed (not re-run)           | Chips, badges and the allocation bar open on tap, and month tiles select on tap and scrub on a drag (fix pass, synthesized touch)                                                                                                                                                        |
| F26 | Partly                       | Kit controls carry an invisible 44 px hit area under a coarse pointer, and nav links, tabs and sort headers grow; page-level controls do not. Under touch at 1024 the effective area is under 44 px on Today 11 of 39, Book 17 of 27, the customer file 15 of 29, Advice record 48 of 89 |
| F27 | Fixed                        | New `dangerWash` and `dangerEdge` tokens; danger alpha mixes 11 → 1 (the danger button's hover)                                                                                                                                                                                          |
| F28 | Partly                       | Colour/alpha mixes 73 → 16 uses and no text alpha mix is left (the 4.47:1 caption is gone); the rest are fills and rings on the ink and brand panels                                                                                                                                     |
| F29 | Fixed                        | A `CardFooter` note variant; one `columnHeaderClass` for DataTable, the ledger and Top movers, in a module of its own since this round                                                                                                                                                   |
| F30 | Fixed                        | `captionPlain`, `labelPlain` and `axis` roles; `font-normal` 224 → 15 (all inline weight drops inside a heavier line), `tracking-normal` 7 → 4; detector `tiny-text` 6 → 0                                                                                                               |
| F31 | Fixed                        | `--transition-duration-*` is emitted; numeric `duration-N` classes 44 → 0                                                                                                                                                                                                                |
| F32 | Fixed                        | `comparison`, `bandEdge` and `contextBar` chart roles, checked at 3:1 by the generator                                                                                                                                                                                                   |
| F33 | Fixed                        | One record per severity and segment in `ui/status.tsx`, one `SeverityMark` and a quiet `SegmentBadge`; the page copies are deleted                                                                                                                                                       |
| F34 | Fixed (finished this round)  | Stat, MaskedField, SegmentTabs and ToggleGroup folded back; this round deleted `SmallMultiple`, `SEVERITY_ICON` and the `ChartTooltipCard` and `chipVariants` barrel exports; `check-kit` reports 86 exports, all in use, none pending                                                   |
| F35 | Fixed                        | MonthLines, MonthColumns, StackedBar, RankedBars and the windowed Sparkline are in the kit, and the Insights and Book copies are deleted                                                                                                                                                 |
| F36 | Fixed                        | `AreaChart` draws a line without fill when it does not start at zero, so the Book band and rail, Money and Insights agree                                                                                                                                                                |
| F37 | Partly                       | `lib/format.ts` has a shared case table, but `prose.ts`, `figures.tsx` and the copilot's `tiles.ts` still print through `@dhan/core`'s `rupeesShort` and `rupeesTitle`; no current figure falls where the two disagree                                                                   |
| F38 | Fixed                        | No eyebrow on the Advice record, Goals or sign-in; VerdictCard puts Blocked or Pass in a chip beside the product; detector `all-caps-body` 0                                                                                                                                             |
| F39 | Partly                       | Tests pin the regular expressions against `@dhan/core`'s own wording; the structured contract fields do not exist yet                                                                                                                                                                    |
| F40 | Fixed                        | Both smooth scrolls check `prefers-reduced-motion`                                                                                                                                                                                                                                       |
| F41 | Fixed                        | The type scale is in rem (`--text-body: 0.875rem`); the fix pass measured body text at 28 px with a 32 px browser base                                                                                                                                                                   |
| F42 | Fixed                        | Sticky offsets read the top-bar token; new `rail-laptop` size and `mark` radius; arbitrary radii 7 → 1 (`rounded-[inherit]`)                                                                                                                                                             |
| F43 | Fixed                        | The built CSS has no `scrim`, `hero` or `ink-mid` colour                                                                                                                                                                                                                                 |
| F44 | Fixed                        | The grid and glow are gone (`codex-grid-background` 0); `dark-glow` remains, a false positive on the `shadow-overlay` token                                                                                                                                                              |
| F45 | Not fixed (owner's decision) | "Mis-sales prevented" and "hundreds of customers" stand, as the spec words them                                                                                                                                                                                                          |

### Fixed in this confirmation round

- **The reveal throttle (finishes F16).** `shell/pages.ts` no longer wraps pages in `React.lazy`.
  A page whose chunk is still on the way draws its route's skeleton itself (`PageFallback`, which
  `RoutePage` in `shell/RouteBoundary.tsx` provides) and draws the page when the chunk lands, as
  an ordinary update. Before, the lazy page suspended, and React held the content back until
  300 ms after the skeleton appeared. A chunk that fails to load still reaches the route's error
  boundary. Checked by blocking the Insights chunk ("This page did not load", and the next
  navigation recovers), by clicking Access before its chunk had loaded (skeleton, then the page
  within about 70 ms, with its title, announcement and focus), and by Back. LCP at 1x fell by
  264–296 ms on each route measured.
- **ink-hint on tints (finishes F15).** `pages/customer/Goals.tsx` (goal-stage number) and
  `pages/record/AdviceLedger.tsx` (rung number) now use ink-faint.
- **The parked dead exports (finishes F34).** Deleted `SmallMultiple` (`ui/charts.tsx` and its
  `/kit` specimen) and `SEVERITY_ICON` (`ui/status.tsx`), and took `ChartTooltipCard` and
  `chipVariants` out of the barrel, since only `ui/` uses them. `scripts/check-kit.mjs` has an
  empty `PENDING`.
- **`columnHeaderClass` in its own module** (`ui/columnHeader.ts`). Insights and the Advice record
  no longer download the 56 kB DataTable chunk to read one class string.
- **Docs.** `apps/rm/README.md` and `CONTRIBUTING.md` now give 133 console tests and 1,311 in all,
  and the README lists the two new build scripts.

### What remains, most important first

1. **[P2] F21, whole collections for one figure** (`/impeccable optimize`). The sidebar badge
   still reads the full book (128 kB, 38 rows) on every route. On the 1.6 Mbps link that read
   takes 1.1–2.0 s and competes with the customer read, which is why the customer file's
   throttled LCP is the slowest (2.7 s). The real fix is a light count on `/me` or `/today`, which
   needs a contract and API change. Without one, the sidebar could defer its read until the
   page's own data has settled.
2. **[P2] F39, facts parsed from sentences** (`/impeccable harden`). The months to clear a card,
   the cover amount, the fund name and the refusal cadence still come from regular expressions
   over the API's English. Tests now pin them to `@dhan/core`'s wording, but the structured
   fields belong in `packages/contracts`.
3. **[P2] F37, two rupee formatters** (`/impeccable harden`). Customer prose, `figures.tsx` and the
   copilot tiles print through `@dhan/core`'s `rupeesShort` and `rupeesTitle`, while the rest of
   the console uses `lib/format.ts`. They disagree between ₹99.5L and ₹1Cr; no current figure
   falls there.
4. **[P3] F26, touch density on page controls** (`/impeccable adapt`). Under touch at 1024, the
   segment tabs (42 px), the top-bar chips (24 px), Mark contacted and Resolve (28 px), the
   Advice record's rule bars (30 px) and the header's segment and strength chips (18–20 px) have
   no 44 px area. WCAG 2.5.8's 24 px minimum holds through spacing and the inline-link exception.
5. **[P3] F28, the last alpha mixes** (`/impeccable polish`). Ten fills and rings on the ink and
   brand panels (`Brand.tsx`, `Login.tsx`, `Intact.tsx`, `VerifyBookStrip.tsx`, `ChainCheck.tsx`,
   the `onInk` IconButton) want an `onInkWash`/`onInkEdge` and an `onBrandWash` token. None of
   them is text, and none fails contrast.
6. **[P3] New: "Server not reachable" on any `/me` failure** (`shell/TopBar.tsx:115-121`,
   `/impeccable clarify`). This round's sweep hit the API's 120-a-minute rate limit, and the chip
   said "Server not reachable" while the page said "Too many requests". The tooltip gives the
   right reason; the chip should not claim the server is down when it answered.
7. **[P3] New: the Today Book value sparkline keeps a soft fill** down to a floor that is not zero
   (`ui/Stat.tsx:111-115`, `area`). The F36 rule was applied to `AreaChart` only.
8. **[P3] Detector residue.** `line-length` 5 at 1440 (for example a quoted refusal on Journey at
   about 104 characters a line and a caption on Money at about 126) and `text-overflow` 8 at 1440
   (Book "Top signal" lines cut with an ellipsis). At 390, 10 of the 14 `text-overflow` hits are
   the top bar's search placeholder, shortened by design; the other 4 are SIP and account lines in
   the customer file, cut with an ellipsis.
9. **[P3] F18 and F32 residue.** The preload uses `import()` (accepted). Composition's goal-health
   greys (`chart-neutral-300` and `-400`) were outside F32 and are unchanged.
10. **[Owner] F45.** "Mis-sales prevented" and "hundreds of customers" are the spec's words.

### Before and after, in numbers

Accessibility

| Measure                                    | Before                                                    | After                                                   |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------- |
| axe violations                             | 6 rules on 16 nodes, all moderate (0 critical, 0 serious) | 0 on 13 page states and 6 overlays                      |
| axe needs-review `aria-prohibited-attr`    | 51 nodes                                                  | 0                                                       |
| Focus ring                                 | 1.70–1.76:1 (35% alpha)                                   | solid `#016A4D`: 6.62:1 on white, 5.48:1 on ground-deep |
| Focus after closing a modal                | `<body>` for Add note, Log a call, Reveal, Cmd-K          | the invoking control, all five overlays                 |
| Book Tab stops; presses to the chosen rail | 38; 38, ending in the last customer's rail                | 1; 1, the same customer                                 |
| Text below AA on tinted states             | ink-hint 4.36–4.37:1, on-brand caption 4.47:1             | 0 nodes in 13 states                                    |
| Route titles                               | 1 for every page                                          | one per route and tab, announced on page change         |

Performance (production build, cold cache; the before customer figures are Vikram's file)

| Route             | LCP at 1x | LCP at 4x | LCP at 4x, 150 ms / 1.6 Mbps | FCP at 4x, 150 ms / 1.6 Mbps |
| ----------------- | --------- | --------- | ---------------------------- | ---------------------------- |
| `/` (Today)       | 432 → 120 | 524 → 272 | 3600 → 2184                  | 1636–1800 → 1464             |
| `/book`           | 420 → 104 | 480 → 200 | 3680 → 2544                  | 1636–1800 → 1348             |
| Customer overview | 408 → 92  | 448 → 164 | 3160 → 2712                  | 1636–1800 → 1344             |
| `/insights`       | 380 → 80  | 444 → 132 | not measured → 1896          | 1636–1800 → 1352             |
| `/login`          | 100 → 64  | 104 → 84  | 1688 → 1368 (FCP = LCP)      | 1688 → 1368                  |

| Measure                                   | Before                    | After                                     |
| ----------------------------------------- | ------------------------- | ----------------------------------------- |
| Entry chunk                               | 570.82 kB, 178.77 kB gzip | 362.34 kB, 118.78 kB gzip (−34% gzipped)  |
| Chunk-size warning limit                  | raised to 900 kB          | 500 kB, no chunk over it                  |
| First API read of the route, 1x           | 328–363 ms                | 28–46 ms                                  |
| TBT at 4x, routes measured                | 0–63 ms                   | 0–26 ms                                   |
| CLS                                       | 0.0005                    | 0.0005 (0.0019 on the throttled customer) |
| Book's static imports include recharts    | yes (381 kB chunk)        | no                                        |
| Insights and Advice record load DataTable | yes (56 kB)               | no                                        |

Horizontal scroll (page `scrollWidth` minus the viewport, px; 11 signed-in states plus sign-in)

| Viewport                            | Before                                                                  | After                       |
| ----------------------------------- | ----------------------------------------------------------------------- | --------------------------- |
| 1440×900                            | 0 everywhere                                                            | 0 everywhere                |
| 1024×768, touch                     | 0 everywhere                                                            | 0 everywhere, rail included |
| 768×1024, touch                     | 111 on 8 states, Insights 186, Advice record 201, Access 231, sign-in 0 | 0 everywhere                |
| 390×844, touch                      | 260–609 on every signed-in state                                        | 0 everywhere                |
| 640×400 at DPR 2 (200% of 1280×800) | 239–329                                                                 | 0 on the 7 pages measured   |

Detector

| Run                                            | Before | After | Notes                                                                                                                              |
| ---------------------------------------------- | ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Source, `impeccable detect --json apps/rm/src` | `[]`   | `[]`  |                                                                                                                                    |
| Rendered, 1440, 11 pages                       | 118    | 107   | 0 now: `all-caps-body`, `codex-grid-background`, `skipped-heading` (2), `tiny-text` (6), and the false-positive `ai-color-palette` |
| Rendered, 768, Today, Book, Overview, Insights | 116    | 40    | `text-overflow` 88 → 20 (16 are visually hidden sidebar labels), `tiny-text` 6 → 0, `body-text-viewport-edge` 3 → 0                |
| Rendered, 390, 11 pages                        | 346    | 81    | `text-overflow` 255 → 14, `text-occlusion` 5 → 0, `clipped-overflow-container` 10 → 0, `tiny-text` 6 → 0, `skipped-heading` 2 → 0  |

The remaining rendered hits are the false positives the first audit identified: `cream-palette`
×11, `layout-transition` ×11 (Sonner's toast CSS), `cramped-padding` (the fixed-height `Chip` and
flush table wrappers), `nested-cards`, `first-viewport-column-overflow` ×2 and `dark-glow`. The
one new rule, `heading-rhythm` ×8 at 390 on Today, is also a false positive: it reads the queue
rows' names, which sit 12 px under the row's own border with the wrapped source chip below them.

Theming grep over `apps/rm/src` (Tailwind class uses)

| Pattern                                      | Before  | After                   |
| -------------------------------------------- | ------- | ----------------------- |
| Colour literals and arbitrary colour classes | 0       | 0                       |
| Colour/alpha mixes                           | 73 uses | 16 uses, no text colour |
| Danger alpha mixes                           | 11      | 1                       |
| `font-normal` overrides                      | 224     | 15                      |
| `tracking-normal` overrides                  | 7       | 4                       |
| Numeric `duration-N` classes                 | 44      | 0                       |
| Arbitrary radii                              | 7       | 1 (`rounded-[inherit]`) |
| Top-bar height typed as 56                   | 3       | 0                       |
| `ring-focus/NN`                              | 2       | 0                       |

Gates, from the repository root after the last code change: `pnpm build`, `pnpm typecheck`, `pnpm lint`,
`pnpm format:check` and `pnpm test` all pass. That is 1,311 tests with 0 failures: core 335,
contracts 52, fixtures 185, api 399, mobile 207 and rm 133 (115 before the fix pass). The final
screenshots, at 1440×900 and 390×844 for Today, the Book, Karan's overview, Insights and the
Advice record, are kept outside the repository with the run's other evidence.
