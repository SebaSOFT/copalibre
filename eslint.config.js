// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.astro/**',
      '**/node_modules/**',
      '.claude/worktrees/**',
      // Vendored agent-tooling bundles. `npx impeccable install` drops minified
      // browser scripts here; they are gitignored, so CI never lints them, but
      // locally they contributed 726 errors to `yarn lint` — a required gate —
      // for code this repository neither writes nor ships.
      '.claude/skills/**',
      '.tmp/**',
      'playwright-report/**',
      'test-results/**',
      // Build artifacts copied into place at build time (the OpenAPI
      // artifact and vendored Scalar bundle) — not source, not committed.
      'apps/web/public/openapi/**',
      'apps/web/public/vendor/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Astro components (apps/web)
  ...astro.configs['flat/recommended'],

  // React/TSX (control islands, later phases)
  {
    files: ['**/*.tsx'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
    settings: {
      // Pinned rather than detected: eslint-plugin-react's detection calls an
      // ESLint 9 context API that ESLint 10 removed, and it only fires once a
      // .tsx file exists — added with the first public web surface.
      react: { version: '19.2' },
    },
  },

  // Zero-warnings policy support: forbid the escape hatches AGENTS-style docs ban.
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  // Raw colour literals belong to packages/design-tokens and nowhere else.
  // A hex typed into a component is a value no theme can move and no
  // forbidden-token scan can see, because the scan reads generated output.
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.astro'],
    ignores: ['packages/design-tokens/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message:
            'Raw colour literals live in @copalibre/design-tokens; use a semantic token instead.',
        },
        {
          selector: 'Literal[value=/^(?:rgb|rgba|hsl|hsla)\\(/]',
          message:
            'Raw colour literals live in @copalibre/design-tokens; use a semantic token instead.',
        },
      ],
    },
  },

  // packages/rules must stay strictly browser-isomorphic (openspec 0279):
  // ControlApp.tsx and other client:* islands import @copalibre/rules
  // directly, so a Node-only built-in import doesn't fail the build — it
  // fatally crashes hydration in the browser with "has been externalized
  // for browser compatibility" instead. Test-only files never ship to a
  // browser bundle, so they're exempt.
  {
    files: ['packages/rules/src/**/*.ts'],
    ignores: ['packages/rules/src/**/*.test.ts', 'packages/rules/src/test-support/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message:
                '@copalibre/rules must stay browser-isomorphic (openspec 0279) — a Node built-in here crashes every client:* island that imports this package at hydration, instead of failing the build.',
            },
          ],
        },
      ],
    },
  },

  // Config files run in Node (CommonJS) without type info.
  {
    files: ['**/*.config.js', '**/*.config.mjs', '**/*.cjs', 'jest.*.js', '**/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        queueMicrotask: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        Blob: 'readonly',
        HTMLCanvasElement: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Prettier last: disables stylistic rules that would fight the formatter.
  prettier,
);
