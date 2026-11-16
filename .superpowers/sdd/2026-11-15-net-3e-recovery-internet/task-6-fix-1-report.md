# Task 6 fix round 1

BASE `379ce1c1e3cbbb7afe47c12b418f562a67703a2b`. All three Important findings in [the complete review](task-6-review.md) are addressed. Local recovery evidence passes the corrected gate; scoped controller re-review is pending. No product lease, recovery coordinator, protocol, serialization, UI behavior or timeout threshold changed in this round.

Source commit `689c8354ff0841aff6ba8f65e5c3bcec1509de33` contains the three corrections and was used by all three native reruns. `5d08cf1` adds one validator-only rejection and its regression for contradictory cleanup on a forced restart. The native scenario, instrumentation and cleanup code is unchanged by that final commit. The evidence commit contains this report and retained output only; `progress.md` remains controller-owned and unstaged.

## R1: semantic report proof and resource accounting

The validator now ties restore payload hash to the committed receipt, restore/baseline run IDs to the run, committed generation to the old host, paused baseline tick/phase/hash and both watermark arrays to the restored input. It validates capacity, seat, initial/periodic ticks and old-host seat-generation advancement. Underlying post-Resume observations must contain positive ACK/input orders, every input after ACK, the first input matching the recorded minimum, and the correct logical seat for both applications.

Upload reports require the actual newer pending checkpoint, a different payload hash, the same run and the committed restored tick. Stale reports require the suspend-hook result and zero observer decoding errors. Each graceful process cleanup must have nonnegative counters, zero live resources, equal created/exited counts, balanced native peer accounting and exact unique utility PIDs. Aggregate counters are recomputed against these validated process records. Forced-restart processes cannot carry a contradictory graceful cleanup record; their separate exact utility exit evidence remains required.

The fixture now supplies actual restore identity, paused watermarks, ordered ACK/input observations, scenario facts and complete process cleanup. The reviewer's eight mutations plus aggregate-counter contradiction and input-before-ACK were observed RED: **10 failed / 32 passed** at 17:57:18. The R1 correction passed **42 tests** at 17:57:51. A final forced-restart contradiction was RED **1 failed / 44 passed** at 18:08:21 before its narrow validator correction. Retained raw output: `task-6-fix-r1-red.log`, `task-6-fix-r1-green.log`, `task-6-fix-r1-forced-red.log`.

## R2: exact gate deadline provenance

The passive compiled-source transform now observes the existing `pending.started` immediately after assignment and the existing accepted `deadline` before clearing the pending request. It records the acceptance sample's monotonic/epoch times and the service expiry, allowing the report validator to check exactly `min(started + 12000, acceptedMono + serviceExpiry - acceptedEpoch)`. The outgoing parent-port wrapper no longer samples or reconstructs the permission deadline. Permission checks continue to use their independently observed actual pre-check times. The late-reply lookup uses the exact recorded request start.

Every original gate calculation, decision and return remains unchanged. The exact single-anchor requirements still fail closed if a source anchor disappears or duplicates. Tests execute the actual built gate with a 500 ms nonce delay and a further 1000 ms outgoing-observation delay, compare original and instrumented acceptance/permission results, and exercise both the 12-second local cap and an earlier service expiry. These tests were RED **3 failed** at 17:58:55, then the instrumentation/report run was GREEN **47 tests** at 17:59:31. Raw output: `task-6-fix-r2-red.log`, `task-6-fix-r2-green.log`.

The historical root `recovery-stale.json` is retained unchanged and is now correctly **REJECTED** because it lacks exact gate deadline provenance. It is superseded by [fix-1/recovery-stale.json](fix-1/recovery-stale.json), not relabelled as a corrected historical pass. The other five historical normal reports pass the stricter final validator using their already-recorded evidence.

## R3: one absolute work/cleanup deadline

Each driver request is capped by both its original five-second limit and the shared absolute deadline's remaining reserve. The work watchdog's abort signal cancels outstanding work requests, including multiple simultaneous requests. Late replies are discarded after request retirement. Cleanup starts all owned application tasks and runtime disposal concurrently. Resource/shutdown observation cannot consume the final eight seconds; exact app termination leaves 2.5 seconds for removal. Runtime disposal accepts the same deadline, caps graceful observation, uses the existing owned-process terminator with a reserved tail, and bounds exact workerd-PID checks. Exact temporary removal still uses the original common deadline and existing helper. No normal 90-second budget or assertion was increased.

The focused multiple-unresponsive-request test verifies aborting both work requests, stopping both cleanup observations at the common reserve, preserving time for exact termination/runtime exit/removal and releasing its timers. Its initial RED was the missing new bounded-request helper; the implementation then passed. The real native probe below additionally exercises the integrated launcher and owned-process path, rather than treating the helper test as sufficient lifecycle proof. Raw output: `task-6-fix-r3-red.log`, `task-6-fix-r3-green.log`.

## Final focused and native verification

`npx vitest run tests/onlineRecoveryReport.test.ts tests/onlineRecoveryInstrumentation.test.ts tests/onlineAppRuntime.test.ts tests/onlineAppDiagnostics.test.ts tests/onlineAppClick.test.ts`

Final result: **59 tests / 5 files PASS**, 4.36 s at 18:08:23. This includes 45 report tests, 3 compiled instrumentation tests, 3 runtime/deadline tests (including actual unresolved startup and observer-build helpers), 6 fixed-diagnostic tests and 2 native-click tests. Log: `task-6-fix-focused-final.log`. Root `npm run typecheck` passed both before the native reruns and after the final validator-only change. The earlier focused run at `689c835` passed 58 tests. No unrelated full suite, service suite, build, acceptance or engines were rerun; the production artifacts remain byte-identical to the original Task 6 build.

Commands from the named worktree, reusing that build:

```powershell
npx tsx scripts/network/online-recovery-smoke.ts --scenario=stale --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/fix-1/recovery-stale.json
npx tsx scripts/network/online-recovery-smoke.ts --inject-unresponsive-cleanup --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/fix-1/recovery-unresponsive-cleanup.json
npx tsx scripts/network/online-app-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/fix-1/online-app.json
npx tsx .superpowers/sdd/2026-11-15-net-3e-recovery-internet/fix-1/audit.ts
```

| Native check | Actual exit | Elapsed / budget | Result |
|---|---:|---|---|
| Stale live authority, actual service expiry/claim/late reply | 0 | 42525 / 90000 ms | PASS |
| Two live applications ignoring all later driver commands | 1 | 13226 / 20000 ms | Expected failure, exact cleanup PASS |
| Existing actual-app gate, both layouts and original cancellation/rejoin checks | 0 | 49381 / 90000 ms | PASS |

The fault probe deliberately uses a **reduced** 20-second absolute budget with the same ten-second cleanup reserve. It arms both actual applications after gameplay starts, captures their owned utility PIDs, makes their test driver stop answering, then issues two blocked status requests near the work cutoff. Both cleanup requests remain unresponsive. Exact forced app exits (code 1), the captured utility PID exit, runtime-helper exit 0, workerd exit and temporary removal were all observed. Its fixed failure includes stage `unresponsive-cleanup` and `DRIVER_TIMEOUT`; no arbitrary exception is exposed. There are no final graceful resource snapshots for these unresponsive apps: their resources are retired through the observed process-tree termination, not claimed as individually observed graceful close events.

The stale main was blocked **25008.0815 ms**. Its exact last accepted gate request began at **5445.6391 ms**, acceptance sampled **5459.9681 ms** / epoch **1794794612322**, service expiry **1794794627310**, and accepted deadline **17445.6391 ms**. Last allowed tick/control/ingress checks were **17434.0157 / 17434.0143 / 17410.3575 ms**. All post-deadline allowed counters are zero; observer errors zero; one delayed real grant rejected. Canonical tick 1008 and watermarks remain fenced across blocked Resume/late reply. All allocated normal app/utility/native resources, helper/workerd exits and exact temporary removal passed.

Both stale utilities record these exact SHA-256 values, recomputed by the audit:

| Artifact | SHA-256 |
|---|---|
| Original production authority | `cba01267184195ee28bb1eaecde2318192242617ff26e33f88c461755dc5acf5` |
| Passively instrumented authority | `b1e482a3891dadd33a906277c901c709c9de51ebdce841157f99dad26f9d7981` |
| Transform | `2aaa51ae207d6db3a6301ab0709bf9e306bbac99ac341f152823f71bdef2be63` |

[The final audit](fix-1/audit.json) validates five historical normal scenarios plus the replacement stale pass, checks current built artifact hashes, validates the existing-app rerun, rejects the historical stale and retained failed reports, rechecks all six original fault cleanups and the new unresponsive probe, and found **82 distinct observed PIDs, zero live candidates**. It checks the native-tested validator hash against its recorded Git revision because `5d08cf1` subsequently tightened only that validator. The original audit remains historical; use `fix-1/audit.ts` for the current gate.

## Limits and remaining review

The earlier Leave failures remain unconfirmed and retained. This round does not diagnose them or the historical cancellation flake. The review's Minor baseline stderr finding is recorded: expected-fixture service missing-table/ignored-promise output and optional-art/native stderr remain in the original logs; their passing counts are not represented as clean stderr. No unrelated fixture change was made.

This is local recovery proof only. Actual OS sleep, live deployment/HTTPS, WAN, TURN/forced relay and two physical computers/different networks remain **NOT RUN**. There were no credentials, external messages, cloud changes, upgrades, merge/push, owner-checkout edits or unrelated temporary cleanup. Controller scoped re-review is the remaining task gate.
