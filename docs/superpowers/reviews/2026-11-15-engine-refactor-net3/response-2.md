# Round 2 response (spec revised)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1, R1-F2, R1-F5, R1-F6 and R1-F8 resolved, and re-raised three with precise gaps, all confirmed. Fixed again; 0 rejected, 0 deferred.

## R1-F3 [P1]: Duel completion has no specified wire record (still open, fixed again)

Confirmed: the sector `TelemetryRecord` has no discriminator (`codec.ts:L80-L100`), and the duel accumulator is mutable state (`duel/telemetry.ts:L36-L55, L68-L75`). Three changes:
- The tag now lives on a wrapper: `EndRecord = { mode: 'sector', record: TelemetryRecord } | { mode: 'duel', record: DuelEndSummary | null }`. The codec validates it as a discriminated union on `mode`.
- `DuelEndSummary` is a frozen value of integers and enums, computed once when the duel ends.
- The live accumulator is mode memory: it is not hashed, it is saved in the duel checkpoint as its own versioned blob, and it is restored with it. The continuation proof also compares end summaries.

## R1-F4 [P1]: The duel snapshot format leaves restore rules undecided (still open, fixed again)

Confirmed: the tactical flatten stores only the asteroid count (`tactical/hash.ts:L15-L16`). The header now has `mapHash`: `hashF64` over the planet, each asteroid's x, y and r in index order, the belt count, the cluster sizes, the gaps and the spawns, computed at creation. Restore regenerates the map from the seed, requires `validateMap` to pass, and requires the recomputed hash to equal the header's.

## R1-F7 [P1]: The unchanged-deps claim omits resolveLayout (still open, fixed again)

Confirmed. `resolveLayout` is now an explicit argument in the signatures of `create`, `restore` and `validateCheckpoint`.

## Also changed

- Change log entry for round 2.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->
