## Role
<!-- reuse -->

The subject is Part ii (app, HUD, consoles, fog, smoke, screenshots, report) of FTLite's Engineering spike implementation plan. Fresh subagents with no other context will execute it task by task on branch `spike/engineering` after Part i (the sim) has been built there. It has to produce React and canvas UI in an amber CRT style, click and keyboard plumbing for local and online play, and tests that pass. The UI covers the ship-view power HUD, interior door and airlock clicks, per-console power strips, a three-weapon Weapons console and fog-of-war ghosts. Anything left to "check at execution" counts as a defect. So does a quoted edit that doesn't match the real source, a consumed name that Part i doesn't provide, and a test that can't pass.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md` at commit `d25a9b13`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-18-engineering-spike-design.md` (§6, §8, §9.3, §10; §9 and §10 override earlier sections where they differ).
- Part i, which runs first on the same branch and provides the sim names: `docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md`. Verify every Part i name Part ii consumes against what Part i actually defines: exact export names, signatures, files and field shapes.
- Codebase: `src/renderer/src/render/duel/`, `src/renderer/src/render/tactical/`, `src/renderer/src/ui/duel/`, `src/renderer/src/ui/`, `src/renderer/src/app/duel/`, `src/renderer/src/input/`, `tests/`, `scripts/`.
- The run dir `docs/superpowers/reviews/2026-11-18-engineering-spike-ii-hud-plan-v2/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. Cross-plan names. Every Part i name used here (`shipPower`, `weaponPower`, `effectiveBars`, `throttleCap`, `trimmedWeaponPower`, `barrelShots`, `contactSeen`, `sensorRange`, `fireTileOf`, `capacityOf`, `COOLANT_POOL_DUEL`, pew pew's ShipSystems fields, the laser command `weapon` field) must match Part i's plan exactly: file, signature, types.
6. Quoted edits to existing UI and app files: each must match master exactly once. Spot-check Tasks 2, 3, 6, 7, 8 and 9.
7. The online path. Do the ship commands reach the online send path the way `throttle` does (app/duel/onlineDuel.ts), and are refusals surfaced?
8. The fog task (Task 9). Is ghost state per client and deterministic enough for tests? Does hiding an unseen enemy break any existing render test or model that assumes the enemy is always drawn?
9. Task 11 is done by the controller: the playwright-core and Electron smoke, and the screenshots. Is it concrete (paths, selectors, staging hooks, expected assertions)?

10. This is a second refine run after two changes to the plan. **Master moved:** asteroids-ii merged at SIM 54, adding rocks on the maps, `rockLock` and laser chips, so the spike's sim is now SIM 55. Check that every quoted edit to a UI or app file still matches current master. **Amendment 3 (spec §11):** pew pew is the W-1 weapon. The PEW PEW card shows its bars and "ARRIVES WITH W-1", with no pew pew targeting. Check that no pew pew remnant survives, and that Part i's names (`beamShots`, `BEAM_SHOTS_BY_BARS`, `trimmedWeaponPower`, `weaponBarsUsable`, `WeaponSlot`) match Part i's plan.

## Reading manifest

- docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md:L1-L2844, the subject (Global Constraints and Decisions L1-L112 fully, then each task)
- docs/superpowers/specs/2026-11-18-engineering-spike-design.md:L1-L420, the spec
- docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md:L1-L163 and each task's Produces block (grep "Produces"), Part i's names
- src/renderer/src/render/duel/shipHudModel.ts:L1-L120 and src/renderer/src/ui/duel/ShipHud.tsx, today's HUD
- src/renderer/src/ui/views.ts:L1-L60, src/renderer/src/ui/duel/DuelUi.tsx, src/renderer/src/ui/duel/WeaponsStation.tsx, src/renderer/src/ui/duel/HelmStation.tsx, src/renderer/src/ui/duel/ScienceStation.tsx
- src/renderer/src/render/duel/consoleModel.ts and src/renderer/src/render/duel/contactModel.ts (heads and the parts the plan edits)
- src/renderer/src/app/duel/runtime.ts:L200-L450 and src/renderer/src/app/duel/onlineDuel.ts:L150-L260, the command queues
- src/renderer/src/render/tactical/crtTheme.ts and src/renderer/src/render/crt.ts, the CRT look
- the interior view renderer and the scene the plan edits (grep the plan's Files lines for exact paths)
- C:\Users\djuar\.claude\projects\C--Users-djuar-FTLite\memory\visual-check-method.md, the screenshot method

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `npx tsc --noEmit -p tsconfig.web.json` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- No Engineering terminal. The ship view is the Engineering station, and anyone in it can move power, cycle coolant and click doors and airlocks, including remote door clicks.
- The HUD and the console strips use the amber CRT style of the consoles.
- Spec §9.3 and §10: every console shows its system's power; the Helm's locked notches; the Weapons console has PEW PEW, BEAM and TORPEDO at 0 to 3 bars, plus the overdrive bar; fog of war with ghosts fading over 10 s.
- The command names `shipPower`, `shipCoolant`, `shipDoor`, `shipAirlock` and `weaponPower`.
- It's a spike on its own branch. It is not merged until the owner plays it.

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

- **P0**: the plan is unexecutable as a whole.
- **P1**: a task will fail at execution (tsc, a missing interface, a name that doesn't match Part i, a quoted edit that doesn't match the source, a test that can't pass), a rule is ambiguous in a way two executors would build differently, or the plan contradicts the spec without saying so.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
