# Net-3e Task 6: real-service actual-application recovery proof

**Local recovery PASS.** Six real-service recovery scenarios and six expected-failure cleanup probes completed. Controller review remains separate. The controller owns `progress.md`; this implementer has not edited or staged it.

## Source and implementation

Worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, base `7994e98ba0eda2eadad2460099b37d9dec6fcdec`.

- `a782ba4`: actual-app recovery launcher, strict report validator, passive utility permission observation, actual service upload fault controls, and the focused restoration-copy UI fix.
- `a53915e`: reject declared driver failures; distinguish successful readiness polling from failed runs.
- `694594c`: exact dormant producer reconciliation proof, preserving full checkpoint input and populated bot memory.
- `3bf116c`: accurate fixed diagnostic for deliberate workerd death.
- `b1939d5`: require exact forced utility and runtime-helper exits.
- `a38baf4`, `8a1a149`: native target click acknowledgement, bounded retries only for undelivered hits, retained delivery and helper provenance.
- `bfede55`: preserve the first fixed command failure and stage rather than overwrite them during cleanup.
- `8d24d2f1300bde1c3832d3fbb8aae0006bce5d25`: observe retirement of every owned resource during test-driver shutdown, within its unchanged two-second budget. This is the final source commit; the following evidence commit changes documentation/artifacts only.

The only product behavior change in Task 6 is clearing restoration-only UI copy after resumed gameplay. A later ordinary Pause no longer labels the newest mirror as the original restored tick. Protocol 2, SIM_VERSION 35, checkpoint 2 and the existing replay 2/3/conditional-4 ruling remain unchanged. No gameplay content was re-blessed.

`npm run test:online-recovery-runtime` builds once, then runs the real production menu/renderer/main/utility against the pinned local workerd helper. Direct `npx tsx scripts/network/online-recovery-smoke.ts --scenario=NAME --report-path=PATH` reuses that build. Scenarios are `skiff`, `cutter`, `paused`, `upload`, `race`, and `stale`. Each invocation has a 90-second absolute budget, with work stopped at 80 seconds to reserve cleanup. Existing owned-process/deadline/directory helpers perform bounded exact cleanup; no second coordinator was introduced.

The source-pinned reports contain Git revision/dirty status, content digest, required source hashes, every built JS/HTML hash, Electron/workerd versions, actual process IDs and exits, utility epochs and service generations, committed identity, tick/hash/watermarks, full-ACK ordering, explicit Resume, peer/window/port/listener accounting and exact temporary removal. `dirty:true` includes the controller's unstaged progress ledger and does not substitute for the individual tested artifact hashes.

## What the native passes establish

Real production UI creates the room, joins the reserved logical seats, readies/starts, produces keyboard commands through native ports/RTC and captures a service-committed tick-0 baseline before bootstrap plus a periodic tick-300 save while commands continue. Recovery kills the actual host process tree, explicitly clicks Re-host, authenticates GET, passes those exact committed bytes into the actual utility restore, commits a paused new-generation baseline, and keeps the same run and logical seats. The old host restarts as a guest, full-state ACK precedes input, and only explicit Resume restarts gameplay. Canonical publications agree between applications. Cutter retains the sparse 0/2 roster with vacant-seat bots.

Paused loss restores the paused committed safe point. The upload fault holds the actual app's PUT at the fetch boundary before transmission, retains a newer local pending checkpoint, kills its host, and proves the older committed hash/tick is restored rather than that pending data. This is deliberately a pre-transmission upload interruption, not an assertion that an already accepted service commit can be undone. Simultaneous real service claims yield one winner, one loser with no allocated authority, and a paused reconnect to the winner.

The stale-host scenario blocks actual main forwarding for 25 seconds while its utility and native route remain alive. It waits for the utility's own deadline, sends actual UI Resume over the surviving route, observes rejection, waits for real service lease expiry, claims/restores on the other app and forwards the delayed original service grant. The utility rejects it. The old host has no post-deadline input/control/tick permission or new commit and reconnects as a guest. A trusted suspend-hook invalidates the restored utility; actual OS sleep is separately NOT RUN.

The test-only compiled-authority transform adds observations at exact unique anchors. It records utility-local time immediately before the real `sessionGate.check()` and its unchanged result; labels final pre-tick, ingress and other control checks; and retains the original branches/results. Each utility records original artifact SHA, observed artifact SHA and transform SHA. A source mismatch fails. The trace distinguishes actual permission-check time from scheduled tick time and later publication observation time. An old scheduled catch-up deadline cannot excuse an admitted tick after expiry. No product test seam or grant source was added.

Committed restore input and canonical state remain byte/hash exact. The controller-approved dormant UI rule is documented in [development failures](task-6-development-failures.md). Only genuinely empty placeholder UI may undergo exact existing first-publication reconciliation, with every field checked and sequence counters tied to authoritative watermarks. Populated bot memory permits only explicit counter reconciliation; decision/cursor/repeat and every other field must stay exact. Raw before/after hashes and applied rules remain in each report.

## RED/GREEN and failures investigated

[Development failure chronology](task-6-development-failures.md) records the validator and UI RED/GREEN runs, file-sharing observation races, correct permission timing boundary, teardown-observation race, and the retained upload memory diagnosis. The strict report suite has 32 tests. It rejects fabricated exit zero, missing artifact/runtime/claim/commit/ACK/ownership/cleanup evidence, missing contenders/fence, auto-resume, stale generation, declared run/driver failures, unpinned instrumentation, post-deadline admission and unexplained populated bot-memory changes.

The historical cancellation-to-couch failure did not recur in the final existing actual-app gate. Its wait and cleanup assertions were not changed. Native stderr and injected driver failures use fixed redacted categories. No tokens, endpoint addresses, SDP, candidates or raw native exceptions are included in recovery reports.

## Regression evidence

- Full root suite at `694594c`: **2679 tests / 189 files PASS**, 58.37 seconds. Later changes affect test tools/reporting only. The final focused run at `8d24d2f` passed **40 tests** (32 recovery-report, 2 click, 6 diagnostics); the earlier combined app-report run passed 75 tests. Root typecheck passed again after the final source change. The full suite was not rerun for these scoped test-only changes.
- Signalling: **222 tests / 14 files PASS**, 25.50 seconds. The log retains negative-fixture SQLite and ignored-promise warnings; no test failed.
- Root and signalling typechecks: PASS. Both builds: PASS. Signalling build was `wrangler deploy --dry-run --outdir dist`; no deployment occurred.
- Isolated acceptance: **exit 0, 28824 ms / 30000 ms**, nine default runs. A first untimed invocation also exited 0; the measured isolated run supplies the runtime claim.
- Cross-engine replay: **1800 canonical samples / 404 result-event boundaries**. Node 24.18.0 (18.18 s), Electron 37.10.3 / Chromium 138.0.7204.251 (17.87 s), Firefox 160.0 (22.85 s), all PASS. Output is this task workspace's `engines/` directory.
- Existing native host: 15 checks, 8/8 utility exits, 2972 ms PASS. RTC: 17 checks, 8686 ms PASS. Real service/native RTC: 2855 ms PASS. These ran directly after one production build and were unaffected by later evidence-only changes.
- Existing actual-app gate at `bfede55`: **50855 ms PASS**, including both layouts, bad code, incompatibility, cancellation-to-couch, bot takeover, saved-seat restart and paused rejoin. All eight app processes exited, utilities 2/2 exited, native windows 6/6 and peers 7/7 closed, live windows/ports/listeners/peers zero, helper/workerd exited and temporary root removed. The final shutdown-observation change received the focused regression and affected transport fault rerun below.

## Final actual-application evidence

Each report is `recovery-NAME.json` with its corresponding `.log` in this directory. All six normal commands exited 0; all retained reports pass the final strict validator. All observed apps and utilities exited, helper/workerd exited, resource counters reached zero and each exact temporary root was removed. No final click needed a retry.

| Scenario | Tested source | Elapsed ms | Restored tick | Host generation |
|---|---|---:|---:|---:|
| skiff | `8a1a149` | 19590 | 300 | 2 |
| cutter | `8a1a149` | 21519 | 300 | 2 |
| paused | `8a1a149` | 19369 | 325 | 2 |
| upload | `8a1a149` | 19049 | 300 | 2 |
| race | `8a1a149` | 28470 | 300 | 2 |
| stale | `bfede55` | 42843 | 300 | 2 |

The first five scenario bodies are unchanged by subsequent fixed-diagnostic and shutdown-observation edits. Their hashes and actual tested revisions remain intact; they are not represented as reruns of the final source. All reported built `out/` artifact hashes still match the final local build. The final source differs from the stale pass only in the shutdown observation covered by the affected fault probe.

Stale evidence records a 25018.091 ms main block. At old utility tick 1006, its deadline was 17455.317 ms; the last permitted pre-tick check was 17445.410 ms, control 17445.404 ms and ingress 17446.359 ms. Post-deadline allowed counts are zero for all three boundaries. It records 212 denied ingress checks, 33 denied controls, 209 unavailable results and one rejected delayed real grant. The last advancement publication was observed later at 17468.856 ms; this is deliberately not treated as admission time. Canonical tick and watermarks remain fenced while the live service expires and the new host claims. Cutter's four raw memory hashes remain unchanged; its active vacant-seat bots retain their existing decision tick 299 and held sequence 300.

| Expected failure | Elapsed ms | Actual launcher exit | Tested source |
|---|---:|---:|---|
| timeout | 11392 | 1 | `bfede55` |
| guest-failure | 11976 | 1 | `bfede55` |
| transport-failure | 11055 | 1 | `8d24d2f` |
| worker-death | 11142 | 1 | `bfede55` |
| startup-timeout | 2939 | 1 | `bfede55` |
| build-timeout | 1445 | 1 | `bfede55` |

All fault probes observed exact allocated exits, zero owned resources and temporary removal. Startup timeout allocates no app or workerd: `workerExit:false` accurately means unallocated, while its hung helper is forcibly stopped and its exit observed. The observer-build timeout allocates workerd, which exits. [The final audit](task-6-audit.json) revalidates normal reports, checks current built hashes and fault cleanup, and found **65 unique observed PIDs, zero live candidates**. PID probing supplements the captured owned-exit events; it is not a substitute for them.

Saved, Re-hosting and paused recovery UI screenshots for Skiff and Cutter are retained at 1280x720 and 640x480. Inspection found committed labels and controls readable, frozen presentation retained and the correct crew cards visible. The earlier transient missing Cutter saved label was followed by stable authenticated mirror metadata and a visible label in the final captures; no product loss of committed state was established.

Two intermediate final-Leave failures are retained separately (`recovery-race-failed-leave.json`, `recovery-stale-failed-leave.json`). Their exact cause is unconfirmed: the former lacked click acknowledgement, and the latter's first fixed reason was overwritten by cleanup. Subsequent passes with retained target acknowledgements and first-failure diagnostics succeeded. No claim is made that a product lifecycle defect or the historical cancellation flake was diagnosed or fixed by those passes. The separate transport-fault cleanup observation failure has a deterministic regression and narrow fix, documented in the chronology.

## Reproduction and retained output

Run from the named worktree. Logs retain complete practical output for root/service, acceptance, engines and native gates; early RED/focused output was transcribed contemporaneously in the chronology and is not claimed as a retained raw log.

```powershell
npm test
npm run test:signalling
npm run typecheck
npm run typecheck:signalling
npm run build
npm run build:signalling
npm run acceptance
npm run test:determinism -- --output-dir=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/engines
npx tsx scripts/network/host-smoke.ts
npx tsx scripts/network/rtc-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-6-rtc.json
npx tsx scripts/network/room-service-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-6-room-service.json
npx tsx scripts/network/online-app-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-6-online-app.json
npx vitest run tests/onlineRecoveryReport.test.ts tests/onlineAppClick.test.ts tests/onlineAppDiagnostics.test.ts
npx tsx .superpowers/sdd/2026-11-15-net-3e-recovery-internet/audit-task-6.ts
```

Recovery command template: `npx tsx scripts/network/online-recovery-smoke.ts --scenario=NAME --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/recovery-NAME.json`. Fault template: the same launcher with `--inject-NAME` and its distinct report path (default Skiff). Names are exactly the six rows in each table. The combined package script builds before the default recovery run; direct invocations above intentionally reuse one production build. Acceptance was timed alone with a PowerShell stopwatch, recorded in `task-6-acceptance-time.json`; no timeout was increased.

## Proof limits

This task proves local recovery only. HTTPS configuration, live deployment, provider credentials, TURN/forced relay, WAN, two physical computers/different networks and actual OS sleep are NOT RUN. No cloud action, secret lookup, upgrade, owner-checkout edit, unrelated temporary cleanup, merge or push occurred. The previously denied exploratory temporary directory was never touched. Local recovery PASS is a prerequisite for Task 7, not internet readiness.
