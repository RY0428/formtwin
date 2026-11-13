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

Revision 1 of `isa-930004094` comes from the hand-measured Spike C layout (`origin: manual-layout`).
No cloud candidate has been adopted yet.

## One-time key setup (maintainer's machine)

```bash
node scripts/forms/keygen.mjs ~/formtwin-signing-key.json
```

This writes the private key with mode 0600 (keep it backed up and private) and
`forms/keys/<keyId>.pub.json` (commit it). Both scripts refuse a private-key path inside the repository.
