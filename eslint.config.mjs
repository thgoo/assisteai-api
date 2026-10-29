// Based on the bargah config, with type-aware rules (strictTypeChecked) so promise misuse
// (floating or misused promises, e.g. a fire-and-forget call nobody awaits or catches) is a lint error.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'drizzle'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        Bun: false,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@stylistic': stylistic,
      perfectionist,
    },
    rules: {
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/linebreak-style': ['error', 'unix'],
      '@stylistic/max-len': ['error', { code: 120 }],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
      '@stylistic/no-trailing-spaces': ['error'],
      '@stylistic/quote-props': ['error', 'consistent-as-needed'],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/semi': ['error', 'always'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['warn'],
      'perfectionist/sort-imports': ['error', {
        groups: [
          ['builtin', 'external'],
          ['parent-type', 'sibling-type', 'internal-type', 'index-type'],
          'internal',
          'object',
          'unknown',
          ['parent', 'sibling', 'index'],
          'style',
        ],
        newlinesBetween: 'never',
        environment: 'bun',
      }],
    },
    settings: {
      perfectionist: {
        type: 'natural',
      },
    },
  },
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // The logger implementation and dev scripts are the only places allowed to write to the console.
    files: ['src/logger/console-logger.ts', 'test/legacy-env/**', 'scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
);
