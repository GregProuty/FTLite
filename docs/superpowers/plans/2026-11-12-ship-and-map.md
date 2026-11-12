# Ship, Icons and Sector Map (Demo-iii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the app flies an FTL-style cruiser (`cutter.json`), system rooms and power rows carry original glyphs, and a sector map opens while anyone sits at Navigation, per `docs/superpowers/specs/2026-11-12-ship-and-map-design.md`.

**Architecture:** Task 1 wires the new ship into the app and gates it (no sim change, no golden change); Task 2 adds the icon table, the world icon layer and the power-row glyphs; Task 3 adds the map model and panel; Task 4 is docs. The spec's geometry, strings and colours are binding.

## Global Constraints

- `tests/boundary.test.ts` green; `hudModel.ts` and the pure halves of `roomIcons.ts` pixi-free (split the pure `roomIcons(state)` model from `drawIcon` if the import graph needs it: e.g. `render/roomIconModel.ts` pure and `render/roomIcons.ts` Pixi); every test under node.
- No sim state change, no version bump; `tests/golden/basic.json` untouched; `npm run bless` forbidden. `starter.json` remains the ship of every existing test, gate, the golden and `npm run acceptance`.
- `cutter.json` is committed as the spec gives it; any change to it (a door, a station tile) is recorded in spec §9 with its cause.
- Colours: `TEXT 0xe8e8e8`, `DIM 0x9aa0ad`, `FAINT 0x5a606c`, `WARN 0xff6b5a` (as `hud.ts`); geometry as spec §4-§5.
- Commits: imperative, `feat:`/`test:`/`docs:`, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `npm run typecheck`, `npm test`, `npm run build` at the end of every task.

---

### Task 1: The ship in the app, and its gate

**Files:** `src/renderer/src/main.ts`, `tests/ship.test.ts` (or a new `tests/cutter.test.ts`), `tests/gate-cutter.test.ts` (new); any code reading `room.system` that needs the new `"doors"` value.

- [ ] Tests (RED): the §6 "Ship" cases and `gate-cutter` (two bots, `DEFAULT_CHARACTERS`, seeds 1-3, five minutes, `jumpCharge = 0` every tick, assert `ended === 0` and two Conscious, figures in the message).
- [ ] Implement: `main.ts` imports `cutter.json`; grep `\.system` across `src/` and make each reader accept `"doors"` (or ignore unknown systems) with a test where behaviour changes.
- [ ] Run `gate-cutter`. If a seed fails, diagnose with a temporary per-second log (crew health and room, fires, breaches, failed consoles), then fix the layout or the bot (never a global tuning value), record it in spec §9, and re-run every gate. Record the figures in the report.
- [ ] Verify (golden untouched) and commit `feat: the app flies the FTL-style cutter (17 rooms, bow to the right); the starter stays the test ship; a two-bot survival gate on the cutter`.

### Task 2: Room icons

**Files:** `render/roomIconModel.ts` (pure, new), `render/roomIcons.ts` (Pixi, new), `render/renderer.ts` (add the icon layer), `render/hud.ts` + `render/hudModel.ts` (power-row glyph kind and tint), `tests/roomIcons.test.ts` (new), `tests/hud.test.ts`.

- [ ] Tests (RED): §6 "Icons" (both ships, the three tint cases, reactor never tinted); `HudStation` gains `iconTint` or the power rows reuse the same tint function (test it).
- [ ] Implement per spec §4: `ICON_KINDS`, `drawIcon`, `roomIcons(state)`, the world layer (built once per layout, tint updated per frame, inserted between `effects.below` and the crew), the 12 px glyph left of each power row (name shifted 14 px).
- [ ] Verify and commit `feat: original system glyphs on every system room (red when failed, faint when unpowered) and beside the power rows`.

### Task 3: Sector map

**Files:** `render/hudModel.ts` (`MapModel`, `map` block), `render/mapPanel.ts` (new), `render/hud.ts`, `tests/hud.test.ts` (or `tests/map.test.ts`).

- [ ] Tests (RED): §6 "Map" on fixture map M (helpers `mapM`, `setNodeTypes`, `seatNavigator`, `chargeJump` in `tests/helpers/sim.ts`); the title string exact (`SECTOR MAP   node 2/8   Jump READY` and the `n%` form via the existing `navigationFooter` rule).
- [ ] Implement per spec §5: the model (pure), the panel (`createMapPanel()` added by `createHud` at `(240, 170)`, `update(m.map)` per frame, visible only with a map), the title helper exported and tested.
- [ ] Verify and commit `feat: a sector map opens while anyone sits at Navigation: columns, routes, the current node, reachable nodes, the cursor's destination, shop and event marks, the exit`.

### Task 4: Docs

- [ ] Append the spec §7 gate section to `docs/gates.md` with Task 1's `gate-cutter` figures (no invented values), the manual row unchecked; fill spec §9 with every amendment and its cause; add a playtest note to `docs/playtest.md` step 3 (`See:` "the ship is the cutter: bow to the right, system rooms marked with glyphs") and step 7 (`See:` "sitting at Navigation opens the sector map"); `docs/roadmap.md` gains item 13 `in review`. Verify and commit `docs: Demo-iii gate figures, amendments, playtest notes, roadmap`.
