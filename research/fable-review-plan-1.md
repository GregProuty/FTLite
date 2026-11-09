# Fable review of the increment 0-1 plan (2026-11-09)

Method: every code block of the plan was extracted into a scratch project, the prose-only edits applied, the pinned dependencies installed, then `tsc -b`, `npm run bless` (twice), `vitest run` and `electron-vite build` were run. Result: typecheck exit 0; bless byte-identical twice; build OK; 136/138 tests passed. All findings below have been applied to the plan.

## High
1. `tests/boundary.test.ts` regex `/\bwindow\b/` matched the comment "window minimum content size" in `src/shared/resolution.ts`, failing from Task 5 onward. Fixed: comment reworded.

## Medium
2. `REACH = 1.5` to the nearest tile point let crew repair fires through a 1-thick wall from the corridor; over seeds 1-20, 54-100% of fire-repair ticks happened outside the burning room, so the survival gate passed without the bots entering fires. Fixed: fire target is the crew member's own room only; gate adds an in-room check.
3. Fire test asserted exactly one burning room after 2000 steps; spread through the closed door made this fail for 9/30 seeds. Fixed: assertion loosened.
4. Stub test asserted `activeHazardCount <= SPAWN_CAP` after 300 s, which fire spread violates (10/30 seeds). Fixed: direct spawner test.
5. `session.ts` kept drawing and building the HUD from a corrupt state in the error phase, outside the try/catch. Fixed: skipped in the error phase; test added.

## Low
6. mulberry32 seed-0 literal was wrong; correct value 1144304738. Fixed.
7. `syncCache` destroy callback leaked `prev` entries (`prev.delete(0)`). Fixed: destroy receives the id.
8. Bookkeeping: Task 8 did not list `state.ts` as modified; Task 4's `Derived` interface lacked `idHash`; Task 17 test count. Fixed.
9. Spec items not implemented and not called out: `defaultOpen` / `"space"` edges (documented as dropped), bitECS spike size/time measurement (added), remappable bindings (deferred, acknowledged).

Nothing found: compile errors, interface mismatches, breaking circular imports, determinism problems. Breach, sealed-vs-closed, survival gate (seeds 1-20) and fire-spread statistics all pass with the given tuning.
