# RM Desk (`@dhan/rm`)

The relationship manager's console. A Vite + React 19 single-page app that talks only to
`/api/v1/rm/*`; the build spec is [`docs/product/rm-console.md`](../../docs/product/rm-console.md).

## Running it

```bash
pnpm install && pnpm build                              # once: the API imports the packages' dist/
BANK_SOURCE=memory AVATAR_PROVIDER=none pnpm dev:api   # :3001
pnpm dev:rm                                             # :5173, proxies /api to :3001
```

Sign in with either demo desk login. Both are on the sign-in page under "Demo access", with
one-click fill:

| Employee no. | Password      | RM                     | Book                                           |
| ------------ | ------------- | ---------------------- | ---------------------------------------------- |
| `204117`     | `desk-204117` | Meera Joshi, Mumbai    | 38 customers, including the four app customers |
| `204388`     | `desk-204388` | Arjun Menon, Bengaluru | 12 customers                                   |

Arjun exists to show book scoping: a link to one of Meera's customers opens a calm "This customer
is not in your book" page for him, and the API answers 403.

What to expect after the API starts:

- **The book fills in over about a minute and a half.** The API warms every customer's figures
  (about 12 s), then the simulator lays down a twelve-month journey for each of the 50 book
  customers through the real services (about 80 s on a laptop; the log says
  `rm activity simulated`). The console works throughout; last-active dates, handoffs, refusals
  and the journey tab fill in as journeys land. `RM_SIMULATE=0` skips the journeys and
  `RM_WARM=0` the warm-up. `pnpm dev:api` runs with `--watch`, so an API edit restarts both.
- **The copilot** (Brief me, Ask) is phrased by the model when `OPENAI_API_KEY` is set in
  `apps/api/.env`, and labelled "AI-written from the record"; with no key, or on any failure, the
  rules write it from the same numbered facts. Node's `--env-file` does not override a variable
  already exported in your shell, so an `OPENAI_API_KEY` in your shell profile beats the one in
  `.env`; if the copilot falls back to the rules when it should not, start the API with
  `env -u OPENAI_API_KEY pnpm dev:api`.
- **On Postgres**, `pnpm --filter @dhan/api migrate && pnpm --filter @dhan/api seed` applies
  migration 0015 and seeds the desk, then `BANK_SOURCE=postgres AVATAR_PROVIDER=none pnpm dev:api`.
  The API does not migrate at boot, and a reseed wipes the journeys, so restart the API after one.

`VITE_API_PROXY_TARGET` points the proxy at another API. `/kit` (dev server only) renders every
component in `src/ui/` with sample props; it is not in a production build, and `scripts/check-bundle.mjs`
fails the build if it is.

## Layout

```
src/api/        client.ts (typed over ROUTES), session.ts (the RM bearer), queries.ts (one hook per route)
src/ui/         the component kit; pages import from src/ui/index.ts only
src/shell/      sidebar, top bar, Cmd-K search, the auth guard
src/features/   copilot/: the Brief me and Ask panel, opened from any customer page (Cmd-J)
src/pages/      one folder per route: today, book, customer (five tabs), insights, record, access, login
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
