import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // The two classic hook rules only. react-hooks 7's `recommended` set adds
      // rules for the React Compiler, which this app does not use.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // A leading underscore marks a parameter kept for its position.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The Content-Security-Policy (backend main.py) has no 'unsafe-inline', so a
      // <style> element rendered by React is refused by the browser. CSS goes in
      // src/index.css; style={{}} props are fine (CSSOM, not inline markup).
      'no-restricted-syntax': ['error', {
        selector: "JSXOpeningElement[name.name='style']",
        message: 'Inline <style> is blocked by the CSP. Put the CSS in src/index.css.',
      }],
    },
  },
)
