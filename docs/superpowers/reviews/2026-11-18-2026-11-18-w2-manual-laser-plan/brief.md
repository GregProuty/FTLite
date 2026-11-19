## Role
<!-- reuse -->

The subject is an implementation plan for part W-2 (the manual laser: an AUTO/MAN toggle so the Weapons officer can aim and fire the laser by hand) of a TypeScript Electron + Pixi + React game with a deterministic 60 Hz duel sim, networked through a zod-validated codec and an authority. Fresh subagents will execute each task verbatim with only that task's text, so any code block that would not compile against the real branch, any interface that does not exist with the assumed shape, any test that cannot pass, and anything left to "check at execution" is a defect. The sim must stay bit-deterministic and its goldens must be re-blessed correctly. AUTO mode must behave exactly as today.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-w2-manual-laser.md` at commit `ad481588`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md`, section 2 (W-2) and sections 4 to 7 as they apply to W-2. Section 3 (W-3) is out of scope; W-1 (section 1) is already merged.
- The W-1 plan it is modelled on (executed successfully): `docs/superpowers/plans/2026-11-18-w1-pew-pew.md`.
- The codebase at master `f998f353`+ (SIM_VERSION 55): `src/renderer/src/sim/tactical/` (weapons.ts laser code, pew.ts aim helpers, missiles.ts room-under-point, the asteroids-ii rock pool, hash.ts, defs.ts, tuning.ts), `src/renderer/src/sim/duel/` (step.ts, snapshot.ts, scripted.ts), `src/renderer/src/net/`, `src/renderer/src/authority/`, `src/renderer/src/app/duel/` (input.ts, runtime.ts, onlineDuel.ts, scene.ts, flightPointer.ts, onlineSource.ts), `src/renderer/src/render/tactical/weaponsModel.ts`, `src/renderer/src/ui/duel/WeaponsStation.tsx`, `src/renderer/src/app/controlsList.ts`, `scripts/golden/`, `scripts/determinism/`, `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-18-2026-11-18-w2-manual-laser-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. AUTO unchanged: Task 3 refactors the shot into a shared `laserStrike` used by AUTO too, and Task 8 relies on an additive duel-oracle proof that every AUTO run is unchanged tick for tick. Check the refactor really is behaviour-preserving and that the proof mode exists or is fully specified.
6. The bless sequence (Task 1 bump with proofs, Task 8 same-version bless) against `scripts/golden/blessGuard.ts`, the canonical-trace and duel-oracle scripts, and `tests/blessGuard.test.ts`.
7. Determinism: new sim code uses only + - * / and sqrt, heading tables, no trig; the aim clamp in fine heading space; new state hashed, cloned, validated; `laserFire` admitted identically on every peer; the online always-send rule with 'unavailable' mapped to NO CHARGE.
8. Input: Space in MANUAL fires along the pointer aim (last aim, or the heading, when the pointer is off the open map); Space in AUTO keeps today's meaning; Z toggles; Z must not collide with an existing binding; left click (the pew) and the contact window behaviour from W-1 are untouched.
9. The beam's rock behaviour: the plan should apply master's current laser-on-rock effect (asteroids-ii chips rocks) and say so.

## Reading manifest

- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L1-L48 (header, global constraints, decisions)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L49-L135 (Task 1)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L136-L489 (Task 2)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L490-L845 (Task 3)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L846-L1123 (Task 4)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L1124-L1465 (Task 5)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L1466-L1862 (Task 6)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L1863-L2055 (Task 7)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L2056-L2183 (Task 8, gates entry, self-review)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L64-L82 (spec section 2)
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

- The laser gets an AUTO/MANUAL toggle; AUTO is unchanged; MANUAL aims inside the laser's ±60° cone and fires on command.
- The manual beam is an instant hit to 450, damages the room under its hit point with today's shield/room/hull effects, and does not hit torpedoes.
- The laser stays frozen while the own torpedo flies, in both modes.
- The Hunter stays AUTO.
- W-3 (manual torpedo) is a later part, not in this plan.

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
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a test that cannot pass), a rule is ambiguous in a way two implementers would build differently, a spec requirement is missing, AUTO behaviour would change, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
