/**
 * Shared ESLint config - committed so all four teammates lint identically.
 * Run `npm run lint` before pushing; `npm run lint:fix` fixes what it can.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier', // must stay LAST: turns off rules that fight Prettier
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'public/sw.js'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  overrides: [
    {
      // Build config runs in Node, not the browser, so `process` is legitimate
      // there even though it must never appear in src/.
      files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
      env: { node: true, browser: false },
    },
  ],
  rules: {
    // Fast refresh wants one component per file. The exceptions below are the
    // standard React context pattern - a provider and its consumer hook living
    // together. Splitting those would hurt readability to satisfy a dev-only
    // HMR nicety.
    'react-refresh/only-export-components': [
      'warn',
      {
        allowConstantExport: true,
        allowExportNames: ['useAuthContext', 'useToast', 'AUTH_STATUS'],
      },
    ],
    'react/prop-types': 'off', // no TypeScript in this phase; props are documented in JSDoc
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
