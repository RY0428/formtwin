# Fixed values and decisions

Values are fixed **before** the implementation that uses them, with the reason and date. A later change adds
a new row (never edits an old one) and states why. Evaluation thresholds stay in `docs/eval/protocol.md`.

| Date | Item | Value | Reason / evidence | Status |
|---|---|---|---|---|
| 2026-11-13 | Private CSP `connect-src` | `data:` only | SDK converts image parts via `fetch('data:…')` (spike-a) | fixed |
| 2026-11-13 | Cloud response schema | types, enums, `nullable`, `required` only | Array `minItems`/`maxItems` caused 400 on the hosted run (spike-b diagnostics) | fixed |
| 2026-11-13 | FormDef storage | signed package bundled at build time; Firestore not used | Developer decision; specs to be updated in M0 | decided, specs pending |
| — | On-device extraction time limit | to fix at M8 start | architecture §6.2-3 proposes 30 s; gate warm p95 was 5.9 s | pending |
| — | Retry count for retryable failures | to fix at M8 start | architecture §6.2-5: at most 1 | pending |
| — | Inactivity time before ending the session | to fix at M7 start | architecture §9.1: needed; no measurement yet | pending |
