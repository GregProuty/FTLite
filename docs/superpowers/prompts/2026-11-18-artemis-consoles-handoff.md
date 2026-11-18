# Artemis consoles handoff, 2026-11-18

This handoff comes from the Claude Code session that built the Artemis-style Helm and Weapons consoles in the FTLite checkout (`C:\Users\djuar\FTLite`, branch `master`). Read it before you touch the duel console UI again. Nothing has been pushed.

## 1. What the owner asked for

On 2026-11-17 the owner asked to make the duel's Helm and Weapons UI look like Artemis Bridge Simulator, with a "similar layout, not a copy". The reference screenshots are `c:\Users\djuar\Pictures\Screenshots\artmeis3.png` (Weapons) and `artemis2.png` (Helm). The owner wanted a first pass first and tweaks afterwards.

The owner made these decisions while brainstorming:

- The panels are clickable, and every key still works.
- The Helm has a set-and-forget throttle. This was a sim change.
- Weapons shows only the mechanics that existed at the time.
- There are clickable HELM, WEAPONS and SHIP tabs.

These are the documents:

- **Spec:** `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md`. Its SIM version numbers are stale: the throttle actually went from 42 to 43.
- **Plans:** `docs/superpowers/plans/2026-11-17-artemis-i-consoles.md` and `docs/superpowers/plans/2026-11-17-artemis-ii-throttle.md`.
- **/refine runs:** `docs/superpowers/reviews/2026-11-17-artemis-spec`, `…-artemis-i-plan` and `…-artemis-ii-plan`.

## 2. What was merged

### Artemis-i, layout and clicks (`ab75aa72`, presentation only)

The owner's verdict was "looks good so far".

- **Layout constants** live in `render/duel/consoleLayout.ts`:
  - The tab strip is at the top left (x 12, y 8; each tab is 96 × 26 with a 4 px gap).
  - The status table is at the left (x 12, y 42, width 204).
  - The station panel is at the bottom left (width 300; height 200 for the Helm, 216 for Weapons).
  - The side column of buttons is at the right (x 1136, width 132).
  - The map keeps a 228 px reserve on the left and 156 px on the right.
- **View model:** `render/duel/consoleModel.ts` is pure (`consoleTabs`, `consoleModel`, `consoleHidden`). Its tests are in `tests/duelConsoleModel.test.ts`. The name is not `consoleModel.test.ts`, because a test with that name already exists for the unrelated `render/consoleModel.ts`.
- **React components:**
  - `ui/stage/Button.tsx` has no tabIndex, `pointer-events: auto` and an opaque fill, and it releases a hold exactly once.
  - The duel components are `ui/duel/TabStrip`, `SideColumn`, `HelmStation` and `WeaponsStation`.
  - `ReadoutPanel` and `MapOverlay` take a placement prop.
- **Input:** `app/duel/input.ts` is the single merge point. It keeps two held sets, keys and ui. Fire edges come from the merged Space transitions. `clear()` runs on Tab, restart and blur; `clearUi()` runs on a console change. Clicks reach the sim through `ConsoleInput {press, hold, lock, throttle}`, which is wired through `actions.console` and `actions.setConsole`.
- **Probe:** `?mode=uiprobe&probe=duel&console=helm|weapons` renders either console without a match.

### Artemis-ii, throttle (`596ca44f`, SIM_VERSION 43)

- **Sim:**
  - The `helm` duel module comes after `round`. State is `DuelState.throttle`, a level from −1 to 4, set by the `throttle {level}` command.
  - `throttleThrust(l)` returns −1 when `l` is below 0, and `l/4` otherwise.
  - `flyShip` rounds thrust to quarters.
  - `MIGRATIONS[42]` adds `helm.throttle`.
  - The golden recordings were re-made in two steps: first the version bump alone, which the oracle proved changes nothing tick by tick, then the gameplay change.
- **App:**
  - W and S step the throttle one notch per press.
  - Online, `throttleSent` tracks what has been sent, so two quick presses step two notches before the server replies.
  - The Helm panel has six notch buttons: `console-throttle-100/75/50/25/stop/rev`.
  - The engine flame and engine hum scale with |thrust|.

## 3. Later work by other sessions

Since `596ca44f`, other sessions have merged a lot of work on top. Master is at SIM_VERSION 51, and a SIM 52 plan for Sci-2 is in progress. The merges that touch these consoles are:

- **Start aboard (SIM 44):** the players start standing in the ship's mid room.
- **Enemy ship window:** an FTL-style room map, opened with T or a click on the enemy.
- **Duel polish i (SIM 45)**, **homing torpedoes (SIM 46)** (manual missile steering was removed), **Sci-1 science scans (SIM 47)**, **the weapons update (SIM 48)** and **FTL-style targeting (SIM 49)**. The targeting merge added weapon cards, per-weapon room targets, auto-fire and torpedo auto-launch, so the Weapons station no longer looks like Artemis-i left it.
- **Feel-i (SIM 50):** among other things, "solo keeps both seats manned".
- **Feel-ii (SIM 51):** among other things, a throttle wheel and click-to-heading.

Before you change the Helm or Weapons panels, read `git log 596ca44f..master` and the current `ui/duel/*`. Do not work from the Artemis plans: much of what they describe has since been replaced.

## 4. Open items, all of them the owner's

- **Solo coasting is resolved.** After Artemis-ii, pressing Tab to go to Weapons in Single player made the ship coast, because the Helm seat counted as empty. Feel-i fixed this ("solo keeps both seats manned"). You can confirm it in the app with Single player: set 75, press Tab, and watch SPD hold.
- **The uiBoundary failure is resolved.** `tests/uiBoundary.test.ts` failed because `ui/version.ts` imported `SIM_VERSION` as a value. `d4e8b178` fixed it by moving the sim version into the build info.
- **Look checks are still open.** The owner has not yet signed off on Artemis-i and Artemis-ii, or on UI-i, UI-ii and UI-iii. The Artemis screenshots are in `C:\Users\djuar\FTLite-shots\artemis` and `C:\Users\djuar\FTLite-shots\artemis-ii`. They predate the Sci, targeting and Feel merges.
- **A tweak pass is still possible.** The owner said "first pass, then tweak". No tweak list has come in yet.

## 5. Working notes

- **Visual checks:** run `playwright-core` from outside the repo and launch Electron with `_electron.launch`, then set the window to 1280 × 720. The last probe scripts were in this session's scratchpad (`ui2-probe/artemis.cjs` and `ui2-probe/artemis2.cjs`), which may since have been cleared. They locate controls by `data-testid="console-…"`, read each button's `data-ui-button` state, and read on-canvas text through `canvas[data-text]`.
- **Determinism:** `npm run test:determinism` rewrites the tracked logs under `.superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs/`. Restore them with `git checkout --` afterwards.
- **Flaky tests:** under load, the full suite has flakes (the director soak, duelFire, snapshot, authorityBoundary/Ingress, leaseSmokeCleanup and onlineAppRuntime). Each of them passes when run alone. `onlineRecoveryInstrumentation` needs a built `out/`.
- **Worktrees:** delete the `node_modules` junctions, including `services/signalling/node_modules`, before you run `git worktree remove`.
- **Review packages:** leave `tests/golden` and `tests/fixtures` out of review packages, or they grow to about 24 MB.
- **Staging:** stage files by explicit path only. The checkout has many uncommitted files from other sessions (see `git status`), and they must be preserved.
