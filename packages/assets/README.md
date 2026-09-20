# @dhan/assets

The illustrations, in one place.

This package exists because there were two apps. `apps/web` served its icons as URL strings out
of `public/`, which works and which React Native cannot do: Metro needs a `require`, not a path.
Rather than keep two copies of the same PNG in step by hand, the masters moved here and both
platforms *imported* them. `apps/web` was deleted on 20 September 2026
(`docs/architecture/adr/ADR-0001.md`) and `apps/mobile` is the only consumer left, but the shape
is still the right one: one file on disk, imported by specifier, and Metro resolves it.

```ts
import { SPEND_ICON } from '@dhan/assets'
;<img src={SPEND_ICON['Groceries']} />          // web
;<Image source={SPEND_ICON['Groceries']} />     // native
```

## What is in here

`icons/spend/` — one per `SpendCategory` in `@dhan/contracts`. Fifteen, and the set is closed:
the enum is closed, so a sixteenth file would be an icon nothing can ever ask for.

## The style

**They are no longer green.** Every icon used to be built from the brand ladder with one warm
accent, which held the set together by making every icon nearly the same icon — a column of teal
objects where the eye has to read the label to tell a pizza from a router. What holds the set
together now is *material and light*, not hue: one render style, one lighting rig, one set of
proportions, in `tools/lib/icons.mjs` and shared by all three generators. Colour is then free to
do the job colour is for, which is telling the pizza from the router at 32px.

The rules, in short: chunky 3D forms with soft bevels in a matte material; a soft key light from
the upper left and a cool bounce from the lower right on *every* icon; shadows that are a deeper,
more saturated version of the object's own colour rather than grey; the subject's own real
colours, vivid; upright and square to the viewer; no text, no logos, no currency symbols, no
outline stroke; drawn on transparency with no tile, card or ground shadow behind it, because the
app supplies the container; 224px square and legible at 32px, because that is the size a
transaction row draws them at.

Each file is 224px square and quantised to a 256-colour palette by `sharp`, which is also what
resizes them — the set used to lean on `sips` and therefore on macOS. **256, where the flat green
art went to 64.** These are shaded 3D forms, so a 64-colour palette lays visible bands across
every curved surface; the liquid-fund drop shows it worst. 256 is indistinguishable from full
colour and still cuts the three sets from 4.2 MB to 1.1 MB.

Three sets, one style, three generators — `tools/gen-spend-icons.mjs` (15 categories),
`tools/gen-merchant-icons.mjs` (38 merchant kinds) and `tools/gen-product-icons.mjs` (26 product,
goal and measure icons). `pnpm assets:icons` runs the first two and draws only what is missing;
`--force` redraws. The product set is **not** in that chain: its screens lived in `apps/web` and
went with it, so it draws into `icons/product/` for a consumer that does not exist yet and is run
by hand. All three need `OPENAI_API_KEY` and none is part of any build, because they cost money
and overwrite artwork.

## Why there are no merchant logos in here

Because BigBasket, Swiggy, Amazon and Reliance own theirs. `screens/invest/ShelfList.tsx` settled
this for fund houses already — *"we do not ship other companies' brand assets"* — and a generated
approximation of a live trademark inside a bank's app is worse than the monogram it replaces: it
is both wrong and confidently wrong. Every merchant row already carries a category, and the
category is the thing this app actually knows. A named merchant keeps its monogram; the
illustration says what kind of spending it is.
