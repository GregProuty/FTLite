# Main menu and keyboard-and-mouse only (2026-11-16)

A views and menu change. Light process: this page, the build, one review, and the owner checks it by eye.

## The owner's words

> "We're getting rid of couch coop for now, and not supporting game pads anymore. this is a keyboard and mouse game now.
> Second, I want to just have single player and multiplayer and settings. single player launches the game and allows me
> to test all the game mechanics in the demo. multiplayer has host and join."

## Decisions

1. The main menu has exactly three items: **Single player**, **Multiplayer**, **Settings**.
2. **Single player** starts the H-1 solo duel inside the normal app: the Helm demo, Tab between the Helm and Weapons
   characters, the interior, repair, the end screen and restart. It is the same `startDuelMode` that `?mode=duel` runs.
   To leave, press Esc to pause, then M (the pause banner says `ESC: RESUME   M: MAIN MENU`). On the end screen, M also
   works (`ENTER: NEW DUEL (SEED n)   M: MAIN MENU`). Leaving disposes the duel completely (ticker, listeners, lifecycle
   hooks, sim) and shows the menu again. `npm run dev:duel` and `npm run dev:flight` still launch their views on their
   own, with no menu and no M option.
3. **Multiplayer** opens a page with **Host**, **Join** and **Back**, plus today's **Reconnect saved seat** and
   **Forget saved seat** when they apply, and the online availability note. Host and Join keep today's online flow
   (capacity form, room code form, session page). Leaving an online session returns to the main menu. H-2 will switch
   Host and Join to the networked duel; not now.
4. **Settings** offers only what the app can change today:
   - **Sound volume**: Off, 25%, 50%, 75%, 100% (default 100%). It scales the existing master gain in `app/audio.ts`,
     applies at once, and is saved in `localStorage` under `ftlite-settings` (a small store in `app/settingsStore.ts`,
     the same pattern as `progressStore.ts`; malformed or missing data falls back to the default).
   - **Fullscreen**: a live toggle of the Electron window (the same `setFullScreen` that F11 uses), through a new
     preload call. It shows the window's current state and is not saved: the packaged app starts fullscreen and F11
     still toggles it.
   - **Controls**: a read-only list of the keyboard and mouse bindings, built from the input code's own tables
     (`app/duel/input.ts` for single player, `input/sources.ts` for multiplayer, `FULLSCREEN_KEY` in
     `shared/onlineSession.ts` for the key the main process toggles fullscreen on), so it cannot drift. The two mouse rows
     (wheel zooms, right or middle drag pans) are written by hand in `app/controlsList.ts`.
   - **Back**.

## Removed

- **Couch co-op**: the Couch play button and `'couch'` menu page, `createCouch`, `selectCouch` and `leaveCouch`, the
  router's couch mode, the couch-only resume paths in `main.ts`, the second keyboard cluster (`kb:1`, arrows), and the
  couch copy in the `online-disabled` text. The sector session (`app/session.ts`), the sector sim, the online sector and
  the headless tests that use them stay.
- **Gamepads**: `sampleGamepads`, `radialDeadzone`, `DEADZONE` and `PAD` in `input/sources.ts`, the `gp:` source in
  `input/onlineInput.ts`, and their tests. The renderer's sector HUD keeps its pure key-to-glyph mapping (it is fed by
  the headless HUD tests) until H-2 replaces the sector client.

## Not changed

The sim (`src/renderer/src/sim/`), `SIM_VERSION`, determinism, goldens and fixtures.

## Acceptance

- The home page shows exactly Single player, Multiplayer and Settings.
- Multiplayer shows Host, Join and Back; Host and Join reach today's forms and session page; Back returns home.
- Single player hides the menu and runs the duel; Esc then M returns to the menu, and a second Single player starts a
  fresh duel.
- Settings changes the volume, persists it across launches, toggles fullscreen, lists the controls, and Back returns home.
- No gamepad or couch path remains in `src`; `npm run typecheck`, `npm test` and `npm run test:host-runtime` pass.
- The owner checks the four screens by eye.
