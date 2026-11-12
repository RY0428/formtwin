# Dependency Log

Exact versions are pinned in `package.json` files and `package-lock.json`. Record why and when each
notable dependency version was chosen. "Checked" means the version was confirmed on npm on that date,
not that it was verified against real devices.

## 2026-11-12 (Day 1, monorepo scaffold)

Runtime: Node 24.22.1 (`.nvmrc`), npm 11.19.1 (changed from Node 22 the same day: @firebase/ai 3.x requires `node >=24.12.0`).

- typescript 6.0.3 — TypeScript 7.0.2 is the npm latest, but typescript-eslint 8.72.2 requires `typescript <6.1.0`.
- vite 8.3.8, @vitejs/plugin-react 6.3.0, vitest 5.1.0
- eslint 10.14.0, @eslint/js 10.0.1, typescript-eslint 8.72.2, eslint-plugin-boundaries 7.4.2,
  eslint-import-resolver-typescript 4.4.5, eslint-plugin-react-hooks 7.1.1, globals 17.14.0
- react / react-dom 19.3.1, @types/react / @types/react-dom 19.3.0, @types/node 24.19.2
- zod 4.6.7 (packages/contracts)
- @playwright/test 1.63.0 (matches the preinstalled Chromium build in the dev container)
- GitHub Actions pinned by commit SHA: actions/checkout v7.0.1 `3d3c42e5…`, actions/setup-node v7.1.0 `949feb24…`

Known advisory: `npm audit` reports a moderate minimatch ReDoS (GHSA-g3hv-75wg-m249) through
ESLint / typescript-eslint dev tooling. It affects lint-time glob handling only and is not shipped in
either app bundle. The suggested fix downgrades ESLint (breaking). Revisit when typescript-eslint ships a fix.

- firebase 13.3.0 (npm 2026-11-11; @firebase/ai 3.1.0, @firebase/app 0.16.6). Chosen by the developer.
  13.3.0 is not yet on the official JS release notes page (checked 2026-11-12; latest listed is 13.2.0,
  2026-10-30). Public typings diff @firebase/ai 3.0.0 → 3.1.0: `AIErrorCode.ALREADY_INITIALIZED`,
  `useLimitedUseAppCheckTokens` fixed at first `getAI()`, beta `SpeechMetadata`. No hybrid/on-device changes.
- Install scripts denied (`allowScripts` in package.json): `@firebase/util` postinstall (fetches web config
  only when `FIREBASE_WEBAPP_CONFIG` is set; not used), `protobufjs` postinstall.
