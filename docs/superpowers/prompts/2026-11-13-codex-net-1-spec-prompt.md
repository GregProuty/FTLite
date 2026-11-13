# Prompt for Codex: write the Net-1 design spec

How to run (from the repo root `C:\Users\djuar\FTLite`):

```
codex exec -s workspace-write -C . "Read docs/superpowers/prompts/2026-11-13-codex-net-1-spec-prompt.md and do exactly what it says."
```

---

## Your task

Write the **design spec for milestone Net-1, "Foundations, offline"** of FTLite's networked multiplayer. Save it as `docs/superpowers/specs/2026-11-13-net-1-foundations-design.md`.

You write a spec only. Do not change any code, test, config, dependency or other doc. Do not commit. Do not run `npm install`. You may read anything in the repo, and run read-only commands such as `grep`, `npm test` and `npx tsc --noEmit -p tsconfig.web.json` to check your claims.

## What FTLite is

FTLite is a real-time co-op roguelike about a spaceship crew, in the spirit of FTL: Faster Than Light. The stack is TypeScript, Electron, Pixi 8, bitecs and vitest.

- 1–4 players each walk one crew member around the ship and sit at consoles. On the two-player Skiff these are grouped: the Helm (navigation and weapons) and Ops (science, engineering and doors), with tabs.
- The crew fight fires, breaches and boarders, vote on events, jump across a three-sector map and fight enemy ships.
- Today all players share one screen, using keyboards and gamepads.

The simulation is deterministic at a fixed 60 Hz. Each player's input each tick is an `Intent` (`src/shared/intent.ts`).

## The decision you are implementing (read these first, in this order)

1. `docs/superpowers/specs/2026-11-13-networking-decision.md`: the approved networking decision record. Net-1 is the first row of its milestone table (section 4). It is binding.
2. `research/networking-2/measurements.md`: measured facts about the code. These include the `Intent` inventory and the context-sensitive actions (section 5), the estimated semantic command set (section 5), the clock and loop and what a headless authority needs (section 7), and the import inventory and Electron-only dependencies (section 7). Use its `file:line` references.
3. `research/networking-2/prior-art.md` and `research/networking-2/transport-and-ops.md`: background. Net-1 has no transport, but its interfaces must fit them.
4. The house style and earlier specs: `docs/superpowers/specs/2026-11-13-two-seats-design.md`, `2026-11-13-combat-tempo-design.md` and `2026-11-12-duo-ship-design.md`. Match their shape: status line, numbered sections, a tests section, a gate with checkboxes, and an amendments section left empty.
5. The gate rules: `docs/gates.md` (how gate figures are recorded) and the bot gates in `tests/gate-*.test.ts`.

## What Net-1 must deliver (scope from the decision record)

Net-1 is **offline**. Couch play must keep working exactly as today through the new boundary. Nothing goes over a network.

1. **The headless authority behind a `Session`/`Link` interface, with an in-process loopback provider.**
   - Define `Session` (host, join, links) and `Link` (send on `reliable-ordered` or `unreliable-latest`, stats, capability flags), as in the decision record section 3.6 and `transport-and-ops.md`.
   - Define the **authority**: the module that owns a run, takes commands and held input, steps the sim and publishes state and events. It must import no Pixi, DOM or Electron code (see the import inventory).
   - Define the **client**: renderer, HUD and input. It reads state from the authority through the loopback.
   - Decide where the authority runs in Net-1. The recommendation is in-process in the renderer behind the interface, with a note that Net-3 moves it to an Electron `utilityProcess`. Justify your choice.
2. **The clock moves off `requestAnimationFrame`.**
   - The authority keeps its own monotonic clock and catches up on missed ticks up to a bounded budget. It never slows the game down; today's accumulator drops time (`app/loop.ts`).
   - Pausing becomes an explicit authority state. Focus loss pauses only local input in the future online mode, but keeps today's couch behaviour. Specify both.
   - Rendering interpolates between authority ticks.
3. **Semantic commands with IDs.**
   - Replace every context-sensitive press with explicit commands: Confirm on a menu row, the cursor-driven card actions, votes, jump agreement, purchases, upgrades, weapon fire and targeting, power changes, doors, seat and stand, scans, and the tab switch. Use measurements section 5 as the starting list, about 22 commands. Finalise the list with each command's parameters and validation (seat rule: a player must be seated at the console to use it).
   - Each command carries an ID so it is applied once.
   - Held input (movement axes, held interact) stays per tick.
   - The keyboard and gamepad card UIs are rebuilt on top of these commands. The cursor and selection become **client-side UI state**, not sim state, wherever that is possible without changing gameplay.
   - State exactly what moves out of the sim (for example, card cursors), what stays, and why.
   - `moveTo(tile)` for click-to-move is defined here, but the mouse UI itself is Net-2. Say whether pathfinding lands in Net-1 or Net-2.
4. **A per-viewer HUD.**
   - `buildHudModel(state, viewer)`: what a single player's screen shows (their own console card large, the others as status pills) versus today's couch layout. Couch keeps the current layout.
   - Only the model and the parameter land in Net-1. The networked layout's look can be a later step; say which.
5. **Entity-ID recycling.** Long-lived authorities leak never-recycled entity IDs (measurements section 3). Specify the fix and how it stays deterministic.
6. **A cross-engine determinism test.** A golden-hash test that runs the same seed and scripted commands in Node and in a real browser engine (Chromium via Electron, and Firefox if feasible headless), hashing every second. Add a lint rule (or test) banning non-exact `Math` functions (`sin`, `cos`, `tan`, `exp`, `log`, `pow`, `atan2`, `hypot` and so on) inside `src/renderer/src/sim`.
7. **Replay and snapshots** record the command stream (with IDs) rather than raw presses, so a replay and a re-host checkpoint reproduce a run exactly. The replay format version changes; say how.

## Rules the spec must state

- **Gameplay must not change.** Every existing test and bot gate keeps its figures, or a figure moves only for a stated, traced reason, and **no gate floor is ever lowered**.
- If the sim's state shape changes, `SIM_VERSION` is bumped once and the golden is re-blessed once (`npm run bless`).
- The bots (`sim/bot.ts`) must work through the new commands, exactly as a player does.
- Implementation is test-first, in tasks small enough for one commit each. List the tasks in the order they should land, each with its acceptance test. The implementation plan itself is written later from your spec, so do not write the full plan.
- Foundation spec section 12 still holds: original art only.

## What the spec must contain

1. Status, goal, and links to the decision record and research.
2. The architecture: authority, client, `Session`/`Link`, loopback, and a data-flow diagram in text.
3. The interfaces as TypeScript signatures: `Session`, `Link`, the authority API, the command union type with every command and its fields, the published state and event stream, and `buildHudModel(state, viewer)`.
4. The clock and pause rules.
5. The complete semantic command table: name, parameters, who may send it (the seat rule), validation, and the tick it applies on.
6. What moves out of the sim (UI state) and what stays, with reasons.
7. Entity-ID recycling.
8. The determinism guard: the cross-engine test and the lint rule.
9. Replay, snapshot and checkpoint changes.
10. Migration: how couch play, the bots, the replay tests and the golden move over without behaviour change.
11. Risks and how each is tested.
12. Ordered implementation tasks with acceptance tests.
13. Tests and gate: checkboxes, including "couch play unchanged, every gate figure unchanged or traced".
14. Open questions for the owner, if any. Keep them few and specific.
15. An empty "Amendments" section.

Write in plain, clear English. Be concrete and opinionated. Where the code forces a choice, cite `file:line`. Where you are not sure something is true of the code, check it; if you still can't tell, say so in the spec.

## When you finish

Print a short summary: the spec path, the number of semantic commands, what moves out of the sim, the task count, and any open questions.
