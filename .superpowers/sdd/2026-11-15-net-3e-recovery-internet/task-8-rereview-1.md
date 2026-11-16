# Task 8 fix round 1 re-review

## Finding verdicts

- **R1 — Recovery evidence can belong to different runtime code: ADDRESSED.** `scripts/network/internet-app-report.ts:5-9,88-95` compares the complete executable path/hash maps, including named main files and dynamically named renderer bundles, and requires report/candidate revision plus the same executable map for historical reuse. `tests/internetAppReport.test.ts:55-59,67-69` covers changed hostProcess, transportWindow and renderer hashes, missing/extra executable paths on either side, absent or altered provenance, and map ordering. `task-8-evidence/fix-1/audit.ts:16-35` checks the retained candidate against all six unchanged recovery reports and writes a source-pinned readiness record. The recorded audit contains 22 matching executable hashes and retains each report's original revision and file hash.
- **R2 — The final report can combine different service origins into internetReady: ADDRESSED.** `scripts/network/internet-app-report.ts:12,35-37,72-97` requires a canonical origin in candidate identity, checks every external run against that identity, and binds the deployed attestation to it. `scripts/network/internet-app-manifest.ts:3-16` compares the identity, manifest, requested and compiled-main origins; `scripts/network/internet-app-smoke.ts:84-86` applies this guard before ancestry, build or native work. `tests/internetAppReport.test.ts:60-70`, `tests/internetAppManifest.test.ts:6-16` and `tests/internetAppSmoke.test.ts` cover cross-gate, noncanonical, manifest and relabelled-origin rejection. The retained two launcher negatives each report one exited preparation child, no native peers and successful temporary cleanup (`task-8-evidence/fix-1/audit.ts:43-49`).

## New breakage in the fix diff

None found.

## Out-of-scope observations

- The earlier Minor archive-member verification gap in the reusable manifest tool remains deferred. The present archive was previously checked against its unpacked EXE/ASAR and is unchanged; this is not a fix-round blocker.
- The earlier disclosed intentional test diagnostics remain in historical evidence; this fix did not change those tests.

## Checks and limits

- Read the bounded source/test/documentation fix diff for `80dfded..865a9b9`, then inspected the touched validator, manifest guard, launcher preparation, tests and retained provenance records. No source, index, branch or cloud state was changed.
- `task-8-evidence/fix-1/focused-green.txt` records 4 passing files and **120/120 tests**: report 58, manifest 12, launcher 5, recovery validator 45. `task-8-evidence/fix-1/root-typecheck.txt` records `tsc -b` with no diagnostics; `task-8-evidence/fix-1/verification.json` records root and direct strict typecheck exits of 0 at `b125547`. These are retained implementer runs, not reviewer reruns.
- `task-8-evidence/fix-1/candidate.json` and `readiness.json` bind the canonical intended origin and candidate revision; the readiness record keeps localRecovery PASS, all external gates NOT_RUN and internetReady false. `task-8-evidence/fix-1/audit.ts:36-42` adapts the old loopback driver only in memory and records `nativeRerun:false`. No native, package-wide suite or external gate was rerun for this re-review.

## Verdict

**Fix round: All findings addressed, no new Critical/Important breakage.**
