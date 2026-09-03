// @ts-check
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * One lint configuration for the whole workspace.
 *
 * The rules are deliberately few. Type errors are TypeScript's job (`pnpm typecheck`), formatting
 * is Prettier's (`pnpm format`), so ESLint is left with what neither of them catches: dead
 * variables, unsafe patterns, and the React hook rules that only show up as bugs on screen.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'docs/engineering/evidence/**',
      'apps/web/public/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.es2021 },
    },
    rules: {
      // The domain code uses `_` prefixed names for deliberately unused parameters.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Types are imported with `import type`; mixing them in a value import hides a dependency.
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // A stray `console.log` in a bank's codebase is a review comment waiting to happen.
      // The API logs through pino; the CLI and tests may print.
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Server, scripts and tests run on Node.
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.js', '*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['packages/fixtures/src/cli.ts', 'packages/fixtures/src/cli-figures.ts', '**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },

  // The browser app: React 19 hook rules and Fast Refresh boundaries.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Prettier owns formatting; this disables every stylistic rule above that would fight it.
  prettier,
)
