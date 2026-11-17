## Role
<!-- reuse -->

An implementation plan for a presentation-only change to FTLite (Electron + PixiJS 8 + TypeScript, an FTL-like co-op game): the tactical map's ship silhouettes become the Hound's traced outline (crew) and an original drone scout (enemy), replacing a three-segment wedge, with damage hatching and the lock marker per room. Fresh subagents will execute it verbatim, one task each with only that task's text, so every old string, line anchor, import and test must match the actual branch, and anything left to 'check at execution' is a defect.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-17-hull-silhouettes.md` at commit `bbdabf9`, worktree `C:\Users\djuar\FTLite\.worktrees\hull-silhouettes`, branch `hull-silhouettes`.
- The spec it implements: `docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md` (converged). The CRT map plan whose screenshot harness Task 3 reuses: `docs/superpowers/plans/2026-11-17-crt-map.md` Task 7 Steps 3-4 (L2214-L2418).
- `src/renderer/src/render/tactical/` (tacticalModel.ts, tacticalLayer.ts, weaponsModel.ts, dashModel.ts, crtTheme.ts) and the tests that use the wedge (`tests/tacticalModel.test.ts`, `tests/dashModel.test.ts`, `tests/duelWeaponsView.test.ts`, `tests/crtColours.test.ts`).
- The run dir `docs/superpowers/reviews/2026-11-17-hull-silhouettes-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
5. Task 2 Step 1 edits tests by line number and old string: confirm each anchor and old string against the branch (tests/tacticalModel.test.ts, tests/dashModel.test.ts, tests/duelWeaponsView.test.ts, tests/crtColours.test.ts).
6. Task 2 Step 4 replaces a range of drawShip and the ENEMY_RING lines in tacticalLayer.ts: confirm the replaced text exists, that seg, segments, fx/fy/rx/ry and the imports it needs are in scope, and that tsc will pass (e.g. `export { ENEMY_RING }` of an imported binding, unused imports such as SHIP_RADIUS).
7. Test counts: Task 1 says 9 tests; the full-suite delta in Task 2 Step 6.
8. Task 3 Step 2 reuses the CRT harness by reference: is the reference precise enough for a fresh subagent (the code exists in that plan; the DuelViewSource fields on today's branch)?

## Reading manifest

- docs/superpowers/plans/2026-11-17-hull-silhouettes.md (the subject, whole)
- docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md (the spec, whole)
- docs/superpowers/plans/2026-11-17-crt-map.md:L2214-L2440 (the harness Task 3 reuses)
- src/renderer/src/app/duel/scene.ts (DuelViewSource type; grep it)
- src/renderer/src/render/tactical/tacticalModel.ts:L15-L60 (ShipDraw, chevron constants), L250-L262 (ships), L300-L313 (wedge)
- src/renderer/src/render/tactical/tacticalLayer.ts:L1-L40 (imports, ENEMY_RING), L100-L140 (drawShip), L200-L215
- src/renderer/src/render/tactical/weaponsModel.ts:L40-L80 (segmentCentre, lock)
- src/renderer/src/render/tactical/dashModel.ts:L1-L78 (isConvex, hatchSegments)
- tests/tacticalModel.test.ts:L1-L15, L70-L80, L165-L175; tests/dashModel.test.ts:L38-L48; tests/duelWeaponsView.test.ts:L100-L115; tests/crtColours.test.ts:L1-L80

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `npx tsc --noEmit -p tsconfig.web.json` if useful, and small `python -c` / `node -e` computations are fine. Never run the Jest suite (it can hang).
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
