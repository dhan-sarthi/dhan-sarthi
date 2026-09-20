/* global module */
// Architecture rules, as a CI failure rather than a README promise. Run from the repo root by
// apps/api/test/architecture/depcruise.test.ts:
//
//   node_modules/.bin/depcruise --config .dependency-cruiser.cjs --output-type err \
//     apps/api/src packages/core/src packages/contracts/src packages/fixtures/src
//
// The rules encode the layering in docs/architecture: core is pure and imports nothing from
// the apps or the other packages; the API's application layer never reaches into adapters or
// http; http never reaches into adapters; a route handler may not even name a port; ports are
// interfaces only; adapters do not import one another. composition/ is the one place that may
// name everything.
//
// What these rules cannot see: the cruise excludes test files, and it runs over apps/api and
// the three packages only — apps/mobile is outside the gate.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-imports-nothing-outside-itself',
      severity: 'error',
      comment: 'packages/core is pure: no apps, no sibling packages, no node_modules.',
      from: { path: '^packages/core/src' },
      to: { pathNot: '^packages/core/src', dependencyTypesNot: ['core'] },
    },
    {
      name: 'application-never-imports-adapters-or-http',
      severity: 'error',
      from: { path: '^apps/api/src/application' },
      to: { path: '^apps/api/src/(adapters|http|composition)' },
    },
    {
      name: 'http-never-imports-adapters',
      severity: 'error',
      from: { path: '^apps/api/src/http' },
      to: { path: '^apps/api/src/(adapters|composition)' },
    },
    {
      name: 'route-handlers-do-not-name-ports',
      severity: 'error',
      comment:
        'A route handler translates HTTP and delegates; the rule it delegates to lives in an ' +
        'application module. Naming a port type in a handler file is how that inverts — the ' +
        'file has to see the port to hand-copy fields out of it, and once it can see it, the ' +
        'rule moves in next to the copying. consent-aa.ts did exactly that: it imported ' +
        'ConsentRequestRecord to build the wire response, and the response shape stopped ' +
        "being the application module's to decide. Two files are exempt and are not " +
        'handlers: services.ts, which is the bag the composition root fills and where a ' +
        'port on the surface is a deliberate (and visible) decision, and register.ts, which ' +
        "is the http layer's own plumbing — it holds the session and the clock.",
      from: {
        path: '^apps/api/src/http/routes/',
        pathNot: '^apps/api/src/http/routes/services\\.ts$',
      },
      to: { path: '^apps/api/src/ports' },
    },
    {
      name: 'ports-are-interfaces-only',
      severity: 'error',
      from: { path: '^apps/api/src/ports' },
      to: { path: '^apps/api/src/(adapters|application|http|composition|infra)' },
    },
    {
      name: 'adapters-do-not-import-each-other',
      severity: 'error',
      comment: 'An adapter implements one port; sharing goes through application/ or infra/.',
      from: { path: '^apps/api/src/adapters/([^/]+)/' },
      to: { path: '^apps/api/src/adapters/', pathNot: '^apps/api/src/adapters/$1/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'fixtures-never-imports-apps',
      severity: 'error',
      from: { path: '^packages/(fixtures|contracts)/src' },
      to: { path: '^apps/' },
    },
    {
      name: 'fixtures-stays-behind-the-generated-source',
      severity: 'error',
      comment:
        '@dhan/fixtures generates synthetic customers. Two places in apps/api may name it: ' +
        'adapters/memory, which holds the generated ledger behind BankDataPort, and the ' +
        'ADR-0012 seed path — cli/seed.ts writes it into Postgres, db/seed-bundle.ts defines ' +
        'what is written and re-derives it for the drift check. composition/, http/ and ' +
        'application/ reach the ledger through a port or not at all. This cannot catch ' +
        "root.ts's packageVersion('@dhan/fixtures'), which resolves a variable at runtime and " +
        'is invisible to static analysis; that one is a version string, not a reach.',
      from: {
        path: '^apps/api/src/',
        pathNot: [
          '^apps/api/src/adapters/memory/',
          '^apps/api/src/cli/seed\\.ts$',
          '^apps/api/src/db/seed-bundle\\.ts$',
        ],
      },
      // Both spellings on purpose. The first is how the specifier resolves once packages/ has
      // been built; the second is what is left when it has not, and `test:arch` on a clean
      // tree does not build packages first.
      to: { path: '^(packages/fixtures/|@dhan/fixtures$)' },
    },
  ],
  options: {
    // `/dist/` is doNotFollow, not exclude. A workspace import resolves through the pnpm
    // symlink to the sibling package's built entry point (@dhan/fixtures →
    // packages/fixtures/dist/index.d.ts), and `exclude` deletes an excluded module from every
    // dependencies array — so with it there the graph held zero @dhan/* edges and any rule
    // about a cross-package import passed green while the import was still sitting there.
    // doNotFollow keeps the node and the edge and stops the walk at the package boundary.
    doNotFollow: { path: ['node_modules', '/dist/'] },
    exclude: { path: ['\\.test\\.ts$', '/test/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
      extensions: ['.ts', '.js', '.mjs', '.cjs'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
