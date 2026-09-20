// Metro, configured for this pnpm monorepo.
//
// Two things differ from a standalone Expo app: we watch the repo root so edits in
// packages/* trigger a reload, and we let Metro resolve through pnpm's symlinked
// store. `@dhan/design` ships TypeScript source rather than a build, so Metro
// transpiles it like any other app file — there is no build step to forget.
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// Left on (the Metro default). pnpm nests a package's own dependencies under
// node_modules/.pnpm/<pkg>/node_modules, and several Expo packages require transitive
// peers they do not declare — @expo/metro-runtime reaching for @expo/log-box, for one.
// Disabling hierarchical lookup is the usual monorepo advice and breaks exactly those.
config.resolver.disableHierarchicalLookup = false
config.resolver.unstable_enableSymlinks = true

// `@dhan/core` is the decision engine — the nine suitability rules, the roadmap ladder,
// the categoriser, the narration parser. It is pure TypeScript with no dependencies, so
// Metro can compile it straight from source; resolving it here rather than through its
// built `dist` means an edit to a rule hot-reloads into the app instead of needing a
// `tsc -b` first, and the app can never be looking at a stale build of the engine.
const SOURCE_PACKAGES = {
  '@dhan/core': 'packages/core/src/index.ts',
}

const defaultResolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const source = SOURCE_PACKAGES[moduleName]
  if (source) {
    return { type: 'sourceFile', filePath: path.resolve(workspaceRoot, source) }
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './global.css' })
