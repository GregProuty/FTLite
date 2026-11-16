# Net-3d Task 5 report

Status: DONE.

Commit: `993cefb feat(net): wire online sessions through trusted Electron IPC`.

Implemented in `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, starting at `fc53dc6`.

## Implementation

- `registerOnlineIpc(win, owner)` installs only fixed named operations and a read-only status query. Every operation requires the registered visible window's exact webContents/mainFrame, no transferred ports, one strict action of the channel's own type, and bounded public outputs. Unknown windows, hidden transports, subframes and injected ports are denied. Unexpected provider output becomes a fixed failure/status; exception messages never cross IPC.
- Main retains a detached current status and a version-1 positive safe-integer revision. Subscription changes increment revision; the named initial read returns the same current revision/status. Renderer listens before reading, and ignores older/equal responses. Initial configured/saved-seat availability therefore reaches late listeners without a stale initial reply overwriting a newer push.
- Main lifetime cleanup removes every IPC handler, owner status subscription, visible death listener and powerMonitor listener. Suspend stops the online owner and sends the existing couch lifecycle notification. Resume only sends the UI lifecycle notification. Repeated cleanup is idempotent. The existing coordinator's own dispose is also idempotent when its visible-window observer runs.
- `createOnlinePlatform(win)` uses the real `createHostPlatform().createTransport(identity)` owner, retains its exit subscription after readiness, bounds startup at five seconds, cleans load failures and retains late loss observation. Intentional disposal does not announce transport loss. Host startup continues through `startHostProcess` with the same native platform.
- Validated, strictly increasing port epochs transfer through the exact visible main frame. Preload validates a strict versioned envelope and descriptor/epoch, then uses `window.postMessage` with the actual transfer list and fixed `ftlite:online:main` source marker. It never sends a port through contextBridge cloning. Rejected/duplicate/stale transfers close their endpoints.
- Renderer-owned `createOnlineBridge` validates same-window source, marker, versioned descriptor, port count and increasing epoch. It closes malformed, unclaimed and replayed endpoints. Page messages have no path to privileged main operations. One port listener preserves endpoint ownership.
- App bootstrap captures only development `FTLITE_LOCAL_SERVICE_URL`, validates the existing loopback policy, resolves userData at runtime and injects the existing seat store/service client, native fetch/WebSocket, monotonic `performance.now`, epoch `Date.now`, native scheduling and cryptographically random 128-bit hex nonces. Packaged/unconfigured/missing-native-networking mode disables online. Visible sandbox/contextIsolation/nodeIntegration/webSecurity settings are explicit.
- Both sandbox preloads now build with the installed electron-vite 5 `isolatedEntries:true,externalizeDeps:false`. This prevents shared relative require chunks. Pinned electron-vite 5's isolated-entry reporter unconditionally calls terminal cursor methods even on piped stdout. Controller authorized `build/isolatedBuildReporter.ts`, a narrow compatibility helper that supplies only missing cursor controls on non-TTY stdout, preserving writes/errors and existing methods. It does not mutate dependencies or weaken sandboxing.

## Exact renderer-facing interfaces for Task 6

Shared types live in `src/shared/onlineSession.ts`:

```ts
type Unsubscribe = () => void;
interface OnlinePreloadApi {
  host(capacity: number): Promise<OnlineResult>;
  join(code: string): Promise<OnlineResult>;
  ready(ready: boolean): Promise<OnlineResult>;
  removeSeat(seatId: number): Promise<OnlineResult>;
  viewState(epoch: number, phase: 'synced' | 'running' | 'paused' | 'ended'): Promise<OnlineResult>;
  reconnect(): Promise<OnlineResult>;
  start(): Promise<OnlineResult>;
  retry(): Promise<OnlineResult>;
  leave(): Promise<OnlineResult>;
  forgetSeat(): Promise<OnlineResult>;
  readStatus(): Promise<OnlineStatusEnvelope | Extract<OnlineResult, { ok: false }>>;
  onStatus(callback: (value: OnlineStatusEnvelope) => void): Unsubscribe;
}
interface OnlineStatusEnvelope { version: 1; revision: number; status: OnlineStatus }
interface FtlitePreloadApi {
  online: OnlinePreloadApi;
  onSuspend(callback: () => void): Unsubscribe;
  onResume(callback: () => void): Unsubscribe;
}
```

`window.ftlite?: FtlitePreloadApi` is the sole contextBridge object. It exposes no generic invoke/send/fs or `onPort` callback.

Use `createOnlineBridge(window, window.ftlite.online)` from `src/renderer/src/app/onlineBridge.ts`. The returned object retains the named online methods and `readStatus`, replaces `onStatus` with `onStatus(callback:(status:OnlineStatus)=>void):Unsubscribe` that handles the subscribe/read/revision race, and adds:

```ts
onPort(callback: (descriptor: OnlinePortDescriptor, port: MessagePort) => void): Unsubscribe;
dispose(): void;
```

Create this facade once and install its one `onPort` listener before dispatching Host/Join/Reconnect/Start/Retry actions. Additional simultaneous port listeners throw fixed `invalid-port`. The callback receives the actual DOM MessagePort; the recipient owns accepted ports and closes/attaches them as its session lifecycle requires. Removing the listener does not revoke an endpoint already delivered. No-listener transfers close and retire the epoch. `dispose` removes the page message listener and any remaining facade status subscriptions. Lifecycle subscriptions are on `window.ftlite` and return their own unsubscribers.

The port descriptor remains `{epoch,runId,hostGeneration,seatId,compatibility}`. Main-to-preload wire data is `{version:1,descriptor}` on fixed `online:port`; preload-to-page data is `{source:'ftlite:online:main',version:1,descriptor}` with one transferred port. Epochs are monotonically increasing across the owner's attachments; the renderer reports attachment view-state through the named `viewState` method only under Task 4's existing limited semantics.

## TDD and verification

1. Initial RED: `npx vitest run tests/onlineIpc.test.ts tests/onlinePlatform.test.ts tests/onlineBridge.test.ts`.
   Exit 1: three suites failed because the three implementation modules did not exist.
2. Preload RED: same command after core implementation and adding the isolated-preload test.
   Exit 1: 21 passed, 1 failed. The existing preload did not deliver online ports (`postMessage` called zero times). Implemented the named API and validated transfer path.
3. Boundary GREEN: `npx vitest run tests/onlineIpc.test.ts tests/onlinePlatform.test.ts tests/onlineBridge.test.ts tests/onlineSessionContract.test.ts`.
   Exit 0: 4 files, 59 tests passed.
4. Piped-build RED: ordinary `npm run build` reached main successfully, then failed in `[vite:isolate-entries]` / `[vite:transform-reporter]` with `process.stdout.clearLine is not a function`. Source inspection traced `renderStart` to unconditional stdout moveCursor/clearLine/cursorTo calls in installed electron-vite 5. A PTY-only run passed and established the TTY-specific cause; this was not accepted as the final build fix.
5. Reporter-helper RED: `npx vitest run tests/isolatedBuildReporter.test.ts`.
   Exit 1: helper module did not exist. GREEN after implementation: exit 0, 2 tests. Tests verify missing non-TTY methods, callback completion, preserved writes/native methods and no terminal mutation.
6. Self-review RED: `npx vitest run tests/onlinePlatform.test.ts tests/onlineBridge.test.ts`.
   Exit 1: 10 passed, 2 failed. A subscriber added after intentional disposal received a loss notification; a closed unclaimed valid epoch could be replayed after a port listener arrived. Tracked actual-loss state and retired valid epochs even without a listener.
7. Final adjacent GREEN:
   `npx vitest run tests/onlinePlatform.test.ts tests/onlineBridge.test.ts tests/onlineIpc.test.ts tests/onlineSessionContract.test.ts tests/isolatedBuildReporter.test.ts tests/onlineCoordinator.test.ts tests/hostProcess.test.ts tests/rtcTransportOwner.test.ts tests/onlineConfig.test.ts`.
   Exit 0: **9 files, 130 tests passed**, no test warnings/errors. Platform 5, bridge/preload 7, IPC 12, shared contract 38, reporter 2, coordinator 25, host process 16, RTC owner 9, config 16.
8. Root `npm run typecheck`: final exit 0, no diagnostics. Initial attempts caught test fixture literal inference, composite project inclusion of the directly tested preload and the helper's overloaded cursorTo annotation; all corrected. The final helper-only focused test re-run also passed 2/2 after its explicit overload annotation.
9. `npm run typecheck:signalling`: exit 0, no diagnostics.
10. Ordinary piped `npm run build`: final exit 0. Main 111 modules, preloads 8 modules, renderer 867 modules. Main output includes coordinator, IPC, service, seat persistence and native bootstrap. `out/preload/` contains only `index.js` and `networkTransport.js`; `rg -n '\brequire\(|\bimport\b' out/preload -g '*.js'` reports exactly `const electron = require("electron");` in each entry, no relative chunks/imports. Sandbox/contextIsolation remain enabled.
11. Scoped `git diff --check`: no whitespace errors. Git's normal LF-to-CRLF notices are not test warnings.

## Files and scope

New source: main/network/onlineIpc.ts, onlinePlatform.ts; renderer/src/app/onlineBridge.ts; build/isolatedBuildReporter.ts.
Modified: main/index.ts, preload/index.ts, renderer/src/main.ts (type declaration only), shared/onlineSession.ts, electron.vite.config.ts, tsconfig.node.json, tsconfig.web.json.
New tests: onlineIpc, onlinePlatform, onlineBridge (includes real preload module with only Electron boundary mocked), isolatedBuildReporter. Modified onlineSessionContract test.

Shared API/channel/envelope additions and the reporter helper were explicitly approved by the controller. The preload test requires the direct index preload include in web's composite project; both projects explicitly include the build helper. No Task 6 menu/gameplay behavior was added. No dependencies/pins, owner checkout, ledger or validation-document edits, root/service full suites, native application smoke, cloud/deployment/.env/secret access or subagents.

Self-review checked sender/frame admission, fixed errors and redaction, status subscription ordering, actual port ownership and transfer failure cleanup, native death after readiness, listener removal and sandbox bundle imports. No unresolved implementation concern. Native fetch/WebSocket behavior and real two-process application/port delivery remain the controller-owned downstream application gate; structural adapter tests/build do not claim that proof.
