# Pre-publication scan (2026-11-21)

Scope: every blob reachable from any ref after the author e-mail rewrite (134 commits, 901 blobs, 25.8 MB;
text blobs ≤ 3 MB — the larger files are the BIZ UDGothic font and fixed PDFs), plus all commit messages and
author/committer names. Patterns: Google API keys, PEM private keys, JWK private `d`, GitHub tokens, `sk-` keys,
App Check debug tokens, JWTs, the developer's e-mail, Gmail addresses, the developer's name, `/Users/…` and other
home paths, Japanese phone numbers, reCAPTCHA site keys, Firebase app ids.

Result:
- No secrets, private keys, tokens, e-mail addresses, personal names or local paths found.
- Authors/committers: `RY0428` (GitHub no-reply address) and `Claude` (`noreply@anthropic.com`) only.
- Firebase web app id of the dev project appears once in `docs/device-runs/2026-11-21T03-07-26-890Z-null.json`
  (App Check request path). It is a public identifier that the deployed public app already serves; kept.
- `.env.e2e` files hold placeholder ids only (`1:000000000000:web:…`). Real `.env.local` files are git-ignored.
- One reCAPTCHA-shaped hit is part of an npm integrity hash in `package-lock.json` (false positive).
- Images and PDFs in history: generated fictional sample cards (`data/eval/*`), fictional spike renders
  (`docs/spikes/*`), the official blank form (PDL 1.0) and a dummy form.

Not covered: old commits from before the rewrite may stay reachable on GitHub by hash until GitHub removes them.
