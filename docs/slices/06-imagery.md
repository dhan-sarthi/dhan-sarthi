# Slice 06 — Imagery, and the full statement

Status: built. When the slice landed the workspace was green — typecheck clean, 592 tests.
Brought up to date on 22 September 2026: the rebuild on Cleo's components took the drawn
illustrations off statement rows, and a row with no logo now shows its category's glyph on a
tinted plate. How the drawings were made is kept below as history, because the artwork and its
tools are still in the repository. Paths beginning `app/` or `src/` are in `apps/mobile`.

## The problem

Every statement row was a grey glyph. A list of forty transactions with no imagery is a
spreadsheet. The reason Cleo's version reads as an app is that every row carries a mark.

## Merchant logos

**37 real brand logos, bundled** in `packages/assets/logos/`, with each one's native width in
`sizes.json`. `tools/fetch-merchant-logos.mjs` fetches them; it is not part of any build because
it hits the network and overwrites artwork. The first pass bundled 42; the floor below dropped
six, and Spencer's was added by hand.

Bundled rather than fetched at runtime, for three reasons: the app has to render a statement
with no network beyond the bank, an IDBI sandbox will not reach a logo CDN, and a row whose
icon pops in half a second late looks broken.

Source: Google's favicon service, asked for 256px. It returns whatever size the site published,
so every logo is measured once it lands (below). Clearbit's free logo API is dead (it was
sunsetted after the HubSpot acquisition) and DuckDuckGo's returns 16px or 404s.

The merchant list was not guessed: it came from running the narration parser over all three
personas' generated ledgers (there are four personas now) — 110 distinct merchants, of which the
top 45 cover nearly every row.

## The fallback

`MerchantMark` (`apps/mobile/src/ui/MerchantMark.tsx`) resolves a row's picture in three steps:

1. **The brand's real logo**, where the merchant is a brand with one, drawn at its own size on a
   white plate ringed with a hairline.
2. **The spend category's glyph on a tinted plate**, where it is not — a kirana store, a chai
   stall, a landlord. The row genuinely *is* groceries, and the plate says so in the same
   stroked marks as every other plate in the app. `CATEGORY_PLATE` is a total map over the
   category enum, so a new category is a compile error rather than a plate nobody chose.
3. **A plate with the first letter**, if even the category is unknown. A logo that fails to
   load falls to this too, so the row still says whose it is.

Step 2 is what keeps this from looking like a gap. A generic grey square would have read as a
missing asset.

Until 22 September 2026 step 2 was a drawing: a merchant-kind illustration where one matched (a
pizza, a chai glass), else the category's own illustration. The rebuild replaced both with the
glyph plate. Cleo's category rows are a glyph on a soft colour, not a picture, and the drawings
were pictures standing in for icons, in a style nothing else on the screen shares.

Five brands are deliberately absent from the logo map — Meesho, Chaayos, Ola, IRCTC, Zudio —
because no logo source still serves one. They take the category plate, same as a kirana store.

## The full statement

Cleo puts an arrow beside "Recent transactions" and it opens the lot. Ours does the same: the
"Since last week" heading on Home's Overview opens `/statement` (`app/(tabs)/spend.tsx:324`), as
do the profile's Statement row and the budget and save settings.

Grouped by day, with the **closing balance on each day header** — a statement read without the
balance beside it is a list of amounts rather than a story about an account. The balance is
summed across every account the lines come from, walked back from each account's balance today.
Cursor-paged off `/transactions`: the next page loads as the list nears its end, a page that
fails says so under the lines already shown, and the end is said plainly: *"That's all of it."*
A customer who switched Transactions off on "What IDBI may read" sees no lines here either.

Every line is tappable since 22 September 2026. It opens a detail sheet
(`src/ui/TransactionSheet.tsx`): the amount, the fields the bank recorded, the raw narration,
and a question for Uday where he has an answer.

`TransactionRow` is shared by the short list on Home, a challenge's lines on Grow and the full
statement, so they cannot drift apart — which they would have, because the full list also
groups by day.

## Also

- Home's Budget rows and the set-limit screen take the category plate through `MerchantMark`
  (`app/(tabs)/spend.tsx:1113`, `app/set-limit.tsx:455`), and so do Grow's challenge
  suggestions, with the logo where the target is a brand (`app/(tabs)/grow.tsx:689`). Grow's
  holdings rows carry an asset-class glyph (`grow.tsx:1564`), not a merchant mark.
- `apps/mobile/images.d.ts` — the ambient declaration for `.png` and `.jpg` imports; it was
  `png.d.ts`. `@dhan/assets` ships its own (`packages/assets/src/images.d.ts`), but that file is
  outside the app's `include`, and the declaration is program-wide.

## Resolution: never upscale, and set a floor

The first pass normalised every logo to 96px, which meant *upscaling* most of them. HPCL
publishes a **16px** favicon; stretched across a 40pt plate it was a smear that read as a
broken image rather than a considered choice. IDBI's own was 16px too.

Two rules now, in `tools/fetch-merchant-logos.mjs`:

- **Never stretch.** Each logo is stored at its native size, capped at 96 — enough for the 40pt
  plate at @2x — and `sizes.json` records it. `MerchantMark` renders at
  `min(plateSize, nativeWidth)`, so a 48px mark sits at 48px inside the plate with padding around
  it — contained, not blurred.
- **A 32px floor.** Below that a logo is not worth having, and the fetch drops it.

Six fell below the floor and take the category plate instead: **HPCL** (16px), **IDBI** (16px),
**BigBasket** (16px), **Ajio** (24px), **Airtel** and **Airtel Prepaid** (31px). That left 36,
and Spencer's (below) made 37.

No free source has better artwork for these brands — Clearbit is dead, logo.dev and unavatar
just re-serve the same favicons, and Brandfetch returns an identical 425 KB placeholder for
every domain without a key. Parsing each site's own `<link rel="icon">` tags found nothing
larger either. So the floor is the answer rather than a better fetch.

### Spencer's

Spencer's publishes a 16px favicon. The fetcher takes a direct URL for cases like that —
`MANUAL` in `tools/fetch-merchant-logos.mjs` — and the mark lands at 96px.

## The drawings, and why they are off the rows

Two tiers were not enough at first. The spend category says "Food & dining", which is equally
true of a pizza order, a chai stall and a biryani house — and drawing all three as the same
covered dish is how a statement stops being read. So a middle tier went in: 38 drawings of
merchant *kinds* from `tools/gen-merchant-icons.mjs` (pizza, biryani, chai, coffee, kirana,
metro, fuel, pharmacy and thirty more), matched by `packages/assets/src/merchant-kind.ts` —
words, longest first, against the lowercased name, so "coffee house" beats "house". It was
deliberately conservative: a wrong picture is worse than the category's own.

The rebuild on 22 September 2026 took both sets of drawings off the rows in favour of the glyph
plate above. They are still in the repository and still exported — `SPEND_ICON` and
`merchantKindIcon` from `packages/assets/src/index.ts` — but nothing in `apps/mobile` calls
either.

### Keeping the sets one family

The house style lives in `tools/lib/icons.mjs`, shared by the category, merchant-kind and
product generators, because sets drawn months apart have to look like one family and one copy of
the rules is the only way to guarantee it. The style is no longer green: the family is held
together by one material, one lighting rig and one set of proportions, and each object is drawn
in its own colours, stored at 224px in a 256-colour palette. The product set has no output in
the repository yet.

`tools/write-asset-index.mjs` regenerates the logo and merchant-kind blocks of
`packages/assets/src/index.ts` from what is on disk. Ninety hand-written import lines is how a
file ends up with one that has no PNG behind it.

## Weight

Measured on 22 September 2026, in PNG bytes: 197 KB of logos, 552 KB of merchant-kind drawings,
215 KB of category drawings. All bundled, none fetched. Only the logos are drawn now, but the
assets index still imports every drawing, so the app still ships about 770 KB of artwork that no
screen shows; the web export built on 22 September carries all 53.

## Known gaps

- Logos are favicons, so a few are wordmarks rather than glyphs and read wide in a round plate.
- "Jio Prepaid" does not prefix-match `jio-fiber` and falls back to the category plate. The
  prefix rule only walks downwards; a plain `Jio` entry would fix it.
- Ola falls through to the Transport plate, whose glyph is a bus; a cab would be better.
- No filtering on the statement — `/transactions` accepts `category`, `from` and `to` and none
  of them are wired to UI.
- The drawings ship unused (see Weight). Either a screen reads them again or the index stops
  importing them.
