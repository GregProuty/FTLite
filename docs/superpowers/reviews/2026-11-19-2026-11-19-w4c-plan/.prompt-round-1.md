## Role
<!-- reuse -->

The subject is an implementation plan for W-4c, the third and last part of FTLite's W-4 Weapons controls feature. W-4c changes how the crew's MANUAL torpedo is flown:
- The gunner holds LMB to steer it toward the cursor, from the torpedo's drawn marker. On release it holds its heading.
- A/D steering is removed everywhere: `torpTurn` goes from the sim, the wire, the authority and the app. The right-button heading is removed too, and the right button pans at Weapons again.
- While the torpedo flies, MAN guns neither aim nor fire, AUTO guns fight on, and A/D select. When the flight ends, LMB needs a fresh press and the selection returns to the last gun.
- The online prediction counts 0 frames during a flight.
- W-4c ends with the SIM_VERSION bump V → V + 1 (60 → 61 today), proved by the canonical trace and the duel oracle.

Fresh subagents will execute it task by task with TDD, on branch `w4-weapons-controls`, after the W-4a and W-4b plans have been fully executed. FTLite is a deterministic, golden-tested Electron + TypeScript game. Each of these is a defect:
- anything left to "check at execution";
- any edit that won't match the code as it will stand after W-4a and W-4b;
- any task that won't compile or pass as written;
- any test left red without a rule;
- a version-bump procedure that doesn't follow the repo's precedent.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md` at commit `166f572c`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- It builds on two converged plans:
  - `docs/superpowers/plans/2026-11-19-w4a-loadout.md`, converged at b4469c7a and amended at 7285fc65;
  - `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md`, converged at 166f572c. Read its "Seam for W-4c" section first.
- The code W-4c edits is master plus those two plans. W-4c quotes W-4a's and W-4b's code from those plans; check each quote against them.
- The spec: `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md`, especially §3.4, §6, §7, §8, §9, §10, §11, §13.3 with its version note, §14 (manual torpedo, online), §19 and §19.1.
- W-3's plan, `docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md`, built the current manual torpedo.
- The version-bump precedents: `git show --stat aec698e1 7f9cc710 5c6165d6` (each a version-only bump) and `b7c0919e` (a smoke-seed re-pick).
- The run dir `docs/superpowers/reviews/2026-11-19-2026-11-19-w4c-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), confirm it exists with the assumed shape. Grep master, or check the W-4a or W-4b plan where they create it. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Removing `torpTurn`.** Is every consumer covered? Check:
   - the sim: `ShipInput`, `IDLE_INPUT`, `UNCREWED_INPUT`, hunter.ts's literal, `heldTorpSteer`, `manualTorpTurn`, duel.ts;
   - the wire: `HeldInput`, the codec and every held schema;
   - the authority: the expiry and pause lists;
   - the app: the runtimes, `sessionHeld`, `heldChanged`, the controls list;
   - the W-3 tests.

   Does a frame carrying `torpTurn` become malformed? Does the AUTO path stay bit-identical, so the goldens don't move?
6. **The flight rules.** Check each of these:
   - the guns' gates on a MANUAL flight: no MAN slew, no `gunHeld`, `pewFire` refused `missile-in-flight` after the AUTO refusal, and AUTO firing on;
   - the fresh-press latch;
   - the selection returning from the torpedo to `lastGunSel`;
   - A/D selecting during a flight;
   - `torpHold` holding on release;
   - the camera following the torpedo;
   - the right button panning again.

   Does each rule match spec §7, and do local and online agree?
7. **The LMB steer.** The plan's `torpedoSteer` should mirror `helmSteer` (flightPointer.ts L80). Check that it is measured from the torpedo's drawn marker and fed into the held `torpHeading`. Check `onWeaponsMap`'s blocks, and how a press over a block or on the marker itself is handled.
8. **Online.** The k = 0 gate at `predictTurret`'s call, per W-4b's seam. `sessionHeld` and the held-change test. NO CHARGE and the launch refusals during a flight.
9. **The version bump (Task 8).** It should follow the precedent exactly:
   - baselines recorded at the gameplay commit;
   - SIM_VERSION V → V + 1 alone in `src/renderer/src/sim/tuning.ts`;
   - `npm run bless`, with the blessGuard proofs;
   - the smoke-seed re-pick only if needed;
   - determinism on Node, Electron and Firefox;
   - the Valkyrn identity digests and `tests/w4HunterIdentity.test.ts` unchanged.

   The plan reads V at Task 1, because master moved from 59 to 60 after the spec (fire-venting, 0dbe1be6). Is that handled everywhere, including the report and the gate entry?
10. **Task 7's same-version bless and oracle `same` proof.** The plan claims W-4c changes no AUTO run, so the duel goldens must not change. Is that claim right, given that `torpTurn` leaves the hashed or flattened inputs? Does any oracle run use MANUAL?
11. **Placeholders.** The plan's author flagged that Task 4's right-drag pan case and Task 5's Single player and online cases name their assertions and the rig to copy instead of giving full code. Resolve each against the rigs the W-4a and W-4b plans define (`w4Runtime`'s `rig()`, `onlineDuelSession`'s `rig()`), and say what the code should be.

## Reading manifest

- `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md:L1-L1287`: the subject, all of it.
- `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L1-L120`: W-4b's Global Constraints, Decisions and "Seam for W-4c". Grep the rest for each name W-4c consumes.
- `docs/superpowers/plans/2026-11-19-w4a-loadout.md`: grep for each name W-4c consumes (`nextWeaponSel`, `lastGunSel`, `triggerNow`, `triggerPrev`, `weaponsSeatHeld`, `houndWeaponsSeat`, the Hound branches of `play`).
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L1-L1003`: the spec.
- `src/renderer/src/sim/tactical/manualTorpedo.ts:L1-L19`, `src/renderer/src/sim/tactical/duel.ts:L20-L75`, `src/renderer/src/sim/tactical/weapons.ts:L1-L70`, `src/renderer/src/sim/tactical/hunter.ts:L130-L150`, `src/renderer/src/sim/tactical/missiles.ts:L1-L80`.
- `src/renderer/src/sim/duel/step.ts:L110-L130`, `src/renderer/src/sim/duel/step.ts:L295-L370`.
- `src/renderer/src/net/contracts.ts:L30-L45`, `src/renderer/src/net/codec.ts:L155-L170`, `src/renderer/src/authority/core.ts:L320-L340`, `src/renderer/src/authority/core.ts:L430-L440`, `src/renderer/src/authority/checkpoint.ts:L30-L50`, `src/renderer/src/authority/duelCheckpoint.ts:L65-L80`, `src/renderer/src/authority/replay.ts:L10-L25`.
- `src/renderer/src/app/duel/flightPointer.ts:L1-L83`, `src/renderer/src/app/duel/scene.ts:L240-L360`, `src/renderer/src/app/duel/runtime.ts:L395-L643`, `src/renderer/src/app/duel/onlineDuel.ts:L60-L130`, `src/renderer/src/app/duel/onlineDuel.ts:L200-L420`, `src/renderer/src/app/duel/onlineSource.ts:L130-L218`, `src/renderer/src/app/duel/torpedoCamera.ts`, `src/renderer/src/app/duel/mapRequests.ts:L1-L49`, `src/renderer/src/app/controlsList.ts:L1-L90`.
- `src/renderer/src/ui/duel/WeaponsStation.tsx:L125-L160`, `src/renderer/src/render/duel/consoleModel.ts` by grep (`torpSteer`).
- `tests/manualTorpedo*.test.ts` by grep, `tests/valkyrnIdentity.test.ts:L1-L60`, `scripts/golden/blessGuard.ts`, `scripts/golden/duel-oracle.ts` and `scripts/golden/canonical-trace.ts` by grep, and `scripts/network/duel-app-smoke.ts` by grep (`DUEL_TEST_SEED`).

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
- The spec, as converged at 96c8c2dd with the version note a33ad26e (V = 60 today, bumped to V + 1 by W-4c), is not reopened by the plan review. Flag a plan that departs from it.
- The W-4a and W-4b plans, as converged, are the base. Flag a W-4c need they do not meet, but do not review them.

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

- **P0**: the plan is unexecutable as a whole, or executing it would break determinism, the online authority, the Valkyrn/Hunter bit-identity, or the version-bump proof.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, an edit that won't match the code, a test that can't pass); a rule is ambiguous in a way two executors would build differently; a spec requirement in W-4c's scope has no task; or a test is left red with no rule.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
