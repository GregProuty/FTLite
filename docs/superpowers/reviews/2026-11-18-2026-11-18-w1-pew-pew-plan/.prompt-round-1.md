## Role
<!-- reuse -->

The subject is an implementation plan for part W-1 (the "pew pew" skill-shot weapon) of a TypeScript Electron + Pixi + React game with a deterministic 60 Hz duel sim, networked through a zod-validated codec and an authority. Fresh subagents will execute each task verbatim with only that task's text, so any code block that would not compile against the real branch, any interface that does not exist with the assumed shape, any test that cannot pass, and anything left to "check at execution" is a defect. The sim must stay bit-deterministic (Node, Electron and Firefox) and its goldens must be re-blessed correctly.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-w1-pew-pew.md` at commit `932bf1ce`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md`, sections 1, 4, 5, 6 and 7 (W-1 only; sections 2 and 3 are later parts and out of scope).
- The codebase: `src/renderer/src/sim/tactical/` (defs, tuning, weapons, missiles, gun, hunter, state, duel, geometry, hash), `src/renderer/src/sim/duel/` (step, snapshot), `src/renderer/src/sim/snapshotValidation.ts`, `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts`, `src/renderer/src/authority/`, `src/renderer/src/app/duel/` (input, runtime, onlineDuel, scene, duelAudio), `src/renderer/src/app/controlsList.ts`, `src/renderer/src/render/tactical/`, `src/renderer/src/render/duel/consoleModel.ts`, `src/renderer/src/ui/duel/WeaponsStation.tsx`, `src/renderer/src/audio/soundBank.ts`, `scripts/determinism/`, `scripts/bless-golden.ts`, `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-18-2026-11-18-w1-pew-pew-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. Determinism: every new sim computation uses only + - * / and sqrt, heading tables and the seeded RNG (check the determinism guard's real rules); all new state is hashed, cloned and validated in snapshots; the aim clamp is done in heading-index space.
6. The bless sequence (Task 1 bump-only bless, Task 10 same-version gameplay bless): check against `scripts/bless-golden.ts`, `tests/blessGuard.test.ts` and the determinism fixture scripts that it is actually allowed and leaves every golden consistent, and that tests failing "by design" between Task 2 and Task 10 do not block per-task verification by subagents.
7. Left click at the Weapons seat now always fires the pew; the plan moves opening the contact window to T and the weapon cards. Check nothing else at Weapons depended on the map left click (room targeting via the contact window must still work) and that Helm, Science and the Flight seat are unaffected.
8. The Hunter AI (Task 5): seeded RNG draws per tick must not change the RNG stream in ways that silently break other seeded behaviour; check where the draws happen. Tuning in Task 6 must have concrete knobs and a concrete stop rule.
9. The sound: Task 9 reassigns `laserSmall_003/_004` from the crew laser to `sfx.pew`; check the manifest and credits regeneration path really works that way.

## Reading manifest

- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L1-L42 (header, global constraints, decisions)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L43-L116 (Task 1)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L117-L780 (Task 2)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L781-L1101 (Task 3)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L1102-L1303 (Task 4)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L1304-L1568 (Task 5)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L1569-L1754 (Task 6)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L1755-L2020 (Task 7)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L2021-L2358 (Task 8)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L2359-L2617 (Task 9)
- docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L2618-L2698 (Task 10 and self-review)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L1-L63 (spec section 1, pew pew)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L104-L190 (spec sections 4 to 7)
- Source files named in each task's **Files:** block, read by the ranges the task touches.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Reading with Read/Grep/Glob is fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Pew pew is manual only (no auto mode); aim is held inside a ±60° cone about the ship's heading.
- 3 shots, one third per 60 ticks, partial kept, NO CHARGE refusal when empty.
- Rounds stop on rocks with no effect (destructible asteroids are a later demo).
- Pew pew never damages rooms; shields up strips one layer, else 1 hull.
- Rounds shoot down the other ship's torpedo; never hit their own ship or own torpedo.
- The Hunter gets pew pew for attack and point defence; the crew must still win the duel gates.
- Cutter and Hunter only; the Valkyrn ships keep the minigun.
- W-2 (manual laser) and W-3 (manual torpedo) are later parts, not in this plan.

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

- **P0**: the plan is unexecutable as a whole, or it would break determinism or ship a desync between peers.
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a test that cannot pass), a rule is ambiguous in a way two implementers would build differently, a spec requirement is missing, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
