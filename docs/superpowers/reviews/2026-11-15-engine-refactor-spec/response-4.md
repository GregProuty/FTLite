# Round 4 response (spec revised)

Reviewed `round-4.json`. 1 accepted, 0 rejected, 0 deferred. Codex confirmed R3-F1 resolved.

## R4-F1 [P1]: The projected missile pool has no occupancy encoding

Confirmed (`tactical/state.ts:L33-L34`, `tactical/hash.ts:L7-L12`). Each missile-pool slot now carries an `active` flag, and an empty slot is `active = 0` with every field 0. This holds in both the canonical layout (§3) and the projected space partition (§10).

## Also changed

- Change log entry for round 4.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->
