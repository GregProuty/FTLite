## Role
<!-- reuse -->

The subject is an implementation plan for W-4a, the first part of FTLite's W-4 Weapons controls feature. W-4a gives the Hound:
- its new loadout: pew pew, the autocannon and the torpedo, with no beam;
- autocannon rounds that wear and break rocks;
- Science's weak frequency boosting the guns;
- `pewFire {}`, which no longer carries an aim;
- weapon selection and power keys;
- the three-card Weapons console;
- the scripted gunner's bar move;
- the port of every beam test to the laser fit.

Fresh subagents will execute it task by task, with TDD, on branch `w4-weapons-controls` in a worktree. FTLite is a deterministic, golden-tested Electron + TypeScript game at SIM_VERSION 59. The W-4b and W-4c plans follow on the same branch and consume this plan's names. Each of these is a defect:
- anything left to "check at execution";
- any edit that won't match the real code;
- any task that won't compile or pass as written;
- any test left red without a rule.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-19-w4a-loadout.md` at commit `1ddb8a19`, worktree `C:/Users/djuar/FTLite`, branch `master`. The plan runs on a branch cut from master, so master's code is the code it edits.
- The spec it implements: `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md`, converged at 96c8c2dd. The sections that matter most are §2, §5, §5.1, §5.2, §6, §8, §9, §10, §12, §13, §14, §14.1, §19 and §19.1 (W-4a's scope and its intermediate rules).
- House-format precedents: `docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md` and `docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md`.
- Code:
  - under `src/renderer/src/`: sim/tactical, sim/duel, net, authority, app/duel, ui/duel and render;
  - under `tests/`: the helpers, the gates, the scripted tests, and the laser and pew tests the plan ports.
- The run dir `docs/superpowers/reviews/2026-11-19-2026-11-19-w4a-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Determinism and bounds.** W-4a adds no hashed field. It does change `gunCooldown`'s bound, the rock wear (fractional hp), the weak-frequency thresholds and the classes. Is every new rule integer or exact, and are the bounds right?
6. **The Valkyrn and Hunter fences.** These changed branches must leave `VALKYRN_CLASS`, `VALKYRN_LASER_CLASS` and the Hunter byte-for-byte unchanged:
   - the turret path and the interval;
   - the rock rule and the weak frequency;
   - `gunHeld`, and `pewFire`'s new shape;
   - the scripted gunner;
   - `laserFrequency`'s admission.

   Does Task 1's Hunter identity digest really pin the Hunter? Does `tests/valkyrnIdentity.test.ts` stay green after every task?
7. **Key clashes.** Check each of these:
   - W/S;
   - A/D: the `selectPrev`/`selectNext` press edges against `MOVE_CODES` and against the MANUAL torpedo's W-3 A/D steer;
   - 1/2/3 against the contact controller's pick-ups;
   - the `freqKeyTo`/`gunFreqKeyTo`/`selectTo` split, and the gun fit's NO LASER cue;
   - the page guards;
   - E/Q.
8. **The scripted gunner and the duel gates.** The crew bots lose all 10 gate seeds today. Do the bar move's pre-check, the W-4a stand-in pew and the kind (a) gate change keep every scripted command admitted and every per-seed gate passing? Is the stop rule on a W-4a gate failure workable?
9. **Removing the beam from the Hound.**
   - Is Task 2's port inventory complete? The plan's author flagged that W-1's `pewInput`, `pewCommands`, `pewRounds`, `pewUi` and `pewViews` tests also pin the Cutter's click-to-aim, and the grep misses them.
   - Does removing the beam break Science, the UI or the FTL opener in a way no task covers?
10. **The W-4a/b/c split.**
    - Does W-4a end in a coherent state that W-4b can build on? The seams are `gunInterval`, `gunAimFine`, `pewAimFine`, `firePewTrigger` and `weaponSel`.
    - Does it leave nothing red between tasks except the stated known-red window?
11. **Places the plan leaves to the executor.** The author flagged these. Resolve each against the code and say what the right answer is, so the plan can state it:
    - the tests in Tasks 10-12 are outlines that copy an existing file's setup;
    - Task 2's ports are a table plus a rule;
    - Task 3: the name and signature of `validateTacticalValues`;
    - Task 5: how to build `FxState`;
    - Tasks 6 and 7: the noop status string;
    - Task 13: the observer's field names;
    - Task 12: whether `render/` may import from `app/`.
12. **Online.** `sessionHeld` gains `weaponSel` and `gunHeld` at the Hound's seat. Are these right: the held change test, the authority's expiry and pause clear, and the NO CHARGE path?

## Reading manifest

- `docs/superpowers/plans/2026-11-19-w4a-loadout.md:L1-L2317`: the subject, all of it.
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L1-L1001`: the spec. Read §19.1, at the end, first.
- `src/renderer/src/sim/tactical/defs.ts:L1-L147`, `src/renderer/src/sim/tactical/bars.ts:L60-L104`; `src/renderer/src/sim/tactical/tuning.ts` and `src/renderer/src/sim/tactical/rockTuning.ts` by grep.
- `src/renderer/src/sim/tactical/gun.ts:L1-L144`, `src/renderer/src/sim/tactical/pew.ts:L1-L157`, `src/renderer/src/sim/tactical/weapons.ts:L1-L70`, `src/renderer/src/sim/tactical/weapons.ts:L290-L364`.
- `src/renderer/src/sim/tactical/hash.ts:L1-L60`, `src/renderer/src/sim/tactical/hash.ts:L150-L310`, `src/renderer/src/sim/tactical/state.ts:L60-L250`, `src/renderer/src/sim/tactical/rockBreak.ts:L60-L130`, `src/renderer/src/sim/tactical/rockWeapons.ts:L1-L33`, `src/renderer/src/sim/tactical/science.ts:L20-L70`, `src/renderer/src/sim/tactical/hunter.ts:L130-L150`.
- `src/renderer/src/sim/duel/step.ts:L40-L50`, `src/renderer/src/sim/duel/step.ts:L110-L130`, `src/renderer/src/sim/duel/step.ts:L280-L445`, `src/renderer/src/sim/duel/scripted.ts:L80-L100`, `src/renderer/src/sim/duel/scripted.ts:L300-L410`, `src/renderer/src/sim/duel/power.ts:L30-L60`; `src/renderer/src/sim/duel/weaponSlots.ts` by grep.
- `src/renderer/src/net/contracts.ts:L30-L120`, `src/renderer/src/net/codec.ts:L120-L170`, `src/renderer/src/authority/core.ts:L320-L340`, `src/renderer/src/authority/core.ts:L430-L440`, `src/renderer/src/authority/checkpoint.ts:L30-L50`, `src/renderer/src/authority/duelCheckpoint.ts:L65-L80`, `src/renderer/src/authority/replay.ts:L10-L25`.
- `src/renderer/src/app/duel/input.ts:L1-L60`, `src/renderer/src/app/duel/input.ts:L130-L170`, `src/renderer/src/app/duel/controls.ts:L1-L60`, `src/renderer/src/app/duel/runtime.ts:L160-L280`, `src/renderer/src/app/duel/runtime.ts:L395-L625`, `src/renderer/src/app/duel/onlineDuel.ts:L60-L90`, `src/renderer/src/app/duel/onlineDuel.ts:L200-L330`, `src/renderer/src/app/duel/onlineSource.ts:L130-L218`, `src/renderer/src/app/duel/scene.ts:L240-L350`, `src/renderer/src/app/duel/flightPointer.ts:L30-L83`, `src/renderer/src/app/duel/mapRequests.ts:L1-L49`, `src/renderer/src/app/duel/contactController.ts:L130-L157`, `src/renderer/src/app/controlsList.ts:L60-L90`, `src/renderer/src/app/web/pageGuards.ts:L1-L30`.
- `src/renderer/src/ui/duel/WeaponsStation.tsx:L1-L160`, `src/renderer/src/render/duel/situationModel.ts:L200-L280`, `src/renderer/src/render/tactical/weaponsModel.ts:L260-L305`, `src/renderer/src/render/tactical/rockFx.ts:L40-L60`; `src/renderer/src/audio/rockSounds.ts` by grep.
- Tests:
  - `tests/helpers/crewWeapons.ts`, `tests/helpers/scriptedDuel.ts:L1-L80`, `tests/helpers/valkyrnGate.ts:L1-L60`;
  - `tests/duelGates.test.ts` by grep, `tests/duelScripted.test.ts:L80-L160`, `tests/valkyrnIdentity.test.ts:L1-L60`;
  - `tests/scienceInput.test.ts:L30-L50`, `tests/valkyrnRuntime.test.ts:L120-L140`;
  - the pew and manualLaser tests by grep.

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
- The spec, as converged at 96c8c2dd, is not reopened by the plan review. Flag a plan that departs from it.

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
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, an edit that won't match the code, a test that can't pass); a rule is ambiguous in a way two executors would build differently; a spec requirement in W-4a's scope has no task; or a test is left red with no rule.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
