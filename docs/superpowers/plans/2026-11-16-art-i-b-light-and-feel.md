# Art-i-b (light and feel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Art-i sections 5-8 for the ship interior (sector ship view and duel interior): a multiply colour grade with the alert pulse and the vacuum tint, additive posterised lights, pooled code particles, impact feel (white flash, art-pixel shake, hitstop, lingering smoke, the `ftlite-feel` setting) and ambient life (console screen blink, room lamps, wall-vent steam, a drifting starfield).

**Architecture:** Pure models carry every rule and are unit-tested without Pixi: `feel.ts` (setting and multipliers), `presentClock.ts` (the hitstop clock), `impactModel.ts` (hit signals, flash, shake), `gradeModel.ts` (grade and its two adapters), `lightsModel.ts` (glows, lamps, blink, stars), `particles/random.ts` + `particles/emitter.ts` (the seeded pooled emitter) and `particles/sources.ts` (every emitter's signal, the working derivations, vents). One thin Pixi composite, `interiorFeel.ts`, owns the containers, the presentation clock and the emitter for one interior; `renderer.ts` (sector) and `duel/interiorView.ts` (duel) each create one, insert its containers in the spec's order and pass each frame's signals. The old sector shake, the red impact flash, the red low-O2 tint and the breach vent-puff sprite are removed. Task 5 first puts the console desks on the art-pixel grid (a section 4 leftover), so the screen-blink cursor sits on it. The presentation clock holds while the game is paused, and a duel restart destroys the old interior's feel with it.

**Tech Stack:** Electron 37, PixiJS 8.19.0, TypeScript 5.8, vitest 3.2.7.

**Spec:** `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md` (sections 5-8 only; refine run `docs/superpowers/reviews/2026-11-16-art-i-spec/exchange.md`). Art-i-a (sections 1-4, plan `docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md`) is merged on master (0c194e7).

## Global Constraints

- No sim, command, snapshot or authority change: `SIM_VERSION` (38) and every golden stay unchanged; `npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/boundary.test.ts` passes untouched. No file under `src/renderer/src/sim`, `src/renderer/src/authority`, `src/network` or `src/shared` changes.
- The renderer only reads sim state, never the sim RNG: no import of a module named `rng` and no `.rng` access anywhere under `src/renderer/src/render/` (enforced by `tests/artGuards.test.ts`, which adds two tests per new `.ts` file under `render/` and one per new `.ts` file under `app/`). The particle generator lives in `render/particles/random.ts`, seeded from the layout hash.
- One art pixel is 2 world units (`TILE_PX` 32 shows 16 px art at 2x). Every procedural rectangle, glow run and particle is whole art pixels (even world units at even offsets).
- No `0x` colour literal in `tiles.ts`, `doorModel.ts`, `wallModel.ts` or `effects.ts` (an existing guard test). New colours come from `ROLE` and `RAMP` in `render/palette.ts`.
- Pixi blend modes used: `'multiply'` (the grade) and `'add'` (the lights and additive particles) only; both are basic modes, no `pixi.js/advanced-blend-modes` import (Decision 1).
- Sector `addChild` order: tiles, grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights. Duel order: tiles, grade, effects.below, icons, desks, damage, crew, boarders, effects.above, lights, marks, labels.
- Feel setting: `localStorage` key `ftlite-feel`, values `full` (default), `reduced`, `off`; `feelScale` = 1/1/1, 0.5/0.5/1, 0/0/0 (shake, flash, hitstop); F9 cycles it in dev builds only.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The working copies use CRLF line endings (git `core.autocrlf=true`). Use the Edit tool for changes to existing files; where a step says "replace the whole file", use Write with the content given (git normalises the endings).
- Work happens in the worktree `.worktrees/art-i-b` on branch `art-i-b`. Every command below runs from that worktree's root (Git Bash) unless it says otherwise.

## Prototype verification

Every task's code below was written and run in a scratch worktree outside the repo (`../ftlite-art-i-b-proto`, branch `art-i-b-proto`, based on master `0c194e7`, with the signalling junction), then removed. The review round 1 fixes (R1-F1 to R1-F6: the breach debris during the hitstop, the non-overlapping grade cover, the art-pixel starfield, the console desks on the grid, `InteriorFeel.destroy`, the paused presentation dt) were applied to every task's code in a second scratch worktree (`../ftlite-art-i-b-fix`, branch `art-i-b-fix`, on master `753bb0c`, the same code as `0c194e7` outside `docs/`), run again and the code below replaced with what ran:

| Task | Prototype-verified | Evidence |
|---|---|---|
| 1 feel, clock, impact model | yes | `feel` 12 passed |
| 2 grade model | yes | `gradeModel` 9 passed |
| 3 particle emitter | yes | `particles` 8 passed |
| 4 particle sources, working, vents | yes | `particleSources` 10, `memory` 1 passed |
| 5 console desks on the art-pixel grid | yes | `consoleModel` 8, `console` 36, `consoleGroups` 14 passed |
| 6 lights and ambient model | yes | `lightsModel` 6 passed |
| 7 the interior feel composite | yes | `interiorFeel` 9 passed |
| 8 sector wiring and the feel boot | yes | `feelBoot` 2, `projectileModel` 10, `tileLayer` 4, `renderPure` 19, `duelWeaponsView` 21, `session` 36, `onlineRenderer` 11 passed |
| 9 duel wiring | yes | `duelInterior` 4 passed |
| 10 final | yes | full suite 3461 passed in 244 files (baseline 3381, +80); `npx tsc -b` clean; `npm run build` ok; the four screenshots were written and inspected in the first prototype (the fixes change no screenshot setup) |

## Decisions

1. **Blend modes need no import.** In `node_modules/pixi.js` 8.19.0, `lib/rendering/renderers/gl/state/mapWebGLBlendModesToPixi.mjs` maps `normal`, `add` (`ONE, ONE`), `multiply` (`DST_COLOR, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA`), `screen`, `none`, `erase`, `min`, `max` natively (the WebGPU map `GpuBlendModesToPixi.mjs` has `multiply` too). `BlendModePipe` only switches to a filter pass for names registered by the `pixi.js/advanced-blend-modes` extension. So `'multiply'` and `'add'` work with no extra import. With premultiplied alpha the multiply gives `dst × (1 − a + a × c)`, so a Graphics' `alpha` is the grade strength and its `tint` the colour. `Container.localBlendMode` defaults to `'inherit'`, so children take the container's mode unless they set their own: the `grade` container is `'multiply'` and its vacuum child sets `'normal'`; the `lights` container is `'add'`. The prototype rendered both in the Electron screenshots.
2. **Container placement.** The four spec containers are inserted at the top level in the spec's exact orders. The pieces the spec's list does not name go inside listed containers so the top-level order stays exact: `fixtures` (screen blink and lamp fixtures, normal blend) is the last child of the console desks container; the normal particles and the white flash are the last children of `effects.above` (where the old red `impactLayer` was); the additive particles are the last child of `lights` (after the glows). Starfield: sector `app.stage.addChildAt(starfield, 0)`, so the stage reads starfield, world, enemy window, projectiles, callouts, HUD (the duel mode already hides every visible stage child, the starfield included); duel `interior.container` holds `[starfield, world]`. The starfield draws in internal pixels inside `WORLD_BAND` (sector) or `INTERIOR_BAND` (duel).
3. **Grade model.** `gradeModel(input, t)` returns `{ ambient, alert, pulse, vacuum }` (spec section 5). `AMBIENT_STRENGTH` 0.3, `ALERT_MAX_STRENGTH` 0.35, `ALERT_PERIOD_S` 1.6, alert at `hullFraction ≤ 0.5` or any fire. `LOW_O2_THRESHOLD` 0.98 and `LOW_O2_MAX_ALPHA` 0.6 move from `effects.ts` to `gradeModel.ts`. Adapters: `sectorGradeInput(state)` = `state.hull / HULL_MAX`, `state.rooms.fire.some(f > 0)`, `state.rooms.o2[r] / state.derived.volume[r]` (exactly what `effects.ts` read); `duelGradeInput(d)` = `d.tactical.systems[CREW_SLOT].hull / SHIP_CLASSES[ship.cls].hull` (`sim/tactical/defs.ts`), fire false, `o2` empty. The grade covers floor and door tiles whole and each wall tile's floor parts and band (`gradeCover`, from `wallPicture`), never the empty half-tiles facing space, so the starfield there is untouched. `wallPicture`'s floor quarters overlap its floor halves and its band crosses them, and a multiply painted twice darkens twice (so would the duel flash built from the same cover), so `gradeCover` paints every part onto one art-pixel mask of the whole ship and returns the mask as non-overlapping row runs, each merged downward while the rows below repeat it exactly (review R1-F2; `tests/gradeModel.test.ts` paints the cover back onto art-pixel cells and checks no cell is covered twice and the union is unchanged, on the Cutter and the Skiff). Ambient and alert share one `GraphicsContext` filled white and differ by `tint` and `alpha`. The vacuum tint (role `vacuum`, normal blend, `LOW_O2_MAX_ALPHA × (1 − frac)`) replaces `effects.ts`'s `o2Layer`, which is deleted.
4. **Presentation clock.** One `PresentClock` per interior, inside `interiorFeel.ts` (so the sector renderer and each duel interior view each have one). `advance(dt)` returns the presentation seconds (dt minus any hitstop used); `hitstop(s)` keeps the longer stop. Particles step by it (a 0 step neither emits nor moves), the shake decays by it, and on the frame the clock stops every playing `AnimatedSprite` under the view's world (fire, arcs, crew walk) is `stop()`ped and the same ones `play()`ed when it runs again. The ambient life (alert pulse, screen blink, lamp flicker, fire-light flicker, vent puffs, starfield) also runs on it, so a hitstop holds the whole picture. The sim, crew interpolation, door slides (`tiles.update` keeps the real `dt`), projectiles, the enemy window and the flash's tick count never read it. While the game is paused the views pass a presentation dt of 0 (Decision 17), so the clock and everything on it hold.
5. **Hit signals.** Sector: the sim stamps `rooms.impactTick[r] = state.tick` and then increments `state.tick` (`sim/debris.ts:117`, `sim/step.ts:66`), so at draw time `impactTick === tick` never holds (today's red flash computed `age = tick − impactTick ≥ 1`). `sectorHits(impactTick, tick, seen)` therefore reports the rooms whose `impactTick` changed since the last drawn frame and is at most `HIT_FRESH_TICKS` (10) old; the first frame of a run (`seen` null) reports none, so a run reset or snapshot load never replays an old impact. The renderer keeps `seen` and clears it in `reset()`. Duel: `duelHit(events) = events.some(hitsCrew)` over the frame's drained view events (`runtime.drainEvents()`, the same array `pushEvents` gets); `InteriorView.draw` gains an optional fifth parameter `events` and `duelMode.ts` passes it.
6. **The white flash.** `FLASH_ALPHA` 0.85 in role `flash`, on for `FLASH_TICKS` 2 sim ticks counted from the tick the hit was seen (sector: the hit rooms' tiles; duel: the whole `gradeCover` at `DUEL_FLASH_SHARE` 0.5), times `feelScale().flash`. The hitstop does not extend it. It replaces the red `impactLayer` in `effects.ts`, which is deleted with `IMPACT_*`.
7. **The shake.** `SHAKE_ART_PX` 6 decaying linearly over `SHAKE_SECONDS` 0.25 s, times `feelScale().shake`; a new hit restarts it unless a stronger one is running. The offset is `round(sin(t × 90) × a)` and `round(cos(t × 77) × a)` whole art pixels (the old wobble frequencies) times `artPx = 2 × fit.scale` (one art pixel in internal pixels). Sector: it moves the world, the projectiles container and the callouts, as before; `projectileModel.SHAKE_*` and the shake in `projectiles.ts` are deleted and `ProjectileLayer.draw` returns `void`. Duel: it moves only `interior.world`; `duelMode.ts` sets the scene's fx shake to zero while the view is `'interior'` and keeps `shakeOffset(fx)` for the Helm and Weapons views (so `fxModel.ts` and its tests are unchanged). `HITSTOP_SECONDS` 0.06 times `feelScale().hitstop`.
8. **Lingering smoke.** 3 s (`SMOKE_SECONDS`) at `HIT_SMOKE_RATE` 6/s: sector from random tiles of each hit room; duel from one interior floor tile chosen by the particle generator (`emitter.random`) at the hit.
9. **Feel setting plumbing.** `render/feel.ts` (pure: `FEEL_KEY`, `parseFeel`, `nextFeel`, `feelScale`, `loadFeel`/`saveFeel` with try/catch around the storage getter and the call). `app/feelBoot.ts` `installFeel(target, { storage, keys, dev, log })` sets the stored value once and, when `dev`, adds a `keydown` listener for `F9` that cycles, applies and saves it. `main.ts` calls it through `bootFeel(renderer)` right after each of the three `createRenderer` calls (app, `?mode=flight`, `?mode=duel`) with `storage: () => localStorage`, `keys: window`, `dev: import.meta.env.DEV` (how `hudModel.ts` detects dev builds; Vite sets it false in `npm run build`). `Renderer` gains `feel()` and `setFeel()`; `createInteriorView(assets, stageScale, feel)` takes the getter, which `duelMode.ts` passes as `renderer.feel`. F9 is unused elsewhere (grep).
10. **The emitter.** `createEmitter(seed, cap = 600)`: particles in spawn order, each holding a pool slot; spawning at the cap drops the oldest (index 0) and reuses its slot; sources emit `rate × dt` through per-key carries that are dropped when a key is absent. Colour `ramp[min(len − 1, floor(age / life × len))]`; drawn corner `2 × round((p − size) / 2)`, centred. The seed is `hashString(layoutHash)` (FNV-1a) into mulberry32; the composite re-creates the emitter when the layout hash changes. `particleLayer.ts` creates all 600 `Sprite(Texture.WHITE)` up front in the normal container (so the display tree never grows: `tests/duelInterior.test.ts` checks that), moves a slot's sprite to the additive container when its particle is additive, and hides the rest. The file is `random.ts`, not `rng.ts`, because the render guard forbids a module named `rng`.
11. **Emitters and their signals (real names).** Fire: `fireTiles(d.roomTiles[r], state.rooms.fire[r], FIRE_CAP)` per burning room, embers (additive, `fire` ramp white to red) 5/s and smoke (`vent` ramp greys) 1.5/s per tile. Sparks (additive, `electric`): `state.stations.failed[i] === 1` at `d.stationTile[i]` (sector), and each `d.points` entry whose `d.tactical.systems[0].rooms[p.tacticalRoom] > 0` at `p.tile` (duel), 8/s; they add to the `fx.arc` sprite. Venting: every `state.breaches.active[s] === 1`, from `breachFloorNeighbour(d, s)` toward `d.siteTile[s]` (the hole), 16/s. Debris: 14 particles on the frame `breaches.active[s]` goes 0 to 1 (`breachOpenings`, null on a run's first frame), spawned whatever that frame's presentation dt: the hit that opens a breach starts the hitstop on the same frame, so its pdt is 0, and `emitter.step(0)` neither ages nor moves them, so the debris holds through the hitstop and then flies (review R1-F1). Working: sector `interactTarget(state, pid).kind` in `TargetKind.Fire` (index = room), `TargetKind.Breach` (index = site), `TargetKind.Power` (index = station), with the progress fields `state.rooms.fireRepair[room]`, `state.breaches.repair[site]`, `state.stations.repair[i]` sampled into `RenderMemory.repair` (`{ last, prev }`, shifted when `state.tick` changes) and compared; duel `d.events` entries `{ kind: 'repairWork', player, room }` (cleared each tick by `stepDuelTick`, so they are the latest tick's) at the matching `d.points` tile. Foam (`vent` whites) at a fire's nearest burning tile, sparks otherwise. A working crew member's sprite is lifted 2 world units for the second half of every 0.25 s (`bobOffset`), through a new optional `bob` parameter on `CrewLayer.draw` indexed by `Owner.pid`.
12. **Decision 18 (g) of Art-i-a: the vent-puff sprite is replaced.** The rotated `vent.puff` AnimatedSprite per breach is deleted from `effects.ts`; a breach now shows its decal (or fallback square), damaged floor, the venting stream and the opening debris. The `vent.puff` manifest entry and the `vent` feature in `FEATURE_NAMES` stay (credits and the manifest tests are unchanged; nothing draws it), and `hazardTiles.ventRotation` stays (still tested in `renderPure`). The open-airlock oxygen specks (`ventParticles`) are unchanged. Decision 18 (f) (the old whole-internal-pixel shake) is replaced by Decision 7.
13. **Lights.** `glowRuns(radius)` makes a posterised disc of art pixels in 3 alpha steps (0.14, 0.26, 0.42) by distance third, merged into row runs; each kind is one shared white `GraphicsContext` (radius 5 art px console, 8 fire, 4 lamp), each light a `Graphics` on it with `tint` and `alpha`. Console: `consoles(state)` (one per desk), tint `screenA`, alpha 0.5 free, 0.85 occupied, 0 down. Fire: tint `RAMP.fire[2]`, alpha stepping 0.45/0.6/0.75 ten times a second per tile. Lamp: tint `lampOn` alpha 0.9 in alert; else `lampOff` alpha 0.55, dark while its flicker schedule says so.
14. **Ambient.** Screen blink: the spec's "screens blink between `screenA` and `screenB`" would erase the console state colours (amber free, dim amber occupied, red down, spec Demo-xii), so a 2 × 1 art-pixel readout cursor on each powered console's screen blinks between `screenA` and `screenB` at 1-2 Hz (rate and phase from `hash2(seed, station)`), and a down console does not blink. The cursor sits one art pixel in from the screen's start and inside the screen, which Task 5 puts on the art-pixel grid first (Decision 19). Lamps: on each room's top-left floor tile (`min(roomTiles[r])`), `LAMP_OFFSET` 6 world units in, a 2 × 2 art-pixel fixture (`lampOn`, `lampOff`, or `wallShadow` while flickered dark) plus its glow; the flicker period is 3-7 s with 0.14 s dark in two drops. Vents: wall tiles with a floor 4-neighbour where `hashU32(hashString(layoutHash), tile) % 8 === 0`; the puff leaves the wall band's floor-side edge (tile centre ± 6) toward the first floor neighbour in up, left, right, down order; one puff of 7 particles every 4-8 s per vent. Starfield: 48 far and 20 near stars, one art pixel square, drifting left at 4 and 10 art px/s and wrapping inside the band; colours `RAMP.vent[3]` (far) and `RAMP.vent[1]` (near). The starfield draws in internal pixels, where one art pixel of the ship is `frame.artPx` = 2 × `fit.scale` (whole screen pixels, from Art-i-a's snapped fit), so `stars(seed, band, t, artPx)` makes each star `artPx` square at whole multiples of `artPx` from the band's corner and moves the layers at 4 × and 10 × `artPx` per second (review R1-F3).
15. **Screenshots** reuse the Art-i-a harness approach (Art-i-a Decisions 16-17: a gitignored Vite page in `.art/shots/`, Electron via the `SHOT` environment variable, `about:blank` loaded before the viewport is emulated) with two changes: the page sets up the four looks (duel normal; duel alert = crew hull at 40 % plus Engines damaged; sector Skiff alert = hull 40 plus a fire; sector Skiff vacuum = breach site 0 open with its room at 25 % oxygen), and the server uses port **5299**, because during planning port 5199 was still held by a leftover Art-i-a harness Vite process started from `.worktrees/art-i-a` (left running; not this plan's to stop).
16. **Test count.** New tests: `feel` 12, `feelBoot` 2, `gradeModel` 9, `particles` 8, `particleSources` 10, `lightsModel` 6, `interiorFeel` 9, `consoleModel` +1 (7 to 8), `session` +1 (35 to 36), `duelInterior` +1, `artGuards` +21 (2 per new render file × 10, 1 for `app/feelBoot.ts`): **+80**. New test files: 7 (the suite goes from 237 to 244 files).
17. **Paused presentation (review R1-F6).** The presentation clock must not run while the game is paused (particles, the alert pulse, the lamp flicker, the blink and the starfield would carry on over a paused ship). Duel: `InteriorView.draw` gains a sixth parameter `presentDt` (default `dt`) that only the interior feel reads, and `duelMode.ts` passes `runtime.paused() ? 0 : dt` (the same rule `stepFx` already uses); the tiles and boarders keep the real `dt`. Sector: the session already knows its phase, so `Renderer.draw` gains an optional sixth parameter `paused` (default `false`) and the feel gets `paused ? 0 : dt`; `app/session.ts` passes `phase === 'paused'` (with `undefined` for the presentation points it never passed), `app/onlineSession.ts` passes its own `phase === 'paused'` (from the publication's phase), and the `SessionDeps.renderer.draw` type gains the parameter. This is a renderer-side signature only: no sim, command, snapshot or network contract changes (`src/network` is untouched). The door slides, projectiles and the enemy window keep the real `dt` while paused, as today. A zero dt is not a hitstop: `AnimatedSprite`s (fire, arcs) keep playing while paused, as they do today.
18. **Destroying an interior feel (review R1-F5).** `InteriorFeel.destroy()` destroys every Graphics the feel made with no options (so each one's own context goes too: a parent's `destroy({ children: true })` passes options, and Pixi 8.19's `Graphics.destroy` then leaves an owned context; it never destroys a context it was given), then the four shared `GraphicsContext`s (the cover and the console, fire and lamp glows). `InteriorView.destroy` calls `fx.destroy()` before `container.destroy({ children: true })`, so a duel restart (which destroys the interior view and builds a new one) frees them. The sector renderer builds its one feel at boot and never replaces it; a layout change (a new ship) clears and refills the same cover context and destroys and rebuilds only the glow Graphics on the shared glow contexts, so nothing leaks there (`tests/interiorFeel.test.ts` checks a layout change leaves exactly the new layout's glows, and that `destroy` frees the shared contexts). `Renderer` has no destroy, so the sector feel needs none.
19. **Console desks on the art-pixel grid (review R1-F4).** Art-i-a's grid work did not cover `consoleModel.ts` (`DESK_W` was `round(19.2)` = 19, `SCREEN_D` 3, the outline 1 wide), so the cursor (Decision 14) could not sit on the grid inside the screen. Task 5 sets `DESK_W` 20, `DESK_D` 10 (unchanged), `SCREEN_D` 2, `SCREEN_INSET` 2 and `DESK_OUTLINE_W` 2 (drawn with alignment 1, inside the desk) before the cursor task; `WALL_GAP` stays 10. Every desk, screen and outline band of every side and flush case is then on the grid (`tests/consoleModel.test.ts`).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/renderer/src/render/feel.ts` | create | Feel setting, `feelScale`, storage helpers (pure). |
| `src/renderer/src/render/presentClock.ts` | create | Presentation clock with hitstop (pure). |
| `src/renderer/src/render/impactModel.ts` | create | Hit signals, flash alpha, art-pixel shake (pure). |
| `src/renderer/src/render/gradeModel.ts` | create | `gradeModel`, both adapters, `gradeCover`, `lampPoints`, `cellAt` (pure). |
| `src/renderer/src/render/particles/random.ts` | create | `hashString`, `hashU32`, `hash2`, seeded `createRandom` (pure). |
| `src/renderer/src/render/particles/emitter.ts` | create | Pooled emitter model, colour stepping, corner snapping (pure). |
| `src/renderer/src/render/particles/sources.ts` | create | Every emitter signal, working derivations, vents (pure). |
| `src/renderer/src/render/lightsModel.ts` | create | Glow runs, light levels, lamp flicker, screen blink, stars (pure). |
| `src/renderer/src/render/particles/particleLayer.ts` | create | 600 pooled Sprites in two containers (Pixi). |
| `src/renderer/src/render/interiorFeel.ts` | create | The per-interior composite (Pixi). |
| `src/renderer/src/app/feelBoot.ts` | create | Boot read and the F9 dev cycle. |
| `src/renderer/src/render/memory.ts` | modify (rewrite) | `repair` watch in RenderMemory. |
| `src/renderer/src/render/consoleModel.ts`, `consoleLayer.ts` | modify | Desks, screens and the outline on the art-pixel grid (Decision 19). |
| `src/renderer/src/app/session.ts`, `app/onlineSession.ts` | modify | Pass the paused phase to `Renderer.draw` (Decision 17). |
| `src/renderer/src/render/projectileModel.ts`, `projectiles.ts` | modify | Old shake removed. |
| `src/renderer/src/render/effects.ts` | modify (rewrite) | o2Layer, impactLayer and vent puffs removed. |
| `src/renderer/src/render/crewSprites.ts` | modify | `bob` parameter. |
| `src/renderer/src/render/renderer.ts` | modify (rewrite) | Sector wiring, `feel()`/`setFeel()`, the `paused` draw parameter. |
| `src/renderer/src/main.ts` | modify | `bootFeel` after each `createRenderer`. |
| `src/renderer/src/render/duel/interiorView.ts` | modify (rewrite) | Duel wiring, `events`, `presentDt` and `feel` parameters; destroys its feel. |
| `src/renderer/src/app/duel/duelMode.ts` | modify | Passes events, the paused presentation dt and the feel; scene shake only outside the interior. |
| `tests/feel.test.ts`, `tests/gradeModel.test.ts`, `tests/particles.test.ts`, `tests/particleSources.test.ts`, `tests/lightsModel.test.ts`, `tests/interiorFeel.test.ts`, `tests/feelBoot.test.ts` | create | New tests. |
| `tests/projectileModel.test.ts`, `tests/duelInterior.test.ts`, `tests/consoleModel.test.ts`, `tests/session.test.ts` | modify | Old shake constants dropped; duel order and hit test; desk grid numbers and the grid test; the paused draw flag. |

---

### Step 0: Worktree and baseline

- [ ] **Step 0.1: Create the worktree** (from the main checkout `C:\Users\djuar\FTLite`, Git Bash)

```bash
cd /c/Users/djuar/FTLite
git worktree add .worktrees/art-i-b -b art-i-b master
cd .worktrees/art-i-b
npm ci --no-audit --no-fund
powershell -NoProfile -Command "New-Item -ItemType Junction -Path 'C:\Users\djuar\FTLite\.worktrees\art-i-b\services\signalling\node_modules' -Target 'C:\Users\djuar\FTLite\services\signalling\node_modules' | Out-Null"
```

Expected: `Preparing worktree (new branch 'art-i-b')`, then npm finishes (an `allow-scripts` warning about esbuild or electron is harmless). The junction gives the worktree the signalling service's `node_modules`, which `tests/onlineAppRuntime.test.ts` needs. At the very end of the branch's life (after merge), delete the junction itself before `git worktree remove`: `powershell -NoProfile -Command "(Get-Item 'C:\Users\djuar\FTLite\.worktrees\art-i-b\services\signalling\node_modules').Delete()"` (this removes the link only; never `Remove-Item -Recurse` on it, which would delete the target's files).

- [ ] **Step 0.2: Build once** (one test reads `out/main/authorityHost.js`)

Run: `npm run build 2>&1 | tail -1`
Expected: `✓ built in ...` and no error.

- [ ] **Step 0.3: Record the baseline**

Run (with no other build or test run going on the machine): `npx vitest run 2>&1 | tail -5`
Expected: `Test Files 237 passed (237)` and `Tests 3381 passed (3381)` on master `0c194e7` and on `753bb0c` (which changes only `docs/`; adjust if master moved). Write down the total. **0 failed is required.** If anything fails, stop and report it before Task 1; it is not a flake. (On the planning machine a run made while `npm run build` and another session's tests were running hit five 5 s timeouts in `authorityBoundary`, `director`, `run` and `snapshot`; the same files passed alone and the full suite passed on an idle machine. Run the baseline on an idle machine.)

---

### Task 1: Feel setting, presentation clock and impact model

**Files:**
- Create: `src/renderer/src/render/feel.ts`
- Create: `src/renderer/src/render/presentClock.ts`
- Create: `src/renderer/src/render/impactModel.ts`
- Test: `tests/feel.test.ts` (create)

**Interfaces:**
- Consumes: `hitsCrew`, `ViewEvent` from `render/tactical/fxModel.ts` (unchanged).
- Produces:
  - `feel.ts`: `FEEL_KEY = 'ftlite-feel'`; `FEEL_SETTINGS`; `type FeelSetting = 'full' | 'reduced' | 'off'`; `DEFAULT_FEEL`; `interface FeelScale { shake: number; flash: number; hitstop: number }`; `feelScale(s): FeelScale`; `parseFeel(raw: string | null | undefined): FeelSetting`; `nextFeel(s): FeelSetting`; `interface FeelStorage { getItem(key): string | null; setItem(key, value): void }`; `loadFeel(storage: () => FeelStorage): FeelSetting`; `saveFeel(storage: () => FeelStorage, s): void`.
  - `presentClock.ts`: `interface PresentClock { readonly t: number; readonly stopped: boolean; advance(dt): number; hitstop(seconds): void; reset(): void }`; `createPresentClock(): PresentClock`.
  - `impactModel.ts`: `FLASH_TICKS = 2`, `FLASH_ALPHA = 0.85`, `DUEL_FLASH_SHARE = 0.5`, `SHAKE_ART_PX = 6`, `SHAKE_SECONDS = 0.25`, `HITSTOP_SECONDS = 0.06`, `SMOKE_SECONDS = 3`, `HIT_FRESH_TICKS = 10`; `interface Shake { left; amp; t }`; `createShake()`, `kickShake(s, feel: FeelScale)`, `stepShake(s, pdt)`, `shakeOffset(s, artPx): { x; y }`; `flashAlpha(ticksSince, feel, share = 1): number`; `sectorHits(impactTick: ArrayLike<number>, tick, seen: Int32Array | null): { rooms: number[]; seen: Int32Array }`; `duelHit(events: readonly ViewEvent[]): boolean`.

- [ ] **Step 1: Write the failing test** — create `tests/feel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_FEEL, FEEL_KEY, feelScale, loadFeel, nextFeel, parseFeel, saveFeel } from '../src/renderer/src/render/feel';
import { createPresentClock } from '../src/renderer/src/render/presentClock';
import {
  createShake, duelHit, flashAlpha, FLASH_ALPHA, FLASH_TICKS, HITSTOP_SECONDS, HIT_FRESH_TICKS, kickShake, sectorHits, shakeOffset, SHAKE_ART_PX, SHAKE_SECONDS, SMOKE_SECONDS, stepShake
} from '../src/renderer/src/render/impactModel';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';

const memory = (): { store: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void } => {
  const store = new Map<string, string>();
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } };
};

describe('the feel setting (Art-i spec section 7)', () => {
  it('feelScale gives the shake, flash and hitstop multipliers for full, reduced and off', () => {
    expect(feelScale('full')).toEqual({ shake: 1, flash: 1, hitstop: 1 });
    expect(feelScale('reduced')).toEqual({ shake: 0.5, flash: 0.5, hitstop: 1 });
    expect(feelScale('off')).toEqual({ shake: 0, flash: 0, hitstop: 0 });
  });
  it('parses stored values, defaulting to full, and F9 cycles full, reduced, off', () => {
    expect([parseFeel('full'), parseFeel('reduced'), parseFeel('off'), parseFeel(null), parseFeel('loud')]).toEqual(['full', 'reduced', 'off', 'full', 'full']);
    expect(DEFAULT_FEEL).toBe('full');
    expect([nextFeel('full'), nextFeel('reduced'), nextFeel('off')]).toEqual(['reduced', 'off', 'full']);
  });
  it('loads and saves under ftlite-feel; a throwing storage gives the default and never escapes', () => {
    const m = memory();
    expect(loadFeel(() => m)).toBe('full');
    saveFeel(() => m, 'off');
    expect(m.store.get(FEEL_KEY)).toBe('off'); expect(FEEL_KEY).toBe('ftlite-feel');
    expect(loadFeel(() => m)).toBe('off');
    const denied = (): never => { throw new Error('SecurityError'); };
    expect(loadFeel(denied)).toBe('full');
    expect(() => saveFeel(denied, 'reduced')).not.toThrow();
  });
});

describe('the presentation clock and the hitstop (Art-i spec section 7)', () => {
  it('a 60 ms hitstop holds the clock for 60 ms of frames, then it runs on', () => {
    const c = createPresentClock(), frame = 1 / 60;
    c.advance(0.5);
    expect(c.t).toBeCloseTo(0.5);
    c.hitstop(HITSTOP_SECONDS);
    expect(HITSTOP_SECONDS).toBe(0.06);
    const runs = [1, 2, 3, 4, 5].map(() => c.advance(frame));
    expect(runs.slice(0, 3)).toEqual([0, 0, 0]);                     // three whole frames (50 ms) frozen
    expect(runs[3]).toBeCloseTo(frame - (0.06 - 3 * frame));          // the fourth frame loses the last 10 ms
    expect(runs[4]).toBeCloseTo(frame);
    expect(c.t).toBeCloseTo(0.5 + 5 * frame - 0.06);
    expect(c.stopped).toBe(false);
  });
  it('a second hit keeps the longer stop, and reset clears time and stop', () => {
    const c = createPresentClock();
    c.hitstop(0.06); c.advance(0.05); c.hitstop(0.02);
    expect(c.stopped).toBe(true);
    expect(c.advance(0.05)).toBeCloseTo(0.03);   // max(0.01 left, 0.02) = 0.02 held
    c.hitstop(1); c.reset();
    expect([c.t, c.stopped]).toEqual([0, false]);
  });
});

describe('the art-pixel shake (Art-i spec section 7)', () => {
  it('starts at 6 art pixels, steps in whole art pixels, decays linearly to 0 over 0.25 s', () => {
    expect([SHAKE_ART_PX, SHAKE_SECONDS]).toEqual([6, 0.25]);
    const s = createShake();
    expect(shakeOffset(s, 2)).toEqual({ x: 0, y: 0 });
    kickShake(s, feelScale('full'));
    for (let k = 0; k < 20; k++) {
      const o = shakeOffset(s, 2), bound = SHAKE_ART_PX * (s.left / SHAKE_SECONDS);
      for (const v of [o.x, o.y]) { expect(Number.isInteger(v / 2)).toBe(true); expect(Math.abs(v / 2)).toBeLessThanOrEqual(Math.round(bound) + 0.5); }
      stepShake(s, 1 / 60);
    }
    stepShake(s, 1);
    expect(shakeOffset(s, 2)).toEqual({ x: 0, y: 0 });
  });
  it('the offset is in art pixels of the parent: art pixel 1 at world scale 0.5', () => {
    const s = createShake(); kickShake(s, feelScale('full')); stepShake(s, 0.011);
    const a = shakeOffset(s, 1), b = shakeOffset(s, 2);
    expect([b.x, b.y]).toEqual([a.x * 2, a.y * 2]);
  });
  it('the feel scales it: reduced is 3 art pixels, off never shakes; a hitstop (pdt 0) holds it', () => {
    const r = createShake(); kickShake(r, feelScale('reduced'));
    expect(r.amp).toBe(3);
    const off = createShake(); kickShake(off, feelScale('off'));
    expect([off.left, shakeOffset(off, 2)]).toEqual([0, { x: 0, y: 0 }]);
    const s = createShake(); kickShake(s, feelScale('full'));
    stepShake(s, 0);
    expect(s.left).toBe(SHAKE_SECONDS);
  });
  it('a second hit restarts it without cutting a stronger one short', () => {
    const s = createShake(); kickShake(s, feelScale('full')); stepShake(s, 0.1);
    kickShake(s, feelScale('reduced'));
    expect(s.amp).toBeCloseTo(SHAKE_ART_PX * (0.15 / 0.25)); expect(s.left).toBe(SHAKE_SECONDS);
  });
});

describe('the flash and the hit signals (Art-i spec section 7)', () => {
  it('the flash is on for exactly 2 sim ticks, scaled by the feel and the duel share', () => {
    expect(FLASH_TICKS).toBe(2);
    expect([0, 1, 2, -1].map((k) => flashAlpha(k, feelScale('full')))).toEqual([FLASH_ALPHA, FLASH_ALPHA, 0, 0]);
    expect(flashAlpha(0, feelScale('reduced'))).toBeCloseTo(FLASH_ALPHA / 2);
    expect(flashAlpha(0, feelScale('full'), 0.5)).toBeCloseTo(FLASH_ALPHA / 2);
    expect(flashAlpha(0, feelScale('off'))).toBe(0);
  });
  it('sector: a room whose impactTick changed since the last frame and is fresh is hit; the first frame never is', () => {
    expect(SMOKE_SECONDS).toBe(3);
    let r = sectorHits([-1, 40, -1], 41, null);
    expect(r.rooms).toEqual([]);                                     // first frame of a run: nothing replays
    r = sectorHits([-1, 40, -1], 42, r.seen);
    expect(r.rooms).toEqual([]);                                     // unchanged
    r = sectorHits([50, 40, 50], 51, r.seen);
    expect(r.rooms).toEqual([0, 2]);                                 // two rooms hit in the same step
    r = sectorHits([50, 40, 50 + 0], 52, r.seen);
    expect(r.rooms).toEqual([]);
    r = sectorHits([50, 60, 50], 60 + HIT_FRESH_TICKS + 1, r.seen);
    expect(r.rooms).toEqual([]);                                     // stale: older than HIT_FRESH_TICKS
  });
  it('duel: a hit is any event hitsCrew accepts', () => {
    const laser = (ship: number, hit: boolean): ViewEvent => ({ kind: 'laser', ship, hit, x1: 0, y1: 0, x2: 1, y2: 1 } as unknown as ViewEvent);
    expect(duelHit([])).toBe(false);
    expect(duelHit([laser(1, false)])).toBe(false);
    expect(duelHit([laser(0, true)])).toBe(false);                   // the crew's own laser
    expect(duelHit([laser(1, false), laser(1, true)])).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/feel.test.ts`
Expected: FAIL, `Failed to resolve import "../src/renderer/src/render/feel"`.

- [ ] **Step 3: Create `src/renderer/src/render/feel.ts`**

```ts
// The feel setting (Art-i spec section 7): how hard hits land. Stored in localStorage under FEEL_KEY, read once at boot
// (app/feelBoot.ts); there is no menu in Art-i, and F9 cycles it in dev builds only. Pure: no Pixi, no DOM.

export const FEEL_KEY = 'ftlite-feel';
export const FEEL_SETTINGS = ['full', 'reduced', 'off'] as const;
export type FeelSetting = (typeof FEEL_SETTINGS)[number];
export const DEFAULT_FEEL: FeelSetting = 'full';

/** Multipliers on the impact feel: the shake's amplitude, the flash's strength and the hitstop's length. */
export interface FeelScale { shake: number; flash: number; hitstop: number }

const SCALES: Readonly<Record<FeelSetting, FeelScale>> = {
  full: { shake: 1, flash: 1, hitstop: 1 },
  reduced: { shake: 0.5, flash: 0.5, hitstop: 1 },
  off: { shake: 0, flash: 0, hitstop: 0 }
};

export function feelScale(setting: FeelSetting): FeelScale { return SCALES[setting]; }

/** A stored value back to a setting; anything unknown (or nothing stored) is the default. */
export function parseFeel(raw: string | null | undefined): FeelSetting {
  return (FEEL_SETTINGS as readonly string[]).includes(raw ?? '') ? (raw as FeelSetting) : DEFAULT_FEEL;
}

/** The F9 dev cycle: full, reduced, off, full. */
export function nextFeel(setting: FeelSetting): FeelSetting {
  return FEEL_SETTINGS[(FEEL_SETTINGS.indexOf(setting) + 1) % FEEL_SETTINGS.length]!;
}

export interface FeelStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Reads the setting; a storage that throws (denied, private window) gives the default. */
export function loadFeel(storage: () => FeelStorage): FeelSetting {
  try { return parseFeel(storage().getItem(FEEL_KEY)); } catch { return DEFAULT_FEEL; }
}

/** Writes the setting; storage failures are ignored (the setting still applies for this session). */
export function saveFeel(storage: () => FeelStorage, setting: FeelSetting): void {
  try { storage().setItem(FEEL_KEY, setting); } catch { /* storage unavailable or full */ }
}
```

- [ ] **Step 4: Create `src/renderer/src/render/presentClock.ts`**

```ts
// The presentation clock (Art-i spec section 7): the time particles, sprite animation, the shake and the ambient life
// run on. A hitstop stops it for a moment; the sim, its interpolation and tick-counted effects (the flash) never read
// it, so they keep running. Pure: no Pixi.

export interface PresentClock {
  /** Presentation seconds since the clock was made (frozen during a hitstop). */
  readonly t: number;
  /** True while a hitstop holds the clock. */
  readonly stopped: boolean;
  /** Advance by a frame's real seconds; returns the presentation seconds that passed (dt minus any hitstop it used). */
  advance(dt: number): number;
  /** Stop the clock for `seconds` from now; a longer stop already running is kept. */
  hitstop(seconds: number): void;
  reset(): void;
}

export function createPresentClock(): PresentClock {
  let t = 0, stop = 0;
  return {
    get t() { return t; },
    get stopped() { return stop > 0; },
    advance(dt) {
      const held = Math.min(stop, dt);
      stop -= held;
      const run = dt - held;
      t += run;
      return run;
    },
    hitstop(seconds) { stop = Math.max(stop, seconds); },
    reset() { t = 0; stop = 0; }
  };
}
```

- [ ] **Step 5: Create `src/renderer/src/render/impactModel.ts`**

```ts
// Impact feel (Art-i spec section 7): the hit signals, the white flash, the art-pixel shake, the hitstop and the
// lingering smoke. Pure: no Pixi. The shake and the smoke run on the presentation clock; the flash counts sim ticks.
import { hitsCrew, type ViewEvent } from './tactical/fxModel';
import type { FeelScale } from './feel';

/** The flash lasts 2 sim ticks (33 ms) at full strength, whatever the frame rate; a hitstop does not extend it. */
export const FLASH_TICKS = 2, FLASH_ALPHA = 0.85, DUEL_FLASH_SHARE = 0.5;
/** 6 art pixels, decaying linearly to 0 over 0.25 s, in whole-art-pixel steps. */
export const SHAKE_ART_PX = 6, SHAKE_SECONDS = 0.25;
export const HITSTOP_SECONDS = 0.06;
export const SMOKE_SECONDS = 3;
/** A room's impactTick that changed since the last drawn frame counts as a hit only while this fresh (ticks), so a
 *  snapshot load or a long pause never replays an old impact. */
export const HIT_FRESH_TICKS = 10;

export interface Shake { left: number; amp: number; t: number }
export function createShake(): Shake { return { left: 0, amp: 0, t: 0 }; }

/** A hit: the shake restarts at its full amplitude (scaled by the feel), or keeps a stronger one still running. */
export function kickShake(s: Shake, feel: FeelScale): void {
  const now = s.left > 0 ? s.amp * (s.left / SHAKE_SECONDS) : 0;
  s.amp = Math.max(now, SHAKE_ART_PX * feel.shake); s.left = s.amp > 0 ? SHAKE_SECONDS : 0;
}

/** Advance by presentation seconds (a hitstop passes 0, so the shake holds). */
export function stepShake(s: Shake, pdt: number): void {
  if (s.left <= 0) return;
  s.left = Math.max(0, s.left - pdt); s.t += pdt;
}

/** The offset now, in world units of the shaken container's parent: a whole number of art pixels times `artPx` (the
 *  size of one art pixel there: 2 x the world scale). Zero when no shake runs. */
export function shakeOffset(s: Shake, artPx: number): { x: number; y: number } {
  if (s.left <= 0) return { x: 0, y: 0 };
  const a = s.amp * (s.left / SHAKE_SECONDS);
  return { x: (Math.round(Math.sin(s.t * 90) * a) || 0) * artPx, y: (Math.round(Math.cos(s.t * 77) * a) || 0) * artPx };
}

/** The flash's alpha `ticksSince` sim ticks after the hit was seen: FLASH_ALPHA x the feel for FLASH_TICKS ticks, then 0. */
export function flashAlpha(ticksSince: number, feel: FeelScale, share = 1): number {
  return ticksSince >= 0 && ticksSince < FLASH_TICKS ? FLASH_ALPHA * feel.flash * share : 0;
}

/**
 * Sector hits: the rooms whose impactTick changed since the last drawn frame and is fresh. The sim stamps impactTick
 * with the tick it resolved and then advances, so the drawn state's tick is already one past it; a change is the hit.
 * `seen` holds each room's impactTick at the last call (null on the first frame of a run: nothing is a hit). Returns
 * the hit rooms and the new `seen`.
 */
export function sectorHits(impactTick: ArrayLike<number>, tick: number, seen: Int32Array | null): { rooms: number[]; seen: Int32Array } {
  const next = Int32Array.from(impactTick), rooms: number[] = [];
  if (seen && seen.length === next.length) {
    for (let r = 0; r < next.length; r++) if (next[r]! >= 0 && next[r] !== seen[r] && tick - next[r]! <= HIT_FRESH_TICKS) rooms.push(r);
  }
  return { rooms, seen: next };
}

/** Duel hits: any view event this frame that is a hit on the crew ship (the feed the tactical effects read). */
export function duelHit(events: readonly ViewEvent[]): boolean { return events.some(hitsCrew); }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/feel.test.ts tests/artGuards.test.ts`
Expected: PASS, `feel` 12 tests; `artGuards` gains 6 tests (two per new render file) and all pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/feel.ts src/renderer/src/render/presentClock.ts src/renderer/src/render/impactModel.ts tests/feel.test.ts
git commit -m "feat(art-i-b): feel setting, presentation clock and impact model" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The grade model and its adapters

**Files:**
- Create: `src/renderer/src/render/gradeModel.ts`
- Test: `tests/gradeModel.test.ts` (create)

**Interfaces:**
- Consumes: `wallPicture`, `Cell` (`render/wallModel.ts`); `DoorRect` (`render/doorModel.ts`); `HULL_MAX` (`sim/tuning.ts`); `CREW_SLOT` (`sim/tactical/state.ts`); `SHIP_CLASSES` (`sim/tactical/defs.ts`); `SimState`, `DuelState` types.
- Produces: `LOW_O2_THRESHOLD = 0.98`, `LOW_O2_MAX_ALPHA = 0.6`, `AMBIENT_STRENGTH = 0.3`, `ALERT_MAX_STRENGTH = 0.35`, `ALERT_PERIOD_S = 1.6`, `ALERT_HULL_FRACTION = 0.5`; `interface GradeInput { hullFraction: number; fire: boolean; o2: readonly number[] }`; `interface Grade { ambient: number; alert: boolean; pulse: number; vacuum: { room: number; strength: number }[] }`; `gradeModel(input, t): Grade`; `alertStrength(g): number`; `sectorGradeInput(state: SimState): GradeInput`; `duelGradeInput(d: DuelState): GradeInput`; `cellAt(rows, x, y): Cell`; `gradeCover(rows, width, height): DoorRect[]`; `LAMP_OFFSET = 6`; `lampPoints(roomTiles, width): { room; x; y }[]`.

- [ ] **Step 1: Write the failing test** — create `tests/gradeModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { SHIP_CLASSES } from '../src/renderer/src/sim/tactical/defs';
import { HULL_MAX } from '../src/renderer/src/sim/tuning';
import { TILE_PX } from '../src/shared/resolution';
import {
  ALERT_MAX_STRENGTH, AMBIENT_STRENGTH, alertStrength, cellAt, duelGradeInput, gradeCover, gradeModel, LAMP_OFFSET, lampPoints, LOW_O2_MAX_ALPHA, LOW_O2_THRESHOLD, sectorGradeInput
} from '../src/renderer/src/render/gradeModel';
import { wallPicture } from '../src/renderer/src/render/wallModel';
import { cutterState } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';
import { onGrid } from './helpers/artGrid';

const calm = { hullFraction: 1, fire: false, o2: [1, 1, 1] };

describe('gradeModel (Art-i spec section 5)', () => {
  it('neither: full hull, no fire, full air: the ambient only', () => {
    expect(gradeModel(calm, 0.4)).toEqual({ ambient: AMBIENT_STRENGTH, alert: false, pulse: 0, vacuum: [] });
    expect(alertStrength(gradeModel(calm, 0.4))).toBe(0);
  });
  it('alert at hull 0.5 or below, or any fire; the pulse is 0.5 - 0.5 cos(2 pi t / 1.6)', () => {
    expect(gradeModel({ ...calm, hullFraction: 0.51 }, 0).alert).toBe(false);
    expect(gradeModel({ ...calm, hullFraction: 0.5 }, 0).alert).toBe(true);
    expect(gradeModel({ ...calm, fire: true }, 0).alert).toBe(true);
    const at = (t: number): number => gradeModel({ ...calm, fire: true }, t).pulse;
    expect(at(0)).toBeCloseTo(0); expect(at(0.8)).toBeCloseTo(1); expect(at(0.4)).toBeCloseTo(0.5); expect(at(1.6)).toBeCloseTo(0);
    expect(alertStrength(gradeModel({ ...calm, fire: true }, 0.8))).toBeCloseTo(ALERT_MAX_STRENGTH);
    expect(ALERT_MAX_STRENGTH).toBe(0.35);
  });
  it('vacuum: every room below 0.98, strength 0.6 x (1 - frac), as the old low-O2 tint', () => {
    expect([LOW_O2_THRESHOLD, LOW_O2_MAX_ALPHA]).toEqual([0.98, 0.6]);
    const g = gradeModel({ ...calm, o2: [1, 0.98, 0.5, 0] }, 0);
    expect(g.vacuum.map((v) => v.room)).toEqual([2, 3]);
    expect(g.vacuum[0]!.strength).toBeCloseTo(0.3); expect(g.vacuum[1]!.strength).toBeCloseTo(0.6);
    expect(g.alert).toBe(false);
  });
  it('both: a fire and a breach together give the alert and the vacuum', () => {
    const g = gradeModel({ hullFraction: 0.9, fire: true, o2: [0.4] }, 0.8);
    expect(g.alert).toBe(true); expect(g.vacuum).toHaveLength(1);
  });
});

describe('the grade adapters (Art-i spec section 5)', () => {
  it('sector: state.hull / HULL_MAX, any fire tile, per-room oxygen over volume', () => {
    const s = cutterState();
    expect(sectorGradeInput(s)).toEqual({ hullFraction: 1, fire: false, o2: Array.from(s.derived.volume, () => 1) });
    s.hull = HULL_MAX / 4; s.rooms.fire[2] = 0.3; s.rooms.o2[1] = s.derived.volume[1]! / 2;
    const i = sectorGradeInput(s);
    expect(i.hullFraction).toBe(0.25); expect(i.fire).toBe(true); expect(i.o2[1]).toBe(0.5);
    expect(gradeModel(i, 0).alert).toBe(true);
  });
  it('duel: the crew ship hull over its class hull; fire and oxygen always off', () => {
    const d = createDuel(parseShip(cutter), 5), ship = d.tactical.systems[0]!;
    expect(duelGradeInput(d)).toEqual({ hullFraction: 1, fire: false, o2: [] });
    ship.hull = SHIP_CLASSES[ship.cls]!.hull / 2;
    expect(duelGradeInput(d).hullFraction).toBe(0.5);
    expect(gradeModel(duelGradeInput(d), 0)).toMatchObject({ alert: true, vacuum: [] });
    disposeDuel(d);
  });
});

describe('what the grade covers and where the lamps sit (Art-i spec sections 5 and 8)', () => {
  it('the cover is on the art-pixel grid and merged into fewer rectangles than open tiles; off the map is space', () => {
    const s = cutterState(), rows = s.layout.rows, cover = gradeCover(rows, s.derived.width, s.derived.height);
    for (const r of cover) expect(onGrid(r), JSON.stringify(r)).toBe(true);
    let open = 0;
    for (let y = 0; y < s.derived.height; y++) for (let x = 0; x < s.derived.width; x++) { const c = cellAt(rows, x, y); if (c === 'floor' || c === 'door') open++; }
    expect(cover.length).toBeLessThan(open);                                // runs merge across tiles and down rows
    expect(cellAt(rows, -1, 0)).toBe('space');
  });
  it('covers each art pixel at most once: exactly the floor and door tiles and each wall tile\'s floor parts and band', () => {
    for (const ship of [cutter, skiff]) {
      const s = createSimState(parseShip(ship), 2, 1), rows = s.layout.rows, { width, height } = s.derived;
      const paint = (x: number, y: number, w: number, h: number, into: Map<string, number>): void => {
        for (let j = y; j < y + h; j += 2) for (let i = x; i < x + w; i += 2) into.set(`${i},${j}`, (into.get(`${i},${j}`) ?? 0) + 1);
      };
      const got = new Map<string, number>();
      for (const r of gradeCover(rows, width, height)) paint(r.x, r.y, r.w, r.h, got);
      expect([...got.values()].every((n) => n === 1)).toBe(true);             // no art pixel painted twice
      const want = new Map<string, number>(), c = (x: number, y: number) => cellAt(rows, x, y);
      for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
        const k = c(tx, ty), x = tx * TILE_PX, y = ty * TILE_PX;
        if (k === 'floor' || k === 'door') paint(x, y, TILE_PX, TILE_PX, want);
        if (k !== 'wall') continue;
        const p = wallPicture(c(tx, ty - 1), c(tx + 1, ty), c(tx, ty + 1), c(tx - 1, ty), c(tx + 1, ty - 1), c(tx + 1, ty + 1), c(tx - 1, ty + 1), c(tx - 1, ty - 1));
        for (const r of [...p.floor, ...p.band]) paint(x + r.x, y + r.y, r.w, r.h, want);
      }
      expect([...got.keys()].sort()).toEqual([...want.keys()].sort());         // the same union as the wall picture's parts
    }
  });
  it('a lamp per room on its top-left floor tile, a fixed art-pixel offset in', () => {
    const s = cutterState(), d = s.derived, lamps = lampPoints(d.roomTiles, d.width);
    expect(lamps).toHaveLength(d.roomTiles.filter((t) => t.length).length);
    expect(LAMP_OFFSET % 2).toBe(0);
    for (const l of lamps) {
      const t = Math.min(...d.roomTiles[l.room]!), tx = t % d.width, ty = (t - tx) / d.width;
      expect([l.x, l.y]).toEqual([tx * TILE_PX + LAMP_OFFSET, ty * TILE_PX + LAMP_OFFSET]);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/gradeModel.test.ts`
Expected: FAIL, `Failed to resolve import "../src/renderer/src/render/gradeModel"`.

- [ ] **Step 3: Create `src/renderer/src/render/gradeModel.ts`**

```ts
// The light and colour grade (Art-i spec section 5): the ambient multiply, the ship-wide alert pulse and the per-room
// vacuum tint, with one adapter per mode. Pure: no Pixi.
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { DuelState } from '../sim/duel/state';
import { CREW_SLOT } from '../sim/tactical/state';
import { SHIP_CLASSES } from '../sim/tactical/defs';
import { HULL_MAX } from '../sim/tuning';
import type { DoorRect } from './doorModel';
import { wallPicture, type Cell } from './wallModel';

/** Today's low-oxygen rule (render/effects.ts before Art-i-b): nothing at 0.98 or more, then LOW_O2_MAX_ALPHA x (1 - frac). */
export const LOW_O2_THRESHOLD = 0.98, LOW_O2_MAX_ALPHA = 0.6;
/** The ambient role's multiply strength over floors and walls (fixed), the alert's peak strength, its period. */
export const AMBIENT_STRENGTH = 0.3, ALERT_MAX_STRENGTH = 0.35, ALERT_PERIOD_S = 1.6, ALERT_HULL_FRACTION = 0.5;

export interface GradeInput {
  /** Hull left, 0..1. */
  hullFraction: number;
  /** Any fire aboard. */
  fire: boolean;
  /** Oxygen fraction per room (index = room), 0..1; empty when the mode runs no oxygen. */
  o2: readonly number[];
}
export interface Grade { ambient: number; alert: boolean; pulse: number; vacuum: { room: number; strength: number }[] }

/** Alert and vacuum are independent: both can be on. `t` is presentation seconds. */
export function gradeModel(input: GradeInput, t: number): Grade {
  const alert = input.hullFraction <= ALERT_HULL_FRACTION || input.fire;
  const pulse = alert ? 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / ALERT_PERIOD_S) : 0;
  const vacuum: Grade['vacuum'] = [];
  input.o2.forEach((frac, room) => { if (frac < LOW_O2_THRESHOLD) vacuum.push({ room, strength: LOW_O2_MAX_ALPHA * (1 - frac) }); });
  return { ambient: AMBIENT_STRENGTH, alert, pulse, vacuum };
}

/** The alert multiply's strength now (0 when not in alert). */
export function alertStrength(g: Grade): number { return g.alert ? ALERT_MAX_STRENGTH * g.pulse : 0; }

/** Sector: hull over HULL_MAX, any burning room, each room's oxygen over its volume (as effects.ts read it). */
export function sectorGradeInput(state: SimState): GradeInput {
  const d = state.derived, o2: number[] = [];
  for (let r = 0; r < d.volume.length; r++) o2.push(state.rooms.o2[r]! / d.volume[r]!);
  return { hullFraction: state.hull / HULL_MAX, fire: state.rooms.fire.some((f) => f > 0), o2 };
}

/** Duel: the crew ship's hull over its class's hull; the duel runs no fire or oxygen, so both are off. */
export function duelGradeInput(d: DuelState): GradeInput {
  const ship = d.tactical.systems[CREW_SLOT]!;
  return { hullFraction: ship.hull / SHIP_CLASSES[ship.cls]!.hull, fire: false, o2: [] };
}

/** The cell kind the tile layer uses (tiles.ts): ' ' or off the map is space, '#' wall, '+' door, anything else floor. */
export function cellAt(rows: readonly string[], x: number, y: number): Cell {
  const c = rows[y]?.charAt(x) ?? ' ';
  return c === '' || c === ' ' ? 'space' : c === '#' ? 'wall' : c === '+' ? 'door' : 'floor';
}

/** World units per art pixel (TILE_PX 32 shows 16 px art at 2x). */
const ART = 2;

/** What the grade covers, in ship world units: every floor and door tile whole, and each wall tile's floor parts and
 *  band (never the empty halves that face space, so the starfield there stays untinted). The rectangles never overlap:
 *  wallPicture's floor quarters overlap its halves and its band crosses them, and a multiply (or the duel flash drawn
 *  from this cover) painted twice would darken twice. So every part is painted onto an art-pixel mask of the whole
 *  ship and the mask is read back as row runs, a run merged downward while the rows below repeat it exactly. */
export function gradeCover(rows: readonly string[], width: number, height: number): DoorRect[] {
  const c = (x: number, y: number): Cell => cellAt(rows, x, y), per = TILE_PX / ART, W = width * per, H = height * per;
  const mask = new Uint8Array(W * H);
  const paint = (x: number, y: number, w: number, h: number): void => {
    for (let j = y / ART; j < (y + h) / ART; j++) mask.fill(1, j * W + x / ART, j * W + (x + w) / ART);
  };
  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
    const k = c(tx, ty), x = tx * TILE_PX, y = ty * TILE_PX;
    if (k === 'space') continue;
    if (k !== 'wall') { paint(x, y, TILE_PX, TILE_PX); continue; }
    const p = wallPicture(c(tx, ty - 1), c(tx + 1, ty), c(tx, ty + 1), c(tx - 1, ty), c(tx + 1, ty - 1), c(tx + 1, ty + 1), c(tx - 1, ty + 1), c(tx - 1, ty - 1));
    for (const r of [...p.floor, ...p.band]) paint(x + r.x, y + r.y, r.w, r.h);
  }
  const out: DoorRect[] = [];
  let open = new Map<number, DoorRect>();   // the runs of the row above, by start * W + end: a run that repeats grows down
  for (let j = 0; j < H; j++) {
    const next = new Map<number, DoorRect>();
    for (let i = 0; i < W; ) {
      if (!mask[j * W + i]) { i++; continue; }
      let e = i;
      while (e < W && mask[j * W + e]) e++;
      const key = i * W + e, above = open.get(key);
      if (above) above.h += ART;
      else out.push({ x: i * ART, y: j * ART, w: (e - i) * ART, h: ART });
      next.set(key, above ?? out[out.length - 1]!);
      i = e;
    }
    open = next;
  }
  return out;
}

/** A room's lamp: on its top-left floor tile (the first of its row-major tiles), LAMP_OFFSET world units in from the corner. */
export const LAMP_OFFSET = 6;
export function lampPoints(roomTiles: readonly (readonly number[])[], width: number): { room: number; x: number; y: number }[] {
  const out: { room: number; x: number; y: number }[] = [];
  roomTiles.forEach((tiles, room) => {
    if (!tiles.length) return;
    const t = Math.min(...tiles), tx = t % width, ty = (t - tx) / width;
    out.push({ room, x: tx * TILE_PX + LAMP_OFFSET, y: ty * TILE_PX + LAMP_OFFSET });
  });
  return out;
}
```

(`effects.ts` still exports its own `LOW_O2_THRESHOLD` and `LOW_O2_MAX_ALPHA` until Task 8 deletes them; the values are the same.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/gradeModel.test.ts tests/artGuards.test.ts`
Expected: PASS, `gradeModel` 9 tests; `artGuards` gains 2.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/gradeModel.ts tests/gradeModel.test.ts
git commit -m "feat(art-i-b): grade model with the sector and duel adapters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The particle generator and emitter

**Files:**
- Create: `src/renderer/src/render/particles/random.ts`
- Create: `src/renderer/src/render/particles/emitter.ts`
- Test: `tests/particles.test.ts` (create)

**Interfaces:**
- Consumes: `RAMP` (`render/palette.ts`, tests only).
- Produces:
  - `random.ts`: `hashString(s): number`; `hashU32(a, b): number`; `hash2(a, b): number` in [0, 1); `interface Random { next(); range(lo, hi); int(n) }`; `createRandom(seed): Random`.
  - `emitter.ts`: `PARTICLE_CAP = 600`; `ART_PX = 2`; `type Blend = 'normal' | 'add'`; `interface ParticleSpec { x; y; vx; vy; life; size: 1 | 2 | 3; ramp: readonly number[]; blend: Blend; gravity?: number }`; `interface Particle extends ParticleSpec { age: number; slot: number }`; `interface Source { key: string; rate: number; make(r: Random): ParticleSpec }`; `interface Emitter { readonly particles: readonly Particle[]; readonly random: Random; spawn(p): void; step(dt, sources: readonly Source[]): void; clear(): void }`; `particleColour(p): number`; `particleCorner(p): { x; y }`; `createEmitter(seed, cap = PARTICLE_CAP): Emitter`.

- [ ] **Step 1: Write the failing test** — create `tests/particles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ART_PX, createEmitter, particleColour, particleCorner, PARTICLE_CAP, type ParticleSpec, type Source } from '../src/renderer/src/render/particles/emitter';
import { createRandom, hash2, hashString } from '../src/renderer/src/render/particles/random';
import { RAMP } from '../src/renderer/src/render/palette';

const spec = (over: Partial<ParticleSpec> = {}): ParticleSpec => ({ x: 10, y: 10, vx: 0, vy: 0, life: 1, size: 1, ramp: RAMP.fire, blend: 'normal', ...over });
const source = (key: string, rate: number): Source => ({ key, rate, make: (r) => spec({ x: r.range(0, 100), y: r.range(0, 100), vx: r.range(-20, 20), vy: r.range(-20, 20), life: r.range(0.5, 2) }) });

describe('the particle generator (Art-i spec section 6)', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = createRandom(hashString('abc')), b = createRandom(hashString('abc')), c = createRandom(hashString('abd'));
    const xs = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(xs);
    expect(c.next()).not.toBe(xs[0]);
    for (let k = 0; k < 1000; k++) { const v = a.next(), i = a.int(7); expect(v >= 0 && v < 1).toBe(true); expect(i >= 0 && i < 7 && Number.isInteger(i)).toBe(true); }
    expect(hash2(3, 4)).toBe(hash2(3, 4)); expect(hash2(3, 4)).not.toBe(hash2(4, 3));
  });
});

describe('the emitter (Art-i spec section 6)', () => {
  it('caps live particles at 600 and drops the oldest first, reusing its pool slot', () => {
    expect(PARTICLE_CAP).toBe(600);
    const e = createEmitter(1);
    for (let k = 0; k < PARTICLE_CAP; k++) e.spawn(spec({ x: k }));
    expect(e.particles).toHaveLength(600);
    const oldestSlot = e.particles[0]!.slot;
    e.spawn(spec({ x: 9999 }));
    expect(e.particles).toHaveLength(600);
    expect(e.particles[0]!.x).toBe(1);                                  // particle 0 went
    expect(e.particles[599]!).toMatchObject({ x: 9999, slot: oldestSlot });
    expect(new Set(e.particles.map((p) => p.slot)).size).toBe(600);     // every slot used once
  });
  it('emits rate x dt per source, carrying the fraction across frames, and forgets absent sources', () => {
    const e = createEmitter(1), s = source('fire:3', 10);
    for (let k = 0; k < 5; k++) e.step(1 / 60, [s]);
    expect(e.particles).toHaveLength(0);                                // 5/60 x 10 = 0.83 carried
    e.step(1 / 60, [s]); e.step(1 / 60, [s]);
    expect(e.particles).toHaveLength(1);                                // 7/60 x 10 = 1.17
    for (let k = 0; k < 53; k++) e.step(1 / 60, [s]);
    expect(e.particles.length).toBeGreaterThanOrEqual(9); expect(e.particles.length).toBeLessThanOrEqual(10);
    e.step(0, []);
    e.step(0.05, [s]);
    expect(e.particles.length).toBeLessThanOrEqual(10);                  // the carry was dropped with the source
  });
  it('a zero dt (the hitstop) neither emits, ages nor moves', () => {
    const e = createEmitter(1);
    e.spawn(spec({ vx: 100 }));
    e.step(0, [source('a', 1000)]);
    expect(e.particles).toHaveLength(1); expect(e.particles[0]).toMatchObject({ x: 10, age: 0 });
  });
  it('ages, applies gravity and removes particles at the end of their life', () => {
    const e = createEmitter(1);
    e.spawn(spec({ vx: 10, vy: 0, gravity: 100, life: 0.5 }));
    e.step(0.25, []);
    expect(e.particles[0]).toMatchObject({ age: 0.25, vy: 25 });
    expect(e.particles[0]!.x).toBeCloseTo(12.5); expect(e.particles[0]!.y).toBeCloseTo(16.25);
    e.step(0.25, []);
    expect(e.particles).toHaveLength(0);
  });
  it('is deterministic with a fixed seed', () => {
    const run = (): string => { const e = createEmitter(42); for (let k = 0; k < 120; k++) e.step(1 / 60, [source('a', 30), source('b', 7)]); return JSON.stringify(e.particles); };
    expect(run()).toBe(run());
  });
  it('snaps every drawn corner to whole art pixels, centred on the position', () => {
    expect(ART_PX).toBe(2);
    const r = createRandom(7);
    for (let k = 0; k < 500; k++) {
      const size = (1 + r.int(3)) as 1 | 2 | 3, c = particleCorner({ x: r.range(-50, 500), y: r.range(-50, 500), size });
      expect(Number.isInteger(c.x / 2) && Number.isInteger(c.y / 2), JSON.stringify(c)).toBe(true);
    }
    expect(particleCorner({ x: 10, y: 10, size: 1 })).toEqual({ x: 10, y: 10 });   // 9 rounds to the even 10 (half up)
    expect(particleCorner({ x: 10, y: 10, size: 2 })).toEqual({ x: 8, y: 8 });
  });
  it('steps the colour along its ramp by life, never between ramp colours', () => {
    const ramp = RAMP.fire, at = (age: number): number => particleColour({ age, life: 1, ramp });
    expect(at(0)).toBe(ramp[0]); expect(at(0.999)).toBe(ramp[ramp.length - 1]); expect(at(2)).toBe(ramp[ramp.length - 1]);
    const seen: number[] = [];
    for (let k = 0; k < 100; k++) { const c = at(k / 100); expect(ramp).toContain(c); if (seen[seen.length - 1] !== c) seen.push(c); }
    expect(seen).toEqual([...ramp]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/particles.test.ts`
Expected: FAIL, `Failed to resolve import "../src/renderer/src/render/particles/emitter"`.

- [ ] **Step 3: Create `src/renderer/src/render/particles/random.ts`**

```ts
// The particle generator's own random source (Art-i spec section 6): seeded from the layout hash, never the sim's
// generator, and nothing it draws reaches the sim. Pure: no Pixi. (Named random.ts: the render guard forbids an rng module.)

/** FNV-1a over a string's UTF-16 code units, as an unsigned 32-bit seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** An unsigned 32-bit hash of two integers (stateless: per-object constants such as which wall tiles are vents). */
export function hashU32(a: number, b: number): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x9e3779b1) ^ Math.imul(b + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

/** hashU32 as a value in [0, 1). */
export function hash2(a: number, b: number): number { return hashU32(a, b) / 4294967296; }

export interface Random {
  /** [0, 1) */
  next(): number;
  /** [lo, hi) */
  range(lo: number, hi: number): number;
  /** 0..n-1 */
  int(n: number): number;
}

/** mulberry32: small, fast, deterministic for a seed. */
export function createRandom(seed: number): Random {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (n) => Math.floor(next() * n) };
}
```

- [ ] **Step 4: Create `src/renderer/src/render/particles/emitter.ts`**

```ts
// The code particle emitter (Art-i spec section 6): at most PARTICLE_CAP live particles in fixed pool slots (the Pixi
// layer keeps one Sprite per slot), the oldest dropped first past the cap, positions on whole art pixels and colour
// stepped along one ramp by life. Sources emit at a rate through per-source accumulators. Pure: no Pixi.
import { createRandom, type Random } from './random';

export const PARTICLE_CAP = 600;
/** World units per art pixel (TILE_PX 32 shows 16 px art at 2x). */
export const ART_PX = 2;

export type Blend = 'normal' | 'add';
export interface ParticleSpec {
  x: number; y: number; vx: number; vy: number;
  /** Seconds. */
  life: number;
  /** Art pixels square: 1 to 3. */
  size: 1 | 2 | 3;
  /** Bright to dark; the colour steps through it as the particle ages. */
  ramp: readonly number[];
  blend: Blend;
  /** World units per second squared, added to vy. */
  gravity?: number;
}
export interface Particle extends ParticleSpec { age: number; slot: number }

/** A steady source this frame: `rate` particles a second, each made by `make`. Keyed so its fractional carry survives frames. */
export interface Source { key: string; rate: number; make(r: Random): ParticleSpec }

export interface Emitter {
  /** Live particles, oldest first. */
  readonly particles: readonly Particle[];
  readonly random: Random;
  spawn(p: ParticleSpec): void;
  /** Emit from every source for `dt` seconds (sources absent this frame lose their carry), then age and move everything. */
  step(dt: number, sources: readonly Source[]): void;
  clear(): void;
}

/** The ramp colour for a particle's age: index floor(age / life x length), clamped, so it steps, never blends. */
export function particleColour(p: Pick<Particle, 'age' | 'life' | 'ramp'>): number {
  const k = Math.min(p.ramp.length - 1, Math.max(0, Math.floor((p.age / p.life) * p.ramp.length)));
  return p.ramp[k]!;
}

/** The drawn top-left corner, on whole art pixels (even world units), centred on the particle's position. */
export function particleCorner(p: Pick<Particle, 'x' | 'y' | 'size'>): { x: number; y: number } {
  const half = (p.size * ART_PX) / 2;
  return { x: ART_PX * Math.round((p.x - half) / ART_PX) || 0, y: ART_PX * Math.round((p.y - half) / ART_PX) || 0 };
}

export function createEmitter(seed: number, cap = PARTICLE_CAP): Emitter {
  const random = createRandom(seed);
  let particles: Particle[] = [];
  let free = Array.from({ length: cap }, (_, k) => cap - 1 - k);   // pop() hands out slot 0 first
  const carry = new Map<string, number>();

  function spawn(spec: ParticleSpec): void {
    if (particles.length >= cap) { const old = particles.shift()!; free.push(old.slot); }
    particles.push({ ...spec, age: 0, slot: free.pop()! });
  }

  return {
    get particles() { return particles; },
    random, spawn,
    step(dt, sources) {
      const live = new Set<string>();
      for (const s of sources) {
        live.add(s.key);
        let acc = (carry.get(s.key) ?? 0) + s.rate * dt;
        while (acc >= 1) { spawn(s.make(random)); acc -= 1; }
        carry.set(s.key, acc);
      }
      for (const k of carry.keys()) if (!live.has(k)) carry.delete(k);
      const kept: Particle[] = [];
      for (const p of particles) {
        p.age += dt;
        if (p.age >= p.life) { free.push(p.slot); continue; }
        p.vy += (p.gravity ?? 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        kept.push(p);
      }
      particles = kept;
    },
    clear() { particles = []; free = Array.from({ length: cap }, (_, k) => cap - 1 - k); carry.clear(); }
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/particles.test.ts tests/artGuards.test.ts`
Expected: PASS, `particles` 8 tests; `artGuards` gains 4 (the `rng` guard accepts `particles/random.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/particles/random.ts src/renderer/src/render/particles/emitter.ts tests/particles.test.ts
git commit -m "feat(art-i-b): seeded particle generator and pooled emitter (600 cap, art-pixel snap, ramp steps)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Particle sources, who is working, wall vents

**Files:**
- Create: `src/renderer/src/render/particles/sources.ts`
- Modify (replace the whole file): `src/renderer/src/render/memory.ts`
- Test: `tests/particleSources.test.ts` (create); `tests/memory.test.ts` (unchanged, must still pass)

**Interfaces:**
- Consumes: Task 2 `cellAt`; Task 3 `Emitter`, `ParticleSpec`, `Source`, `Random`, `hashString`, `hashU32`; `interactTarget`, `TargetKind` (`sim/interact.ts`); `fireTiles`, `breachFloorNeighbour` (`render/hazardTiles.ts`); `FIRE_CAP`; `Position`; `RAMP`.
- Produces: `EMBER`, `SMOKE`, `SPARK`, `STEAM`, `FOAM`, `DEBRIS` ramps; `interface RepairSample { tick; fire: number[]; breach: number[]; station: number[] }`; `interface RepairWatch { last: RepairSample | null; prev: RepairSample | null }`; `sampleRepair(state)`; `watchRepair(w, state): void`; `type WorkKind = 'fire' | 'breach' | 'power' | 'repair'`; `interface Working { pid: number; kind: WorkKind; x: number; y: number }`; `sectorWorking(state, w): Working[]`; `duelWorking(d): Working[]`; `bobOffset(t): number`; rate constants; `fireSources(state): Source[]`; `sparkSources(points: readonly { key; x; y }[]): Source[]`; `failedStationPoints(state)`; `damagedRepairPoints(d)`; `breachDirection(state, site)`; `ventingSources(state): Source[]`; `workSources(working): Source[]`; `interface HitSmoke { key: string; tiles: readonly number[]; until: number }`; `hitSmokeSources(smokes, t, width): Source[]`; `breachOpenings(active, seen: Uint8Array | null): { opened: number[]; seen: Uint8Array }`; `DEBRIS_COUNT = 14`; `debrisBurst(e, state, site): void`; `interface WallVent { tile; x; y; dx; dy }`; `wallVents(rows, width, height, layoutHash): WallVent[]`; `PUFF_MIN_S = 4`, `PUFF_MAX_S = 8`, `PUFF_COUNT = 7`; `stepVents(e, vents, next: number[], t): void`. `RenderMemory` gains `repair: RepairWatch` (reset to `{ last: null, prev: null }`).

- [ ] **Step 1: Write the failing test** — create `tests/particleSources.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { roomAt } from '../src/renderer/src/sim/grid';
import { TILE_PX } from '../src/shared/resolution';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import { createEmitter } from '../src/renderer/src/render/particles/emitter';
import { hashString, hashU32 } from '../src/renderer/src/render/particles/random';
import { cellAt } from '../src/renderer/src/render/gradeModel';
import {
  bobOffset, breachDirection, breachOpenings, damagedRepairPoints, debrisBurst, DEBRIS_COUNT, duelWorking, failedStationPoints, fireSources, hitSmokeSources,
  PUFF_COUNT, sectorWorking, stepVents, ventingSources, wallVents, watchRepair, workSources
} from '../src/renderer/src/render/particles/sources';
import { cutterState } from './helpers/sim';

const T = TILE_PX;

describe('who is working (Art-i spec section 6)', () => {
  it('sector: a fire in the crew member\'s room counts only while its repair progress rises between drawn ticks', () => {
    const s = cutterState(), m = createRenderMemory(), eid = s.crew[0]!;
    Seated.station[eid] = -1; Seated.station[s.crew[1]!] = 1;   // player 1 seated: the derivation cannot tell two holders in one room apart (see the plan's spec notes)
    const room = roomAt(s, Position.x[eid]!, Position.y[eid]!);
    expect(room).toBeGreaterThanOrEqual(0);
    s.rooms.fire[room] = 4;
    watchRepair(m.repair, s);
    expect(sectorWorking(s, m.repair)).toEqual([]);                    // one sample: nothing to compare
    s.tick = 1; watchRepair(m.repair, s);
    expect(sectorWorking(s, m.repair)).toEqual([]);                    // no rise: standing in a burning room is not working
    s.tick = 2; s.rooms.fireRepair[room] = 0.1; watchRepair(m.repair, s);
    const w = sectorWorking(s, m.repair);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ pid: 0, kind: 'fire' });
    watchRepair(m.repair, s);                                            // the same tick drawn again keeps the answer
    expect(sectorWorking(s, m.repair)).toHaveLength(1);
    Seated.station[eid] = 0;
    expect(sectorWorking(s, m.repair)).toEqual([]);                    // seated: interactTarget is None
    m.reset();
    expect(m.repair).toEqual({ last: null, prev: null });
  });
  it('sector: a failed station in reach counts while its repair rises; the point is the station tile centre', () => {
    const s = cutterState(), m = createRenderMemory(), eid = s.crew[0]!, i = 0, t = s.derived.stationTile[i]!, w = s.derived.width;
    Seated.station[eid] = -1; s.stations.occupant.fill(-1);
    Position.x[eid] = (t % w) + 0.5; Position.y[eid] = Math.floor(t / w) + 0.5;
    s.stations.failed[i] = 1;
    watchRepair(m.repair, s); s.tick = 1; s.stations.repair[i] = 0.2; watchRepair(m.repair, s);
    expect(sectorWorking(s, m.repair)).toEqual([{ pid: 0, kind: 'power', x: (t % w) * T + T / 2, y: Math.floor(t / w) * T + T / 2 }]);
  });
  it('duel: a repairWork event for the player in the latest tick\'s events; the point is the room\'s repair tile', () => {
    const d = createDuel(parseShip(cutter), 5), w = d.interior.derived.width;
    expect(duelWorking(d)).toEqual([]);
    d.events = [{ kind: 'repairWork', player: 1, room: Room.Shields }, { kind: 'repairDone', room: Room.Shields, players: [1] }];
    const p = d.points.find((q) => q.tacticalRoom === Room.Shields)!;
    expect(duelWorking(d)).toEqual([{ pid: 1, kind: 'repair', x: (p.tile % w) * T + T / 2, y: Math.floor(p.tile / w) * T + T / 2 }]);
    disposeDuel(d);
  });
  it('a working crew member bobs 1 art pixel at 4 Hz', () => {
    expect([0, 0.1, 0.13, 0.2, 0.25, 0.4].map(bobOffset)).toEqual([0, 0, -2, -2, 0, -2]);
  });
});

describe('the emitter signals (Art-i spec section 6)', () => {
  it('fire: embers (additive) and smoke (normal) per burning tile', () => {
    const s = cutterState();
    expect(fireSources(s)).toEqual([]);
    s.rooms.fire[1] = 16;
    const src = fireSources(s), tiles = s.derived.roomTiles[1]!.length;
    expect(src).toHaveLength(2 * tiles);
    const e = createEmitter(3);
    e.step(1, src);
    expect(new Set(e.particles.map((p) => p.blend))).toEqual(new Set(['add', 'normal']));
  });
  it('sparks from each failed station (sector) and each damaged duel repair room', () => {
    const s = cutterState();
    expect(failedStationPoints(s)).toEqual([]);
    s.stations.failed[2] = 1;
    expect(failedStationPoints(s).map((p) => p.key)).toEqual(['station:2']);
    const d = createDuel(parseShip(cutter), 5);
    expect(damagedRepairPoints(d)).toEqual([]);
    d.tactical.systems[0]!.rooms[Room.Engines] = 1;
    expect(damagedRepairPoints(d).map((p) => p.key)).toEqual([`room:${Room.Engines}`]);
    disposeDuel(d);
  });
  it('venting streams from the floor tile toward the hole; debris on the tick a breach opens', () => {
    const s = cutterState(), site = 0;
    expect(ventingSources(s)).toEqual([]);
    let o = breachOpenings(s.breaches.active, null);
    expect(o.opened).toEqual([]);
    s.breaches.active[site] = 1;
    o = breachOpenings(s.breaches.active, o.seen);
    expect(o.opened).toEqual([site]);
    expect(breachOpenings(s.breaches.active, o.seen).opened).toEqual([]);
    const dir = breachDirection(s, site)!, src = ventingSources(s);
    expect(Math.abs(dir.dx) + Math.abs(dir.dy)).toBe(1);
    const e = createEmitter(9);
    e.step(1, src);
    for (const p of e.particles) expect(Math.sign(p.vx * dir.dx + p.vy * dir.dy)).toBe(1);   // every speck heads for the hole
    const before = e.particles.length;
    debrisBurst(e, s, site);
    expect(e.particles.length).toBe(before + DEBRIS_COUNT);
  });
  it('work: foam at a fire, sparks elsewhere; hit smoke only until it expires', () => {
    const w = workSources([{ pid: 0, kind: 'fire', x: 10, y: 10 }, { pid: 1, kind: 'power', x: 50, y: 50 }]);
    expect(w.map((x) => x.key)).toEqual(['foam:0', 'work:1']);
    expect(hitSmokeSources([{ key: 'r2', tiles: [5, 6], until: 3 }], 2.9, 10)).toHaveLength(1);
    expect(hitSmokeSources([{ key: 'r2', tiles: [5, 6], until: 3 }], 3, 10)).toHaveLength(0);
  });
});

describe('wall vents (Art-i spec section 8)', () => {
  it('are wall tiles next to a floor tile where hash(layoutHash, tile) mod 8 = 0, puffing into the room', () => {
    const s = cutterState(), d = s.derived, rows = s.layout.rows, vents = wallVents(rows, d.width, d.height, d.layoutHash), seed = hashString(d.layoutHash);
    expect(vents.length).toBeGreaterThan(0);
    for (const v of vents) {
      const tx = v.tile % d.width, ty = (v.tile - tx) / d.width;
      expect(cellAt(rows, tx, ty)).toBe('wall'); expect(hashU32(seed, v.tile) % 8).toBe(0);
      expect(cellAt(rows, tx + v.dx, ty + v.dy)).toBe('floor');
    }
    expect(wallVents(rows, d.width, d.height, d.layoutHash)).toEqual(vents);   // stable for a layout
  });
  it('each vent puffs every 4 to 8 seconds', () => {
    const s = cutterState(), d = s.derived, vents = wallVents(s.layout.rows, d.width, d.height, d.layoutHash).slice(0, 1), e = createEmitter(5), next: number[] = [];
    let puffs = 0;
    for (let k = 0; k <= 60 * 60; k++) { const n = e.particles.length; stepVents(e, vents, next, k / 60); if (e.particles.length > n) puffs++; e.step(1 / 60, []); }
    expect(puffs).toBeGreaterThanOrEqual(Math.floor(60 / 8)); expect(puffs).toBeLessThanOrEqual(Math.ceil(60 / 4) + 1);
    expect(PUFF_COUNT).toBe(7);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/particleSources.test.ts`
Expected: FAIL, `Failed to resolve import "../src/renderer/src/render/particles/sources"`.

- [ ] **Step 3: Create `src/renderer/src/render/particles/sources.ts`**

```ts
// What the particles show and where (Art-i spec sections 6-8): fire embers and smoke, sparks at failed stations and
// damaged duel repair rooms, breach venting and debris, crew at work, lingering hit smoke and wall-vent steam. Every
// signal is read from sim state the renderer already has; nothing here writes back. Pure: no Pixi.
import { TILE_PX } from '../../../../shared/resolution';
import type { SimState } from '../../sim/state';
import type { DuelState } from '../../sim/duel/state';
import { Position } from '../../sim/components';
import { interactTarget, TargetKind } from '../../sim/interact';
import { FIRE_CAP } from '../../sim/tuning';
import { fireTiles, breachFloorNeighbour } from '../hazardTiles';
import { cellAt } from '../gradeModel';
import { RAMP } from '../palette';
import { hashString, hashU32, type Random } from './random';
import type { Emitter, ParticleSpec, Source } from './emitter';

const T = TILE_PX, HALF = T / 2;
const tileCentre = (t: number, width: number): { x: number; y: number } => { const tx = t % width; return { x: tx * T + HALF, y: ((t - tx) / width) * T + HALF }; };

/** The ramps the sources step along (each a run of one palette ramp, bright to dark). */
export const EMBER = RAMP.fire.slice(0, 6), SMOKE = RAMP.vent.slice(2), SPARK = RAMP.electric, STEAM = RAMP.vent, FOAM = RAMP.vent.slice(0, 3), DEBRIS = RAMP.vent.slice(1);

// ---- who is working (spec section 6) ----

export interface RepairSample { tick: number; fire: number[]; breach: number[]; station: number[] }
/** The repair progress at the last drawn tick and the drawn tick before it (kept in RenderMemory). */
export interface RepairWatch { last: RepairSample | null; prev: RepairSample | null }

export function sampleRepair(state: SimState): RepairSample {
  return { tick: state.tick, fire: Array.from(state.rooms.fireRepair), breach: Array.from(state.breaches.repair), station: Array.from(state.stations.repair) };
}

/** Once per frame: a new tick shifts the last sample to prev and samples again; the same tick changes nothing. */
export function watchRepair(w: RepairWatch, state: SimState): void {
  if (w.last && w.last.tick === state.tick) return;
  w.prev = w.last; w.last = sampleRepair(state);
}

export type WorkKind = 'fire' | 'breach' | 'power' | 'repair';
/** A crew member at work: the player, what they work on, and the point (ship world units) the sparks or foam come from. */
export interface Working { pid: number; kind: WorkKind; x: number; y: number }

/**
 * Sector working = conscious, unseated (interactTarget is None otherwise), the target is a fire, breach or station
 * repair, and that target's repair progress rose between the last two drawn ticks. The point: the burning tile of the
 * room nearest the crew member, the breach site, or the station's tile.
 */
export function sectorWorking(state: SimState, w: RepairWatch): Working[] {
  const { last, prev } = w;
  if (!last || !prev) return [];
  const d = state.derived, out: Working[] = [];
  for (let pid = 0; pid < state.playerCount; pid++) {
    const t = interactTarget(state, pid), eid = state.crew[pid]!;
    if (t.kind === TargetKind.Fire) {
      if (!(last.fire[t.index]! > prev.fire[t.index]!)) continue;
      const tiles = fireTiles(d.roomTiles[t.index]!, state.rooms.fire[t.index]!, FIRE_CAP);
      const px = Position.x[eid]! * T, py = Position.y[eid]! * T;
      let best = tileCentre(tiles[0] ?? d.roomTiles[t.index]![0]!, d.width), bd = Infinity;
      for (const tile of tiles) { const c = tileCentre(tile, d.width), dd = (c.x - px) ** 2 + (c.y - py) ** 2; if (dd < bd) { bd = dd; best = c; } }
      out.push({ pid, kind: 'fire', ...best });
    } else if (t.kind === TargetKind.Breach) {
      if (last.breach[t.index]! > prev.breach[t.index]!) out.push({ pid, kind: 'breach', ...tileCentre(d.siteTile[t.index]!, d.width) });
    } else if (t.kind === TargetKind.Power) {
      if (last.station[t.index]! > prev.station[t.index]!) out.push({ pid, kind: 'power', ...tileCentre(d.stationTile[t.index]!, d.width) });
    }
  }
  return out;
}

/** Duel working = a repairWork event for that player in the latest tick's d.events; the point is that room's repair tile. */
export function duelWorking(d: DuelState): Working[] {
  const out: Working[] = [], width = d.interior.derived.width;
  for (const e of d.events) {
    if (e.kind !== 'repairWork') continue;
    const p = d.points.find((q) => q.tacticalRoom === e.room);
    if (p) out.push({ pid: e.player, kind: 'repair', ...tileCentre(p.tile, width) });
  }
  return out;
}

/** A working crew member bobs 1 art pixel (2 world units) at 4 Hz: up for the second half of each 0.25 s. */
export function bobOffset(t: number): number { return Math.floor(t * 8) % 2 === 1 ? -2 : 0; }

// ---- steady sources (rates per second) ----

export const EMBER_RATE = 5, SMOKE_RATE = 1.5, SPARK_RATE = 8, VENT_RATE = 16, FOAM_RATE = 14, WORK_SPARK_RATE = 10, HIT_SMOKE_RATE = 6;

const smoke = (r: Random, x: number, y: number): ParticleSpec => ({ x: x + r.range(-10, 10), y: y + r.range(-6, 6), vx: r.range(-2, 8), vy: -r.range(8, 16), life: r.range(1.2, 2), size: r.next() < 0.5 ? 2 : 3, ramp: SMOKE, blend: 'normal' });
const spark = (r: Random, x: number, y: number): ParticleSpec => {
  const a = r.range(0, Math.PI * 2), v = r.range(40, 80);
  return { x: x + r.range(-4, 4), y: y + r.range(-4, 4), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: r.range(0.25, 0.45), size: 1, ramp: SPARK, blend: 'add', gravity: 160 };
};

/** Embers rising (additive) and smoke drifting (normal) from every burning tile. */
export function fireSources(state: SimState): Source[] {
  const d = state.derived, out: Source[] = [];
  for (let r = 0; r < d.volume.length; r++) {
    const fire = state.rooms.fire[r]!;
    if (fire <= 0) continue;
    for (const t of fireTiles(d.roomTiles[r]!, fire, FIRE_CAP)) {
      const c = tileCentre(t, d.width);
      out.push({ key: `ember:${t}`, rate: EMBER_RATE, make: (q) => ({ x: c.x + q.range(-12, 12), y: c.y + q.range(-4, 8), vx: q.range(-8, 8), vy: -q.range(25, 45), life: q.range(0.6, 1.1), size: 1, ramp: EMBER, blend: 'add' }) });
      out.push({ key: `smoke:${t}`, rate: SMOKE_RATE, make: (q) => smoke(q, c.x, c.y) });
    }
  }
  return out;
}

/** Sparks at each point: the failed stations (sector) or the damaged repair rooms' repair tiles (duel). */
export function sparkSources(points: readonly { key: string; x: number; y: number }[]): Source[] {
  return points.map((p) => ({ key: `spark:${p.key}`, rate: SPARK_RATE, make: (q) => spark(q, p.x, p.y) }));
}

/** Sector: every failed station's tile centre (stations.failed[i] === 1). */
export function failedStationPoints(state: SimState): { key: string; x: number; y: number }[] {
  const d = state.derived, out: { key: string; x: number; y: number }[] = [];
  for (let i = 0; i < d.stationTile.length; i++) if (state.stations.failed[i] === 1) out.push({ key: `station:${i}`, ...tileCentre(d.stationTile[i]!, d.width) });
  return out;
}

/** Duel: the repair tile of every damaged tactical room (level > 0). */
export function damagedRepairPoints(d: DuelState): { key: string; x: number; y: number }[] {
  const ship = d.tactical.systems[0]!, width = d.interior.derived.width;
  return d.points.filter((p) => ship.rooms[p.tacticalRoom]! > 0).map((p) => ({ key: `room:${p.tacticalRoom}`, ...tileCentre(p.tile, width) }));
}

/** The unit step from a breach's room-side floor tile to its site (the hole), or null when the site has none. */
export function breachDirection(state: SimState, site: number): { dx: number; dy: number } | null {
  const d = state.derived, f = breachFloorNeighbour(d, site);
  if (f < 0) return null;
  const s = d.siteTile[site]!;
  return { dx: (s % d.width) - (f % d.width), dy: Math.trunc(s / d.width) - Math.trunc(f / d.width) };
}

/** A stream from each active breach's floor tile toward its hole. */
export function ventingSources(state: SimState): Source[] {
  const d = state.derived, out: Source[] = [];
  for (let s = 0; s < d.siteTile.length; s++) {
    if (state.breaches.active[s] !== 1) continue;
    const dir = breachDirection(state, s);
    if (!dir) continue;
    const from = tileCentre(breachFloorNeighbour(d, s), d.width);
    out.push({ key: `vent:${s}`, rate: VENT_RATE, make: (q) => {
      const side = q.range(-8, 8), v = q.range(60, 90), drift = q.range(-8, 8);
      return { x: from.x + (dir.dx === 0 ? side : 0), y: from.y + (dir.dy === 0 ? side : 0), vx: dir.dx * v + (dir.dx === 0 ? drift : 0), vy: dir.dy * v + (dir.dy === 0 ? drift : 0), life: q.range(0.35, 0.55), size: 1, ramp: STEAM, blend: 'normal' };
    } });
  }
  return out;
}

/** Foam at a fire, sparks at anything else. */
export function workSources(working: readonly Working[]): Source[] {
  return working.map((w) => w.kind === 'fire'
    ? { key: `foam:${w.pid}`, rate: FOAM_RATE, make: (q: Random) => { const a = q.range(0, Math.PI * 2), v = q.range(15, 35); return { x: w.x + q.range(-6, 6), y: w.y + q.range(-6, 6), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: q.range(0.4, 0.7), size: 2, ramp: FOAM, blend: 'normal' } as ParticleSpec; } }
    : { key: `work:${w.pid}`, rate: WORK_SPARK_RATE, make: (q: Random) => spark(q, w.x, w.y) });
}

/** Lingering smoke after a hit: from random tiles of the hit area until `until` (presentation seconds). */
export interface HitSmoke { key: string; tiles: readonly number[]; until: number }
export function hitSmokeSources(smokes: readonly HitSmoke[], t: number, width: number): Source[] {
  return smokes.filter((s) => t < s.until && s.tiles.length).map((s) => ({ key: `hit:${s.key}`, rate: HIT_SMOKE_RATE, make: (q: Random) => { const c = tileCentre(s.tiles[q.int(s.tiles.length)]!, width); return smoke(q, c.x, c.y); } }));
}

// ---- bursts ----

/** Breach sites that opened since the last frame (0 to 1); `seen` null on a run's first frame (nothing opens). */
export function breachOpenings(active: ArrayLike<number>, seen: Uint8Array | null): { opened: number[]; seen: Uint8Array } {
  const next = Uint8Array.from(active), opened: number[] = [];
  if (seen && seen.length === next.length) for (let s = 0; s < next.length; s++) if (next[s] === 1 && seen[s] !== 1) opened.push(s);
  return { opened, seen: next };
}

export const DEBRIS_COUNT = 14;
/** Hull debris on the tick a breach opens: thrown from the site back into the room. */
export function debrisBurst(e: Emitter, state: SimState, site: number): void {
  const d = state.derived, c = tileCentre(d.siteTile[site]!, d.width), dir = breachDirection(state, site) ?? { dx: 0, dy: -1 };
  for (let k = 0; k < DEBRIS_COUNT; k++) {
    const r = e.random, a = Math.atan2(-dir.dy, -dir.dx) + r.range(-1.1, 1.1), v = r.range(30, 90);
    e.spawn({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: r.range(0.5, 0.9), size: r.next() < 0.6 ? 1 : 2, ramp: DEBRIS, blend: 'normal' });
  }
}

// ---- wall vents (spec section 8) ----

export interface WallVent { tile: number; x: number; y: number; dx: number; dy: number }
const AROUND = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;

/** Wall tiles next to a floor tile where hash(layoutHash, tile) mod 8 = 0; the puff leaves the wall band's floor-side
 *  edge toward the first floor neighbour (up, left, right, down). */
export function wallVents(rows: readonly string[], width: number, height: number, layoutHash: string): WallVent[] {
  const seed = hashString(layoutHash), out: WallVent[] = [];
  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
    if (cellAt(rows, tx, ty) !== 'wall') continue;
    const tile = ty * width + tx;
    if (hashU32(seed, tile) % 8 !== 0) continue;
    const floor = AROUND.find(([ox, oy]) => cellAt(rows, tx + ox, ty + oy) === 'floor');
    if (!floor) continue;
    const [dx, dy] = floor;
    out.push({ tile, x: tx * T + HALF + dx * 6, y: ty * T + HALF + dy * 6, dx, dy });
  }
  return out;
}

export const PUFF_MIN_S = 4, PUFF_MAX_S = 8, PUFF_COUNT = 7;
/** Each vent puffs every 4-8 s (drawn from the generator); `next` holds each vent's next puff time and is filled on first use. */
export function stepVents(e: Emitter, vents: readonly WallVent[], next: number[], t: number): void {
  vents.forEach((v, k) => {
    if (next[k] === undefined) next[k] = t + e.random.range(0, PUFF_MAX_S);
    if (t < next[k]!) return;
    next[k] = t + e.random.range(PUFF_MIN_S, PUFF_MAX_S);
    for (let n = 0; n < PUFF_COUNT; n++) {
      const r = e.random, v2 = r.range(10, 25), side = r.range(-6, 6);
      e.spawn({ x: v.x + (v.dx === 0 ? side : 0), y: v.y + (v.dy === 0 ? side : 0), vx: v.dx * v2 + r.range(-3, 3), vy: v.dy * v2 - r.range(4, 10), life: r.range(0.8, 1.4), size: r.next() < 0.5 ? 1 : 2, ramp: STEAM, blend: 'normal' });
    }
  });
}
```

- [ ] **Step 4: Replace the whole of `src/renderer/src/render/memory.ts`**

```ts
import type { Facing8 } from './assetNames';
import type { RepairWatch } from './particles/sources';

/** Per-run render-only memory (spec §4 Run reset). Nothing here is sim state; reset() is called by session.start() via renderer.reset(). */
export interface RenderMemory {
  damaged: Set<number>;                              // tile indices with the damaged-floor overlay
  facing: Map<number, Facing8>;                      // by StableId
  prev: Map<number, { x: number; y: number }>;       // by StableId, position at the previous tick (interpolation start)
  lastDrawn: Map<number, { x: number; y: number }>;  // by StableId, interpolated position drawn last frame (movement/facing source)
  doorProgress: number[] | null;                     // per edge; null until the first draw of a run
  repair: RepairWatch;                               // repair progress at the last two drawn ticks (Art-i spec section 6: who is working)
  reset(): void;
}

export function createRenderMemory(): RenderMemory {
  const m: RenderMemory = {
    damaged: new Set(), facing: new Map(), prev: new Map(), lastDrawn: new Map(), doorProgress: null, repair: { last: null, prev: null },
    reset() { m.damaged.clear(); m.facing.clear(); m.prev.clear(); m.lastDrawn.clear(); m.doorProgress = null; m.repair = { last: null, prev: null }; }
  };
  return m;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/particleSources.test.ts tests/memory.test.ts tests/artGuards.test.ts && npx tsc -b; echo "tsc exit=$?"`
Expected: PASS, `particleSources` 10, `memory` 1; `artGuards` gains 2; `tsc exit=0`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/particles/sources.ts src/renderer/src/render/memory.ts tests/particleSources.test.ts
git commit -m "feat(art-i-b): particle sources, working-crew derivations and wall vents" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Console desks on the art-pixel grid

**Files:**
- Modify: `src/renderer/src/render/consoleModel.ts`
- Modify: `src/renderer/src/render/consoleLayer.ts`
- Test: `tests/consoleModel.test.ts` (modify)

**Interfaces:**
- Consumes: `onGrid`, `strokeBand` (`tests/helpers/artGrid.ts`, Art-i-a).
- Produces: `DESK_W = 20`, `DESK_D = 10`, `SCREEN_D = 2`, `SCREEN_INSET = 2`, `DESK_OUTLINE_W = 2` (new export) in `consoleModel.ts`; `deskPicture` unchanged in shape, its desk and screen now on the art-pixel grid for every side and flush case (Decision 19). `WALL_GAP` stays 10. Task 6's `screenCursor` relies on the screen being on the grid and one art pixel deep.

- [ ] **Step 1: Write the failing test** — in `tests/consoleModel.test.ts`, replace the import line

```ts
import { consoleLook, consoleSide, deskPicture, consoles, DESK_FILL, DESK_OUTLINE, DESK_W, DESK_D, SCREEN_LIT, SCREEN_DIM, SCREEN_DOWN, WALL_GAP } from '../src/renderer/src/render/consoleModel';
```

with

```ts
import { consoleLook, consoleSide, deskPicture, consoles, DESK_FILL, DESK_OUTLINE, DESK_OUTLINE_W, DESK_W, DESK_D, SCREEN_D, SCREEN_LIT, SCREEN_DIM, SCREEN_DOWN, WALL_GAP, type Side } from '../src/renderer/src/render/consoleModel';
```

after `import { cutterState, RECRUITS } from './helpers/sim';` add

```ts
import { onGrid, strokeBand } from './helpers/artGrid';
```

and replace the first test (it pinned the old, off-grid `Math.round(0.6 * TILE_PX)` = 19)

```ts
  it('a desk about 0.6 tile wide and 0.3 deep, dark with a dark outline', () => {
    expect(DESK_W).toBe(Math.round(0.6 * TILE_PX)); expect(DESK_D).toBe(Math.round(0.3 * TILE_PX));
    expect(DESK_FILL).toBe(0x2b3647); expect(DESK_OUTLINE).toBe(0x1b1b1b);
  });
```

with

```ts
  it('a desk about 0.6 tile wide and 0.3 deep in whole art pixels, dark with a dark outline', () => {
    expect([DESK_W, DESK_D, SCREEN_D, DESK_OUTLINE_W]).toEqual([20, 10, 2, 2]);   // 10 x 5 art pixels, a one-art-pixel screen and outline (Art-i spec section 4)
    expect(Math.abs(DESK_W / TILE_PX - 0.6)).toBeLessThan(0.05); expect(Math.abs(DESK_D / TILE_PX - 0.3)).toBeLessThan(0.05);
    expect(DESK_FILL).toBe(0x2b3647); expect(DESK_OUTLINE).toBe(0x1b1b1b);
  });
  it('every desk and screen is on the art-pixel grid, the outline band too, and the screen sits inside the outline (Art-i spec section 4)', () => {
    for (const side of ['n', 'e', 's', 'w'] as Side[]) for (const flush of [true, false]) {
      const p = deskPicture(side, flush, 'free'), at = `${side} ${flush}`;
      expect(onGrid(p.desk), `${at} desk ${JSON.stringify(p.desk)}`).toBe(true);
      expect(onGrid(p.screen), `${at} screen ${JSON.stringify(p.screen)}`).toBe(true);
      const band = strokeBand(p.desk, DESK_OUTLINE_W, 1);
      expect(onGrid(band.outer) && onGrid(band.inner), at).toBe(true);
      expect(band.outer).toEqual(p.desk);                                       // alignment 1: painted inside the desk
      const s = p.screen, i = band.inner;
      expect(s.x >= i.x && s.y >= i.y && s.x + s.w <= i.x + i.w && s.y + s.h <= i.y + i.h, at).toBe(true);
      expect(Math.min(s.w, s.h)).toBe(SCREEN_D);
    }
  });
```

(The other `consoleModel` tests stay: the north desk at `x: (TILE_PX - DESK_W) / 2 | 0` = 6, `y: -WALL_GAP`, the south and east desks reaching `TILE_PX + WALL_GAP`, the west desk at `x: 0`, all still hold.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/consoleModel.test.ts`
Expected: FAIL in 2 tests: `expected [ 19, 10, 3, undefined ] to deeply equal [ 20, 10, 2, 2 ]` and `n true desk {"x":6,"y":-10,"w":19,"h":10}: expected false to be true`; the other 6 pass.

- [ ] **Step 3: Put the desk on the grid in `src/renderer/src/render/consoleModel.ts`** (three edits)

Replace

```ts
export const DESK_W = Math.round(0.6 * T), DESK_D = Math.round(0.3 * T), SCREEN_D = 3;
```

with

```ts
/** Whole art pixels (Art-i spec section 4: 2 world units each, even offsets): a desk 10 x 5 art pixels (about 0.6 x 0.3
 *  tile), a screen one art pixel deep, inset one art pixel, and a one-art-pixel outline drawn inside the desk. */
export const DESK_W = 20, DESK_D = 10, SCREEN_D = 2, SCREEN_INSET = 2, DESK_OUTLINE_W = 2;
```

Replace

```ts
  const x = Math.floor((T - DESK_W) / 2), y = flush ? -WALL_GAP : 0;
```

with

```ts
  const x = (T - DESK_W) / 2, y = flush ? -WALL_GAP : 0;   // 6 and -10 (or 0): even, so the desk is on the art-pixel grid
```

Replace

```ts
  const screen: DoorRect = { x: x + 2, y: y + 2, w: DESK_W - 4, h: SCREEN_D };   // drawn for the north side, then turned
```

with

```ts
  const screen: DoorRect = { x: x + SCREEN_INSET, y: y + SCREEN_INSET, w: DESK_W - 2 * SCREEN_INSET, h: SCREEN_D };   // drawn for the north side, then turned
```

- [ ] **Step 4: Draw the outline one art pixel wide in `src/renderer/src/render/consoleLayer.ts`** (two edits)

Replace `import { consoles } from './consoleModel';` with `import { consoles, DESK_OUTLINE_W } from './consoleModel';`.

Replace

```ts
        g.rect(c.x + p.desk.x, c.y + p.desk.y, p.desk.w, p.desk.h).fill(p.fill).stroke({ width: 1, color: p.outline, alignment: 1 });
```

with

```ts
        g.rect(c.x + p.desk.x, c.y + p.desk.y, p.desk.w, p.desk.h).fill(p.fill).stroke({ width: DESK_OUTLINE_W, color: p.outline, alignment: 1 });   // one art pixel, inside the desk (Art-i spec section 4)
```

- [ ] **Step 5: Run the tests and types**

Run: `npx vitest run tests/consoleModel.test.ts tests/console.test.ts tests/consoleGroups.test.ts tests/artGuards.test.ts && npx tsc -b; echo "tsc exit=$?"`
Expected: PASS, `consoleModel` 8, `console` 36, `consoleGroups` 14; `artGuards` unchanged (no new file); `tsc exit=0`. `grep -rn "DESK_W\|DESK_D\|SCREEN_D" src tests --include=*.ts` shows only `consoleModel.ts` and `tests/consoleModel.test.ts` (nothing else pinned the old sizes).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/consoleModel.ts src/renderer/src/render/consoleLayer.ts tests/consoleModel.test.ts
git commit -m "fix(art-i-b): console desks, screens and outline on the art-pixel grid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Lights and ambient model

**Files:**
- Create: `src/renderer/src/render/lightsModel.ts`
- Test: `tests/lightsModel.test.ts` (create)

**Interfaces:**
- Consumes: Task 3 `hash2`; `DoorRect`; `Band` (`render/worldFit.ts`); Task 5 `deskPicture` and `Side` (`render/consoleModel.ts`, tests only: the cursor is checked on every desk's screen).
- Produces: `interface GlowRun extends DoorRect { alpha: number }`; `GLOW_STEPS = [0.14, 0.26, 0.42]`; `glowRuns(radius): GlowRun[]`; `CONSOLE_GLOW`, `FIRE_GLOW`, `LAMP_ALERT = 0.9`, `LAMP_CALM = 0.55`; `consoleGlow(look: 'free' | 'occupied' | 'down'): number`; `fireGlow(seed, tile, t): number`; `lampLit(seed, room, t): boolean`; `lampLight(alert, lit): { on: boolean; alpha: number }`; `screenPhase(seed, station, t): 'A' | 'B'`; `screenCursor(x, y, screen: DoorRect): DoorRect` (`screen` on the art-pixel grid, Task 5); `STAR_LAYERS` (speeds in art px/s); `interface Star { x; y; layer }`; `stars(seed, band: Band, t, artPx): Star[]`.

- [ ] **Step 1: Write the failing test** — create `tests/lightsModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  CONSOLE_GLOW, consoleGlow, fireGlow, FIRE_GLOW, GLOW_STEPS, glowRuns, LAMP_ALERT, LAMP_CALM, lampLight, lampLit, screenCursor, screenPhase, STAR_LAYERS, stars
} from '../src/renderer/src/render/lightsModel';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { deskPicture, type Side } from '../src/renderer/src/render/consoleModel';
import { onGrid } from './helpers/artGrid';

describe('posterised glows (Art-i spec section 5)', () => {
  it('are whole art pixels in 3 alpha steps with hard edges, brightest in the middle', () => {
    for (const radius of [4, 5, 8]) {
      const runs = glowRuns(radius);
      for (const r of runs) expect(onGrid(r), JSON.stringify(r)).toBe(true);
      expect(new Set(runs.map((r) => r.alpha))).toEqual(new Set(GLOW_STEPS));
      const centre = runs.find((r) => r.y === 0 && r.x <= 0 && r.x + r.w > 0)!;
      expect(centre.alpha).toBe(GLOW_STEPS[2]);
      for (const r of runs) { expect(Math.abs(r.x) <= radius * 2 && Math.abs(r.x + r.w) <= radius * 2).toBe(true); expect(Math.abs(r.y) <= radius * 2).toBe(true); }
    }
    const cells = (radius: number): number => glowRuns(radius).reduce((n, r) => n + (r.w / 2) * (r.h / 2), 0);
    expect(cells(5)).toBeGreaterThan(60); expect(cells(5)).toBeLessThan(100);   // about pi x 25 art pixels
  });
  it('consoles glow steady, brighter when occupied, dark when down; fire flickers between three steps', () => {
    expect([consoleGlow('free'), consoleGlow('occupied'), consoleGlow('down')]).toEqual([CONSOLE_GLOW.free, CONSOLE_GLOW.occupied, 0]);
    expect(CONSOLE_GLOW.occupied).toBeGreaterThan(CONSOLE_GLOW.free);
    const seen = new Set<number>();
    for (let k = 0; k < 200; k++) { const a = fireGlow(77, 12, k / 10); expect(FIRE_GLOW).toContain(a); seen.add(a); }
    expect(seen.size).toBe(3);
    expect(fireGlow(77, 12, 0.31)).toBe(fireGlow(77, 12, 0.39));          // steady within a tenth of a second
  });
});

describe('lamps, screens and stars (Art-i spec section 8)', () => {
  it('a lamp flickers dark briefly once a 3-7 s period when calm, and shows lampOn steadily in alert', () => {
    let dark = 0;
    for (let k = 0; k < 7 * 1000; k++) if (!lampLit(9, 3, k / 1000)) dark++;
    expect(dark).toBeGreaterThanOrEqual(140); expect(dark).toBeLessThanOrEqual(2 * 140 + 2);   // 0.14 s dark per period, 1 or 2 periods in 7 s
    expect(lampLight(true, false)).toEqual({ on: true, alpha: LAMP_ALERT });
    expect(lampLight(false, true)).toEqual({ on: false, alpha: LAMP_CALM });
    expect(lampLight(false, false)).toEqual({ on: false, alpha: 0 });
  });
  it('a console screen blinks between A and B at 1-2 Hz', () => {
    for (const station of [0, 1, 2, 3]) {
      let flips = 0, last = screenPhase(5, station, 0);
      for (let k = 1; k <= 10 * 100; k++) { const p = screenPhase(5, station, k / 100); if (p !== last) flips++; last = p; }
      expect(flips).toBeGreaterThanOrEqual(19); expect(flips).toBeLessThanOrEqual(41);   // 2 flips a cycle, 1 to 2 cycles a second, 10 s
    }
  });
  it('the screen cursor is 2 x 1 art pixels on the grid, inside the screen of every desk', () => {
    for (const side of ['n', 'e', 's', 'w'] as Side[]) for (const flush of [true, false]) {
      const s = deskPicture(side, flush, 'free').screen, c = screenCursor(64, 96, s);
      expect(onGrid(c), JSON.stringify(c)).toBe(true);
      expect(c.w * c.h).toBe(8);
      expect(c.x >= 64 + s.x && c.x + c.w <= 64 + s.x + s.w && c.y >= 96 + s.y && c.y + c.h <= 96 + s.y + s.h, `${side} ${flush} ${JSON.stringify(c)}`).toBe(true);
    }
  });
  it('the starfield: two layers drifting left at 4 and 10 art px/s, one art pixel, inside the band, on whole art pixels', () => {
    expect(STAR_LAYERS.map((l) => l.speed)).toEqual([4, 10]);
    const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-9;
    for (const artPx of [2, 4 / 3, 1.31, 1]) for (const band of [WORLD_BAND, INTERIOR_BAND]) {
      for (const t of [0, 1.3, 17.77]) for (const s of stars(3, band, t, artPx)) {
        expect(s.x >= band.x && s.x + artPx <= band.x + band.w + 1e-9 && s.y >= band.y && s.y + artPx <= band.y + band.h + 1e-9).toBe(true);
        expect(whole((s.x - band.x) / artPx) && whole((s.y - band.y) / artPx), `${artPx} ${JSON.stringify(s)}`).toBe(true);
      }
      const a = stars(3, band, 10, artPx), b = stars(3, band, 11, artPx);
      const moved = a.map((s, k) => ({ layer: s.layer, dx: s.x - b[k]!.x, dy: s.y - b[k]!.y })).filter((m) => Math.abs(m.dx) < band.w / 2);
      expect(moved.length).toBeGreaterThan(60);
      for (const m of moved) { expect(m.dy).toBe(0); expect(Math.abs(m.dx - STAR_LAYERS[m.layer]!.speed * artPx)).toBeLessThanOrEqual(artPx + 1e-9); }
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/lightsModel.test.ts`
Expected: FAIL, `Failed to resolve import "../src/renderer/src/render/lightsModel"`.

- [ ] **Step 3: Create `src/renderer/src/render/lightsModel.ts`**

```ts
// Lights and ambient life (Art-i spec sections 5 and 8): posterised glows on the art-pixel grid, the console, fire and
// lamp light levels, the lamp flicker, the console screen blink and the two-layer starfield. Pure: no Pixi. Times are
// presentation seconds; every per-object constant comes from the particle generator's hash of the layout.
import type { DoorRect } from './doorModel';
import type { Band } from './worldFit';
import { hash2 } from './particles/random';

/** One run of a glow: a rectangle in world units (centred on 0, 0) and its alpha step. */
export interface GlowRun extends DoorRect { alpha: number }
export const GLOW_STEPS = [0.14, 0.26, 0.42] as const;

/**
 * A posterised round glow of `radius` art pixels: each art pixel (2 world units) takes the alpha step of its distance
 * band (outer, middle, inner thirds), with hard edges; merged into horizontal runs per row and step. On the grid.
 */
export function glowRuns(radius: number): GlowRun[] {
  const out: GlowRun[] = [];
  for (let j = -radius; j < radius; j++) {
    let run: GlowRun | null = null;
    for (let i = -radius; i <= radius; i++) {
      const d = Math.hypot(i + 0.5, j + 0.5) / radius;
      const alpha = i < radius && d < 1 ? GLOW_STEPS[d < 1 / 3 ? 2 : d < 2 / 3 ? 1 : 0] : -1;
      if (run && run.alpha === alpha) { run.w += 2; continue; }
      if (run && run.alpha >= 0) out.push(run);
      run = { x: i * 2, y: j * 2, w: 2, h: 2, alpha };
    }
  }
  return out;
}

export const CONSOLE_GLOW = { free: 0.5, occupied: 0.85 } as const, FIRE_GLOW = [0.45, 0.6, 0.75] as const;
export const LAMP_ALERT = 0.9, LAMP_CALM = 0.55;

/** A console's light: steady, brighter while someone sits there; a console that is down gives none. */
export function consoleGlow(look: 'free' | 'occupied' | 'down'): number { return look === 'down' ? 0 : CONSOLE_GLOW[look]; }

/** A burning tile's light flickers between three steps, changing ten times a second, out of step tile to tile. */
export function fireGlow(seed: number, tile: number, t: number): number {
  return FIRE_GLOW[Math.floor(hash2(seed ^ tile, Math.floor(t * 10)) * 3)]!;
}

/** Each lamp's schedule: a period of 3 to 7 s with its own phase; it goes dark for 0.08 s, comes back for 0.08 s, then
 *  drops again for 0.06 s, once a period. */
export function lampLit(seed: number, room: number, t: number): boolean {
  const period = 3 + 4 * hash2(seed, room * 2), phase = hash2(seed, room * 2 + 1) * period;
  const local = (((t + phase) % period) + period) % period;
  return !(local < 0.08 || (local >= 0.16 && local < 0.22));
}

/** A room lamp's colour and light: lampOn and steady in alert, else lampOff on its flicker schedule. */
export function lampLight(alert: boolean, lit: boolean): { on: boolean; alpha: number } {
  return alert ? { on: true, alpha: LAMP_ALERT } : { on: false, alpha: lit ? LAMP_CALM : 0 };
}

/** A console screen's blink: screenA or screenB, at 1 to 2 Hz with its own phase. */
export function screenPhase(seed: number, station: number, t: number): 'A' | 'B' {
  const hz = 1 + hash2(seed, 1000 + station), phase = hash2(seed, 2000 + station);
  return Math.floor((t * hz + phase) * 2) % 2 === 0 ? 'A' : 'B';
}

/** The blinking readout on a console screen: 2 x 1 art pixels (1 x 2 on a side wall), one art pixel in from the
 *  screen's start, in ship world units. `screen` is tile-local and on the art-pixel grid (consoleModel's deskPicture,
 *  one art pixel deep), `x`/`y` the tile's origin, so the cursor is on the grid and inside the screen. */
export function screenCursor(x: number, y: number, screen: DoorRect): DoorRect {
  return screen.w >= screen.h
    ? { x: x + screen.x + 2, y: y + screen.y, w: 4, h: 2 }
    : { x: x + screen.x, y: y + screen.y + 2, w: 2, h: 4 };
}

/** The starfield: two layers drifting left at 4 and 10 art pixels a second, stars one art pixel square on whole art
 *  pixels from the band's corner, wrapping inside the band. The band is in internal pixels, so `artPx` is the size of
 *  one art pixel there: 2 x the world scale (the snapped fit makes it whole screen pixels, Art-i spec section 4). */
export const STAR_LAYERS = [{ count: 48, speed: 4 }, { count: 20, speed: 10 }] as const;
export interface Star { x: number; y: number; layer: number }
export function stars(seed: number, band: Band, t: number, artPx: number): Star[] {
  const out: Star[] = [], snap = (v: number): number => artPx * Math.floor(v / artPx);
  STAR_LAYERS.forEach((l, layer) => {
    for (let k = 0; k < l.count; k++) {
      const x0 = hash2(seed, layer * 1000 + k * 2) * band.w, y0 = hash2(seed, layer * 1000 + k * 2 + 1) * (band.h - artPx);
      const x = (((x0 - l.speed * artPx * t) % band.w) + band.w) % band.w;
      out.push({ x: band.x + snap(Math.min(x, band.w - artPx)), y: band.y + snap(y0), layer });
    }
  });
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/lightsModel.test.ts tests/artGuards.test.ts`
Expected: PASS, `lightsModel` 6; `artGuards` gains 2.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/lightsModel.ts tests/lightsModel.test.ts
git commit -m "feat(art-i-b): posterised glows, lamp flicker, screen blink and starfield model" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The interior feel composite (Pixi)

**Files:**
- Create: `src/renderer/src/render/particles/particleLayer.ts`
- Create: `src/renderer/src/render/interiorFeel.ts`
- Test: `tests/interiorFeel.test.ts` (create)

**Interfaces:**
- Consumes: everything from Tasks 1-6; `consoles` (`render/consoleModel.ts`); `fireTiles`; `ROLE`, `RAMP`.
- Produces:
  - `particleLayer.ts`: `interface ParticleLayer { normal: Container; add: Container; draw(particles: readonly Particle[]): void }`; `createParticleLayer(cap = PARTICLE_CAP)`.
  - `interiorFeel.ts`: `type FeelHit = { rooms: readonly number[] } | { whole: true } | null`; `interface FeelFrame { state: SimState; grade: GradeInput; hit: FeelHit; sparks: readonly { key: string; x: number; y: number }[]; working: readonly Working[]; artPx: number }`; `interface InteriorFeel { starfield: Container; grade: Container; fixtures: Graphics; above: Container; lights: Container; time(): number; draw(frame: FeelFrame, dt: number): { shake: { x: number; y: number }; bob: number[] }; reset(): void; destroy(): void }` (`dt` is the presentation dt: 0 while paused, Decision 17; `destroy` per Decision 18); `createInteriorFeel(opts: { world: Container; band: Band; feel: () => FeelSetting }): InteriorFeel`. Children used by tests: `grade.children` = `[ambient, alert, vacuum]`; `above.children` = `[normal particles, flash]`; `lights.children` = `[glows, additive particles]`.

- [ ] **Step 1: Write the failing test** — create `tests/interiorFeel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AnimatedSprite, Container, Graphics, Texture, type Sprite } from 'pixi.js';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createInteriorFeel, type FeelFrame } from '../src/renderer/src/render/interiorFeel';
import type { FeelSetting } from '../src/renderer/src/render/feel';
import { lampPoints, sectorGradeInput } from '../src/renderer/src/render/gradeModel';
import { consoles } from '../src/renderer/src/render/consoleModel';
import { DEBRIS_COUNT } from '../src/renderer/src/render/particles/sources';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { FLASH_ALPHA, HITSTOP_SECONDS } from '../src/renderer/src/render/impactModel';
import { HULL_MAX } from '../src/renderer/src/sim/tuning';
import { cutterState } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';

const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const make = (feel: FeelSetting = 'full') => { const world = new Container(); return { world, f: createInteriorFeel({ world, band: WORLD_BAND, feel: () => feel }) }; };
const frame = (s: ReturnType<typeof cutterState>, over: Partial<FeelFrame> = {}): FeelFrame => ({ state: s, grade: sectorGradeInput(s), hit: null, sparks: [], working: [], artPx: 2, ...over });
const flashOf = (above: Container): Graphics => above.children[1] as Graphics;

describe('the interior light and feel layers (Art-i spec sections 5-8)', () => {
  it('uses the basic blend modes: the grade multiplies, its vacuum tint is normal, the lights and additive particles add', () => {
    const { f } = make();
    expect(f.grade.blendMode).toBe('multiply');
    expect((f.grade.children[2] as Graphics).blendMode).toBe('normal');
    expect(f.lights.blendMode).toBe('add');
    expect((f.lights.children[1] as Container).blendMode).toBe('add');
  });
  it('preallocates the 600 particle sprites, and 120 calm frames add no display objects', () => {
    const { f } = make(), s = cutterState(), all = new Container();
    all.addChild(f.starfield, f.grade, f.fixtures, f.above, f.lights);
    f.draw(frame(s), 1 / 60);
    const n0 = count(all);
    expect(n0).toBeGreaterThan(600);
    for (let k = 0; k < 120; k++) { s.tick++; f.draw(frame(s), 1 / 60); }
    expect(count(all)).toBe(n0);
  });
  it('alert shows the pulse; vacuum tints a room', () => {
    const { f } = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    expect((f.grade.children[1] as Graphics).visible).toBe(false);
    s.hull = HULL_MAX / 2; s.rooms.o2[0] = 0;
    f.draw(frame(s), 0.8);
    expect((f.grade.children[1] as Graphics).visible).toBe(true);
    expect((f.grade.children[1] as Graphics).alpha).toBeGreaterThan(0.3);
    expect((f.grade.children[2] as Graphics).context.instructions.length).toBeGreaterThan(0);
  });
  it('a hit: the white flash for 2 sim ticks, a 60 ms hitstop on the presentation clock, a 6 art pixel shake', () => {
    const { world, f } = make(), s = cutterState();
    const anim = new AnimatedSprite({ textures: [Texture.WHITE, Texture.WHITE], autoUpdate: false }); anim.play(); world.addChild(anim);   // autoUpdate off: node has no requestAnimationFrame
    f.draw(frame(s), 1 / 60);
    const t0 = f.time();
    s.tick = 10;
    const out = f.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    expect(f.time()).toBe(t0);                                          // the hitstop holds the clock
    expect(anim.playing).toBe(false);                                   // and sprite animation
    expect(Math.abs(out.shake.x) + Math.abs(out.shake.y)).toBe(12);     // cos(0) x 6 art px x 2 world units
    expect(flashOf(f.above).visible).toBe(true); expect(flashOf(f.above).alpha).toBeCloseTo(FLASH_ALPHA);
    s.tick = 11; f.draw(frame(s), 1 / 60);
    expect(flashOf(f.above).visible).toBe(true);
    s.tick = 12; f.draw(frame(s), 1 / 60);
    expect(flashOf(f.above).visible).toBe(false);                       // 2 ticks, even though the hitstop ran 60 ms
    for (let k = 0; k < 3; k++) f.draw(frame(s), 1 / 60);
    expect(f.time()).toBeCloseTo(t0 + 6 / 60 - HITSTOP_SECONDS);
    expect(anim.playing).toBe(true);
    let last = { x: 1, y: 1 };
    for (let k = 0; k < 30; k++) last = f.draw(frame(s), 1 / 60).shake;
    expect(last).toEqual({ x: 0, y: 0 });
  });
  it('the duel hit flashes the whole interior at half strength; feel off gives no flash, shake or hitstop', () => {
    const duel = make(), s = cutterState();
    duel.f.draw(frame(s), 1 / 60);
    duel.f.draw(frame(s, { hit: { whole: true } }), 1 / 60);
    expect(flashOf(duel.f.above).alpha).toBeCloseTo(FLASH_ALPHA / 2);
    const off = make('off'), t = cutterState();
    off.f.draw(frame(t), 1 / 60);
    const before = off.f.time(), out = off.f.draw(frame(t, { hit: { rooms: [0] } }), 1 / 60);
    expect(out.shake).toEqual({ x: 0, y: 0 }); expect(flashOf(off.f.above).visible).toBe(false);
    expect(off.f.time()).toBeCloseTo(before + 1 / 60);
  });
  it('working crew bob; fire and failed stations emit particles', () => {
    const { f } = make(), s = cutterState();
    s.rooms.fire[1] = 8; s.stations.failed[0] = 1;
    let out = f.draw(frame(s, { working: [{ pid: 1, kind: 'power', x: 40, y: 40 }], sparks: [{ key: 'station:0', x: 40, y: 40 }] }), 1 / 60);
    for (let k = 0; k < 30; k++) out = f.draw(frame(s, { working: [{ pid: 1, kind: 'power', x: 40, y: 40 }], sparks: [{ key: 'station:0', x: 40, y: 40 }] }), 1 / 60);
    expect(out.bob[1] === 0 || out.bob[1] === -2).toBe(true); expect(out.bob[0]).toBeUndefined();
    const visible = (c: Container): number => c.children.filter((k) => k.visible).length;
    expect(visible(f.lights.children[1] as Container)).toBeGreaterThan(0);   // additive embers and sparks
    expect(visible(f.above.children[0] as Container)).toBeGreaterThan(0);    // normal smoke
  });
  it('a hit that opens a breach throws its debris although the hitstop holds that frame', () => {
    const { f } = make(), s = cutterState(), site = 0, room = s.derived.siteRoom[site]!;
    f.draw(frame(s), 1 / 60);
    s.tick = 10; s.breaches.active[site] = 1;
    f.draw(frame(s, { hit: { rooms: [room] } }), 1 / 60);                       // the hitstop starts here: this frame's pdt is 0
    for (let k = 0; k < 4; k++) f.draw(frame(s), 1 / 60);                    // the clock runs again on the fourth frame
    const shown = (f.above.children[0] as Container).children.filter((k) => k.visible).length;
    expect(shown).toBeGreaterThanOrEqual(DEBRIS_COUNT);
  });
  it('a zero presentation dt (the game paused) freezes the particles and the alert pulse', () => {
    const { f } = make(), s = cutterState();
    s.rooms.fire[1] = 8; s.hull = HULL_MAX / 2;
    for (let k = 0; k < 40; k++) f.draw(frame(s), 1 / 60);
    const look = (): string => JSON.stringify({
      t: f.time(), alert: (f.grade.children[1] as Graphics).alpha,
      dots: [f.above.children[0], f.lights.children[1]].flatMap((c) => (c as Container).children.filter((k) => k.visible).map((k) => [k.x, k.y, (k as Sprite).tint]))
    });
    const before = look();
    expect(JSON.parse(before).dots.length).toBeGreaterThan(0);
    for (let k = 0; k < 30; k++) f.draw(frame(s), 0);
    expect(look()).toBe(before);
    f.draw(frame(s), 1 / 60);
    expect(look()).not.toBe(before);                                           // and it runs on when the game resumes
  });
  it('a layout change rebuilds the glows without leftovers; destroy frees the shared contexts', () => {
    const { f } = make(), s = cutterState(), other = createSimState(parseShip(skiff), 2, 1);
    const glows = f.lights.children[0] as Container, expected = consoles(s).length + lampPoints(s.derived.roomTiles, s.derived.width).length;
    f.draw(frame(s), 1 / 60); f.draw(frame(other), 1 / 60); f.draw(frame(s), 1 / 60);
    expect(glows.children).toHaveLength(expected);
    const shared = [(f.grade.children[0] as Graphics).context, ...glows.children.map((g) => (g as Graphics).context)];
    expect(shared.some((c) => c.destroyed)).toBe(false);
    f.destroy();
    expect(shared.every((c) => c.destroyed)).toBe(true);
    expect([f.grade.children.length, glows.children.length]).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/interiorFeel.test.ts`
Expected: FAIL, `Failed to resolve import "../src/renderer/src/render/interiorFeel"`.

- [ ] **Step 3: Create `src/renderer/src/render/particles/particleLayer.ts`**

```ts
import { Container, Sprite, Texture } from 'pixi.js';
import { ART_PX, PARTICLE_CAP, particleColour, particleCorner, type Particle } from './emitter';

/** The particles on screen (Art-i spec section 6): one pooled Sprite per emitter slot, made up front so the display
 *  tree never grows, in a normal and an additive container; a slot's Sprite moves to its particle's container on spawn. */
export interface ParticleLayer { normal: Container; add: Container; draw(particles: readonly Particle[]): void }

export function createParticleLayer(cap = PARTICLE_CAP): ParticleLayer {
  const normal = new Container(), add = new Container();
  add.blendMode = 'add';
  const pool = Array.from({ length: cap }, () => { const s = new Sprite(Texture.WHITE); s.visible = false; s.roundPixels = true; normal.addChild(s); return s; });
  let shown: Sprite[] = [];
  return {
    normal, add,
    draw(particles) {
      for (const s of shown) s.visible = false;
      shown = [];
      for (const p of particles) {
        const s = pool[p.slot]!, home = p.blend === 'add' ? add : normal;
        if (s.parent !== home) home.addChild(s);
        const c = particleCorner(p), size = p.size * ART_PX;
        s.position.set(c.x, c.y); s.setSize(size, size); s.tint = particleColour(p); s.visible = true;
        shown.push(s);
      }
    }
  };
}
```

- [ ] **Step 4: Create `src/renderer/src/render/interiorFeel.ts`**

```ts
// Light and feel for one ship interior (Art-i spec sections 5-8), shared by the sector view (renderer.ts) and the duel
// interior (duel/interiorView.ts): the grade, the lights, the particles, the impact flash, shake and hitstop, the
// fixtures (console screen blink, room lamps) and the starfield, all on one presentation clock. The views add the
// containers in the spec's order and pass each frame's signals; this module never reads input or the sim RNG.
import { AnimatedSprite, Container, Graphics, GraphicsContext } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { FIRE_CAP } from '../sim/tuning';
import { consoles } from './consoleModel';
import type { DoorRect } from './doorModel';
import { feelScale, type FeelSetting } from './feel';
import { alertStrength, gradeCover, gradeModel, lampPoints, type GradeInput } from './gradeModel';
import { fireTiles } from './hazardTiles';
import { createShake, DUEL_FLASH_SHARE, flashAlpha, HITSTOP_SECONDS, kickShake, shakeOffset, SMOKE_SECONDS, stepShake } from './impactModel';
import { consoleGlow, fireGlow, glowRuns, lampLight, lampLit, screenCursor, screenPhase, stars } from './lightsModel';
import { RAMP, ROLE } from './palette';
import { createPresentClock } from './presentClock';
import { createEmitter, type Emitter } from './particles/emitter';
import { createParticleLayer } from './particles/particleLayer';
import { hashString } from './particles/random';
import {
  bobOffset, breachOpenings, debrisBurst, fireSources, hitSmokeSources, sparkSources, stepVents, ventingSources, wallVents, workSources, type HitSmoke, type WallVent, type Working
} from './particles/sources';
import type { Band } from './worldFit';

/** This frame's hit: the sector's hit rooms, or the duel's whole interior (its hits carry no room). */
export type FeelHit = { rooms: readonly number[] } | { whole: true } | null;

export interface FeelFrame {
  /** The interior's sim state (the sector state, or the duel's d.interior). */
  state: SimState;
  grade: GradeInput;
  hit: FeelHit;
  /** Spark points: failed stations (sector) or damaged repair rooms (duel). */
  sparks: readonly { key: string; x: number; y: number }[];
  working: readonly Working[];
  /** One art pixel in the shaken container's parent units: 2 x the world scale. */
  artPx: number;
}

export interface InteriorFeel {
  /** Under the world, filling the band (internal pixels). */
  starfield: Container;
  /** Right above the tiles (multiply; its vacuum child is normal blend). */
  grade: Container;
  /** Into the console desks container: the screen blink and the lamp fixtures. */
  fixtures: Graphics;
  /** Into effects.above: the normal particles, then the white flash. */
  above: Container;
  /** Above everything that shows the ship, under any text (additive). */
  lights: Container;
  /** Presentation seconds (frozen by the hitstop). */
  time(): number;
  /** Returns the shake offset for the world (and, in the sector, the projectiles and callouts), and each player's bob.
   *  `dt` is the presentation dt: the views pass 0 while the game is paused, so everything here holds. */
  draw(frame: FeelFrame, dt: number): { shake: { x: number; y: number }; bob: number[] };
  reset(): void;
  /** Destroys this feel's Graphics and its shared GraphicsContexts; call it before destroying the view's containers. */
  destroy(): void;
}

const GLOW = { console: 5, fire: 8, lamp: 4 } as const;
const LAMP_SIZE = 4;

function glowContext(radius: number): GraphicsContext {
  const c = new GraphicsContext();
  for (const r of glowRuns(radius)) c.rect(r.x, r.y, r.w, r.h).fill({ color: 0xffffff, alpha: r.alpha });   // white: each glow's tint carries its palette colour
  return c;
}

/** Stop every playing AnimatedSprite under `root` (the hitstop), or start again the ones it stopped. */
function freezeAnimations(root: Container, held: Set<AnimatedSprite>, frozen: boolean): void {
  if (!frozen) { for (const s of held) if (!s.destroyed) s.play(); held.clear(); return; }
  const walk = (c: Container): void => { for (const k of c.children) { if (k instanceof AnimatedSprite && k.playing) { k.stop(); held.add(k); } walk(k); } };
  walk(root);
}

/** `world`: the ship's world container (its animations freeze in a hitstop). `band`: the starfield's band, internal pixels. */
export function createInteriorFeel(opts: { world: Container; band: Band; feel: () => FeelSetting }): InteriorFeel {
  const starfield = new Container(), starG = new Graphics(); starfield.addChild(starG);
  const grade = new Container(); grade.blendMode = 'multiply';
  const coverCtx = new GraphicsContext(), ambient = new Graphics(coverCtx), alert = new Graphics(coverCtx), vacuum = new Graphics();
  ambient.tint = ROLE.ambient; alert.tint = ROLE.alert; vacuum.blendMode = 'normal';
  grade.addChild(ambient, alert, vacuum);
  const fixtures = new Graphics();
  const particles = createParticleLayer();
  const flash = new Graphics(); flash.visible = false;
  const above = new Container(); above.addChild(particles.normal, flash);
  const lights = new Container(); lights.blendMode = 'add';
  const glowLayer = new Container(); lights.addChild(glowLayer, particles.add);
  const ctx = { console: glowContext(GLOW.console), fire: glowContext(GLOW.fire), lamp: glowContext(GLOW.lamp) };
  const fireGlows = new Map<number, Graphics>(), held = new Set<AnimatedSprite>();
  let consoleGlows: Graphics[] = [], lampGlows: Graphics[] = [];

  const clock = createPresentClock(), shake = createShake();
  let builtFor = '', seed = 0, emitter: Emitter = createEmitter(0), vents: WallVent[] = [], puffs: number[] = [];
  let lamps: { room: number; x: number; y: number }[] = [], cover: DoorRect[] = [];
  let smokes: HitSmoke[] = [], breachSeen: Uint8Array | null = null, flashTick = Number.NEGATIVE_INFINITY, flashShare = 1, wasStopped = false;

  function build(state: SimState): void {
    const d = state.derived;
    builtFor = d.layoutHash; seed = hashString(d.layoutHash); emitter = createEmitter(seed);
    cover = gradeCover(state.layout.rows, d.width, d.height);
    coverCtx.clear(); for (const r of cover) coverCtx.rect(r.x, r.y, r.w, r.h); coverCtx.fill(0xffffff);
    vents = wallVents(state.layout.rows, d.width, d.height, d.layoutHash); puffs = [];
    lamps = lampPoints(d.roomTiles, d.width);
    for (const g of [...consoleGlows, ...lampGlows, ...fireGlows.values()]) g.destroy();
    fireGlows.clear();
    consoleGlows = consoles(state).map(() => { const g = new Graphics(ctx.console); g.tint = ROLE.screenA; glowLayer.addChild(g); return g; });
    lampGlows = lamps.map(() => { const g = new Graphics(ctx.lamp); glowLayer.addChild(g); return g; });
    smokes = []; breachSeen = null; flashTick = Number.NEGATIVE_INFINITY; flash.visible = false;
  }

  function onHit(frame: FeelFrame): void {
    const { state, hit } = frame, d = state.derived, f = feelScale(opts.feel());
    if (!hit || ('rooms' in hit && hit.rooms.length === 0)) return;
    kickShake(shake, f); clock.hitstop(HITSTOP_SECONDS * f.hitstop);
    flashTick = state.tick; flash.clear();
    const t = clock.t;
    if ('whole' in hit) {
      flashShare = DUEL_FLASH_SHARE;
      for (const r of cover) flash.rect(r.x, r.y, r.w, r.h);
      const floor = d.roomTiles.flat();
      if (floor.length) smokes.push({ key: `duel:${flashTick}`, tiles: [floor[emitter.random.int(floor.length)]!], until: t + SMOKE_SECONDS });
    } else {
      flashShare = 1;
      for (const room of hit.rooms) {
        for (const tile of d.roomTiles[room]!) { const tx = tile % d.width; flash.rect(tx * TILE_PX, ((tile - tx) / d.width) * TILE_PX, TILE_PX, TILE_PX); }
        smokes = smokes.filter((s) => s.key !== `room:${room}`);
        smokes.push({ key: `room:${room}`, tiles: d.roomTiles[room]!, until: t + SMOKE_SECONDS });
      }
    }
    flash.fill(ROLE.flash);
  }

  return {
    starfield, grade, fixtures, above, lights,
    time: () => clock.t,
    draw(frame, dt) {
      const { state } = frame, d = state.derived;
      if (builtFor !== d.layoutHash) build(state);
      onHit(frame);
      const pdt = clock.advance(dt), t = clock.t;
      if (clock.stopped !== wasStopped) { wasStopped = clock.stopped; freezeAnimations(opts.world, held, wasStopped); }

      // Grade (section 5): ambient always, the alert pulse while on, vacuum per room (normal blend).
      const g = gradeModel(frame.grade, t);
      ambient.alpha = g.ambient; alert.visible = g.alert; alert.alpha = alertStrength(g);
      vacuum.clear();
      for (const v of g.vacuum) for (const tile of d.roomTiles[v.room]!) { const tx = tile % d.width; vacuum.rect(tx * TILE_PX, ((tile - tx) / d.width) * TILE_PX, TILE_PX, TILE_PX).fill({ color: ROLE.vacuum, alpha: v.strength }); }

      // Particles (section 6) and steam (section 8), on the presentation clock.
      const opened = breachOpenings(state.breaches.active, breachSeen); breachSeen = opened.seen;
      for (const s of opened.opened) debrisBurst(emitter, state, s);   // even at pdt 0: the hit that opens a breach starts the hitstop this frame, and a 0 step holds the debris until the clock runs
      smokes = smokes.filter((s) => t < s.until);
      if (pdt > 0) stepVents(emitter, vents, puffs, t);
      emitter.step(pdt, [...fireSources(state), ...sparkSources(frame.sparks), ...ventingSources(state), ...workSources(frame.working), ...hitSmokeSources(smokes, t, d.width)]);
      particles.draw(emitter.particles);

      // Lights (section 5) and fixtures (section 8).
      fixtures.clear();
      consoles(state).forEach((c, k) => {
        const glow = consoleGlows[k];
        if (glow) { glow.position.set(c.x + TILE_PX / 2, c.y + TILE_PX / 2); glow.alpha = consoleGlow(c.look); }
        if (c.look === 'down') return;
        const r = screenCursor(c.x, c.y, c.picture.screen);
        fixtures.rect(r.x, r.y, r.w, r.h).fill(screenPhase(seed, c.members[0]!, t) === 'A' ? ROLE.screenA : ROLE.screenB);
      });
      lamps.forEach((l, k) => {
        const light = lampLight(g.alert, lampLit(seed, l.room, t)), glow = lampGlows[k]!;
        glow.position.set(l.x + LAMP_SIZE / 2, l.y + LAMP_SIZE / 2); glow.tint = light.on ? ROLE.lampOn : ROLE.lampOff; glow.alpha = light.alpha;
        fixtures.rect(l.x, l.y, LAMP_SIZE, LAMP_SIZE).fill(light.alpha === 0 ? ROLE.wallShadow : light.on ? ROLE.lampOn : ROLE.lampOff);   // a flickered-off lamp goes dark
      });
      const burning: number[] = [];
      for (let r = 0; r < d.volume.length; r++) if (state.rooms.fire[r]! > 0) burning.push(...fireTiles(d.roomTiles[r]!, state.rooms.fire[r]!, FIRE_CAP));
      for (const [tile, glow] of fireGlows) if (!burning.includes(tile)) { glow.destroy(); fireGlows.delete(tile); }
      for (const tile of burning) {
        let glow = fireGlows.get(tile);
        if (!glow) { glow = new Graphics(ctx.fire); glow.tint = RAMP.fire[2]!; glowLayer.addChild(glow); fireGlows.set(tile, glow); }
        const tx = tile % d.width; glow.position.set(tx * TILE_PX + TILE_PX / 2, ((tile - tx) / d.width) * TILE_PX + TILE_PX / 2); glow.alpha = fireGlow(seed, tile, t);
      }

      // The white flash (section 7): 2 sim ticks from the tick the hit was seen.
      const fa = flashAlpha(state.tick - flashTick, feelScale(opts.feel()), flashShare);
      flash.visible = fa > 0; flash.alpha = fa;

      // The starfield (section 8).
      starG.clear();
      for (const s of stars(seed, opts.band, t, frame.artPx)) starG.rect(s.x, s.y, frame.artPx, frame.artPx).fill(s.layer === 0 ? RAMP.vent[3]! : RAMP.vent[1]!);   // one art pixel at this world scale

      stepShake(shake, pdt);
      const bob: number[] = [];
      for (const w of frame.working) bob[w.pid] = bobOffset(t);
      return { shake: shakeOffset(shake, frame.artPx), bob };
    },
    reset() {
      clock.reset(); Object.assign(shake, createShake()); emitter.clear(); smokes = []; breachSeen = null; puffs = [];
      flashTick = Number.NEGATIVE_INFINITY; flash.visible = false;
      if (wasStopped) { wasStopped = false; freezeAnimations(opts.world, held, false); }
    },
    destroy() {
      // Every Graphics first, with no options so each owned context goes too (a parent's destroy({ children: true })
      // passes options, which leaves owned contexts), and a Graphics never destroys a context it was given; then the
      // shared contexts. The duel builds a new interior on every restart, and these would otherwise outlive it.
      for (const g of [ambient, alert, vacuum, fixtures, flash, starG, ...consoleGlows, ...lampGlows, ...fireGlows.values()]) g.destroy();
      consoleGlows = []; lampGlows = []; fireGlows.clear(); held.clear();
      coverCtx.destroy(); ctx.console.destroy(); ctx.fire.destroy(); ctx.lamp.destroy();
    }
  };
}
```

(The `0xffffff` in `glowContext` and the cover context is the white base that each `tint` colours; `interiorFeel.ts` is not one of the four files the `0x` guard covers.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/interiorFeel.test.ts tests/artGuards.test.ts && npx tsc -b; echo "tsc exit=$?"`
Expected: PASS, `interiorFeel` 9; `artGuards` gains 4; `tsc exit=0`. (An `AnimatedSprite` in a node test must be made with `autoUpdate: false`: `play()` with the shared ticker calls `requestAnimationFrame`, which node lacks.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/particles/particleLayer.ts src/renderer/src/render/interiorFeel.ts tests/interiorFeel.test.ts
git commit -m "feat(art-i-b): interior feel composite (grade, lights, particles, flash, shake, hitstop, fixtures, starfield)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sector wiring, the old shake and flash removed, the feel at boot

**Files:**
- Modify: `src/renderer/src/render/projectileModel.ts:9`
- Modify: `src/renderer/src/render/projectiles.ts`
- Modify (replace the whole file): `src/renderer/src/render/effects.ts`
- Modify: `src/renderer/src/render/crewSprites.ts`
- Modify (replace the whole file): `src/renderer/src/render/renderer.ts`
- Create: `src/renderer/src/app/feelBoot.ts`
- Modify: `src/renderer/src/main.ts`
- Modify: `src/renderer/src/app/session.ts`, `src/renderer/src/app/onlineSession.ts`
- Test: `tests/feelBoot.test.ts` (create); `tests/projectileModel.test.ts`, `tests/session.test.ts` (modify)

**Interfaces:**
- Consumes: Task 7 `createInteriorFeel`; Task 1 `sectorHits`, `FeelSetting`, `DEFAULT_FEEL`, `loadFeel`, `saveFeel`, `nextFeel`, `FeelStorage`; Task 2 `sectorGradeInput`; Task 4 `failedStationPoints`, `sectorWorking`, `watchRepair`.
- Produces: `Renderer.feel(): FeelSetting`, `Renderer.setFeel(s): void`; `Renderer.draw(state, alpha, bubbles?, ui?, presentation?, paused?: boolean)` (the feel gets a 0 presentation dt while `paused`, Decision 17; `SessionDeps.renderer.draw` gains the same parameter and both sessions pass their paused phase); `ProjectileLayer.draw(...)` now returns `void`; `CrewLayer.draw(state, alpha, presentation?, bob?: readonly (number | undefined)[])`; `app/feelBoot.ts`: `interface FeelTarget { feel(); setFeel(s) }`, `interface KeySource { addEventListener(type: 'keydown', cb: (e: { code: string }) => void): void }`, `installFeel(target, { storage, keys, dev, log? }): void`. `effects.ts` no longer exports `LOW_O2_THRESHOLD`, `LOW_O2_COLOR` or `LOW_O2_MAX_ALPHA` (nothing else imported them: `grep -rn "LOW_O2_" src tests` shows only `hudModel.ts`'s own `HUD_LOW_O2_FRAC` and `gradeModel.ts`).

- [ ] **Step 1: Write the failing test** — create `tests/feelBoot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { installFeel } from '../src/renderer/src/app/feelBoot';
import type { FeelSetting } from '../src/renderer/src/render/feel';

const target = () => { let s: FeelSetting = 'full'; return { feel: () => s, setFeel: (v: FeelSetting) => { s = v; } }; };
const keys = () => { const cbs: ((e: { code: string }) => void)[] = []; return { cbs, addEventListener: (_t: 'keydown', cb: (e: { code: string }) => void) => { cbs.push(cb); }, press: (code: string) => { for (const cb of cbs) cb({ code }); } }; };
const store = (v: string | null) => { const m = new Map<string, string>(); if (v !== null) m.set('ftlite-feel', v); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => { m.set(k, x); } }; };

describe('the feel setting at boot (Art-i spec section 7)', () => {
  it('reads the stored setting once; a denied storage gives full', () => {
    const t = target(), s = store('reduced');
    installFeel(t, { storage: () => s, keys: keys(), dev: false });
    expect(t.feel()).toBe('reduced');
    const u = target(); u.setFeel('off');
    installFeel(u, { storage: () => { throw new Error('SecurityError'); }, keys: keys(), dev: false });
    expect(u.feel()).toBe('full');
  });
  it('F9 cycles and saves it in dev builds only', () => {
    const t = target(), s = store(null), k = keys(), log: string[] = [];
    installFeel(t, { storage: () => s, keys: k, dev: true, log: (m) => log.push(m) });
    k.press('F8'); expect(t.feel()).toBe('full');
    k.press('F9'); expect(t.feel()).toBe('reduced'); expect(s.m.get('ftlite-feel')).toBe('reduced');
    k.press('F9'); k.press('F9'); expect(t.feel()).toBe('full');
    expect(log).toEqual(['feel: reduced', 'feel: off', 'feel: full']);
    const p = target(), pk = keys();
    installFeel(p, { storage: () => store(null), keys: pk, dev: false });
    expect(pk.cbs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/feelBoot.test.ts`
Expected: FAIL, `Failed to resolve import "../src/renderer/src/app/feelBoot"`.

- [ ] **Step 3: Create `src/renderer/src/app/feelBoot.ts`**

```ts
// The feel setting at boot (Art-i spec section 7): read once from localStorage (a denied storage gives the default), and
// in dev builds only, F9 cycles full, reduced, off and saves the choice. There is no menu entry in Art-i.
import { loadFeel, nextFeel, saveFeel, type FeelSetting, type FeelStorage } from '../render/feel';

export interface FeelTarget { feel(): FeelSetting; setFeel(setting: FeelSetting): void }
export interface KeySource { addEventListener(type: 'keydown', cb: (e: { code: string }) => void): void }

export function installFeel(target: FeelTarget, opts: { storage: () => FeelStorage; keys: KeySource; dev: boolean; log?: (message: string) => void }): void {
  target.setFeel(loadFeel(opts.storage));
  if (!opts.dev) return;
  opts.keys.addEventListener('keydown', (e) => {
    if (e.code !== 'F9') return;
    const next = nextFeel(target.feel());
    target.setFeel(next); saveFeel(opts.storage, next);
    opts.log?.(`feel: ${next}`);
  });
}
```

- [ ] **Step 4: Update the test that pinned the old shake** — in `tests/projectileModel.test.ts`, change the import's end

```ts
EVADE_FADE_TICKS, SHAKE_ASTEROID_PX, SHAKE_SHOT_PX, SHAKE_SECONDS } from
```

to

```ts
EVADE_FADE_TICKS } from
```

and replace

```ts
  it('the visibility windows and effect constants', () => {
    expect([ASTEROID_SHOW_SECONDS, SHOT_SHOW_SECONDS, EVADE_FADE_TICKS, SHAKE_ASTEROID_PX, SHAKE_SHOT_PX, SHAKE_SECONDS]).toEqual([6, 1.2, 36, 4, 3, 0.25]);
```

with

```ts
  it('the visibility windows and effect constants (the shake moved to impactModel, Art-i spec section 7)', () => {
    expect([ASTEROID_SHOW_SECONDS, SHOT_SHOW_SECONDS, EVADE_FADE_TICKS]).toEqual([6, 1.2, 36]);
```

(No test pins the red impact flash or the low-O2 colour: `grep -rn "IMPACT_\|LOW_O2_COLOR\|impactLayer" tests` prints nothing.)

- [ ] **Step 5: Remove the old shake from `src/renderer/src/render/projectileModel.ts`** — delete this line (line 9):

```ts
export const SHAKE_ASTEROID_PX = 4, SHAKE_SHOT_PX = 3, SHAKE_SECONDS = 0.25;
```

- [ ] **Step 6: Remove the old shake from `src/renderer/src/render/projectiles.ts`** (seven edits)

Replace

```ts
import { projectilePath, projectilePos, evadePos, outcomeOf, shouldReset, roomCentrePx, asteroidShape, fragmentCount, hash01, showSecondsOf, SHAKE_ASTEROID_PX, SHAKE_SHOT_PX, SHAKE_SECONDS, type Path, type Pt } from './projectileModel';
```

with

```ts
import { projectilePath, projectilePos, evadePos, outcomeOf, shouldReset, roomCentrePx, asteroidShape, fragmentCount, hash01, showSecondsOf, type Path, type Pt } from './projectileModel';
```

Replace

```ts
export interface ProjectileLayer { container: Container; reset(): void; draw(state: SimState, fit: { scale: number; x: number; y: number }, dt: number, link?: WindowLink): Pt }
```

with

```ts
/** The world shake is no longer here: the interior feel (interiorFeel.ts) shakes the world and this container (Art-i spec section 7). */
export interface ProjectileLayer { container: Container; reset(): void; draw(state: SimState, fit: { scale: number; x: number; y: number }, dt: number, link?: WindowLink): void }
```

Replace

```ts
  let prevTick = -1, prevNode = -1, shakeAmp = 0, shakeLeft = 0, clock = 0, bolt: Bolt | null = null;
```

with

```ts
  let prevTick = -1, prevNode = -1, bolt: Bolt | null = null;
```

Replace

```ts
  function reset(): void { tracked = new Map(); evading = []; bursts = []; shakeAmp = 0; shakeLeft = 0; prevTick = -1; prevNode = -1; bolt = null; slotPos.clear(); }
```

with

```ts
  function reset(): void { tracked = new Map(); evading = []; bursts = []; prevTick = -1; prevNode = -1; bolt = null; slotPos.clear(); }
```

Replace

```ts
    draw(state, fit, dt, link) {
      clock += dt;
      const node = beaconKey(state), tick = state.tick, db = state.debris;
```

with

```ts
    draw(state, fit, dt, link) {
      const node = beaconKey(state), tick = state.tick, db = state.debris;
```

Replace

```ts
        if (out === 'hit') {
          burst(t.path.to, id, t.kind === ObjectKind.Shot ? 8 : fragmentCount(id), t.kind === ObjectKind.Shot ? 70 : 55, t.kind === ObjectKind.Shot ? BOLT : ROCK, 0.6);
          shakeAmp = Math.max(shakeAmp * (shakeLeft / SHAKE_SECONDS), t.kind === ObjectKind.Shot ? SHAKE_SHOT_PX : SHAKE_ASTEROID_PX); shakeLeft = SHAKE_SECONDS;
        } else if (out === 'destroyed') { if (t.last) burst(t.last, id, 6, 18, PUFF, 0.5); }
```

with

```ts
        if (out === 'hit') burst(t.path.to, id, t.kind === ObjectKind.Shot ? 8 : fragmentCount(id), t.kind === ObjectKind.Shot ? 70 : 55, t.kind === ObjectKind.Shot ? BOLT : ROCK, 0.6);
        else if (out === 'destroyed') { if (t.last) burst(t.last, id, 6, 18, PUFF, 0.5); }
```

Replace

```ts
        return true;
      });
      // World shake after a hit: amplitude decays linearly to zero over SHAKE_SECONDS.
      if (shakeLeft <= 0) return { x: 0, y: 0 };
      shakeLeft = Math.max(0, shakeLeft - dt);
      const amp = shakeAmp * (shakeLeft / SHAKE_SECONDS);
      return { x: Math.round(Math.sin(clock * 90) * amp), y: Math.round(Math.cos(clock * 77) * amp) };
    }
```

with

```ts
        return true;
      });
    }
```

- [ ] **Step 7: Replace the whole of `src/renderer/src/render/effects.ts`** (the o2Layer, the red impactLayer and the breach vent puffs go; everything else is unchanged)

```ts
import type { CardUiState } from '../clientControl/cardController';
import { AnimatedSprite, Container, Graphics, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { FIRE_CAP } from '../sim/tuning';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import { fireTiles, breachOrientation, breachDamagedTiles, airlockDraw, airlockOutward, ventParticles, doorsCursorTile } from './hazardTiles';
import { featureReady } from './fallback';
import { syncCache } from './cache';
import { ROLE } from './palette';
import { airlockOutlineBand, breachRect, failedRect, fireFallbackRect, ventSpeckRect } from './effectsShapes';

// Art-i-b (spec sections 5-7): the low-oxygen tint became the grade's vacuum (gradeModel.ts, drawn by interiorFeel.ts),
// the red impact flash became the white flash, and the breach vent puff became the venting particles.
const SCALE = TILE_PX / 16;

export interface EffectsLayer { below: Container; above: Container; draw(state: SimState, ui?: CardUiState): void }

export function createEffectsLayer(assets: GameAssets, memory: RenderMemory): EffectsLayer {
  const missing = new Set(assets.missing);
  const art = { fire: featureReady(missing, 'fire'), breach: featureReady(missing, 'breach'), arc: featureReady(missing, 'arc') };
  const below = new Container(), above = new Container();
  const fireLayer = new Container(), breachLayer = new Container(), fallback = new Graphics();
  below.addChild(fireLayer, breachLayer, fallback);
  const fires = new Map<number, AnimatedSprite>();
  const outline = new Graphics(); above.addChild(outline);
  const ventLayer = new Graphics(); above.addChild(ventLayer);
  const failLayer = new Container(); below.addChild(failLayer); const fails = new Map<number, AnimatedSprite>();
  const decals: Sprite[] = [];
  const tileXY = (w: number, t: number): [number, number] => { const tx = t % w; return [tx, (t - tx) / w]; };

  function markDamaged(t: number): void { memory.damaged.add(t); }

  return {
    below, above,
    draw(state, ui) {
      const d = state.derived, w = d.width;
      // Fire: a stable, growing subset of each burning room's tiles.
      fallback.clear();
      const wanted: number[] = [];
      for (let r = 0; r < d.volume.length; r++) {
        const fire = state.rooms.fire[r]!; if (fire <= 0) continue;
        for (const t of fireTiles(d.roomTiles[r]!, fire, FIRE_CAP)) { wanted.push(t); markDamaged(t); }
      }
      if (art.fire) {
        const a = assets.animation('fire.loop');
        syncCache(fires, wanted, (t) => {
          const s = new AnimatedSprite(a.textures); s.scale.set(SCALE); s.animationSpeed = a.fps / 60; s.loop = true;
          s.gotoAndPlay(t % a.textures.length);                                  // frame offset by tile index: no pulsing in unison
          const [tx, ty] = tileXY(w, t); s.position.set(tx * TILE_PX, ty * TILE_PX); fireLayer.addChild(s); return s;
        }, (s) => s.destroy());
      } else {
        for (const t of wanted) { const [tx, ty] = tileXY(w, t), r = fireFallbackRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.fireFallback, alpha: 0.8 }); }
      }
      // Breaches: decal on the site wall tile and damaged floor on the room-side neighbours (the venting is particles now).
      for (let s = 0; s < d.siteTile.length; s++) {
        const active = state.breaches.active[s] === 1, [tx, ty] = tileXY(w, d.siteTile[s]!);
        if (active) for (const t of breachDamagedTiles(d, s)) markDamaged(t);
        if (art.breach) {
          if (!decals[s]) { const sp = new Sprite(assets.texture(`breach.${breachOrientation(d, s)}`)); sp.scale.set(SCALE); sp.position.set(tx * TILE_PX, ty * TILE_PX); breachLayer.addChild(sp); decals[s] = sp; }
          decals[s]!.visible = active;
        } else if (active) { const r = breachRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill(ROLE.breach); }
      }
      // Doors console selection: a pulsing outline on the selected door or airlock tile while someone is seated there (spec Demo-vii amendment 3).
      outline.clear();
      const sel = doorsCursorTile(state, ui);
      if (sel >= 0) {
        const [tx, ty] = tileXY(w, sel), pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.tick * 0.2)), band = airlockOutlineBand(tx, ty);
        outline.rect(band.rect.x, band.rect.y, band.rect.w, band.rect.h).stroke({ color: ROLE.airlockOutline, width: band.width, alignment: band.alignment, alpha: pulse });   // painted just outside the tile: it stays visible on amber airlock leaves
      }
      // Open airlocks: oxygen specks streaming outward while the room still holds air.
      ventLayer.clear();
      for (let k = 0; k < d.airlockTile.length; k++) {
        if (!airlockDraw(state, k).venting) continue;
        const out = airlockOutward(d, k), [tx, ty] = tileXY(w, d.airlockTile[k]!);
        for (const p of ventParticles(out, k, state.tick)) {
          const cx = (tx + 0.5 + out.dx * (0.5 + p.along) + (out.dx === 0 ? p.side : 0)) * TILE_PX, cy = (ty + 0.5 + out.dy * (0.5 + p.along) + (out.dy === 0 ? p.side : 0)) * TILE_PX;
          const r = ventSpeckRect(cx, cy); ventLayer.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.ventSpeck, alpha: p.alpha });
        }
      }
      // Failed stations: arc animation on the console tile, or a yellow square.
      const failedTiles: number[] = [];
      for (let i = 0; i < d.stationTile.length; i++) if (state.stations.failed[i]) failedTiles.push(d.stationTile[i]!);
      if (art.arc) {
        const a = assets.animation('fx.arc');
        syncCache(fails, failedTiles, (t) => {
          const s = new AnimatedSprite(a.textures); s.scale.set(SCALE); s.animationSpeed = a.fps / 60; s.loop = true; s.play();
          const [tx, ty] = tileXY(w, t); s.position.set(tx * TILE_PX, ty * TILE_PX); failLayer.addChild(s); return s;
        }, (s) => s.destroy());
      } else {
        for (const t of failedTiles) { const [tx, ty] = tileXY(w, t), r = failedRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.failed, alpha: 0.9 }); }
      }
    }
  };
}
```

- [ ] **Step 8: Add the bob to `src/renderer/src/render/crewSprites.ts`** (four edits)

Replace

```ts
export interface CrewLayer { container: Container; draw(state: SimState, alpha: number, presentation?: readonly PresentationPoint[]): void }
```

with

```ts
/** `bob`: per player, a world-unit lift for a working crew member (Art-i spec section 6); absent or undefined is 0. */
export interface CrewLayer { container: Container; draw(state: SimState, alpha: number, presentation?: readonly PresentationPoint[], bob?: readonly (number | undefined)[]): void }
```

Replace `    draw(state, alpha, presentation) {` with `    draw(state, alpha, presentation, bob = []) {`.

Replace `          g.position.set(x * TILE_PX, y * TILE_PX);` with `          g.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));`.

Replace `        cs.sprite.position.set(x * TILE_PX, y * TILE_PX);` with `        cs.sprite.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));`.

- [ ] **Step 9: Replace the whole of `src/renderer/src/render/renderer.ts`**

```ts
import type { CardUiState } from '../clientControl/cardController';
import { Application, Container } from 'pixi.js';
import { worldFit, WORLD_BAND } from './worldFit';
import { INTERNAL_W, INTERNAL_H, TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable } from '../sim/components';
import { computeLetterbox } from './letterbox';
import type { GameAssets } from './assets';
import { createRenderMemory } from './memory';
import { createTileLayer } from './tiles';
import { createEffectsLayer } from './effects';
import { createIconLayer } from './roomIcons';
import { createCrewLayer } from './crewSprites';
import { createBoarderLayer } from './boarderLayer';
import { createMagazineLayer } from './torpedoLayer';
import { createConsoleLayer } from './consoleLayer';
import { createProjectileLayer } from './projectiles';
import { createEnemyWindowLayer } from './enemyWindow';
import { enemyWindowModel, stepWindowAnim, freshWindowAnim, windowShown, windowRoomCentre, WINDOW, hitFlashOf } from './enemyWindowModel';
import { EnemyRoom } from '../sim/enemy';
import { createCalloutLayer } from './callouts';
import type { Bubble } from './calloutModel';
import type { PresentationPoint } from '../../../network/state/timeline';
import { createInteriorFeel } from './interiorFeel';
import { DEFAULT_FEEL, type FeelSetting } from './feel';
import { sectorGradeInput } from './gradeModel';
import { sectorHits } from './impactModel';
import { failedStationPoints, sectorWorking, watchRepair } from './particles/sources';


export interface Renderer {
  app: Application; world: Container; hud: Container; assets: GameAssets;
  resize(winW: number, winH: number): void;
  /** The letterbox stage scale set by the last resize (1 before the first); the duel interior reads it for its fit (Art-i spec section 4). */
  stageScale(): number;
  /** The feel setting (Art-i spec section 7), set at boot from storage (app/feelBoot.ts); the duel interior reads it too. */
  feel(): FeelSetting;
  setFeel(setting: FeelSetting): void;
  reset(): void;
  recordPrev(state: SimState): void;
  /** `paused`: the session is paused (Art-i spec section 7): the light and feel get a presentation dt of 0, so the particles,
   *  the alert pulse and the ambient life hold; the doors, projectiles and enemy window keep the real dt as before. */
  draw(state: SimState, alpha: number, bubbles?: readonly Bubble[], ui?: CardUiState, presentation?: readonly PresentationPoint[], paused?: boolean): void;
}

export async function createRenderer(assets: GameAssets): Promise<Renderer> {
  const app = new Application();
  await app.init({ width: INTERNAL_W, height: INTERNAL_H, background: 0x05060a, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);
  const world = new Container(); world.isRenderGroup = true;
  const hud = new Container(); hud.isRenderGroup = true;
  const projectiles = createProjectileLayer();   // spec Demo-vii section 2: over the ship (internal pixels), under the HUD
  const enemyWindow = createEnemyWindowLayer({ fontFamily: assets.fontFamily, fire: assets.has('fire.loop') ? assets.animation('fire.loop') : null, panel: null });   // the themed panel (spec Demo-x-c section 1)
  const callouts = createCalloutLayer(assets);
  app.stage.addChild(world, enemyWindow.container, projectiles.container, callouts.container, hud);   // spec Demo-viii amendment R2: world, enemy window, projectiles, HUD; the callout bubbles (spec Coop-i section 3) just under the HUD
  let anim = freshWindowAnim();
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory);
  const effects = createEffectsLayer(assets, memory);
  const icons = createIconLayer();
  const crew = createCrewLayer(assets, memory);
  const boarders = createBoarderLayer(assets);
  const consoleDesks = createConsoleLayer();   // spec Demo-xii section 1: a desk at every station, under the crew
  const magazine = createMagazineLayer();   // spec Coop-ii section 2: the magazine tile, under the crew
  let feelSetting: FeelSetting = DEFAULT_FEEL;
  const feel = createInteriorFeel({ world, band: WORLD_BAND, feel: () => feelSetting });   // Art-i spec sections 5-8
  // Art-i spec section 5: tiles, grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights.
  world.addChild(tiles.container, feel.grade, effects.below, icons.container, consoleDesks.container, magazine.container, crew.container, boarders.container, effects.above, feel.lights);
  consoleDesks.container.addChild(feel.fixtures); effects.above.addChild(feel.above);
  app.stage.addChildAt(feel.starfield, 0);   // the starfield under the world, filling WORLD_BAND (spec section 8)
  let lastDraw: number | null = null, stage = 1, seenImpact: Int32Array | null = null;

  return {
    app, world, hud, assets,
    resize(winW, winH) {
      const lb = computeLetterbox(winW, winH, INTERNAL_W, INTERNAL_H);
      app.renderer.resize(winW, winH);
      app.stage.scale.set(lb.scale); app.stage.position.set(lb.offsetX, lb.offsetY);
      if (lb.scale !== stage) { stage = lb.scale; projectiles.reset(); }   // the snapped fit moves the ship: shots in flight cached paths to the old room centres (presentation only)
    },
    stageScale: () => stage,
    feel: () => feelSetting,
    setFeel(setting) { feelSetting = setting; },
    reset() { memory.reset(); projectiles.reset(); enemyWindow.reset(); feel.reset(); anim = freshWindowAnim(); lastDraw = null; seenImpact = null; },   // session.start (a new run); the app has no runtime snapshot load
    recordPrev(state) {
      for (const eid of state.crew) memory.prev.set(Stable.id[eid]!, { x: Position.x[eid]!, y: Position.y[eid]! });
    },
    draw(state, alpha, bubbles = [], ui, presentation, paused = false) {
      const d = state.derived;
      const now = performance.now();
      const dt = lastDraw === null ? 0 : Math.min(0.1, (now - lastDraw) / 1000); lastDraw = now;
      const fit = worldFit(d.width, d.height, stage); world.scale.set(fit.scale);
      anim = stepWindowAnim(anim, state);
      const view = enemyWindowModel(state, state.tick + alpha, anim), shown = windowShown(state, view);
      enemyWindow.draw(view, shown, dt, hitFlashOf(state, view));
      projectiles.draw(state, fit, dt, { shotOrigin: shown ? windowRoomCentre(EnemyRoom.Weapons) : null, target: (slot) => { if (!shown || !view.bolt || view.bolt.slot !== slot || !view.bolt.to) return null; return { x: WINDOW.x + view.slideX + view.bolt.to.x, y: WINDOW.y + view.shipDY + view.bolt.to.y }; } });
      tiles.update(state, dt);
      icons.update(state);
      consoleDesks.draw(state);
      magazine.draw(state);
      effects.draw(state, ui);
      // Light and feel (Art-i spec sections 5-8): this frame's hit rooms, the working crew, the failed stations.
      const hits = sectorHits(state.rooms.impactTick, state.tick, seenImpact); seenImpact = hits.seen;
      watchRepair(memory.repair, state);
      const { shake, bob } = feel.draw({ state, grade: sectorGradeInput(state), hit: { rooms: hits.rooms }, sparks: failedStationPoints(state), working: sectorWorking(state, memory.repair), artPx: 2 * fit.scale }, paused ? 0 : dt);
      world.position.set(fit.x + shake.x, fit.y + shake.y); projectiles.container.position.set(shake.x, shake.y);   // the shake moves the world and the projectiles, as before
      crew.draw(state, alpha, presentation, bob);
      boarders.draw(state, dt);
      callouts.draw(state, bubbles, { scale: fit.scale, x: fit.x + shake.x, y: fit.y + shake.y });
    }
  };
}
```

- [ ] **Step 10: Read the feel at boot in `src/renderer/src/main.ts`** (five edits)

After `import { createSessionMenu } from './render/sessionMenu';` add:

```ts
import { installFeel } from './app/feelBoot';
import type { Renderer } from './render/renderer';
```

Before the comment line `/** The app (main menu spec, 2026-11-16): the menu with Single player (the solo duel), Multiplayer (today's online` add:

```ts
/** The feel setting (Art-i spec section 7): read once at boot inside a try/catch (loadFeel), F9 cycles it in dev builds. */
function bootFeel(renderer: Renderer): void {
  installFeel(renderer, { storage: () => localStorage, keys: window, dev: import.meta.env.DEV, log: (m) => console.info(m) });
}

```

In `startApp`, `startFlight` and `startDuel`, add the line `  bootFeel(renderer);` directly after `  const renderer = await createRenderer(assets);` (three places).

- [ ] **Step 11: Tell the renderer when the run is paused** (Decision 17; four edits and one test)

In `tests/session.test.ts`, add this test inside `describe('session', ...)` directly before `  it('after a fault, frames keep running without touching the corrupt state', () => {`:

```ts
  it('tells the renderer when the run is paused, so the light and feel hold (Art-i spec section 7)', () => {
    let t = 0, samples: SourceSample[] = [];
    const paused: (boolean | undefined)[] = [];
    const session = createSession({
      layout: LAYOUT, sampleDevices: () => samples, hud: null, now: () => (t += 20), saveCrash: () => {},
      renderer: { reset() {}, recordPrev() {}, draw(...args: unknown[]) { paused.push(args[5] as boolean | undefined); } }
    });
    samples = [{ key: 'a', moveX: 0, moveY: 0, interact: true, confirm: false, cancel: false, any: true }]; session.frame();
    samples = [{ key: 'a', moveX: 0, moveY: 0, interact: false, confirm: true, cancel: false, any: true }]; session.frame();
    samples = []; for (let k = 0; k < 5; k++) session.frame();
    expect(session.phase).toBe('running'); expect(paused.at(-1)).toBe(false);
    session.pause(); session.frame();
    expect(session.phase).toBe('paused'); expect(paused.at(-1)).toBe(true);
    session.resume(); session.frame();
    expect(paused.at(-1)).toBe(false);
  });
```

Run: `npx vitest run tests/session.test.ts -t "paused, so the light"`
Expected: FAIL, `expected undefined to be false` (the session passes no sixth argument yet).

In `src/renderer/src/app/session.ts`, replace

```ts
  renderer: { reset(): void; recordPrev(s: SimState): void; draw(s: SimState, alpha: number, bubbles?: readonly Bubble[], ui?: import('../clientControl/cardController').CardUiState, presentation?: readonly import('../../../network/state/timeline').PresentationPoint[]): void } | null;
```

with

```ts
  renderer: { reset(): void; recordPrev(s: SimState): void; draw(s: SimState, alpha: number, bubbles?: readonly Bubble[], ui?: import('../clientControl/cardController').CardUiState, presentation?: readonly import('../../../network/state/timeline').PresentationPoint[], paused?: boolean): void } | null;
```

and replace

```ts
      draw(view, alpha) { deps.renderer?.draw(view, alpha, phase === 'running' || phase === 'paused' ? bubbles(view, callouts, view.tick) : [], runtime?.ui); }
```

with

```ts
      draw(view, alpha) { deps.renderer?.draw(view, alpha, phase === 'running' || phase === 'paused' ? bubbles(view, callouts, view.tick) : [], runtime?.ui, undefined, phase === 'paused'); }
```

In `src/renderer/src/app/onlineSession.ts`, replace

```ts
      deps.renderer?.draw(state, 1, bubbles(state, callouts, state.tick), ui, points);
```

with

```ts
      deps.renderer?.draw(state, 1, bubbles(state, callouts, state.tick), ui, points, phase === 'paused');
```

(`phase` there is the line above's `lastPhase === 'ended' ? 'gameover' : lastPhase === 'paused' ? 'paused' : 'running'`, from the publication.)

- [ ] **Step 12: Run the tests and types**

Run: `npx vitest run tests/feelBoot.test.ts tests/projectileModel.test.ts tests/tileLayer.test.ts tests/renderPure.test.ts tests/duelInterior.test.ts tests/duelWeaponsView.test.ts tests/interiorFeel.test.ts tests/session.test.ts tests/onlineRenderer.test.ts tests/artGuards.test.ts && npx tsc -b; echo "tsc exit=$?"`
Expected: PASS (`feelBoot` 2, `projectileModel` 10, `tileLayer` 4, `renderPure` 19, `duelInterior` 3, `duelWeaponsView` 21, `interiorFeel` 9, `session` 36, `onlineRenderer` 11, `artGuards` +1 for `app/feelBoot.ts`); `tsc exit=0`. Check `grep -rn "SHAKE_ASTEROID_PX\|impactLayer\|o2Layer\|vent.puff'" src/renderer/src/render/*.ts` prints only `assetNames.ts` and `fallback.ts` (the manifest names, Decision 12).

- [ ] **Step 13: Commit**

```bash
git add src/renderer/src/render/projectileModel.ts src/renderer/src/render/projectiles.ts src/renderer/src/render/effects.ts src/renderer/src/render/crewSprites.ts src/renderer/src/render/renderer.ts src/renderer/src/app/feelBoot.ts src/renderer/src/main.ts src/renderer/src/app/session.ts src/renderer/src/app/onlineSession.ts tests/feelBoot.test.ts tests/projectileModel.test.ts tests/session.test.ts
git commit -m "feat(art-i-b): light and feel in the sector ship view; the art-pixel shake and white flash replace the old ones; ftlite-feel at boot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Duel interior wiring

**Files:**
- Modify (replace the whole file): `src/renderer/src/render/duel/interiorView.ts`
- Modify: `src/renderer/src/app/duel/duelMode.ts`
- Test: `tests/duelInterior.test.ts` (modify)

**Interfaces:**
- Consumes: Task 7 `createInteriorFeel`; Task 1 `duelHit`, `DEFAULT_FEEL`, `FeelSetting`; Task 2 `duelGradeInput`; Task 4 `damagedRepairPoints`, `duelWorking`; Task 8 `Renderer.feel`, the crew `bob` parameter.
- Produces: `createInteriorView(assets, stageScale = () => 1, feel = () => DEFAULT_FEEL)`; `InteriorView.draw(d, crewPrev, alpha, dt, events?: readonly ViewEvent[], presentDt?: number)` (`presentDt` defaults to `dt`; Decision 17); `InteriorView.destroy` destroys its feel first (Decision 18).

- [ ] **Step 1: Write the failing test** — in `tests/duelInterior.test.ts`, after `import { TILE_PX } from '../src/shared/resolution';` add

```ts
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
```

and add this test as the last `it` inside the `describe` (after the overlay test, before the closing `});`):

```ts
  it('light and feel (Art-i spec sections 5-8): the spec order, and a hit on the crew ship flashes and shakes only the interior world', () => {
    const d = createDuel(layout, 5), view = createInteriorView(assets);
    const kids = view.world.children;
    expect(view.container.children[1]).toBe(view.world);                                      // the starfield first, under the world
    expect((kids[1] as Container).blendMode).toBe('multiply');                                // tiles, then the grade
    const lights = kids.findIndex((k) => k.blendMode === 'add');
    expect(lights).toBe(9);                                                                    // after effects.above
    expect(kids.length - lights - 1).toBe(4);                                                  // the marks and the three labels above the lights
    view.draw(d, crewAt(d), 1, 1 / 60);
    expect([view.world.x, view.world.y]).toEqual([66, 152]);
    const hit = { kind: 'laser', ship: 1, hit: true, x1: 0, y1: 0, x2: 1, y2: 1 } as unknown as ViewEvent;
    view.draw(d, crewAt(d), 1, 1 / 60, [hit]);
    expect(Math.abs(view.world.x - 66) + Math.abs(view.world.y - 152)).toBe(12);              // 6 art pixels (cos 0) at world scale 1
    expect(view.container.x).toBe(0);
    view.destroy(); disposeDuel(d);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/duelInterior.test.ts`
Expected: FAIL in the new test only (`view.container.children[1]` is `undefined`: there is no starfield under the world yet); the other 3 pass.

- [ ] **Step 3: Replace the whole of `src/renderer/src/render/duel/interiorView.ts`**

```ts
// The duel's interior view (H-1 spec §8): the Cutter drawn by today's interior layers (tiles, effects, room icons,
// consoles, crew, boarders), composed as render/renderer.ts composes them, without the sector enemy window, projectiles,
// callouts or HUD, plus the duel's damage overlay. It owns its RenderMemory; a restart destroys it and builds a new one.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../../shared/resolution';
import { Stable } from '../../sim/components';
import type { DuelState } from '../../sim/duel/state';
import type { GameAssets } from '../assets';
import { createBoarderLayer } from '../boarderLayer';
import { createConsoleLayer } from '../consoleLayer';
import { createCrewLayer } from '../crewSprites';
import { createEffectsLayer } from '../effects';
import { createRenderMemory, type RenderMemory } from '../memory';
import { createIconLayer } from '../roomIcons';
import { AMBER, DIM, FONT_NATIVE, TEXT, WARN } from '../theme';
import { createTileLayer } from '../tiles';
import { duelFit, interiorOverlay, INTERIOR_BAND } from './interiorModel';
import { createInteriorFeel } from '../interiorFeel';
import { DEFAULT_FEEL, type FeelSetting } from '../feel';
import { duelGradeInput } from '../gradeModel';
import { duelHit } from '../impactModel';
import { damagedRepairPoints, duelWorking } from '../particles/sources';
import type { ViewEvent } from '../tactical/fxModel';

export interface InteriorView {
  container: Container;
  /** The ship's world container (scaled and placed by the fit), exposed for tests. */
  world: Container;
  memory: RenderMemory;
  /** `crewPrev`: each player's character position at the previous tick, in tiles, for interpolation. `events`: the view
   *  events drained this frame (the feed the tactical effects read); a hit on the crew ship flashes and shakes the interior.
   *  `presentDt`: the light and feel's seconds this frame (Art-i spec section 7), 0 while the duel is paused so the
   *  particles, the pulse and the ambient life hold; it defaults to `dt`, which the tiles and boarders keep. */
  draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number, events?: readonly ViewEvent[], presentDt?: number): void;
  destroy(): void;
}

/** The room tint by damage level (amber, red), and darker shades of both for the marker and its label on the light floor. */
const TINT: readonly number[] = [0, AMBER, WARN], MARK: readonly number[] = [0, 0x8a5a00, 0xa8281c];

/** `stageScale`: the letterbox's stage scale, read every frame so the fit snaps to whole screen pixels per art pixel (Art-i spec section 4); tests leave it at 1.
 *  `feel`: the feel setting (Art-i spec section 7), read every frame; tests leave it at full. */
export function createInteriorView(assets: GameAssets, stageScale: () => number = () => 1, feel: () => FeelSetting = () => DEFAULT_FEEL): InteriorView {
  const container = new Container(), world = new Container();
  const fx = createInteriorFeel({ world, band: INTERIOR_BAND, feel });   // Art-i spec sections 5-8
  container.addChild(fx.starfield, world);   // the starfield under the world, filling INTERIOR_BAND
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory), effects = createEffectsLayer(assets, memory), icons = createIconLayer();
  const desks = createConsoleLayer(), crew = createCrewLayer(assets, memory), boarders = createBoarderLayer(assets);
  const damage = new Graphics(), marks = new Graphics();
  const labels = Array.from({ length: 3 }, () => {
    const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 0); t.roundPixels = true; t.visible = false; return t;
  });
  // Back to front as renderer.ts (Art-i spec section 5): tiles, grade, effects below, room icons, desks, then the duel's
  // damage tint under the crew, crew, boarders (always empty in the duel), effects above, the lights, and the markers and
  // labels on top so the lights never wash them out.
  world.addChild(tiles.container, fx.grade, effects.below, icons.container, desks.container, damage, crew.container, boarders.container, effects.above, fx.lights, marks, ...labels);
  desks.container.addChild(fx.fixtures); effects.above.addChild(fx.above);
  return {
    container, world, memory,
    draw(d, crewPrev, alpha, dt, events = [], presentDt = dt) {
      const st = d.interior, fit = duelFit(st.derived.width, st.derived.height, stageScale());
      world.scale.set(fit.scale);
      st.crew.forEach((eid, pid) => { const p = crewPrev[pid]; if (p) memory.prev.set(Stable.id[eid]!, p); });
      tiles.update(st, dt); icons.update(st); desks.draw(st); effects.draw(st);
      const o = interiorOverlay(d);
      damage.clear(); marks.clear();
      for (const t of o.tints) for (const p of t.tiles) damage.rect(p.x, p.y, TILE_PX, TILE_PX).fill({ color: TINT[t.level]!, alpha: 0.28 });
      for (const c of o.consoles) marks.rect(c.x + 1, c.y + 1, TILE_PX - 2, TILE_PX - 2).stroke({ width: 2, color: c.free ? AMBER : DIM, alpha: c.free ? 0.95 : 0.4 });
      labels.forEach((t, k) => {
        const m = o.markers[k];
        t.visible = m !== undefined;
        if (!m) return;
        const colour = MARK[m.level]!, r = TILE_PX * 0.42;
        marks.poly([m.x, m.y - r, m.x + r, m.y, m.x, m.y + r, m.x - r, m.y]).stroke({ width: 2, color: colour });
        if (m.progress > 0) marks.moveTo(m.x, m.y).arc(m.x, m.y, r * 0.7, -Math.PI / 2, -Math.PI / 2 + m.progress * Math.PI * 2).closePath().fill({ color: TEXT, alpha: 0.8 });
        if (t.text !== m.label) t.text = m.label;
        t.tint = colour; t.position.set(Math.round(m.x), Math.round(m.y + TILE_PX * 0.5));
      });
      // Light and feel: the duel's hull alert, a hit flashes the whole interior, sparks at damaged repair rooms, repair work.
      const { shake, bob } = fx.draw({ state: st, grade: duelGradeInput(d), hit: duelHit(events) ? { whole: true } : null, sparks: damagedRepairPoints(d), working: duelWorking(d), artPx: 2 * fit.scale }, presentDt);
      world.position.set(fit.x + shake.x, fit.y + shake.y);   // only the interior world shakes; the readout column stays still
      crew.draw(st, alpha, undefined, bob);
      boarders.draw(st, dt);
    },
    destroy() { memory.reset(); fx.destroy(); container.destroy({ children: true }); }   // the feel first: it frees its shared GraphicsContexts
  };
}
```

- [ ] **Step 4: Pass the events, the paused presentation dt and the feel in `src/renderer/src/app/duel/duelMode.ts`** (five edits)

Replace `  let interior: InteriorView = createInteriorView(renderer.assets, renderer.stageScale);` with `  let interior: InteriorView = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel);`.

Replace `      interior.destroy(); interior = createInteriorView(renderer.assets, renderer.stageScale); scene.addChildAt(interior.container, 1);` with `      interior.destroy(); interior = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel); scene.addChildAt(interior.container, 1);`.

Replace

```ts
    pushEvents(fx, runtime.drainEvents());
```

with

```ts
    const events = runtime.drainEvents();
    pushEvents(fx, events);
```

Replace `    if (view === 'interior') interior.draw(d, runtime.crewPrev, alpha, dt);` with `    if (view === 'interior') interior.draw(d, runtime.crewPrev, alpha, dt, events, runtime.paused() ? 0 : dt);   // Art-i spec section 7: the light and feel hold while paused` (the presentation dt follows the same rule as `stepFx` above it; Decision 17).

Replace

```ts
    const shake = shakeOffset(fx);
```

with

```ts
    const shake = view === 'interior' ? { x: 0, y: 0 } : shakeOffset(fx);   // Art-i spec section 7: the interior shakes its own world; the console views keep the fx shake
```

- [ ] **Step 5: Run the tests and types**

Run: `npx vitest run tests/duelInterior.test.ts tests/duelWeaponsView.test.ts tests/interiorFeel.test.ts && npx tsc -b; echo "tsc exit=$?"`
Expected: PASS (`duelInterior` 4, including "60 frames ... add no display objects"; `duelWeaponsView` 21); `tsc exit=0`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/interiorView.ts src/renderer/src/app/duel/duelMode.ts tests/duelInterior.test.ts
git commit -m "feat(art-i-b): light and feel in the duel interior; the interior world takes the hit shake" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Final verification and screenshots

**Files:**
- Create (gitignored, never committed): `.art/shots/index.html`, `.art/shots/main.ts`, `.art/shots/vite.config.mjs`, `.art/shots/shot.cjs`, `.art/shots/all.mjs`
- Output (outside the repo): `C:\Users\djuar\FTLite-shots\art-i-b\*.png`

**Interfaces:**
- Consumes: everything above; `createRenderer`, `Renderer.stageScale`, `Renderer.feel`, `createInteriorView(assets, stageScale, feel)`, `createSimState`, `createDuel`, `SHIP_CLASSES`, `loadAssets`.
- Produces: the test count, the build, four screenshots.

- [ ] **Step 1: Full suite**

Run (on an idle machine): `npm run build 2>&1 | tail -1 && npx vitest run 2>&1 | tail -5`
Expected: `✓ built in ...`; then `Test Files 244 passed (244)` and `Tests 3461 passed (3461)`, i.e. the Step 0 baseline plus **80** (Decision 16). 0 failed.

- [ ] **Step 2: Types, build and the unchanged sim**

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0` and no other output.

Run: `git diff master --stat -- src/renderer/src/sim src/renderer/src/authority src/network src/shared; grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts; npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/boundary.test.ts 2>&1 | tail -3`
Expected: the diff stat prints nothing; `export const SIM_VERSION = 38;`; the three golden and boundary files pass (126 tests).

- [ ] **Step 3: Write the screenshot harness** (all under `.art/shots/`, which `.gitignore` covers; check with `git check-ignore -v .art/shots/main.ts`, which prints `.gitignore:18:.art/`)

`.art/shots/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>FTLite art shots</title>
    <style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`.art/shots/main.ts`:

```ts
// Art-i-b visual check harness (gitignored, never committed): draws the sector ship or the duel interior with the real
// renderer layers. ?view=sector&look=alert|vacuum, or ?view=duel&look=normal|alert.
import skiff from '../../src/renderer/src/sim/ship/skiff.json';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createSimState } from '../../src/renderer/src/sim/state';
import { createDuel } from '../../src/renderer/src/sim/duel/state';
import { SHIP_CLASSES } from '../../src/renderer/src/sim/tactical/defs';
import { Position } from '../../src/renderer/src/sim/components';
import { loadAssets } from '../../src/renderer/src/render/assets';
import { createRenderer } from '../../src/renderer/src/render/renderer';
import { createInteriorView } from '../../src/renderer/src/render/duel/interiorView';

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search), view = q.get('view') ?? 'sector', look = q.get('look') ?? 'normal';
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  renderer.resize(window.innerWidth, window.innerHeight);
  if (view === 'duel') {
    for (const child of renderer.app.stage.children) child.visible = false;
    const d = createDuel(parseShip(cutter), 5), interior = createInteriorView(assets, renderer.stageScale, renderer.feel);
    if (look === 'alert') { const ship = d.tactical.systems[0]!; ship.hull = Math.floor(SHIP_CLASSES[ship.cls]!.hull * 0.4); ship.rooms[2] = 1; }
    renderer.app.stage.addChild(interior.container);
    renderer.app.ticker.add(() => interior.draw(d, d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! })), 1, renderer.app.ticker.deltaMS / 1000));
  } else {
    const state = createSimState(parseShip(skiff), 2, 1);
    if (look === 'alert') { state.hull = 40; state.rooms.fire[1] = 8; }
    if (look === 'vacuum') { state.breaches.active[0] = 1; const r = state.derived.siteRoom[0]!; state.rooms.o2[r] = state.derived.volume[r]! * 0.25; }
    renderer.recordPrev(state);
    renderer.app.ticker.add(() => renderer.draw(state, 1));
  }
  (window as unknown as { shotReady: boolean }).shotReady = true;
}
main().catch((e) => { document.body.textContent = String(e); });
```

`.art/shots/vite.config.mjs`:

```js
// Serves the Art-i-b visual check harness with the repo's public/ assets (gitignored, never committed).
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const repo = resolve(import.meta.dirname, '..', '..');
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(repo, 'public'),
  envDir: false,
  define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify('art-shots') },
  server: { port: 5299, strictPort: true, fs: { allow: [repo] } }
});
```

`.art/shots/shot.cjs`:

```js
// Electron screenshot of the harness at an emulated viewport (gitignored, never committed).
// Arguments come in the SHOT environment variable as "url|width|height|out.png": Electron misreads a URL on its own command line.
const { app, BrowserWindow } = require('electron');
const { appendFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const log = (m) => appendFileSync(join(__dirname, 'shot.log'), `${new Date().toISOString()} ${m}\n`);
process.on('uncaughtException', (e) => { log(`uncaught ${e.stack}`); app.exit(1); });
const [url, w, h, out] = (process.env.SHOT || '').split('|');
const width = Number(w), height = Number(h);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, backgroundColor: '#000000' });
    await win.loadURL('about:blank');   // emulating before any page is loaded crashes the renderer
    const dbg = win.webContents.debugger; dbg.attach('1.3');
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await win.loadURL(url);
    for (let k = 0; k < 100; k++) { if (await win.webContents.executeJavaScript('window.shotReady === true')) break; await new Promise((r) => setTimeout(r, 100)); }
    await new Promise((r) => setTimeout(r, 2500));
    const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    log(`wrote ${out} (${width}x${height})`);
    app.quit();
  } catch (e) { log(`failed ${e.stack}`); app.exit(1); }
});
```

`.art/shots/all.mjs`:

```js
// Takes the Art-i-b screenshots (gitignored, never committed). usage: node .art/shots/all.mjs <electron.exe> <out dir>
// Needs the harness server running: npx vite --config .art/shots/vite.config.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [electron, outDir] = process.argv.slice(2);
if (!electron || !outDir) { console.error('usage: node .art/shots/all.mjs <electron.exe> <out dir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const shots = [
  ['view=duel&look=normal', 1920, 1080, 'duel-interior-normal.png'],
  ['view=duel&look=alert', 1920, 1080, 'duel-interior-alert.png'],
  ['view=sector&look=alert', 1920, 1080, 'sector-skiff-alert.png'],
  ['view=sector&look=vacuum', 1920, 1080, 'sector-skiff-vacuum.png']
];
let failed = 0;
for (const [query, w, h, name] of shots) {
  const out = resolve(outDir, name);
  const env = { ...process.env, SHOT: `http://localhost:5299/?${query}|${w}|${h}|${out}` }; delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [join(import.meta.dirname, 'shot.cjs')], { env, stdio: 'ignore', timeout: 60000 });
  const ok = r.status === 0 && existsSync(out) && statSync(out).size > 1000;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${w}x${h}) exit ${r.status}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Take the screenshots**

First check the port is free: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | Measure-Object | % Count"` prints `0`. (If not, stop and report; do not stop a process this task did not start.)

Start the harness server in the background and keep it running for the next command: `npx vite --config .art/shots/vite.config.mjs`
Expected: `VITE v7... ready` and `Local: http://localhost:5299/`.

Run (Electron needs a desktop session; if the tool sandbox blocks GUI processes, run without the sandbox):

```bash
E=node_modules/electron/dist/electron.exe; [ -f "$E" ] || E=/c/Users/djuar/FTLite/node_modules/electron/dist/electron.exe
node .art/shots/all.mjs "$E" "C:/Users/djuar/FTLite-shots/art-i-b"
```

Expected:

```
ok   duel-interior-normal.png (1920x1080) exit 0
ok   duel-interior-alert.png (1920x1080) exit 0
ok   sector-skiff-alert.png (1920x1080) exit 0
ok   sector-skiff-vacuum.png (1920x1080) exit 0
```

If one fails, read `.art/shots/shot.log`.

- [ ] **Step 5: Stop the harness processes**

Run: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }; Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ? { $_.CommandLine -like '*art-i-b*shot.cjs*' } | % { Stop-Process -Id $_.ProcessId -Force }"`
Then: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | Measure-Object | % Count"` prints `0`. (A Vite process left running holds files in the worktree and makes `git worktree remove` fail later.)

- [ ] **Step 6: Look at the screenshots** (Read each PNG) and check:
  - Duel normal: the Cutter left of the readout column on a two-layer starfield (stars only around the ship, one art pixel each), a calm ambient grade, a lamp fixture and soft glow in every room's top-left corner, console glows, a blinking cursor on the two role consoles' screens.
  - Duel alert: the same with the red alert pulse on the floors and walls (its strength depends on the pulse phase when the shot was taken), amber `lampOn` lamps, the Engines room's damage tint with electric sparks at its repair marker; the repair labels and markers sharp above the lights.
  - Sector Skiff alert: fire on a room with embers and smoke and a flickering fire glow, the alert pulse, amber lamps.
  - Sector Skiff vacuum: the breached room tinted in the `vacuum` blue (not red), the breach decal or fallback square, pale venting specks streaming into the hole.
  Record any visual problem for the owner rather than fixing it here (the owner's look is the gate).

- [ ] **Step 7: Report**

Nothing to commit in this task. Report: the totals against the baseline, `tsc` and build results, SIM_VERSION and the goldens unchanged, the four screenshot paths under `C:\Users\djuar\FTLite-shots\art-i-b\`, and observations for the owner's "starts to look and feel good" gate (also: try `npm run dev`, take hits in the sector and the duel, and press F9 to compare full, reduced and off). After the branch is merged: delete the signalling junction (Step 0.1) before `git worktree remove .worktrees/art-i-b`.

---

## Spec notes (problems found while planning; the spec is unchanged)

1. **Section 7, sector hit signal.** "`rooms.impactTick` equal to the current tick" never holds when the renderer draws: `resolveImpact` stamps `impactTick = state.tick` (`sim/debris.ts:117`) and the step then increments `state.tick` (`sim/step.ts:66`). The plan detects a changed, fresh `impactTick` instead (Decision 5).
2. **Section 8, console screen blink.** Blinking whole screens between `screenA` and `screenB` would erase the console state colours from spec Demo-xii (amber free, dim occupied, red down). The plan blinks a 2 × 1 art-pixel cursor on powered screens (Decision 14).
3. **Section 6, sector working.** Repair progress is per target, so two unseated crew whose `interactTarget` is the same fire, breach or station both count as working while only one holds Interact (the sim's `scratch.activeThisTick` would tell them apart but is not replicated to online clients). Accepted as written; `tests/particleSources.test.ts` seats the second player to test one worker.
4. **Section 7, what the hitstop freezes.** The spec names particles, sprite animation and the shake. The plan also runs the ambient life (alert pulse, blink, lamp and fire-light flicker, vent puffs, starfield) on the presentation clock, so the whole picture holds (Decision 4).
5. **Section 8, starfield star size (no longer a deviation).** "Stars of one art pixel" depends on the world scale (the Cutter's sector fit is 0.5-0.655). The starfield lives in internal pixels under the world, so the plan passes the frame's `artPx` (2 × `fit.scale`) into `stars`: each star is one art pixel at the current scale, on whole art pixels in the band, drifting at 4 and 10 art px/s as the spec says (Decision 14; review R1-F3 replaced the first draft's fixed 2 internal pixels).
6. **Section 4 leftover, consoles.** `consoleModel.ts` desk and screen geometry was still off the art-pixel grid (`DESK_W` 19, `SCREEN_D` 3, a 1-wide outline; Art-i-a's grid work did not cover consoles). Task 5 finishes section 4 for them (`DESK_W` 20, `SCREEN_D` 2, even insets, a 2-wide outline inside the desk; `WALL_GAP` unchanged), so the blink cursor sits on the grid inside every screen (Decision 19; review R1-F4).

## Self-review against the spec

- Section 5 (light and colour grade): containers and both exact orders — Tasks 8 (sector) and 9 (duel), Decision 2; basic blend modes, no advanced import — Decision 1, Task 7 test; `gradeModel` return shape, ambient, alert (hull ≤ 0.5 or fire, pulse formula, 0.35), vacuum (0.98, 0.6 × (1 − frac), `vacuum` role replacing the red o2Layer) — Task 2, Tasks 7-8; both adapters with real fields — Task 2; lights at consoles (brighter when occupied), fire tiles (flickering) and lamps on the top-left floor tile — Tasks 2, 6, 7; the multiply never paints an art pixel twice (non-overlapping cover) — Task 2, Decision 3; duel labels and markers above the lights, damage tint above the grade — Task 9.
- Section 6 (particles): pooled Sprites in two containers, 1-3 art-pixel squares, snapped positions, ramp stepping, 600 cap oldest first — Tasks 3 and 7; own generator from the layout hash, never the sim RNG — Task 3, the guard; embers and smoke, sparks (failed stations, damaged duel repair rooms, adding to fx.arc), venting toward the hole and opening debris (shown even when the opening hit starts the hitstop, Decision 11), crew working (bob at 4 Hz, sparks, foam) with both derivations — Tasks 4, 7, 8, 9.
- Section 7 (impact feel): hit signals — Task 1 (and Decision 5 on the sector tick); white flash 2 ticks, duel whole interior at half — Tasks 1, 7; shake 6 art px over 0.25 s in whole art pixels replacing `SHAKE_*` and the duel interior fxModel shake, moving the right containers — Tasks 1, 8, 9; hitstop 60 ms freezing particles, animation and shake but not the sim, interpolation or the flash count — Tasks 1, 7; smoke 3 s — Tasks 4, 7; `ftlite-feel` with `feelScale`, boot read in try/catch, F9 in dev only — Tasks 1, 8; the presentation clock holds while the game is paused (sector and duel) — Tasks 8, 9, Decision 17; a duel restart frees the feel's shared contexts — Tasks 7, 9, Decision 18.
- Section 4 leftover: the console desks, screens and outline on the art-pixel grid — Task 5, Decision 19.
- Section 8 (ambient): screen blink at 1-2 Hz (as a cursor on the grid, inside every screen, Decision 14), lamp flicker when not in alert, wall-vent steam every 4-8 s at `hash mod 8 = 0`, the two-layer starfield under the world in the band, one art pixel at the current world scale, at 4 and 10 art px/s — Tasks 4, 6, 7, 8, 9.
- Testing and gates: every unit test the spec lists (gradeModel cases, both adapters, emitter cap/determinism/snapping/ramp, working derivations, feelScale, hitstop timing) — Tasks 1-7; existing tests pass with the shake test and the desk size test updated — Tasks 5, 8; the suite grows by 80 (Decision 16), SIM_VERSION and goldens unchanged, screenshots of duel normal and alert and sector alert and vacuum — Task 10.
