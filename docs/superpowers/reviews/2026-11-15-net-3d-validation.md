# Net-3d validation (in progress)

Approved plan: `../plans/2026-11-15-net-3d-online-sector.md`. Isolated branch `codex/net-3`, source base `695996c`. No deployment or internet readiness is claimed.

| Task | Source | Verification | Review |
|---|---|---|---|
|1: private contract/store/config|`b898ef4`, `c52ea64`|155 focused tests before review;103 covering tests after fix; root typecheck passes. Actual Windows atomic replacement and serialized writes/removals tested. Serializer and failed exclusive-temp creation regressions covered.|Task review found unchecked enumerable array fields; fix rejects extra fields and holes in actions/roster arrays. Scoped re-review approved with no new findings.|
|2: sector handoff|`2e55a1e`|136 focused tests/11files and root typecheck pass. Human/bot/human, stale close, unavailable pending command, held cleanup, sparse seats, real memory restoration and crash cleanup covered.|Spec compliant, quality approved. Minor deferred: explicit replacement of one seat in a multi-seat human binding would strengthen whole-binding retirement coverage.|
|3: stream ACK/neutralization|`36526be`|120 focused tests and root typecheck pass; real authority pre-ACK input rejection without ID consumption, synchronous ACK callbacks, reliable neutralization and exact120/121tick age checks.|Spec compliant, quality approved; no findings.|
|4: coordinator/reconnect|`37ef32a`, `a96b9c5`|115 focused/affected tests before review;31 covering tests after fix; root typecheck passes. Commit deduplication, original-token retry, late factory bounds, Forget/Leave races, renewal/loss handling and native attempt notifications covered.|Review reproduced lost roster reconciliation during pending issuance; fix coalesces latest-roster passes and isolates per-seat failures without a tight loop. Scoped re-review approved.|
|5: Electron IPC|`993cefb`|130 focused/adjacent tests, both typechecks and ordinary piped build pass. Sender/port ownership, revisioned initial status, cleanup and actual preload transfer tested; both sandbox preloads require only Electron.|Spec compliant, quality approved; no findings. Actual application native proof remains pending.|
|6: visible application|`a900937`|210 focused/adjacent tests, root typecheck and build pass. Real stream/authority tests cover seat2 ownership, ACK, focus neutralization and detached freeze; crew-layer tests verify presentation coordinates without confirmed-state writes. Couch/HUD/input regressions pass.|Independent task review pending.|
|7: actual app proof|Pending|Pending|Pending|

Execution reports and chronological rulings: `.superpowers/sdd/2026-11-15-net-3d-online-sector/`. Final full regression/build/native/acceptance/engine gates remain pending. Existing acceptance timing gap (41.797s against30s, same-machine baseline41.519s) is inherited and must not be silently relaxed.

Playable online remains development-only/loopback until3e supplies independent utility lease fencing. Checkpoint mirrors, rehost, deployment/live TURN/forced relay and two physical computers are outside this slice.

Build compatibility: installed electron-vite5 isolated-entry reporter calls terminal cursor methods on piped stdout. A narrow build-only helper supplies missing non-TTY cursor no-ops without suppressing diagnostics/errors. Isolated preload builds avoid relative requires under sandbox; native app proof still pending. No dependency pins changed.
