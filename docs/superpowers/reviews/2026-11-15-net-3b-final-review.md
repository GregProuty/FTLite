# Net-3b final whole-branch review

Reviewed 2026-11-15 in `C:/Users/djuar/.codex/worktrees/56fc/FTLite`: approved Net-3a predecessor `fc08a99` through `2a5802e`, using the supplied `review-fc08a99..2a5802e.diff`. Requirements: the Net-3b design and implementation plan, with the parent Internet Sessions design's presentation and completion boundaries. This is the single whole-Net-3b review, following the six task reviews.

## Strengths

- Transport, state algorithms and mode conversion have clear boundaries. Hidden renderers forward bounded generic envelopes; sector schema, snapshot validation and notification semantics stay at the utility/client edges. Detached publication sinks preserve the local 65,536-byte codec ceiling while permitting larger network images.
- The acknowledgement contract survives the complete path: MessagePort storage ACKs release local storage, exact full-received receipts retire ordinary reliable-full capacity, and validated-state ACKs alone select baselines and enable production. Newer delta ACKs cannot retire an older queued full. Results reconcile producers early while presentation waits for the authority's publication-sequence floor, including same-tick controls.
- Framing and retention account for bytes and record counts. Fragment layout is checked before assembly allocation; reliable queues, latest slots, streams, assemblies, state histories, notifications, attempts and pending IPC operations have explicit bounds. Caller data and baselines are detached, and async native work checks cancellation before subsequent effects.
- Authentication requires mirrored session identity and matching tickets on mutually acknowledged reliable-channel hellos. Native channel policy is checked, signalling is bounded, deadline conversion respects process clock origins, and public diagnostics avoid SDP/candidates/tickets/addresses. Main validates the owning WebContents and main frame, reuses the host transport window, and gives guests no utility authority.
- The native gate uses actual Chromium constructors/channels and the production utility/port/stream/client path. Its passive observer cannot manufacture state or ACKs. Revised pause/disconnect assertions begin with active interpolation; the covering-publication hold checks absence before release and records actual dequeue floors. Cleanup observes closed native resources and utility/process exits rather than inferring them from disposal promises.

## Issues

### Critical

None found.

### Important

1. **Advancing-tick generation changes do not immediately snap presentation.** `src/network/state/timeline.ts:24` and `:29`; mode impact at `src/network/modes/sectorStream.ts:138`.

   The reset predicate notices point identity/generation changes only when the incoming sample has the same tick as the previous sample. During ordinary 20 Hz delivery, the 100 ms delayed cursor can therefore continue selecting two older samples after a new teleport, seat, target or life generation is known. The generation comparison inside `sample()` only helps once the cursor reaches the interval containing that transition. Confirmed gameplay is correct, but presentation keeps showing the prior location/generation during a transition that the spec requires to snap.

   A read-only `npx tsx -e` probe pushed ticks `0,3,6,9` at their normal 60 Hz authority times with generation `before` and x equal to tick, then tick `12` at 200 ms with generation `after-teleport` and x=1000. `sample(200)` returned `{x:6,generation:'before'}`; `sample(250)` still returned `{x:9,generation:'before'}`; only `sample(251)` returned x=1000/new generation. This is normal sample density, not a loss or clock-jump case.

   Detect generation/identity discontinuities independently of tick equality and invalidate the affected presentation history immediately (a bounded whole-timeline reset is also consistent with the stated contract). Preserve stale-tick rejection and normal interpolation. Add a dense 20 Hz history regression with a transition at a later tick, asserting the arrival-time sample and subsequent samples cannot return the old generation. Cover the sector adapter's generation fields as well. `tests/presentationTimeline.test.ts:12` currently spaces samples 12 ticks apart, putting the delayed cursor inside the transition interval and hiding this defect; sector transition tests use only tick 0.

### Minor

2. **Some required native report details remain existence-only checks.** `scripts/network/rtc-smoke-report.ts:9`, `:25`; `tests/rtcRuntimeGate.test.ts:7`.

   Using the exact successful parent report, a read-only probe replaced `early-cleanup`, `first-full-ack`, `wrong-ticket`, `stale-generation`, `cancel-attempt` and `mid-transfer-close` details with `null` and deleted `native-resource-cleanup.hostPcsClosed`; validation still succeeded. This does not invalidate the current native run: the child makes meaningful assertions before emitting these records, and the retained report contains the evidence. It does weaken the promised defense against a later harness accidentally omitting evidence. Validate meaningful per-check fields/nonempty status records and require the native closed-PC count; add omission/null/false tests. This confirms the deferred Task 6 minor, with the now-strengthened disconnect checks excluded from the old finding.

3. **Sector discontinuity coverage still has nondiscriminating branches.** `tests/sectorStream.test.ts:228`.

   The test publishes a sector transition and a pause but asserts only that later sampling leaves the confirmed snapshot unchanged. Removing the sector epoch from the adapter would not fail that assertion; life and ended transitions are not exercised here. The actual native gate now supplies strong pause coverage, so that portion of the earlier Task 4 concern is resolved. Retain discriminating sector/life/ended tests using a populated interpolation history and distinct expected coordinates/generations. This is nonblocking coverage work beyond the required regression for issue 1 and can be included in the same fix wave.

The deferred Task 5 Vite warning is resolved by `emptyOutDir:false`; no further action is needed for it.

## Evidence and review method

Read the supplied diff in production, integration and native-proof passes; inspected focused test assertions and the ledger/task reports without treating their conclusions as proof. Followed concrete cross-task risks into the existing PortLink, authority frame lifecycle, snapshot validation and parent presentation requirements. No subagents, source/index/HEAD changes or successful-suite reruns. The two focused read-only probes above are the only new executions; this report is the only reviewer-created file.

Inspected retained raw logs/JSON in `.superpowers/sdd/2026-11-14-net-3b-transport-streaming/final-validation/` and the final Task 6 focused log:

- `ac05e51`: 2,111 tests/156 files pass, 56.47 s Vitest and 57.309 s wall; typecheck/build pass; existing host gate 15 checks and 8/8 observed utility exits. Production code is unchanged by the final harness-only commit.
- `2a5802e`: 44 updated harness tests pass; typecheck passes; parent RTC package command passes all 17 checks in 13.186 s including build, 8.686 s launcher. Exact report records six live processes, 500.3 ms visible stall with authority ticks 10→29→35, original tick-9 vote applied at 40, 122 smaller deltas, 65 suppressed validated ACKs/one receiver resync, matching pause checkpoint and held notification floor 374, six closed host PCs, 3/3 utility exits and zero retained native/owner resources. Actual page/child/timeout/missing-evidence negatives are recorded in the task report/logs; missing-evidence was rerun after the stronger assertions.
- Acceptance: all nine complete rows exactly match the committed baseline and retained prior source. Current 41.614 s versus prior-source 41.519 s does not establish a material new regression; both exceed the unchanged 30 s target. This is an open performance gate, not a passing timing result.
- Node, actual Chromium and Firefox match 1,800 canonical samples/404 result-event boundaries. This is canonical serialization/determinism evidence, not cross-browser RTC interoperability evidence.

## Recommendations

Use one combined fix wave for issue 1 and the two small deferred coverage improvements, then a scoped review of that wave. Keep the existing source-scoped broad results and run only verification warranted by the production timeline change and final controller gates. Preserve the explicit acceptance timing limitation and the distinction between actual native execution and deliberately injected network faults.

## Declined to judge

- Production Cloudflare signalling, session ticket issuance/consumption across attempts, service authentication and TURN credentials: explicitly assigned to Net-3c; this slice's trusted injected provider is not a deployment or production-service claim.
- WAN performance/loss, forced relay, multiple physical computers/networks and the parent design's broader RTT/jitter matrix: no such environment was exercised; local native RTC with labelled drops/reordering/ACK suppression proves the bounded local path only.
- Shipping room/join/reconnect UI, automatic retry, rejoin/re-host orchestration, online rendering consumption, mirrors and leases: deferred Net-3 slices; the presentation API itself was reviewed and its discontinuity defect is issue 1.
- Actual OS suspend/resume, Safari/JSC, ARM and other operating systems: unavailable here; trusted suspend-hook and Windows x64 evidence do not establish those platform behaviors.
- Arbitrary externally edited small position changes that are indistinguishable from legal movement: current canonical state has no dedicated teleport counter; the adapter's documented inference limitation is not evidence about a missing current gameplay transition. Known identity/generation transitions remain in scope and must satisfy issue 1.
- Re-reviewing all untouched Net-3a implementation and ordinary couch visual behavior: predecessor already approved and outside this slice's broad review; touched compatibility paths and relevant dependencies were inspected, with strict/couch regression evidence retained.
- Achieving the inherited 30-second acceptance performance target: measured and explicitly reported as unmet; no timing-waiver or optimization claim is made by this review. Controller owns the previously recorded completion ruling.

## Assessment

**Ready to merge: With fixes.**

The architecture, acknowledgement separation, validation boundary and native lifecycle evidence are strong, with no new security, authority-state or bounded-transport blocker found. Fix the advancing-tick presentation discontinuity before accepting Net-3b; the two minor evidence/test improvements can share that fix wave. Approval remains limited to this local transport/streaming slice and does not establish internet-demo readiness or a passing acceptance timing gate.
