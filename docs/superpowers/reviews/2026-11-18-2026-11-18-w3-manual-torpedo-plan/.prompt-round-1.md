## Role
<!-- reuse -->

The subject is an implementation plan for part W-3 (the manual torpedo: an AUTO/MAN toggle so the Weapons officer can fly the torpedo by hand like a fast second ship) of a TypeScript Electron + Pixi + React game with a deterministic 60 Hz duel sim, networked through a zod-validated codec and an authority. Fresh subagents will execute each task verbatim with only that task's text, so any code block that would not compile against the real branch, any interface that does not exist with the assumed shape, any test that cannot pass, and anything left to "check at execution" is a defect. The sim must stay bit-deterministic and its goldens must be re-blessed correctly. AUTO torpedoes must behave exactly as today.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md` at commit `ab7863fe`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md`, section 3 (W-3) and sections 4 to 7 as they apply to W-3. W-1 and W-2 are already merged.
- The W-2 plan it is modelled on (executed cleanly): `docs/superpowers/plans/2026-11-18-w2-manual-laser.md`.
- The codebase at master `92733195`+ (SIM_VERSION 56): `src/renderer/src/sim/tactical/` (missiles.ts, weapons.ts canLaunch/torpLock, physics.ts, pew.ts, hash.ts, state.ts, tuning.ts), `src/renderer/src/sim/duel/` (step.ts, snapshot.ts, scripted.ts), `src/renderer/src/net/`, `src/renderer/src/authority/` (core.ts, duelCheckpoint.ts, replay.ts, checkpoint.ts held schemas), `src/renderer/src/app/duel/` (input.ts, runtime.ts, onlineDuel.ts, scene.ts, flightPointer.ts, onlineSource.ts), `src/renderer/src/render/tactical/weaponsModel.ts`, `src/renderer/src/ui/duel/WeaponsStation.tsx`, `src/renderer/src/app/controlsList.ts`, `scripts/golden/`, `scripts/determinism/`, `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-18-2026-11-18-w3-manual-torpedo-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. AUTO unchanged: AUTO launch rules, homing and room lock untouched; Task 8's additive duel-oracle proof (ADDITIONS[57]) must really compare every no-manual-torpedo run and not pass vacuously.
6. The bless sequence (Task 1 bump with proofs and the additive baseline, Task 8 same-version bless) against `scripts/golden/blessGuard.ts`, the canonical-trace and duel-oracle scripts and `tests/blessGuard.test.ts`.
7. Determinism and peer consistency: new state (`torpManual`, per-missile `manual`) hashed, cloned, validated; the held `torpTurn`/`torpHeading` added to every strict held schema (net/codec.ts and the authority's duelCheckpoint/replay/checkpoint schemas) and to core.ts's expiry/pause clearing; held input admitted only for the Weapons seat; the held heading kept client-side and re-sent each frame (the sim holds no hold state) is consistent across peers.
8. Input: V toggles (C is the camera, X is Stand: verify V is unbound); F launches in MANUAL without lock or range; A/D steer the torpedo instead of walking while it flies; right-drag sets the held heading from the torpedo marker and suppresses panning during the flight; the camera follows and returns; left click (pew), Z and Space (W-2) untouched.
9. Flight: full thrust while fuelled then coast; steering only while fuelled (the plan's choice: check it is stated and reasonable against spec §3, which says A/D turn it and fuel/life rules are unchanged); collisions including pew shoot-down unchanged; a MANUAL ship hit strikes the room under impact for one level and 3 hull, ignoring the lock; a mid-flight toggle does not change the flying torpedo.

## Reading manifest

- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L1-L128 (header, global constraints, decisions)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L129-L228 (Task 1)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L229-L685 (Task 2)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L686-L1027 (Task 3)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L1028-L1403 (Task 4)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L1404-L1795 (Task 5)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L1796-L2364 (Task 6)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L2365-L2575 (Task 7)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L2576-L2776 (Task 8, gates entry, self-review)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L83-L103 (spec section 3)
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

- The torpedo gets an AUTO/MANUAL toggle; AUTO is unchanged; the mode is fixed at launch.
- A MANUAL torpedo flies like the Helm with the throttle fixed at full: A/D turn it, a right click or drag sets a heading to hold; fuel, life, arming and collisions are unchanged.
- A MANUAL torpedo needs no lock and ignores the 360 launch range; on a ship it strikes the room under impact (one level, 3 hull).
- The Hunter stays AUTO.

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
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a test that cannot pass), a rule is ambiguous in a way two implementers would build differently, a spec requirement is missing, AUTO torpedo behaviour would change, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
