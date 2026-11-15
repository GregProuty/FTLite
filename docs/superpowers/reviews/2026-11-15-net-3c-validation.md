# Net-3c validation (final review pending)

Branch: `codex/net-3`; isolated worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`. Base `39b5dc1`. All seven implementation tasks and their reviews are complete. Final whole-slice review remains pending. No deployment or internet-demo readiness is claimed.

## Completed task gates

| Task | Source commits | Evidence | Review |
|---|---|---|---|
|1: runtime and shared contracts|`1b45d33`, `e774e05`|50 service tests; 95 focused existing RTC/digest tests; root and service typechecks; local Wrangler dry-run. Real SQL rollback/persistence and accepted WebSocket survival through actual eviction/reconstruction.|Initial review found body deadline starvation and duplicate schema setup. Scoped re-review confirmed both fixed; no remaining findings.|
|2: Directory and HTTP auth|`d5f0ac6`|78 service tests across five files; service typecheck; local Wrangler dry-run, 43.06 KiB bundle. Concurrent room caps, code collision, retained/IP metadata bounds, creation acknowledgement loss, expiry fencing, token replacement, crypto-await races, socket retirement and body cancellation.|Independent spec/quality review approved, no findings.|

Installed service pins: Wrangler 4.156.0, Cloudflare Vitest plugin 1.4.11, Vitest 4.1.0, workers-types 5.20261029.1 and TypeScript 5.8.3. Root Vitest remains 3.2.7. Installed `evictDurableObject(...,{webSockets:'hibernate'})` proves actual reconstruction, rather than calling a constructor in a mock. Pinned workerd rejects `PRAGMA user_version`; one shared SQL singleton version row is used instead.

Body-consumption regressions reproduce immediately available empty and one-byte chunks starving timer callbacks. Absolute deadline checks, periodic yielding, bounded empty reads and cancellation now enforce limits. Expected domain failures cross internal RPC as typed results. Two deliberate SQL-corruption tests retain their expected runtime diagnostics; unexpected exceptions are not suppressed.

Controller decisions are reflected in the slice design: creation confirms Room state before Directory exposes its mapping, and lost acknowledgements preserve capacity conservatively. Start/rehost later use the documented epoch-bound admission protocol. Both RTC endpoints use the guest seat generation as their shared pair stamp.

## Remaining evidence

Task3 source `d6992d0` plus fix `3f89833` implements authenticated hibernating sockets and pair signalling: full service suite119/119 before review; focused44/44 after fixes, typecheck passes, pre-fix local dry-run66.72 KiB. Independent review found ready-after-closed on failed notification and forwarded-envelope expansion escaping correlation. Both were fixed and scoped re-review approved with no new findings. Regressions verify survivor never receives ready after cancellation, oversized forwarding returns a correlated error without touching recipient credits or closing it, and subsequent valid forwarding succeeds. Coverage also includes consumed-ticket persistence, per-event/outbound SQL authority, queue/ACK bounds, aggregate candidate limits, unequal generations, independent replacement and asynchronous hashing cancellation.

Task4 source `7d5e685` plus fixes `ba07dfa`/`811f3ee` implements server-side start/leases/checkpoints/rehost and terminal activation fencing. Full service154/154 before review, typecheck and local dry-run99.88 KiB passed. Review found delayed refusals discarding ambiguous tuples and missing final route readiness checks; round1 fixed both with34 focused tests. Scoped review found an overlapping duplicate acknowledgement could fence an already-started session; round2 fixed the transition guard with28 focused tests. Final scoped re-review approved, no findings remain. Tests interrupt reserve/commit/ack/fence steps, race retained rehosts at capacity, reject delayed old receipts, retain accounting retries across hibernation, preserve prior checkpoint bytes on failed writes, and retain exact original grants across overlapping retries.

Task5 source `a8fecc9` adds TURN brokerage, durable seat/daily quotas and provider validation. Full service213/213 before final OPEN-transport check; final focused57/57, typecheck and dry-run109.50 KiB pass. Independent review approved with no blocking findings; one minor test-only pending-header-abort warning remains to attribute precisely, without suppression. Runtime tests use synthetic credentials and fail-closed official interception (`msw2.14.7`, `@msw/cloudflare0.1.0`, service-only compatible pins). Workerd's unsupported redirect-error mode is replaced with manual/no-follow handling, verified by a zero-second-origin-call test. Live TURN was not called.

Task6 source `3d53f51` (report `5fe40e3`) plus fix `8957723` adds the generic client and compatibility-digest coverage. Initial focused root256/256 and workerd integration3/3 passed. Review found legitimate fenced-generation rosters were rejected and unresolved asynchronous socket factories escaped the operation cap. Fixes passed80 client/digest tests (49 client), four actual workerd integration tests and both typechecks; scoped re-review approved. Lost/ended generation advancement invalidates work without granting authority, and late socket factories stay counted until actual settlement.

Task7 source `5635798` and evidence `bafc5be` complete the actual local Worker-to-native-RTC/gameplay proof. Task review approved with no blocking findings. Three real pairs cover independent guest and host replacement; consumed-ticket replay and obsolete routes reject. Both native peers and service readiness precede committed start, which precedes utility creation/attachment. Actual game publication, validated ACK, owned command and exact authority equality share the service runId. Four fault probes (page, workerd, timeout, missing evidence) each exit1 and observe workerd/Electron exit plus temporary-directory removal.

## Fresh parent verification

Source `bafc5be`, 2026-11-15. Logs and JSON are in `.superpowers/sdd/2026-11-15-net-3c-signalling-service/final-validation/`. Build once, then run native launchers directly; no duplicated production builds.

| Gate | Result | Wall seconds |
|---|---|---:|
|Full root `npm test`|158 files,2231 tests passed|56.151|
|Full service `npm --prefix services/signalling test`|14 files,218 tests passed|21.376|
|Root typecheck|Passed|0.495|
|Service typecheck|Passed|1.762|
|Worker dry-run build|Passed; no deployment|1.725|
|Production app build|Passed|3.884|
|Existing host native gate|15 checks;8/8 utility exits; profile removed|4.256|
|Existing RTC native gate|17 checks;3/3 utility exits; profile removed|10.027|
|New local service/native gate|Three pairs; real gameplay; workerd/Electron exits and exact temp removal|4.241|

Final native JSON independently records order15/16 native readiness,17 service readiness,19 committed start,20 authority creation,21 attachment. The same-source four fault runs were reviewed from Task7 evidence and were not redundantly repeated. Gameplay serialization/admission is unchanged, so acceptance/engine gates were not repeated; the inherited acceptance timing limit below remains open.

Final review should triage the known MSW abort warning. Fresh audit also reports two moderate dev-tool findings in the service's initial Vitest4.1.0/@vitest/mocker pins; exact audit JSON is retained. [Redirect-mock advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) and [manual-mock advisory](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) concern exposed dev-server mock registration. Registry metadata identifies compatible patched4.1.12, published2026-10-15. No production mock endpoint is added by this service. A service-only patch update is authorized for the final combined fix if needed; root framework remains unchanged.

The utility-side lease gate, UI/reconnect orchestration and deployed internet proof remain outside this slice.

No cloud login, deployment, account changes, secret reads/copies or live TURN issuance occurred. WAN, forced relay and two physical computers remain untested. UI/reconnect and utility lease enforcement belong to later slices.

Inherited limitation: the prior acceptance run took 41.797 seconds against the unchanged 30-second target; a same-machine baseline took 41.519 seconds. Net-3c has not resolved that timing gap.
