## Role
<!-- reuse -->

The subject is the implementation of part W-2 (the manual laser: an AUTO/MAN toggle so the Weapons officer can aim and fire the laser by hand) of FTLite, a TypeScript Electron + Pixi + React game with a deterministic 60 Hz duel sim networked through a zod codec and an authority. It will be merged into master and played by two to four humans over the network, so any desync between peers, any non-deterministic sim arithmetic, any change to AUTO behaviour, any input that fires when it should not (or fails to fire), or any behaviour that contradicts the spec is a defect. Tests, typecheck and an additive oracle proof (every AUTO run identical tick for tick) pass; your job is to find what they miss.

## What to review

- THE SUBJECT (impl): `fb8c092f...HEAD` at commit `13344bba`, worktree `C:/Users/djuar/FTLite/.worktrees/w2-manual-laser`, branch `w2-manual-laser`.
- The spec: `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md` section 2 (W-2) and sections 4 to 7 as they apply.
- The plan: `docs/superpowers/plans/2026-11-18-w2-manual-laser.md` (Global Constraints and Decisions L11-L48).
- A prepared diff without the regenerated golden JSON: `.superpowers/sdd/w2-impl-review.diff` (commit list, stat, full diff with 10 lines of context). Read it by range.
- The run dir `docs/superpowers/reviews/2026-11-18-2026-11-18-w2-manual-laser-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (the implementer reports `npx tsc -b` clean; do not run it unless a finding needs it).
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. AUTO unchanged: the shared `laserStrike` refactor, the `!laserManual` gates on the auto-fire and charge-press paths, Space in AUTO, and the additive oracle proof (scripts/golden/duelOracle.ts ADDITIONS[56]) — is the proof sound (does it really compare every AUTO run, and could it pass vacuously)?
7. Determinism and peer consistency: new sim state (`laserManual`, `laserAim`) hashed, cloned, validated; `laserMode` mutating state during admission is identical on every peer; aims are integers; online always-send with `laserSent` mapping 'unavailable' to NO CHARGE, separate from W-1's `pewSent`.
8. Input: Z toggles only at the Weapons seat; Space in MANUAL fires along the tracked map aim (last aim, then the heading, when the pointer is off the open map); the aim resets per round; the AUTO/MAN tag takes its own pointer events and never fires the pew; the dashed aim line matches the sim's clamp.
9. The beam: rocks and the planet stop it (a rock takes master's laser-on-rock effect), torpedoes do not, the room under the hit point is struck, bursts keep their aim, `laserFrozen` applies.

## Reading manifest

- .superpowers/sdd/w2-impl-review.diff:L1-L80 (commit list and stat)
- .superpowers/sdd/w2-impl-review.diff:L80-L2824 (the diff; sim first: weapons.ts, state.ts, hash.ts, step.ts, then net/, scripts/golden/duelOracle.ts, then app/duel/, render/, ui/)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L64-L82 (spec section 2)
- docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md:L104-L190 (spec sections 4 to 7)
- docs/superpowers/plans/2026-11-18-w2-manual-laser.md:L11-L48 (global constraints and decisions)

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
- W-3 (manual torpedo) is a later part.

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
- **P1**: a spec behaviour missing or wrong, AUTO behaviour changed, an input that fires when it must not (or fails to fire) in ordinary play, a snapshot or validation hole, or a regression in an existing seat or weapon.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
