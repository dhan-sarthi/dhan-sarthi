/* global module */
// Architecture rules, as a CI failure rather than a README promise. Run from the repo root by
// apps/api/test/architecture/depcruise.test.ts:
//
//   node_modules/.bin/depcruise --config .dependency-cruiser.cjs --output-type err \
//     apps/api/src packages/core/src packages/contracts/src packages/fixtures/src
//
// The rules encode the layering in docs/architecture: core is pure and imports nothing from
// the apps or the other packages; the API's application layer never reaches into adapters or
// http; http never reaches into adapters; ports are interfaces only; adapters do not import
// one another. The composition root is the one place that may name everything.

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
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.test\\.ts$', '/dist/', '/test/'] },
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
