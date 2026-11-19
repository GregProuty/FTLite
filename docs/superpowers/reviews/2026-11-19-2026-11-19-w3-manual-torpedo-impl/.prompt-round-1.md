## Role
<!-- reuse -->

The subject is the implementation of part W-3 (the manual torpedo: an AUTO/MAN toggle so the Weapons officer can fly the torpedo by hand like a fast second ship) of FTLite, a TypeScript Electron + Pixi + React game with a deterministic 60 Hz duel sim networked through a zod codec and an authority. It will be merged into master and played by two to four humans over the network, so any desync between peers, any non-deterministic sim arithmetic, any change to AUTO torpedo behaviour, any input that fires when it should not (or fails to fire), or any behaviour that contradicts the spec is a defect. Tests, typecheck and an additive oracle proof (every run with no manual torpedo identical tick for tick) pass; your job is to find what they miss.

## What to review

- THE SUBJECT (impl): `e8e37cc4...HEAD` at commit `c666bd15`, worktree `C:/Users/djuar/FTLite/.worktrees/w3-manual-torpedo`, branch `w3-manual-torpedo`.
- The spec: `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md` section 3 (W-3) and sections 4 to 7 as they apply.
- The plan: `docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md` (Global Constraints and Decisions L11-L128).
- A prepared diff without the regenerated golden JSON: `.superpowers/sdd/w3-impl-review.diff` (commit list, stat, full diff with 10 lines of context). Read it by range.
- The run dir `docs/superpowers/reviews/2026-11-19-2026-11-19-w3-manual-torpedo-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (the implementer reports `npx tsc -b` clean; do not run it unless a finding needs it).
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. AUTO unchanged: canLaunch, the torpLock auto-launch, homing (homingTurn/flyMissile) and the room lock behave exactly as before for AUTO torpedoes; the extracted `holdTurn` is exactly the old Hunter `headingTurn`; the additive oracle proof (scripts/golden/duelOracle.ts ADDITIONS[57]) really compares every no-manual-torpedo run and cannot pass vacuously.
7. Determinism and peer consistency: `torpManual` and per-missile `manual` hashed, cloned, validated (crew only); `torpTurn`/`torpHeading` in every strict held schema (net/codec.ts, authority duelCheckpoint/replay/checkpoint) and in authority/core.ts expiry and pause clearing; held steering admitted only for the attended Weapons seat; the held heading kept client-side and re-sent each frame is consistent between Single player and online; online launch always sent with `torpSent` mapping 'unavailable' to a sensible refusal (never OUT OF RANGE in MANUAL), separate from `pewSent` and `laserSent`.
8. Input: V toggles only at the Weapons seat (C camera and X Stand untouched); F launches in MANUAL without lock or range; A/D steer instead of walking only while a MANUAL torpedo flies and return to normal after; right-drag sets the held heading from the torpedo marker, gated by lastAimed/no pick-up/onWeaponsMap, and suppresses panning only during the flight; the camera follows and returns on every flight end; the TORPEDO card tag takes its own pointer events; STEER A/D / FLYING / COASTING match the sim's steering window; the lock tone is off in MANUAL; the W-1 pew and W-2 laser inputs are untouched.
9. Flight: full thrust while fuelled then coast; turning only while fuelled and past the boost; collisions and pew shoot-down unchanged; a MANUAL ship hit strikes the room under impact (one level, 3 hull) ignoring the lock; the rock-broke launch skip only for AUTO; a mid-flight toggle does not change the flying torpedo.

## Reading manifest

- .superpowers/sdd/w3-impl-review.diff:L1-L90 (commit list and stat)
- .superpowers/sdd/w3-impl-review.diff:L90-L3436 (the diff; sim first: missiles.ts, manualTorpedo.ts, weapons.ts, hunter.ts, state.ts, hash.ts, step.ts, duel.ts, then net/, authority/, scripts/golden/duelOracle.ts, then app/duel/, render/, ui/)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L83-L103 (spec section 3)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L104-L190 (spec sections 4 to 7)
- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md:L11-L128 (global constraints and decisions)

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
- The Hunter stays AUTO. The toggle key is V (C is the camera, X is Stand).

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
- **P1**: a spec behaviour missing or wrong, AUTO torpedo behaviour changed, an input that fires when it must not (or fails to fire) in ordinary play, a snapshot or validation hole, or a regression in an existing seat or weapon.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
