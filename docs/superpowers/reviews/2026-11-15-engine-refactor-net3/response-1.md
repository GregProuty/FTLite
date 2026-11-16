# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `cdbb842` and the merged code. 8 accepted (2 P0, 5 P1, 1 P2), 0 rejected, 0 deferred. Each claim was checked at the cited lines and held.

## R1-F1 [P0]: The mode factory omits a required checkpoint method

Confirmed (`contracts.ts:L8-L16`; `hostRuntime.ts:L65-L71` calls it). The factory lifecycle now lists the synchronous `checkpoint(): Uint8Array`. It encodes the current checkpoint immediately and throws if the result would exceed `MAX_HOST_BYTES`. The async `captureCheckpoint` stays as the safe-point capture used for uploads.

## R1-F2 [P0]: EncounterRules cannot supply the duel tick to the generic core

Confirmed: the core reads `state.tick` (`core.ts:133-138, 261-268, 426-429`), and `DuelState` has no top-level tick. `EncounterRules` gains `tick(state)`. For the duel it returns `interior.tick`. `stepDuelTick` advances the interior and tactical ticks together, and restore rejects a snapshot where they differ.

## R1-F3 [P1]: Duel completion has no specified wire record

Confirmed (`contracts.ts:81-87`, `codec.ts:80-100`). The `ended` event becomes mode-tagged: `{ mode, record: EndRecord | null }`, where `EndRecord` is a codec-validated discriminated union. The sector `TelemetryRecord` is unchanged. The duel record is the duel telemetry summary. A mode with nothing to report sends `record: null`, which the codec accepts.

## R1-F4 [P1]: The duel snapshot format leaves restore rules undecided

Confirmed. The duel snapshot is now specified:
- **Header:** format, sim version, digest, layout and seed.
- **Stored:** the interior through the sector snapshot path; the tactical state in `flattenTactical` order, including the hunter and the tactical random-number state; presence and repair.
- **Regenerated:** the map from the seed (it must validate, and its hash must match), the grid, the repair points and `Derived`.
- **Excluded:** the per-tick events.
- **Validation on restore:** versions, value count, equal ticks, and the duel hash.
- **Continuation proof:** N ticks, checkpoint, restore, M ticks, with identical per-tick hashes to an uninterrupted N + M run.
- **Size test:** at the duel's largest state, under 256 KiB.

## R1-F5 [P1]: The generic replay contract is unspecified

Confirmed (`authority/replay.ts:29-33, 44-64, 77-81`; `sim/replay.ts:25-30`). Replays now record a `mode`; absent means `sector`, so existing V2/V3/V4 files parse unchanged. The parser and runner use the mode's rules and validators. R-1's acceptance adds the existing sector replay tests passing unchanged, and a duel replay re-running to the same final hash.

## R1-F6 [P1]: The R-1 history ring has no bound or proof

Confirmed. The ring moves out of R-1 into R-8, with the flight recorder; R-1 only keeps segment rotation intact. Its bounds:
- the newest 6 segments and at most 4 MiB, oldest evicted first;
- a single segment over 1 MiB is skipped and counted;
- host-side file export only, never over the IPC crash channel;
- a test exceeding each bound.

## R1-F7 [P1]: The unchanged-deps claim omits resolveLayout

Confirmed (`authority/authority.ts:24-33, 56-61, 74-79`). `resolveLayout` is now in the retained deps, and it is passed to the rules' `create`, `restore` and `validateCheckpoint`. The duel resolves the Cutter through it.

## R1-F8 [P2]: Risk 3 understates deferred projection changes

Confirmed. Risk 3 now names everything R-6 needs: new metadata, a client acceptance path, `emit` filtering and a re-host checkpoint policy. All of it stays unbuilt while PvP is out of scope.

## Also changed

- R-1 and R-8 milestone rows; change log entry.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->
