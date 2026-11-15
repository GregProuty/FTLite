# Net-3b scoped final-fix re-review

Reviewed 2026-11-15: `2a5802e` → `ba52aa1`, using the supplied `review-2a5802e..ba52aa1.diff`, final-fix brief/report and retained final-fix logs. Scope is the three findings from the final whole-branch review and regressions introduced by this five-file fix. This is not a second whole-branch review.

## Strengths

- The production fix is small and remains generic. Point identity/generation discontinuities now trigger a bounded reset independently of tick equality, after the existing stale-tick and arrival checks. Normal interpolation, same-tick transitions, pause/disconnect behavior and input/storage bounds retain their prior paths.
- Dense-history tests reproduce the actual 20 Hz trigger and check both arrival and subsequent samples. Adapter tests use small legal movement for seat/life/target changes, so teleport inference cannot accidentally satisfy their assertions. Sector and ended tests assert coordinates while correctly expecting unchanged point generations.
- Native child assertions remain intact. Stronger report admission supplements actual native evidence rather than replacing it with synthetic fixtures.

## Finding dispositions

| Original finding | Disposition | Review evidence |
| --- | --- | --- |
| Important 1: advancing-tick generation changes retain old presentation | **ADDRESSED** | `src/network/state/timeline.ts:24` computes `pointTransition` for every admitted sample and includes it in the reset predicate. `tests/presentationTimeline.test.ts:16` reproduces ticks 0/3/6/9 → 12 and requires x=1000/new generation immediately and later; identity addition/removal/replacement and stale lower-tick generations are covered. |
| Minor 2: null/empty native evidence and missing closed-PC count accepted | **ADDRESSED** | `scripts/network/rtc-smoke-report.ts:13` requires nonblank status records, structured records for the other checks, separate positive safe-integer ACK/full-received counts for both peers, and exactly six closed host PCs. New tests reject the reported null/empty/false/missing cases and invalid counts. |
| Minor 3: sector/life/ended coverage is nondiscriminating or missing | **ADDRESSED** | `tests/sectorStream.test.ts:231` builds populated interpolation history and requires distinct confirmed arrival/future positions for sector/life/ended as well as teleport/seat/targets. Confirmed snapshots remain unchanged. Retained mutation logs show each sector/life/ended reset removal produces the expected coordinate failure. |

The permitted whole-timeline reset also snaps unaffected points when another point changes identity/generation. This is an explicit, bounded behavior choice authorized by the fix brief, not a regression requiring another change.

## New issues

Critical: none. Important: none. Minor: none found in this fix.

## Verification evidence inspected

- `final-fix-logs/verified-focused.log`: 95 tests across three files pass after restoring the temporary mutation probes; 1.23 s Vitest. `typecheck.log`: clean `tsc -b`.
- `mutation-sector.log`, `mutation-life.log`, `mutation-ended.log`: each targeted run fails exactly one coordinate assertion. The supplied diff has no sector adapter production change; checkout status shows no residual mutation.
- `native.log` and exact `native-report.json`: all 17 checks pass through actual local Chromium/Electron; 13.179 s including build, 8.659 s launcher. Both peers have separate validated ACK/full-received counts; active-interpolation pause matches checkpoint sequence 370; same-tick result/event floor 371 is withheld then released at confirmed sequence 371. Six host PCs close with zero production listeners/timers; 3/3 utility exits, zero owner resources, child exit 0 and isolated-profile removal are recorded.
- `native-missing-evidence.log` and exact deliberately incomplete report: 16 checks, cadence evidence removed, expected exit 1 with `missing actual RTC evidence`, profile removed.

No suites or probes were rerun by this reviewer. No subagents or source/index/HEAD mutations; only this re-review document was written. HEAD observed at `ba52aa1`.

## Declined to judge

- Untouched whole-branch behavior and previously enumerated service/UI/WAN/platform/teleport-inference limits: already covered or explicitly deferred in `2026-11-15-net-3b-final-review.md`; outside this scoped re-review.
- Fresh whole-suite/acceptance/engine/host-gate results on `ba52aa1`: controller is refreshing them; this review does not replace those results or convert the inherited 30-second timing miss into a pass.

## Assessment

**Ready to merge: Yes, for the reviewed Net-3b slice and scoped fixes.** All three findings are addressed, with no new fix-related issue found. The controller retains final validation and residual-scope rulings; internet-demo readiness and acceptance timing remain separate from this code-review approval.
