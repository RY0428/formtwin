# FormTwin

Hybrid-AI form filling assistant for Japan's Application for Extension of Period of Stay,
built for #BuildHybridAI 2026 with Firebase AI Logic.

> Status: Day 1 scaffold. No AI features are implemented or verified yet.

## Two separate apps

- `apps/public-app` — analyzes approved **blank public forms** only, with cloud inference
  (`InferenceMode.ONLY_IN_CLOUD`). It has no input for personal documents.
- `apps/private-app` — the applicant's side. Extracts values from a (fictional) residence card image
  with on-device Gemini Nano (`InferenceMode.ONLY_ON_DEVICE`), lets the user review every field,
  and produces a partially filled PDF. It is served with `connect-src 'none'`, keeps data in memory only,
  and falls back to manual entry (never to the cloud).

The apps are built and deployed to separate origins and must not import each other (enforced by lint).

## Development

```bash
npm ci
npm run verify   # lint, typecheck, unit tests, build, bundle check, E2E (production CSP)
```

## Firebase setup (development project)

- Project: `formtwin-dev` (Spark plan). Hosting targets in `.firebaserc`:
  `public` → `formtwin-dev` (https://formtwin-dev.web.app), `private` → `formtwin-dev-private`
  (https://formtwin-dev-private.web.app). To use another project, copy `.firebaserc.example`.
- Put the Web app config in `apps/<app>/.env.local` (see `.env.example`). Never commit it.

## Deploy (private-app)

Requires Node 24 and the Firebase CLI (`npm install -g firebase-tools`, then `firebase login`).

```bash
npm ci
npm run build -w @formtwin/private-app
firebase deploy --only hosting:private
```

The public app is deployed after its App Check setup (Spike B).

Design documents (Japanese): `docs/specs/`.
