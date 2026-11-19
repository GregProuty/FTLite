## Role
<!-- reuse -->

The subject is a design spec, W-4: the Weapons controls and the autocannon for the crew ship (the Hound, `cutter` class) in FTLite's two-player duel. It gives the Hound a new loadout (pew pew, the Valkyrn's gun as an autocannon, the torpedo; the beam leaves), slewing turrets that follow a mouse reticle, a shared AUTO/MAN mode for the two guns, new Weapons-seat keys, autocannon rounds that break rocks, Science's weak frequency boosting the guns, and a mouse-flown manual torpedo. It is built in three parts (W-4a, W-4b, W-4c) on one branch and merged once at SIM_VERSION 60. It will become three implementation plans that fresh subagents execute task by task, and then deterministic sim code that must stay bit-identical on Node, Electron and Firefox, runs locally and online with one authority, and is pinned by golden tests. The Valkyrn and the Hunter must stay bit-identical. Any rule two implementers would build differently, and any interface the spec assumes but the codebase lacks, is a defect.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` at commit `b4d5dba4`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- Neighbouring specs it amends or must stay consistent with:
  - `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md` (W-1 pew pew, W-2 manual laser, W-3 manual torpedo);
  - `docs/superpowers/specs/2026-11-18-engineering-spike-design.md` §10.3 and §11 (weapon bars, slot 1);
  - `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md` (the gun, the no-laser path, §6.1, §7.4);
  - `docs/superpowers/specs/2026-11-17-science-scans-design.md` (Sci-1 weak frequency, the hold);
  - `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md` (rocks, gun rounds absorbed).
- Code under `src/renderer/src/`: sim/tactical (`defs.ts`, `bars.ts`, `gun.ts`, `pew.ts`, `weapons.ts`, `missiles.ts`, `manualTorpedo.ts`, `science.ts`, `state.ts`, `hash.ts`, `rockBreak.ts`, `rockWeapons.ts`, `geometry.ts`, `lead.ts`, `duel.ts`), sim/duel (`step.ts`, `scripted.ts`, `telemetry.ts`), `sim/snapshotValidation.ts`, net (`contracts.ts`, `codec.ts`), authority (`core.ts`, `checkpoint.ts`, `duelCheckpoint.ts`, `replay.ts`), app/duel (`input.ts`, `runtime.ts`, `onlineDuel.ts`, `onlineSource.ts`, `scene.ts`, `flightPointer.ts`, `contactController.ts`, `mapRequests.ts`), `app/controlsList.ts`, `app/web/pageGuards.ts`, `ui/duel/WeaponsStation.tsx`, `render/tactical/weaponsModel.ts`, `render/tactical/rockFx.ts`, `audio/rockSounds.ts`.
- Tests under `tests/`: `valkyrnIdentity.test.ts`, `valkyrnRoundsRocks.test.ts`, `duelGates.test.ts`, `duelScripted.test.ts`, `duelModules.test.ts`, `manualTorpedo*.test.ts`, `manualLaser*.test.ts`.
- The run dir `docs/superpowers/reviews/2026-11-19-2026-11-19-w4-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **Determinism and hash completeness of the new fields.** `pewTurret`, `gunTurret`, `gunsManual` in `SYSTEMS_TAIL`/`FLAGS` (sim/tactical/hash.ts L24-L27), the validation bounds, the gun cooldown bound, the fractional rock wear, and the `gunMode` command in the module's command list. Is every new piece of state hashed, bounded and snapshotted, and every new rule integer or exact?
8. **Online prediction of the turret and reticle (§11).** Is the predicted turret over un-shown held frames specified exactly enough to build, and does it agree with the authority's step? What happens on lost or late held frames (the 250 ms expiry) and on a mode change?
9. **The Valkyrn and Hunter fences.** Are they complete: every branch that the Hound changes (turret, interval, rock, weak frequency, `gunHeld`, `pewFire`'s new shape, the scripted gunner, `laserFrequency` admission) leaves `VALKYRN_CLASS`, `VALKYRN_LASER_CLASS` and the Hunter byte-for-byte unchanged? Note `pewFire` loses its aim on the wire: does anything on the Hunter or the laser fit still depend on it?
10. **Key clashes (§9).** W/S throttle press edges, A/D movement codes, 1/2/3 against `WEAPON_CODES` pick-ups and `FREQ_CODES`, Digit6, Z's renamed action, E/Q, Space, page guards. Verify against `app/duel/input.ts`, `runtime.ts`, `contactController.ts`, `pageGuards.ts`.
11. **The scripted gunner and the duel gates (§12, §14).** The crew bots lose 10/10 gate seeds today. Is the gunner's new behaviour (spare bar to the autocannon, AUTO guns, the hold opened by its torpedo or the clock) buildable from `scripted.ts` as it is, and are the gate changes and the tuning ladder concrete enough to execute?
12. **Removing the beam from the Hound.** Does it break Science (scans, weak frequency, the frequency row), existing tests that assume the Hound has a laser (grep `tests/` for `CUTTER`, `laserReleases`, `laserFire`, the FTL opener), or the UI (WeaponsStation, contact window pick-ups, FTL goal glow)? Is every such consumer named?
13. **The W-4a/b/c split (§19).** Does each part build and test cleanly in order on its own? In particular W-4a ships the gunner and `pewFire` without aim before AUTO exists (W-4b), and the gates are judged only at the merge: is W-4a's intermediate state coherent (does anything fire, do the per-seed tests hold or skip)?

## Reading manifest

- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L1-L885`: the subject, all of it.
- `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md`: grep for §1-§4 (aim, keys, the manual torpedo) as needed.
- `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md`: grep for §5.1, §6.1, §7.4 as needed.
- `src/renderer/src/sim/tactical/defs.ts:L1-L147`: `GunDef`, `PewDef`, `GUN`, `PEW`, `HUNTER_PEW`, `shipClass`, `CUTTER_CLASS` (L122), the Valkyrn classes.
- `src/renderer/src/sim/tactical/bars.ts:L60-L104`: `START_WEAPON_POWER`, `trimmedWeaponPower`, `WeaponSlot`, the weapons effect tables.
- `src/renderer/src/sim/tactical/gun.ts:L1-L144`: `fireRound`, `tickGun`, `gunHit`, `stepRounds`.
- `src/renderer/src/sim/tactical/pew.ts:L1-L157`: `pewGain`, `clampAim`, `aimDir`, `firePew`, `pewHit`, `stepPew`, `pewLead`.
- `src/renderer/src/sim/tactical/weapons.ts:L1-L70`, `src/renderer/src/sim/tactical/weapons.ts:L160-L200`, `src/renderer/src/sim/tactical/weapons.ts:L290-L364`: `ShipInput`, `IDLE_INPUT`, `laserStrike`, `applyWeaponsInput`, `tickWeapons`.
- `src/renderer/src/sim/tactical/missiles.ts:L1-L60` and `src/renderer/src/sim/tactical/manualTorpedo.ts:L1-L19`: launch and the manual turn.
- `src/renderer/src/sim/tactical/science.ts:L20-L70`: `enemyHostile`, `hostilityStep`, `shipSeen`.
- `src/renderer/src/sim/tactical/state.ts:L60-L120`, `src/renderer/src/sim/tactical/state.ts:L165-L175`, `src/renderer/src/sim/tactical/state.ts:L215-L250`: `ShipSystems`, `RockCause`, `systemsFor`.
- `src/renderer/src/sim/tactical/hash.ts:L1-L60`, `src/renderer/src/sim/tactical/hash.ts:L150-L170`, `src/renderer/src/sim/tactical/hash.ts:L220-L290`: field lists, command list, bounds.
- `src/renderer/src/sim/snapshotValidation.ts:L1-L106`: snapshot validation.
- `src/renderer/src/sim/tactical/rockBreak.ts:L60-L130`, `src/renderer/src/sim/tactical/rockWeapons.ts:L1-L33`, `src/renderer/src/sim/tactical/geometry.ts:L1-L46`, `src/renderer/src/sim/tactical/lead.ts:L1-L43`: `hitRock`, `laserStrikesRock`, `lineOfSight`, `interceptTime`.
- `src/renderer/src/sim/tactical/duel.ts:L20-L70`: the tick order (`tickWeapons`, `hostilityStep`).
- `src/renderer/src/sim/duel/step.ts:L40-L50`, `src/renderer/src/sim/duel/step.ts:L280-L445`: `WEAPON_ORDER`, `DUEL_KINDS`, held input to `ShipInput`, weapon command admission, ship commands.
- `src/renderer/src/sim/duel/scripted.ts:L80-L100`, `src/renderer/src/sim/duel/scripted.ts:L290-L410`: the scripted gunner, `gunnerPew`, `barMoved`.
- `src/renderer/src/sim/duel/telemetry.ts:L1-L60`: `laserReleases`, `pewShots`, `gunShots`.
- `src/renderer/src/net/contracts.ts:L30-L120`: `HeldInput`, the duel commands.
- `src/renderer/src/net/codec.ts:L120-L170`: the command and held schemas.
- `src/renderer/src/authority/core.ts:L320-L340`, `src/renderer/src/authority/core.ts:L430-L440`: held expiry and the pause clear.
- `src/renderer/src/authority/checkpoint.ts:L30-L50`, `src/renderer/src/authority/duelCheckpoint.ts:L65-L80`, `src/renderer/src/authority/replay.ts:L10-L25`: held schemas.
- `src/renderer/src/app/duel/input.ts:L1-L60`, `src/renderer/src/app/duel/input.ts:L130-L160`: key tables and `freqTo`.
- `src/renderer/src/app/duel/runtime.ts:L240-L270`, `src/renderer/src/app/duel/runtime.ts:L395-L540`, `src/renderer/src/app/duel/runtime.ts:L590-L625`: `isWeaponsCommand`, `play`, seat keys, refusals, steer, camera input.
- `src/renderer/src/app/duel/onlineDuel.ts:L60-L90`, `src/renderer/src/app/duel/onlineDuel.ts:L200-L320`: `sessionHeld`, the held change test, the online play loop.
- `src/renderer/src/app/duel/onlineSource.ts:L130-L218`: `thrMille` prediction, camera.
- `src/renderer/src/app/duel/scene.ts:L240-L350`, `src/renderer/src/app/duel/flightPointer.ts:L30-L83`, `src/renderer/src/app/duel/mapRequests.ts:L1-L49`: the map pointer, `onWeaponsMap`, `helmSteer`, `aimLaser`.
- `src/renderer/src/app/duel/contactController.ts:L130-L157`: the pick-up intercept.
- `src/renderer/src/app/controlsList.ts:L60-L90`, `src/renderer/src/app/web/pageGuards.ts:L1-L30`: the controls list and the page guards.
- `src/renderer/src/ui/duel/WeaponsStation.tsx:L1-L160`: today's Weapons console.
- `src/renderer/src/render/tactical/weaponsModel.ts:L260-L305`, `src/renderer/src/render/tactical/rockFx.ts:L40-L60`, `src/renderer/src/audio/rockSounds.ts`: map draws, rock sparks and sounds.
- `tests/valkyrnIdentity.test.ts`, `tests/valkyrnRoundsRocks.test.ts`, `tests/duelGates.test.ts`, `tests/duelScripted.test.ts`: grep for what the spec says they pin.

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

- **P0**: the feature cannot be built as specified as a whole, or it would break determinism, the online authority, or the Valkyrn/Hunter bit-identity.
- **P1**: a rule is ambiguous in a way two implementers would build differently, an interface the spec relies on doesn't exist in the shape assumed, an acceptance check is untestable, a part of the W-4a/b/c split cannot be built in order, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
