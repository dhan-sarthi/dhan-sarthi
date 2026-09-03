-- =====================================================================================
-- 0008  Additive only: the simulated date a roadmap version was cut at and the scopes it was
--       cut under, and an explicit picker order for customers. Nothing is dropped or altered.
--
-- created_at on a roadmap version is the wall clock the row was written at, which under a
-- simulated clock says nothing about the plan. The engine stamps every roadmap with the as-of
-- it was built for, so rows written before this column existed are read through that same
-- value (roadmap->>'createdAt') by the adapter rather than rewritten here: the table is
-- append-only and stays that way.
-- =====================================================================================

ALTER TABLE app.roadmap_versions
  ADD COLUMN at_sim date,
  ADD COLUMN scope_overrides text[] NOT NULL DEFAULT '{}'
    CHECK (scope_overrides <@ ARRAY['PROFILE','ACCOUNTS','TXN','LIABILITIES','HOLDINGS']::text[]);

COMMENT ON COLUMN app.roadmap_versions.at_sim IS
  'The simulated as-of date the version was cut at. Null only on rows older than the column; readers fall back to roadmap->>''createdAt''.';
COMMENT ON COLUMN app.roadmap_versions.scope_overrides IS
  'Consent scopes the session had withdrawn when the version was cut, so the next re-cut can say which scope changed.';

-- The picker: an explicit order rather than whatever the cif happens to sort to. The seed
-- writes it from the fixtures bundle from now on; rows seeded before the column existed are
-- ordered here once, by the persona order the fixtures package declares, because the
-- alternative — a reseed of the shared database — erases every live reviewer session.
ALTER TABLE app.customers ADD COLUMN display_order smallint CHECK (display_order > 0);

COMMENT ON COLUMN app.customers.display_order IS
  'Position on the customer picker. Written by the seed from the fixtures bundle; null under a real feed.';

UPDATE app.customers
   SET display_order = CASE persona_slug WHEN 'rohan' THEN 1 WHEN 'priya' THEN 2 WHEN 'sunil' THEN 3 END
 WHERE display_order IS NULL
   AND data_source = 'fixtures'
   AND persona_slug IN ('rohan', 'priya', 'sunil');
