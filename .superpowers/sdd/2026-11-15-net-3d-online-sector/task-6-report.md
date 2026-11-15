# Net-3d Task 6 report

Status: DONE. Worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, base `0a14f0f`.

Commit: `a900937 feat(ui): add online lobby and assigned-seat sector play` (17 source/test files; ignored report retained locally).

## Implementation and production interfaces

- `createOnlineRendererSession(deps)` is a separate production session using `browserPortEndpoint` → `createPortLink` → `createSectorRemoteClient`. No alternate coordinator, network composition or production test hook was added. Dependencies are `sampleDevices`, `resetInput`, `renderer`, `hud`, `now`, `scheduler`, `resolveLayout`, optional `playCue`/`contentDigest`, and `api: Pick<OnlinePreloadApi, 'viewState'>`. It exposes `attach(descriptor, MessagePort)`, `setStatus(OnlineStatus)`, `setFocused(boolean)`, `setInputBlocked(boolean)`, `pause()`, `frame()`, and `dispose()`.
- The 60 Hz scheduler samples independently of renderer frames. The sole physical producer is primary keyboard `kb:0` or the first active controller. Physical input maps to `descriptor.seatId`, including seat 2; translation passes the explicit owned-seat list and client command budget. Secondary keyboard never becomes an online producer. Selection consumes activation presses; controller loss/replacement sends reliable neutral once and produces nothing while no eligible device remains. Blur/menu blocking sends reliable neutral once and stops production. Focus restoration resets input and does not change authority pause. Explicit Pause/Resume uses the owned client's `pauseActions` with its reserved control budget, not privileged IPC.
- The session emits `viewState(epoch, 'synced')` only after the stream client's command status leaves waiting-state (validated full state and synchronous ACK success), followed by the actual publication phase. These remain main UI hints only. Fresh epochs close/dispose the old client and port, discard old UI/outbox, clear cues/callouts/presentation, reset devices, and wait for a fresh ACK. Stale or duplicate endpoints close immediately.
- A separately owned `loadSnapshot` view is maintained from confirmed publications and disposed on replacement/exit. The close listener precedes client disposal, permitting a final snapshot refresh. Disconnect keeps the last drawn presentation points, the detached world, and detached card UI. Tests assert the original replica is disposed and the frozen view survives until session disposal. Cues are coalesced in a finite set; callouts are capped at four; bounded client result/event queues are drained.
- `Renderer.draw` and the structural SessionDeps draw method now accept final optional `presentation?: readonly PresentationPoint[]`. `CrewLayer.draw` accepts the same optional points, maps crew index to `crew:<player>`, and uses those coordinates only for sprites/circles/carried torpedoes. The remote timeline explicitly uses 100 ms delay. Actual Pixi crew-layer tests verify supplied pixel positions and unchanged confirmed snapshots; no Position component is rewritten for drawing.
- `createOnlineInput()` returns `sample(sources): InputFrame`, `reset()`, and read-only `key`, `changed`, `callouts` for the session's device/neutralization/callout decisions.
- `createSessionRouter({couch, online, resetInput})` owns at most one instantiated mode. `selectCouch()`/`selectOnline()` return the selected session, are idempotent within the same mode, and dispose the prior mode on switching. It also exposes `home`, `mode`, `pause`, `resume`, `frame`, `dispose`. Online lifecycle routes only to focus; couch routes to its unchanged pause/resume implementation.
- `main.ts` creates one typed online facade and installs the sole `onPort` callback before menu actions. It subscribes to detached facade status, constructs lazy couch/online factories, routes lifecycle, and cleans facade/port/status/power/device/session ownership on unload. Initial/visibility focus checks avoid enabling online input while unfocused. OS resume only resumes couch. Automatic reconnect's transient main idle status retains the online frozen view; explicit Leave/Home disposes it.
- `createSessionMenu({root, document, api?, couch, online, pause, inputBlocked, leaveCouch?, home?})` uses native DOM controls and the existing dark monospace/pale-blue visual language. Exposes `setStatus`, `home`, `frame(now)` (retry countdown only), `dispose`. Host defaults to capacity 2 and offers 1–4 with Skiff/Cutter labels. Join trims/uppercases and validates eight Crockford characters. Pending requests deduplicate Enter; Leave remains available to cancel pending connection work and ignores stale action completion. Lobby Ready/Start/Remove are capability gated, with defensive host/roster checks. Running/paused/error/reconnect retains a compact strip over the game, including when main clears attachment epoch during failure. Reconnect explicitly says saved seat, with a statement that this is not a saved game. No-config/browser mode explains local-service availability and leaves Couch available. Return/Home is available only after idle/terminal error or explicit ended Leave; active play has explicit Leave.
- Online dependencies have no progress/telemetry persistence callbacks. Couch implementation remains behaviorally unchanged; only its optional renderer signature was widened.

## Controller-approved adjacent changes

1. `input/sources.ts`: added `reset()` clearing both held and counted presses. Ignores keydown from input/select/textarea/button/contenteditable controls while retaining unconditional keyup/blur clearing and ordinary body-target couch controls. Tests cover typed F/E/Q/R, button Enter, reset, blur, and ordinary couch Enter.
2. Main Start readiness integration: `onlineSession.emit` now publishes Start only for host lobby, all occupied humans ready+connected, and `peers.allReady()`. `OnlinePeersDeps.onChange?()` refreshes status after peer creation/retirement/native-ready/service-ready; observers are epoch checked. `allReady()` rejects disconnected or mismatched-generation peers and disposed owners. Reentrant disposal after a status callback cannot start or attach a newly retired native attempt. Main's existing start dispatch validation remains unchanged. Focused tests cover unready → native-only → service-ready → loss → replacement, stale service readiness, and generation mismatch before reconcile retires the old route.

## Native application driver selectors (Task 7)

All selectors use `[data-testid="..."]`; controls also have visible text and native labels/roles.

- `session-menu`, `status` (`role=status`, `aria-live=polite`), `online-availability`.
- Home `couch`, `host`, `join`, `reconnect` (text `Reconnect saved seat`), `forget-seat`.
- Host `host-form`, `capacity` (native select, aria-label `Crew capacity`, values `1`…`4`, default `2`), `create-room` (submit).
- Join `join-form`, `join-code` (native input, aria-label `Room code`), `join-room` (submit). Submit form or press Enter; second submission while pending is ignored.
- Lobby/game `room-code` (text `ROOM <code>`), `assigned-seat` (one-based `You are Player N`), `roster`, `ready`, `start`, `remove-seat-N` (zero-based logical N, excluding host self).
- Running `pause` toggles visible `Pause`/`Resume` via actual confirmed main view phase; `leave` is explicit and becomes `Return to menu` for ended state. Errors expose `retry`, `reconnect`, `try-code` and/or `home` as capabilities allow. `reconnect-countdown`, `storage-warning` are conditional.
- Couch `leave-couch` explicitly leaves that session; ordinary couch key bindings, joins, credits, progress and game controls still run through the original couch session.

No debug state global or privileged gameplay command was introduced. Actual application screenshots, native processes and gameplay agreement belong to Task 7.

## TDD evidence

1. Initial RED: `npx vitest run tests/onlineRenderer.test.ts tests/onlineInput.test.ts tests/sessionRouter.test.ts tests/sessionMenu.test.ts` exited 1: all four new modules missing. Tests were written before production implementation.
2. After modules: real renderer/input tests passed; two fixture expectations were corrected (router intentionally carries unfocused state across switching; duplicate submit must retain the original form reference because the busy form is removed). This was test-fixture correction, not a behavior relaxation.
3. Sources RED: `npx vitest run tests/onlineInput.test.ts` exited 1, 2 passed/1 failed: `keyboard.reset is not a function`. Added reset/control filtering; passed.
4. Cancellation RED: `npx vitest run tests/onlineRenderer.test.ts tests/sessionMenu.test.ts` exited 1, 8 passed/1 failed: pending Join disabled Leave. Implemented interruptible Leave plus action-generation handling and defensive Start roster gating; passed.
5. Main capability RED: `npx vitest run tests/onlineCoordinator.test.ts tests/onlinePeers.test.ts` exited 1, 30 passed/2 failed: unready lobby exposed Start, and `allReady()` stayed true after seat generation changed. Implemented capability/invalidation integration. GREEN with menu: 35/35 passed across 3 files.
6. Device/unconfigured RED: `npx vitest run tests/onlineRenderer.test.ts tests/sessionMenu.test.ts` exited 1, 9 passed/2 failed: controller absence continued advancing held sequence `[0,0,5]` instead of `[0,0,3]`; no fixed availability explanation node for a connected unconfigured app. Fixed absent-device early return and capability-derived unavailable explanation.
7. Freeze UI RED: `npx vitest run tests/sessionMenu.test.ts` exited 1, 4 passed/1 failed: cleared attachment epoch switched to full-screen opaque menu. Menu now tracks whether this session displayed a game, retains the compact strip on loss, and main retains the frozen session through automatic retry's transient idle phase.

## Final verification

Final source command:

```text
npx vitest run tests/onlineRenderer.test.ts tests/onlineInput.test.ts tests/sessionRouter.test.ts tests/sessionMenu.test.ts tests/onlineCoordinator.test.ts tests/onlinePeers.test.ts tests/session.test.ts tests/hudViewer.test.ts tests/hud.test.ts tests/hudFit.test.ts tests/inputTimeline.test.ts tests/deviceManager.test.ts tests/onlineNeutralization.test.ts tests/onlineBridge.test.ts tests/render.test.ts

Test Files  15 passed (15)
Tests       210 passed (210)
Exit code   0
```

The new suites contain renderer 7, input 3, menu 5, router 1 tests. Existing adjacent session 35, HUD 64/13/17, devices 7, input timeline 3, neutralization 12, bridge 7 and render 4 pass. Coordinator 26 and peers 6 include the new readiness regressions. Test output has no warnings/errors.

`npm run typecheck`: exit 0, no diagnostics. An earlier run caught nullable-client narrowing, the publication's possible error phase, detached HUD card state typing and a mock tuple annotation; corrected before green.

`npm run build`: exit 0 under ordinary piped output. Main 111 modules, preload 8 modules, renderer 878 modules. No dependency/pin/build changes. Final focused tests, typecheck and build were run concurrently after the final changes; each command completed successfully.

Scoped `git diff --check`: exit 0; Git's ordinary LF-to-CRLF notices are not test diagnostics. Parent-owned validation document was intentionally excluded from staging.

## Files and self-review

New source: renderer/app/onlineSession.ts, app/sessionRouter.ts, input/onlineInput.ts, render/sessionMenu.ts.
Modified source: renderer/main.ts, app/session.ts (type only), input/sources.ts, render/renderer.ts, render/crewSprites.ts; main/network/onlineSession.ts, onlinePeers.ts (approved readiness integration).
New tests: onlineRenderer.test.ts, onlineInput.test.ts, sessionRouter.test.ts, sessionMenu.test.ts. Modified tests: onlineCoordinator.test.ts, onlinePeers.test.ts.

Self-review checked endpoint disposal order, separately owned snapshot lifetime, last presentation freeze, mode timer disposal, text/control input isolation, logical seat mapping, budget use, reliable neutralization, status-vs-authority separation, delayed request cancellation, native readiness invalidation and keeping parent files out of the commit. Fixes from self-review are documented above. No unresolved implementation concern. DOM tests are structural and meaningful but do not claim visual/native proof. Actual rendered screenshots/two-process service smoke, full root/service suites, acceptance/replay and WAN/deployment gates remain controller-owned Task 7; none were run here. No secrets/.env/dependencies/cloud changes, no subagents.
