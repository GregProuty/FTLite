# Task 4 — durable checkpoint and semantic replay v2

Implemented in `codex/net-1b` on the assigned worktree. No external setup, owner-checkout changes, plan/ledger edits, subagents, gameplay blessing, game-cap increase, or SIM_VERSION change.

## Public API for task 5 / browser harness

`authority/authority.ts` exports `Authority extends Authority1a` with:

```ts
checkpoint(botControllers: readonly CardUiState[]): Checkpoint;
restore(checkpoint: Checkpoint): void;
replay(): ReplayV2;
```

`createAuthority(deps)` returns this extended interface. App/session/headless factory seams still accept the narrow `Authority1a`, so test factories do not have to fake durability methods. `AuthorityDeps.botControllers?()` supplies host controller memory for initial/periodic crash checkpoints; headless supplies its shared UI, including a correctly shaped default before first publication.

`Checkpoint` is the portable data contract in `net/contracts.ts`, re-exported by `authority/checkpoint.ts` and `authority/authority.ts`. `validateCheckpoint(layout, unknown, explicitContentDigest)` validates and detaches the complete envelope without allocating a simulation. It includes complete RunInit/Snapshot, command high-water, bounded envelope/result cache, admission tick/counts, held high-water/held input, event/publication/control/receive/lifecycle cursors, bot UI and pause/terminal state. Ledger export rejects pending entries. `createLedger(owned, playerLimit = MAX_PLAYERS)` exposes `export()` and transactional `restore(LedgerState)`; `createMessageCodec(playerLimit = MAX_PLAYERS)` supports injected wire limits. Runtime MAX_PLAYERS remains four; player 15 is exercised at injected limit 16.

`sim/replay.ts` exports `ReplayV2`, `ReplayFrame`, `ReplayAction` and portable data equality. No production raw-button codec remains. The historical numeric codec lives only at `tests/helpers/legacyIntentCodec.ts`.

```ts
import { parseReplay, runReplay } from './authority/replay';

const replay = parseReplay(layout, parsedJson, explicitDigest);
const result = runReplay(layout, replay, explicitDigest,
  (state, frame) => {
    // Called once per completed tick. Borrowed state is disposed on return.
    // Sample hashState(state), canonical fields, or gameplay projection here.
  },
  {
    retainFrames: false, // default; avoids a second complete output journal
    retainTrace: false,  // default is true; disable for sampled long runs
    onFrame(frame) {
      // Every admission/control/tick/etc boundary, in recorded order.
      // Inspect frame.results, frame.events and frame.after here.
    }
  });
```

Return fields are `{ checkpoint, results, events, hashes, frames }`. With default options, hashes contains one hash per completed tick, results contains ordered CommandResults, events contains ordered `{ eventSequence, tick, kind: 'cue' | 'pause' | 'ended' }`, and frames is empty. `retainFrames: true` returns actual generated frames; `retainTrace: false` leaves results/events/hashes empty. Callbacks should treat borrowed state/frame as read-only and copy any retained fields. Output checkpoint is detached. Results/events metadata are diagnostics, not dispatched presentation effects.

Every frame has tick, eventSequenceBefore, action, results, events, and normally an `after` tuple `{ tick, hash, phase, eventSequence, publicationSequence, controlRevision }`. The runner compares recorded outcomes/results/events when `after` exists. A faulting frame can lack `after`; omit such an incomplete suffix to verify a completed crash prefix. Authored diagnostic frames without expected outcomes can also execute to produce actual traces. A replay must finish with no pending ledger entries to return a completed checkpoint; a `seal` boundary explicitly rejects/acknowledges pending gameplay when needed.

Actions cover admitted held/semantic messages with binding ownership/receive order, trusted lifecycle controls, ordered control execution, canonical tick input, detach/reassignment, publications, checkpoint sealing and non-payload cursor boundaries. Admission replay calls the same live `drainIngress`/ledger; controls and ticks call the same phase functions and `stepCommands`, without wall time or producers. Rejected valid envelopes (including stale IDs that advance high-water) and duplicate/conflicting outcomes are retained. Malformed pre-admission bytes are excluded.

Callout requests, text and auxiliary producer history are absent. Cursor-only boundaries account for receive/event gaps caused by auxiliary messages, including duplicate requests. Auxiliary high-water starts empty on external restore; no callout or completion event is emitted merely by loading.

## Duration / size bounds

`authority.replay()` exports the current rolling crash window, not full-run capture. Baseline rotation remains every 300 completed ticks; control-only history rotates after 256 applied controls, and an additional 4096-frame threshold is checked at completed pump boundaries. A pump can temporarily exceed that frame threshold by its bounded ingress work. Rotating seals pending future gameplay with delivered rejection results; cached outcomes and per-tick counts are retained in the baseline.

The standalone parser accepts up to 1,000,000 boundary frames, 1024 entries/results in one admission boundary, 256 tick commands and 256 event metadata entries per frame, plus the normal wire/schema limits. A 54,000-tick scenario with one admission and one tick boundary per tick is within the frame cap. There is no 300-tick duration cap on `runReplay`; it discards consumed core journal entries and can stream sampled observations with no retained output trace. The input is still fully validated and detached in memory before execution; it is not a streaming JSON parser. Task 5 owns compact input expansion and cross-browser fixtures.

## Restore and checkpoint decisions

- Checkpoint is a completed boundary operation: validate bot memory before side effects, drain ingress, resolve ordered controls, explicitly reject and send results for pending gameplay, then capture a detached fully validated envelope.
- External restore validates before allocation/live replacement, loads a separate owner, restores paused unless already ended, clears held values while retaining producer high-water, resets auxiliary history, and preserves cached commands and admission counts. It emits no synthetic pause event.
- Fresh-host restore publishes above the stored publication sequence. Same-authority same-run restore uses the maximum live/stored publication, event and control cursors before publishing, preventing an attached client from discarding restored state or replaying old effects.
- Recorded replay restores the checkpoint's exact phase/held state and does not synthesize external-restore pause behavior.
- Bot memory includes row/page/group state, repeats/directions, last decision/tick, sequence ownership and pending-vote fields. Headless exposes `checkpoint()`, `restore(cp)`, `setPaused(bool)` and `replay()`; its restore reinstalls bot memory before publication reconciliation.
- CrashRecord now adds complete `init`, portable `checkpoint`, subsequent `frames`, and `lastPublishedSequence`; legacy crash fields remain for existing diagnostics/tests. Faulting semantic input is retained without claiming a successful outcome.
- Deferred control rejection still precedes terminal completion emission, preserving the existing wire order.

## TDD and validation evidence

1. Initial checkpoint tests: 8/8 red because checkpoint/restore and injectable codec methods were absent. Green after implementation. Replay's first run reported the missing production module; subsequent implementation ran the new semantic boundary cases.
2. Additional integrity/cursor cases: 6 failures (missing high-water cache entry, inconsistent result reason/status, impossible count epoch, inconsistent terminal phase, auxiliary duplicate receive cursor, discontinuous replay ticks). Added validation/cursor accounting; all 18 then passed.
3. Headless bot restore first failed on missing checkpoint API. After implementation, uninterrupted/restored 60-tick continuation matched every hash, UI state and ledger watermarks. Separate periodic and initial bot-baseline tests failed on absent memory, then passed after the callback/default-memory integration.
4. A terminal ordering regression test failed (`result index 4`, completion index 2); restoring the original deferred-result-before-completion ordering made it pass.
5. Coverage includes pending rejection acknowledgments; per-tick cap retention; version/init/cache/player/sequence/bot validation; detached outputs; injected player 15; held reset/fresh sequence; duplicate and conflicting purchase; vote reward and RNG preservation; terminal fresh-host restore; rejected admissions; pause/resume order; auxiliary exclusion/cursors; link reassignment; crash baseline and completed-prefix replay; optional sampled output.
6. Focused regression command:
   `npm test -- tests/checkpointV2.test.ts tests/replayV2.test.ts tests/checkpointBots.test.ts tests/crashRecordV2.test.ts tests/authority.test.ts tests/authorityClock.test.ts tests/authorityRecovery.test.ts tests/authorityEvents.test.ts tests/netLedger.test.ts tests/netCodec.test.ts tests/golden.test.ts tests/netParity.test.ts tests/boundary.test.ts tests/session.test.ts --maxWorkers=2`
   **14 files, 292 tests passed**, 7.06 s. This preceded the final focused ordering/default-bot additions.
7. Latest changed-area checks after those additions: **4 files, 28 tests passed** (checkpoint 17, replay 6, bots 3, crash 2), 1.43 s. Terminal-order fix separately passed **35 tests** across crash/replay/clock/events. `npm run typecheck` passed after the final source changes. `git diff --check` passed.
8. Golden conversion independently compared old HEAD JSON against new v2: canonical initial values identical, all 7200 held/semantic-command inputs identical, every one of 120 expected hashes identical, final **b87a0284**. Golden runner additionally passed the independently captured gameplay projections. Fixture digest provenance was updated separately; test-only header/init rebinding remains explicit for future source-digest changes. No bless command ran; SIM_VERSION stays **35**.

## Remaining scope / limitations

No known failing focused check. Full suite, production/browser build acceptance and 900-second per-ship browser/performance gates remain task 5, as assigned. Historical raw replay conversion is test tooling only. Restore API preserves state/control integrity, but persistence storage, network host migration and UI orchestration are outside this task. Replay is an in-memory, fully validated semantic trace, not an unbounded archival recorder; use the observer/options above for long acceptance scenarios.
