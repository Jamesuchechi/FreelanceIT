import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.angular/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/public/**',
      'supabase/**',
    ],
  },
  {
    files: ['**/*.mjs', 'scripts/**/*.mjs', '*.config.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.mts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/invoices/builder*', '**/features/invoices/builder/**'],
              message:
                'Boundary violation: Portal cannot import Invoice Builder or owner-only internals.',
            },
          ],
        },
      ],
    },
  },
  {
    // Scoped restriction specifically for portal
    files: ['apps/web/src/app/features/portal/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/invoices/**', '**/features/work/**', '**/features/settings/**'],
              message: 'Boundary violation: features/portal must not import owner modules.',
            },
          ],
        },
      ],
    },
  },
);
