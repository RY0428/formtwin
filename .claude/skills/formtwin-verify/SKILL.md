---
name: formtwin-verify
description: Verify a FormTwin change before reporting it done (loop iterations, fixes, UI changes). Runs the full verification, visual check for UI changes, records results, and enforces the retry limit. Use at the end of every loop item and before every commit.
---

# FormTwin verification procedure

An edit that applied is **not** "done". An item is done only after these steps pass.

## Steps
1. **Full check (output to a file, read only the summary lines):**
   ```bash
   npm run verify > "$SCRATCH/verify.log" 2>&1; echo exit=$?
   grep -nE "Tests |passed \(|failed|✘|ok$|problem|INVARIANT|SECRET|current " "$SCRATCH/verify.log" | tail -20
   ```
   (`$SCRATCH` = the session scratchpad directory.) `verify` runs: check:secrets, check:invariants, lint, typecheck, unit tests, build, bundle checks, package signatures, E2E (production CSP).
2. **UI changed?** Run `npm run ui:snapshots`, then Read each changed screen in `.ui-snapshots/`. Check layout, wording (English, no guarantee wording), and that the change is visible.
3. **Private side touched?** Confirm in the E2E output that the private-app tests saw no foreign requests and no CSP errors. Never widen `connect-src`.
4. **Device-relevant flow?** Make sure `tests/e2e/device-flows.spec.ts` covers the same steps as the real-device checklist. A bug found on a device gets a failing E2E first, then the fix.
5. **Milestone end:** run the `formtwin-reviewer` subagent on the milestone diff. Fix every blocking finding and re-run step 1.
6. **Record:** update the loop progress file (`docs/plans/day8-12.md`: verify result, review result, attempts, commit), `docs/development-history.md`, and the relevant spike/decision docs. Frozen values go in `docs/decisions.md` *before* implementation.
7. **Commit and push.** Two secret checks run: the Claude PreToolUse hook (before the Bash call; it cannot see files
   created in the same command) and the git pre-commit hook `.githooks/pre-commit` (staged blobs, at commit time;
   enabled by `npm ci` via `prepare`). Commit messages end with the attribution lines from the system reminder.

## Rules
- Failure → fix → restart from step 1. **Three failed attempts on the same item → stop and report** (what failed, what was tried).
- Fake-model or fake-cloud results are never evidence of real AI execution. Report "implemented" and "verified on device" separately.
- Specs disagree with the code → stop and ask; do not silently align either side.
- Keep long outputs in files; read only the lines you need.
