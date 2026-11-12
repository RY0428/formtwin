# Development History

This file separates work done **before** the #BuildHybridAI 2026 submission period from work done **during** it (Rules section 6, R07).

Submission period: 2026-11-11 13:30 PT – 2026-11-30 14:00 PT (JST 2026-11-12 06:30 – 2026-12-01 07:00).

## Before the submission period

- Product concept and three design documents (Japanese), drafted 2026-11-10 to 2026-11-12:
  - `docs/specs/requirements.md`
  - `docs/specs/architecture.md`
  - `docs/specs/tech-stack.md`
- No application code existed before the period.

> TODO: confirm the exact timestamps of the final spec revisions relative to the period start (2026-11-12 06:30 JST) and adjust this section if any revision happened after the start.

## During the submission period

| Date (JST) | Work | Commit / PR |
|---|---|---|
| | | |
| 2026-11-12 | Monorepo scaffold: npm workspaces (`apps/public-app`, `apps/private-app`, `packages/domain`, `packages/contracts`), TypeScript strict, ESLint boundary and egress/storage restrictions with tests, Vitest, Playwright CSP smoke tests against production builds, Firebase Hosting config for two sites, CI workflow. No AI features yet. | (initial commit) |
