# Net-3d Online Sector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (preserved execution method) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Host/Join, assigned-seat gameplay and guest reconnect work in two actual local Electron app instances while preserving couch play.

**Architecture:** Main owns service authentication, private seat persistence and all native/process lifetimes. Hidden Chromium transports connect before service commit; a utility authority starts afterward. A separate visible online session uses the existing streamed replica/outbox, per-player HUD and draw-only presentation timeline; the sector adapter owns disconnect bots.

**Tech Stack:** Existing TypeScript/Electron37.10.3/Pixi8.19.0, root Vitest3.2.7, pinned local Cloudflare runtime/service tooling. No new UI/network dependencies planned.

**Spec:** `docs/superpowers/specs/2026-11-15-net-3d-online-sector-design.md`; parent `docs/superpowers/specs/2026-11-14-net-3-internet-sessions-design.md`. Read both. Builder check: `docs/superpowers/reviews/2026-11-15-net-3d-builder-check.md`.

## Global Constraints

- Work in existing isolated `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`; owner checkout has unrelated work. Source baseline7598a47, evidence49bcf2a.
- Protocol2, SIM_VERSION35, checkpoint2, replay2/3; no gameplay re-bless or acceptance threshold changes.
- Development-only, loopback `FTLITE_LOCAL_SERVICE_URL`; packaged online disabled until3e. No deployed endpoint, secrets/.env reads, cloud changes or live TURN.
- One active session, one saved seat, one lifecycle operation, one current RTC attempt per guest; owner epochs fence all awaited work. At most4 players; input60Hz, remote ordinary publications20Hz, presentation delay100ms.
- Retry1/2/4/8s, capped8, total30s monotonic window; service retryAfter respected without extending window. Host service renewal5s is local lifecycle management, not the deferred independent utility lease gate.
- Main-only token storage,8KiB file cap; no token/SDP/candidate/address/raw exception diagnostics. Never expose arbitrary IPC/network commands.
- Full state ACK before human input at both endpoints; reliable neutral-only held frames retain original sequence/run/tick validation. No prediction or SimState presentation writes.
- Every task gets focused red/green tests, relevant typecheck, source commit and independent review before its consumer task. Review fixes stay with implementer. One final whole-slice review, one combined final fix, one scoped re-review; retain reports/evidence.

## Review Focus

1. Leave/Forget while token persistence or native startup is pending must not recreate a session or file: Tasks1/4/5 races.
2. A stale close from a previous guest must not remove its replacement or install a competing bot: Tasks2/4 generation tests.
3. A peer sends input before ACK or after an old held packet follows focus neutralization: Task3 authority-side proof, Task7 native proof.
4. Capacity4 with only seats0/2 occupied must retain logical IDs, bots and Cutter compatibility: Tasks4/6/7 sparse roster cases.
5. Repeated menu entry, failed start and renderer/process crashes must release every listener/window/port and preserve couch behavior: Tasks5/6/7 lifecycle proof.

## File and dependency map

- `shared/onlineSession.ts`: safe IPC/status/port contract and validators; `main/network/seatStore.ts`: versioned main-only persistence; `main/network/onlineConfig.ts`: loopback development policy.
- `network/modes/sectorProducers.ts`: sector bot/human lifecycle, integrated by `sector.ts`. Existing generic runtime remains mode-agnostic.
- `network/state/sender.ts`, `network/modes/sectorStream.ts`, `clientControl/clientRun.ts`: ACK readiness and reliable neutralization.
- `main/network/onlineSession.ts`: platform-injected coordinator; `onlinePeers.ts`: bounded attempt ownership; `onlineRetry.ts`: cancellation/backoff; `onlineSector.ts`: compiled sector compatibility/init. Keep these narrow instead of one large controller.
- `main/network/onlineIpc.ts`, `onlinePlatform.ts`: exact sender checks and Electron resource adapters; existing main/preload bootstrap registers them.
- `renderer/src/app/onlineSession.ts`, `app/sessionRouter.ts`, `input/onlineInput.ts`, `render/sessionMenu.ts`: visible session/input/menu. Existing renderer/crewSprites accept optional presentation positions.
- `scripts/network/online-app-smoke.*`: two-process actual application gate using existing local runtime launcher helpers.

Paths above are under `src/` unless stated otherwise. Sequence: Task1→2→3→4→5→6→7. No parallel mutations to shared interface files.

### Task1: safe session contracts, configuration and saved seat

**Files:** create `src/shared/onlineSession.ts`, `src/main/network/seatStore.ts`, `src/main/network/onlineConfig.ts`; tests `tests/onlineSessionContract.test.ts`, `tests/seatStore.test.ts`, `tests/onlineConfig.test.ts`; update `build/contentDigest.ts`, `tests/contentDigest.test.ts`.

**Interfaces:**
- `OnlineAction` discriminated union: `{type:'host';capacity:number}`, `{type:'join';code:string}`, `{type:'ready';ready:boolean}`, `{type:'remove-seat';seatId:number}`, `{type:'view-state';epoch:number;phase:'synced'|'running'|'paused'|'ended'}`, and zero-payload reconnect/start/retry/leave/forget-seat actions. `validateOnlineAction(value:unknown): value is OnlineAction` rejects unknown keys, bad ranges and oversized strings.
- `OnlineStatus`: phase from spec, role `'host'|'guest'|null`, ownSeat `number|null`, safe `RoomSnapshot|null`, `attachmentEpoch:number`, fixed `error:string|null` constrained to exported closed union, `retryAtMs:number|null`, `persistent:boolean`, `actions: readonly OnlineAction['type'][]`. No credentials or arbitrary text. `validateOnlineStatus` and detached copies mandatory.
- `OnlinePortDescriptor`: `{epoch,runId,hostGeneration,seatId,compatibility}`; epoch positive safe integer; room identity shape reused. `OnlineResult = {ok:true}|{ok:false;code:OnlineErrorCode}`.
- `SavedSeatV1`: `{version:1,serviceOrigin,roomId,joinCode,compatibility,seatId,seatGeneration,seatToken}`. `createSeatStore(directory:string)` returns async `load():Promise<SavedSeatV1|null>`, `save(record):Promise<void>`, `clear():Promise<void>`. Fixed error codes; file implementation injected through an optional structural test seam.
- `resolveOnlineConfig({packaged:boolean,localServiceUrl?:string}): {enabled:false}|{enabled:true;baseUrl:string;allowInsecureLocalhost:true}`. Reuse URL policy; no .env loading. Include new compatibility-sensitive shared contract in digest manifest.

- [ ] **Write failing contract/store tests.** Assert unknown fields/token-bearing status reject, capacity0/5 reject, upper bound code input32chars before normalization, invalid epochs reject;8KiB+1/corrupt/version2 store rejects safely. Race save(A), clear(), save(B) in queue order; failed rename preserves A; no token appears in surfaced errors.
- [ ] **Run red:** `npx vitest run tests/onlineSessionContract.test.ts tests/seatStore.test.ts tests/onlineConfig.test.ts`; expect missing implementation failures.
- [ ] **Implement interfaces.** Unique same-directory temp+rename and serialized mutations; exact loopback-only development gate. Record platform file-error behavior without dumping contents. Status storage warning is distinct from failed join.
- [ ] **Run green plus root typecheck and digest tests.** Assert packaged mode ignores online URL and rejects nonloopback/credentials/query/path. No new dependency.
- [ ] **Commit** only task files: `feat(net): define private online session boundary and seat store`.

### Task2: sector bot/human producer handoff

**Files:** create `src/network/modes/sectorProducers.ts`; modify `src/network/modes/sector.ts`; tests `tests/sectorProducers.test.ts`, existing `tests/checkpointBots.test.ts` and mode/runtime tests as needed. Do not put bot logic in generic hostRuntime.

**Interfaces:** `createSectorProducers({authority,runId,playerCount,contentDigest,resolveLayout,restoredControllers?})` returns `attachHuman(link:Link,players:readonly number[],options:AttachOptions):Unsubscribe`, `beforeControls():void`, `beforeTick(tick:number):void`, `controllers():readonly CardUiState[]`, `dispose():void`. `authority` is existing Authority; options supplied by sector stream. Construct manager after authority creation but before start; hooks close over initialized manager. Initialize default controller memory before initial baseline capture. Queue human ownership changes; old detach closures are identity-checked. Existing sector ModeHost surface stays unchanged.

- [ ] **Write failing tests** using real authority/loopback and fake clock: empty seats have exactly one bot, attached humans suppress only owned bot, pending command disconnect settles unavailable, held input clears, old close cannot retire new owner, paused pump processes handoff without a simulation tick, bot IDs follow latest watermarks. Check human→bot→human and sparse seats0/2 in count4. Restore actual bot cursor/repeat memory with high-water reconciliation and compare resumed trace.
- [ ] **Run red:** `npx vitest run tests/sectorProducers.test.ts tests/checkpointBots.test.ts`.
- [ ] **Implement manager/hooks.** Drain bot publications before decisions and before admission, detach before reattach only outside journal frames. Use existing bot policy/client and strict loopback; no raw SimState reads by generic transport. Capture live controllers for regular and crash checkpoints. Dispose pending human links and bots on replacement/failure. Restore detached paused state before producers bind.
- [ ] **Run green**, mode/host runtime tests and `npm run typecheck`; confirm fake second mode unchanged and offline headless checkpoint tests still pass.
- [ ] **Commit:** `feat(net): hand sector seats between humans and bots at boundaries`.

### Task3: enforce stream synchronization and focus neutralization

**Files:** modify `src/network/state/sender.ts`, `src/network/modes/sectorStream.ts`, `src/renderer/src/clientControl/clientRun.ts`; tests `tests/stateStream.test.ts`, `tests/sectorStream.test.ts`, create `tests/onlineNeutralization.test.ts`.

**Interfaces:** StateSender adds `acknowledgedSequence():number`,0 until validated acknowledgement of a retained actually sent image. Sector binding gates all input until a valid full-image acknowledgement for this binding; track full-sent identity rather than treating transport receipt as ACK. ClientRun and SectorRemoteClient expose `neutralize(player:number):void`, producing fresh neutral held sequence via reliable channel. Existing ClientActions/send remain compatible; stream channel validation permits reliable held only for `{moveX:0,moveY:0,interactHeld:false}`.

- [ ] **Write failing tests:** pre-ACK input does not reach authority or consume command high-water; full-received/unsent ACK do not unlock; actual full ACK unlocks; replacement resets readiness. Reliable nonneutral held rejects; owned neutralization succeeds while ordinary production is suspended, unowned player emits nothing, older delayed held cannot revive movement, later focused held can. Capacity/invalid-image tests remain effective.
- [ ] **Run red:** `npx vitest run tests/stateStream.test.ts tests/sectorStream.test.ts tests/onlineNeutralization.test.ts`.
- [ ] **Implement bounded readiness and neutral path.** ACK processing precedes later reliable input; no pre-ACK queue. Preserve paused/current-run/age/sequence semantics and no gameplay command allocation. Client refuses neutralization before valid publication or after dispose.
- [ ] **Run green**, existing outbox/receive-time tests and root typecheck. Confirm local strict loopback unchanged.
- [ ] **Commit:** `fix(net): gate streamed input on sync and neutralize reliably`.

### Task4: main session coordinator and bounded reconnect

**Files:** create `src/main/network/onlineSession.ts`, `onlinePeers.ts`, `onlineRetry.ts`, `onlineSector.ts`; modify `src/main/network/rtcTransport.ts` for attempt-loss subscription; tests `tests/onlineCoordinator.test.ts`, `tests/onlinePeers.test.ts`, `tests/onlineRetry.test.ts`, `tests/onlineSector.test.ts` plus existing RTC controller tests/mocks. Consume Task1/2/3, existing service client/hostProcess/rtcTransport.

**Interfaces:**
- `createOnlineSession(deps:OnlineSessionDeps): OnlineSessionOwner`; owner has `dispatch(action:OnlineAction):Promise<OnlineResult>`, `status():OnlineStatus`, `subscribe(cb):Unsubscribe`, `suspend():Promise<void>`, `dispose():Promise<void>`. Status listeners bounded64. `view-state` is display-only and checks current attachment epoch.
- Deps: config, seatStore, service factory returning `ReturnType<typeof createRoomServiceClient>`, platform, monotonic/epoch clock, scheduler, random128bit nonce factory. Platform has `createTransport(identity):Promise<OwnedOnlineTransport>`, `startHost(identity,signal):Promise<HostProcessHandle>`, `channel():{port1:MessagePortMain;port2:MessagePortMain}`, `publishPort(descriptor,port):void`, and `onVisibleGone(cb):Unsubscribe`. `OwnedOnlineTransport` contains `controller:TransportController`, `onExit(cb):Unsubscribe`, `dispose():Promise<void>`. Extend TransportController with `onAttemptClosed(cb:(attemptId:string)=>void):Unsubscribe`, emitted once for ready or pending attempts on failure/close; coordinator ignores intentional retirement using its identity map. Native implementation arrives Task5; tests structural. Coordinator must own/close offered ports until successful transfer.
- `sectorCompatibility(capacity:number):RoomCompatibility`, `sectorJoinCompatibilities():readonly RoomCompatibility[]` (Skiff,Cutter), `sectorInit(snapshot:RoomSnapshot):RunInit`; `validateCommittedSectorStart(snapshot,committed):Promise<RunInit>`. Baseline DEFAULT_SEED/characters/unlocks specified in design; no renderer arbitrary payload.
- `createOnlineRetry(clock,scheduler)` exposes `run(attempt:(signal:AbortSignal)=>Promise<void>,onWait:(retryAtMs:number)=>void):Promise<void>`, `cancel():void`; deadline includes in-flight operations. Explicit Retry creates a fresh30s budget.

- [ ] **Write failing coordinator tests** for host/join/ready/start ordering, saved-token-before-lobby, storage warning, two-layout probing only on incompatible, sparse capacity4 count/layout, removal/reuse and frozen roster. Assert0utilities before service commit, exactly1 after duplicated event/reply, disposed stale utility after Leave, one active attempt/seat and sync registration before incoming signal.
- [ ] **Write retry/loss tests**: fake time delays1/2/4/8/cap8 with total30s; terminal errors don't retry, RetryAfter beyond deadline stops; join with original token only, fresh generation/outbox, host stays alive on guest loss, own service/renewal/utility/transport loss stops host. Old attempt callbacks cannot close newer peer. Reconnect active host never silently creates replacement authority. Connection attempt cancellation while factory resolves closes returned resource.
- [ ] **Run red:** `npx vitest run tests/onlineCoordinator.test.ts tests/onlinePeers.test.ts tests/onlineRetry.test.ts tests/onlineSector.test.ts`.
- [ ] **Implement owner modules.** Standalone transport before commitment; host utility after commitment; keep host-local port and guest streamed ports separate. Bound lifecycle operations, signal operations and issued requests; readiness change is explicit last-value coalescing. Renew every5s with one nonce; local-stop on invalid/lost grant. Leave retains seat, Forget cancels then deletes; no token copy to status. Track and terminate every resource, including late promises, with idempotent asynchronous disposal.
- [ ] **Run green and typecheck.** Check runtime seam signatures against Task5 consumer before committing; update plan interfaces if exact Electron structural types require a narrow adapter, never let test mocks define a different lifecycle.
- [ ] **Commit:** `feat(net): coordinate local online rooms and guest reconnect`.

### Task5: application main/preload wiring and IPC ownership

**Files:** create `src/main/network/onlinePlatform.ts`, `onlineIpc.ts`; modify `src/main/index.ts`, `src/preload/index.ts`, `electron.vite.config.ts` only as needed; tests `tests/onlineIpc.test.ts`, `tests/onlinePlatform.test.ts`. No arbitrary new main entrypoint for gameplay.

**Interfaces:** `registerOnlineIpc(win:BrowserWindow,owner:OnlineSessionOwner):Unsubscribe`; `createOnlinePlatform(win):OnlineSessionDeps['platform']`. Named preload `window.ftlite.online` methods map to Task1 actions and return OnlineResult; `onStatus(cb)`, `onPort(cb)` return unsubscribe. Expose lifecycle listeners as unsubscribable too. Main-to-renderer port descriptor validated before forwarding into main world with exact window/source marker; stale transfers close.

- [ ] **Write failing tests**: every operation from unknown window/subframe/hidden transport rejected; duplicate/stale descriptor closes port; spoofed page event cannot become a privileged operation; main never sends token or full service session; visible destroy cleans handlers and owner once. Repeated registration/removal and suspend/resume listener counts return to baseline.
- [ ] **Run red:** `npx vitest run tests/onlineIpc.test.ts tests/onlinePlatform.test.ts`.
- [ ] **Implement adapters/bootstrap.** Resolve userData at runtime, inject native fetch/WebSocket and monotonic clock; verify versioned bounded response/status at IPC boundary. Build OwnedOnlineTransport using `createHostPlatform().createTransport(identity)` and its ready/exit subscriptions, retaining exit observation after load; the existing `startGuestTransport()` result alone does not expose post-ready window death. Register once per visible window; remove powerMonitor listeners on destruction. Online suspend stops session; resume only updates UI. Packaged/nonconfigured mode keeps couch usable and online unavailable.
- [ ] **Run green**, both typechecks and root build. Verify compiled entry includes production modules, sandbox/contextIsolation remains intact, no raw ipcRenderer/fs exposed.
- [ ] **Commit:** `feat(net): wire online sessions through trusted Electron IPC`.

### Task6: visible Host/Join menu, online input and presentation

**Files:** create `src/renderer/src/app/onlineSession.ts`, `app/sessionRouter.ts`, `input/onlineInput.ts`, `render/sessionMenu.ts`; modify `src/renderer/src/main.ts`, `render/renderer.ts`, `render/crewSprites.ts`, existing session dependency type only if needed; tests `tests/onlineRenderer.test.ts`, `tests/onlineInput.test.ts`, `tests/sessionRouter.test.ts`, `tests/sessionMenu.test.ts`. Retain existing `app/session.ts` and couch tests.

**Interfaces:** `createOnlineRendererSession(deps)` returns `attach(descriptor,port):void`, `setStatus(status):void`, `setFocused(boolean):void`, `frame():void`, `dispose():void`. Deps reuse renderer/HUD/audio/layout resolver, sampleDevices, monotonic clock/scheduler and typed main API. `createOnlineInput()` exposes `sample(sources:readonly SourceSample[]):InputFrame`, `reset():void`; use primary keyboard or first active controller, no second local player. Session router returns `selectCouch()`, `selectOnline()`, `frame()`, lifecycle methods and dispose; exactly one active game session. Menu uses injected DOM element/document seam for tests without installing a browser emulator.
- Extend renderer draw with optional final `presentation?:readonly PresentationPoint[]` used only by crew sprite positions; no SimState component mutations. Freeze using an explicitly owned detached snapshot/loadSnapshot view; dispose when replaced. Map crew index to timeline `crew:<player>` ID.

- [ ] **Write failing tests**: physical0→logical2 exclusively, foreign-seat actions rejected, controller replacement/blur reliable-neutral once and production stops, focus doesn't pause/resume authority, text/menu controls don't leak gameplay presses, synced→running only after validated state ACK, fresh port discards pending UI/outbox. Assert interpolation draws supplied coordinates but confirmed Position/hash unchanged; disconnected frame holds last presentation.
- [ ] **Write menu/router tests**: Host capacity selection, normalized code, Ready/Start capability gating, wrong code/compatibility retry text, reconnect label distinguishes saved seat from saved game, no online profile writes, session switch disposes previous loops/ports, Enter while joining doesn't issue duplicate requests. Couch joins/credits/progress/input behavior stays unchanged.
- [ ] **Run red:** `npx vitest run tests/onlineRenderer.test.ts tests/onlineInput.test.ts tests/sessionRouter.test.ts tests/sessionMenu.test.ts`.
- [ ] **Implement session/menu.** Real DOM inputs/buttons with keyboard focus, Pixi game unchanged underneath.60Hz input scheduler runs independently of draw, checks client budget and owned player; consume cues/callouts/events boundedly.100ms presentation via existing timeline; player HUD with current roster/bot statuses. Main view-state hint only for UI. Back/home never silently destroys active run; Leave is explicit. Online feature unavailable message in packaged/nonconfigured app.
- [ ] **Run green**, existing session/HUD/input tests, root typecheck/build; inspect actual application menu visually during Task7, not only snapshots of strings.
- [ ] **Commit:** `feat(ui): add online lobby and assigned-seat sector play`.

### Task7: two-process application proof and final validation

**Files:** create `scripts/network/online-app-smoke.ts`, `online-app-smoke.cjs`, `online-app-report.ts`, optional narrowly scoped test-driver preload; reuse local worker launcher from `room-service-smoke.ts` through a small shared helper if needed. Modify `package.json` with `test:online-app-runtime`; document in `services/signalling/README.md` and `docs/superpowers/reviews/2026-11-15-net-3d-validation.md`. Production app menus/coordinator must be the exercised paths.

**Interfaces:** launcher starts pinned actual local workerd plus two separately profiled Electron processes running compiled app index, bounded90s normal scenario budget and explicit timeout probe. `--report-path` writes redacted JSON with source/runtime versions, steps, seat generations, sync/command/publication proof and resource exits. Any test hook is explicitly test-only, profile-gated and absent in packaged builds; use native window input/menu actions rather than replacing coordinator/service with a harness.

- [ ] **Write report tests** rejecting missing process/cleanup/ACK/ownership evidence and source-less success. A process exit0 alone is not PASS.
- [ ] **Run report red tests**, then implement launcher/driver and run against built app. Prove Host→Join→Ready→Start through real UI; both processes share run/publication, guest input owns only guest seat, nonzero seat HUD. Blur guest neutralizes without globally pausing.
- [ ] **Exercise reconnect:** kill/restart only owned guest process using same isolated profile; host bot takes over, token rejoin increments seatGeneration, old producer retires, full ACK precedes human input. Pause then reconnect, require still paused. Capacity4 sparse seats0/2 uses Cutter and bots; capacity2 uses Skiff. Wrong code and incompatible build do not create a utility/seat. Leave during connect returns cleanly to couch.
- [ ] **Run failure probes:** injected guest/transport death and launcher timeout must exit nonzero, reap only recorded child processes and remove checked exact temporary directories. Observe separate real workerd/Electron/utility exits, zero leaked peer/window/port/listener ownership. Never print credential records.
- [ ] **Final verification once source stable:** `npm test`, `npm run test:signalling`, `npm run typecheck`, `npm run typecheck:signalling`, `npm run build:signalling`, `npm run build`. Run actual online gate plus affected existing host/RTC/service gates directly after one build. Run `npm run acceptance` retaining30s target and `npm run test:determinism` for sector producer changes. Record actual totals, version/source and inherited acceptance timing failure separately; do not call all gates green if it persists.
- [ ] **Independent final review/fix/scoped re-review**, then commit evidence and update parent status. Preserve branch/worktree; do not merge/deploy from this task. Report UI/guest reconnect local proof separately from NOT RUN3e independent lease/mirrors/rehost/liveTURN/WAN/two-machine gates.

## Self-review and handoff

Coverage: identity/config/persistence(Task1); sector lifecycle/bot memory(Task2); authority ACK/focus guarantees(Task3); room/start/retry/lease-local lifecycle(Task4); sender checks/resource ownership(Task5); menu/input/HUD/presentation/couch(Task6); actual application and regressions(Task7). All five Review Focus cases have owning tests. Existing service schema unchanged; no new discovery API. Deferred3e durability is displayed honestly and packaged online remains disabled.

Preserve the previously selected subagent execution method. This new plan and slice-specific product choices are prepared for review before implementation; no product code changed in the planning commit.
