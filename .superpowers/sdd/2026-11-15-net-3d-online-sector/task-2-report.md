# Task 2 implementation report

Status: DONE. Worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, task base `c52ea64`.

## Implemented interfaces and behavior

Created `src/network/modes/sectorProducers.ts` exporting:

```ts
createSectorProducers({
  authority: Authority,
  runId: string,
  playerCount: number,
  contentDigest: string,
  resolveLayout(id: string): ShipLayout,
  restoredControllers?: readonly CardUiState[]
}): {
  attachHuman(link: Link, players: readonly number[], options: AttachOptions): Unsubscribe;
  beforeControls(): void;
  beforeTick(tick: number): void;
  controllers(): readonly CardUiState[];
  dispose(): void;
}
```

- The manager owns one strict loopback/client/bot per vacant logical seat. Human policies and optional streamed publication/notification sinks pass through unchanged from the mode attachment.
- Bound ownership changes occur only at `beforeControls`/`beforeTick` completed boundaries, including paused pumps. Detach happens before replacement attach; existing authority semantics reject admitted pending commands as unavailable and clear held state. Identity checks prevent stale detach/close callbacks cancelling a new owner.
- Pending replacements coalesce by logical seat; obsolete unbound links close immediately. No unbounded replacement queue. Replacing any seat in a multi-seat human binding retires that whole binding, leaving its other seats vacant for bots.
- Bot publications/results/events drain before decisions and before authority admission. Decisions use `createBotClient` and `createClientRun`, with no live authority SimState access.
- Controller memory exists before authority start captures the initial baseline. `controllers()` returns detached captures of actual current clients, or retained memory while the human occupies that seat. Controller array index equals logical seat; each entry has the full existing CardUiState schema. This is accepted by checkpoint version 2 without serialization changes.
- Restored controller arrays use the matching seat entry, with entry 0 fallback for older shared-controller checkpoints. The authority restores detached and paused before the first hook binds bots. Fresh bot clients retain cursor/repeat/decision memory but reset local command/held counters before the initial publication establishes the authoritative high-water marks.
- Sector mode now supplies controller and boundary hooks, uses live captures for regular checkpoints, and disposes producer ownership on replacement, normal disposal, and authority crash. New candidates guard synchronous initial-publication replacement/disposal before retaining ownership.
- Generic hostRuntime and ModeHost surfaces remain unchanged. No simulation, protocol, replay, checkpoint version, gameplay baseline, dependency, cloud, deployment, or secret changes.

## Files changed

- Added `src/network/modes/sectorProducers.ts`.
- Updated `src/network/modes/sector.ts`.
- Added `tests/sectorProducers.test.ts` (12 tests).
- Updated `tests/modeHost.test.ts` and `tests/sectorStream.test.ts` only for the required default-bot and queued-attachment semantics.
- Existing `tests/checkpointBots.test.ts` remained unchanged and passes, including offline headless continuation/baseline checks.

## TDD evidence

Initial command:

```text
npx vitest run tests/sectorProducers.test.ts tests/checkpointBots.test.ts
```

The first run could not load the not-yet-created module. An API-only no-op scaffold was then added and the same command was rerun for behavioral RED: **9 failed, 3 passed**. Representative failures were vacant seats' `[0,0,0,0]` held high-water instead of `[12,12,12,12]`, no unavailable pending result, missing initial bot memory, and queued links left open. Missing publications also caused the expected absent-controller access failures in dependent tests. This preceded the manager implementation.

After manager implementation and sector hooks, the same command produced GREEN: **12 passed**.

Additional regression RED/GREEN iterations:

1. `npx vitest run tests/sectorProducers.test.ts tests/modeHost.test.ts tests/sectorStream.test.ts`: after adding fault cleanup coverage, **1 failed, 54 passed**. A second queued peer remained open after initial publication fault. Added sector crash-path manager disposal; the test passed in subsequent runs.
2. `npx vitest run tests/sectorProducers.test.ts`: after adding bounded pending replacement coverage, **1 failed, 10 passed**. Superseded unbound links were retained until a pump. Added immediate obsolete-candidate retirement; the test passed in subsequent runs.
3. `npx vitest run tests/sectorProducers.test.ts`: after self-review added disposal-during-bot-bind coverage, **1 failed, 11 passed**. A fresh authority attachment failed with `invalid player ownership` because a bot candidate survived synchronous disposal. Added post-bind candidate ownership/disposal checks; final run below passes.

Restore coverage was strengthened from idle state to a published combat fixture with a gunner's live repeat count > 0, lastTick 2, station cursor state, and deliberately inflated abandoned counters (9999). The initial strengthened fixture had no charged target and failed its nonzero-repeat precondition; setting the charged gunner target matching the established bot fixture made the intended repeat path execute. The test compares 60 resumed snapshots and command high-water traces against uninterrupted controller memory.

## Existing-test decisions

The initial broader run produced **70 passed, 3 failed**. These were required semantic changes, not gameplay changes:

- `modeHost` canonical comparison previously compared an unowned sector to idle direct authority. It now explicitly attaches idle humans to both and compares the entire checkpoint, including default retained bot memory. No expected gameplay values were changed.
- `modeHost` initial-send-close cleanup now advances the fake scheduler to the next safe boundary before asserting port closed/listeners released; a replacement is also pumped and required to publish successfully.
- `sectorStream` trusted streaming/cap test now runs the captured scheduler callback before inspecting the first state packet. Input/cap/cleanup assertions remain unchanged. Task 3 should preserve this queued initial-publication timing.

The controller explicitly approved these fixture adjustments and reserved whole-root/native/acceptance checks for final task integration.

## Final verification

```text
npx vitest run tests/sectorProducers.test.ts tests/checkpointBots.test.ts tests/modeHost.test.ts tests/sectorStream.test.ts tests/hostProcess.test.ts tests/checkpointV2.test.ts tests/checkpointStartup.test.ts tests/authorityDisconnect.test.ts tests/authorityBoundary.test.ts tests/replayV2.test.ts tests/replayV3.test.ts

Test Files  11 passed (11)
Tests       136 passed (136)
Exit code   0
```

```text
npm run typecheck
> tsc -b
Exit code 0
```

`git diff --check` exited 0. Git prints inherited LF-to-CRLF worktree notices on existing touched files; test and typecheck output contains no warnings/errors.

## Self-review and limits

Read the complete production/test changes. Self-review added and fixed synchronous bot-candidate disposal coverage. Verified initial crash baseline player/run schema, periodic tick-300 memory from bot decision tick 299, strict bot admission, human/bot/human watermarks, sparse seats 0/2 at capacity 4, paused same-tick handoff, pending command/held cleanup, replacement/failure cleanup, and fake counter mode independence.

No outstanding Task 2 concerns. Stream ACK authority gating and reliable neutralization remain Task 3 responsibilities; this manager preserves supplied stream attachment sinks. Full root/service/native/application proof, acceptance, and cross-engine replay are controller-owned final gates and were not run here. The parent's untracked validation document was not modified or staged. This report is in the ignored SDD workspace; source/tests are committed separately.
