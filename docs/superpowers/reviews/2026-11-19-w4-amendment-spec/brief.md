## Role
<!-- reuse -->

The subject is a design spec that amends W-4 (the Weapons controls and the autocannon for the crew ship, the Hound, `cutter` class, in FTLite's two-player duel). It answers the second round of a playtester's notes with the owner's calls: each gun gets its own AUTO/MAN switch (R flips the selected weapon, Shift+R sets both guns), and Q/E choose one target room that rounds fired by hand damage, while AUTO-driven guns do hull damage only. The W-4 build is in flight on branch `w4-weapons-controls` and is parked before W-4b Task 3; this spec will be turned into an amended W-4b plan and a small W-4c edit, executed task by task by fresh subagents. It must be exact enough that two implementers would build the same thing, it must agree with the W-4 spec wherever it does not say it amends it, and it must keep the sim deterministic, the online authority in charge, and the Valkyrn and the Hunter bit-identical.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md` at commit `f3090883`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it amends: `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` (same commit). Where the two differ, the amendment wins; everything it does not name must still hold.
- The source notes: `docs/superpowers/research/2026-11-19-ryan-notes-v2.md` (§1 and §4).
- The plan it will amend: `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md` (Tasks 3, 5, 7, 9, 10) and `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md`.
- **The code is on the W-4 branch, not on master.** Read it from the branch's worktree inside this repo: `.worktrees/w4/` (branch `w4-weapons-controls` at `3b2a90c5`: W-4a complete, W-4b Tasks 1 and 2 done). Every code path below is under `.worktrees/w4/src/renderer/src/` or `.worktrees/w4/tests/`. Master's copy of the same files is older and must not be used to judge the spec.
- The run dir `docs/superpowers/reviews/2026-11-19-w4-amendment-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source on the W-4 branch.
7. **Contradictions with the W-4 spec that the amendment does not declare.** The amendment lists what it amends (its L3-L6). Find any W-4 rule it silently breaks or leaves dangling: §3.4 hand control, §4.1 to §4.4, §6 `pewFire` admission, §7 the manual torpedo, §9's key table and clashes, §10's tags and hint rows, §11's prediction, §12's scripted gunner and ladder, §13's hash and identity rules, §14's tests, §15's table, §16 Decisions, §17 items.
8. **`lock` and `laserLock` on the Hound (amendment §3.1, §3.2).** Is `ShipSystems.lock` really `Room.Shields` at round start on the Hound, hashed and bounded as a room, and free of other readers that would misbehave once it changes on a laser-less class (`laserStrike`, `tickWeapons`, the AUTO torpedo's `torpRoom >= 0 ? torpRoom : lock` in `missiles.ts`, the scripted gunner, the contact window, readouts)? Is the admission order buildable from `step.ts`'s `laserLock` branch and its no-laser `unavailable` rule as they stand, and does `applyWeaponsInput` set `laserTargeted` in a way the spec's fence covers?
9. **The round's `room` tag (amendment §3.3, §3.4).** Is it exact: who sets it, at which point in the tick, for an autocannon round and for a pew round; what `firePew` / `firePewTrigger` / `fireRound` need to know; hash and bounds for both pools; the "ended entry holds zeros" rule; the `gunRoomWear` bound when pew pew adds 3; the event shapes. Does anything else read `gunHit.room` or `pewHit` (views, sounds, telemetry, tests) that the changed shapes would break?
10. **The Valkyrn, Hunter and laser-fit fences.** Does every changed branch (`gunHit`'s room choice, `pewHit`'s room wear, `gunMode`'s slot, `laserLock`'s admission, the round tag, the new flags) leave `VALKYRN_CLASS`, `VALKYRN_LASER_CLASS` and the Hunter byte-for-byte unchanged, and does the identity test's "leave out by name" list cover every new hashed field?
11. **Keys (amendment §2.4, §3.6).** `KeyR` and Shift in `app/duel/input.ts` (how the Shift+W case sees `shiftKey`, whether Ctrl/Meta are visible to the handler), any existing use of R, the page guards, Z and V at the Hound's seat versus the laser fit and the Flight seat in `runtime.ts` and `onlineDuel.ts`, E / Q's `interact` / `prevLock` press edges and the copied torpedo-room block, the contact controller's pick-up and `torpStep` path, and whether a plain room click in the enemy window can be told from a pick-up click.
12. **Shift+R and R semantics.** The "either MAN → both AUTO, else both MAN" rule judged from the latest sent mode per slot; two `gunMode` commands in one tick; R with the torpedo selected during a flight; the tag word and light in every row of the §2.3 table.
13. **What AUTO loses (amendment §3.5).** Is the effect on the scripted gunner, the per-seed gates and the tuning ladder stated concretely enough to plan, given the bots already lose every gate seed?
14. **Where it lands (amendment §6).** Can the amended W-4b be built in order from the parked branch (Tasks 1 and 2 done with `gunsManual` in the tree)? Is anything the amendment needs missing from the task list (the wire schema of `gunMode`, the smokes, `duelModules` lists, the controls list)?

Controller's own low-confidence items:

15. The claim that the pew pool's entries share `GunRound` with the gun pool (amendment §3.3) was inferred from `roundFields(pool: 'rounds' | 'pew', k)` in `hash.ts`, not read from the type.
16. The claim that an F / LMB AUTO torpedo launch with no torpedo lock strikes `lock` (amendment §3.1) rests on one line of `missiles.ts` (about L120). Check `launchMissile` and `canLaunch` for a rule that would refuse or re-target such a launch.
17. The hint row `R AUTO/MAN · Q/E ROOM: <name>` and the third row (amendment §2.5) were not measured against the console's width.
18. Whether `laserLock` today has a `noop` or other admission step the amendment's order (§3.2) omits.

## Reading manifest

- `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md:L1-L337`: the subject, all of it.
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L1-L110`: scope, the loadout, §2.1 (the laser-less Hound, `lock`).
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L106-L270`: §3 turrets, §3.4 hand control, §4 AUTO and MAN.
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L271-L300`, `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L367-L475`: §5 the autocannon's hits, §6 `pewFire`, §7 the manual torpedo, §8 commands and held input.
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L475-L680`: §9 keys, §10 console and map, §11 online, §12 the scripted gunner.
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L681-L1035`: §13 hash and identity, §14 tests, §15, §16 Decisions, §17, §18.
- `docs/superpowers/research/2026-11-19-ryan-notes-v2.md:L1-L127`: the notes (§1 and §4).
- `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L92-L110`, `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L412-L440`, `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L945-L970`, `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L1957-L1980`: the heads of Tasks 1, 3, 5 and 9, for what the amendment's §6 re-points.
- `.worktrees/w4/src/renderer/src/sim/tactical/state.ts:L16-L17`, `.worktrees/w4/src/renderer/src/sim/tactical/state.ts:L40-L110`, `.worktrees/w4/src/renderer/src/sim/tactical/state.ts:L220-L250`: `Room`, `ShipSystems` (`lock`, `laserTargeted`, `torpLock`, `torpRoom`, `gunRoomWear`, `gunsManual`), `GunRound`, `systemsFor`, `emptySystems`.
- `.worktrees/w4/src/renderer/src/sim/tactical/gun.ts:L1-L178`: `fireRound`, `tickGun`, `gunRoomOf`, `gunHit`, `stepRounds`.
- `.worktrees/w4/src/renderer/src/sim/tactical/pew.ts:L1-L164`: `firePew`, `firePewTrigger`, `pewHit`, `stepPew`, `pewLead`.
- `.worktrees/w4/src/renderer/src/sim/tactical/weapons.ts:L15-L65`, `.worktrees/w4/src/renderer/src/sim/tactical/weapons.ts:L90-L110`, `.worktrees/w4/src/renderer/src/sim/tactical/weapons.ts:L160-L200`, `.worktrees/w4/src/renderer/src/sim/tactical/weapons.ts:L290-L372`: `ShipInput`, `canLaunch`, `validTarget` / `validLock`, `laserStrike`, `applyWeaponsInput`, `tickWeapons`.
- `.worktrees/w4/src/renderer/src/sim/tactical/missiles.ts:L1-L156`: `launchMissile`, the strike room (about L120).
- `.worktrees/w4/src/renderer/src/sim/tactical/hash.ts:L1-L130`, `.worktrees/w4/src/renderer/src/sim/tactical/hash.ts:L150-L165`, `.worktrees/w4/src/renderer/src/sim/tactical/hash.ts:L225-L362`: the field lists (`SYSTEMS_TAIL`, `FLAGS`), `roundFields`, the command list, the bounds and `validateTacticalValues`.
- `.worktrees/w4/src/renderer/src/sim/snapshotValidation.ts`: grep for `gunsManual`, `lock`.
- `.worktrees/w4/src/renderer/src/sim/duel/step.ts:L40-L50`, `.worktrees/w4/src/renderer/src/sim/duel/step.ts:L300-L420`: `WEAPON_ORDER`, held input to `ShipInput`, the weapon commands' admission (`laserLock`, `torpLock`, `pewFire`, `laserFrequency`).
- `.worktrees/w4/src/renderer/src/sim/duel/scripted.ts:L330-L400`: the scripted gunner's `torpLock` and `laserLock`.
- `.worktrees/w4/src/renderer/src/sim/tactical/hunter.ts:L70-L90`, `.worktrees/w4/src/renderer/src/sim/tactical/hunter.ts:L135-L160`: the Hunter's repair of `gunRoomWear`, its `ShipInput`.
- `.worktrees/w4/src/renderer/src/net/contracts.ts`, `.worktrees/w4/src/renderer/src/net/codec.ts`, `.worktrees/w4/src/renderer/src/authority/duelRules.ts`: grep for `laserLock`, `torpMode`, `pewFire` (the command shapes and schemas; `gunMode` is not there yet).
- `.worktrees/w4/src/renderer/src/app/duel/input.ts:L1-L60`, `.worktrees/w4/src/renderer/src/app/duel/input.ts:L115-L210`: `PRESS_CODES`, the key handler, the Shift+W case, the press counts.
- `.worktrees/w4/src/renderer/src/app/duel/runtime.ts:L250-L290`, `.worktrees/w4/src/renderer/src/app/duel/runtime.ts:L390-L600`: `isWeaponsCommand`, `laserModeBase` / `torpModeBase`, the Flight seat's and the Hound's Weapons branches (E / Q, V, LMB), the laser class's Weapons branch.
- `.worktrees/w4/src/renderer/src/app/duel/onlineDuel.ts`: grep for `torpLock`, `laserLock`, `torpMode`, `laserModeSent`, `weaponSel`.
- `.worktrees/w4/src/renderer/src/app/duel/controls.ts:L1-L76`: `cycleLock`, `stepTorpRoom`, `repairInReach`.
- `.worktrees/w4/src/renderer/src/app/duel/contactController.ts:L1-L157`: the pick-up, the room click, `torpStep`, `lockTo` / `torpTo`.
- `.worktrees/w4/src/renderer/src/app/web/pageGuards.ts`: the guarded codes.
- `.worktrees/w4/src/renderer/src/app/controlsList.ts:L1-L98`: the rows and how they are built from the tables.
- `.worktrees/w4/src/renderer/src/ui/duel/WeaponsStation.tsx:L1-L240`: the three cards, the torpedo's tag, the hint rows, `FREE n` / `ROCKS n`.
- `.worktrees/w4/src/renderer/src/render/duel/contactModel.ts`: grep for `lock`, `torpLock`, `pick` (what the enemy window marks today).
- `.worktrees/w4/tests/valkyrnIdentity.test.ts`, `.worktrees/w4/tests/tacticalDeterminism.test.ts`, `.worktrees/w4/tests/w4Turret.test.ts`: grep for `gunsManual` and the left-out fields.
- For item 9's "who else reads the events": grep `.worktrees/w4/src/renderer/src` for `gunHit` and `pewHit`.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The six calls in the amendment's §1: AUTO keeps its lead and the 1.0° tolerance; F and the left button both launch; a switch per weapon on R and Shift+R; Q/E cycle one target room and a gun in hand damages it; pew pew in hand also damages the target room; a MAN gun not selected fights on AUTO.
- An AUTO-driven gun does hull damage only, never a room.
- Z and V do nothing at the Hound's Weapons seat. Shift+R leaves the torpedo alone.
- Everything in the W-4 spec's §16 Decisions and its owner-answered §17 items, except Decision 5 and §17 items 7 and 14, which this amendment replaces.
- The Valkyrn and the Hunter stay bit-identical. The laser fit keeps its rules and keys.
- W-4a's and W-4b Task 1's and Task 2's commits stay; the amendment is built on top of them.
- The numbers are starting values (`PEW_ROOM_WEAR = 3`); do not propose retuning them.

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

- **P0**: the amendment cannot be built as specified as a whole, or it would break determinism, the online authority, or the Valkyrn/Hunter bit-identity.
- **P1**: a rule is ambiguous in a way two implementers would build differently, an interface the spec relies on does not exist on the W-4 branch in the shape assumed, the amendment contradicts a W-4 rule it does not say it amends, an acceptance check is untestable, the amended W-4b cannot be built in order from the parked branch, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
