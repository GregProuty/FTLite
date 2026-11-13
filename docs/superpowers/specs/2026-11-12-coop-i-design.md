# Working Together (Coop-i) Design

Status: 2026-11-12. The user: "so how do we make this fun for multiplayer and encourage the players to work together. i feel like many multiplayer games feel like single player games that have multiple people playing." After Claude's proposal: "ok lets do it". This is the first of two co-op features. Coop-ii covers timed evasive manoeuvres, carried torpedoes, and crew votes on events and routes.

Principle: two players working together must be clearly better than the same two working apart. Everything must still work, more slowly, for one player or with bots.

## 1. Science locks, Weapons fires (sim)

Today a lone gunner can do everything: read the scanned shield frequency and pick it on the selector.

- **Rotating shields.** While present with shields up, the enemy re-tunes its shields every `SHIELD_ROTATE` (20) seconds: one `rng.combat` draw picks a new frequency different from the current one, and `scanned` and `scan` reset to 0. New enemy field `shieldRotateTick`, armed on arrival and re-armed on each rotation. It does not rotate while the shields system is down.
- **The lock.** The Science officer, seated with the cursor on the enemy hull row and the enemy scanned, presses Confirm to **lock**. While locked (`LOCK_SECONDS` 8, enemy field `lockUntilTick`), beam shots are tuned whatever the selector shows, and get `LOCK_HIT_BONUS` (+0.15) on the hit threshold. A rotation ends the lock at once.
- **The solo path stays.** A gunner whose selector matches the current frequency still fires tuned, as today. A lone player can scan, walk to Weapons and pick the frequency, but has at most 20 seconds before it changes. With two players, the callout "frequency 2, locked, fire!" is the fast way.
- **Telemetry:** `lockedShots` (beam shots fired under a lock).
- **HUD:** the Science card shows `LOCK: Confirm` when a lock is possible and `LOCKED 6s` while one runs. The Weapons card footer shows `LOCKED` while one runs. The enemy window (Demo-viii) shows the frequency only while it is still current, with a small rotate countdown.

## 2. Hands together (sim)

- When two or more Conscious crew hold Interact on the same target on the same tick, each one's progress rate is multiplied by `TEAM_MULT` (1.25). Two people therefore do 2.5 times one person's work. Targets: a burning room, a breach site, a failed or damaged station, a downed crew member (revive).
- Nothing else changes: per-crew skill, traits and XP apply as today, and XP is awarded per person.
- **Telemetry:** `teamSeconds` (seconds of progress with two or more on one target, counted once per target per tick).

## 3. Callouts (presentation only, outside the sim)

- One new button per player: keyboard players get a free key next to their interact keys, gamepads a free face or shoulder button. Use whatever the bindings leave free and document it on the controls card.
- A press shows a speech bubble with an icon over that player for 3 seconds, plus a short sound cue. The text depends on context:
  - seated at a station whose power is below its maximum: `Power to Weapons!` (the station's name), and that station's row on the Engineering card flashes for the same 3 seconds;
  - standing next to a fire, breach or failed station: `Fire here!`, `Breach here!` or `Repair here!`;
  - otherwise: `Over here!`.
- A downed crew member shows `Help!` automatically, without a press.
- Callouts never enter `Intent`, replays or snapshots. They live in the app and render layers, so determinism and the golden replay are untouched.

## 4. Team moments, counted

- The end-of-run screen gains one line: `Teamwork  locked shots 4  shared repairs 38s  revives 2`. Revives already exist in telemetry; add the count if it is missing.
- The local telemetry record gains `lockedShots` and `teamSeconds`, so playtests can measure whether players actually worked together.

## 5. State and versions

New fields: `enemy.shieldRotateTick`, `enemy.lockUntilTick`, `telemetry.lockedShots`, `telemetry.teamSeconds`. All are flattened. `SIM_VERSION` is the next free number after the features merged before this one (Demo-viii 20, Demo-ix 21, so this is 22). The golden is re-blessed once.

## 6. Tests

- Rotation: every 20 s while shields are up, never to the same frequency, one combat draw each, scan reset, lock ended; no rotation while the shields system is down.
- Lock: needs Science seated, the hull row and a scan; lasts 8 s; tunes any selector; adds 0.15; ends on rotation; `lockedShots` counts.
- Solo path: a matching selector still tunes without a lock.
- Team: two crew on one fire extinguish it in 1 / 2.5 of the solo time (within a tick); three crew 3 × 1.25; two crew on different targets get no bonus; the same for breach, repair and revive; `teamSeconds` counts.
- Callouts: model tests for each context string, the Engineering row flash and the automatic `Help!`; nothing about them reaches `Intent` (the intent type is unchanged).
- The end-of-run line.
- Gates re-recorded: team speed helps bots that fight a fire together, so gate figures may rise; no floor lowered. The golden re-blessed once.

## 7. Gate

- [x] Section 6 tests; golden re-blessed once; gate figures recorded with the cause.
- [x] Visual check by Claude: the lock on the Science and Weapons cards, a callout bubble, the Engineering row flash, two players on one fire.
- [ ] Manual, the user (the real test): do two players talk to each other more than before? Is the lock callout fun?

## 8. Amendments

(Filled during review and implementation.)

### Codex spec review (research/codex-review-coop-i-spec.md), 2026-11-12: all five findings resolved; these rules override sections 1 and 2.

- **C1. When tuning matters.** As today (weapons.ts:50), a beam is tuned whenever the shields system is down or no layer is up, whatever the selector or lock says. The lock and the selector match only matter while a layer is up. Rotation runs only while the shields system is up.
- **C2. Draws.** Each fired beam makes exactly one `rng.combat` draw, as today. The lock changes only the tuning decision and the hit threshold, never the number or order of draws. Rotation makes its own one draw at its own tick.
- **C3. Shared revive.** Today revive arbitration keeps a single reviver (interact.ts:110–123). Coop-i makes revive shared like the other targets: every Conscious crew member holding Interact on the same downed pid adds progress, with `TEAM_MULT` once two or more are on it. "Same target" is the exact `(kind, index)` from `interactTarget`.
- **C4. Solo and bots.** One player keeps the selector-match path (scan, walk, pick the frequency within 20 s), and torpedoes ignore shields as today. Bots get the team bonus whenever two bots hold Interact on the same target, which they already do when chasing the same fire. Bots never lock.
- **C5. The 2.5× claim.** `TEAM_MULT` multiplies each person's own skill- and trait-adjusted rate. Two equally skilled crew do 2.5 times one person's work; unequal crew do 1.25 × (rate A + rate B).

### Implementation, 2026-11-12

- **C6. The rotation clock while the shields system is down.** No re-tune is checked while the shields system is down, and its repair re-arms `shieldRotateTick` a full `SHIELD_ROTATE` ahead (no draw). A clock that stood still one tick per tick failed the existing repair test, which calls `enemySystem` across a jump in ticks; the re-arm gives the same play (no re-tune while down, never one the instant the shields return) without depending on per-tick calls. The enemy window shows no countdown while the system is down.
- **C7. The scripted combat-gate gunner** in `tests/enemy.test.ts` now keeps its selector on the current frequency after the strip (the solo path) instead of on F2 for good: the shields re-tune every 20 s, so a gunner that never re-picks strips again. Its figures are unchanged: seven shots, seven hits, one strip, destroyed inside the window.
- **C8. A lock cannot be refreshed while it runs**: Confirm on the hull row locks only when no lock is running (the card shows `LOCK: Confirm` exactly when a press would lock). `lockedShots` counts every beam fired at the enemy while a lock runs, whether or not a layer was up.
- **C9. Tests that encoded the single reviver** change with amendment C3: `tests/interact.test.ts` (two revivers now both add progress at `TEAM_MULT`), `tests/telemetry.test.ts` (the second reviver is active, not idle) and `tests/characters.test.ts` (two unequal crew on one fire add `TEAM_MULT x (rate A + rate B)`). `reviverPid` stays in the state for display: the current reviver while still trying, else the lowest pid trying.
- **C10. Callout bindings and plumbing.** Keyboard 1 `R`, keyboard 2 `/` (`Slash`, default prevented so no browser quick-find), gamepads `Y` (button 3, the first face button the mapping leaves free: A interact, B cancel, X confirm). The device manager reports callout presses per slot beside the input frames, never in them; the session keeps the callouts (pid, tick, text fixed at the press) and hands bubbles to the renderer and the flashing kinds to the HUD model. A bubble's text is read at the press; a downed player shows `Help!` from the state every frame with no press; the dead show nothing. The controls card gains a seventh line, `Callout: R / Slash / Y shows what you need over your head`. The flashed row blinks in yellow on both the Engineering console card and the always-visible POWER panel. Context `Fire here!` and the others follow `interactTarget`, so a downed teammate or a boarder in reach (which outrank repairs) gives `Over here!`.
- **C11. Revives counted.** Telemetry had no revive count, so `telemetry.revives` is new (flattened, counted in `reviveCrew`). The record carries the three as `teamwork: { lockedShots, teamSeconds (one decimal), revives }`. The end-of-run line is the sixth headline line, after `Ship:`; the summary area grows to twelve rows so four crew with both progress lines still fit.

- **C12. Gates (Task 5).** Every gate passes and no floor was lowered; figures before -> after (min health, seeds 1/2/3): survival 63.3 / 23.7 / 47.0 -> 77.7 / 47.8 / 68.9; duo 28.8 / 62.6 / 75.1 -> 28.8 / 28.8 / 68.4; boarding 29.1 / 24.8 / 48.7 -> 29.1 / 28.9 / 48.7; cutter 73.2 / 51.7 / 52.8 -> 59.1 / 61.5 / 65.6; jump and run pass; `npm run acceptance 5 1` changes only the idle streaks and one debris spawn. Cause: team speed (the bots already share fires, which now go out 2.5 times as fast, shifting every later event); bots never sit at Science, so rotation and the lock play no part. Golden re-blessed once: 92a4fc7c -> fee5b547.
- **C13. Visual-check fixes.** Bubbles from crew side by side stack instead of overlapping; the game-over summary gets a dark backing so it reads over the ship; the player card's progress bar sits under the skills line instead of across it. Bubble icons draw only when the optional icon sheet is present (it is absent in this build).
- **C14. Re-tune interval 20 → 30 s (Claude, after the implementation report).** At Science level 1 a scan takes 16 s (`SCAN_TIME` 6 at output 0.375), which left at most 4 s of a 20 s frequency to lock and fire. At 30 s there is room to scan, hold the full 8 s lock and fire, and a lone player has more time on the selector path. The golden replay and every gate are unchanged by it (bots never scan or lock); two window-model tests now read the constant.
