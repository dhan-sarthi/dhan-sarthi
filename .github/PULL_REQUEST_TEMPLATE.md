## What

<!-- One or two sentences. What does this change do for the customer, the reviewer, or the team? -->

## Why

<!-- The reason, not the diff. Link the decision in docs/product/decisions.md if one applies. -->

## Where it sits

- [ ] `packages/core` stays pure: no I/O, no `process.env`, no provider calls
- [ ] Secrets and provider calls live only in `apps/api`
- [ ] Every new or changed route shape is declared in `packages/contracts`
- [ ] No code path lets a model's output decide suitability
- [ ] Every figure a screen shows comes from the API, not from the browser or a constant

## Proof

<!-- Tests added or changed. For apps/mobile, a screenshot at 390px wide. For apps/api, the curl. -->

## Checklist

- [ ] `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm test` pass locally
- [ ] No `.env`, key, or customer-looking data in the diff
- [ ] Docs updated where behaviour or a decision changed
