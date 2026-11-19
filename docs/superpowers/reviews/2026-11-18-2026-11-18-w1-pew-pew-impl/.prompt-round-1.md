## Role
<!-- reuse -->

The subject is the implementation of part W-1 (the "pew pew" skill-shot primary weapon) of FTLite, a TypeScript Electron + Pixi + React game with a deterministic 60 Hz duel sim networked through a zod codec and an authority. It will be merged into master and played by two to four humans over the network, so any desync between peers, any non-deterministic sim arithmetic, any input that fires when it should not (or fails to fire), or any behaviour that contradicts the spec is a defect. Tests and typecheck pass; your job is to find what they miss.

## What to review

- THE SUBJECT (impl): `87022f00...HEAD` at commit `f4e9f437`, worktree `C:/Users/djuar/FTLite/.worktrees/w1-pew-pew`, branch `w1-pew-pew`.
- The spec: `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md` sections 1, 4, 5, 6, 7 (W-1 only; sections 2 and 3 are later parts).
- The plan: `docs/superpowers/plans/2026-11-18-w1-pew-pew.md` (Global Constraints L11-L40, Decisions L26-L42).
- A prepared diff without the regenerated golden JSON and manifest: `.superpowers/sdd/w1-impl-review.diff` (commit list, stat, full diff with 10 lines of context). Read it by range.
- The run dir `docs/superpowers/reviews/2026-11-18-2026-11-18-w1-pew-pew-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (the implementer reports `npx tsc -b` clean; do not run it unless a finding needs it).
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. Determinism and peer consistency: sim code (`src/renderer/src/sim/**`) uses only + - * / and sqrt, heading tables, and `nextInt` on the seeded state; all new state (pew charge, burst, clock, the round pool) is hashed, cloned and bounded in snapshot validation; a `pewFire` command is admitted identically on every peer; online replicas (onlineSource gap events) cannot diverge the sim.
7. Controller-authorised deviations from the plan made during tuning (Task 6), which you should check for soundness, not reverse: a Hunter-only pew def `HUNTER_PEW` with `HUNTER_PEW_RECHARGE_TICKS = 120`; duel hulls scaled ×1.75 (SHIP_HULL 40→70, HUNTER_HULL 70→123, VALKYRN_HULL 30→53) and `HULL_PER_SEGMENT = SHIP_HULL / 20`; HUNTER_PEW_ERROR 4→8, HUNTER_PEW_GAP 12→20, HUNTER_PD_CHANCE 0.5→0.3. Check that the hull change touches no sector (non-duel) code and that every HUD or readout that shows hull still reads right.
8. Input: a left click fires the pew only on the open Weapons map (onWeaponsMap blocks the tab strip, side column, status table, Weapons block including the new PEW row, and the open contact window); with a weapon card picked up it keeps its old meaning; Helm, Science and the Flight seat are unchanged; the aim sent is the bearing from the drawn own-ship marker, split into aim and aimAcc identically in Single player and online.
9. Known open minors from task reviews (triage whether any must be fixed before merge): pewCone draws with PEW_HALF while the clamp uses pewDef.arcSteps; clicks over console blocks fall through to contact.click; no online `play` path test for the pew; enemy pewFire gain and the non-crew pewHit sound branch untested.

## Reading manifest

- .superpowers/sdd/w1-impl-review.diff:L1-L120 (commit list and stat)
- .superpowers/sdd/w1-impl-review.diff:L120-L4936 (the diff; read the sim files first: pew.ts, weapons.ts, hunter.ts, hash.ts, step.ts, duel.ts, defs.ts, tuning.ts, then net/, then app/duel/, render/, ui/, audio/)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L1-L63 (spec section 1)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L104-L190 (spec sections 4 to 7)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L11-L42 (global constraints and decisions)
- tests/helpers/determinismGuard.ts (the sim arithmetic rules)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Reading with Read/Grep/Glob is fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Pew pew is manual only; aim is held inside a ±60° cone about the ship's heading.
- 3 shots, one third per recharge period, partial kept, NO CHARGE refusal when empty.
- Rounds stop on rocks with no effect (destructible asteroids are a later demo).
- Pew pew never damages rooms; shields up strips one layer, else 1 hull.
- Rounds shoot down the other ship's torpedo; never hit their own ship or own torpedo.
- The Hunter gets pew pew for attack and point defence; the crew must still win the duel gates.
- Cutter and Hunter only; the Valkyrn ships keep the minigun.
- W-2 (manual laser) and W-3 (manual torpedo) are later parts.

## Output format (strict)
<!-- reuse -->

Your final message is validated against a JSON Schema; it must be a single JSON object and nothing else:

```
{ "verdict":      "changes requested" | "ready with P2s" | "ready",
  "findings":     [ { "severity": "P0"|"P1"|"P2"|"P3", "title": "<one line>",
                      "claim": "<what is wrong>", "evidence": "<subject L<n>, file:L<n>>",
                      "why": "<why it matters>", "fix": "<concrete fix>" } ],
  "prior":        [ { "id": "R<N>-F<k>", "result": "resolved" | "withdrawn" | "still open",
                      "note": "<for still open: what is still wrong, with new evidence>" } ],
  "verified":     [ "<what you checked and found correct, with citations>" ],
  "not_verified": [ "<what you could not verify and why>" ] }
```

Findings ordered by severity then importance. Do not invent IDs; new findings have no ID (the responder assigns `R<N>-F<k>` in array order). `prior` lists exactly the awaited IDs given to you, once each, and nothing else. In round 1 `prior` is empty.

## Severities
<!-- reuse -->

- **P0**: a desync between peers, non-deterministic sim arithmetic, a crash, or the weapon unusable.
- **P1**: a spec behaviour missing or wrong, an input that fires when it must not (or fails to fire) in ordinary play, a snapshot or validation hole, or a regression in an existing seat or weapon.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
