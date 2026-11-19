## Role
<!-- reuse -->

The subject is an implementation plan for W-4b, the second part of FTLite's W-4 Weapons controls feature. W-4b puts the Hound's two guns on slewing turrets that follow a mouse reticle. It also adds:
- one AUTO/MAN mode for both guns (Z, and a shared tag);
- AUTO lead-aimed fire at a seen, hostile enemy ship in range, arc and line of sight. AUTO tracks but holds fire during the 30 s hold;
- MAN's traverse and fire-rate bonus;
- the map's arc, muzzle lines, reticle and bracket;
- online prediction of the own selected turret;
- the scripted gunner on AUTO, tuned by the spec's ladder.

Fresh subagents will execute it task by task with TDD, on branch `w4-weapons-controls`, after the W-4a plan has been fully executed on the same branch. FTLite is a deterministic, golden-tested Electron + TypeScript game: SIM_VERSION is V, which is 60 today. W-4b adds hashed state. The W-4c plan follows and consumes this plan's names. Each of these is a defect:
- anything left to "check at execution";
- any edit that won't match the code as it will stand after W-4a;
- any task that won't compile or pass as written;
- any test left red without a rule;
- any break in determinism or in the Valkyrn/Hunter bit-identity.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md` at commit `b4469c7a`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- What it builds on:
  - the W-4a plan, `docs/superpowers/plans/2026-11-19-w4a-loadout.md`, which converged at b4469c7a. Its code is master plus that plan. W-4b quotes W-4a's code from it; check each quote against that plan.
  - master's code for everything W-4a does not touch.
- The spec: `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md`, especially §3, §4, §6, §8, §9, §10, §11, §12, §13, §14, §19 and §19.1, and §13.3's version note.
- The W-4c plan, `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md`, consumes these W-4b names:
  - `slewTurrets`' MAN branch;
  - the `pewFire` AUTO refusal;
  - the crew literal's `turretAim`;
  - `predictTurret`.
- Code: under `src/renderer/src/` (sim/tactical, sim/duel, net, authority, app/duel, render, ui/duel) and `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-19-2026-11-19-w4b-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), confirm it exists with the assumed shape. Grep the source, or check the W-4a plan where W-4a creates the interface. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Determinism and hash completeness of the new fields.** Check how `pewTurret`, `gunTurret` and `gunsManual` are handled:
   - their place in `SYSTEMS_TAIL` and `FLAGS`;
   - their per-class validation bounds and the `gunsManual` crew-only check;
   - snapshot and clone, and `tests/duelModules.test.ts`'s pinned lists;
   - the duel oracle's named fields.

   Is the slew law integer-exact, including the wrap and the clamp? Do `gunLead` and `autoSolution` use only allowed operations and deterministic tables?
6. **The Valkyrn and Hunter fences.** Check two things:
   - Does `tests/valkyrnIdentity.test.ts`'s rebuilt array, built from `TACTICAL_MODULES` without the three new names, equal SIM 59's `flattenTactical` element for element?
   - Do `slewTurrets`, `gunMode` and the AUTO paths leave the Valkyrn, the laser fit and the Hunter untouched?
7. **Online prediction (spec §11).** Is `predictTurret` the thrMille analogue as the spec defines it? Check:
   - the k = 0 gates;
   - `gunModeSent` / `gunModeBase`;
   - the replica heading held fixed;
   - the agreement test with the stepped sim after k ticks.
8. **AUTO's rules.** Check each of these:
   - the target is ship only: seen, in range and in line of sight;
   - the on-solution test;
   - the hold: the guns track but fire nothing while `hostileAt` is −1, and open fire the tick after the hold ends;
   - the autocannon's 80 % heat stop, so it never locks;
   - an AUTO pew starting from a full charge. The plan's Decision 4 lets it fire its three stored thirds on consecutive ticks. Is that consistent with spec §4.3's "it fires each time a third has charged, and it never bursts"? If not, what is the minimal rule that matches the spec?
9. **Key clashes and the app.** Check:
   - Z renamed to `weaponMode`, while the laser fit keeps `laserMode`;
   - LMB and `gunHeld` only in MAN;
   - the reticle (`aimLaser` renamed `reticle`), and every consumer of that rename, including the laser fit's MANUAL laser;
   - the duel app smoke pressing Z.
10. **The scripted gunner and the duel gates.** The crew bots lost 10/10 gate seeds before W-4. Check:
    - the stand-in pew is deleted;
    - the AUTO guns open after the hold;
    - every per-seed gate passes at W-4b's end;
    - the tuning ladder (Task 10) matches spec §12, and its Hound-only knobs (Decision 11) don't touch the Valkyrn pair's `MISSILE_GAP`;
    - the report records each seed's hold-end tick and cause.
11. **The W-4b/W-4c seam.** W-4b leaves the MANUAL-torpedo flight rules to W-4c. Are the names W-4c anchors on present exactly as the W-4c plan expects them?
12. **Placeholders.** Any test body that is an outline instead of code, or any "check and adjust" left to the executor: resolve it against the code and say what the right answer is.

## Reading manifest

- `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L1-L1783`: the subject, all of it.
- `docs/superpowers/plans/2026-11-19-w4a-loadout.md:L1-L2533`: the code W-4b builds on. Read the Global Constraints and Decisions, then grep for each name W-4b consumes.
- `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md`: grep for `slewTurrets`, `gunsManual`, `turretAim`, `predictTurret` and `turret(`.
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L1-L1003`: the spec.
- `src/renderer/src/sim/tactical/hash.ts:L1-L60`, `src/renderer/src/sim/tactical/hash.ts:L120-L310`, `src/renderer/src/sim/tactical/state.ts:L60-L250`, `src/renderer/src/sim/snapshotValidation.ts:L1-L106`.
- `src/renderer/src/sim/tactical/pew.ts:L1-L157`, `src/renderer/src/sim/tactical/gun.ts:L1-L144`, `src/renderer/src/sim/tactical/weapons.ts:L1-L70`, `src/renderer/src/sim/tactical/weapons.ts:L290-L364`, `src/renderer/src/sim/tactical/lead.ts:L1-L43`, `src/renderer/src/sim/tactical/geometry.ts:L1-L46`, `src/renderer/src/sim/tactical/science.ts:L20-L70`, `src/renderer/src/sim/tactical/hunter.ts:L130-L150`, `src/renderer/src/sim/tactical/duel.ts:L20-L75`.
- `src/renderer/src/sim/duel/step.ts:L40-L50`, `src/renderer/src/sim/duel/step.ts:L110-L130`, `src/renderer/src/sim/duel/step.ts:L280-L445`, `src/renderer/src/sim/duel/scripted.ts:L80-L100`, `src/renderer/src/sim/duel/scripted.ts:L300-L410`.
- `src/renderer/src/net/contracts.ts:L30-L120`, `src/renderer/src/net/codec.ts:L120-L170`, `src/renderer/src/authority/core.ts:L320-L340`, `src/renderer/src/authority/core.ts:L430-L440`, `src/renderer/src/authority/checkpoint.ts:L30-L50`, `src/renderer/src/authority/duelCheckpoint.ts:L65-L80`, `src/renderer/src/authority/replay.ts:L10-L25`.
- `src/renderer/src/app/duel/input.ts:L1-L60`, `src/renderer/src/app/duel/runtime.ts:L160-L280`, `src/renderer/src/app/duel/runtime.ts:L395-L643`, `src/renderer/src/app/duel/onlineDuel.ts:L60-L130`, `src/renderer/src/app/duel/onlineDuel.ts:L200-L420`, `src/renderer/src/app/duel/onlineSource.ts:L130-L218`, `src/renderer/src/app/duel/scene.ts:L240-L350`, `src/renderer/src/app/duel/mapRequests.ts:L1-L49`, `src/renderer/src/app/controlsList.ts:L1-L90`.
- `src/renderer/src/render/tactical/weaponsModel.ts:L250-L305`, `src/renderer/src/render/tactical/tacticalLayer.ts` and `src/renderer/src/render/duel/consoleModel.ts` by grep, `src/renderer/src/ui/duel/WeaponsStation.tsx:L1-L160`.
- `tests/valkyrnIdentity.test.ts:L1-L60`, `tests/duelModules.test.ts` by grep, `tests/duelGates.test.ts` by grep, `tests/duelScripted.test.ts:L80-L160`, `tests/helpers/scriptedDuel.ts:L1-L80`, `scripts/golden/duel-oracle.ts` by grep, `scripts/network/` (the duel app smoke) by grep.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and read-only `node -e` arithmetic are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Everything in the spec's §16 Decisions list (items 1-16).
- Every §17 item marked "Owner 2026-11-19" (items 1, 2 and 4).
- The Hound's loadout is pew pew, the autocannon (the Valkyrn's gun) and the torpedo; the beam leaves the Hound.
- Autocannon bars set the fire interval: 10 / 8 / 6 ticks, 5 on overdrive.
- The autocannon turret is ±30°.
- Start power is pew 1, autocannon 0, torpedo 1.
- Controls: a mouse reticle with slewing turrets; LMB fires the selected weapon; A/D or 1-3 select; W/S set power on the selected weapon; Z sets both guns AUTO/MAN; V sets the torpedo's mode.
- In AUTO the autocannon stops at 80 % heat.
- The MAN bonus is +25 % traverse and about +20 % fire rate.
- The manual torpedo is flown by holding LMB; MAN guns are locked while it flies.
- Autocannon rounds break rocks.
- The weak shield frequency boosts pew pew and the autocannon.
- AUTO holds fire during the 30 s hold.
- AUTO pew targets the enemy ship only.
- The Valkyrn and the Hunter stay bit-identical.
- The spec, as converged at 96c8c2dd with the version note a33ad26e (V = 60 today), is not reopened by the plan review. Flag a plan that departs from it.
- The W-4a plan, as converged at b4469c7a, is the base. Flag a W-4b need it does not meet, but do not review W-4a itself.

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

- **P0**: the plan is unexecutable as a whole, or executing it would break determinism, the online authority, or the Valkyrn/Hunter bit-identity.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, an edit that won't match the code, a test that can't pass); a rule is ambiguous in a way two executors would build differently; a spec requirement in W-4b's scope has no task; or a test is left red with no rule.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
