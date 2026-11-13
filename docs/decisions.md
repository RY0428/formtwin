# Fixed values and decisions

Values are fixed **before** the implementation that uses them, with the reason and date. A later change adds
a new row (never edits an old one) and states why. Evaluation thresholds stay in `docs/eval/protocol.md`.

| Date | Item | Value | Reason / evidence | Status |
|---|---|---|---|---|
| 2026-11-13 | Private CSP `connect-src` | `data:` only | SDK converts image parts via `fetch('data:…')` (spike-a) | fixed |
| 2026-11-13 | Cloud response schema | types, enums, `nullable`, `required` only | Array `minItems`/`maxItems` caused 400 on the hosted run (spike-b diagnostics) | fixed |
| 2026-11-13 | FormDef storage | signed package bundled at build time; Firestore not used | Developer decision; specs updated in M0 | fixed |
| 2026-11-13 | Public "Diagnostics" panel | kept in production as an admin tool; approved original and fixed output variants only | Needed to isolate cloud-side rejections on the hosted app (spike-b); costs 6 requests per run (architecture §8.2); visible to all visitors of the public app, so it counts toward the usage limits (M10) | fixed |
| 2026-11-13 | On-device extraction time limit | 30 s per attempt; on expiry the result is invalidated (the on-device call cannot be aborted with SDK 13.3.0) and manual entry is offered | architecture §6.2-3 candidate; gate warm p95 5.9 s, page-first runs a few to ~15 s on the developer's Mac; developer chose 30 s | fixed |
| 2026-11-13 | Retry count | at most 1 automatic retry, only for retryable failures (invalid/unparsable output); never after time-out, refusal, cancel or unavailability; never to the cloud | architecture §6.2-5 | fixed |
| 2026-11-13 | Inactivity before ending the session | 10 min without input; English warning 1 min before; hidden tab locks immediately (separate from this timer) and the deadline is re-checked against real time on return | architecture §9.1; manual correction median 45.5 s, full entry a few minutes; developer chose 10 min | fixed |
| 2026-11-13 | Session state model | `active / locked` only; an end clears synchronously and starts a new active session (no separate ended state; the end reason is shown) | M7 review note; developer chose to align the spec to the code | fixed |
| 2026-11-13 | AI state across sessions | keep device facts (ready, unavailable, preparing); reset `skipped`/`failed` to `not_started` so AI can be prepared again in the new session | requirements MVP 7; developer chose to keep AI state | fixed |
| 2026-11-13 | What counts as activity | key, pointer and input events only; scrolling does not | decisions row "10 min without input"; developer chose input only | fixed |
| 2026-11-13 | inferenceSource mismatch on the private side | end the session (clear data), fixed English message, AI extraction off until reload; applies to stale requests too | architecture §6.1; M8 review note; developer chose code to spec | fixed |
| 2026-11-13 | Firebase heartbeat IndexedDB on the private side | allowed: `firebase-heartbeat-database` (date + SDK user agent, written by @firebase/app on `getAI()`); no other database or storage area; canary E2E reads its contents | spike-a.md (observed contents); suppressing it would need SDK internals; no personal data | fixed |
