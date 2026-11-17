## Role
<!-- reuse -->

A design spec for a presentation-only change to FTLite (Electron + PixiJS 8 + TypeScript, an FTL-like co-op game): the tactical map's ship silhouettes become the Hound's traced outline (crew) and an original drone scout (enemy), replacing a three-segment wedge, with damage hatching and the lock marker per room. It will become an implementation plan that fresh subagents execute task by task, so the spec must be unambiguous, consistent with the existing CRT map rules, and its geometry constraints must actually hold for the coordinates it gives.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md` at commit `9c9e5a5`, worktree `C:\Users\djuar\FTLite\.worktrees\hull-silhouettes`, branch `hull-silhouettes`.
- The CRT map spec it must stay consistent with: `docs/superpowers/specs/2026-11-17-crt-map-design.md` (section 2: friend/foe, damage, hatch, blinks; section 1: presentation only).
- `src/renderer/src/render/tactical/` (tacticalModel.ts, tacticalLayer.ts, weaponsModel.ts, dashModel.ts, crtTheme.ts) and the tests that use the wedge (`tests/tacticalModel.test.ts`, `tests/dashModel.test.ts`, `tests/duelWeaponsView.test.ts`, `tests/crtColours.test.ts`).
- The run dir `docs/superpowers/reviews/2026-11-17-hull-silhouettes-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. Check every geometry constraint in section 1 against the actual coordinates (convexity of each room, rooms inside the outline, max vertex radius, outline simple). Compute them; do not eyeball.
8. The Hound's side sign: the painting's nose points to screen +x, and the spec maps painting y to ship s (right). Confirm this matches how tacticalLayer maps (f, s) to the screen (fx, fy, rx, ry), so the silhouette is not mirrored.
9. Every consumer of wedgeSegments, WEDGE_*, segmentCentre and ShipDraw (src and tests) is accounted for.
10. The lock label offset, the enemy ring at 1.35 and the shield rings at 1.6+ against the new hull extents (the Hound is wider than the wedge).

## Reading manifest

- docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md:L1-L95 (the subject)
- docs/superpowers/specs/2026-11-17-crt-map-design.md:L22-L56 (CRT roles, friend/foe, damage, hatch)
- src/renderer/src/render/tactical/tacticalModel.ts:L15-L60 (ShipDraw, chevron constants), L250-L262 (ships), L300-L313 (wedge)
- src/renderer/src/render/tactical/tacticalLayer.ts:L1-L40 (imports, ENEMY_RING), L100-L140 (drawShip), L200-L215
- src/renderer/src/render/tactical/weaponsModel.ts:L40-L80 (segmentCentre, lock)
- src/renderer/src/render/tactical/dashModel.ts:L1-L78 (isConvex, hatchSegments)
- tests/tacticalModel.test.ts:L70-L80, L165-L175; tests/dashModel.test.ts:L38-L48; tests/duelWeaponsView.test.ts:L100-L115; tests/crtColours.test.ts:L10-L30

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, and small `python -c` / `node -e` computations on the spec coordinates are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The crew's ship is the Hound, traced from the bought 2-Minute Tabletop painting; only coordinates enter git.
- The enemy is an ORIGINAL drone scout, not FTL's Auto-Scout or any copy of it.
- Presentation only: no sim, SIM_VERSION, golden or SHIP_RADIUS change; the chevron below 10 px stays.
- The CRT map's colour roles, blinks and hatch rules stay as they are.

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

- **P0**: the change would touch the sim or determinism, or the spec cannot be built as a whole.
- **P1**: a stated geometry constraint fails for the given coordinates, a requirement two implementers would build differently, an interface or consumer the spec misses (a caller of the wedge left broken), or friend/foe/damage/lock readability lost in ordinary play.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
