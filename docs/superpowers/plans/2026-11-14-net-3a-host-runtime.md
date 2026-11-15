# Net-3a Host Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Run the existing authority independently of renderer timing, accept delayed human inputs correctly, and expose a bounded mode-independent process boundary ready for WebRTC.

**Architecture:** Preserve synchronous couch and bot paths. Add explicit receive-time admission for every asynchronous human producer, a bounded immutable command outbox, then a sector mode adapter and real Electron utility/MessagePort host. No cloud dependency is needed for this slice.

**Tech Stack:** TypeScript, Vitest, Electron 37.10.3 utilityProcess/MessagePorts, existing authority and replay infrastructure.

**Spec:** `docs/superpowers/specs/2026-11-14-net-3-internet-sessions-design.md`, especially sections 2–6 and process-related parts of 7/13. Net-0 remains the architecture authority. Recovery preflight must be reviewed and green first.

## Global constraints

- Existing synchronous couch/localRuntime remains strict, playable and behaviorally unchanged. Never wait for renderer input inside an authority tick.
- Both host renderer MessagePort and later remote WebRTC use receive-time admission; transport locality does not determine timing policy.
- SIM_VERSION 35, existing golden b87a0284, MAX_PLAYERS 4, expected vectors, gameplay floors and timeouts remain unchanged. Replay-format and session-protocol versions are independent.
- Protocol 2/session mode identity is explicit; retain offline v2 replay support. No native WebRTC library, cloud Worker, TURN calls or deployment in this slice.
- Preserve the new safe disconnect and faulted-checkpoint guards. Keep all owned worlds/timers/ports/processes disposable.
- Use registered mode adapters; generic process/session modules must not import sector/tactical state, ECS components, renderer/input code or gameplay schemas.
- No implementation changes to the concurrently developed Helm mode. A tiny second test adapter proves generic boundaries; it is not a shipping duel.

## File responsibilities

- `src/renderer/src/authority/{authority,core,ledger,replay}.ts`, `sim/replay.ts`: explicit admission policy and replay-v3 metadata, while preserving v2 execution.
- `src/renderer/src/net/receivePolicy.ts`: pure receive-time age/sequence policy constants and checks, no wall clock access.
- `src/renderer/src/clientControl/commandOutbox.ts`: bounded immutable command retention and contiguous retry; controller emission budget is checked before allocating IDs.
- `src/shared/netSession.ts`: strict data-only host-control/port message types and budgets.
- `src/network/portLink.ts`: platform-neutral structural port adapter implementing existing Link with bounded delivery and idempotent close.
- `src/network/modes/{contracts,registry,sector}.ts`: mode host contract/registry and the only adapter importing sector authority/snapshot/layouts.
- `src/network/hostRuntime.ts`: dispatch validated host-control messages and own mode instance/peer ports.
- `src/main/network/{hostProcess,transportWindow}.ts`: own utility/hidden-window/main-port lifetimes and sender checks.
- `src/utility/authorityHost.ts`: utility entry with monotonic clock and scheduling, no DOM.
- `src/network/transport/bridge.ts`, the Vite-root entry `src/renderer/networkTransport.{html,ts}`, and `src/preload/networkTransport.ts`: hidden sandboxed Chromium bridge, no WebRTC yet; later Net-3b attaches it.
- `scripts/network/host-smoke.{ts,cjs}`: actual Electron process gate; package and electron-vite/TypeScript config changes belong with the entry that needs them.

## Review focus

1. Ordinary command N rejected at a paused saturated tick must not strand Resume N+1 (task 1/2).
2. A delayed host MessagePort input must work without waiting for renderer callbacks (task 1/5).
3. Watchdog neutralization and delayed admissions must reproduce without a wall clock (task 1).
4. Cancellation/failure after a partial port transfer must leave no process, timer, binding or live world (task 3/4/5).
5. Unknown mode, excessive bytes, wrong source webContents or stale generation must fail before allocation/attachment (task 3/4).

### Task 1: Receive-time admission and replay v3

**Files:** authority/ledger/core/authority, net/receivePolicy/contracts/codec, sim/replay and authority/replay; add `tests/remoteAdmission.test.ts` and `tests/replayV3.test.ts`.

**Interfaces:** `AdmissionPolicy = 'strict' | 'receive-time'`; `Authority.attach(link, players, options?: { admissionPolicy?: AdmissionPolicy }): Unsubscribe`, default strict. Ledger admission accepts policy explicitly after the existing recovery argument. Export `MAX_INPUT_AGE_TICKS = 120` and `REMOTE_HELD_TIMEOUT_MS = 250`. Receive-time result metadata carries `{ expectedSequence: number; disposition: 'terminal' | 'retryable' }`; add it as an optional validated result field used only on receive-time links, preserving strict-v2 recorded results exactly.

**Semantics:** For owned/current-run/valid next IDs, duplicate comparison precedes age/capacity. Receive-time over-capacity terminally consumes/caches that ID without increasing gameplay counts; strict behavior is unchanged. Wrong-run/unowned/malformed/gaps never consume another player's expected ID. Apply accepted commands at the next unexecuted tick, retain original envelope for dedup/replay. Held receipt time is host-owned; neutralize after 250 ms and record the transition. Extend replay as version3 with binding policy and watchdog effects; retain v2 parser/executor and shared core, never a second gameplay runner. Snapshot/checkpoint shape stays v2 unless a demonstrated required state cannot be represented; report such a conflict before editing formats.

- [x] Add failing tests: inputs observed at tick T arrive at T+1/T+120 and are accepted, at T+121 reject; future ticks reject; same input on strict path remains stale. Test charged weapon completion and stale target removal with delayed input.
- [x] Add ordering tests: 16 ordinary admissions, pause, ordinary N then resume N+1; N terminally rejects, resume progresses, duplicate/conflicting retries obey cache and gameplay counts stay 16. Include pending/link limits and other player's ownership.
- [x] Test held watchdog at 249/250 ms, neutral focus signal, stale/duplicate held sequences, independent players and a resumed/suspended producer. Record effects and compare replay-v3 complete checkpoints/results/events to live; replay-v2 golden stays unchanged.
- [x] Run `npm test -- tests/remoteAdmission.test.ts tests/replayV3.test.ts` to establish failures, implement, then run these plus authorityClock/restoreRecovery/authorityDisconnect/netLedger/replayV2/golden/netParity and `npm run typecheck`. Commit.

### Task 2: Bounded human command outbox

**Files:** new clientControl/commandOutbox.ts, narrow changes to cardController/clientRun/input production; `tests/commandOutbox.test.ts`.

**Interfaces:** `createCommandOutbox(player: number, initialSequence: number, capacity = 256)` with `canAllocate(control: boolean, staged?: number): boolean`, `enqueue(envelope: CommandEnvelope): void`, `takeSendable(): readonly CommandEnvelope[]`, `ack(result: CommandResult): 'ready' | 'resync-required'`, `reconcile(expectedSequence: number): 'ready' | 'resync-required'`, `reset(expectedSequence: number): void`, `size(): number`. Return detached bytes/data from retained envelopes; caller mutation cannot alter retries. takeSendable drains only newly eligible/explicitly retried entries into in-flight state, not every pending command on every frame. Keep immutable payloads until result/watermark reconciliation. Within one producer generation, ignore older expectedSequence metadata rather than rewinding; only reset starts a new generation. Missing required payload yields resync-required and stops further sends. Reserve one slot for pause/resume. Sequence allocation remains in controller state but is gated before emission; optional budget defaults unlimited for existing strict callers. The budget check includes already staged commands for that player in the same translation batch (staged defaults0); querying only the already-enqueued outbox size would incorrectly allow several commands into its last free slot. Test move-plus-Confirm batches at the limit for contiguous IDs and visible rejection.

- [x] Test 255 ordinary outstanding commands block a new ordinary action before sequence allocation while one pause/resume fits; 256 total refuses further actions with an explicit capacity outcome. No holes in assigned sequence.
- [x] Test terminal over-capacity retires N and permits N+1; retryable gap stops higher IDs and re-emits the exact retained missing command. Lost retained payload requests producer resync instead of rewriting/reusing an ID. Duplicate terminal results and publication watermarks are idempotent.
- [x] Test independent seat outboxes, immutable retry payload, generation reset, invalid expectedSequence rejection, and no changes to strict keyboard/bot traces.
- [x] Run new tests red, implement, then run commandOutbox/cardController/botClient/netParity/golden and typecheck. Commit. Outbox handles semantic commands only; held movement is latest-only.

### Task 3: Mode host and bounded MessagePort links

**Files:** shared/netSession.ts, network/portLink.ts, network/modes/*, network/hostRuntime.ts, build/contentDigest.ts; tests/portLink.test.ts, tests/modeHost.test.ts and tests/contentDigest.test.ts.

**Interfaces:** `ModeHost` exposes `start(initBytes: Uint8Array): void`, `attach(link: Link, players: readonly number[], policy: AdmissionPolicy): Unsubscribe`, `checkpoint(): Uint8Array`, `restore(bytes: Uint8Array): void`, `pause(reason: string): void`, `dispose(): void`. `ModeDefinition = { modeId: string; schemaVersion: number; simVersion: number; createHost(deps: ModeHostDeps): ModeHost }`, where `ModeHostDeps = { contentDigest: string; clock: MonotonicClock; scheduler: Scheduler; onCrash(record: { checkpoint: Uint8Array | null; diagnostic: unknown }): void }`. The adapter owns serialization of its crash/checkpoint data; generic code never inspects diagnostic gameplay state. `createModeRegistry(definitions)` rejects duplicate/unknown modes. Sector adapter alone resolves validated shipped layouts and uses createAuthority. Raw incoming init/checkpoint bytes cap at 256 KiB before decode; adapter checks compatibility and ownership before allocation. Task3 defines shared HostCommandInput (payload union without requestId/hostGeneration), HostCommand (the stamped wire union), and HostResponse, consumed by task4: commands start(initBytes), restore(checkpointBytes), checkpoint, pause(reason<=128chars), dispose; request/response envelopes have safe positive requestId and positive hostGeneration. Responses are success with optional bounded checkpoint bytes or a bounded typed error, never raw exceptions. Malformed envelopes without a usable positive request ID produce a narrow uncorrelated error arm with requestId:null and the trusted current generation; main treats this as protocol failure, never as a correlated response. `createHostRuntime(registry: ModeRegistry, deps: ModeHostDeps, identity: { modeId: string; schemaVersion: number; simVersion: number; hostGeneration: number })` returns `handle(command: HostCommand): HostResponse`, `attachPeer(peer: string, players: readonly number[], port: PortEndpoint): Unsubscribe`, `dispose(): void`. It verifies registered schema/sim version and trusted deps.contentDigest before construction; start/restore bytes independently validate their own compatibility. A runtime selects one mode/generation for its lifetime. Human peer ports use receive-time policy; adapter-owned in-process bots remain strict. Define these contracts in task3 rather than creating a task3-to-task4 circular type dependency.

`createPortLink(port: PortEndpoint, peer: string, options?: { latestStreamKey?(bytes: Uint8Array): string }): Link` uses `PortEndpoint = { postMessage(data: unknown): void; onMessage(cb: (data: unknown) => void): Unsubscribe; onClose(cb: () => void): Unsubscribe; start(): void; close(): void }`, with small platform adapters for Node/Electron/web MessagePorts. Typed framing carries channel kind/bytes, close reason and delivery acknowledgements; preserve owned copies. Track outstanding bytes including in-flight port sends, not only the unsent queue, so the receiver's queue cannot grow without bound. Reliable ceiling 1 MiB; latest has one in-flight packet and one replacement slot per stream, at most16 streams/link and at most16 KiB/latest packet. The injected latestStreamKey belongs to the mode adapter; default is one stream per direction for one-seat links. Generic port code must not decode a sector held/player payload to derive keys. ACK messages are not themselves acknowledged; validate ACK identity against outstanding sends before releasing budget. Validate before delivery; close releases callbacks and is safe from a send callback. Port delivery acknowledgements release only transport budget, never command IDs.

- [x] Prove sector adapter runs same deterministic fixture/hash as direct authority, rejects unsupported mode/content/layout before world creation, and permits supported detached checkpoint restore.
- [x] Run the same hostRuntime tests with a minimal test mode using entirely different init/state bytes. Add import-boundary tests rejecting sector/tactical imports outside mode adapter. Extend build/contentDigest.ts to hash shared session schema, receivePolicy, authority admission/execution policy and registered mode adapter/schema sources as well as existing simulation inputs; identical normalized sources give one digest in Node/renderer/utility. Test that changing a receive policy or mode schema changes the digest, while line-ending differences do not. Adapt test-only fixture header binding without changing canonical values/hashes.
- [x] Prove delayed port receiver cannot exceed reliable ceiling; byte mutation isolation, latest coalescing, oversized/malformed message rejection, stale peer generation, repeated close, half-transferred port cleanup, attach/restore failures and listener teardown.
- [x] Run portLink/modeHost tests red, implement, then focused boundary/disposal/checkpoint/remoteAdmission tests and typecheck. Commit.

### Task 4: Real Electron process ownership

**Files:** utility/authorityHost.ts, main/network/*, network/transport/*, renderer/networkTransport.{html,ts}, preload/networkTransport.ts, electron.vite.config.ts and TypeScript project configs; tests/hostProcess.test.ts.

**Interfaces:** `startHostProcess(options: HostProcessOptions): Promise<HostProcessHandle>` takes `{ modeId: string; schemaVersion: number; simVersion: number; contentDigest: string; hostGeneration: number }`. Its handle exposes `request(command: HostCommandInput): Promise<HostResponse>`, `attachPeer(peer: string, players: readonly number[], port: MessagePortMain): Promise<void>`, `onExit(callback: (reason: string) => void): Unsubscribe`, and `dispose(): Promise<void>`. Consume the shared HostCommandInput/HostCommand/HostResponse data-only types from task3; do not redefine their discriminants or payloads. The utility verifies identity against its registered mode and build-injected trusted digest, not merely a caller-echoed digest. Request IDs and generation are added by the handle, not caller-supplied renderer data. Commands are a strict discriminated union: start/restore/checkpoint/pause/dispose, with unique request ID and host-generation identity. No arbitrary invoke or module path from renderer. Main creates utility and dedicated hidden transport window, connects ports, and sends a ready handshake with protocol2/mode identity before attaching peers. Use fixed application entry paths; verify IPC sender and reject stale process-generation messages.

- [x] Unit-test start cancellation, ready timeout5s, wrong protocol/mode, utility exit, transport-window exit, partial-transfer error, duplicate response/request IDs and disposed handles. Dispose is bounded/idempotent and releases only owned resources.
- [x] Bundle real utility/transport/preload entries. Utility uses performance.now/setTimeout for authority clock, no renderer animation callback. Hidden BrowserWindow has sandbox/contextIsolation enabled, nodeIntegration disabled and backgroundThrottling false. Validate main sender/frame explicitly.
- [x] Main suspend invalidates runtime activity and requests trusted pause; resume remains paused. Do not change ordinary couch focus behavior or introduce a live service lease here; Net-3e supplies the independent lease gate later.
- [x] Test clock/fault/protocol/lifetime boundaries with fakes, typecheck/build, then a minimal actual utility ready/start/checkpoint/dispose smoke. Commit with actual versus mocked evidence clearly separated.

### Task 5: Actual-process integration gate

**Files:** scripts/network/host-smoke.ts/cjs and minimal fixture/transport-page support, package.json script `test:host-runtime`, docs/gates.md.

- [x] Launch real Electron in an isolated temporary profile, nodeIntegration off, dedicated transport window and utility process. Remove inherited ELECTRON_RUN_AS_NODE/crashpad pipe from the child environment. No user profile/credential access. Child failure, page exception, timeout and missing utility output must exit nonzero.
- [x] Run a host-human producer over actual MessagePorts with receive-time admission. Deliberately stall only the visible test renderer for500ms while the utility authority advances; afterward delayed valid held/commands apply, watchdog prevented stuck input, and no authority tick waited for input.
- [x] Check checkpoint detach/recreate, producer sequences, injected utility/transport exit, stale message after restart, two successive hosts without leaked handles, and mode mismatch. Exercise suspension logic through explicit test hooks; label actual OS suspension NOT RUN unless performed.
- [x] Run full tests/typecheck/build, unchanged acceptance/golden/tactical tests and `npm run test:host-runtime`; record timing against the combined-tree baseline without silently changing ceilings. Run cross-engine determinism if serialized/canonical/replay code changed. No re-bless or claim of internet connectivity.
- [x] Obtain whole-slice review. Net-3a is complete only with real utility/port evidence, not unit mocks. Next plan is Net-3b WebRTC and state streaming; Net-3c service construction/deployment remains separate.

## Coverage and boundaries

Design section2 prerequisites belong to completed preflight. Sections3/4 process and mode compatibility -> tasks3–5; section6 receive-time semantics -> tasks1/2/5; process transport bounds from section7 -> task3. Sections5 and8–12 require later slices (online menu, RTC/state deltas, Worker, rejoin/mirror/leases). This plan intentionally provides the process/input foundation only; it does not mark the whole Net-3 design complete.

## Completion evidence

All five tasks completed and independently reviewed at executable source `6d93ea3`. See [validation](../reviews/2026-11-14-net-3a-validation.md) and [final review](../reviews/2026-11-14-net-3a-final-review.md). The 30s acceptance timing ceiling remains unmet; same-machine prior-source comparison does not demonstrate a new regression. No threshold was changed. Net-3a stays on `codex/net-3` for the next slice; this does not claim internet-demo readiness.
