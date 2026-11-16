# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan and the code. 7 accepted (1 P1, 3 P2, 3 P3), 0 rejected, 0 deferred.

## R1-F1 [P1]: The continuation proof's precondition becomes always true after Task 3

Confirmed. The pool never holds null, so `missiles.some((m) => m !== null)` always passes. Task 3 now replaces it with `m.active`, and `tests/duelCheckpoint.test.ts` is in Task 3's Modify list and `git add` line. A grep of `src/` and `tests/` found no other null or `?.` checks on the pool that the codemod misses.

## R1-F2 [P2]: No test pins owner-order resolution when pool entries are out of order

Confirmed. Two new `tests/tacticalSlots.test.ts` cases launch ship 1 first, so the entries are out of owner order:
- Two missiles expire on the same tick; the events must be `[[0,'expired'],[1,'expired']]`.
- Two touching missiles must end `[[0,'missile'],[1,'missile']]`, with both entries freed.

Bite check: with `resolveMissiles` temporarily switched to entry order, both tests fail.

## R1-F3 [P2]: The duel snapshot validator does not pin slot identity

Confirmed. `validateDuelSnapshot` now checks, by field name, that `ships.length` is 2, both slots are active, `cls` equals `DUEL_CLASSES[i]` and `target` equals `1 − i`. Five rehashed cases are rejected with `duel slot identity`, including slot 1 inactive and zeroed with the pool emptied. The generic validator accepts that state, so only the new check rejects it. This is Decision 16.

## R1-F4 [P2]: Presence and two-ship telemetry stay pairs without a stated deviation

Accepted. The new Decision 15 keeps presence per player (`[b, b]`) and keeps `DuelTelemetry` as a crew-and-enemy record until R-5 gives encounters N ships. It lists the sites (`telemetry.ts` L93/96/107/111/153, `summary.ts`, the checkpoint's `two()` schemas, `fxModel` L74, `weaponsModel` L63) and notes the deviation from spec §5 L105-108.

## R1-F5 [P3]: Body-only comparisons in tacticalSoloFlight

Fixed: the three comparisons now also compare the systems record.

## R1-F6 [P3]: The oracle never checks the declared-added fields' values

Fixed: a new test asserts that `ships.length`, `active`, `cls` and `target` hold `2,1,1,0,1,1,0` at every one of the duel golden's 15,772 ticks.

## R1-F7 [P3]: The codemod's import sort depends on the locale

Fixed: the sort uses `localeCompare(…, 'en')`. The output is unchanged, so the later exact texts still match.

## Also changed

- Re-verified by re-extracting the plan into a fresh worktree at master c7d2495 and running every step as written:
  - the oracle (20 runs, 205,178 ticks, 304 fields) is identical per tick through the 37 → 38 alias table, and the sector trace differs only in its version;
  - all 62 gate telemetry lines are identical;
  - the full suite passes 3,163 tests, with only the known worktree flake failing;
  - determinism passes on Node, Electron and Firefox;
  - the blessed duel golden is unchanged from the prototype (`2ac35cfa`).

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r2-n-ship-space.md

<!-- end -->
