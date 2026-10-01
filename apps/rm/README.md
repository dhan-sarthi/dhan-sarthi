# RM Desk (`@dhan/rm`)

The relationship manager's console. A Vite + React 19 single-page app that talks only to
`/api/v1/rm/*`; the build spec is [`docs/product/rm-console.md`](../../docs/product/rm-console.md).

```bash
BANK_SOURCE=memory AVATAR_PROVIDER=none pnpm dev:api   # :3001
pnpm dev:rm                                             # :5173, proxies /api to :3001
```

`VITE_API_PROXY_TARGET` points the proxy at another API. `/kit` (dev server only) renders every
component in `src/ui/` with sample props; it is not in a production build, and `scripts/check-bundle.mjs`
fails the build if it is.

## Layout

```
src/api/        client.ts (typed over ROUTES), session.ts (the RM bearer), queries.ts (one hook per route)
src/ui/         the component kit; pages import from src/ui/index.ts only
src/shell/      sidebar, top bar, Cmd-K search, the auth guard
src/pages/      one file per route; login/ is complete, the rest are placeholders to build on
src/lib/        format.ts (₹, dates, %), cn.ts, motion.ts
scripts/        tokens-css.mjs, check-bundle.mjs
```

## Rules for a page

- **Colour and type come from tokens.** Utilities are generated from `packages/design/tokens.json`
  (`bg-brand-soft`, `text-ink-faint`, `text-label`); Tailwind's own palette, type scale, radii and
  shadows are switched off, so `bg-blue-500` does not exist. No hex in `src/`; a new colour goes
  into tokens.json first. Charts take their colours from `chart` in `@dhan/design` through the
  wrappers in `src/ui/charts.tsx`.
- **Type roles, not sizes:** `figure` 40/44, `display` 28/34, `title` 20/26, `heading` 15/20,
  `body` 14/20, `label` 13/18, `caption` 12/16, `micro` 11/14 (uppercase, tracked; `SectionLabel`).
- **Every rupee is `<Money>`**, every change is `<DeltaPill>`, every figure from the API. Nothing
  is typed alongside the data.
- **Every page has three states:** skeleton (`src/pages/placeholder.tsx` has the shapes),
  `EmptyState` that says what will fill it, `ErrorState` in plain words with a retry.
- **Data through `src/api/queries.ts`.** Opening a customer writes to the access log, so
  `useCustomer` never refetches behind the RM's back; keep it that way.
- **Never import `@dhan/fixtures`** or inline a customer string. The build fails on the markers.

## The generated theme

`scripts/tokens-css.mjs` writes `src/styles/tokens.generated.css` (Tailwind v4 `@theme`) and
`public/favicon.svg` from tokens.json. Both are **gitignored and regenerated** by `dev`, `build`
and `tokens`, so they can never drift from the JSON; the CSS is also in the root `.prettierignore`.
Run `pnpm --filter @dhan/rm tokens` after editing tokens.json while the dev server is running.
