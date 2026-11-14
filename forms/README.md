# Public form packages

Reviewed, signed form data that the personal-entry app (private-app) bundles
(architecture.md §8). Everything here is public data: blank official forms, field definitions and
review records. No personal data, and **no private keys**: only public keys are committed.

```
forms/
  sources/<id>.pdf                       approved blank originals (approval: docs/forms/)
  defs/<formId>/rev-<n>.formdef.json     reviewed FormDef revisions (immutable)
  history/<formId>/rev-<n>.history.json  adoption history: candidate run, model, prompt, changes, review
  keys/<keyId>.pub.json                  package-signing public keys
  trust.json                             which keys are trusted (active/retired/revoked) and revoked packages
  packages/<formId>-r<n>/manifest.json   file hashes and versions, plus manifest.sig.json (ES256)
```

## Chain

1. `node scripts/forms/approve-source.mjs forms/sources/<id>.pdf`
   - Checks the hash, encryption, forms, actions, attachments, annotations and update history.
   - A human then records the approval in `docs/forms/`.
2. public-app analyzes the approved original in the cloud and shows an **unadopted candidate** with its
   `analysisRunId`.
3. A human reviews the candidate against the original and writes a review file.
   `node scripts/forms/promote-forms.mjs <review.json>` writes the new revision and its history; neither may be
   overwritten.
4. `node scripts/forms/build-package.mjs <formId> <rev> <keyId>` writes an unsigned manifest.
5. On the maintainer's machine:
   `FORMTWIN_SIGNING_KEY=<path outside the repo> node scripts/forms/sign-package.mjs <packageId>`
6. `node scripts/forms/verify-package.mjs <packageId>` checks the signature with the committed public key and
   re-hashes every file. private-app runs the same verification at start-up, before any personal data is accepted.

private-app bundles the package through `apps/private-app/vite-plugin-form-package.ts`.
A production build without `manifest.sig.json` and a matching public key still builds, but the app
refuses entry (`unsigned`). Sign the package before deploying private-app. E2E builds sign an in-memory
manifest with a throwaway key, and the page labels it "TEST KEY".

- Revision 1 of `isa-930004094` comes from the hand-measured Spike C layout (`origin: manual-layout`).
- **Revision 2 (current)** was adopted on 2026-11-13 from the hosted cloud candidate
  `run-6dcda61f-dfa7-4ff3-8da9-0028b3406edb`.
  - Model `gemini-3.5-flash-lite`, prompt `spike-b-1`. The exported file is in `forms/candidates/`.
  - Review: `forms/reviews/isa-930004094/rev-2.review.json`.
  - Adopted from the candidate: labels and the three resolved mappings.
  - Corrected: boxes. The candidate's boxes were about 30 pt low and included the label column, so the
    device-verified rev 1 placements were kept. Name and date were split into parts.
  - Rejected: the 17 unsupported fields.
- `forms/current.json` names the revision private-app bundles. A new current revision needs a signed package
  before the next private deploy. `npm run check:package` reports an unsigned current package.

## One-time key setup (maintainer's machine)

```bash
node scripts/forms/keygen.mjs ~/formtwin-signing-key.json
```

This writes the private key with mode 0600 (keep it backed up and private) and
`forms/keys/<keyId>.pub.json` (commit it). Both scripts refuse a private-key path inside the repository.

## Trust list, rotation and revocation

A public key in `keys/` is trusted only when `trust.json` lists it. private-app bundles `trust.json` and
checks it at start-up; `npm run check:package` applies the same rules. Procedures:
[`docs/forms/key-rotation.md`](../docs/forms/key-rotation.md). Edit the list with `node scripts/forms/trust.mjs`.
