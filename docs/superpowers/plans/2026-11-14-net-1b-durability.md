# Net-1b Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the existing local authority safe to restart, checkpoint, replay and validate across browser engines before internet transport.

**Architecture:** Retain the completed-tick authority boundary and copied-byte loopback. Explicitly own ECS lifetimes, validate portable snapshots before applying them, persist authority ledgers separately from canonical gameplay, and replay through the same command admission/execution path.

**Tech Stack:** TypeScript, bitecs 0.4, Vitest, Electron 37, Vite.

**Spec:** `docs/superpowers/specs/2026-11-13-net-1-foundations-design.md`, especially sections 7–10, 13–14 and amendment 8; approved networking decision. This plan implements Net-1b only. Net-3 transport follows separately.

## Global Constraints

- Preserve SIM_VERSION 35 and canonical gameplay hashes, including golden final b87a0284. No gameplay re-bless or gate floor changes.
- Snapshot, replay and checkpoint formats become 2 independently of SIM_VERSION and protocol 1.
- Commands for tick T come from the publication at T-1; no mid-tick client callbacks or waits.
- Shared non-versioned ECS index remains; never truncate global component arrays or reset the global index.
- Player tables use MAX_PLAYERS or actual run counts, never literal four. Do not raise MAX_PLAYERS or implement multi-ship gameplay.
- Couch appearance and control behavior remain unchanged. Player-specific model only; mouse controls/new visual layout remain Net-2.
- No socket, signalling service or cloud deployment in this plan. Do not claim internet play or remote-host recovery.
- Preserve the 300-tick crash baseline interval, bounded command/result caches and retained clock debt.

## Review Focus

1. A malformed restore after a healthy run must neither mutate its state nor leak entities (tasks 1/3).
2. A command retried after restore or link reassignment must not charge currency/fire twice (task 4).
3. A disposed world must not corrupt another live world when its IDs are reused (task 1).
4. A standing, disconnected or invalid HUD viewer must never inherit another player's card (task 2).
5. A browser harness failure, page error or unavailable engine must not be reported as deterministic success (task 5).

### Task 1: Explicit simulation ownership and recycling

**Files:** Modify `src/renderer/src/sim/state.ts`, `sim/snapshot.ts`, `authority/core.ts`, `authority/authority.ts`, `clientControl/clientRun.ts`, `headless/runner.ts` under `src/renderer/src/`; modify affected test/helper ownership sites; create `tests/simDisposal.test.ts`.

**Interfaces:** Produce `disposeSimState(state: SimState): void` and `assertSimStateLive(state: SimState): void` from state.ts. Track disposed status outside canonical flatten/hash. All owners dispose their own worlds; shared borrowed views do not.

- [x] Write tests: 2,000 four-crew create/dispose cycles while a sentinel lives; entity/component high-water plateaus after warm-up; sentinel hash unchanged; removed entities absent from original world; repeated disposal harmless; recycled health/seat fully initialized. Interleave two runs and loads against isolated hashes. Failed construction/load releases allocations.
- [x] Run `npx vitest run tests/simDisposal.test.ts` and capture intended failures.
- [x] Implement removeEntity plus clearing every owned component cell, disposed-state rejection at public simulation/serialization entry points, exception-safe construction and teardown. Keep the shared index. Update test ownership where tests inspect an adopted world after runner disposal; inspect before disposal instead of relying on freed storage.
- [x] Run disposal, snapshot, headless, authority recovery and golden tests plus typecheck. Commit passing change with no gameplay hash change.

### Task 2: Explicit viewer HUD model

**Files:** Modify `src/renderer/src/render/hudModel.ts` and existing caller(s) in `src/renderer/src/app/`; create `tests/hudViewer.test.ts`; update existing HUD test callers.

**Interfaces:** Export `Viewer = {mode:'couch';ui:CardUiState}|{mode:'player';player:number;ui:CardUiState}` and `HudContext` packaging existing buildHudModel context; use `buildHudModel(state: SimState|null, viewer: Viewer, context: HudContext): HudModel`. Preserve existing context fields rather than dropping progress, slots, messages, credits, callouts. Add typed optional `primaryConsole` and `otherCrewStatus` fields.

- [x] Write failing tests comparing couch content to existing assertions and player views from identical state: each seated player sees own card; standing viewer has none; other pills include role, health, seat, offline/downed and callouts; invalid player throws in development and returns safe empty model in production.
- [x] Run `npx vitest run tests/hudViewer.test.ts` to establish failures.
- [x] Adapt callers to explicit couch Viewer; implement player model without new rendering or input behavior. Use a testable environment policy for invalid-viewer behavior consistent with existing build conventions.
- [x] Run existing HUD tests, new viewer tests, typecheck and build; commit.

### Task 3: Transactional snapshot format 2

**Files:** Modify `src/renderer/src/sim/snapshot.ts`, `sim/flatten.ts`, `net/codec.ts`, `clientControl/clientRun.ts`; add focused `sim/snapshotValidation.ts` if needed; create `tests/snapshotV2.test.ts`; update serialized snapshot fixtures/header representations without changing values/hashes.

**Interfaces:** Keep saveSnapshot/loadSnapshot names. Add `restoreSnapshot(state: SimState, snap: Snapshot): void` for validated in-place restore and `validateSnapshot(layout: ShipLayout, snap: unknown): Snapshot` for portable decoding. Snapshot header carries content digest; resolve it using existing build content digest plumbing, with explicit argument when running outside bundled code. Validation must precede all live writes.

- [x] Test unsupported v1, wrong sim/layout/content/manifest, truncated or excess values, NaN/Infinity, invalid enum/range/integer fields, inconsistent header tick/RNG/player count, malformed object structure. Assert rejection leaves live hash and allocation counts unchanged. Test same-shape restore uses the same world and arrays; replacement validates before disposing prior state.
- [x] Run new snapshot tests to capture failures.
- [x] Implement format 2 validation with field-aware constraints that accept all valid current fixtures, including negative historical visit timestamps. Reuse flatten schema/manifest ordering instead of maintaining a divergent shadow layout. Validate every incoming publication before in-place application.
- [x] Run snapshot, codec, recovery, golden and parity tests plus typecheck; commit representation-only fixture updates. Expected golden final remains b87a0284.

### Task 4: Authority checkpoint and semantic replay v2

**Files:** Modify `src/renderer/src/authority/authority.ts`, `authority/core.ts`, `authority/ledger.ts`, `sim/replay.ts`, `headless/runner.ts`, `net/contracts.ts`, `net/codec.ts`; create `authority/checkpoint.ts`, `authority/replay.ts`, `tests/checkpointV2.test.ts`, `tests/replayV2.test.ts`; convert `tests/golden/basic.json` representation and update `tests/helpers/semanticReplay.ts` and golden runner.

**Interfaces:** Export `Checkpoint` and `ReplayV2` portable schemas; expose `checkpoint(botControllers: readonly CardUiState[]): Checkpoint` and `restore(checkpoint: Checkpoint): void` on public authority. Keep Authority1a compatibility via an extended authority interface if fixtures need the narrower contract. Checkpoint includes spec's complete RunInit, Snapshot, command high-water/cache, event/control cursors, bot UI and pause state, plus held producer high-water needed by existing continuity rules. Auxiliary history resets on external restore. Export validated replay parser and deterministic replay runner using existing authority admission and phase execution; no production raw-button decoder path.

- [x] Test uninterrupted versus checkpoint/retry/restored continuation with held input, bot cursor/repeat memory, stale/duplicate/conflicting commands, reward/purchase commands, pause/resume order, terminal state, rejected commands and link reassignment. Assert sim hashes plus ledger/control/event integrity; restore is paused, clears stale held input, does not replay completion/callouts. Reject future admitted commands explicitly before sealing the checkpoint and deliver their results.
- [x] Test corrupt version/init/cache/player/sequence/bot state rejects transactionally; checkpoint output is detached from live memory; sequence tables support injected player limit 16 and player 15 without raising game cap. Replace Net-1a literal-four ledger/wire assumptions with MAX_PLAYERS/runtime limits.
- [x] Run new tests and capture intended failures.
- [x] Implement bounded ledger export/restore and completed-boundary checkpoint hooks. Record complete initial snapshot/init, canonical held inputs, admitted semantic envelopes and results plus ordered control boundaries in replay v2. Replay uses authority validator/dedup/executor, bypasses wall time. Reject v1 clearly; isolate any legacy numeric codec in test tooling if still needed there. CrashRecord retains complete init/checkpoint, subsequent admitted frames, publication sequence and error with existing 300-tick bound.
- [x] Convert the existing semantic golden fixture to replay v2 without changing gameplay values or hashes; verify 120 existing hashes and final b87a0284. Run checkpoint/replay/crash/recovery/authority/golden/parity tests and typecheck; commit.

### Task 5: Real-browser determinism harness and durability gate

**Files:** Create `scripts/determinism/{fixture.ts,run.ts,browser.ts,electron.cjs,index.html}` and `tests/fixtures/determinism-v2.json`; add `tests/determinismHarness.test.ts`; modify `package.json`, `docs/gates.md` and networking status documentation.

**Interfaces:** Shared browser-compatible fixture runner consumes task 4 replay/checkpoint APIs and emits engine/version, ship, seed, every-60-tick hashes, command-result/event-order evidence, and first differing tick/field. Add `npm run test:determinism` with nonzero failure exit. Electron runner uses real hidden BrowserWindow with nodeIntegration false, isolated narrow reporting preload (create a separate preload file if needed).

- [x] Write harness tests for comparison mismatch, page failure, timeout and missing optional Firefox. A missing mandatory Chromium is a failure, not skip. Firefox absence is explicitly NOT RUN; Safari/JSC/ARM remain gaps.
- [x] Implement checked-in independent semantic scripts for both ships totaling 15 simulated minutes each, 900 one-second samples per ship; explicitly chain runs when ended. Exercise analog inputs, station groups, target removal/reuse, purchases, voting, pause boundaries, checkpoint restore and interleaved worlds. Do not substitute state-responsive bots for recorded input. Compare command results/event order separately from canonical hashes.
- [x] Generate expected vectors in Node, run identical bundle in real Electron Chromium with no Pixi/WebGL, compare every vector and fail with field diff. Run real Firefox through localhost result endpoint when supported executable is available; otherwise record precise NOT RUN reason. Never use ELECTRON_RUN_AS_NODE as browser evidence.
- [x] Run full `npm test`, `npm run typecheck`, `npm run build`, `npm run test:determinism` and existing gameplay/acceptance gates sequentially where timing matters. Record actual engine versions and figures in docs/gates.md. Perform affected couch restart/HUD smoke checks and clearly distinguish automated/virtual input from hardware checks.
- [x] Commit, obtain whole-branch review and resolve material findings before reporting Net-1b complete. Internet play remains pending Net-3.

Completion: all five tasks and final review complete; final source 9b8fddd passes the recorded gates in docs/gates.md. Integration into master remains a separate owner choice.
