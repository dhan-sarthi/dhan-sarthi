# Migrations

Plain SQL, numbered, applied in order by `src/db/migrate.ts` (`pnpm --filter @dhan/api migrate`).
Each file runs in its own transaction and is recorded in `public.schema_migrations` with a
checksum; a file that changes after it was applied fails the migrator rather than diverging
silently. Add a migration, never edit one that has run.

The target design is `docs/engineering/schema/` (four schemas, provenance columns, `_raw`
siblings, `common.inr`, append-only hash-chained audit, RLS). The first seven files are the
demo-critical subset of that DDL, adapted to the reviewer-session model in
`dhan-sarthi-arch-drafts/04-data-api.md`; later files are additive.

| File                        | What it holds                                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_foundation.sql`       | extensions (`vector`, `pgcrypto`; `pg_trgm`/`btree_gist` guarded), schemas `common ref staging bank app`, domains, `set_updated_at` / `forbid_mutation` / `sha256_hex`, roles `dhan_migrate` and `dhan_app`                                     |
| `0002_ref.sql`              | `state_codes`, `spend_categories`, `mcc_codes`, `channel_codes`, `products` (+ `aliases`, `verified`), `engine_versions`, `suitability_rules` seeded from the rule book                                                                          |
| `0003_staging.sql`          | `endpoint_registry`, `field_mappings`, `sync_runs` + the consent trigger, `raw_payloads`, `projections`, `seed_runs`                                                                                                                             |
| `0004_app_identity.sql`     | `customers` (+ picker and ledger-shape columns), `consents`, `consent_events`, then the reviewer seam: `subjects`, `sessions`, `idempotency_keys`; the FKs from staging into app                                                                 |
| `0005_bank.sql`             | `customer_profiles`, `accounts`, `account_snapshots`, `transactions` (+ `seq`), `term_deposit_snapshots`, `loan_snapshots`, `loan_schedules`, `mandates`, `mf_holdings`, `sip_registrations` (+ `asset_class`), `insurance_policies`, `nominees` |
| `0006_app_engine.sql`       | `snapshots`, `roadmap_versions`, `verdicts`, `actions`, `audit_records` (hash chain), `decisions`, `avatar_sessions`, `avatar_tool_calls`, `avatar_leases`, `avatar_waitlist`                                                                   |
| `0007_views_security.sql`   | the `*_current` views, `customer_360`, `liabilities_current`, grants and REVOKEs for `dhan_app`, default privileges, RLS policies                                                                                                                |
| `0008_roadmap_at_sim_display_order.sql` | additive: `roadmap_versions.at_sim` (the simulated date a version was cut at; older rows read `roadmap->>'createdAt'`) and `scope_overrides`; `customers.display_order` for the picker, backfilled once for rows seeded before it existed |
| `0009_session_goal_basis.sql` | additive: `sessions.goal_basis` — whether the reviewer's `goal_target` is in today's money or the rupees of the year it lands. Null reads as today, so rows older than the column keep the plan they had |

## Decisions worth knowing before you add a migration

**Two roles, one login.** On the shared Supabase project there is one password. `dhan_migrate`
and `dhan_app` are NOLOGIN group roles granted to the migrating login with `SET`; objects are
owned by that login, `pnpm migrate` and `pnpm seed` run as it, and the API pool runs
`SET ROLE dhan_app` on every connection (`createPool({ role: 'dhan_app' })`). That is what makes
the REVOKEs in 0007 bind the API: `dhan_app` cannot UPDATE or DELETE a record, a snapshot or a
roadmap version, and cannot write seeded identity. The triggers bind everyone else.

**Append-only, enforced twice.** `audit_records`, `decisions`, `avatar_tool_calls` and
`verdicts` raise on UPDATE, DELETE and TRUNCATE. `snapshots` and `roadmap_versions` raise on
UPDATE only: DPDP erasure deletes `app.subjects` and the cascade removes them, and cascades run
as the owner, so the API still cannot delete one directly.

**Hashes are the application's.** `snapshot_hash`, `input_hash` and the record chain are
computed over the canonical JSON in `src/application/hash.ts` (sorted keys, no whitespace), so a
record can be verified without the database and the memory and Postgres stores agree.
`common.sha256_hex` (jsonb canonical) is not the same bytes and is only used when a writer omits
`snapshot_hash`. The database enforces what it can without knowing the form: each audit record
must link to its subject's previous `record_hash` and carry the next `seq`, checked under a
per-subject advisory lock (`app.audit_chain_link`).

**The chain is per subject.** `app.subjects` is the pseudonymisation seam. Audit tables carry
`subject_id` and `session_id` as plain uuids with no foreign key into anything erasure deletes,
so erasing a subject leaves the record intact and unlinkable. `verifyChain(sessionId)` walks the
subject the session belongs to; `pnpm audit:verify` walks every subject.

**The clock lives on `app.sessions.as_of`.** The proposal's `app.sim_clocks` is dropped: fifteen
reviewers get fifteen rows with fifteen clocks, and `POST /session/clock` is one optimistic
`UPDATE … WHERE version = $expected`.

**Staging references identity before it exists.** 0003 creates `sync_runs` and `raw_payloads`
with the customer and consent columns unconstrained; 0004 adds the foreign keys once
`app.customers` and `app.consents` exist. The consent trigger is created in 0003 and only ever
fires after 0004 has run.

**RLS is a seam, not a wall, today.** Policies on `bank.transactions`, `app.snapshots` and
`app.audit_records` scope `dhan_app` to `SET LOCAL app.customer_id` / `app.subject_id` when a
request sets one (`scope()` in `src/adapters/postgres/unit-of-work.ts`) and pass everything
when none is set, so an adapter that never sets a scope still works. The owner bypasses RLS.

## Left for later migrations

From `20_bank.sql`: `account_holders`, `card_snapshots`, `liens`, `mf_transactions`,
`insurance_transactions`, `nps_accounts`, `govt_scheme_accounts`, `equity_holdings`,
`behavioural_signals`, `aa_consent_artefacts`. From `00_common_ref.sql`: `narration_patterns`,
`merchants`, `bank_holidays`, `deposit_rate_cards`. From `30_app_engine.sql`:
`transaction_enrichments`, `recurring_series`, `insights`, `goals`, `roadmaps`/`roadmap_stages`
(superseded by `roadmap_versions` jsonb), `daily_plans`, `trigger_events`, `executions`,
`category_caps` (caps live on `app.sessions.caps`), `memories` (pgvector is installed; ADR-0011
defers the table). `app.verdicts` and `app.actions` exist but nothing writes them yet; they are
reserved for `pnpm replay` and a persisted actions ledger.

`bank.mandates`, `bank.loan_schedules`, `bank.nominees` and `bank.mf_holdings` are created and
readable but the seed does not populate them: core infers mandates from the statement, and the
fixtures carry no schedules, nominees or non-SIP folios.

## Running against the team database

```
pnpm --filter @dhan/api migrate          # apply what is missing; safe to repeat
pnpm --filter @dhan/api seed             # migrate, project the three personas, verify parity
pnpm --filter @dhan/api seed:check       # regenerate and compare the content hash + row counts
pnpm --filter @dhan/api seed -- --force  # reseed even while reviewer sessions exist (erases them)
pnpm --filter @dhan/api audit:verify     # walk every subject's hash chain
```

The scripts read `apps/api/.env` and pin `BANK_SOURCE=postgres` for the process. The integration
suite (`apps/api/test/integration/`) runs the same sequence — migrate, seed, check, port
contract parity, append-only, chain verification — and skips itself when `DATABASE_URL` is unset:

```
cd apps/api && BANK_SOURCE=postgres node --test --experimental-strip-types --env-file=.env test/integration/postgres.test.ts
```

Everything the suite writes beyond the seed happens inside one transaction that is rolled back,
so a shared database is left as it was found.
