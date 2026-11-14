# Package-signing key rotation and revocation

Rules: `docs/decisions.md` (2026-11-14). The trust list `forms/trust.json` decides which keys are trusted;
a public key file in `forms/keys/` alone is not. private-app applies the list at start-up (bundled at build
time) and `npm run check:package` applies the same rules.

Key states: `active` (signs new packages), `retired` (packages created on or before `retiredAt` still
verify), `revoked` (nothing signed by it verifies). Private keys stay on the maintainer's machine, outside
the repository; nothing here reads them except `sign-package.mjs`.

## Planned rotation (maintainer's machine)

1. New key (writes the private key outside the repo and `forms/keys/<newKeyId>.pub.json`):
   `node scripts/forms/keygen.mjs ~/formtwin-signing-key-<date>.json`
2. Trust it: `node scripts/forms/trust.mjs add-key <newKeyId>`
3. Re-sign the current package with the new key (revision from `forms/current.json`):
   `node scripts/forms/build-package.mjs isa-930004094 <rev> <newKeyId>`
   `FORMTWIN_SIGNING_KEY=~/formtwin-signing-key-<date>.json node scripts/forms/sign-package.mjs isa-930004094-r<rev>`
4. Retire the old key: `node scripts/forms/trust.mjs retire-key <oldKeyId>`
5. `npm run check:package` (all signed packages verify; the current one is `trusted`), then `npm run verify`.
6. Commit `forms/keys/`, `forms/trust.json`, `forms/packages/`; push; build and deploy private-app.
7. Keep the old private key offline until no deployed build depends on it, then delete it.

## Compromised key

1. `node scripts/forms/trust.mjs revoke-key <keyId>` — every package it signed stops verifying.
2. Generate and trust a new key, re-sign the current package (steps 1–3 above), `npm run check:package`.
3. Deploy private-app at once: a build still bundling the old trust list keeps trusting the key until redeployed.

## Withdrawing a package

`node scripts/forms/trust.mjs revoke-package <packageId> "<reason>"` records the package's exact manifest
hash. If it is the current package, point `forms/current.json` to a good revision (or sign a fixed one)
before deploying: `check:package` fails while the current package is revoked, and the app would refuse entry.

## Limits

The trust list ships inside each build. Revocation takes effect for users only after the new build is
deployed and loaded; there is no runtime revocation check (the private side makes no network requests).
