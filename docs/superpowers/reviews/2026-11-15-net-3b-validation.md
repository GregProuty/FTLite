# Net-3b validation

Status: implementation and review complete, with the inherited acceptance timing limitation below. Final source `ba52aa1`, Windows x64, 2026-11-15; branch `codex/net-3`, slice base `fc08a99`. All six task reviews, the [whole-branch review](2026-11-15-net-3b-final-review.md), its combined fix and [scoped re-review](2026-11-15-net-3b-final-rereview.md) are complete with no remaining findings. Owner master and its concurrent Helm work remain untouched.

## Delivered boundary

Native authenticated Chromium RTC links now connect the independent utility authority to the real remote sector client. Generic transport/stream algorithms remain outside gameplay schemas. State streams at ordinary 20Hz, with reliable immediate control/full updates, bounded delta baselines and exact retirement receipts. Remote input starts after validated state acknowledgement; result/event presentation waits for the covering publication. A separate 100 ms timeline interpolates crew positions without changing confirmed gameplay. Host reuses its hidden window; guest transport owns no authority.

The injected local broker is test infrastructure. Cloudflare signalling/ticket issuance, TURN integration, room/join UI, rejoin/re-host orchestration and leases remain later Net-3 slices. This is not internet-demo readiness.

## Verification

| Check | Source / result |
|---|---|
| Full suite | ba52aa1: 2,137 tests / 156 files pass; 55.53s Vitest, 56.364s wall |
| Typecheck | ba52aa1: pass, 0.808s wall |
| Production build | Pass in both native package commands |
| Existing host gate | ba52aa1: 15 checks, 8/8 observed utility exits; 12.824s including build |
| Final RTC package | ba52aa1: 17 checks, 3/3 observed utility exits; 13.179s including build, 8.659s launcher |
| Final fix focused tests | ba52aa1: 95/95 pass, including timeline, adapter and report admission |
| RTC negative probes | Page failure, child failure, timeout and missing evidence all exit 1 and remove isolated profiles; missing-evidence rerun covers strengthened assertions |
| Default acceptance | All 9 complete rows exactly equal committed historical baseline; 41.797s |
| Prior-source acceptance | Retained `03e7954` on the same machine: 41.519s; same 9 rows |
| Node 24.18.0 | 1800 canonical samples/404 result-event boundaries exact; 26.057s |
| Electron 37.10.3 / Chromium 138 | Same fixture exact; 25.152s |
| Firefox 160 | Same fixture exact; 36.184s |

The unchanged 30-second acceptance target remains unmet. Current and prior-source measurements are effectively equal; this comparison does not establish a material new regression. No timing ceiling, expected row, fixture, gameplay floor or simulation version was changed. SIM_VERSION 35, golden b87a0284, protocol 2, snapshot/checkpoint 2, strict replay 2 and receive-time replay 3 remain intact.

## What the native gate proves

Six distinct live processes comprise one utility, three hidden transports and two visible guests. The first full is accepted and acknowledged before input becomes available. In the final-source native run, a 500.4 ms visible stall leaves authority ticks advancing 10 -> 29 -> 35 and held movement neutralized; a vote originally requested at tick 9 executes at 40. The gate compares 32 scheduled complete publications plus recovery/pause/isolation states, and independently compares a paused utility checkpoint.

It observes 121 smaller deltas on every-third-tick cadence. Maximum observed native-framed image/input packets are 5949/297 bytes within unchanged caps. Native latest sends deliberately drop one frame and reverse a pair. Suppressing 65 validated ACKs forces the real bounded receiver to evict its baseline, request one resync and recover through reliable full delivery. These are labelled harness injections, not measured WAN loss.

Pause begins with measured interpolation lag and requires every displayed crew coordinate to equal the matched authority checkpoint. A second control at the same paused tick 366 publishes sequence 371. The harness holds that original state after native/PortLink receipt; actual result0:4/event3 remain absent for five polls, then dequeue at confirmed sequence 371/tick 366 after release, satisfying the independently decoded wire floor 371. Running disconnect begins with measured lag and freezes at exact last confirmed coordinates at immediate/+25/+100/+1000ms samples and a later real-time observation.

Two-peer ownership/isolation, survivor continuity, wrong ticket, stale generation, cancellation and mid-fragment closure run through actual Chromium connections. Successful close acknowledgements are followed by observed closed PCs/channels and zero production native listeners/timers, actual utility exits, destroyed windows, released IPC/relay resources, child exit 0 and exact private-profile removal. A dispose promise alone is insufficient. The two early utility children also exercise real pre-spawn kill=false and retry-on-spawn cleanup.

## Decisions and costs

1. Continue the already approved architecture and subagent execution in the existing isolated branch without repeating product/method approval. Cost if wrong: isolated implementation rework.
2. Keep authority in the utility, use generic Chromium transport, and inject a local test broker without cloud credentials. Cost: local RTC proves no WAN/demo readiness.
3. Intercept detached publication objects before the unchanged 65 KiB local encoder; make client acceptance explicit and production dependent on successful validated ACK. Cost: narrow trusted API extensions and streamed-only validation work.
4. Separate port-storage ACK, exact full-received retirement and validated-state ACK. Cost: additional control message and RTT-limited oversized-full throughput.
5. Reuse one host hidden window; create guest transport without authority; establish listeners/readiness before attachment. Cost: owner interface extension and required caller sequencing.
6. Keep ticket deadlines local to each process: transfer epoch expiry and convert once to a local monotonic deadline capped 30s. Cost: wall-clock dependence only at that bounded conversion boundary.
7. Use publication-sequence notification floors, including same-tick controls; retain original replay/cache payloads. Cost: trusted notification callback and bounded presentation queues.
8. Permit trusted all/relay ICE policy for later forced-relay testing; default all. Cost: an unused trusted test-selection surface until service integration.
9. Share transport ordinals across state and opaque packets, independently of image and command IDs; expose successful-ACK callback for activation. Cost: composition must use the shared allocator and explicit callback contract.
10. Preserve codec-valid large notifications with reliable opaque state-budget packets carrying sector-notification, bounded original bytes plus fixed version/floor overhead. Cost: larger but bounded reliable notification traffic; kind/stream define semantics.
11. Use caller-owned guest-subscription?both-attempts-ready?streamed-attach composition rather than another helper. Cost: callers must retain the documented sequence and clean up both halves of failed pairing.
12. Report the unresolved 30s timing target explicitly; retain the prior benchmark checkout and dependency junction. Cost: performance target remains open, and that checkout still occupies disk. Earlier automatic approval review blocked its cleanup; no alternate deletion was attempted.

## Evidence and remaining limits

Current logs, exact native JSON, task reports and review packages are under .superpowers/sdd/2026-11-14-net-3b-transport-streaming/. Cross-engine output was copied into this plan and previous historical output restored byte-for-byte. The acceptance comparison reads a committed historical baseline, not regenerated expectations.

Internet/WAN, forced TURN, two physical computers, actual OS suspension, Safari/JSC, ARM, other operating systems and shipping online UI are NOT RUN. Native loss0 denotes unavailable measurement. Streamed snapshot conversion deliberately validates at both mode and client boundaries; ordinary couch ticks gained no duplicate whole-state traversal. Presentation detects current gameplay discontinuities from canonical identity/transition fields; an arbitrary external small positional edit indistinguishable from normal movement cannot be inferred as teleport.

## Final review disposition

The whole-branch review found an advancing-tick presentation discontinuity bug and two evidence/test gaps. The single combined fix `ba52aa1` addresses all three; scoped re-review approves every finding with no new issue. Dense 20 Hz history now snaps immediately on point identity/generation changes while preserving stale-tick rejection. Sector/life/ended mutation probes demonstrate the new assertions fail when reset behavior is removed. Report admission rejects null/empty records and requires native closed-PC evidence.

The controller accepts each explicitly declined review boundary:

- Cloudflare signalling, service authentication, cross-attempt ticket issuance/consumption and TURN credentials remain Net-3c. Cost: the trusted injected provider is not a production service.
- WAN conditions, forced relay, physical machines/networks and the broader RTT/jitter matrix were not exercised. Cost: local RTC recovery evidence cannot establish those environments.
- Shipping join/reconnect UI, retries, rejoin/re-host orchestration, online renderer consumption, mirrors and leases remain later slices. Cost: this branch alone is not the online demo.
- Actual OS suspend/resume, Safari/JSC, ARM and other operating systems are unrun. Cost: Windows x64 and an injected suspend hook are the available evidence only.
- Arbitrary external small position edits without a canonical teleport marker retain the documented inference limitation. Cost: such edits may interpolate; known gameplay identity/generation transitions must snap and are included in the fix.
- Untouched previously approved Net-3a internals and ordinary couch visuals are not re-reviewed wholesale. Cost: review relies on predecessor approval and current compatibility/regression checks for those paths.
- The 30-second acceptance target remains unmet. Cost: a performance task remains open; current/prior-source timings are reported without a waiver or all-gates-green claim.

The branch/worktree is retained for the subsequent Net-3 service slice; no merge or push is performed by this continuation. Cost: current master does not yet include Net-3 work. Evidence remains available until integration is complete.


Final source evidence: `final-validation/final-*` logs/JSON for suite, acceptance, engines, host runtime and typecheck; `final-fix-logs/native.log` and `native-report.json` for the actual RTC run on `ba52aa1`. Earlier source-specific runs remain historical. The ordinary native failure flags were exercised before the final fix; the relevant missing-evidence failure was rerun against the final report validator.
