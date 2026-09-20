# Slice 06 — Imagery, and the full statement

Status: built, verified on screen. Workspace green — typecheck clean, 592 tests passing.

## The problem

Every statement row was a grey glyph. A list of forty transactions with no imagery is a
spreadsheet. The reason Cleo's version reads as an app is that every row carries a mark.

## Merchant logos

**42 real brand logos, bundled** in `packages/assets/logos/` (368 KB total).
`tools/fetch-merchant-logos.mjs` fetches them; it is not part of any build because it hits
the network and overwrites artwork.

Bundled rather than fetched at runtime, for three reasons: the app has to render a statement
with no network beyond the bank, an IDBI sandbox will not reach a logo CDN, and a row whose
icon pops in half a second late looks broken.

Source: Google's favicon service at 256px, normalised to 96px — which covers a 40pt plate at
@3x without shipping a megabyte of favicons. Clearbit's free logo API is dead (it was
sunsetted after the HubSpot acquisition) and DuckDuckGo's returns 16px or 404s.

The merchant list was not guessed: it came from running the narration parser over all three
personas' generated ledgers — 110 distinct merchants, of which the top 45 cover nearly every
row.

## The fallback is the interesting part

`MerchantMark` resolves a row's picture in three steps:

1. **The brand's real logo**, where the merchant is a brand with one.
2. **The spend-category illustration**, where it is not — a kirana store, a chai stall, a
   landlord. These already existed in `@dhan/assets`, fifteen of them.
3. **A tinted plate with the first letter**, if even the category is unknown.

Step 2 is what keeps this from looking like a gap. "Sharma Kirana Store" gets the groceries
basket and "Avantika Gas" gets the house — the row genuinely *is* groceries, and the picture
says so. A generic grey square would have read as a missing asset.

Five brands are deliberately absent from the map — Meesho, Chaayos, Ola, IRCTC, Zudio — because
no logo source still serves one. They take the category illustration, same as a kirana store.

## The full statement

Cleo puts an arrow beside "Recent transactions" and it opens the lot. Ours does the same:
`Since last week ›` opens `/statement`.

Grouped by day, with the **running balance on each day header** — a statement read without
the balance beside it is a list of amounts rather than a story about an account. Cursor-paged
off `/transactions`, with an honest end: *"That is the whole statement I have been given."*

`TransactionRow` is shared between the short list and the full statement, so the two cannot
drift apart — which they would have, because the full list also groups by day.

## Also

- Budget category rows and Grow holdings rows carry marks now.
- `apps/mobile/png.d.ts` — the ambient PNG declaration. `@dhan/assets` ships its own, but that
  file is outside the app's `include`, and the declaration is program-wide.

## Resolution: never upscale, and set a floor

The first pass normalised every logo to 96px, which meant *upscaling* most of them. HPCL
publishes a **16px** favicon; stretched across a 40pt plate it was a smear that read as a
broken image rather than a considered choice. IDBI's own was 16px too.

Two rules now, in `tools/fetch-merchant-logos.mjs`:

- **Never stretch.** Each logo is stored at its native size (capped at 96) and
  `sizes.json` records it. `MerchantMark` renders at `min(plateSize, nativeWidth)`, so a
  48px mark sits at 48px inside the plate with padding around it — contained, not blurred.
- **A 32px floor.** Below that a logo is not worth having, and the fetch drops it.

Six fell below the floor and now take the spend-category illustration: **HPCL** (16px),
**IDBI** (16px), **BigBasket** (16px), **Ajio** (24px), **Airtel** and **Airtel Prepaid**
(31px). 36 logos remain.

No free source has better artwork for these brands — Clearbit is dead, logo.dev and unavatar
just re-serve the same favicons, and Brandfetch returns an identical 425 KB placeholder for
every domain without a key. Parsing each site's own `<link rel="icon">` tags found nothing
larger either. So the floor is the answer rather than a better fetch.

## Second pass: a picture of what the merchant *is*

Two tiers were not enough. The spend category says "Food & dining", which is equally true of a
pizza order, a chai stall and a biryani house — and drawing all three as the same covered dish
is how a statement stops being read. The eye learns the picture carries no information and
skips it.

So there is now a **middle tier**: 38 drawings of merchant *kinds*, from
`tools/gen-merchant-icons.mjs`. Pizza, biryani, chai, coffee, sweets, thali, burger, snacks,
kirana, supermarket, metro, fuel, bike-taxi, train, flight, electricity, gas, broadband,
mobile, water, pharmacy, lab-test, clinic, gym, streaming, music, gaming, cinema, clothing,
electronics, jewellery, books, eyewear, beauty, software, school, person, interest.

`MerchantMark` resolves in three steps: **brand logo → merchant kind → spend category**, with
the initial-letter plate behind all of it. Each step down is less specific and still true.

`packages/assets/src/merchant-kind.ts` does the matching — words, longest first, against the
lowercased name, so "coffee house" beats "house" and a gas agency is not caught by a shorter
rule. Deliberately conservative: a wrong picture is worse than the category's own.

### Keeping the two sets one family

The house style now lives in `tools/lib/icons.mjs`, shared by the category generator and the
merchant generator. A pizza drawn in a different palette next to a grocery basket reads as two
apps, and one copy of the rules is the only way to guarantee it does not happen.

`tools/write-asset-index.mjs` regenerates the import block and both maps from what is on disk.
Ninety hand-written import lines is how a file ends up with one that has no PNG behind it.

### Spencer's

Spencer's publishes a 16px favicon. The fetcher now takes a direct URL for cases like that —
`MANUAL` in `tools/fetch-merchant-logos.mjs` — and the mark lands at 96px.

## Weight

280 KB logos + 1.8 MB merchant icons + 756 KB category icons. All bundled, none fetched.

## Known gaps

- Statement rows are not tappable yet; there is no transaction detail sheet.
- Logos are favicons, so a few are wordmarks rather than glyphs and read wide in a round plate.
- "Jio Prepaid" does not prefix-match `jio-fiber` and falls back to the illustration. The
  prefix rule only walks downwards; a plain `Jio` entry would fix it.
- Ola falls through to the Transport category's bus; a cab drawing would be better than a bus.
- No filtering on the statement — `/transactions` accepts `category`, `from` and `to` and none
  of them are wired to UI.
