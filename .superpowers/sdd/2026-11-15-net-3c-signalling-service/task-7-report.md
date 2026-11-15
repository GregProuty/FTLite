# Net-3c Task 7 — actual local Worker/native RTC gate

Implementation commit: **5635798**, based on **8957723**, `codex/net-3`, isolated worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`. Executed 2026-11-15 on Windows x64, Node 24.18.0, Electron 37.10.3 / Chromium 138.0.7204.251, workerd 1.20261023.1, Miniflare 5.20261023.3-beta, Wrangler 4.156.0. No product/gameplay protocol, SIM_VERSION 35, golden b87a0284, deterministic fixture, dependency or lockfile changed.

## Delivered composition and observed evidence

`npm run test:room-service-runtime` builds production Electron entries then starts the new local gate. `services/signalling/scripts/local-runtime.ts` bundles the shipping Worker, uses the installed Miniflare V4 option converter, starts real workerd bound to ephemeral 127.0.0.1, and allocates an exact temporary SQLite/runtime/profile directory. A scoped observation of Node's child spawn captures the actual workerd child and its exit event; it never substitutes process results. Miniflare's registry/telemetry and private Vite env-file discovery are disabled. Only the trusted test wrapper supplies synthetic platform IP/quota salt. No credentials, `.env` contents, live TURN, deployment or account operations were used.

The gate uses the production service client in Electron main with native fetch/WebSocket and epoch clock, actual HTTP/WebSocket endpoints, existing `startGuestTransport` controllers for both lobby endpoints, `startHostProcess` utility after committed start, the existing native observer, existing sector remote client and passive authority-frame observer. The only existing harness extension passes optional runId through its preload to the remote client; the old gate retains its default `rtc-runtime` ID.

The normal JSON evidence is `task-7-native.json` in this directory. Observed facts:

- Actual Room/Directory SQLite files exist. Actual `unsafeEvictDurableObject(..., {webSockets:'hibernate'})` occurs after both auth handshakes and before first signalling; actual sockets continue through all pairs.
- Initial host-own seat generation 2, guest-own generation 1, and both native pair identities use guest generation 1. Three pairs become native/service ready. Guest independently changes 1→2, then host changes 2→3, in the lobby. Both old native PCs close on each replacement before the new pair.
- `link-issued` synchronously registers and starts the existing controller before any later signal event. Readiness promises do not block signal IPC. One first native offer is held for 75 ms at the test signal boundary and then sent unchanged; actual native authentication succeeds. The gate does not generate SDP or ICE candidates.
- Replaying the consumed real socket ticket on another actual WebSocket closes **1008** without an authenticated response. A wire injection of an obsolete pair/connection signal gets actual Worker **invalid-state**. A guest-directed signal to the obsolete guest connection gets actual Worker **forbidden**; no cross-seat delivery occurs. These probes mutate only outbound requests after client validation, preserving normal request correlation; successful replies and RTC ACKs are never manufactured.
- Final pair evidence sequence: host native ready **15**, guest native ready **16**, first service-ready **17**, committed start **19**, authority-created **20**, attached **21**. The code calls `startHostProcess` only after the actual committed-start reply. No authority exists during lobby pairs.
- Actual guest receives **3 full receipts / 3 validated ACKs**, sends an owned player-1 resume command, gets its applied result, and matches one complete authority publication byte-for-JSON-value including watermarks/hash/tick/sequence. Service runId matches committed init, actual utility checkpoint init and guest publication. Selected real native candidates are direct, with empty ICE configuration and no provider call.
- Explicit backend renewal occurs immediately after commit; a five-second harness timer renews thereafter while needed. This is not the deferred utility request-start-plus-12-second gate.
- Native evidence: **6/6 PCs closed**, production native timers/listeners zero, **1/1 actual utility exit**, windows/relay ports/owner listeners zero. Parent launcher observes actual workerd and Electron exits and removes the exact invocation directory; the JSON admits success only after those observations.

## TDD and focused verification

`tests/roomServiceRuntimeGate.test.ts` exercises the real report-admission function with independently specified contract examples. The examples are not runtime proof and are never loaded by the native gate. They catch incomplete native/process cleanup, missing SQLite/hibernation, wrong guest-generation mapping, early service-ready/authority attachment and missing independent replacements.

| Exact command | Result |
| --- | --- |
| `npx vitest run tests/roomServiceRuntimeGate.test.ts` against initial no-op admission function | **RED: exit 1, 40 failed / 1 passed, 615 ms**; rejected-evidence cases failed because the function did not throw |
| Same command after fail-closed validator | **GREEN: exit 0, 41/41, 608 ms** |
| `npx vitest run tests/roomServiceRuntimeGate.test.ts tests/rtcRuntimeGate.test.ts` | **exit 0, 94/94, 2 files, 660 ms** |
| `npm run typecheck` | **exit 0, 2.538 s wall** |
| `npm --prefix services/signalling test` | **exit 0, 218/218, 14 files, 20.09 s Vitest**; actual workerd SQLite/hibernation suite |
| `npm run typecheck:signalling` | **exit 0, 1.983 s wall** |
| `npm run build:signalling` | **exit 0, 2.107 s wall**; Wrangler dry-run 109.50 KiB / gzip 22.76 KiB; Room/Directory bindings, no deployment |
| `npm run test:room-service-runtime -- --report-path=.superpowers/sdd/2026-11-15-net-3c-signalling-service/task-7-native.json` | **exit 0, 7.427 s wall including production build, 2.912 s launcher**; all evidence admitted |
| `git diff --check` and `node --check scripts/network/room-service-smoke.cjs` | **exit 0** |

Service suite diagnostics were not hidden: intentional `DROP TABLE room_meta` in `tests/directory.test.ts:125` and `DROP TABLE directory_rooms` in `tests/http.test.ts:70` emit expected missing-table diagnostics. One runtime warning says an async event handler's returned promise is ignored. All 218 tests still pass; this report does not claim warning-free output.

Initial integration failures were investigated and fixed before the final run: Miniflare 5 rejects the old top-level option shape, so the installed supported converter is used; Windows out-of-root `scriptPath` startup failed, while an identical in-memory module succeeded, so the generated bundle is passed by contents; Miniflare 5 uses `resourcePersistencePath` for isolated storage; the actual old-route error is `invalid-state`; `from === to` is malformed instead of a routable wrong-seat probe, so the probe targets the obsolete distinct guest connection. The first full/ACK failed until optional runId was propagated through the existing preload as well as the page. Root typecheck initially failed TS6307 until the scoped local-runtime script was added to the existing root scripts project's include. These were harness composition issues, not service/gameplay changes or relaxed requirements.

## Required fault runs and owned cleanup

These final probes use the same executable source as commit 5635798. Each command's actual exit is checked independently of cleanup evidence. Logs are under `task-7-logs/`.

| Exact command | Exit / wall | Actual cleanup evidence |
| --- | --- | --- |
| `npx tsx scripts/network/room-service-smoke.ts --inject-page-failure` | **1 / 4.232 s**; actual page exception | utility exits 1/1, windows 0, ports 0; workerdExit=true, electronExit=true, temporaryRemoved=true |
| `npx tsx scripts/network/room-service-smoke.ts --inject-worker-failure` | **1 / 3.458 s**; actual owned workerd killed after auth/hibernation, service unavailable | utilities 0/0 (authority never created), windows 0, ports 0; workerdExit=true, electronExit=true, temporaryRemoved=true |
| `npx tsx scripts/network/room-service-smoke.ts --inject-timeout` | **1 / 7.111 s**; fixed native gate timeout | utility exits 1/1, windows 0, ports 0; workerdExit=true, electronExit=true, temporaryRemoved=true |
| `npx tsx scripts/network/room-service-smoke.ts --inject-missing-evidence` | **1 / 4.247 s**; parent rejects missing gameplay evidence | utility exits 1/1, windows 0, ports 0; workerdExit=true, electronExit=true, temporaryRemoved=true |

Logs: `normal.log`, `page-failure.log`, `worker-failure.log`, `timeout.log`, `missing-evidence.log`. PowerShell log capture adds its stderr/RemoteException framing for deliberately failing commands; the CLI exit and native cleanup lines above are unchanged. The workerd kill is against the captured owned child only. The Electron fallback uses only the captured PID/tree. Recursive removal verifies the resolved path is inside the system temp directory with the gate's unique prefix. No generic/global process kill occurs.

## API handoff and completion boundary

After **one** fresh root production build, the parent can run the exact launcher without another build:

```powershell
npx tsx scripts/network/room-service-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3c-signalling-service/task-7-native.json
```

Production handoff remains `createRoomServiceClient({baseUrl, fetch, createWebSocket, clock, allowInsecureLocalhost})`. Subscribe before connect/link request; pre-acquire appropriate ICE for deployed composition (this gate explicitly uses `[]`), synchronously dispatch `{...link, iceServers}` in `link-issued`, forward original signals, and send link-ready only from actual native authentication readiness. Explicit disposal/replacement closes the caller's native transport as well as the service client. Close native attempts on matching closed link, host changes/departure, terminal errors, and lost/ended rosters. Only the guest generation enters both native identities; own seat generation remains service authority. Create/init/attach the actual authority after committed start and use the service-generated runId. This gate supplies no automatic reconnect/rehost/storage/UI orchestration.

Self-review checked sequencing, bounded retained observations, exact native-resource assertions, fail-closed parent admission, no generated successful service response/ACK, redacted signal handling, actual process exits and cleanup on every tested failure. Private bundle env discovery is disabled; no root dependencies changed. The README documents commands, quotas, expiry, SQL/DO migration setup, server-only variable names, deployment prerequisites and explicit NOT RUN boundaries. The ignored `services/signalling/.dev.vars.example` contains names/comments only and is deliberately not committed; existing `.dev.vars.*` ignore rule remains unchanged.

The parent owns final root suite/existing host+RTC/service regression runs, validation-document updates and independent whole-slice review. No claim is made that those parent gates have already completed. No duplicate acceptance or engine run was performed: gameplay serialization/admission did not change, and the inherited 30-second acceptance timing limitation is preserved. Live TURN/provider, WAN, forced relay, two physical computers, deployment/account/secret actions, UI/token persistence, automatic reconnect/rehost, live mirrors and the utility lease gate remain NOT RUN or deferred to 3d/3e. No subagents/reviewers were spawned.
