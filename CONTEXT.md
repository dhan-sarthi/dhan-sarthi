# Dhan Sarthi

The load-bearing nouns of a bank's advisory product: a customer's file, the one Snapshot derived
from it, and the suitability-gated advice built on that Snapshot. One canonical name per concept,
because the same figure has to survive a screen, an avatar's sentence and an audit row without
changing its name on the way.

`@dhan/core` owns every domain type. `@dhan/contracts` mirrors the ones that cross the wire in zod
and adds the shapes that exist only there. `@dhan/fixtures` generates data in those shapes and owns
nothing. Where core and contracts could disagree, core is right and the compiler says so:
the `_Parity` tuple at `packages/contracts/src/domain.ts:1629` asserts that a core value is always
a valid instance of its mirror. A wire-only shape — one with no core counterpart — is not an oversight; it is a shape the
routes return that the engine has no opinion about, and `packages/contracts/src/domain.ts:1-12`
says so.

Each entry names a file and a line. Agents read this page before exploring, and a glossary that
names no file sends them grepping anyway. A line that has drifted is a documentation bug like any
other — fix it in passing; do not add a script that checks them.

## Language

### The customer's file

**CustomerFile**:
Everything the bank knows about one customer, shaped like IDBI's API responses rather than like a
screen. `packages/core/src/types.ts:330`; generated synthetically by `generateCustomerFile`
(`packages/fixtures/src/generate.ts:1174`).
_Avoid_: profile, customer data, account bundle

**Transaction**:
One line on a bank statement. `packages/core/src/types.ts:49`, mirrored at
`packages/contracts/src/domain.ts:82`.
_Avoid_: txn record, entry, statement line. (The _ledger_ — the whole set of them for a customer —
is a good word and is used throughout.)

**Consent**:
The customer's standing permission to read a block of their file, scoped to the five blocks and
dated. Wire-only, `packages/contracts/src/domain.ts:859`. The fixture equivalent `SeedConsent`
(`packages/fixtures/src/seed-bundle.ts:47`) is a separate declaration on purpose: fixtures may not
depend on contracts.
_Avoid_: permission, grant, authorisation

**Provenance**:
Which source a block of the file came from — `idbi`, `declared`, `fixture`, `postgres`, `memory`.
Wire-only, `packages/contracts/src/domain.ts:887`. `declared` (the customer told us) is not
`fixture` (we invented it), and collapsing them tells a reviewer that real declared data was made
up.
_Avoid_: source, origin. `BankSource` (`:875`) is a different thing — which adapter is wired, not
where one block came from.

### What the engine derives

**Snapshot**:
Every figure derived from a CustomerFile on one date, in one object, derived once. Nothing
downstream may read a Transaction directly, which is what stops the avatar quoting a number the
screen does not show. `packages/core/src/derive.ts:191`, mirrored at
`packages/contracts/src/domain.ts:531`.
_Avoid_: summary, facts, derived state, profile

**Series**:
A charge that repeats — a rent, an EMI, a SIP, a subscription — inferred from dates and amounts,
never read off a flag. `packages/core/src/recurring.ts:42`, mirrored at
`packages/contracts/src/domain.ts:321`.
_Avoid_: RecurringSeries, recurring charge, standing order. A _mandate_ is one `reason` a Series can
carry, not a synonym for it.

**Habit**:
A merchant used often, with variable amounts and no mandate. Not a Series, and reporting it as one
reads as broken. `packages/core/src/recurring.ts:87`.
_Avoid_: recurring spend, frequent merchant

**Insight**:
Something worth saying that was found in the data, carrying its evidence and exactly one suggested
action. `packages/core/src/insights.ts:36`, mirrored at `packages/contracts/src/domain.ts:777`.
_Avoid_: tip, nudge, alert, notification

### Advice and the gate

**Action / ActionKind**:
A thing the bank can actually do for this customer. `ActionKind` is a fixed, closed vocabulary of
thirteen; a model may never emit one outside it. `packages/core/src/actions.ts:13` and `:35`.
_Avoid_: recommendation, suggestion, offer

**Decision / DecisionKind**:
What the customer did with a proposed Action — `did_it`, `declined`, `deferred`, `pushed_back`.
`packages/core/src/actions.ts:79` and `:81`.
_Avoid_: DecisionRow _as a domain name_, response, feedback, outcome. The local Postgres row type
`DecisionRow` at `apps/api/src/adapters/postgres/audit-store.postgres.ts:73` is fine and stays — it
describes a table row, not the concept.

**Verdict**:
What the suitability gate said about one product, for one customer, at one amount: `PASS` or
`BLOCKED`, with the rule, the sentence the customer hears, and the sentence the record keeps.
`packages/core/src/suitability.ts:95`, mirrored at `packages/contracts/src/domain.ts:581`.
_Avoid_: GateVerdict, result, check, decision (that word is taken)

**suitability gate**:
The deterministic rule evaluation that produces a Verdict. The model calls it and phrases the
answer; it never decides. `packages/core/src/suitability.ts`.
_Avoid_: rules engine, compliance check, guardrail

**ruleBook**:
The gate's rules as `{ id, description }`, published so a compliance officer and an audit row can
name the same rule. `packages/core/src/suitability.ts:435`.
_Avoid_: rules list, policy set

**Product / product shelf**:
A product the bank can actually put a customer into, and the list of them. `Product` is
`packages/core/src/types.ts:302`; the shelf is `PRODUCT_SHELF` at
`packages/fixtures/src/shelf.ts:21`; the wire adds `ShelfProduct`
(`packages/contracts/src/domain.ts:280`). There is no type called `Shelf`.
_Avoid_: catalogue, offering, SKU

### The plan

**Goal**:
Where the customer is trying to get to, as an amount and a date.
`packages/core/src/roadmap.ts:57` — not `goal.ts`, which holds `suggestGoal()`, the function that
proposes one. Mirrored at `packages/contracts/src/domain.ts:618`.
_Avoid_: target, objective, ambition

**Roadmap / Stage**:
The Goal turned into a dated route, and one leg of it. The route is the suitability ladder with the
Goal at the end, so a customer who asks to invest while holding a card at 34.8% gets three stages
before investing. `packages/core/src/roadmap.ts:124` and `:79`, mirrored at
`packages/contracts/src/domain.ts:681` and `:663`.
_Avoid_: plan (taken by DailyPlan), journey, path, milestone

### The daily loop

**DailyPlan**:
What to say to this customer today: what happened since they last looked, whether they are on
route, and exactly one thing to do. `packages/core/src/dailyplan.ts:59`, mirrored at
`packages/contracts/src/domain.ts:790`.
_Avoid_: feed, home, today view, digest

**SafeToSpend**:
What is left to spend before the next salary, after everything already owed.
`packages/core/src/dailyplan.ts:22`, mirrored at `packages/contracts/src/domain.ts:746`.
_Avoid_: budget, allowance, disposable income

### Saving and challenges

**pot**:
The savings balance, filled by rules the customer turns on once rather than by deposits they
approve. `SaveState` is `packages/core/src/save.ts:99`, one `SaveDeposit` is `:89`, the five
`SaveHackId`s are `packages/core/src/save.ts:32`; the wire shape is `SavePot`
(`packages/contracts/src/domain.ts:1026`).
_Avoid_: jar, vault, wallet, goal (taken)

**Challenge**:
A ceiling the customer sets themselves on one merchant or category, over a bounded 28-day window.
Deliberately neither an ActionKind nor an InsightKind: the bank does not do it to an account, and
nobody found it in the data. `packages/core/src/challenge.ts:188` (`ChallengeTerms`) and `:203`
(`ChallengeProgress`); the wire shape is `ActiveChallenge`
(`packages/contracts/src/domain.ts:1156`).
_Avoid_: budget, streak, cap. A `set_category_cap` Action is a different, permanent thing.
`StoredChallenge` (`apps/api/src/ports/session-store.port.ts:33`) is a fourth name in this area
and is allowed for the reason `DecisionRow` is: it is the row a store holds, flat because a jsonb
column shaped like a core interface never gets migrated, and deliberately carrying no progress at
all. It is not a sanctioned duplication of `ChallengeTerms` — it is a storage shape — and a second
one would need the same argument written in the same place.

### Time

**as-of**:
The date a derivation is answered for. Every figure in the product is as of a date, and the
arithmetic lives in one place so the generator, Postgres and the in-memory adapter cannot disagree.
`packages/core/src/asof.ts:29`. See ADR-0002.
_Avoid_: today, now, current date, valuation date

**anchor**:
The fixed date a persona's contracts are stated at and the ledger is generated around: `2026-09-01`.
It never moves; `asOf` is the only thing that does. `packages/fixtures/src/seed-bundle.ts:126`. See
ADR-0012.
_Avoid_: epoch, start date, baseline

**ledger horizon**:
The span the ledger covers and past which the simulated clock may not be advanced: anchor−23 to
anchor+18 months. On the wire it is `LedgerHorizon` (`packages/contracts/src/domain.ts:902`); in
fixtures the richer `SeedHorizon` (`packages/fixtures/src/seed-bundle.ts:93`) carries the anchor
beside it. See ADR-0012.
_Avoid_: range, window, coverage

### Synthetic data

**Persona**:
A synthetic customer described as _behaviour_ — income, commitments, habits — which the generator
turns into a ledger. The type is `PersonaSpec` (`packages/fixtures/src/personas.ts:213`); there are
four — `PERSONAS` at `:1486` is `[KARAN, ROHAN, PRIYA, SUNIL]`.
_Avoid_: fixture customer, test user, mock

**SeedBundle**:
One Persona as the rows a bank would hold rather than as a file shaped for one date: the whole
ledger to the horizon, plus the contracts any date can be rolled from.
`packages/fixtures/src/seed-bundle.ts:103`.
_Avoid_: seed data, dataset, dump

### The record

**AdviceRecord**:
One append-only, hash-chained row per proposal: the exact sentence shown, the rule, the Snapshot it
was judged against, and the chain. Wire-only, `packages/contracts/src/domain.ts:1291`. There is no
core counterpart and there should not be — core does no I/O, and a hash chain is a property of
storage. See ADR-0006.
_Avoid_: audit log entry, trail, event

## How the API is assembled

The domain nouns above say what a figure is. These say where it is decided, which is the other
half of a name landing in the right file. Everything in this section but the last entry is in
`apps/api`, which two other sessions are reshaping as this is written — the symbol is the
address, and a line that has moved should be corrected here rather than worked around.

**Port**:
An interface the application layer depends on and an adapter satisfies — the bank feed, the
session store, the clock. Interfaces only: no port file has a runtime import, and
`ports-are-interfaces-only` in `.dependency-cruiser.cjs` fails if one gains a dependency on an
adapter. `apps/api/src/ports/index.ts` is the barrel, and its count is checked by a test rather
than maintained by hand. A port is earned by a second implementation, present or named.
_Avoid_: interface (every type is one), service (taken, below), gateway, client

**Adapter**:
One implementation of exactly one port, under `apps/api/src/adapters/<source>/`. Adapters do not
import each other; sharing goes through `application/` or `infra/`.
_Avoid_: driver, provider, implementation, backend

**Deps**:
Every port, assembled — the composition root's output. `apps/api/src/composition/root.ts:87`.
`Profile` (`apps/api/src/composition/profiles.ts:80`) is the pair of choices that decides which
adapter each port gets: which bank source, which avatar provider.
_Avoid_: container, registry, context, config (taken by `Config`, the parsed environment)

**AppServices**:
What a route handler is allowed to see: application services, not ports.
`apps/api/src/http/routes/services.ts:43`. A port still on this bag is a reach the route layer
has not yet had taken off it, and each one left is a known gap rather than a pattern to copy.
_Avoid_: services bag, handlers, controllers, API (means the whole app, `apps/api`)

**SnapshotStore**:
The mobile app's provider for the one Snapshot — the value, its loading state and a refresh.
`apps/mobile/src/state/snapshot.tsx:58`. Named for the module rather than for the figures on
purpose, and its own docblock at `:39` says why: `Snapshot` is the object, and a provider that
took the same name would make `data?.snapshot` read as two different things in one file.
_Avoid_: calling it `Snapshot`

## Naming hazards

Not concepts — names that look available and are not.

- **`Record`**. Never declare a domain type called `Record`. Inside the module that declares it,
  it shadows TypeScript's built-in `Record<K, V>`, so a later `Record<ActionKind, …>` in the
  same file fails with an arity error pointing at the utility type rather than at the
  declaration. `CONDUCT_WEIGHTS` (`packages/core/src/credit.ts:125`) and `DISCRETIONARY`
  (`packages/fixtures/src/merchants.ts:88`) are two such uses. The persisted-row concept is
  `AdviceRecord`; a table row takes the `…Row` suffix, as `DecisionRow` does.
- **`Snapshot`**, **`Series`**, **`Verdict`**, **`Goal`**, **`Plan`**. Each is taken above. A
  local alias for one of them in a client file is how a second meaning starts.

Four names drifted in `apps/mobile` while it was being built and are **all resolved in the tree
as it stands** — `RecurringSeries`, `GateVerdict`, a provider-level `Snapshot`, and a `Record`
that shadowed the built-in return zero hits outside this page. They are listed in the _Avoid_
lines above so the same name is not reintroduced, not because a reader will still meet them.
The one apparent exception is real and sanctioned: `DecisionRow` at
`apps/api/src/adapters/postgres/audit-store.postgres.ts:73`.

## Deliberate duplications

Three things in this codebase are written twice on purpose. Each is argued in its own source
comment, and ADR-0014 records why none of them is a bug:

- `packages/core/src/merchants.ts:9` — the recognition table is not the generation table.
- `packages/core/src/dates.ts:4` — calendar helpers are not imported from fixtures.
- `packages/core/src/challenge.ts:51` — `NOT_CHALLENGEABLE` (the set itself is at `:71`) is not
  `derive()`'s `NEVER_DISCRETIONARY`.

Only the second of the three has a mechanical guard — `.dependency-cruiser.cjs`'s
`core-imports-nothing-outside-itself`. The other two are held by prose alone, which is why they
are written down twice: once in the source and once here.
