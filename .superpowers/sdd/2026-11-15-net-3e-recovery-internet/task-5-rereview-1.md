- **Frozen-state reuse omits crew-count compatibility — ADDRESSED.** `src/renderer/src/app/onlineSession.ts:45` now reallocates when the incoming validated publication's `playerCount` differs from the frozen state's count, preventing the incompatible `restoreSnapshot` call. `tests/onlineRenderer.test.ts:44-79` covers replacement from three to four crew on the same Cutter layout, retained/live frozen presentation before the first replacement state, successful sync/running notifications, four-crew drawing, and disposal of the former frozen allocation.

### New Breakage in the Fix Diff

- None found in `b067fa6..7994e98`. The sole production change extends the existing allocation compatibility check; equal-capacity reuse remains unchanged.

### Out-of-Scope Observations

- The prior Minor restored-tick wording finding is explicitly deferred to Task 6 by the controller and recorded at `task-5-report.md:86`. Non-blocking for this scoped fix round; no new outside-diff findings.

### Verification

- Read the supplied fix package once, the task brief, prior review, appended fix report, renderer allocation path and snapshot capacity contract. No git commands, source changes or test reruns.
- `task-5-report.md:81-84` names the focused RED regression and final covering command, records 27/27 passing tests across renderer/menu/router/bridge, and records passing typecheck and whitespace checks. These reported results were not independently rerun; the changed regression assertions and corrected typed fixture declarations match the stated fix.

### Verdict

- **Fix round: All findings addressed, no new Critical/Important breakage.** The scoped Important capacity finding is closed; the existing Minor wording follow-up remains deferred to Task 6.
