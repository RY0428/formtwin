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

Design documents (Japanese): `docs/specs/`.
