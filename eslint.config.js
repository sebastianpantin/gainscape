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

const NO_TEST_IDS = [
  {
    selector: "JSXAttribute[name.name='data-testid']",
    message: 'Give the element a role and an accessible name instead of a test id.',
  },
  {
    selector: "Property[key.value='data-testid']",
    message: 'Give the element a role and an accessible name instead of a test id.',
  },
];

const NO_NUMERIC_STYLE = {
  selector:
    "JSXAttribute[name.name='style'] Property[value.type='Literal'][value.value=type(number)][value.value!=0]:not([key.name=/^(flex|flexGrow|flexShrink|fontWeight|opacity|order|zIndex)$/])",
  message: 'Use a spacing token (var(--space-*)) or a stylesheet class instead of a raw pixel number in style.',
};

const BARE_LOADING_TEXT_MESSAGE =
  'Use ScreenSkeleton or ListSkeleton instead of a bare "Loading…" text (docs/design-system.md).';

const NO_BARE_LOADING_TEXT = [
  { selector: 'JSXText[value=/^\\s*Loading(…|\\.\\.\\.)\\s*$/]', message: BARE_LOADING_TEXT_MESSAGE },
  { selector: 'Literal[value=/^Loading(…|\\.\\.\\.)$/]', message: BARE_LOADING_TEXT_MESSAGE },
];

export default tseslint.config(
  {
    ignores: ['node_modules/', 'web/dist/', 'test-results/', 'playwright-report/', 'supabase/.temp/', '.wrangler/'],
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
    files: ['web/src/**/*.{ts,tsx}', 'tests/**/*.ts', 'e2e/**/*.ts'],
    ignores: ['web/src/features/whats-new/changelog-data.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: '__CHANGELOG__', message: 'Import CHANGELOG from features/whats-new/changelog-data.ts.' },
      ],
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-syntax': ['error', ...NO_TEST_IDS],
    },
  },
  {
    files: ['web/src/features/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_TEST_IDS, NO_NUMERIC_STYLE, ...NO_BARE_LOADING_TEXT],
    },
  },
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='getByTestId']",
          message: 'Locate by role and accessible name instead of a test id.',
        },
      ],
    },
  },
  {
    files: ['web/src/sw/**/*.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: [
      'tests/**/*.ts',
      'e2e/**/*.ts',
      'scripts/**/*.{ts,mjs}',
      '*.config.{ts,js}',
      'web/vite.config.ts',
      'web/build/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
