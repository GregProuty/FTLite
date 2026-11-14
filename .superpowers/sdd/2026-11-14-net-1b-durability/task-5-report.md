# Task 5 — real-engine determinism and final durability gate

Implemented in the assigned `codex/net-1b` worktree, starting at `4b39cff`. This report covers task 5 implementation and verification; the controller's whole-branch review remains pending. No owner-checkout edits, plan/ledger edits, subagents, dependency installation, Cloudflare work, gameplay blessing, SIM_VERSION change, scenario-floor relaxation or timeout increase occurred.

## Deliverables and fixture contract

`scripts/determinism/{fixture.ts,protocol.ts,run.ts,browser.ts,electron.cjs,preload.cjs,index.html,capture.ts}` provides the shared portable runner and real-engine launch/reporting path. `npm run test:determinism` is a read-only verification command: checked-in inputs and expected canonical fields/hashes/results/events are loaded and compared before any success claim. `capture.ts` is separate explicit one-time authoring and refuses an existing fixture. The runtime does not invoke it. Expected vectors were not regenerated for the performance source changes; the test-only checkpoint/init digest headers are rebound explicitly. Production digest validation remains strict.

`tests/fixtures/determinism-v2.json` is **1,766,872 bytes**, compact held-segment and semantic-command schedules plus losslessly delta-encoded expected fields. Inputs are independent fixed scripts, with no bots, gameplay-driven command selection or repeated neutral tick arrays. Runtime expansion uses the authority's semantic admission/phase executor and records actual frame outcomes; production `runReplay` validates and executes those frames, comparing every completed boundary. Each run also executes a split prefix/suffix from the portable checkpoint at local tick **777**, comparing the final complete checkpoint and every recorded suffix outcome. A two-world variant alternates every boundary for **600 completed ticks per ship** while both worlds remain live, matching the isolated samples. Long runs themselves are not truncated for this variant.

The actual fleet is Cutter with three crew and Skiff with two; tests assert both the ship set and each allocation against `shipForCrew`. The historical Starter fixture used while validating launcher plumbing was superseded and is not final acceptance evidence. Both final ships have **54000 completed ticks and exactly 900 every-60-composite-tick samples**. The last run in each chain intentionally ends at the remaining requested duration; all preceding runs must reach the pinned terminal tick or the harness fails.

| Run ID | Seed | Local completed ticks | Composite completed ticks | Boundary |
|---|---:|---:|---:|---|
| det-cutter-0 | 20261114 | 12286 | 12286 | ended |
| det-cutter-1 | 20261115 | 10661 | 22947 | ended |
| det-cutter-2 | 20261116 | 12454 | 35401 | ended |
| det-cutter-3 | 20261117 | 10572 | 45973 | ended |
| det-cutter-4 | 20261118 | 8027 | 54000 | partial |
| det-skiff-0 | 20261114 | 2491 | 2491 | ended |
| det-skiff-1 | 20261115 | 5691 | 8182 | ended |
| det-skiff-2 | 20261116 | 2559 | 10741 | ended |
| det-skiff-3 | 20261117 | 3742 | 14483 | ended |
| det-skiff-4 | 20261118 | 7401 | 21884 | ended |
| det-skiff-5 | 20261119 | 4073 | 25957 | ended |
| det-skiff-6 | 20261120 | 2062 | 28019 | ended |
| det-skiff-7 | 20261121 | 2498 | 30517 | ended |
| det-skiff-8 | 20261122 | 2498 | 33015 | ended |
| det-skiff-9 | 20261123 | 2062 | 35077 | ended |
| det-skiff-10 | 20261124 | 5971 | 41048 | ended |
| det-skiff-11 | 20261125 | 2498 | 43546 | ended |
| det-skiff-12 | 20261126 | 8936 | 52482 | ended |
| det-skiff-13 | 20261127 | 1518 | 54000 | partial |

Each sample records ship, seed, run ID, local tick, composite tick, hash and named canonical fields. A mismatch reports the first differing sampled tick and field with expected/actual values. Results/event-order comparison is separate from hashes. There are **404 boundaries**, **331 results** (250 applied, 5 no-op, 76 rejected), and **207 events** (114 cue, 76 pause, 17 ended). Those are event identity/order metadata, not dispatched presentation effects.

Meaningful required coverage is asserted through production replay prefixes, not merely inferred from schedule labels: **43 applied votes**, **19 applied shop purchases** (the 19 early event-open attempts correctly reject), **14 applied reactor purchases**, **14 applied scans**, **70 applied tab switches**, **14 applied stands**, **19 unsupported moveTo results**, and **19 stale fire results**. Debris ID 99 impacts at tick 5; the enemy fires a new object ID 101 into the same slot at tick 30; the recorded stale fire occurs at tick **61**, while replacement 101 is present. A targeted red test first failed because no tick-61 result existed; the authored fire was moved there, and all **1800 existing canonical fields/hashes were proved unchanged** before updating only the authored command schedule and ordered outcome metadata. Other target requests yield 18 stale-target and one unavailable result. There are **114 held segments**, including `.6/.8`, `-1/-1`, `.125/-.75`, and `1/.33`; a targeted production-phase test verifies exact diagonal normalization. Pause/resume occurs at completed ticks 60 and 901 with four applied controls/events per run.

## Engine evidence

Final digest: `1110d6df40ba79dcaba50c06081326dd73c908e041e4b387371021e4adaca546`.

| Engine | Actual version | Final result | Internal elapsed |
|---|---|---|---:|
| Node | v24.18.0 | 1800 samples / 404 boundaries match | 20.30s |
| Electron renderer | Electron 37.10.3, Chromium 138.0.7204.251, V8 13.8.258.32-electron.0 | 1800 samples / 404 boundaries match | 20.04s |
| Real headless Firefox | Firefox 160.0, Windows NT 10.0 Win64 x64 | 1800 samples / 404 boundaries match | 24.16s |

First differing sampled tick/field: **none**. `task-5-logs/engines.json`, `determinism-final.log`, `chromium.log` and `firefox.log` preserve versions, run IDs/seeds/end ticks, timing and verified counts. Every browser receives the same Vite bundle, fixture and strict current digest. Chromium is a real hidden BrowserWindow with Node integration off, context isolation and sandbox on, and a narrow IPC reporting preload. Firefox launches `C:/Program Files/Mozilla Firefox/firefox.exe` with `-headless -no-remote` and its own temporary profile. Reporting uses a 127.0.0.1-only endpoint with a fresh capability token. No Pixi/WebGL is involved in this gate. ELECTRON_RUN_AS_NODE is removed from child environments and is never browser proof.

Both profiles are allocated under a dedicated mkdtemp directory. Cleanup targets only the child PID tree and the verified temporary directory; no user's browser is killed. Initial launcher probes isolated Windows Electron's rejection of a URL followed by a bare positional profile path (exit 4294967295 before JavaScript); using the standard `--user-data-dir` switch fixed it. The inherited host crashpad pipe is also excluded from child environments. Missing mandatory Chromium fails; missing optional Firefox explicitly says NOT RUN. Firefox was available and **did run** here. Safari/JSC, ARM and other OS platforms remain gaps.

Harness failure tests cover canonical first-field mismatch, command-result mismatch, event-order mismatch, actual page-error reports, silent timeout, malformed successful reports, missing mandatory Chromium and optional missing Firefox. Final tests total **14** in `determinismHarness.test.ts`. Additionally, `npm run test:determinism -- --inject-page-failure` launched real Chromium, threw an actual page exception and returned **exit 1** (`task-5-logs/injected-page-failure.log`). The fixed 120s browser timeout was never raised.

## Full gate, integration corrections and performance

All checks were sequential where timing mattered. Final commands:

- `npm test -- --reporter=dot`: **1664/1664 tests**, **129 files**, **53.86s internal / 54.7166185s wall**, exit 0. `task-5-logs/full-test-final.log`.
- `npm run typecheck`: exit 0. `task-5-logs/typecheck.log`.
- `npm run build`: exit 0, renderer 852 modules. `task-5-logs/build.log`.
- `npm run acceptance`: exit 0, **29.1554908s wall**. `task-5-logs/acceptance-final.log`.
- `npm run test:determinism`: exit 0, final real-engine evidence above.
- `git diff --check`: pass (only Git's normal LF-to-CRLF notices).

The final suite includes all eight unchanged gate families, combat tempo, independent Net-1a action/RNG/gameplay projections, golden, snapshot/checkpoint/replay, viewer HUD, disposal/recycling and boundary tests. No separate shortened gate was substituted. **SIM_VERSION remains 35; golden final hash remains b87a0284.** The nine final acceptance data rows compare byte-for-byte equal (after reading their text encodings) to the read-only original baseline at `C:/Users/djuar/FTLite/.superpowers/net1a-staging/execution-context/task-3-benchmarks/20261113-181731/acceptance-baseline.log`.

Existing numeric gate evidence remains exact: jump/run end **56995/55794**, both **18 jumps**; run scrap earned/spent/remaining **822/30/792**, final hull **100**; Warden Pulse/Heavy **35/25 and 31/21 shots/hits**, **270/183 seconds**; duo min health **27.175/57.550/57.700**, Skiff **60.925/25.325/67.825**, floors still **25**. Full unchanged acceptance rows are retained in the final log.

Initial full suite: **1643 passed / 16 failed**, 127 files, **66.59s / 67.8016255s wall**, plus a worker RPC timeout (`full-test.log`). Named causes:

1. `authorityBoundary.test.ts` allowed only authority.ts to import the core, missing the new validated production replay owner. The whitelist now names exactly authority.ts and replay.ts; negative probes reject other direct importers.
2. Nine `bot self-preservation` cases deliberately force `rooms.fire=1e6`; strict startup checkpoint validation now rejects those impossible wire states. Controller-authorized extraction preserves their scenario bodies, values, loops and assertions exactly in `botSelfPreservationUnit.test.ts`, using the existing owned whole-phase adapter plus `botPolicyIntent`. The one valid revive-first case remains in ordinary `bot.test.ts` on the copied-byte path. A narrow AST whitelist limits the exception to that dedicated unit file. Production snapshot bounds were not widened. Ordinary bots, gates, parity, acceptance, golden and byte continuations remain on the authority/replica path. The extracted scenario bodies were independently compared to original HEAD before narrowing the valid case back into the byte file. Focused correction: **26/26 tests**, 3 files.
3. Existing director soak (60s), golden parity (5s), three run scenarios (5s) and snapshot continuation (5s) hit contention timeouts. All **162 tests** in the five affected files passed with two workers in **29.36s** with unchanged timeouts. An eight-worker pre-optimization full run passed **1660/1660** but took **72.06s / 72.9985284s wall**, outside the 60s review budget. Default acceptance initially took **36.7997469s**, outside 30s.

Profile (`acceptance.cpuprofile`, local diagnostic artifact) top self samples: unflatten **2641**, Zod parse **2343**, canonical validation **1945**, flatten **1932**, GC **1685**, structuredClone **1462**, saveSnapshot **1461**. The controller approved a narrow measured traversal/range-plan optimization. Final implementation:

- Canonical metadata compiles a container/field routing plan. Containers, array properties, current crew IDs and targets resolve anew on every call; no per-state storage is retained. No eval/new Function or runtime code-generation requirement.
- Numeric bounds compile into parallel typed arrays, retaining every existing range and integrality/finite check and error field name.
- Restore examines every cell but avoids redundant stores using Object.is, preserving signed-zero semantics. Separate tests cover replaced records/arrays, two live worlds, recycled ECS ownership and zero signs.
- Publication hashes the exact freshly captured canonical numeric array, avoiding a second flatten traversal. No cached state hash; direct fixture mutations remain visible. Sequence advancement still precedes snapshot capture, preserving fault cursor semantics.

Warmed controlled 100,000-call probes measured original flatten about **738–1178ms**, original unflatten **1634–2553ms**; final metadata/conditional-store variant flatten **594–640ms**, unflatten **469–571ms**. Those are diagnostic microbenchmarks, not acceptance claims. An intermediate accessor-only acceptance took **34.7412s**; another routing variant's **44.6569s** was rejected as sufficient performance evidence. An independent external Vitest workload was observed during investigation and left untouched. Final checks ran in a clear sequential window. After optimization the original worker configuration took **54.2709s wall**, but three unchanged 5s cases still timed out under peak load. Final config caps workers at **Math.min(8, availableParallelism())**; a full pass took **53.4110s**, and the final post-fixture/fleet-check/build pass took **54.7166s**. Both final budgets are met without changing timeouts, gameplay policy, tick counts or assertions. The latest focused integrity set passed **159/159** before the final full run.

## Couch HUD/restart smoke

`npx tsx scripts/determinism/ui-smoke.ts` starts the final application source in real Electron with a fresh profile, an offscreen painted hidden window and the normal Pixi renderer. Input is real keyboard events plus a deliberately labelled virtual standard gamepad. It joins two crew, starts, moves both, pauses/resumes, forces hull zero through a debugger fixture to exercise completion, confirms back to the lobby and starts the same seed again. Assertions: `couch-1` at tick **48** to `couch-2` at tick **42**, Skiff/two crew/full hull **100**, exactly one saved completion, **zero renderer exceptions**. `task-5-logs/ui-smoke.json` and `ui-smoke.log` preserve machine-readable evidence.

Visually inspected `ui-couch-running.png`, `ui-paused.png`, `ui-gameover.png`, and `ui-restarted.png`: couch crew cards, status/power panels, virtual-pad/keyboard prompts, PAUSED overlay, completion summary and fresh restarted HUD render correctly. Initial smoke failures were harness issues: renderer-domain commands awaited before initial navigation timed out; navigating first fixed it. Plain hidden windows retained stale compositor pixels, detected during visual inspection; offscreen painting produced fresh real HUD frames. These were not reported as passing screenshots. The final smoke has no product workaround.

Physical controllers and handheld hardware are **NOT RUN**; this virtual input is not hardware proof. Programmatic blur/focus was exercised; actual OS minimize/restore and suspend/resume are **NOT RUN** in this smoke. UI smoke is final source through Vite; production build is checked separately. Internet hosting, persistence storage/re-host orchestration, Cloudflare transport and Net-2 mouse/player layout remain outside this task.

## Handoff

Required final commands and evidence pass. Whole-branch review remains the controller's next step; do not advertise Net-1b complete or internet play based solely on this implementation report. Remaining limits: optional Firefox is not yet mandatory CI, Safari/JSC/ARM untested, physical controllers untested, and the existing in-memory replay parser/journal bounds documented by task 4 still apply.

## Review correction C-001 (round 1)

The full-suite, acceptance, build, real-engine and UI evidence above belongs to source **7567633**. It is historical evidence for that source, not a fresh full gate for this correction. The controller will run all gates after the whole-branch review/fix wave.

The optimized target path bypassed signed-zero normalization. Weapons and Science enemy targets with accepted `room: -0` consequently changed hash after JSON snapshot restore. Target kind, ID and room now use the same canonical numeric normalization as ordinary fields; snapshot validation and exact signed-zero restore behavior are unchanged. No version, expected vector, golden or timeout changes.

TDD evidence: the new parameterized regression failed for both Weapons and Science before the fix (**2 failed / 3 passed**, exit 1), including canonical positive-zero, equality to room `0`, and accepted JSON snapshot round-trip hash equality. After the fix, `npx vitest run tests/canonicalAccess.test.ts tests/snapshot.test.ts tests/snapshotV2.test.ts tests/golden.test.ts tests/determinismHarness.test.ts --reporter=dot --maxWorkers=2` passed **120/120 tests in five files, 8.56s**, exit 0. The existing signed-zero restore regression remains intact. `npm run typecheck` passed, exit 0. Logs: `task-5-logs/fix-round-1-red.log`, `fix-round-1-focused.log`, and `fix-round-1-typecheck.log`.

Validation for this latest fix is limited to those focused checks. Full suite, acceptance, build, browser and UI smoke were deliberately not repeated during this correction, as directed by the controller.
