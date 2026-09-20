// @ts-check
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
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
    files: [
      'apps/api/**/*.ts',
      'packages/**/*.ts',
      '*.js',
      '*.mjs',
      /* The repo's own tooling: the asset generators. Node scripts, so `fetch`, `Buffer` and
         `process` are globals here and nowhere else. */
      'tools/**/*.mjs',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: [
      'packages/fixtures/src/cli.ts',
      'packages/fixtures/src/cli-figures.ts',
      /* `tools/` is the same kind of thing one directory up: hand-run generators whose
         entire output is what they print — what was fetched, what was skipped, what the
         rewritten index contains. A silent asset generator tells you nothing. */
      'tools/**/*.mjs',
      '**/*.test.ts',
    ],
    rules: { 'no-console': 'off' },
  },

  /*
   * Expo's build tooling. `babel.config.js`, `metro.config.js` and `tailwind.config.js` are
   * loaded by Node as CommonJS — Babel and Metro read them before any bundler exists — so
   * `module`, `require` and `__dirname` are the correct spelling there, not a lapse. The Node
   * block above stops at root-level `*.js`, which is why these three were never covered.
   */
  {
    files: ['apps/*/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  /*
   * The Expo app's hook rules.
   *
   * `exhaustive-deps` only, not the whole recommended set. The app already carries a
   * `// eslint-disable-next-line react-hooks/exhaustive-deps` in `(onboarding)/otp.tsx`, written
   * against a plugin that at the time was registered for the browser app and nowhere else — so
   * here the directive named a rule ESLint could not find, and *that* was the error. Registering
   * the plugin is the fix for it, and this block is now the only place it is registered.
   *
   * The rest of `recommended` is react-hooks v7's compiler-era set (`set-state-in-effect`,
   * `refs`), and switching it on here reports five findings in `Count.tsx`, `OtpInput.tsx`,
   * `challenge.tsx` and `otp.tsx`. All five are in code whose docblocks argue for the exact
   * pattern the rule objects to — counting from the previous value, distinguishing a typed digit
   * from a six-digit autofill burst. They may well be worth changing, but each one is an
   * animation-behaviour decision that wants the app running in front of someone, not a
   * by-product of turning a rule on. Adopt the set deliberately, screen by screen.
   */
  {
    files: ['apps/mobile/app/**/*.{ts,tsx}', 'apps/mobile/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // An error, not a warning: `eslint .` has no `--max-warnings`, so a warning is a
      // sentence in a terminal nobody reads on CI. A rule that cannot fail the build is not
      // switched on, it is documented.
      'react-hooks/exhaustive-deps': 'error',
      // The two compiler-era rules, and the only two held back. Between them they report
      // five findings, all pre-existing and all in code whose docblocks argue for the exact
      // pattern the rule objects to: `src/ui/Count.tsx` counts from the previous value held
      // in a ref, `src/ui/OtpInput.tsx` reads a ref during render to tell a typed digit from
      // a six-digit autofill burst, and `app/(onboarding)/otp.tsx` and `app/challenge.tsx`
      // set state from an effect to start an animation. Each fix is an animation-behaviour
      // decision that wants the app running in front of someone; turning the rules on blind
      // would trade a lint error for a silent behaviour change. Everything else in the set —
      // including `rules-of-hooks`, and `set-state-in-render` — is on and gating.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },

  // Prettier owns formatting; this disables every stylistic rule above that would fight it.
  prettier,
)
