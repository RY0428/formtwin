# FormTwin

Hybrid-AI form filling assistant for Japan's Application for Extension of Period of Stay,
built for #BuildHybridAI 2026 with Firebase AI Logic.

> Status (2026-11-13): Day 1–7 scope implemented. On-device extraction is verified on a real device (Spike A).
> Cloud analysis with App Check is implemented and fake-tested, not yet run against the real service.
> See `docs/plans/day1-7.md` for implemented vs verified.

## Two separate apps

- `apps/public-app` — analyzes approved **blank public forms** only, with cloud inference
  (`InferenceMode.ONLY_IN_CLOUD`). It has no input for personal documents.
- `apps/private-app` — the applicant's side. Extracts values from a (fictional) residence card image
  with the on-device model through Firebase AI Logic (`InferenceMode.ONLY_ON_DEVICE`), lets the user review
  every field, and produces a partially filled PDF with a local preview. It is served with `connect-src data:`
  (in-memory data: URLs only; no network origin), keeps data in memory only, and falls back to manual
  entry (never to the cloud). It starts only after verifying the bundled, signed form package.
- `forms/` — the approved blank original, reviewed FormDef revisions, adoption history and signed packages
  (see `forms/README.md`).

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

## Deploy

Requires Node 24 and the Firebase CLI (`npm install -g firebase-tools`, then `firebase login`).

private-app refuses entry unless the form package is signed. Sign it first (forms/README.md), then:

```bash
npm ci
npm run build -w @formtwin/private-app
firebase deploy --only hosting:private
```

public-app needs reCAPTCHA Enterprise + App Check registration and `apps/public-app/.env.local`
(docs/spikes/spike-b.md), then:

```bash
npm run build -w @formtwin/public-app
firebase deploy --only hosting:public
```

Design documents (Japanese): `docs/specs/`.
