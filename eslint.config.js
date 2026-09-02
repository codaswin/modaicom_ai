import eslint from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Node build/release scripts (e.g. scripts/package.mjs). Not covered by the
    // TypeScript block above, so without this `eslint .` skips them entirely.
    extends: [eslint.configs.recommended],
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // ADR-0008: the API key must never be reachable from code that runs near
    // LinkedIn or in the popup. keyStore is service-worker / options-page only.
    files: ['src/content/**/*.{ts,tsx}', 'src/popup/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/background/keyStore', '**/background/keyStore.*', '**/keyStore'],
              message: 'keyStore holds the API key and is service-worker / options-page only (ADR-0008).',
            },
          ],
        },
      ],
    },
  },
)
