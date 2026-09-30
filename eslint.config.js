import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const noComments = {
  meta: {
    type: 'suggestion',
    messages: { comment: 'Comments are not allowed here; make the code explain itself through naming instead.' },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments())
          context.report({ loc: comment.loc, messageId: 'comment' });
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'web/dist/',
      'test-results/',
      'playwright-report/',
      'supabase/.temp/',
      'web/src/lib/database.types.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    plugins: { gainscape: { rules: { 'no-comments': noComments } } },
    rules: {
      'gainscape/no-comments': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },
  {
    files: ['supabase/functions/_shared/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'Deno', 'process', 'window', 'document', 'localStorage'],
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['tests/**/*.ts', 'e2e/**/*.ts', 'scripts/**/*.{ts,mjs}', '*.config.{ts,js}', 'web/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
