# Round 1 response (implementation revised, f6db019)

Reviewed `round-1.json` against the code. 4 accepted (2 P2, 2 P3), 0 rejected, 1 deferred (P3).

## R1-F1 [P2]: Missile members are outside the completeness guard

Confirmed. `MISSILE_KEYS` was hand-listed, and the completeness walk only saw null missile slots. The fix:
- `MISSILE_KEYS` is exported and declared `satisfies readonly (keyof Missile)[]`. A compile-time `Exclude<keyof Missile, …>` must-be-`never` const fails typecheck if a key is missing.
- `tests/duelModules.test.ts` now walks seed 7 at tick 5,156, which has a missile in flight, against `MISSILE_KEYS`. It also asserts permanently that a planted extra member is reported (`0.newMissileThing`).

## R1-F2 [P2]: Nothing checks duelEndSummary's field mapping

Confirmed. The fix:
- The continuation proof asserts the plan's exact seed-7 summary (Decision 14) instead of `expect.any`.
- The new `tests/duelSummary.test.ts` runs distinct per-ship and per-player numbers through every `duelEndSummary` field and checks `Object.isFrozen` on the nested arrays.
- Bite check: swapping the ship index in `laserReleases` fails the test.

## R1-F3 [P3]: The duel EndRecord is narrowed to never-null; cause enum duplicated

Accepted, keeping never-null. The earlier fix wave verified that an ended duel always carries a summary: `session()` on create and restore, and `step`. The refinement is now recorded in the plan's Decision 7 and the spec's change log, including that the codec rejects null. `codec.ts` imports `TERMINAL_CAUSES` from `sim/duel/summary.ts`, now `as const satisfies readonly TerminalCause[]`, instead of re-declaring it.

## R1-F4 [P3]: Stale test reference in the ModeWire doc comment

Fixed: the comment now names `tests/codecModeWire.test.ts`.

## R1-F5 [P3]: Each duel publication rebuilds the map and grid

Deferred. This is performance only and changes no behaviour. Before H-2 streams duels, cache the regenerated tactical shape and its `mapHash` per seed, and the interior field list per layout and player count.

## Also changed

- (nothing)

Verified:
- `npm run typecheck`;
- 218 tests in the 8 touched test files;
- canonical-trace and authority-trace `same`, both unchanged;
- the full verify (typecheck, build, `npm test`): 3,143 of 3,144 pass. The one failure is the known worktree-only `tests/onlineAppRuntime.test.ts` flake.

## Files changed

- src/renderer/src/sim/tactical/hash.ts
- src/renderer/src/sim/duel/summary.ts
- src/renderer/src/authority/duelCheckpoint.ts
- src/renderer/src/net/codec.ts
- tests/duelModules.test.ts
- tests/duelCheckpoint.test.ts
- tests/duelSummary.test.ts
- docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md
- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->
