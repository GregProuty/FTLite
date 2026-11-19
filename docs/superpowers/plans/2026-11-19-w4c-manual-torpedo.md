# W-4c: the mouse-flown torpedo and the SIM_VERSION bump — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The gunner flies the crew's MANUAL torpedo with the left mouse button, as the Helm steers the ship: while it flies, LMB held on the open Weapons map turns it toward the pointer, and letting go holds the last heading. A/D steering and the right-button heading go. A/D now select weapons during a flight too, and the right button pans the Weapons map again. While the torpedo flies, MAN guns neither aim nor fire, and AUTO guns fight on. When the flight ends, LMB needs a fresh press, and a torpedo selection goes back to the last gun. Then W-4 is closed with a gameplay proof, a same-version bless and the SIM_VERSION bump.

**Architecture:**

- **The sim law is W-3's, minus A/D.** `manualTorpTurn(m, heading)` turns a MANUAL torpedo by `holdTurn` toward the held `torpHeading`. `torpTurn` leaves `HeldInput`, every held schema, the authority's expiry and pause lists, `ShipInput`, `IDLE_INPUT`, `UNCREWED_INPUT`, the Hunter's literal and the step. `heldTorpSteer` becomes `heldTorpHeading(h): number`.
- **The guns during a flight.** These are sim rules, gated on `manualTorpedoFlying(state)` as the tick starts, and fenced to a turret class:
  - the step sends no `gunHeld`;
  - `pewFire` is refused `missile-in-flight`, after W-4b's AUTO refusal;
  - `slewTurrets` holds a MAN turret;
  - AUTO is untouched.
- **The LMB steer is the Helm's path, aimed from the torpedo.** A new pure `torpedoSteer` in `app/duel/flightPointer.ts`, a twin of `helmSteer`, gives the bearing from the torpedo's drawn marker to the pointer on the open Weapons map. The scene calls it every frame while LMB is held and the crew's MANUAL torpedo flies, and feeds W-3's existing `MapRequests.torpHeading`. W-3's right-button block in the scene and the Weapons pan exemption in `cameraInput.apply` (local and online) are removed.
- **The seat around a flight is a pure helper.** `flightFrame` in `app/duel/weaponsSeat.ts` returns this frame's state:
  - the flight latch;
  - the selection (the torpedo returns to the last gun when a flight ends);
  - whether the left click may fire;
  - the gated trigger: no trigger while flying, and a trigger held across the flight's end is stale until released.
  Both runtimes call it in their Hound Weapons-seat branch. W-4b's online turret prediction counts no frames while a MANUAL torpedo flies.
- **The close.** Task 1 records a duel-oracle baseline at the W-4c start. No scripted or passive oracle run uses a MANUAL torpedo or MAN guns, so Task 7 proves every run unchanged per tick (`duel-oracle.ts same`) before a same-version bless. The bless refreshes only `basic.json`'s content digest. Task 8 then bumps SIM_VERSION alone, proved and blessed, as aec698e1 and 7f9cc710 did.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2 (+ jsdom for UI tests), React + zustand (console), zod 3 (wire), Pixi.js (map), Electron/electron-vite, the golden scripts under `scripts/golden/`.

**Spec:** `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` (converged at 96c8c2dd). W-4c is §19 item 3 and §19.1's W-4c rules:
- §7 (the manual torpedo);
- §3.4's flight rule and §6's `missile-in-flight`;
- §9's LMB-steer, A/D, RMB and `controlsList.ts` rows;
- §10's `STEER LMB`;
- §11's prediction gate;
- §13.3 (the bump);
- §13.4 (the identity checks);
- §14's manual-torpedo tests.

**Shared names:** the W-4 contract (controller scratchpad `w4-contract.md`), the W-4a plan `docs/superpowers/plans/2026-11-19-w4a-loadout.md` and the W-4b plan `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md`. W-4c consumes their names exactly. Where this plan edits code that W-4a or W-4b wrote, it names the anchor (the function and the line's quoted text as those plans write it). If W-4b's executed code differs from its plan, match the executed code by the same function name and meaning, and say so in the task's commit body.

**Branch and worktree:** `w4-weapons-controls` in `C:\Users\djuar\FTLite\.worktrees\w4` (the controller made it before W-4a; see W-4a's "Worktree setup (controller)"). W-4a and W-4b are fully executed and committed on it. Every command runs from the worktree root.

## Global Constraints

- **Version.** SIM_VERSION is `V` at `W4_BASE` (W-4a Task 1 recorded `W4_BASE` in `docs/superpowers/research/2026-11-19-w4-report.md`). Read it in Task 1 with `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`.
  - At the time of writing master is at **60**: fire-venting (0dbe1be6) bumped 59 → 60 after the W-4 spec was written. So spec §13.3's "59 → 60" is **V → V + 1** here (Decision 1).
  - Tasks 2 to 6 change no scripted run, and Task 7 re-blesses at V.
  - Task 8 bumps V → V + 1 alone and blesses, with the canonical trace and the duel oracle proving every run unchanged per tick.
  - Never pass `--fresh`. Never hand-edit goldens.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`.
- **Exact names and values (binding):**
  - `sim/tactical/manualTorpedo.ts`: `manualTorpTurn(m: Missile, heading: number): number`. `manualTorpedoFlying(state, i?)` is unchanged.
  - `sim/duel/step.ts`: `heldTorpHeading(h: HeldInput): number` replaces `heldTorpSteer` (a heading index 0..255, else −1).
  - `HeldInput`: `torpTurn` removed; `torpHeading?: number` stays. Every held zod schema (`net/codec.ts`, `authority/checkpoint.ts`, `authority/duelCheckpoint.ts`, `authority/replay.ts`) drops `torpTurn`. They are `.strict()`, so a frame carrying `torpTurn` is malformed.
  - `ShipInput`: `torpTurn` removed; `torpHeading: number` stays (−1 none).
  - `app/duel/flightPointer.ts`: `torpedoSteer(i: { pointer: Point | null; torpedo: Point; zoom: number; contactShown: boolean; statusRows: number }): number | null`.
  - `app/duel/weaponsSeat.ts`:
    - `interface FlightLatch { flying: boolean; stale: boolean }` and `const NO_FLIGHT: FlightLatch`;
    - `flightFrame(latch, flyingNow, sel, lastGun, triggerNow): { latch: FlightLatch; sel: number; trigger: boolean; clicks: boolean }`;
    - W-4a's `nextWeaponSel(sel, k, steering)` loses its `steering` parameter and becomes `nextWeaponSel(sel, k)`.
  - The TORPEDO card's steering word is `STEER LMB` (was `STEER A/D`), on the Hound's block and the laser class's block alike.
- **The fences (spec §13.4).**
  - `tests/valkyrnIdentity.test.ts`, as W-4b left it (the three new names skipped, their zero asserted), must pass unchanged from Task 1 to the end. Its five digests do not change.
  - `tests/w4HunterIdentity.test.ts` (W-4a Task 1) passes unchanged. `tests/valkyrnRoundsRocks.test.ts`, `tests/pewHunter.test.ts` and `tests/torpedoGuidance.test.ts` pass unchanged.
  - The flight gates of Task 3 are fenced to a turret class (`hasTurret(classOf(state, 0))`), so the Valkyrn, the laser fit and the Hunter take today's branches. The Valkyrn's Flight seat never flies a MANUAL torpedo (spec §15).
- **The fallout rule (binding on every task; spec §14.1).** Classify each failing test exactly once:
  - **(a) The test pins a rule W-4c replaces.** Examples: A/D (`torpTurn`) steering a MANUAL torpedo, the right button's heading at Weapons, the Weapons pan exemption, `STEER A/D`, the controls-list A/D and right-drag clauses, the guns firing during a MANUAL flight. Rewrite it for the new rule, citing "W-4 spec §n" on the changed line.
  - **(b) The test pins a number from a whole run.** W-4c moves no scripted or passive run (Task 7 proves it), so a kind (b) failure before Task 8 is a defect: stop and find it.
  - Never edit a band's limits. Never delete a test except a kind (a) one whose rule no class keeps (name it in the commit body). Never skip a test.
- **Known-red window:** from Task 2 (the first sim file change) until Task 7's bless, only `tests/golden.test.ts` fails (its `basic.json` embeds every sim file's content digest). Every other test must pass at the end of each task. Each task runs its own targeted tests. The full suite runs in Tasks 1, 7 and 8.
- **Sim rules:**
  - Only `+ − × ÷` and `sqrt` in `src/renderer/src/sim/**`. `tests/helpers/determinismGuard.ts` allows `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt` only: no trig, no `**`, no `Math.hypot`.
  - No sim file imports from `app/`, `render/`, `input/` or `ui/`.
  - No new randomness.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`; `npm run test:duel-app-runtime`; `npm run test:determinism`.
  - Never run two vitest processes at once.
  - A full-suite timeout under load is re-run alone with `npx vitest run <that file>` before it counts as a failure. The load-sensitive files are `tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts` and `tests/duelGates.test.ts`.
- **Determinism logs:** `npm run test:determinism` rewrites tracked logs under `.superpowers/sdd/2026-11-14-net-1b-durability/`. After every run, restore them with `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability` before staging anything.
- **The oracle baselines** live in the OS temp folder and record the checkout's `cwd` and HEAD. Record and check them from this worktree only. Do not record a duel-oracle baseline between Task 1 and Task 7 Step 1.
- **Line endings:** the working copies are CRLF (`core.autocrlf=true`; the index is LF). Change existing files with the Edit tool, which keeps their endings. Never hand-convert endings. New files may be written with LF.
- **Worktrees:** never delete a `node_modules` junction in a worktree (including `services/signalling/node_modules`). A missing one is recreated, never "cleaned".
- **Git:**
  - Never `git add -A`, `git add .` or `git stash`. Stage by name.
  - Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as the last `-m`.
  - Files are UTF-8. After writing any file, check it is not all null bytes (`head -c 64 <file> | od -c | head -1`): the PC crashed once mid-edit and zeroed uncommitted files. Commit at the end of every task.
  - Line numbers below were read on master at `1ddb8a19` (W-4a's code not yet applied). **Match every edit by the quoted text**, not the number.
  - Every "unchanged" diff uses the fixed hash `W4C_BASE` (Task 1) or `W4_BASE`, never `master`.
- **Comments:** a header comment citing the spec section on each new file; doc comments on exports; cite "W-4 spec §n" on changed lines that need a reason.

## Decisions where the spec leaves room, and where the code forces a choice

1. **The bump is V → V + 1, read at Task 1, not 59 → 60.** Master moved to SIM 60 with fire-venting (0dbe1be6, after the W-4 spec at b4d5dba4). W-4a's and W-4b's "same-version bless at 59" are at V too (the controller reconciles those plans). Task 8 bumps whatever V is to V + 1 and changes nothing else.
2. **The LMB steer works at any Weapons seat, not only the Hound's.** `torpTurn` and the right-button heading leave the sim, the wire and the app for every class (spec §7, "Removed"). So the laser fit at a Weapons seat (the developer combination, spec §13.4) flies its MANUAL torpedo by LMB as well, or it could not steer one at all. On the laser class the left button has no other use at Weapons: it has no pew, and its laser fires on Space. The Valkyrn's Flight seat has no MANUAL flight (spec §15), so it is untouched.
3. **The flight gates read the flight at the tick's start.** The step admits commands and builds the crew input before `applyWeaponsInput` launches anything. So `gunHeld` is dropped, and `pewFire` refused, from the tick after a launch, while `manualTorpedoFlying(d.tactical)` is true. `slewTurrets` runs before the launch inside `applyWeaponsInput` (spec §8's order: slew 3, launch 6), so it reads the same flag the same way. On the launch tick itself the guns behave as before the flight. This matches the W-3 rule for the laser (`canCharge` reads the torpedo in flight as the tick starts).
4. **`gunHeld`'s flight gate lives in the step, not in `tickGun`.** Spec §5 defines MAN fire as "a round fires when `input.gunHeld` (§8: LMB held, the autocannon selected, no MANUAL torpedo flying)". So the step folds the flight into `gunHeld`, as W-4a folds in the selection, and `tickGun` stays W-4b's.
5. **`pewFire`'s order (spec §6):** stale-tick, `not-at-weapons`, `unavailable` without a pew, `unavailable` in AUTO (W-4b), then **`missile-in-flight`** (new), then the noop, then `pewReady`. The reason is in `COMMAND_REASONS` already (`net/contracts.ts`, used by `laserCharge` and `laserFire`).
6. **The app stops using LMB for fire during a flight.** At the Hound's seat, while the crew's MANUAL torpedo flies (the local state, or the replica online):
   - a left click fires nothing and launches nothing (`flightFrame.clicks` false). The scene still reports it, but the runtime drops it, because the press is the start of a steer. So no `missile-in-flight` refusal is ever shown for it;
   - the held trigger sends no `gunHeld`;
   - LMB held steers through `torpHeading`.
   The sim gates (Task 3) are the authority's guarantee, and these app gates keep the client from sending what the sim would drop.
7. **The fresh press is a latch on the trigger only.** A left click is a press event (`PointerSource.takeClick`), so a button held across the flight's end makes no new click: it can neither fire the pew nor launch a second torpedo. Only the held trigger (the autocannon) could carry over. So `flightFrame` sets `stale` when the flight ends with the trigger held, and clears it once the trigger is released. While `stale`, the trigger counts as released.
8. **The selection returns on the flight's end frame, before this frame's keys.** If `weaponSel` is the torpedo (2) when the latch sees the flight end, it becomes `lastGunSel` (W-4a's: the last of 0 or 1 selected, 0 by default). A select key pressed on the same frame then wins, because `nextWeaponSel` runs after `flightFrame`. Both runtimes already keep `lastGunSel` (W-4a: local Task 10, online Task 11). **A stated deviation from spec §7's wording:** the spec says "if the torpedo was selected at launch"; this plan tests the selection at the flight's end. Since A/D and 1-3 select during a flight (spec §7), the selection at the end is the gunner's latest intent: a gunner who launched with F on a gun and then pressed 3 mid-flight gets the gun back, and one who launched with the torpedo selected and then pressed A keeps the gun they chose. No launch-time state is needed.
9. **`torpHold` is cleared only when no MANUAL torpedo flies** (or off the Weapons seat, a new round, a sit or stand, and an attach online, as today). A/D no longer clear it. A pointer over the torpedo's own marker gives no bearing (`torpedoSteer` returns null, as `helmSteer` does on the ship), so the last heading stands. W-3's "a right click on the torpedo clears the hold" goes with the right button.
10. **The online prediction (W-4b's `turret(slot)`) counts 0 frames while a MANUAL torpedo flies**, read from the replica (spec §11's "from W-4c"). The replica's turret is drawn, and it holds while flying, since the authority holds a MAN turret.
11. **The additive proof uses the oracle's `same` mode.** W-4c adds and removes no hashed field: `torpTurn` was never state, and `Missile.manual` and `torpManual` stay. No oracle run (the scripted and passive gate seeds and the rematch) sends `torpMode` or `gunMode`. So Task 1's baseline must match Task 7's code field for field, and Task 7's bless leaves `duel-1.json` and `duel-rematch.json` byte for byte (only `basic.json`'s content digest moves). If a duel golden moves, the AUTO path changed: stop, never re-bless around it.
12. **The duel app smoke's seed** (`DUEL_TEST_SEED`) is re-picked in Task 8 only if step 3's forced round end times out at V + 1, by b7c0919e's search (seeds 1..8000, no flight or weapon input, the earliest decided round). The bump changes no run, so a re-pick should not be needed. If W-4a or W-4b moved the seed, Task 8 only verifies it.

---

### Task 1: The W-4c start: the version, the base, the oracle baseline and the gate numbers

**Files:**
- Modify: `docs/superpowers/research/2026-11-19-w4-report.md` (a `## W-4c` section)

**Interfaces:**
- Consumes: W-4a and W-4b executed on the branch; W-4a Task 1's `W4_BASE` and report file.
- Produces: `V` (SIM_VERSION now), `W4C_BASE` (a commit hash), the duel-oracle baseline at `W4C_BASE` (temp folder), the gate numbers at the W-4c start (Task 7 compares them character for character).

- [ ] **Step 1: Pre-flight**

Run: `git branch --show-current; git status --short -- src tests scripts docs`
Expected: `w4-weapons-controls`, and no output for the status: W-4b's last commit is in, and nothing is staged or modified. If the branch is wrong or the tree is dirty, stop and report to the controller.

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = <V>;`. Note V: 60 at the time of writing (Decision 1).

Run: `git log --oneline -3; git rev-parse --short=8 HEAD`
Expected: W-4b's last commit on top (its gate-entry commit). The short hash is `W4C_BASE`.

Run: `git grep -n "torpTurn" -- src | wc -l` and `git grep -n "export function slewTurrets\|turret: (slot: 0 | 1)\|export function predictTurret" -- src/renderer/src/sim/tactical/turret.ts src/renderer/src/app/duel/onlineSource.ts src/renderer/src/app/duel/weaponsSeat.ts`
Expected: a non-zero count, which is what Task 2 removes, and W-4b's `slewTurrets`, the online `turret(slot)` and `predictTurret` present (W-4b's "Seam for W-4c"). If either W-4b name is missing, stop and report: W-4c depends on them.

- [ ] **Step 2: The full suite at the W-4c start**

Run, one at a time: `npx tsc -b`; `npx electron-vite build`; `npx vitest run --maxWorkers=4`.
Expected: tsc clean; the build succeeds; every file PASS (a load-sensitive timeout is re-run alone). If anything fails, stop and report: W-4c starts from a green branch.

- [ ] **Step 3: The oracle baseline (Task 7's additive proof)**

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version <V>: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<R>`, `<T>` and `<F>`.

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: the canonical trace baseline line (the sector's per-tick trace and the copy of `tests/golden/basic.json` that Task 7's `golden` check reads; `scripts/golden/canonical-trace.ts` L16-L21), exit 0. Note its counts. Both baselines live in a temp folder keyed by this worktree (`scripts/golden/versionOnly.ts` L30), so they must be recorded here, on the branch.

- [ ] **Step 4: The gate numbers**

Run: `npx tsx scripts/duel-telemetry.ts`
Expected: ten seed lines, each with W-4a's added fields (pew rounds, gun rounds, launches, the hold end), then the gate summary. Copy the summary block and the `passive median` line.

Run: `npx tsx scripts/valkyrn-telemetry.ts`
Expected: the Valkyrn gate summary. Copy its summary lines.

- [ ] **Step 5: The report and commit**

In `docs/superpowers/research/2026-11-19-w4-report.md`, add at the end, using the Edit tool:

```markdown

## W-4c

- Start: `W4C_BASE` = <hash>, SIM_VERSION <V>.
- Oracle baseline at <hash>: <R> runs, <T> ticks, <F> named fields per tick.
- Gates at the W-4c start (Task 7 must print these exactly):
  <the duel-telemetry summary block and passive median>
  Valkyrn: <the valkyrn-telemetry summary lines>
```

Run: `head -c 64 docs/superpowers/research/2026-11-19-w4-report.md | od -c | head -1`
Expected: readable text, not `\0`.

```bash
git add docs/superpowers/research/2026-11-19-w4-report.md
git commit -m "docs(w4c): the W-4c start: base, oracle baseline counts and gate numbers at SIM_VERSION <V>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The oracle baseline records HEAD at `W4C_BASE`. This commit touches only the report, so the `same` check in Task 7 is unaffected. The check compares runs, not HEAD.

---

### Task 2: `torpTurn` goes: the sim, the wire, the authority and the app's A/D steer

**Files:**
- Modify: `src/renderer/src/sim/tactical/manualTorpedo.ts`, `sim/tactical/weapons.ts` (`ShipInput`, `IDLE_INPUT`, `UNCREWED_INPUT`), `sim/tactical/hunter.ts` (its literal), `sim/tactical/duel.ts` (the missile loop), `sim/duel/step.ts` (`heldTorpSteer` → `heldTorpHeading`, the crew literal)
- Modify: `src/renderer/src/net/contracts.ts` (`HeldInput`), `net/codec.ts` (the held schema), `authority/checkpoint.ts`, `authority/duelCheckpoint.ts`, `authority/replay.ts`, `authority/core.ts`
- Modify: `src/renderer/src/app/duel/runtime.ts` (`frame`'s held build), `app/duel/onlineDuel.ts` (`heldChanged`, the pump's held build)
- Modify (kind a): `tests/manualTorpedoCommands.test.ts`, `tests/manualTorpedoFlight.test.ts`, `tests/manualTorpedoMode.test.ts`, `tests/manualTorpedoInput.test.ts`, `tests/onlineDuelSession.test.ts`, and any other file `git grep -ln "torpTurn" -- tests` lists

**Interfaces:**
- Consumes: `holdTurn(heading, h)` (`sim/tactical/hunter.ts`), `manualTorpedoFlying`, `NO_HELD` (step.ts), W-4a's `heldWeaponSel` and W-4b's crew literal in `step.ts`.
- Produces: `manualTorpTurn(m, heading)`, `heldTorpHeading(h)`, `HeldInput` and `ShipInput` without `torpTurn`.

- [ ] **Step 1: Rewrite the W-3 tests to the new law (the failing tests)**

`tests/manualTorpedoFlight.test.ts`:
- The pure-law case: replace

```ts
    expect([manualTorpTurn(m, -1, 64), manualTorpTurn(m, 1, 192), manualTorpTurn(m, 0.4, 192)]).toEqual([-1, 1, 1]);
    expect([manualTorpTurn(m, 0, 64), manualTorpTurn(m, 0, 192), manualTorpTurn(m, 0, 0)]).toEqual([1, -1, 0]);
    expect([manualTorpTurn(m, 0, -1), manualTorpTurn(m, 0, 256), manualTorpTurn(m, 0, 1.5), manualTorpTurn(m, Number.NaN, -1)]).toEqual([0, 0, 0, 0]);
```

with

```ts
    // W-4 spec §7: A/D steering is gone; only the held heading turns it (holdTurn, W-3's band).
    expect([manualTorpTurn(m, 64), manualTorpTurn(m, 192), manualTorpTurn(m, 0)]).toEqual([1, -1, 0]);
    expect([manualTorpTurn(m, -1), manualTorpTurn(m, 256), manualTorpTurn(m, 1.5), manualTorpTurn(m, Number.NaN)]).toEqual([0, 0, 0, 0]);
```

- Every other `manualTorpTurn(m, 0, h)` becomes `manualTorpTurn(m, h)`.
- In "flies a MANUAL torpedo by its ship's Weapons input only": replace `stepDuel(st, { ...IDLE_INPUT, torpTurn: 1 })` with `stepDuel(st, { ...IDLE_INPUT, torpHeading: 64 })`. The expected heading stays `Math.floor(10 * classOf(st, 0).slots.missile.turnStepsPerTick)`: a hold toward 64 from 0 turns by +1 each tick, as `torpTurn: 1` did, so W-3's numbers stay. Replace `{ ...IDLE_INPUT, weapons: false, torpTurn: 1, torpHeading: 64 }` with `{ ...IDLE_INPUT, weapons: false, torpHeading: 64 }`.
- In "keeps the mode it launched with", both `{ ...IDLE_INPUT, torpTurn: 1 }` (L105 and L113) become `{ ...IDLE_INPUT, torpHeading: 64 }`. The expectations stay: a hold toward 64 from 0 is +1 a tick, as `torpTurn: 1` was, and the AUTO twin ignores the steer either way.
- The file's header (L3-L4, "A and D turn it at the torpedo's turn rate, and a held heading turns it …") becomes "A held heading turns it by the Helm's hold law until the nose is on it (W-4 spec §7: the LMB steer sets it; A/D steering is gone)". `tests/manualTorpedoInput.test.ts`'s header (L4-L5) gets the same change, citing W-4 spec §7.

`tests/manualTorpedoMode.test.ts`: `expect([input.torpTurn, input.torpHeading]).toEqual([0, -1])` becomes `expect(['torpTurn' in input, input.torpHeading]).toEqual([false, -1])` (W-4 spec §7).

`tests/manualTorpedoCommands.test.ts`:
- Header comment: "The codec round-trips torpMode and the held torpHeading (W-4 spec §7: torpTurn is gone, and a frame carrying it is malformed)".
- Import `heldTorpHeading` in place of `heldTorpSteer`.
- "the held frame carries …" becomes:

```ts
  it('the held frame carries torpHeading −1..255, integers only; a frame carrying torpTurn is malformed (W-4 spec §7)', () => {
    for (const good of [{ torpHeading: 40 }, { torpHeading: -1 }, { torpHeading: 255 }]) expect(codec.decodeMessage(raw(frame(good)))).toEqual(frame(good));
    for (const bad of [{ torpTurn: 1 }, { torpTurn: 0 }, { torpTurn: 1, torpHeading: 40 }, { torpHeading: 256 }, { torpHeading: -2 }, { torpHeading: 2.5 }])
```

  Keep the loop body the existing `bad` loop already has.
- The `heldTorpSteer` case becomes:

```ts
  it('heldTorpHeading: a whole heading index or none (W-4 spec §7)', () => {
    expect(heldTorpHeading(NONE)).toBe(-1);
    expect([heldTorpHeading({ ...NONE, torpHeading: 40 }), heldTorpHeading({ ...NONE, torpHeading: 0 })]).toEqual([40, 0]);
    for (const bad of [256, -1, 1.5, Number.NaN]) expect(heldTorpHeading({ ...NONE, torpHeading: bad })).toBe(-1);
  });
```

- "the gunner's torpTurn turns the MANUAL torpedo; the standing player's does not" becomes "the gunner's torpHeading turns the MANUAL torpedo; the standing player's does not". Replace `{ ...NONE, torpTurn: 1 }` with `{ ...NONE, torpHeading: 64 }` in both `step(...)` calls, and keep the assertions: the turn sign and count are the same as `torpTurn: 1` from heading 0.
- In the authority cases, replace each `{ ...NONE, torpTurn: 1, torpHeading: 40 }` with `{ ...NONE, torpHeading: 40 }`.
  - `toMatchObject({ torpTurn: 1, torpHeading: 40 })` becomes `toMatchObject({ torpHeading: 40 })`.
  - `['torpTurn' in heldOf(l), 'torpHeading' in heldOf(l)]).toEqual([false, false])` becomes `('torpHeading' in heldOf(l)).toBe(false)`.
  - `[heldOf(e).torpTurn, heldOf(e).torpHeading]).toEqual([undefined, undefined])` becomes `heldOf(e).torpHeading).toBeUndefined()`.
  - The checkpoint's invalid case `{ ...NONE, torpTurn: 2 }` becomes `{ ...NONE, torpTurn: 1 }`: it is now an unknown key under `.strict()`, so it still throws.
  - In "a held torpHeading … rides into the checkpoint", the flight still turns toward 40.

`tests/manualTorpedoInput.test.ts`, the describe "the steering at Weapons (spec §3)". Replace both `it`s with:

```ts
  it('A/D no longer turn the flying MANUAL torpedo: no torpTurn goes out, its heading holds (W-4 spec §7)', () => {
    const { rt, tick, press, hold, gunner } = rig();
    try {
      apart(rt.duel.tactical);
      rt.duel.tactical.systems[0].torpManual = true;
      press('launch'); tick();
      const m = missileOf(rt.duel.tactical, 0)!;
      for (let k = 0; k < 30; k++) tick();   // past the boost
      const h0 = m.heading;
      hold(1);
      for (let k = 0; k < 30; k++) tick();
      expect('torpTurn' in gunner()).toBe(false);
      expect(m.heading).toBe(h0);
    } finally { rt.dispose(); }
  });
  it('the map\'s steer is torpHeading, re-sent every frame and kept after the button is let go, until the flight ends (W-4 spec §7)', () => {
    const torp = { at: null as number | null }, { rt, tick, press, gunner } = rig(torp);
    try {
      apart(rt.duel.tactical);
      rt.duel.tactical.systems[0].torpManual = true;
      press('launch'); tick();
      torp.at = 100; tick();
      expect(gunner()).toMatchObject({ torpHeading: 100 });
      tick();
      expect(gunner()).toMatchObject({ torpHeading: 100 });   // let go (no new bearing): the client re-sends the last one
      torp.at = 30; tick();
      expect(gunner()).toMatchObject({ torpHeading: 30 });
      removeMissile(rt.duel.tactical, 0); tick();   // the flight ends
      expect('torpHeading' in gunner()).toBe(false);
    } finally { rt.dispose(); }
  });
```

Add `removeMissile` to its `state` import.

`tests/onlineDuelSession.test.ts`: replace the `it('while the replica shows the MANUAL torpedo flying, A/D are torpTurn and the right button\'s heading is torpHeading', …)` body after `r.session.frame();` with:

```ts
    r.key('keydown', 'KeyD'); r.pump();
    expect('torpTurn' in c.helds().at(-1)!).toBe(false);   // W-4 spec §7: A/D no longer steer
    r.key('keyup', 'KeyD');
    h.sceneOpts[0]!.requests!.torpHeading(40); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpHeading: 40 });
    r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpHeading: 40 });   // re-sent while it holds
    r.key('keydown', 'KeyA'); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpHeading: 40 });   // A no longer clears it
    r.dispose();
```

Rename the `it` to `'while the replica shows the MANUAL torpedo flying, the map\'s steer is torpHeading and A/D send nothing for it (W-4 spec §7)'`.

Then run `git grep -ln "torpTurn" -- tests` and fix any other file the same way: an A/D steer case is kind (a), and a schema case drops the field.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/manualTorpedoCommands.test.ts tests/manualTorpedoFlight.test.ts tests/manualTorpedoMode.test.ts tests/manualTorpedoInput.test.ts tests/onlineDuelSession.test.ts`
Expected: FAIL. `heldTorpHeading` is not exported, `manualTorpTurn(m, 64)` reads 64 as the A/D turn, a `torpTurn` frame still decodes, and A/D still send `torpTurn`.

- [ ] **Step 3: The sim**

`sim/tactical/manualTorpedo.ts`: replace the header's "(A/D first, else the held heading by the Helm's hold law)" with "(the held heading by the Helm's hold law; W-4 spec §7: A/D steering is gone)". Replace `manualTorpTurn` with:

```ts
/** The turn (−1, 0 or 1) MANUAL torpedo m flies this tick: toward the held heading `heading` (a heading index 0..255; −1, a
 *  non-integer or out of range is none) by holdTurn, else none. W-4 spec §7: the gunner's LMB steer sends that heading. */
export function manualTorpTurn(m: Missile, heading: number): number {
  return Number.isInteger(heading) && heading >= 0 && heading < HEADING_COUNT ? holdTurn(m.heading, heading) : 0;
}
```

`sim/tactical/duel.ts`, in the missile loop: `manualTorpTurn(m, input.torpTurn, input.torpHeading)` becomes `manualTorpTurn(m, input.torpHeading)`.

`sim/tactical/weapons.ts`:
- In `ShipInput`, replace the W-3 doc and `torpTurn: number; torpHeading: number;` with:

```ts
  /** W-3 (pew pew spec §3), W-4 spec §7: the heading the Weapons attendant's MANUAL torpedo in flight holds this tick (a
   *  heading index 0..255, −1 none), from the held frame's torpHeading (the LMB steer). Every other input sets −1. Read
   *  only while the ship's torpedo in flight is MANUAL (duel.ts). */
  torpHeading: number;
```

- In `IDLE_INPUT` and `UNCREWED_INPUT`, delete `torpTurn: 0, `.

`sim/tactical/hunter.ts`, in the `const input: ShipInput = { ... }` literal: delete `torpTurn: 0, `. Hunter behaviour is unchanged, since the field was never read for it.

`sim/duel/step.ts`:
- Replace `heldTorpSteer` (its doc and body) with:

```ts
/** W-3 (pew pew spec §3), W-4 spec §7: the heading a held frame's torpHeading asks a MANUAL torpedo to hold: a heading index
 *  0..255 (absent, −1, a non-integer or out of range: −1, none). */
export function heldTorpHeading(h: HeldInput): number {
  const a = h.torpHeading;
  return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < HEADING_COUNT ? a : -1;
}
```

- Delete the line `const steer = gunner >= 0 ? heldTorpSteer(input.held[gunner] ?? NO_HELD) : { turn: 0, heading: -1 };   // W-3: only Weapons' attendant flies the MANUAL torpedo`.
- In the `crew` literal (W-4a's, with W-4b's `turretAim`), replace `torpTurn: steer.turn, torpHeading: steer.heading` with `torpHeading: gunner >= 0 ? heldTorpHeading(gunnerHeld) : -1` (W-4a's `gunnerHeld` is the Weapons attendant's held frame). Add "W-4: only Weapons' attendant flies the MANUAL torpedo" to the line's comment.

- [ ] **Step 4: The wire and the authority**

`net/contracts.ts`, `HeldInput`: delete `torpTurn?: number; `. In its doc comment, replace "W-3 (pew pew spec §3): `torpTurn` the MANUAL torpedo's A/D (−1, 0 or 1; absent 0) and `torpHeading` the heading it holds (0..255; −1 or absent none)" with "W-3 (pew pew spec §3), W-4 spec §7: `torpHeading` the heading the MANUAL torpedo holds (0..255; −1 or absent none), from the Weapons seat's LMB steer". In "`gunHeld`, `torpTurn` and `torpHeading` from Weapons'", drop `torpTurn`.

`net/codec.ts`, the `held` schema: delete `torpTurn: z.number().int().min(-1).max(1).optional(), ` and change "torpTurn, torpHeading: W-3" in its comment to "torpHeading: W-3 (W-4: torpTurn removed)".

`authority/checkpoint.ts` (the `held` array's object), `authority/duelCheckpoint.ts` and `authority/replay.ts` (each `const held = z.object({ ... })`): delete `torpTurn: z.number().int().min(-1).max(1).optional(), ` from each.

`authority/core.ts`:
- In the expiry condition, delete `h.torpTurn !== undefined || `.
- In the pause clear, delete `delete h.torpTurn; `, and change "W-3: and the torpedo's steering" to "W-3: and the torpedo's held heading".

- [ ] **Step 5: The app's held build**

`app/duel/runtime.ts`, in `frame`, replace the W-3 block

```ts
      // W-3 (pew pew spec §3): at Weapons, while the crew's MANUAL torpedo flies, A/D turn it (torpTurn) and the map's right
      // button gives it a heading to hold (torpHold, re-sent every frame) until A or D, a right click on it or the flight's end clears it.
      const torpSteering = seatNow === 'weapons' && !ended() && manualTorpedoFlying(d.tactical), torpTurn = torpSteering ? Math.sign(k.moveX) || 0 : 0;
      if (!torpSteering || torpTurn !== 0) torpHold = -1; else if (torpNow !== null) torpHold = torpNow;
```

with

```ts
      // W-3 (pew pew spec §3), W-4 spec §7: at Weapons, while the crew's MANUAL torpedo flies, the map's LMB steer gives it a heading
      // to hold (torpHold, re-sent every frame; letting go keeps the last one) until the flight ends. A/D no longer steer it.
      const torpSteering = seatNow === 'weapons' && !ended() && manualTorpedoFlying(d.tactical);
      if (!torpSteering) torpHold = -1; else if (torpNow !== null && torpNow >= 0) torpHold = torpNow;
```

In the `activeHeld` literal, replace `...(torpTurn !== 0 ? { torpTurn } : {}), ...(torpHold >= 0 ? { torpHeading: torpHold } : {}) };   // W-3` with `...(torpHold >= 0 ? { torpHeading: torpHold } : {}) };   // W-3, W-4 spec §7`.

`app/duel/onlineDuel.ts`:
- `heldChanged`: delete `|| a.torpTurn !== b.torpTurn`.
- In the pump, replace

```ts
    // W-3 (pew pew spec §3): at Weapons, while the replica shows the crew's MANUAL torpedo flying, A/D turn it (torpTurn) and the
    // map's right button gives it a heading to hold (torpHold, re-sent every pump) until A or D, a click on it or the flight's end clears it.
    const torpSteering = !decided && seatOf(d, me) === 'weapons' && manualTorpedoFlying(d.tactical), torpTurn = torpSteering ? Math.sign(k.moveX) || 0 : 0;
    if (!torpSteering || torpTurn !== 0) torpHold = -1; else if (torpNow !== null) torpHold = torpNow;
```

  with

```ts
    // W-3 (pew pew spec §3), W-4 spec §7: at Weapons, while the replica shows the crew's MANUAL torpedo flying, the map's LMB steer
    // gives it a heading to hold (torpHold, re-sent every pump; letting go keeps the last one) until the flight ends.
    const torpSteering = !decided && seatOf(d, me) === 'weapons' && manualTorpedoFlying(d.tactical);
    if (!torpSteering) torpHold = -1; else if (torpNow !== null && torpNow >= 0) torpHold = torpNow;
```

  In the `const held: HeldInput = { ...sessionHeld(...), ... }` line (as W-4a Task 11 Step 7 and W-4b left it), delete `...(torpTurn !== 0 ? { torpTurn } : {}), `.

Until Task 4, the right button's W-3 heading still reaches `torpHold` through `takeTorpHeading`, and its −1 "clear" is now ignored (`torpNow >= 0`, Decision 9). Task 4 replaces that source with the LMB steer.

Also in `src/renderer/src/net/contracts.ts`, the `torpMode` doc (L112) "flown by the Weapons seat's held torpTurn and torpHeading" becomes "flown by the Weapons seat's held torpHeading (W-4 spec §7: the LMB steer)". The `HeldInput` doc (L32-L38) drops its `torpTurn` clause the same way.

- [ ] **Step 6: Run**

Run: `npx tsc -b`
Expected: no errors. A leftover `torpTurn` or `heldTorpSteer` is a type error, so tsc finds every reader.

Run: `git grep -n "torpTurn\|heldTorpSteer" -- src`
Expected: no output. (`tests/` keeps the negative asserts this task adds: `'torpTurn' in …` and the malformed `torpTurn` frames.)

Run: `npx vitest run tests/manualTorpedoCommands.test.ts tests/manualTorpedoFlight.test.ts tests/manualTorpedoMode.test.ts tests/manualTorpedoInput.test.ts tests/onlineDuelSession.test.ts tests/manualTorpedoScene.test.ts tests/w4PewFire.test.ts tests/duelCheckpoint.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts tests/tacticalHunter.test.ts`
Expected: all PASS. `manualTorpedoScene.test.ts` still tests W-3's right button, which Task 4 replaces. It still passes here, because the scene is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/manualTorpedo.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/duel/step.ts src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/authority/checkpoint.ts src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/authority/replay.ts src/renderer/src/authority/core.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts tests/manualTorpedoCommands.test.ts tests/manualTorpedoFlight.test.ts tests/manualTorpedoMode.test.ts tests/manualTorpedoInput.test.ts tests/onlineDuelSession.test.ts
git commit -m "feat(w4c): torpTurn goes from the sim, the wire, the authority and the app; a MANUAL torpedo turns only toward its held heading (W-4 spec §7)" -m "Kind (a): the W-3 A/D steering tests rewritten to the held heading (manualTorpedoCommands, manualTorpedoFlight, manualTorpedoMode, manualTorpedoInput, onlineDuelSession)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The guns during a MANUAL flight (sim): no MAN slew, no trigger, `pewFire` refused; AUTO fights on

**Files:**
- Modify: `src/renderer/src/sim/duel/step.ts` (the crew's `gunHeld`, `pewFire`'s admission), `src/renderer/src/sim/tactical/turret.ts` (`slewTurrets`' MAN branch)
- Create: `tests/w4Flight.test.ts`

**Interfaces:**
- Consumes: `manualTorpedoFlying(state, i?)` (`sim/tactical/manualTorpedo.ts`), `hasTurret(cls)` (defs.ts, W-4a), `placeMissile(state, i, f, manual)` (state.ts), W-4b's `slewTurrets(state, i, input)`, `gunsManual`, `pewTurret`, `gunTurret`, `ShipInput.turretAim`, `gunMode` admission, W-4a's `houndWeapons` test helper and `createSeatedDuel(layout, seed, helm?, crew?, cls?)` (`tests/helpers/duelSeat.ts`).
- Produces: the flight gates the app relies on (Task 5) and the gate entry checks (Task 7).

- [ ] **Step 1: Write the failing test**

```ts
// W-4 spec §3.4, §6, §7 (W-4c): while the crew's MANUAL torpedo flies, MAN guns neither aim nor fire: no MAN slew toward the
// reticle, the held trigger fires no autocannon round, and pewFire is refused missile-in-flight (after the AUTO refusal, before
// the noop); AUTO guns keep slewing and firing; gunMode still toggles. An AUTO torpedo in flight changes nothing. The
// Valkyrn's trigger is unchanged (it never flies a MANUAL torpedo, and its gun is no turret).
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { placeMissile, removeMissile } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';

const CUTTER = parseShip(cutter), N: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const env = (d: DuelState, player: number, command: DuelCommand, seq: number) => ({ runId: 'duel', id: { player, sequence: seq }, requestedTick: d.interior.tick, command });
/** A seated Hound duel: Weapons 3 bars on pew 1 / autocannon 1 / torpedo 1, the enemy far off (no AUTO solution unless placed). */
function hound(): { d: DuelState; g: number } {
  const d = createSeatedDuel(CUTTER, 5), s = d.tactical.systems[0]!;
  s.bars[1] = 3; s.weaponPower = [1, 1, 1];
  Object.assign(d.tactical.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(d.tactical.ships[1], { x: 3000, y: -3000, vx: 0, vy: 0 });
  return { d, g: 1 - d.helmPlayer };
}
/** The crew's torpedo in flight, past its boost, far from anything. */
const fly = (d: DuelState, manual: boolean): void => { placeMissile(d.tactical, 0, { x: -2000, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, manual); };
const held = (d: DuelState, g: number, h: Partial<HeldInput>): HeldInput[] => { const out = [N, N]; out[g] = { ...N, ...h }; return out; };

describe('the guns during a MANUAL flight (W-4 spec §7)', () => {
  it('MAN: the reticle slews nothing and the trigger fires nothing while it flies; both work again once it ends', () => {
    const { d, g } = hound();
    try {
      const s = d.tactical.systems[0]!;
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', manual: true }, 1)] });
      expect(s.gunsManual).toBe(true);
      fly(d, true);
      const east = 16384;   // a fine aim due east (a quarter turn)
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(d, g, { weaponSel: 1, gunHeld: true, turretAim: east }), commands: [] });
      expect([s.gunTurret, s.gunShots]).toEqual([0, 0]);
      removeMissile(d.tactical, 0);
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(d, g, { weaponSel: 1, gunHeld: true, turretAim: east }), commands: [] });
      expect(s.gunTurret).toBeGreaterThan(0);
      expect(s.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
  it('pewFire is refused missile-in-flight in MAN, after the AUTO refusal and before the noop; gunMode is still admitted', () => {
    const { d, g } = hound();
    try {
      const s = d.tactical.systems[0]!;
      fly(d, true);
      let r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 1)] });
      expect([r[0]!.status, r[0]!.reason]).toEqual(['rejected', 'unavailable']);   // AUTO first (W-4b)
      r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', manual: true }, 2)] });
      expect([r[0]!.status, s.gunsManual]).toEqual(['applied', true]);   // Z works during a flight
      r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 3), env(d, g, { kind: 'pewFire' }, 4)] });
      expect(r.map((x) => [x.status, x.reason ?? null])).toEqual([['rejected', 'missile-in-flight'], ['rejected', 'missile-in-flight']]);
      expect(s.pewShots).toBe(0);
      removeMissile(d.tactical, 0);
      r = stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'pewFire' }, 5)] });
      expect(r[0]!.status).toBe('applied');
    } finally { disposeDuel(d); }
  });
  it('an AUTO torpedo in flight leaves MAN aim and fire alone', () => {
    const { d, g } = hound();
    try {
      const s = d.tactical.systems[0]!;
      stepDuelTick(d, { held: [], commands: [env(d, g, { kind: 'gunMode', manual: true }, 1)] });
      fly(d, false);
      for (let k = 0; k < 20; k++) stepDuelTick(d, { held: held(d, g, { weaponSel: 1, gunHeld: true, turretAim: 16384 }), commands: [] });
      expect(s.gunTurret).toBeGreaterThan(0);
      expect(s.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
  it('AUTO guns keep slewing and firing at a hostile ship in range while a MANUAL torpedo flies', () => {
    const { d, g } = hound();
    try {
      const t = d.tactical, s = t.systems[0]!;
      t.hostileAt = 0;   // past the hold (W-4 spec §4.3): AUTO may fire
      Object.assign(t.ships[1], { x: 150, y: 1500 - 300, vx: 0, vy: 0 });   // seen, inside 450 and 600, off the nose to starboard, inside both arcs
      fly(d, true);
      for (let k = 0; k < 120; k++) stepDuelTick(d, { held: held(d, g, {}), commands: [] });
      expect(s.gunTurret).not.toBe(0);
      expect(s.pewShots + s.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
  it('the Valkyrn\'s trigger is today\'s: it fires with a MANUAL torpedo of its own in flight (no turret, no flight gate)', () => {
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn), g = 1 - v.helmPlayer;
    try {
      fly(v, true);
      for (let k = 0; k < 20; k++) stepDuelTick(v, { held: held(v, g, { gunHeld: true }), commands: [] });
      expect(v.tactical.systems[0]!.gunShots).toBeGreaterThan(0);
    } finally { disposeDuel(v); }
  });
});
```

If the AUTO case's geometry gives no solution (the arc, the fog, the line of sight), move the enemy as W-4b's `tests/w4Auto.test.ts` places its "fires on solution" target, and keep the assertion.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/w4Flight.test.ts`
Expected: FAIL. The MAN case slews and fires during the flight, and `pewFire` reads `noop` / `unavailable`, not `missile-in-flight`.

- [ ] **Step 3: The step**

`sim/duel/step.ts`:
1. Add `import { manualTorpedoFlying } from '../tactical/manualTorpedo';` if step.ts does not already import it.
2. W-4a's trigger line reads `const trigger = gunner >= 0 && gunnerHeld.gunHeld === true && (!hasTurret(classOf(d.tactical, 0)) || weaponSel === WeaponSlot.Autocannon);`. Replace it with:

```ts
  // W-4 spec §8: on a turret class (the Hound) the trigger fires the autocannon only while it is the selected weapon, and
  // (W-4 spec §7) never while the crew's MANUAL torpedo flies as the tick starts; elsewhere today's rule.
  const turretClass = hasTurret(classOf(d.tactical, 0)), flying = turretClass && manualTorpedoFlying(d.tactical);
  const trigger = gunner >= 0 && gunnerHeld.gunHeld === true && (!turretClass || (weaponSel === WeaponSlot.Autocannon && !flying));
```

3. In the `pewFire` branch of the `WEAPON_ORDER` loop, insert directly after W-4b's AUTO refusal, which is the line that answers `unavailable` while `!d.tactical.systems[0].gunsManual`:

```ts
      if (manualTorpedoFlying(d.tactical)) { result(e, 'missile-in-flight'); continue; }   // W-4 spec §6, §7: MAN guns are quiet while the MANUAL torpedo flies
```

So the order is the spec's: stale, seat, no pew, AUTO, `missile-in-flight`, the noop (`crew.pewTrigger`), `pewReady`.

- [ ] **Step 4: The turret**

`sim/tactical/turret.ts`, in `slewTurrets(state, i, input)` (W-4b): find the MAN branch, which slews the selected gun toward `input.turretAim` at its MAN traverse while `state.systems[i].gunsManual`. Add the flight to its condition, so that MAN holds both turrets while the ship's own MANUAL torpedo flies:

```ts
  // W-4 spec §3.4, §7: while the crew's MANUAL torpedo flies, MAN guns hold (the reticle is ignored); AUTO is untouched.
  if (missileOf(state, i)?.manual === true) continue;   // the first statement of W-4b's MAN branch (`if (s.gunsManual) { ... }`), inside its per-gun loop: hold this gun
```

Write the check inline: `if (missileOf(state, i)?.manual === true) continue;`. Do not import `manualTorpedo.ts` into `turret.ts`: that would close a cycle, turret.ts → manualTorpedo.ts → hunter.ts → weapons.ts → turret.ts (hunter.ts L16 imports weapons.ts, and W-4b's weapons.ts imports `slewTurrets`). Add `missileOf` to `turret.ts`'s import from `./state` if W-4b did not import it. Place it as the MAN branch's first statement (W-4b's "Seam for W-4c": `if (s.gunsManual) { ... }` inside `for (const gun of ['pew', 'gun'] as const)`). The AUTO branch is not touched.

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4Flight.test.ts tests/w4Turret.test.ts tests/w4Auto.test.ts tests/w4Manual.test.ts tests/w4PewFire.test.ts tests/manualTorpedoMode.test.ts tests/manualTorpedoCommands.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts tests/valkyrnRounds.test.ts`
Expected: tsc clean; all PASS. W-4b's tests (`w4Turret`, `w4Auto`, `w4Manual`) have no MANUAL flight in them, so they are unchanged. If one launches a MANUAL torpedo and expects MAN fire, it is kind (a): rewrite it with an AUTO torpedo, citing W-4 spec §7.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/duel/step.ts src/renderer/src/sim/tactical/turret.ts tests/w4Flight.test.ts
git commit -m "feat(w4c): while the MANUAL torpedo flies, MAN guns neither aim nor fire and pewFire is refused missile-in-flight; AUTO fights on (W-4 spec §3.4, §6, §7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The LMB steer on the map, and the right button pans at Weapons again

**Files:**
- Modify: `src/renderer/src/app/duel/flightPointer.ts` (`torpedoSteer`), `app/duel/scene.ts` (the W-3 right-button block goes; the LMB steer block), `app/duel/runtime.ts` (`cameraInput.apply`'s `aims` at Weapons), `app/duel/onlineSource.ts` (the same)
- Modify (kind a): `tests/manualTorpedoScene.test.ts` (rewritten for LMB), `tests/flightPointer.test.ts` (a `torpedoSteer` case)

**Interfaces:**
- Consumes: `helmSteer`, `onWeaponsMap(p, contactShown, statusRows)`, `pickRadius(zoom)`, `headingOf(dx, dy)` (all already imported by `flightPointer.ts`), `interpolatedMissile(state, prev, alpha, i)`, `worldToScreen`, `readoutRows(...)`, `manualTorpedoFlying`, the scene options `leftHeld?()` and `pointer?()`, and `MapRequests.torpHeading(h)` / `takeTorpHeading()`.
- Produces: `torpedoSteer(i)`; the scene's LMB steer into `MapRequests.torpHeading`.

- [ ] **Step 1: Write the failing tests**

`tests/flightPointer.test.ts`, a new describe (import `torpedoSteer` beside the file's existing imports, and reuse its own constants for an open-map point and a Weapons-block point; read the file's top for them):

```ts
describe('torpedoSteer (W-4 spec §7)', () => {
  it('the bearing from the torpedo\'s marker to the pointer on the open Weapons map; null on the marker, off the map or over a block', () => {
    const torpedo = { x: 640, y: 300 };
    expect(torpedoSteer({ pointer: { x: 740, y: 300 }, torpedo, zoom: 1, contactShown: false, statusRows: 0 })).toBe(64);   // east
    expect(torpedoSteer({ pointer: { x: 640, y: 200 }, torpedo, zoom: 1, contactShown: false, statusRows: 0 })).toBe(0);    // north
    expect(torpedoSteer({ pointer: torpedo, torpedo, zoom: 1, contactShown: false, statusRows: 0 })).toBeNull();            // on it: the last bearing stands
    expect(torpedoSteer({ pointer: null, torpedo, zoom: 1, contactShown: false, statusRows: 0 })).toBeNull();
    expect(torpedoSteer({ pointer: { x: -5, y: 300 }, torpedo, zoom: 1, contactShown: false, statusRows: 0 })).toBeNull();
  });
});
```

If (640, 200) or (740, 300) falls on a Weapons block in `consoleLayout`, use points the file's existing `onWeaponsMap` cases treat as open map. Add one case over a block (the file's existing block point), expecting `null`.

`tests/manualTorpedoScene.test.ts`: rewrite it for the left button.
- Header comment: "W-4 spec §7 (W-4c): the scene turns the Weapons seat's held left button into the MANUAL torpedo's held heading (the bearing from the torpedo's drawn marker to the pointer, every frame while held). On the torpedo itself, over a console block, with a weapon picked up, or with an AUTO torpedo or none, it asks nothing. The right button no longer steers it. In Single player the Weapons camera follows it."
- In `rig()`, add `let left = false, ptr: { x: number; y: number } | null = null;`. Pass `pointer: () => ptr, leftHeld: () => left` to `createDuelScene` (replacing `pointer: () => null`). Keep `takeAim` as it is.
- Replace `aim` with:

```ts
  /** One drawn frame with the left button held at p, or let go (null). */
  const steer = (p: { x: number; y: number } | null): void => { left = p !== null; ptr = p; scene.draw(rt, 1 / 60, LIVE); };
  /** One drawn frame with the right button pressed at p (W-3's old steer; now nothing at Weapons). */
  const right = (p: { x: number; y: number }): void => { aimNow = { x: p.x, y: p.y, press: true, release: false, held: true }; scene.draw(rt, 1 / 60, LIVE); };
```

  Return `steer` and `right` in place of `aim`.
- The first describe becomes `describe('the left button while a MANUAL torpedo flies (W-4 spec §7)', …)` with:

```ts
  it('asks for the bearing from the torpedo\'s marker every held frame; on the torpedo or over a console block, nothing', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('weapons');
      r.steer(null);   // a first frame: the sit framing settles
      r.launch();
      const m = r.marker();
      r.steer({ x: m.x + 100, y: m.y });
      expect(r.requests.takeTorpHeading()).toBe(64);   // east of the torpedo
      r.steer({ x: m.x + 100, y: m.y });
      expect(r.requests.takeTorpHeading()).toBe(64);   // held: asked again every frame
      r.steer({ x: m.x, y: m.y - 100 });
      expect(r.requests.takeTorpHeading()).toBe(0);
      r.steer({ x: m.x, y: m.y });
      expect(r.requests.takeTorpHeading()).toBeNull();   // on the torpedo: nothing (the last heading stands)
      r.steer({ x: STATION.x + 20, y: stationTop('weapons') + 10 });   // over the Weapons block: not the map
      expect(r.requests.takeTorpHeading()).toBeNull();
      r.steer(null);   // let go
      expect(r.requests.takeTorpHeading()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('asks nothing while a weapon is picked up', () => {
    const r = rig();
    try {
      r.steer(null);
      r.launch();
      const m = r.marker();
      r.contact.pickUp('torpedo');
      r.steer({ x: m.x + 100, y: m.y });
      expect(r.requests.takeTorpHeading()).toBeNull();
      r.contact.close();
      r.steer({ x: m.x + 100, y: m.y });
      expect(r.requests.takeTorpHeading()).toBe(64);
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('the right button no longer steers it (W-4 spec §7: at Weapons it pans)', () => {
    const r = rig();
    try {
      r.steer(null);
      r.launch();
      const m = r.marker();
      r.right({ x: m.x + 100, y: m.y });
      expect(r.requests.takeTorpHeading()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('asks nothing with an AUTO torpedo or none flying', () => {
    const r = rig();
    try {
      r.steer(null);
      const s = worldToScreen(r.rt.cameras.weapons, vp, r.rt.duel.tactical.ships[0].x, r.rt.duel.tactical.ships[0].y);
      r.steer({ x: s.x + 100, y: s.y });
      expect(r.requests.takeTorpHeading()).toBeNull();
      r.launch(false);
      r.steer({ x: s.x + 100, y: s.y });
      expect(r.requests.takeTorpHeading()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
```

  The camera and map-request describes stay as they are.

Add a pan case to the same file. In `rig()`, replace `samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),` with a settable sample:

```ts
    samplePointer: () => { const v = ptr; ptr = NO_PTR; return v; },
```

Declare it above `createDuelRuntime`: `const NO_PTR: PointerSample = { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }; let ptr: PointerSample = NO_PTR;`. Import `type PointerSample` from `../src/renderer/src/app/duel/input`. Return `drag: (v: PointerSample): void => { ptr = v; }` with the rig's other members. Then:

```ts
describe('the right button pans the Weapons map during a MANUAL flight (W-4 spec §7, §9)', () => {
  it('a right drag moves the Weapons camera with a MANUAL torpedo flying', () => {
    const r = rig();
    try {
      r.launch(true); r.tick();
      const cam = r.rt.cameras.weapons;
      expect(cam.follow).toBe('missile');
      const cx = cam.centreX, z = cam.zoom;
      r.drag({ x: 600, y: 300, wheel: 0, dragX: 40, dragY: 0, rightX: 40, rightY: 0 }); r.rt.frame(1 / 60);
      expect(cam.follow).toBe('free');   // camera.ts pan: a drag stops the follow (torpedoCamera keeps a pan during a flight)
      expect(cam.centreX).toBeCloseTo(cx - 40 / z, 6);
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/flightPointer.test.ts tests/manualTorpedoScene.test.ts`
Expected: FAIL. `torpedoSteer` is not exported, the left button asks nothing, the right button still asks, and the right drag does not pan.

- [ ] **Step 3: `torpedoSteer`**

`app/duel/flightPointer.ts`, after `helmSteer`:

```ts
/** W-4 spec §7: the bearing the held left button steers the crew's MANUAL torpedo to on the Weapons map: from the torpedo's
 *  drawn marker to the pointer while it is on the open map (onWeaponsMap) and off the marker, else null (send nothing: the
 *  last bearing stands). The Helm's helmSteer, aimed from the torpedo instead of the ship. */
export function torpedoSteer(i: { pointer: Point | null; torpedo: Point; zoom: number; contactShown: boolean; statusRows: number }): number | null {
  const p = i.pointer;
  return p && onWeaponsMap(p, i.contactShown, i.statusRows) && Math.hypot(p.x - i.torpedo.x, p.y - i.torpedo.y) > pickRadius(i.zoom) ? headingOf(p.x - i.torpedo.x, p.y - i.torpedo.y) : null;
}
```

(`flightPointer.ts` is app code, so `Math.hypot` is allowed. The determinism guard covers `sim/` only, and `helmSteer` already uses it.)

- [ ] **Step 4: The scene**

`app/duel/scene.ts`:
1. Delete the W-3 block that starts with the comment `// W-3 (pew pew spec §3): at Weapons, while the crew's MANUAL torpedo flies, the right button steers it: a press, every` and ends with that `if (aim && onMap && station === 'weapons' && … ) { … }` statement's closing brace. `lastAimed` stays: the Flight seat's block still reads it.
2. After the crew Helm's steer block (the one that ends `if (h !== null) { options.requests?.steer(h); steerTo = p; }   // final review M1: the marker only while a steer goes out` and its closing `}`), add:

```ts
      // W-4 spec §7 (W-4c): at Weapons, while the crew's MANUAL torpedo flies, the held left button steers it, every frame: the
      // bearing from the torpedo's drawn marker to the pointer while it is on the open map and off the marker (else the last
      // bearing stands). Not while a weapon is picked up (the button is the window's then).
      if (onMap && station === 'weapons' && view === 'weapons' && running && !overlay.layerPaused && manualTorpedoFlying(d.tactical)
        && (contact?.aimWeapon() ?? null) === null && (options.leftHeld?.() ?? false)) {
        const m = interpolatedMissile(d.tactical, source.missilePrev, alpha, CREW_SLOT);
        if (m) {
          const h = torpedoSteer({ pointer: options.pointer?.() ?? null, torpedo: worldToScreen(cam!, viewport, m.x, m.y), zoom: cam!.zoom, contactShown: shown,
            statusRows: readoutRows({ duel: d, mode: 'weapons', active: source.active(), console: onConsole }).length });
          if (h !== null) options.requests?.torpHeading(h);
        }
      }
```

   Add `torpedoSteer` to the `./flightPointer` import (`import { flightPointer, helmSteer, onWeaponsMap } from './flightPointer';`).
3. Update `MapRequests.torpHeading`'s doc in `app/duel/mapRequests.ts` to "W-3, W-4 spec §7: the MANUAL torpedo's held heading from the Weapons map's LMB steer (a heading index 0..255)".

- [ ] **Step 5: The right button pans at Weapons**

`app/duel/runtime.ts`, in `frame`: replace

```ts
      if (cam) cameraInput.apply(cam, k, pointer, shown === 'helm' || shown === 'flight' || (shown === 'weapons' && manualTorpedoFlying(d.tactical)));   // the Flight seat's right button is the torpedo, not a pan; W-3: at Weapons, a MANUAL torpedo's held heading
```

with

```ts
      if (cam) cameraInput.apply(cam, k, pointer, shown === 'helm' || shown === 'flight');   // the Flight seat's right button is the torpedo, not a pan; W-4 spec §7: at Weapons it pans again
```

`app/duel/onlineSource.ts`: replace

```ts
      if (keys && pointer) { if (cam) cameraInput.apply(cam, keys, pointer, view === 'helm' || (view === 'weapons' && manualTorpedoFlying(d.tactical))); else cameraInput.applyInterior(interiorCamera, keys, pointer); }   // W-3: at Weapons the right button steers a MANUAL torpedo
```

with

```ts
      if (keys && pointer) { if (cam) cameraInput.apply(cam, keys, pointer, view === 'helm'); else cameraInput.applyInterior(interiorCamera, keys, pointer); }   // W-4 spec §7: at Weapons the right button pans again
```

If `manualTorpedoFlying` is no longer used in either file after this (the camera follow line `trackManualTorpedo(..., manualTorpedoFlying(d.tactical))` still uses it), keep the import. tsc's unused-import check tells.

- [ ] **Step 6: Run**

Run: `npx tsc -b` then `npx vitest run tests/flightPointer.test.ts tests/manualTorpedoScene.test.ts tests/manualTorpedoInput.test.ts tests/onlineDuelSession.test.ts tests/feelIiInput.test.ts tests/duelRuntime.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts`
Expected: tsc clean; all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/app/duel/flightPointer.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineSource.ts tests/flightPointer.test.ts tests/manualTorpedoScene.test.ts
git commit -m "feat(w4c): the held left button flies the MANUAL torpedo toward the pointer; the right button pans the Weapons map again (W-4 spec §7)" -m "Kind (a): manualTorpedoScene's right-button steer rewritten for the left button." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The seat around a flight: A/D select, LMB is the steer, a fresh press after, the selection comes back; the prediction holds

**Files:**
- Modify: `src/renderer/src/app/duel/weaponsSeat.ts` (`FlightLatch`, `NO_FLIGHT`, `flightFrame`; `nextWeaponSel` loses `steering`)
- Modify: `src/renderer/src/app/duel/runtime.ts` (the Hound branch of `play`, `frame`'s held merge, the resets), `app/duel/onlineDuel.ts` (the same, plus `lastGunSel`), `app/duel/onlineSource.ts` (`turret(slot)`'s k = 0 gate)
- Modify: `tests/w4Input.test.ts` (`nextWeaponSel`'s two flight lines, kind a), `tests/w4Runtime.test.ts` and `tests/onlineDuelSession.test.ts` (the flight cases)
- Create: `tests/w4TorpedoSeat.test.ts`

**Interfaces:**
- Consumes: W-4a's `weaponSel`, `lastGunSel`, `triggerPrev`, `weaponsSeatHeld(sel, trigger)`, `MapRequests.triggerHeld()`, `DuelRuntimeDeps.triggerHeld?()`, `houndWeaponsSeat`, `WeaponSlot`; W-4b's Hound branch additions (Z → `gunMode`) and `onlineSource.turret(slot)` / `predictTurret`.
- Produces: `FlightLatch`, `NO_FLIGHT`, `flightFrame(...)`, `nextWeaponSel(sel, k)`.

- [ ] **Step 1: Write the failing tests**

`tests/w4Input.test.ts`, in "selectTo wins; A/D step with wrap; …":
- Rename it to `'selectTo wins; A/D step with wrap, during a MANUAL flight too (W-4 spec §7)'`.
- Remove the third argument from every `nextWeaponSel(…, false)` call.
- Replace the two `…, true)` lines with:

```ts
    expect(nextWeaponSel(1, k({ selectNext: 1 }))).toBe(2);   // W-4c: A/D select while a MANUAL torpedo flies
    expect(nextWeaponSel(1, k({ selectTo: 2 }))).toBe(2);
```

`tests/w4TorpedoSeat.test.ts`:

```ts
// W-4 spec §7 (W-4c): the Hound's Weapons seat around a MANUAL flight. The pure latch: no trigger and no left-click fire while
// it flies; when it ends, a torpedo selection goes back to the last gun and a trigger still held is stale until released.
// Then Single player and online: A/D select during a flight, LMB clicks fire nothing while it flies, the held trigger sends
// no gunHeld, Z still toggles, and the online turret prediction counts no frames.
import { describe, expect, it } from 'vitest';
import { flightFrame, NO_FLIGHT } from '../src/renderer/src/app/duel/weaponsSeat';

describe('flightFrame (W-4 spec §7)', () => {
  it('while flying: no trigger and no clicks; the selection is untouched', () => {
    const f = flightFrame(NO_FLIGHT, true, 2, 1, true);
    expect(f).toEqual({ latch: { flying: true, stale: false }, sel: 2, trigger: false, clicks: false });
  });
  it('the end frame: the torpedo selection returns to the last gun; a held trigger goes stale', () => {
    const f = flightFrame({ flying: true, stale: false }, false, 2, 1, true);
    expect(f).toEqual({ latch: { flying: false, stale: true }, sel: 1, trigger: false, clicks: true });
  });
  it('a gun selected at the end stays; a released trigger at the end is not stale', () => {
    expect(flightFrame({ flying: true, stale: false }, false, 0, 1, false)).toEqual({ latch: { flying: false, stale: false }, sel: 0, trigger: false, clicks: true });
  });
  it('stale until the trigger is released, then a fresh hold fires', () => {
    let f = flightFrame({ flying: false, stale: true }, false, 1, 1, true);
    expect([f.trigger, f.latch.stale]).toEqual([false, true]);
    f = flightFrame(f.latch, false, 1, 1, false);
    expect([f.trigger, f.latch.stale]).toEqual([false, false]);
    f = flightFrame(f.latch, false, 1, 1, true);
    expect([f.trigger, f.latch.stale]).toEqual([true, false]);
  });
  it('no flight at all: the trigger passes, clicks fire', () => {
    expect(flightFrame(NO_FLIGHT, false, 1, 1, true)).toEqual({ latch: NO_FLIGHT, sel: 1, trigger: true, clicks: true });
  });
});
```

Append to `tests/w4Runtime.test.ts` (W-4a's file-local `rig(cls?)` with W-4b's `aim` addition; import `removeMissile` from `../src/renderer/src/sim/tactical/state` and `DuelSystem` from `../src/renderer/src/sim/tactical/bars`):

```ts
describe('Single player around a MANUAL flight (W-4 spec §7)', () => {
  it('during a flight: A/D select, the held trigger and clicks do nothing, Z still toggles', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      sys.bars[DuelSystem.Weapons] = 3; sys.weaponPower = [1, 1, 1];
      r.press('weaponMode'); r.tick(); r.press('torpMode'); r.tick(); r.press('launch'); r.tick();
      expect(sys.missilesLaunched).toBe(1);
      r.press('selectNext'); r.tick();
      expect(r.rt.held()[0]!.weaponSel).toBe(1);
      expect('torpTurn' in r.rt.held()[0]!).toBe(false);
      const shots = sys.gunShots;
      r.hold(true); r.tick(); r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBeUndefined();
      expect(sys.gunShots).toBe(shots);
      r.hold(false); r.set({ selectTo: 0 }); r.tick(); r.rt.takeRefusals();
      const pews = sys.pewShots;
      r.click(); r.tick();
      expect([sys.pewShots, sys.missilesLaunched, r.rt.takeRefusals()]).toEqual([pews, 1, []]);
      r.press('weaponMode'); r.tick();
      expect(sys.gunsManual).toBe(false);
    } finally { r.rt.dispose(); }
  });
  it('the flight ends: a torpedo selection returns to the last gun; a trigger held across it is stale until a fresh press; no second launch', () => {
    const r = rig(), sys = r.d.tactical.systems[0];
    try {
      sys.bars[DuelSystem.Weapons] = 3; sys.weaponPower = [1, 1, 1];
      r.press('weaponMode'); r.tick();
      r.set({ selectTo: 1 }); r.tick(); r.set({ selectTo: 2 }); r.tick();
      r.press('torpMode'); r.tick();
      r.click(); r.tick();
      expect(sys.missilesLaunched).toBe(1);
      r.hold(true); r.tick();
      removeMissile(r.d.tactical, 0); r.tick();
      expect(r.rt.held()[0]!.weaponSel).toBe(1);   // back to the autocannon, the last gun selected
      expect(r.rt.held()[0]!.gunHeld).toBeUndefined();   // the held trigger is stale
      expect(sys.missilesLaunched).toBe(1);
      r.hold(false); r.tick(); r.hold(true);
      for (let n = 0; n < 20; n++) r.tick();
      expect(r.rt.held()[0]!.gunHeld).toBe(true);
      expect(sys.gunShots).toBeGreaterThan(0);
    } finally { r.rt.dispose(); }
  });
});
```

Append to `tests/onlineDuelSession.test.ts`'s Hound block (its `rig(1)`, which W-4a and W-4b extend; import `placeMissile` and `removeMissile` from `../src/renderer/src/sim/tactical/state`). The rig's replica is a snapshot copy of `r.d`, republished with `r.client().publish(r.d)`:

```ts
  it('a MANUAL flight: no gunHeld, no pewFire, then the selection returns; the turret is not predicted while it flies (W-4 spec §7, §11)', () => {
    const r = rig(1);
    placeMissile(r.d.tactical, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
    const c = r.attach(); r.session.frame();
    const src = () => h.sources.at(-1) as unknown as { turret(slot: 0 | 1): number };
    const key = (code: string): void => { r.key('keydown', code); r.key('keyup', code); r.pump(); };
    key('KeyZ');
    const want = (c.state()!.tactical.ships[0].heading * 256 + 2000) % 65536;
    h.sceneOpts[0]!.requests!.reticle(want); r.pump(); r.pump(); r.session.frame();
    expect(src().turret(0)).toBe(0);   // k = 0 while it flies
    key('Digit2'); h.sceneOpts[0]!.requests!.trigger(true); r.pump();
    expect(c.helds().at(-1)).not.toHaveProperty('gunHeld');
    h.sceneOpts[0]!.requests!.trigger(false); key('Digit1');
    h.sceneOpts[0]!.requests!.pew(1234); r.pump();
    expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([]);
    key('Digit3');
    removeMissile(r.d.tactical, 0); r.client().publish(r.d); r.pump(); r.session.frame();
    expect(c.helds().at(-1)).toMatchObject({ weaponSel: 0 });   // back to the last gun
    expect(src().turret(0)).toBeGreaterThan(0);   // predicted again
    r.dispose();
  });
```

Pew pew is used for the prediction because the autocannon starts with 0 bars, and `predictTurret` returns the replica's value for an unpowered gun.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/w4TorpedoSeat.test.ts tests/w4Input.test.ts tests/w4Runtime.test.ts tests/onlineDuelSession.test.ts`
Expected: FAIL. `flightFrame` is not exported, `nextWeaponSel` still takes `steering`, the runtimes still fire on LMB and send `gunHeld` during a flight, and `turret(1)` still predicts.

- [ ] **Step 3: The helper**

`app/duel/weaponsSeat.ts`:
1. `nextWeaponSel`: delete its `steering` parameter and the clause that leaves the selection alone while `steering` (A/D during a MANUAL flight, W-4a's §19.1 rule). Its doc: "W-4 spec §9: selectTo wins; else the A/D press edges step with wrap (W-4c: during a MANUAL flight too)".
2. Add:

```ts
/** W-4 spec §7: the Hound's Weapons seat's memory of a MANUAL torpedo flight: whether one flew last frame, and whether the held
 *  trigger has been held since that flight ended (stale until released: a fresh press is needed). */
export interface FlightLatch { flying: boolean; stale: boolean }
export const NO_FLIGHT: FlightLatch = Object.freeze({ flying: false, stale: false });

/** W-4 spec §7 (Decisions 6-8 of the W-4c plan): one frame of the seat around a MANUAL flight, before this frame's keys.
 *  `flyingNow` the crew's MANUAL torpedo flies (local state, or the replica online); `sel` / `lastGun` the selection and the last
 *  gun selected; `triggerNow` the left button held over the open map. Returns the next latch, the selection (on the frame
 *  the flight ends, the torpedo goes back to the last gun), the trigger to send (never while flying, nor while stale) and
 *  whether a left click may fire or launch (never while flying: the press is the steer). */
export function flightFrame(latch: FlightLatch, flyingNow: boolean, sel: number, lastGun: number, triggerNow: boolean): { latch: FlightLatch; sel: number; trigger: boolean; clicks: boolean } {
  const ended = latch.flying && !flyingNow;
  const stale = flyingNow ? false : ended ? triggerNow : latch.stale && triggerNow;
  return { latch: { flying: flyingNow, stale }, sel: ended && sel === WeaponSlot.Torpedo ? lastGun : sel, trigger: triggerNow && !flyingNow && !stale, clicks: !flyingNow };
}
```

   Import `WeaponSlot` from `../../sim/tactical/bars` if `weaponsSeat.ts` does not already. (`flightFrame` returns a fresh latch object each frame, so `NO_FLIGHT` is never mutated.)

- [ ] **Step 4: Single player**

`app/duel/runtime.ts`:
1. Add `flightFrame, NO_FLIGHT, type FlightLatch` to the `./weaponsSeat` import.
2. Beside W-4a's `weaponSel = 0, lastGunSel = 0, triggerPrev = false` in the state line, add `, flight: FlightLatch = NO_FLIGHT, triggerLive = false` (comment "W-4 spec §7: the seat's flight latch and this frame's gated trigger"). In the round reset and in `play`'s off-seat reset (`if (!houndWeaponsSeat(d, active)) { weaponSel = 0; lastGunSel = 0; triggerPrev = false; }`), also set `flight = NO_FLIGHT; triggerLive = false;`.
3. At the top of the Hound branch (`if (houndWeaponsSeat(d, active)) {`), replace W-4a's first two lines

```ts
      weaponSel = nextWeaponSel(weaponSel, k, manualTorpedoFlying(d.tactical));   // §19.1: until W-4c, A/D steer a MANUAL torpedo in flight
      if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;
```

   with

```ts
      // W-4 spec §7: around a MANUAL flight: the latch first (a torpedo selection returns to the last gun when it ends), then this
      // frame's keys (A/D select during a flight too); LMB clicks and the trigger are dropped while it flies.
      const ff = flightFrame(flight, manualTorpedoFlying(d.tactical), weaponSel, lastGunSel, deps.triggerHeld?.() ?? false);
      flight = ff.latch; triggerLive = ff.trigger;
      weaponSel = nextWeaponSel(ff.sel, k);
      if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;
      const click = ff.clicks ? pew : null;   // the map's left click this frame, unless it is the start of a steer
```

4. In the rest of the Hound branch, read `click` where W-4a reads `pew`:
   - `const lmbLaunch = pew !== null && weaponSel === WeaponSlot.Torpedo;` becomes `const lmbLaunch = click !== null && weaponSel === WeaponSlot.Torpedo;`;
   - W-4b's `if (pew !== null && weaponSel === WeaponSlot.Pew && gunsManual) {` becomes `if (click !== null && weaponSel === WeaponSlot.Pew && gunsManual) {`.

   Read the trigger through `triggerLive`: W-4a's `const trig = deps.triggerHeld?.() ?? false;` becomes `const trig = triggerLive;`, and W-4b's dead-trigger line `if (trig && !triggerPrev && weaponSel === WeaponSlot.Autocannon && gunsManual) {` stays as it is (it reads `trig`). The dead-trigger refusal on its press edge then never fires during a flight or while stale. Keep W-4b's other additions in the branch (Z → `gunMode`, the reticle) as they are.
5. In `frame`, W-4b's merge `weaponsSeatHeld(weaponSel, (deps.triggerHeld?.() ?? false) && gunModeBase(), deps.reticleAim?.() ?? -1)` becomes `weaponsSeatHeld(weaponSel, triggerLive && gunModeBase(), deps.reticleAim?.() ?? -1)` (comment "W-4 spec §7, §8: the gated trigger, MAN only"). Keep `&& gunModeBase()`: without it AUTO would send `gunHeld` again (W-4b Decision 7).

- [ ] **Step 5: Online**

`app/duel/onlineDuel.ts`:
1. Add `flightFrame, NO_FLIGHT, type FlightLatch` to the `./weaponsSeat` import.
2. W-4a's `let` line already declares `weaponSel = 0, lastGunSel = 0, triggerPrev = false` (W-4a Task 11 Step 3.4). Add `, flight: FlightLatch = NO_FLIGHT, triggerLive = false` to it. Wherever W-4a resets `weaponSel = 0; lastGunSel = 0; triggerPrev = false;` (the sit, the stand, the round change, the attach, and the off-seat line in `play`), also reset `flight = NO_FLIGHT; triggerLive = false;`.
3. At the top of the online Hound branch, replace W-4a's two lines `weaponSel = nextWeaponSel(weaponSel, k, manualTorpedoFlying(d.tactical));` and `if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;` with:

```ts
      const ff = flightFrame(flight, manualTorpedoFlying(d.tactical), weaponSel, lastGunSel, triggerNow());   // W-4 spec §7: the replica's flight
      flight = ff.latch; triggerLive = ff.trigger;
      weaponSel = nextWeaponSel(ff.sel, k);
      if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;
      const click = ff.clicks ? pew : null;
```

   Then, in that branch, `pew !== null` becomes `click !== null` in the launch count (`p.launch + (pew !== null && weaponSel === WeaponSlot.Torpedo ? 1 : 0)`) and in the pew-pew send. W-4a's `const trig = triggerNow();` becomes `const trig = triggerLive;`.
4. In `pump`, W-4b's `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() && (gunModeSent ? gunModeSent.manual : d.tactical.systems[0].gunsManual), aim: reticleNow() ?? -1 })` becomes the same call with `triggerLive` in place of `triggerNow()`. `play` runs before this line in the same pump, so `triggerLive` is this pump's value.

`app/duel/onlineSource.ts`, W-4b's `turret(slot)`: it returns `predictTurret(d.tactical, slot, sentHeld, gunModeShown ?? d.tactical.systems[0].gunsManual, unackedFrames)` at the Hound's Weapons seat, and `predictTurret` holds the other k = 0 gates. Add the spec §11 "(from W-4c)" condition at that call's `k` argument: `manualTorpedoFlying(d.tactical) ? 0 : unackedFrames`, commented "W-4 spec §11: (from W-4c) no MANUAL torpedo flies". Import `manualTorpedoFlying` from `../../sim/tactical/manualTorpedo` if it is not already imported.

- [ ] **Step 6: Run**

Run: `npx tsc -b` then `npx vitest run tests/w4TorpedoSeat.test.ts tests/w4Input.test.ts tests/w4Runtime.test.ts tests/w4Online.test.ts tests/manualTorpedoInput.test.ts tests/onlineDuelSession.test.ts tests/duelRuntime.test.ts tests/valkyrnRuntime.test.ts tests/valkyrnOnline.test.ts`
Expected: tsc clean; all PASS. A W-4a or W-4b runtime case that expected A/D not to select during a MANUAL flight is kind (a) (W-4 spec §7): rewrite it to expect selection.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/app/duel/weaponsSeat.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/onlineSource.ts tests/w4TorpedoSeat.test.ts tests/w4Input.test.ts tests/w4Runtime.test.ts tests/onlineDuelSession.test.ts <any W-4a/W-4b runtime test rewritten in Step 6>
git commit -m "feat(w4c): the Weapons seat around a MANUAL flight: A/D select, LMB steers and fires nothing, a fresh press after it, the torpedo selection returns to the last gun; no turret prediction while it flies (W-4 spec §7, §11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `STEER LMB`, and the controls list

**Files:**
- Modify: `src/renderer/src/ui/duel/WeaponsStation.tsx` (every `STEER A/D`), `render/duel/consoleModel.ts` (the `torpSteer` doc), `app/controlsList.ts`
- Modify (kind a): `tests/manualTorpedoUi.test.tsx`, `tests/manualTorpedoInput.test.ts` (the controls-list case), `tests/w4Ui.test.tsx` (a TORPEDO steering assertion), and `tests/settingsAndControls.test.ts` if it pins a changed row

**Interfaces:**
- Consumes: `WeaponsPanel.torpSteer`, W-4a's `HoundWeapons` block and controls rows, W-4b's Z row.
- Produces: the W-4c texts the gate entry names.

- [ ] **Step 1: Update the tests (failing)**

`tests/manualTorpedoUi.test.tsx`: every `'STEER A/D'` becomes `'STEER LMB'`. That is the `it` title, its `toContain` and the two `not.toContain`s. The header comment's "says STEER A/D" becomes "says STEER LMB (W-4 spec §10)".

`tests/w4Ui.test.tsx`: add to the Hound station describe:

```ts
  it('TORPEDO in MAN while it flies and can turn reads STEER LMB (W-4 spec §10)', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: { heat: 0, locked: false, offline: false, rate: '6/S' }, selected: 2, torpManual: true, missileFlying: true, torpSteer: true, torpCoast: false }))));
    expect(texts()).toContain('STEER LMB');
    expect(texts()).not.toContain('STEER A/D');
  });
```

`tests/manualTorpedoInput.test.ts`, the controls-list case:

```ts
describe('the Settings controls list (W-4 spec §9)', () => {
  it('names V at Weapons; the left mouse flies a MANUAL torpedo; A/D and the right button no longer do', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'V')?.action).toMatch(/Weapons.*torpedo.*AUTO.*MANUAL/);
    expect(rows.filter((r) => r.keys === 'Hold left mouse').map((r) => r.action)).toContainEqual(expect.stringMatching(/^At Weapons, with a MANUAL torpedo flying: steer it/));   // the Helm's row (controlsList.ts L59) comes first and stays
    expect(rows.find((r) => r.keys === 'W A S D')?.action).not.toMatch(/MANUAL torpedo/);
    expect(rows.find((r) => r.keys === 'Right click or drag')?.action).not.toMatch(/torpedo/);
    expect(rows.find((r) => r.keys === 'Right click or drag')?.action).toMatch(/elsewhere pan/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/manualTorpedoUi.test.tsx tests/w4Ui.test.tsx tests/manualTorpedoInput.test.ts`
Expected: FAIL (`STEER A/D` is drawn; the rows still name A/D and the right button).

- [ ] **Step 3: The card**

`ui/duel/WeaponsStation.tsx`: `git grep -n "STEER A/D" -- src/renderer/src/ui/duel/WeaponsStation.tsx` lists the laser block's line and W-4a's `HoundWeapons` copy. In each, `'STEER A/D'` becomes `'STEER LMB'`. In the file's W-3 header line, "a MANUAL torpedo in flight STEER A/D while it can turn" becomes "a MANUAL torpedo in flight STEER LMB while it can turn (W-4 spec §10: the left mouse flies it)".

`render/duel/consoleModel.ts`, the `torpSteer` doc: "(past its boost, fuel left: the card says STEER A/D)" becomes "(past its boost, fuel left: the card says STEER LMB, W-4 spec §10)".

- [ ] **Step 4: The controls list**

`app/controlsList.ts`:
- `DUEL_ACTION.torpMode` becomes `'At Weapons, switch the torpedo between AUTO (it homes on its target) and MANUAL (F, or a left click with it selected, launches it with no target; hold the left mouse to fly it)'`.
- The walk row: W-4a's clause `at Weapons, A/D select a weapon (and steer a MANUAL torpedo in flight)` becomes `at Weapons, A/D select a weapon`.
- The `Right click or drag` row's action becomes `'At the Helm, set a heading to hold (on your ship: clear); elsewhere pan'`.
- After the `Left click` row (W-4a's text), add `{ keys: 'Hold left mouse', action: 'At Weapons, with a MANUAL torpedo flying: steer it toward the pointer; let go and it holds that heading' },`.

The Valkyrn section, whose own `Hold left mouse` row is the Flight seat's, is unchanged.

- [ ] **Step 5: Run**

Run: `npx tsc -b` then `npx vitest run tests/manualTorpedoUi.test.tsx tests/w4Ui.test.tsx tests/manualTorpedoInput.test.ts tests/settingsAndControls.test.ts tests/pewInput.test.ts tests/manualLaserUi.test.tsx tests/targetingUi.test.tsx`
Expected: tsc clean; all PASS. A test that pins the changed `torpMode`, walk or right-drag text is kind (a): update it to the new text, citing W-4 spec §9.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/ui/duel/WeaponsStation.tsx src/renderer/src/render/duel/consoleModel.ts src/renderer/src/app/controlsList.ts tests/manualTorpedoUi.test.tsx tests/w4Ui.test.tsx tests/manualTorpedoInput.test.ts <any other row test updated>
git commit -m "feat(w4c): the TORPEDO card says STEER LMB; the controls list: hold the left mouse to fly a MANUAL torpedo, the right drag pans at Weapons (W-4 spec §9, §10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The gameplay proof, the same-version bless, the gates unchanged, the full verification and the W-4c gate entry

**Files:**
- Regenerated by `npm run bless` (same version V): `tests/golden/basic.json` (its embedded content digest); `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json` and `tests/fixtures/determinism-v2.json` must come out byte for byte the same (Decision 11)
- Modify: `docs/gates.md` (append), `docs/superpowers/research/2026-11-19-w4-report.md` (the `## W-4c` section)

**Interfaces:**
- Consumes: Tasks 1 to 6; Task 1's oracle baseline and gate numbers.
- Produces: the commit Task 8 records its baselines at.

- [ ] **Step 1: Every oracle run unchanged per tick**

Run: `npx tsx scripts/golden/duel-oracle.ts same`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version <V> → <V> (baseline HEAD <W4C_BASE>)`, exit 0, with Task 1's `<R>`, `<T>` and `<F>`.

Then run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: the sector's runs identical at every tick to Task 1's canonical baseline, exit 0. W-4c touches no sector code.

If either fails with a value, event or telemetry difference, stop: an AUTO, scripted or sector path changed. The message names the run, the tick and the field. Fix it in the task that introduced it and re-run; never tune, never re-record the baseline. If either fails because its baseline is missing (a reboot cleared the temp folder) or is from another checkout, write "W-4c oracle / canonical proof: not run (baseline lost)" in the report and rely on Steps 2 and 3; then also skip Step 2's `canonical-trace.ts golden` check (it needs the same copy) and say so in the report.

- [ ] **Step 2: The same-version bless**

Run: `npm run bless`
Expected, exit 0: four `blessed …` lines.
- `basic.json`'s checkpoint count and final hash stay as W-4b's bless printed them (read W-4b's bless commit with `git log --grep="same-version bless" --format=%B -n 1`); only its content digest moves.
- The determinism line reads `sim version <V>, … re-executed (unchanged)`.
- The duel and rematch lines carry W-4b's checkpoint counts, tick counts, outcomes and final hashes exactly.

Run: `git status --short tests/golden tests/fixtures`
Expected: `M tests/golden/basic.json` and nothing else. If `duel-1.json` or `duel-rematch.json` is modified, stop, as in Step 1.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 3: The gates did not move**

Run: `npx tsx scripts/duel-telemetry.ts` and `npx tsx scripts/valkyrn-telemetry.ts`
Expected: the summary lines, the passive median and the Valkyrn summary are character for character Task 1's (in the report's `## W-4c` section). If any line differs, stop, as in Step 1.

Run: `git diff --stat W4C_BASE -- tests/duelGates.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts`
Expected: no output.

Run: `npx vitest run tests/duelGates.test.ts tests/duelScripted.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/golden.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts`
Expected: all PASS.

- [ ] **Step 4: The full verification**

Run, one at a time:
- `npx tsc -b`: no errors.
- `npx electron-vite build`: succeeds.
- `npx vitest run --maxWorkers=4`: every file PASS. Re-run a load-sensitive timeout alone.
- `npm run test:duel-app-runtime`: the `ACTUAL DUEL APP` line.
- `npm run test:determinism`: PASS on Node, Electron and Firefox. Then `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`, and `git status --short .superpowers/sdd` prints nothing.
- `git grep -n "torpTurn\|heldTorpSteer\|STEER A/D" -- src`: no output (`tests/` keeps its negative asserts).

- [ ] **Step 5: The report**

In `docs/superpowers/research/2026-11-19-w4-report.md`, under `## W-4c`, add:
- the oracle line from Step 1;
- the four bless lines from Step 2;
- "gates unchanged since `W4C_BASE`";
- the test count from Step 4 (files and tests);
- every kind (a) rewrite with its file (from the Task 2 to 6 commit bodies);
- the determinism line.

- [ ] **Step 6: The gate entry**

Append to `docs/gates.md` with Edit (the file is CRLF), after its last line (W-4b's entry), in the W-2 / W-3 entries' format. Put Step 4's real numbers in place of the angle-bracket fields:

```markdown

## W-4c: flying the torpedo (2026-11-19)

Spec `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` §7, §9, §10, §11, §19; plan `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md`.

- [x] Automated (W-4c): `npx vitest run` passes (<files> files, <tests> tests). This includes the held heading as the only MANUAL steer (`torpTurn` gone from every schema; a frame carrying it is malformed), the left button's bearing from the torpedo's marker, the right button panning at Weapons, MAN guns quiet and `pewFire` refused `missile-in-flight` while it flies with AUTO firing on, the fresh press and the selection's return after the flight, and no turret prediction while it flies (`tests/w4Flight.test.ts`, `tests/w4TorpedoSeat.test.ts`, `tests/manualTorpedo*.test.ts`). The duel oracle proves every scripted and passive run unchanged per tick at SIM_VERSION <V>. `npx tsc -b` is clean. Determinism passes on Node, Electron and Firefox.
- [ ] Manual (owner): play a Single player duel at the Hound's Weapons seat.
  1. V to MAN on the TORPEDO card, then F (or select it with 3 and click the map).
  2. Hold the left button on the map: the torpedo swings toward the cursor, and the card reads STEER LMB. Let go: it holds that heading.
  3. While it flies, with the guns on MAN, the muzzle lines do not follow the reticle and nothing fires. Press Z for AUTO: the guns track and fire on their own.
  4. A / D and 1 / 2 / 3 still move the selection during the flight. The right drag pans the map.
  5. When it ends, the selection is the gun you had before. A held left button fires nothing until you let go and press again.

  Screenshots for the look gate:
  1. A MANUAL torpedo under the left-button steer, with the STEER LMB card.

  Does it feel like the Helm's steer?
```

- [ ] **Step 7: Check for zeroed files, then commit**

Run: `git status --short`. For each modified file, run `head -c 64 <file> | od -c | head -1`: no file may read as all `\0`.

```bash
git add tests/golden/basic.json docs/gates.md docs/superpowers/research/2026-11-19-w4-report.md
git commit -m "test(w4c): same-version bless at SIM_VERSION <V> for the mouse-flown torpedo (basic.json content digest only; the duel oracle proves every run unchanged per tick); the W-4c gate entry" -m "<the oracle line from Step 1>; <the four bless lines from Step 2>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Run: `git rev-parse --short=8 HEAD`. This is `W4C_BLESS`: Task 8 records its baselines here.

---

### Task 8: SIM_VERSION V → V + 1 alone, proved and blessed; the smoke seed; the final checks

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`
- Modify (only if Step 6 needs it): `scripts/network/duel-app-smoke.ts`, `scripts/network/internet-app-smoke.ts`
- Modify: `docs/superpowers/research/2026-11-19-w4-report.md`, `docs/gates.md` (the W-4c entry's version note)

**Interfaces:**
- Consumes: Task 7's commit `W4C_BLESS`.
- Produces: the merge-ready branch at SIM_VERSION V + 1. The merge to master is the controller's.

- [ ] **Step 1: Pre-flight**

Run: `git rev-parse --short=8 HEAD; git status --short -- src tests scripts`
Expected: `W4C_BLESS`, and no output for the status.

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = <V>;`

- [ ] **Step 2: Both baselines at `W4C_BLESS`**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version <V>: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version <V>: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0, with Task 1's `<R>`, `<T>` and `<F>`.

- [ ] **Step 3: The version**

`src/renderer/src/sim/tuning.ts` line 7 becomes `export const SIM_VERSION = <V + 1>;` (61 when V is 60). Use Edit. Nothing else in `src/` changes in this task. `MIGRATIONS` and `ADDITIONS` in `scripts/golden/duelOracle.ts` are not touched: no field is renamed or added.

- [ ] **Step 4: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version <V> → <V + 1>: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <W4C_BLESS>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version <V> → <V + 1> (baseline HEAD <W4C_BLESS>)`, exit 0.

A check may refuse because its baseline is stale: another version, another checkout, or a HEAD other than `W4C_BLESS`. If so:
1. Set line 7 back to V with Edit.
2. Re-run both Step 2 commands.
3. Set line 7 to V + 1 again.
4. Re-run both checks.

Any other failure: stop and report.

- [ ] **Step 5: Bless**

Run: `npm run bless`
Expected, exit 0: four `blessed …` lines. The counts, ticks and outcomes are Task 7's, with new hashes. The determinism line reads `sim version <V> → <V + 1>, 1800 samples and 330 boundaries unchanged apart from the version and hashes`.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

Run: `git status --short -- src tests`
Expected: exactly the five files: `tuning.ts` and the four generated ones.

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(w4c): SIM_VERSION <V> -> <V + 1> alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "<the four blessed lines from Step 5>. Baselines recorded at <W4C_BLESS>: canonical trace 7200 + 108000 ticks; duel oracle <R> runs, <T> ticks, <F> named fields per tick." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: The duel app smoke and its seed**

Run: `npm run test:duel-app-runtime`
Expected: the smoke passes and prints the `ACTUAL DUEL APP` line.

If step 3 ("the forced round end") times out because `DUEL_TEST_SEED`'s round no longer ends inside its window, re-pick it as b7c0919e did:
1. Search seeds 1..8000 at V + 1 with no flight or weapon input (standing and seated alike) for the earliest decided round.
2. Set `DUEL_TEST_SEED` and its doc comment in `scripts/network/duel-app-smoke.ts`: `W-4: <old> -> <seed>, decided on tick <t> at SIM_VERSION <V + 1>`, with the runners-up, as b7c0919e wrote them.
3. Set the same seed in `scripts/network/internet-app-smoke.ts`, which shares it.
4. Re-run the smoke.
5. Commit the two scripts: `git commit -m "test(w4c): the duel app smoke's forced-round-end seed <old> -> <seed> (decided on tick <t> at SIM <V + 1>)" -m "<why it moved and the search's runners-up>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

The bump changes no run (Step 4), so a re-pick here means W-4a or W-4b moved the seed's round without re-picking it. Say so in the report.

- [ ] **Step 7: The final checks**

Run, one at a time:
- `npx tsc -b`: no errors.
- `npx electron-vite build`: succeeds.
- `npx vitest run --maxWorkers=4`: every file PASS. Re-run a load-sensitive timeout alone.
- `npm run build`: succeeds.
- `npm run test:determinism`: PASS on Node, Electron and Firefox. Then `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`.

Run: `git diff --stat W4_BASE -- tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts`
Expected: no output.

Run: `git log --oneline W4_BASE..HEAD -- tests/w4HunterIdentity.test.ts`
Expected: exactly one line, W-4a Task 1's commit that created it (its digests were never re-recorded).

Run: `git diff W4_BASE -- tests/valkyrnIdentity.test.ts | grep -n "^[-+].*[0-9a-f]\{16\}"`
Expected: no output: none of the five digest strings changed since `W4_BASE`; the only edit is W-4b's skip of the three new names.

Run: `npx vitest run tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts tests/duelGates.test.ts`
Expected: all PASS.

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `… SIM_VERSION = <V + 1>;`

- [ ] **Step 8: The report, the gate note, and commit**

In `docs/superpowers/research/2026-11-19-w4-report.md`, under `## W-4c`, add:
- the bump commit and its bless lines;
- whether `DUEL_TEST_SEED` moved;
- the final test count from Step 7;
- the identity checks' result;
- "W-4 complete on `w4-weapons-controls` at SIM_VERSION <V + 1>; merge to master is the controller's".

In `docs/gates.md`'s W-4c entry, add one line after the Automated box: `  SIM_VERSION <V> → <V + 1> alone (canonical trace and duel oracle per tick), blessed; <the smoke seed line>.`

Run `head -c 64` on both files, as in Task 7 Step 7.

```bash
git add docs/superpowers/research/2026-11-19-w4-report.md docs/gates.md
git commit -m "docs(w4c): W-4 complete at SIM_VERSION <V + 1>: the bump, the smoke and the final checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage (W-4c scope):**
  - §7 launch: unchanged, so no task; the LMB launch is W-4a's.
  - §7 steering (LMB, every frame, from the marker, held on release): Tasks 2, 4 and 5.
  - §7 sim law kept (`holdTurn`, W-3's numbers): Task 2, whose tests keep W-3's numbers.
  - §7 "Removed" (`torpTurn` everywhere, the right-button heading, the pan exemption): Tasks 2 and 4.
  - §7 camera: unchanged (`trackManualTorpedo` stays).
  - §7 the guns while it flies (no MAN slew, no `gunHeld`, `missile-in-flight`, AUTO on, Z, A/D, 1-3 and W/S): Task 3 (sim) and Task 5 (app).
  - §7 when the flight ends (fresh press, selection returns): Task 5.
  - §3.4 the MAN flight hold: Task 3.
  - §6's admission order: Task 3.
  - §9 rows (LMB held steer, A/D, RMB pan, the `torpMode` text): Tasks 4 and 6.
  - §10 `STEER LMB`: Task 6.
  - §11 the "from W-4c" prediction gate: Task 5.
  - §13.3 the bump: Tasks 7 and 8.
  - §13.4 the identity checks: Tasks 7 and 8.
  - §14's manual-torpedo tests: Tasks 2 to 6.
  - §19 item 3's gate entry: Task 7.
  - §19.1's W-4c rules: Tasks 3 and 8.
- **Placeholders:** Task 4's pan case and Task 5's runtime and online cases name every assertion and the rig to copy (`w4Runtime`, `w4Online`, the camera tests). Those rigs are long and file-local, and W-4a or W-4b defines them. Every other test is written out.
- **Type consistency:**
  - `manualTorpTurn(m, heading)` (Task 2) is read by `duel.ts` (Task 2) and the tests.
  - `heldTorpHeading` (Task 2) is read by the step (Task 2) and the tests.
  - `torpedoSteer` (Task 4) is read by the scene (Task 4) and the tests.
  - `flightFrame` / `FlightLatch` / `NO_FLIGHT` (Task 5) are read by both runtimes (Task 5) and the tests.
  - `nextWeaponSel(sel, k)` (Task 5) is read by both runtimes and `w4Input`.
  - W-4b's names (`slewTurrets`, `gunsManual`, `gunTurret`, `turretAim`, `gunMode`, `turret(slot)`, `predictTurret`) are consumed by anchor in Tasks 3 and 5.
