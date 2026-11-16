# Net-3a final whole-branch review

Reviewed base `3047027` through head `6d93ea3bd87b51a8f302022c41e8d142b9997e11` on 2026-11-14. This is the sole broad final review of the recovery preflight plus Net-3a foundation, using the supplied 16-commit review package, binding Internet Sessions design, implementation plan, ledger rulings, and retained verification evidence.

## Strengths

- Admission and execution remain separate. Original remote envelopes reach duplicate comparison and the persisted result cache unchanged; only the simulator execution copy receives the effective tick. Strict couch/bot admission remains the default. Replay v3 records policy, effective admission tick, and explicit watchdog effects and uses the existing executor; v2 rejects v3-only metadata (`authority/ledger.ts:36`, `authority/core.ts:214`, `authority/core.ts:290`, `authority/replay.ts:30`).
- Receive-time terminal capacity rejection advances the correct player's watermark without replenishing the gameplay budget. The original cached semantic result stays metadata-free, while each response reports the current expected sequence. The tests cover ordinary N ahead of Resume N+1, pending capacity, duplicate/conflicting retries, and restored cache validation (`authority/ledger.ts:29`, `authority/ledger.ts:66`, `tests/remoteAdmission.test.ts:45`).
- Outboxes retain detached immutable envelopes and distinguish unsent work from in-flight work. Allocation checks include commands staged in the same controller batch and preserve a control slot. Gap repair and resync-required state do not rewrite IDs. The cross-task optimistic-vote fix waits for a matching execution result and a covering completed publication; admission-only paused publications cannot prematurely retire a vote (`clientControl/commandOutbox.ts:15`, `clientControl/cardController.ts:154`, `clientControl/clientRun.ts:32`).
- Recovery cleanup preserves the completed outer replay frame before journaled detach, and public checkpoint/attach faults use the same fault unwind as pump. Error-phase checkpoints cannot be sealed or restored; the last-good crash checkpoint remains available (`authority/core.ts:79`, `authority/core.ts:113`, `authority/core.ts:325`, `authority/checkpoint.ts:38`).
- Generic runtime/control code carries bounded opaque mode bytes. Sector validation stays in the adapter; a materially different test mode exercises the generic contract. Identity and generation checks precede mode allocation/peer attachment. Reliable port bytes remain charged until exact ACKs, and latest packets have bounded in-flight/replacement slots (`src/network/hostRuntime.ts:5`, `src/network/modes/sector.ts:42`, `src/network/portLink.ts:34`, `src/shared/netSession.ts:35`).
- Main owns the utility, hidden transport, request promises, ports, and suspend registration. Ready requires the actual utility/transport handshake; IPC checks both owned webContents and main frame. The pre-spawn termination fix retains kill intent independently of owner unsubscription and has actual native evidence (`src/main/network/hostProcess.ts:42`, `src/main/network/transportWindow.ts:10`, `src/main/network/transportWindow.ts:36`).
- The lasting native gate uses a sandboxed visible producer and production process owners, proves utility progress during an actual 500 ms renderer stall, checks authoritative watchdog/command effects, and separately observes native exit. Its negative probes fail rather than accepting an exit without required evidence (`scripts/network/host-smoke.cjs:199`, `scripts/network/host-smoke.cjs:217`, `scripts/network/host-smoke.ts:67`).

The shortened `authority/*` and `clientControl/*` references above are under `src/renderer/src/`.

## Issues

### Critical

None found.

### Important

None found.

### Minor

None found. No parked/deferred findings were carried into this review.

## Verification and performance limitation

I reviewed the package in logical passes: recovery/admission/replay; controller/outbox; generic modes/ports; native owner/entries/packaging; harness/tests/docs. Supplementary source reads stayed on those cross-task risks. I did not alter source, tests, index, HEAD, or branch state, and did not dispatch agents.

Independent read-only check: `git diff --check 3047027..6d93ea3` passed. Existing full gates were not rerun: the parent coordinated them on this exact source, and inspection raised no concrete unresolved defect requiring another executable probe.

Inspected retained evidence:

- Full suite: 1,877 tests / 146 files passed, 57.68 s Vitest / 58.523 s wall; typecheck exit 0.
- Production build plus actual Electron 37.10.3 native gate: 15 checks, 8/8 observed utility exits, zero surviving windows/owner listeners, isolated profile removed. The recorded visible stall was 500.3 ms; utility ticks advanced 4 -> 24 -> 29 while blocked; the original tick-4 vote executed at tick 34. Prior task evidence also covers actual Vite development entry loading.
- Page exception, child failure, timeout, and missing-evidence probes produce the expected failures. These are failure-sensitivity checks, not passing gameplay runs.
- Node, actual Electron Chromium, and actual Firefox agree on the existing 1,800 canonical samples / 404 result-event boundaries. Durations were 24.04 s, 23.21 s, and 24.56 s. This is existing deterministic fixture coverage; v3-specific admission/watchdog cases are covered by the focused unit/integration tests.
- Default acceptance: all nine complete rows exactly equal baseline; 37.6866 s wall at head. The original preflight measurement was 29.2584 s. The parent reran the unchanged preflight source `03e7954` in an isolated comparison checkout under current conditions: 39.0599 s, again with all nine rows identical.

**The unchanged 30-second acceptance review ceiling is unmet.** Current paired measurements do not demonstrate a Net-3a-induced regression; they do not prove the ceiling passes or establish a performance improvement. I inspected the added strict-path watchdog scan/clock reads and ledger closures, but have no concrete evidence attributing the timing discrepancy to them. Do not describe every gate as green or raise the ceiling.

The parent explicitly ruled that foundation correctness/readiness may be approved with this recorded limitation and no speculative optimization of an unchanged baseline. That ruling is outside a claim that the performance gate passed.

Evidence is under this plan workspace's `final-validation/` and `task-5-logs/`; task reports distinguish original native development proof, final lasting gate, and mocked tests.

## Recommendations

Preserve the final validation record, timing ruling, and this review when closing the SDD workspace. The force-added tracked `task-4-report.md` also needs deliberate preservation/removal during that cleanup; it should not disappear accidentally with ignored scratch material. Complete the plan's final bookkeeping without changing the reviewed executable source or historical timing figures.

## Declined to judge

- Shipping WebRTC channels, loss/jitter behavior, fragmentation, state deltas, baseline acknowledgements, and interpolation: Net-3b deliverables, not implemented or claimed by this foundation.
- Cloudflare Worker/DO construction, room authentication, tokens, quotas, TURN issuance, and deployment: Net-3c and later deliverables; no service or account action belongs to this review.
- Host/Join UI, assigned-seat controls, production focus-loss wiring, reconnection, and bot/human takeover: Net-3d integration. This review checks the underlying admission/outbox/port contracts, not a shipping online UI.
- Mirrored saves, service leases, stale-host fencing after suspension, and manual re-host orchestration: explicitly Net-3e. Trusted local suspend pause is not proof of the future independent lease gate.
- A shipping Helm/duel adapter and Helm gameplay: excluded by the plan. The second mode is a contract test only.
- Actual OS sleep/resume, physical controllers, fresh ordinary couch visual inspection, Safari/JSC, ARM, and non-Windows platforms: not exercised by this slice's retained evidence; no claims of those outcomes are made.
- Installed Windows distribution/ASAR behavior: production output and actual built/development entry paths were exercised, but no installer/distribution run was supplied or required by this plan.
- Two physical computers on different networks, forced TURN, and internet-demo readiness: require later implemented transport/service and hardware proof. Local processes cannot establish them.

## Assessment

**Spec compliance: approved for recovery preflight + Net-3a foundation.**

**Code quality: approved.**

**Ready to merge? Yes, for this foundation scope with the explicitly accepted performance limitation above.**

No new source defect requires a fix wave. The implementation and evidence support independent utility authority, bounded mode/port ownership, receive-time input and replay correctness, while preserving the existing strict path. This verdict does not certify the unmet acceptance-time ceiling, unrun platform checks, or later internet-session slices.
