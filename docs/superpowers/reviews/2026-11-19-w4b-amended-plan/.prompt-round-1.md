## Role
<!-- reuse -->

The subject is an implementation plan, W-4b, for FTLite's two-player duel: the crew ship's (the Hound's) gun turrets, AUTO and MAN, revised to carry a spec amendment (a mode per gun on R and Shift+R, and a target room that rounds fired by hand damage). Fresh subagents will execute it task by task, verbatim, on branch `w4-weapons-controls`, where W-4a and this plan's Tasks 1 and 2 are already committed. The build resumes at Task 3. So anything left to "check at execution", any code block that would not compile against the branch, any test that cannot pass, and any step that consumes something a later task produces is a defect. The plan must also conform to the W-4 spec as amended, keep the sim deterministic, and leave the Valkyrn and the Hunter bit-identical.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md` at commit `e2ce19cb`, worktree `C:/Users/djuar/FTLite`, branch `master`. **Review Tasks 3 to 14, the header, the Global Constraints, the Decisions and the Seam for W-4c.** Tasks 1 and 2 are executed and kept as history; do not raise findings on their text.
- The specs it must conform to: `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md` (the amendment; it wins) and `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` (W-4).
- **The code is on the W-4 branch, not on master.** Read it from the branch's worktree inside this repo: `.worktrees/w4/` (branch `w4-weapons-controls` at `3b2a90c5`). Every code path below is under `.worktrees/w4/src/renderer/src/`, `.worktrees/w4/tests/` or `.worktrees/w4/scripts/`. Master's copy of the same files is older and must not be used to judge the plan.
- The plan that follows it: `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md` (it anchors on this plan's "Seam for W-4c").
- The run dir `docs/superpowers/reviews/2026-11-19-w4b-amended-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Every "Replace this text" anchor in Tasks 3 to 14.** The plan matches edits by quoted text. For each quoted anchor in a file that Tasks 1 and 2 or W-4a already changed, check the quoted text is on the branch at `3b2a90c5` exactly, or is produced by an earlier task of this plan.
6. **Task 3 (the split of `gunsManual`).** Does it name every place the flag lives on the branch (grep `.worktrees/w4` for `gunsManual`: `state.ts`, `hash.ts`, `tests/w4Turret.test.ts`, `tests/tacticalDeterminism.test.ts`, `tests/valkyrnIdentity.test.ts`, any other), and does any later task still read `gunsManual`?
7. **Task 8 (the target room in the sim).** The `laserLock` admission order and the lock-only write branch against `step.ts` and `weapons.ts`; the round's `room` field through `GunRound`, `emptyRound`, `placeRound`, `roundFields`, `ROUND_SLOT`, `MissingRoundKeys`, the validator's back-offset and bound, and the Valkyrn identity test's left-out pattern; `gunHit` and `pewHit`'s new branches and their class fences; every literal of the `pewHit` event in `src` and `tests` (the plan claims five break at this task); the known-red window once the flatten length changes again.
8. **Task 6 and Task 11 (keys and tags).** `KeyR`, `weaponMode`, `weaponModeAll`, the Ctrl/Meta rule and `KeyEventLike` in `app/duel/input.ts`; the plan's new `ConsoleInput.mode?(slot)`, `KeySample.modeTaps` and `modeRequests` helper (Decision 18): do the types they extend exist as assumed, and do both runtimes (`runtime.ts`, `onlineDuel.ts`) get the same rule; Shift+R's "either MAN, both to AUTO, else both to MAN" judged from the latest sent mode per slot; Z and V unread at the Hound's seat and still read at a laser class's Weapons seat; the smokes' new launch path.
9. **Task 12 (the target room in the app).** E / Q via `laserLock` in both runtimes with the copied torpedo-room block removed from the Hound's branch only; the `ContactSync` flag and `intercept`'s fence; the plain room click versus the pick-up click; `contactModel.ts`'s `lockRoom`; `lockSent` and where it clears; `hitModel.ts`'s pew branch; the hint row texts and their measured widths.
10. **The fences and identity.** Does any step change `VALKYRN_CLASS`, `VALKYRN_LASER_CLASS` or the Hunter's behaviour or hashed values, or edit a fence test (`tests/valkyrnRoundsRocks.test.ts`, `tests/w4HunterIdentity.test.ts`, `tests/pewHunter.test.ts`, `tests/torpedoGuidance.test.ts`)?
11. **The deviations the plan's author reported.** Judge each: (a) `placeRound`'s `room` optional with default 0 (Decision 19); (b) only two of the three kind (a) test rewrites in Task 8, `w4Runtime`'s in Task 12 (Decision 25); (c) the controls list's Z and V rows re-labelled, not removed (Decision 24); (d) `gunMode`'s codec admitting any integer slot so the sim's `malformed` is reachable (Decision 17); (e) the unseen-enemy room refusal reading `ROOM: NO CONTACT` on the `'laser'` control (Decision 23); (f) no edit to `authority/duelRules.ts` for `gunMode`'s `slot`.
12. **What the author could not verify.** Check each against the branch: `nextRound` keeping the seat in the `lockSent` test; the Button DOM behind the tag words test; whether the smokes' key name `'3'` produces `Digit3`; whether `tests/duelScripted.test.ts` already imports `runDuel`; the hint-row widths computed from `theme.ts`'s advance table (173 and 218 px against 229 px).
13. **Internal consistency after the renumbering.** Old Tasks 3 to 11 became Tasks 4, 5, 6, 7, 9, 10, 11, 13 and 14. Find any cross-reference, known-red window entry, "from Task N" rule or Decision that still uses an old number or the old single mode, Z, or the shared tag.

## Reading manifest

- `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L1-L110`: the header, Global Constraints, Decisions and the Seam.
- `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L435-L3940`: Tasks 3 to 14 and the self-review (Task 3 L435, Task 4 L627, Task 5 L875, Task 6 L1203, Task 7 L1702, Task 8 L2120, Task 9 L2741, Task 10 L2894, Task 11 L3123, Task 12 L3286, Task 13 L3708, Task 14 L3845).
- `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md:L1-L420`: the amendment, all of it.
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md`: §3 and §4 (L106-L270), §6 to §12 (L367-L680), §13 and §14 (L681-L905), as needed.
- `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md:L1-L116`: its header and Decisions, for the seam shapes it anchors on.
- `.worktrees/w4/src/renderer/src/sim/tactical/state.ts`, `hash.ts`, `gun.ts`, `pew.ts`, `weapons.ts`, `missiles.ts`, `turret.ts`, `defs.ts`, `tuning.ts`, `bars.ts`: the sim the tasks edit. Read the ranges each task quotes.
- `.worktrees/w4/src/renderer/src/sim/snapshotValidation.ts`, `.worktrees/w4/src/renderer/src/sim/duel/step.ts`, `.worktrees/w4/src/renderer/src/sim/duel/scripted.ts`: validation, command admission, the scripted crew.
- `.worktrees/w4/src/renderer/src/net/contracts.ts`, `.worktrees/w4/src/renderer/src/net/codec.ts`, `.worktrees/w4/src/renderer/src/authority/duelRules.ts`: the command shapes and schemas.
- `.worktrees/w4/src/renderer/src/app/duel/input.ts`, `runtime.ts`, `onlineDuel.ts`, `onlineSource.ts`, `controls.ts`, `contactController.ts`, `weaponsSeat.ts`, `scene.ts`, `mapRequests.ts`: the app the tasks edit.
- `.worktrees/w4/src/renderer/src/app/controlsList.ts`, `.worktrees/w4/src/renderer/src/app/web/pageGuards.ts`: the controls list and the page guards.
- `.worktrees/w4/src/renderer/src/ui/duel/WeaponsStation.tsx`, `.worktrees/w4/src/renderer/src/ui/theme.ts`, `.worktrees/w4/src/renderer/src/render/duel/contactModel.ts`, `.worktrees/w4/src/renderer/src/render/duel/consoleModel.ts`, `.worktrees/w4/src/renderer/src/render/tactical/hitModel.ts`, `.worktrees/w4/src/renderer/src/render/tactical/weaponsModel.ts`: the console, the enemy window, the callouts, the map draws.
- `.worktrees/w4/tests/`: grep for the test files each task names (`w4Turret`, `w4PewFire`, `w4Runtime`, `w4Autocannon`, `valkyrnIdentity`, `tacticalDeterminism`, `duelModules`, `contactModel`, `onlineDuelSession`, `engineeringFog`, `pewUi`, `pewViews`, `pewRounds`, `duelScripted`, `duelGates`) and the helpers they import under `.worktrees/w4/tests/helpers/`.
- `.worktrees/w4/scripts/`: grep for the duel app smoke and the internet smoke the plan's Task 6 edits.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Everything the amendment spec decides (its §1 calls and §8 judgement calls), and everything in the W-4 spec's §16 Decisions and owner-answered §17 items that the amendment does not replace.
- Tasks 1 and 2 are executed; their commits and their text stay. The split of `gunsManual` is a new task on top, not a rewrite of Task 1.
- The task order: the split (3), `gunMode` and hand control (4), the slew (5), keys and LMB (6), AUTO fires (7), the target room in the sim (8, after 7), online prediction (9), the map (10), tags and hint rows (11), the target room in the app (12), the ladder (13), the bless and gate entry (14).
- SIM_VERSION stays V (60) through W-4b; the bump is W-4c's last task.
- The plan's git rules, commit-message convention, known-red window mechanism and fallout rule (kinds a, b, c).
- The Valkyrn and the Hunter stay bit-identical. The fence tests are never edited.
- Numbers are starting values; do not propose retuning them.

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

- **P0**: the plan is unexecutable as a whole from the parked branch, or executing it as written would break determinism, the online authority, or the Valkyrn/Hunter bit-identity.
- **P1**: a task will fail at execution as written (typecheck, a missing or differently shaped interface, a quoted anchor that is not on the branch, a test that cannot pass), a task consumes something a later task produces, a spec rule is missing or built differently without a stated reason, or a step is ambiguous in a way two implementers would build differently.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
