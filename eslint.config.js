// @ts-check
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries (CLAUDE.md rules 1–6, 10; architecture.md §4).
 * - The two SPAs never import each other.
 * - packages/domain depends on nothing; packages/contracts only on domain.
 * - private-app has no network / persistent-storage APIs and no Firebase
 *   service other than `firebase/ai`, which only `src/ondevice/**` may import.
 * - public-app may import `firebase/ai` only from `src/cloud/**`.
 */

/** Firebase entry points neither app may import (private-app also bans app-check). */
const FORBIDDEN_FIREBASE = [
  'firebase/analytics',
  'firebase/auth',
  'firebase/database',
  'firebase/firestore',
  'firebase/firestore/lite',
  'firebase/functions',
  'firebase/installations',
  'firebase/messaging',
  'firebase/performance',
  'firebase/remote-config',
  'firebase/storage',
];

/**
 * @param {{ allowAi: boolean, allowAppCheck: boolean, otherApp: string }} opts
 */
function restrictedImports({ allowAi, allowAppCheck, otherApp }) {
  const paths = FORBIDDEN_FIREBASE.map((name) => ({
    name,
    message: 'This Firebase service is not allowed here (CLAUDE.md rule 4).',
  }));
  if (!allowAi) {
    paths.push({
      name: 'firebase/ai',
      message: 'Only the inference adapter directory may import firebase/ai.',
    });
  }
  if (!allowAppCheck) {
    paths.push({
      name: 'firebase/app-check',
      message: 'App Check is not initialized here (CLAUDE.md rule 4).',
    });
  }
  return [
    'error',
    {
      paths,
      patterns: [
        {
          group: ['@firebase/*'],
          message: 'Import Firebase only through the public `firebase/*` entry points.',
        },
        {
          group: [`**/${otherApp}`, `**/${otherApp}/**`, `@formtwin/${otherApp}`],
          message: 'The two SPAs must not import each other (CLAUDE.md rule 10).',
        },
      ],
    },
  ];
}

const NETWORK_AND_STORAGE_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'EventSource',
  'WebTransport',
  'RTCPeerConnection',
  'BroadcastChannel',
  'SharedWorker',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'caches',
  'cookieStore',
].map((name) => ({
  name,
  message: 'Network and persistent storage APIs are forbidden in private-app (CLAUDE.md rules 4–5).',
}));

const NETWORK_AND_STORAGE_PROPERTIES = [
  ...['window', 'globalThis', 'self'].flatMap((object) =>
    NETWORK_AND_STORAGE_GLOBALS.map(({ name }) => ({
      object,
      property: name,
      message: 'Network and persistent storage APIs are forbidden in private-app.',
    })),
  ),
  { object: 'navigator', property: 'sendBeacon', message: 'Beacons are forbidden in private-app.' },
  { object: 'navigator', property: 'storage', message: 'Storage APIs are forbidden in private-app.' },
  { object: 'navigator', property: 'serviceWorker', message: 'Service workers are out of MVP scope.' },
  { object: 'document', property: 'cookie', message: 'Cookies are forbidden in private-app.' },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}', '**/vite.config.ts', 'vitest.config.ts', 'tests/**', 'scripts/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // ---------------------------------------------------------------- boundaries
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true, noWarnOnMultipleProjects: true, project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json'] },
      },
      'boundaries/elements': [
        { type: 'public-app', pattern: 'apps/public-app' },
        { type: 'private-app', pattern: 'apps/private-app' },
        { type: 'domain', pattern: 'packages/domain' },
        { type: 'contracts', pattern: 'packages/contracts' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { from: { element: { type: 'domain' } }, allow: { to: { element: { type: 'domain' } } } },
            {
              from: { element: { type: 'contracts' } },
              allow: { to: { element: { types: ['contracts', 'domain'] } } },
            },
            {
              from: { element: { type: 'public-app' } },
              allow: { to: { element: { types: ['public-app', 'contracts', 'domain'] } } },
            },
            {
              from: { element: { type: 'private-app' } },
              allow: { to: { element: { types: ['private-app', 'contracts', 'domain'] } } },
            },
            // External npm modules are governed by no-restricted-imports below.
            { allow: { to: { origin: 'external' } } },
          ],
        },
      ],
    },
  },

  // ----------------------------------------------------- private-app restrictions
  {
    files: ['apps/private-app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        allowAi: false,
        allowAppCheck: false,
        otherApp: 'public-app',
      }),
      'no-restricted-globals': ['error', ...NETWORK_AND_STORAGE_GLOBALS],
      'no-restricted-properties': ['error', ...NETWORK_AND_STORAGE_PROPERTIES],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Dynamic import is forbidden in private-app (no lazy loading after PII input).',
        },
        {
          selector: "NewExpression[callee.name='Worker'][arguments.0.type!='NewExpression']",
          message: 'Create workers only from bundled same-origin URLs (new URL(..., import.meta.url)).',
        },
      ],
    },
  },
  {
    files: ['apps/private-app/src/ondevice/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        allowAi: true,
        allowAppCheck: false,
        otherApp: 'public-app',
      }),
    },
  },

  // ------------------------------------------------------ public-app restrictions
  {
    files: ['apps/public-app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        allowAi: false,
        allowAppCheck: false,
        otherApp: 'private-app',
      }),
    },
  },
  {
    files: ['apps/public-app/src/cloud/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        allowAi: true,
        allowAppCheck: true,
        otherApp: 'private-app',
      }),
    },
  },

  // ---------------------------------------------------- shared packages are pure
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['firebase', 'firebase/*', '@firebase/*'], message: 'Shared packages have no SDK dependencies.' },
            { group: ['**/apps/**', '@formtwin/public-app', '@formtwin/private-app'], message: 'Packages must not import apps.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...NETWORK_AND_STORAGE_GLOBALS],
    },
  },
);
