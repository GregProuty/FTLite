# Net-3e whole-slice final review

Review Net-3e Tasks 1–8 from baseline `5249b50` through the HEAD supplied in dispatch. This is the one final whole-slice review after per-task reviews, not a new review of completed Net-3a–d. Follow the requesting-code-review/code-reviewer.md template: concrete severities, file/line, user impact, declined-to-judge list, clear readiness verdict. Do not spawn agents. Read-only repository; write only the requested review report.

## Requirements and evidence

- Plan: `docs/superpowers/plans/2026-11-15-net-3e-recovery-internet.md`
- Design: `docs/superpowers/specs/2026-11-15-net-3e-recovery-internet-design.md`
- Rulings: `docs/superpowers/reviews/2026-11-15-net-3e-rulings.md`
- Workspace: `.superpowers/sdd/2026-11-15-net-3e-recovery-internet/`
- Persistent ledger: `progress.md`; task briefs/reports/reviews and scoped re-reviews are in the same workspace.
- Candidate: `docs/superpowers/reviews/2026-11-15-net-3e-release-candidate.md`; operator procedure: `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md`.
- Task 8 report and `task-8-evidence/` hold exact source/runtime/package/Worker pins and current verification. Read subsequent fix sections for provenance updates.

Read the provided full review package once in bounded passes. The companion code view removes only bulk `.superpowers/` evidence hunks; all product, scripts, tests and docs remain. Inspect referenced evidence structurally and by provenance, not by rereading every repeated hash row. Use targeted current-source reads for concrete questions. Do not rerun full suites/native gates, call cloud services, read secrets/root .env, deploy, change Git state, or create other review agents.

## Integration risks to assess

Utility-local request-start/deadline and regrant rules; gate checks before ingress, control drains and each catch-up tick; replay v4 interrupted-prefix and lifecycle-Resume handling while preserving legacy playback; complete-boundary captures and bounded ACK/candidate lifecycle; atomic mirrors and uncertain PUT reconciliation; graceful exit deadline; manual same-connection claim resolution, committed-only paused restore and full ACK before input; UI/capacity replacement and stale callbacks; HTTPS/ICE ownership, quotas, refresh, setup deadline, cancellation and bounded early signalling; exact candidate/runtime/Worker/origin identity and semantic internet-readiness admission; absolute native launcher cleanup deadlines and package exclusions.

## Deferred observations for explicit triage

- Earlier native Leave/cancellation failures have an unconfirmed cause. Historical failures and limitations are disclosed; later passes do not prove a fix. A separately reproduced shutdown observer race was fixed and tested. Do not silently conflate these causes.
- Task 8 reusable candidate manifest originally compared unpacked files and ZIP hash independently. Reviewer verified current ZIP member EXE/ASAR hashes match, so no current artifact mismatch. Consider whether future stale-ZIP pairing warrants a fix before release.
- Baseline optional-art stderr, injected service SQL failures/async-handler warning, and Git CRLF advisories are disclosed. Passing totals do not mean pristine output.
- Acceptance 28.695s is close to unchanged 30s limit. Do not change threshold or re-bless gameplay.
- Replay v4 is an explicit approved demonstrated-serialization ruling, not an accidental format change.
- Dormant empty bot UI initialization uses narrow full-field reconciliation; populated bot memory remains exact.
- Actual OS sleep, deployed service, live selected relay and two physical devices remain NOT_RUN. Their absence is the explicit Task 9 boundary, not a Task 8 failure or permission to claim internet-ready.

Output one combined findings report. If findings require changes, controller dispatches one combined fix wave and one scoped re-review. Keep branch/worktree/evidence preserved; no merge or deployment.
