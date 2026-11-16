# Task 7 ? bounded HTTPS/TURN setup

Implementation: `ca8060496b1b8499d469d977c07a56be12cfa947` on `codex/net-3`, based on `7a1b7c1eced42a7262106ef42a954d109f23ef6c`. Implementer verification PASS; controller review pending. All work used the isolated `56fc/FTLite` worktree. `progress.md` is controller-owned and remains unstaged.

## Delivered interfaces and behavior

- `OnlineConfig` now includes `allowInsecureLocalhost:boolean` and `iceMode:'loopback'|'turn'`. The pure `resolveOnlineConfig({packaged,localServiceUrl?,serviceUrl?,packagedServiceOrigin?})` remains disabled by default, rejects multiple sources, enforces HTTP loopback for the existing local setting and HTTPS for the internet setting, and rejects userinfo/path/query/fragment (including paths/backslashes erased by URL normalization). No environment file is read. Main explicitly supplies `FTLITE_LOCAL_SERVICE_URL` / development `FTLITE_SERVICE_URL`; release builds may supply the nonsecret `FTLITE_PACKAGED_SERVICE_ORIGIN`, embedded only through the main build define. No origin was configured for a real service during this task. Main session revalidation preserves and cross-checks the resolved mode and localhost permission.
- Shared `RoomConnectionIdentity` has exactly room, host generation, seat, seat generation and connection ID, with a mode-independent strict validator. `RoomServiceClient.connectionIdentity()` returns a newly constructed validated authenticated identity, or null before authentication and after connection loss/close. No peer label supplies the credential identity.
- `createOnlineIce({service,clock,mode})` implements `get(owner,signal)`, `invalidate()` and `dispose()`. The loopback branch returns empty servers with finite validity and never calls the provider. TURN has one current owner, one cached batch and one underlying in-flight request. Three host routes coalesce into one authenticated service request. Returned batches are copies. Cache refresh occurs at remaining validity <=300000ms; expired/near-expiry provider results are rejected. Ownership changes and invalidation reject old waiters and prevent old results becoming cached. Individual cancellation does not cancel another route's shared acquisition; the existing service request deadline/connection cleanup bounds the underlying request.
- The monotonic one-minute issuance gate charges failed requests and survives invalidation, including a retryAfter arriving after invalidation. Retryable acquisition errors carry the larger of the minute remainder and service retryAfter. No quota increased. Recovering sessions preserve this typed failure into the unchanged 1/2/4/8-second, 30-second retry owner, so a quota pause cannot extend its budget. Per-seat cooldown prevents synchronous reconciliation from spinning on quota failures.
- `OnlinePeersDeps` now requires `ice` and `iceOwner`; it accepts injected clock/scheduler for the original deadline. Link issuance synchronously reserves one current slot per seat and both ports, starts the original setup timer, and holds bounded incoming signals. It validates route identity, one remote description, SDP64KiB, 64 pre-description ICE /128 total candidates, and 1MiB aggregate serialized buffered signal envelopes (not only raw strings). Signals drain serially only after native start registration. Unknown stale attempts are explicitly closed; overflow retires the slot/ports. Owner and validity are rechecked immediately before native setup. Native ticket validity is capped to the original remaining setup budget. Closing/recreating routes obtains current authorized ICE; retiring gameplay invalidates its cache.
- Production sets `iceTransportPolicy:'all'`. Relay-only is exercised solely by the native test driver, not player menus or renderer IPC. Public status/action strictness rejects ICE servers, credentials, usernames, SDP, candidates, origins, policies and connection IDs.

## RED ? GREEN evidence

Initial required command:

`npx vitest run tests/onlineIce.test.ts tests/onlineConfig.test.ts tests/onlinePeers.test.ts tests/rtcPeer.test.ts tests/onlineSessionContract.test.ts tests/roomServiceClient.test.ts`

RED: six assertions failed (five config expectations and the missing authenticated identity accessor), plus the not-yet-created ICE module prevented its new suite loading; 180 existing tests passed. This is recorded as a missing-module RED, not an assertion-only ICE RED. After the module existed, its expiry-boundary test exposed a fixture that returned a fixed old expiration; the fake provider was corrected to issue a fresh expiration relative to its clock.

`npx vitest run tests/onlinePeers.test.ts` then observed nine failures: native setup occurred before credentials, no pending acquisition existed, bounds did not retire overflow, and stale unknown signals were silently ignored. The corresponding buffer/owner/deadline implementation brought these tests GREEN.

`npx vitest run tests/onlineCoordinator.test.ts -t "retains HTTPS"` observed `online-disabled` instead of successful HTTPS join. Revalidation and service-owned ICE wiring brought it GREEN.

Self-review regression `npx vitest run tests/onlineIce.test.ts tests/onlinePeers.test.ts` observed a late provider retryAfter being lost after invalidation (new request resolved at60000ms instead of waiting until90000ms). Moving cooldown accounting ahead of stale-result rejection fixed it. The buffer tests independently assert exact accepted counts: overflow at candidate65 before description, candidate129 total, and escaped-envelope43 at the1MiB bound.

Self-review `npx vitest run tests/onlineConfig.test.ts` observed two failures for `/api/..` and a trailing backslash. Raw-origin validation before URL normalization fixed both.

Final GREEN command at implementation source:

`npx vitest run tests/onlineIce.test.ts tests/onlineConfig.test.ts tests/onlinePeers.test.ts tests/rtcPeer.test.ts tests/onlineSessionContract.test.ts tests/roomServiceClient.test.ts tests/onlineCoordinator.test.ts tests/onlineRecovery.test.ts tests/onlineRetry.test.ts`

**276 tests /9 files PASS**: ICE8, config26, peers16, RTC58, public contract48, service client60, coordinator34, recovery22, retry4. This includes real owner cache coalescing across the host's three routes, stale result exclusion from startAttempt, cancellation, provider retryAfter/expiry, HTTPS session behavior, public redaction, copied native configuration and existing recovery/retry regressions. Supplementary redaction/native copy tests exercised already-established strict behavior and passed when introduced; they are not claimed as newly failing production regressions.

`npm run typecheck`, `npm run typecheck:signalling`, `npm run build`: all PASS after final source edits. `git diff --check`: PASS. Typechecks/build were repeated only after new source corrections.

`npm --prefix services/signalling test -- tests/turn.test.ts tests/redaction.test.ts tests/clientIntegration.test.ts`: **65 tests /3 files PASS**,18.86s. Provider requests were intercepted by the existing mock Worker suite. Workerd printed its existing async event-handler return-value warning; no test failed. No Worker deployment or live provider call occurred.

## Native evidence at ca80604

Final reports and screenshots: [task-7-evidence](task-7-evidence/).

`npx tsx scripts/network/rtc-config-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-7-evidence/native-config.json`

**PASS641ms**. Real Electron37.10.3 production transport controller/preload/hidden renderer constructs two Chromium answerers, one `all`, one `relay`. Native `getConfiguration()` confirms one server with two supported UDP/TLS URLs and copied synthetic credentials. The only destinations are synthetic loopback port9 URLs. Neither answerer receives SDP, creates an offer, or gathers ICE. Both PCs close, the hidden window closes, child exit is observed, and its exact isolated profile is removed. This is configuration wiring proof, **not an actual relay route**. The launcher uses the shared absolute deadline/owned-process/directory cleanup helpers; no production relay switch is added.

`npx tsx scripts/network/online-recovery-smoke.ts --scenario=skiff --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-7-evidence/recovery-skiff.json`

**PASS20537ms** under the unchanged90000ms launcher budget, using the actual app and local workerd with no provider configuration. Exact paused recovery, manual re-host, new committed state, renderer/utility interactions and existing cleanup gate passed. Reported owned cleanup: utility1/1 exits, native windows4/4 exits, observed native peer1/1 closes; live windows/ports/listeners/peers all0. Runtime helper exited0 and the report satisfies the strict Task6 validator including process/temp cleanup. Historical Leave failure did not recur. No wait/threshold was relaxed. One affected standard scenario was rerun; all six/full acceptance/engines are reserved for Task8.

The final recovery report records45 artifact hashes; native config records24. All69 comparisons against current files matched after the final native runs. Both report revision `ca8060496b1b8499d469d977c07a56be12cfa947`; their dirty flag is true because controller `progress.md` remains modified. The final recovery report was independently revalidated with `validateOnlineRecoveryReport` via `npx tsx -e`: PASS. The current source/build hashes match the retained report evidence. An earlier native pass before the last two self-review fixes is retained as `task-7-native-config.json` / `task-7-recovery-skiff.json` but is superseded by the final source-pinned evidence. The first recovery invocation wrote screenshot names shared with Task6; these were copied into the Task7 directory and the original tracked Task6 screenshots were restored byte-for-byte before the final run used its own directory.

## Review notes and limits

Self-review covered source/config precedence, all owner fields, stale/late/cancel paths, retained cooldown, pending-port retirement, start-before-signal ordering, setup/native deadlines, serialized signal bounds, strict visible boundaries, and exact staging. No known functional defect remains from this task; controller review is still required. Only the main-owned cache and ephemeral native configuration hold credentials. Existing service authentication/provider URL filtering/quotas remain authoritative and unchanged. No long-lived secrets, root.env, cloud/account/deployment/upgrade, owner checkout, merge or push was touched.

No HTTPS network endpoint, live TURN route, WAN, two physical machines or actual OS sleep was tested. No internet-readiness claim is made. Protocol2, SIM35, checkpoint2 and existing replay compatibility remain unchanged. Broader final gates belong to Task8.
