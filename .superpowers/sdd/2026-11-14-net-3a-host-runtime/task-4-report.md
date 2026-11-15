# Task 4 report

Implemented real Electron utility/hidden-transport ownership. Ordinary couch main startup and focus behavior are unchanged; this is an explicit factory for later lobby integration. No cloud, credentials, root environment files, user profile, gameplay constants, fixtures, golden values or simulation versions were changed.

## Exact downstream APIs

`src/main/network/hostProcess.ts` exports:

```ts
interface HostProcessOptions {
  modeId: string;
  schemaVersion: number;
  simVersion: number;
  contentDigest: string;
  hostGeneration: number;
  signal?: AbortSignal;
  onCrash?(record: { checkpoint: Uint8Array | null; diagnostic: unknown }): void;
}
startHostProcess(options: HostProcessOptions, suppliedPlatform?: HostPlatform): Promise<HostProcessHandle>;
interface HostProcessHandle {
  request(command: HostCommandInput): Promise<HostResponse>;
  attachPeer(peer: string, players: readonly number[], port: MessagePortMain): Promise<void>;
  onExit(callback: (reason: string) => void): () => void;
  dispose(): Promise<void>;
}
```

HostCommandInput/HostCommand/HostResponse are consumed directly from shared task-3 contracts. Caller stamps are rejected; main allocates positive, increasing IDs shared across commands/attachments and stamps generation. Requests clone byte payloads. At most 64 requests are pending, each with a five-second timeout. Ready has a five-second timeout. Null correlations, malformed/current-generation unknown or duplicate responses fail the process protocol and reject pending work; stale positive generations are ignored. Main never correlates requestId:null or invents ID0.

Cancellation through `signal` tears down both owners during startup or after readiness. Dispose rejects new work immediately, requests graceful utility disposal, then kills/disposes its owners after an ACK or at most 250ms. Repeated disposal is harmless. `onExit` receives one bounded reason per owner; late subscribers receive the existing reason. Native process termination is requested by dispose and occurs asynchronously; the actual smoke separately observes the utility's exit before claiming cleanup.

The optional `onCrash` addition was approved by the controller. It receives checkpoint bytes capped by MAX_HOST_BYTES and an opaque diagnostic clone with maximum serialized size 64KiB; diagnostic traversal stops at 4096 nodes, 32 levels, or 65536 cumulative characters, falling back to null. Circular/repeated object references or serialization failure also produce a bounded null diagnostic. Observer exceptions cannot prevent resource cleanup. No diagnostic interpretation or renderer delivery is added.

`HostPlatform` is the structural seam for fakes and native fault injection. `createHostPlatform()` from `src/main/network/transportWindow.ts` supplies production `spawn`, `createTransport`, `createChannel` and `onSuspend`. Task5 can wrap the production spawn/window adapters to inject lifecycle failures while using the actual owner. The optional second factory argument does not change the normal one-argument native path.

`src/network/utilityHost.ts` exports generic `createUtilityHost(registry, deps, post)`, returning `{ receive(message, transferredEndpoints), dispose() }`. Only `src/utility/authorityHost.ts` selects `sectorMode` and its registry. Its digest is a build-injected constant compared with the requested digest before runtime creation; it never uses caller content as its trust anchor. Its clock uses performance.now and scheduler uses cancellable setTimeout. The control plane validates initialized mode/version identity and duplicate attachments. Runtime-owned mode peers retain task3 receive-time admission.

`src/network/platformPort.ts` exports `emitterPortEndpoint(port, 'node' | 'electron')`. Node worker MessagePorts deliver raw messages; Electron MessagePortMain **and ports transferred to an Electron utility** deliver event.data. The latter was verified with actual Electron37.10.3, correcting an initial assumption from task3's downstream notes. Listener removal is exact; close/messageerror paths release ownership.

## Native topology and packaging

Main creates utility plus hidden BrowserWindow. Once utility identity and the validated hidden main-frame IPC are ready, it creates a MessageChannelMain, transfers one endpoint to utility and one through isolated preload into the hidden bridge. That bridge sends a protocol2/mode/digest/generation handshake through the actual port. Only then does startHostProcess resolve and allow peer attachments. The control plane uses utility parent messaging separately from peer/transport ports.

Hidden BrowserWindow uses show:false, sandbox:true, contextIsolation:true, nodeIntegration:false, backgroundThrottling:false, webSecurity:true. Main validates both event.sender and event.senderFrame against that exact owned webContents/mainFrame, and checks identity/generation. Window opening/navigation are denied. Preload exposes no raw IPC or invoke API. The bridge accepts only its same-window, matching-identity transfer. Visible renderer has no new authority or process-control API.

Utility or transport process/window exit tears down its paired owner, pending requests, local untransferred/half-transferred endpoints and listeners. Successfully transferred endpoints belong to their receiving owner; killing that owner releases them. Invalid or failed peer attachments close received ownership. The main powerMonitor suspend listener sends trusted pause reason system-suspend; startup suspend cancels startup. No resume listener sends unpause. OS resume therefore leaves the authority paused. The independent service lease gate remains Net-3e work.

Build outputs:

- `out/main/hostProcess.js` exports startHostProcess for downstream native harnesses.
- `out/main/authorityHost.js` is the fixed utility composition entry.
- `out/main/transportWindow.js` and `out/main/hostProcessProtocol.js` are sibling chunks; explicit sibling chunk filenames preserve fixed __dirname-relative paths.
- `out/preload/networkTransport.js` is bundled and sandbox compatible.
- `out/renderer/networkTransport.html` plus its asset is the fixed hidden page.
- Existing `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` remain couch entries.

Controller-approved minimal packaging refinement: Vite's existing renderer root cannot emit HTML outside src/renderer (it rejected ../network/transport/index.html). The tiny HTML therefore lives at `src/renderer/networkTransport.html`. Its tiny sibling script `src/renderer/networkTransport.ts` imports the actual generic `src/network/transport/bridge.ts`, avoiding Vite dev URL normalization outside the root. Production uses loadFile at the fixed output; development uses the trusted ELECTRON_RENDERER_URL origin with fixed /networkTransport.html. No caller chooses paths.

TypeScript refinement: tsconfig.web includes utility, main/network and the renderer transport shim. This project already contains network, simulation, tests, Node types and DOM types, so it can cover the composition entry and main-owner tests without duplicating the entire simulation graph into tsconfig.node. Existing node main/preload/shared coverage stays intact. Renderer and utility use the exact same digest computed once in electron.vite.config.ts. No new dependency/package script was needed; Task5 owns the lasting test:host-runtime gate.

## TDD and focused verification

Initial RED: `npm test -- tests/hostProcess.test.ts` failed because the requested owner module did not exist. Initial owner GREEN: 12 tests passed.

Utility RED: `npm test -- tests/utilityHost.test.ts` failed because the generic utility controller did not exist. Its first implementation made six tests pass.

Serialization RED: utility diagnostic test observed all 10000 getters visited, failing the expected finite traversal budget. Bounded serialization changed that to nine passing utility tests with the crash candidate disposed exactly once.

Development loading RED: the transport-window test failed with Invalid URL because only loadFile was used. The development URL path made it pass. Actual Vite dev then independently exposed an outside-root script URL failure and timed out; the renderer entry shim corrected that, with actual native dev proof below.

Native first smoke RED: utility emitted fatal invalid-transport. Temporary output-only instrumentation showed its transferred port delivered `{ data, ports }`. Source utility adapter was corrected from Node raw to Electron event.data; rebuilding made native handshake/start/checkpoint/dispose succeed. Temporary output instrumentation was removed by rebuild and is not source/committed code.

Final focused command:

```text
npm test -- tests/hostProcess.test.ts tests/utilityHost.test.ts tests/platformPort.test.ts tests/transportWindow.test.ts tests/networkBoundary.test.ts tests/portLink.test.ts tests/modeHost.test.ts
Test Files 7 passed (7)
Tests 72 passed (72)
```

Coverage includes caller stamp rejection; ready protocol/mode/digest; request cancellation; five-second ready/request timeout; utility/window exit; first/second partial-transfer failures; trusted frame handshake ordering; stale/duplicate/null responses; bounded/idempotent disposal; peer close/failed transfer; suspend with no resume unpause; throwing crash observer; duplicate utility commands/attachments; null protocol correlation; bounded diagnostic traversal; real Node raw ports; Electron event-shaped ports; foreign webContents/subframe/stale frame readiness; generic import boundaries extended through main/network. Native fault/process behavior is distinguished below from these deterministic fakes.

`npm run typecheck`: passed. `npm run build`: passed, including every main/preload/renderer entry. `git diff --check`: passed (repository CRLF conversion notices only). Final full-suite and slice-wide acceptance/golden/determinism gates are explicitly owned by the controller/Task5 and were not run by this implementer.

## Actual native proof

Installed Electron37.10.3 was launched hidden from Node with fresh mkdtemp profiles, `--user-data-dir=<path>`, inherited ELECTRON_RUN_AS_NODE and CHROME_CRASHPAD_PIPE_NAME removed. No user's profile was opened. The launcher removed each isolated profile after child exit. The harness handles window-all-closed explicitly so destroying the last window cannot silently end the test before its cleanup assertions.

Temporary reproducible harness lives under ignored `.worktrees/task4-proof/` (not committed; Task5 supplies lasting scripts):

```text
npx tsx .worktrees/task4-proof/fixture.ts
node .worktrees/task4-proof/launch.cjs
node .worktrees/task4-proof/dev-launch.cjs
```

Fixture uses shipped starter layout, derived layout hash, SIM_VERSION35 and computeContentDigest; no fixture/golden rewrite. Both launch modes use actual built hostProcess/utility/preload plus the actual hidden page (file production or local Vite dev). Final production proof:

```text
ACTUAL ready: utility + sandbox transport, windows=1
ACTUAL start/checkpoint: tick=9, bytes=2626
ACTUAL transferred peer frames=10; sandbox/contextIsolation true, nodeIntegration/backgroundThrottling false
ACTUAL dispose: utility exit observed; zero windows; completed
ACTUAL isolated profile removed: true
```

Final actual dev proof produced the same tick/bytes/peer-frame/settings/exit/zero-windows assertions and `ACTUAL dev profile removed: true` against a local Vite server, then closed that server. Both exited0.

Actual versus mocked boundary: native ready, transfer handshake, sector start, independent utility ticks, checkpoint, peer transfer/state frames, security preferences, observed utility exit, zero windows, isolated profile removal and dev page loading were run. Startup timeout/cancellation, lifecycle fault injection, forged sources, duplicate/null protocol responses, suspend events and diagnostic faults are deterministic unit tests. Actual OS suspension, a stalled visible renderer, restart matrix, WebRTC/internet connectivity and service leases were NOT RUN and are not claimed; those belong to Task5/later slices.

## Files and self-review

Owned changes: electron.vite.config.ts, tsconfig.web.json, shared/hostProcessProtocol, main/network/{hostProcess,transportWindow}, utility/authorityHost, network/{utilityHost,platformPort,transport/bridge}, preload/networkTransport, renderer/networkTransport.{html,ts}, hostProcess/utilityHost/platformPort/transportWindow tests and networkBoundary coverage, plus this report.

Self-review found and corrected native utility event-shape and Vite dev-entry assumptions, missing main/network boundary coverage, and unbounded diagnostic traversal. Native final smoke reran after the final build. No known Task4 blocker remains. Dispose's promise bounds the main teardown request rather than waiting indefinitely for OS exit; the native proof explicitly waits for observed exit. Long-lived service leases and subsequent UI/lobby integration remain outside this task.
