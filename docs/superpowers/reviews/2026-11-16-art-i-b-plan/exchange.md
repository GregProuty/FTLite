# Codex review exchange: art-i-b-plan

Subject: `docs/superpowers/plans/2026-11-16-art-i-b-light-and-feel.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 753bb0c, effort high, 744 s, 9580342 in / 9379168 cached / 59296 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Debris never shows when a hit opens a breach: the hitstop sets pdt to 0 on that frame and the opening is used up anyway
In interiorFeel.draw the breach opening is recorded every frame (`breachSeen = opened.seen`), but the burst only spawns `if (pdt > 0)`. A sector impact activates the breach and stamps `rooms.impactTick` in the same sim tick. So the frame that first sees the opening is also the frame `onHit` starts the 60 ms hitstop. `clock.advance(1/60)` then returns 0, the burst is skipped and the opening is never reported again. With the default `full` feel (and `reduced`), impact breaches never get their opening debris, which the spec requires (section 6: 'debris on the tick a breach opens'). · plan L1761-1762 (onHit runs before `clock.advance`), L1772-1773 (`breachSeen = opened.seen; if (pdt > 0) ... debrisBurst`); src/renderer/src/sim/debris.ts:L103-L109 (resolveImpact calls tryBreach -> activateBreach) and L117 (impactTick stamped in the same call); plan L1736 (`clock.hitstop(HITSTOP_SECONDS * f.hitstop)`, which is 0.06 for full and reduced); spec L89 · In ordinary play most breaches come from impacts, so a listed spec feature effectively never appears, and no test covers a hit and a breach opening on the same frame. · Spawn the burst whatever `pdt` is: `emitter.step(0)` neither ages nor moves particles, so the debris holds at the hole during the hitstop and then flies. Alternatively, update `breachSeen` only on frames where `pdt > 0`. Add an interiorFeel test: one frame with `hit: { rooms: [siteRoom] }` and `breaches.active[s]` going from 0 to 1, then a few frames later at least DEBRIS_COUNT visible sprites in `above.children[0]`.

### [P1] R1-F2 gradeCover returns overlapping rectangles, so the multiply darkens twice or three times along every wall
For a wall tile, gradeCover adds every floor part and every band arm from wallPicture. These overlap: n=floor adds {0,0,32,16}, nw/ne add the 16x16 quarters inside it, and the band hub and arms span y 10..22, crossing the floor half. Pixi 8 triangulates each rect in one path separately and fills them all, with no union. Under 'multiply' each overlapping triangle blends again, giving dst x (1 - a + a c)^n. Wall tiles next to rooms therefore show 2x-3x darker strips than the next floor tile, and the alert pulse (strength 0.35, #a53030) compounds there too. The duel flash, built from the same cover, double-brightens the same areas. · plan L586-595 (gradeCover pushes `...p.floor, ...p.band` without merging), L1723 (`for (const r of cover) coverCtx.rect(...); coverCtx.fill(...)`), L1741 (flash from cover); src/renderer/src/render/wallModel.ts:L21-L35 (nw/ne quarters plus the n half; the band at LO=10..HI=22); src/renderer/src/render/doorModel.ts:L11 (PANEL_THICK 12, BAND 10); palette.json L24-L25 (ambient #a8b5b2, alert #a53030). The gradeModel test at plan L499-505 checks only the grid and the count of whole tiles, not overlap. · A visible seam pattern along every wall in both views, worst at the alert peak, on the layer that is meant to unify the look. The owner gate is 'starts to look good'. · Make gradeCover return a cover with no overlaps: draw the union of floor and band for each wall tile (or for the whole ship) onto an art-pixel mask and emit merged row runs. Add a test that draws every cover rect onto art-pixel cells and asserts no cell is covered twice, and that the union equals floor/door tiles plus the wall floor and band union.

### [P2] R1-F3 In the sector, stars are 2 internal px but the ship's art pixel is 2 x fit.scale, so the picture mixes pixel sizes
Deviation (e) draws every star as 2 internal pixels. The sector world's art pixel is 2 x fit.scale internal pixels, and worldFit snaps that to whole screen pixels: for example, at stage 1.5 with fit 0.667, an art pixel is 2 screen px but a star is 3. The spec asks for 'stars of one art pixel'. The renderer already has that size every frame (`artPx = 2 * fit.scale`, plan L2281), so the stated reason ('depends on the world scale') does not need a fixed 2 px. · plan L57, L1458 and L1808 (`starG.rect(s.x, s.y, 2, 2)`), spec note L2714, spec L105; src/renderer/src/render/worldFit.ts:L10 (art pixel = 2 x worldScale x stageScale, snapped) · Pixels of two sizes in one frame is the mixed-pixel look the Art-i bible works against. In the duel (fit 1) the stars happen to match, so this affects only the sector. · Pass `frame.artPx` to `stars()` and to the star draw: size = artPx, positions snapped to multiples of artPx inside the band, speeds of 4 and 10 x artPx per second. The lightsModel test then takes artPx as a parameter.

### [P2] R1-F4 Deviation (f): console desks and screens are still off the art-pixel grid, and the blink cursor test allows a 1-unit overflow
DESK_W is 19, SCREEN_D is 3, the screen insets are odd and the desk outline is a 1-unit stroke, so desks and screens sit on half art pixels. Art-i-a's grid work missed them. The plan states this but leaves it. Its new cursor sits on that off-grid strip, and the screenCursor test accepts the cursor running 1 unit (half an art pixel) past the screen (`<= ... + s.w + 1`). This plan's own constraint says every procedural rectangle is whole art pixels. · src/renderer/src/render/consoleModel.ts:L15 (DESK_W = round(19.2) = 19, SCREEN_D = 3), L45-L47 (odd offsets); src/renderer/src/render/consoleLayer.ts:L18 (stroke width 1); plan L17 (constraint), L1355 (the +1 tolerance), L2715 (note 6) · Consoles are central to the interior and the only procedural interior art still off the grid. The new blink highlights the misalignment. Fixing it now costs a few constants and a test, against a separate pass later. · Either add a small task (DESK_W 20, DESK_D 10, SCREEN_D 2 or 4, even insets, outline width 2 with alignment 1, an onGrid test over every `deskPicture` side and flush combination, then tighten the screenCursor bound to the screen), or record it explicitly for the owner as an open Art-i-a defect in the Task 9 report.

### [P2] R1-F5 InteriorFeel has no destroy(), so every duel restart leaks four shared GraphicsContexts
interiorFeel creates `coverCtx` and three glow contexts and hands them to Graphics via `new Graphics(ctx)`. A Graphics destroys only a context it owns, so `container.destroy({ children: true })` in interiorView.destroy leaves these four contexts and their GPU-side context data. duelMode rebuilds the interior on every restart (and on dispose), so they pile up for the session. · plan L1701 and L1710 (shared contexts), L1728-1729 and L1798 (`new Graphics(ctx.*)`), L1815-1819 (reset only, no destroy); plan L2456 (interiorView.destroy); src/renderer/src/app/duel/duelMode.ts:L80 and L111 (rebuilt on restart, destroyed on dispose) · This is the lifetime question in review item 11. The leak is small but unbounded across restarts in one session. · Add `destroy()` to InteriorFeel that destroys `coverCtx` and `ctx.console`, `ctx.fire` and `ctx.lamp` (after the Graphics that use them), and call `fx.destroy()` from interiorView.destroy before `container.destroy`.

### [P3] R1-F6 The presentation clock keeps running while the game is paused, unlike the duel's existing fx
duelMode steps the tactical fx with `runtime.paused() ? 0 : dt`, but the interior (and the sector renderer) passes real `dt` to the feel. While paused, embers, smoke, vent puffs, the starfield and the alert pulse keep moving, the hit smoke times out and the interior shake decays, while the Helm and Weapons fx freeze. · src/renderer/src/app/duel/duelMode.ts:L84 (stepFx frozen while paused), L87 (interior.draw with dt); plan L2451 (fx.draw with dt), L2281 (sector feel.draw with dt) · The pause behaves differently in the two views of one mode. This is minor and the spec says nothing, but it is cheap to make consistent. · Pass a paused flag or a presentation dt into `fx.draw` (`runtime.paused() ? 0 : dt` in the duel; the session's paused phase in the sector) while keeping the real dt for `tiles.update`. Or state the choice as a decision.

## Verified
- Interfaces exist with the shapes the plan assumes: `hitsCrew`/`ViewEvent` (render/tactical/fxModel.ts:L12, L35); `wallPicture(n,e,s,w,ne,se,sw,nw)`, `Cell`, `WallPicture{floor,band,...}` (wallModel.ts:L12-L19), and the argument order in plan L592 matches tiles.ts:L52; `DoorRect` (doorModel.ts:L15); `HULL_MAX` (tuning.ts:L11); `CREW_SLOT` (tactical/state.ts:L100); `SHIP_CLASSES` (defs.ts:L63); `Ship.cls/hull/rooms` (tactical/state.ts:L38-L43); `Room` Engines=2 (state.ts:L13); `interactTarget`/`TargetKind` Fire=room, Breach=site, Power=station (interact.ts:L20, L39-L73); `fireTiles`, `breachFloorNeighbour` (hazardTiles.ts:L13, L34); `FIRE_CAP` (tuning.ts:L30); `Position`/`Seated` (components.ts:L2, L13); `roomAt` (grid.ts:L24); `RepairEvent` repairWork/repairDone shapes and `d.points`/`d.events` (duel/state.ts:L13-L34), cleared every tick (duel/step.ts:L79); `consoles()` returns members/x/y/look/picture.screen (consoleModel.ts:L22, L67-L77); every ROLE the plan uses exists (palette.ts:L5-L7), and the RAMP lengths support every slice and index (palette.json L44-L47); `cutterState`, `onGrid`, `createDuel`/`disposeDuel`, `parseShip`, `TILE_PX`, `derived.siteRoom`, `loadAssets` all exist.
- Callers of the changed signatures are all updated: `projectiles.draw` is called only at renderer.ts:L79; `SHAKE_*` is imported only by projectiles.ts:L10 and tests/projectileModel.test.ts:L2/L13 (both edited, and the seven projectiles.ts edits match its current text, L15-L126); `LOW_O2_*`/`IMPACT_*`/`o2Layer`/`impactLayer` have no external importer; `createEffectsLayer` is used only by renderer.ts and interiorView.ts; `CrewLayer.draw` callers (renderer, interiorView, tests/onlineRenderer.test.ts with 3 args) stay compatible; `createInteriorView` is called at duelMode.ts:L41/L80 (both edited) and in tests/duelInterior.test.ts (defaults); no test or other module builds a `Renderer` literal (session.ts:L26 uses a narrower structural type); the three `createRenderer` calls in main.ts are at L37/L102/L112, and main.ts has no prior `Renderer` import; `RenderMemory` is built only in memory.ts.
- Determinism boundary: tests/boundary.test.ts follows imports only from sim/authority/net/clientControl/headless/events/shared, and none of those import render/, so the new render files never enter the deterministic graph; artGuards walks render/ recursively (catching particles/) for the rng and `.rng` guard, and render/ plus app/ for the pngjs guard (artGuards.test.ts:L39-L51), which matches +2 per new render file and +1 for app/feelBoot.ts; `particles/random.ts` avoids the forbidden `rng` module name; nothing in the plan writes sim state outside tests; `interactTarget` is already used read-only by hudModel.ts.
- Deviation (a) holds: resolveImpact stamps `rooms.impactTick[room] = state.tick` (debris.ts:L117) and step increments the tick afterwards (step.ts:L66), so at draw time `impactTick === tick` never holds; the change-detection with a freshness bound is justified and stated (plan L48, L2710). Deviations (b), (c) and (d) are stated with reasons and acceptable.
- Layer orders match spec L67-L68: sector at plan L2244, duel at plan L2427, with the duel's marks and labels above the lights; the starfield at stage index 0 is hidden by duelMode's visible-children filter (duelMode.ts:L36-L37) and by flightMode (flightMode.ts:L26); no code addresses stage children by index; consoleLayer never removes children, so `fixtures` stays last in the desks container (consoleLayer.ts:L7-L21); effects.above holds only outline and ventLayer once the puffs are removed, so `feel.above` stays on top.
- Duel wiring: `runtime.drainEvents()` returns `ViewEvent[]` (runtime.ts:L178, L368); the plan drains once and passes the array to both pushEvents and interior.draw; the scene shake is zeroed only for the interior view, so fxModel and its tests are unchanged; `renderer.feel` is an arrow property, so passing it unbound is safe.
- Test arithmetic: feel 12, gradeModel 8, particles 8, particleSources 10, lightsModel 6, interiorFeel 6, feelBoot 2, duelInterior +1, artGuards +21, for +74; 7 new test files take 237 to 244; the existing duelInterior tests (world at 66,152; no display-object growth over 60 frames) still hold with the pooled sprites made at the first draw.
- `.art/` is gitignored (.gitignore:L18); the Task 9 harness imports resolve from `.worktrees/art-i-b/.art/shots`; the cleanup filter `*art-i-b*shot.cjs*` matches the spawned Electron command line.

## Not verified
- Decision 1's Pixi 8.19 blend-mode claims (multiply and add mapped natively with no advanced-blend import; a 'normal' child escaping its parent's multiply; `Container.blendMode` reading 'inherit' by default): I could not check them because the review constraints forbid reading node_modules. They agree with my understanding of Pixi 8, and the plan reports prototype screenshots.
- My overlap finding (P1 #2) rests on Pixi 8 triangulating each rect primitive in a fill without a union. I did not confirm that in the Pixi source (node_modules is off limits).
- The baseline 3381/237, the prototype's 3455, and the golden/boundary count of 126: I did not run the suite, per the constraints.
- Whether `window` type-checks as `KeySource` and whether `npx tsc -b` passes as a whole: I did not run tsc; the plan reports it clean in the prototype.
- Whether a room's top-left floor tile (the lamp spot) collides with a console desk on the Cutter or the Skiff: I did not inspect the layouts tile by tile.
- The prototype screenshots: they were not available to me.

---

# Round 1 response (plan revised, prototype-verified: tsc clean, 3461 tests passed)

Reviewed `round-1.json` against the subject at `753bb0c`. 6 accepted, 0 rejected, 0 deferred. Every fix was re-run in a scratch worktree: `npx tsc -b` clean, `npm run build` ok, full suite 244 files and 3461 tests passed. The new debris and session tests fail without their fix and pass with it.

## R1-F1 [P1]: Debris never shows when a hit opens a breach

Confirmed. Plan L1758-1775 ran `onHit` (which starts the hitstop) before `clock.advance`, then consumed `breachSeen` while skipping the burst at pdt 0; sim/debris.ts:L103-117 opens the breach and stamps impactTick in one call. The burst now spawns regardless of pdt (plan L2016, Decision 11). New test (L1785): a hit on the opening frame, then at least DEBRIS_COUNT visible particles four frames later.

## R1-F2 [P1]: gradeCover returns overlapping rectangles

Confirmed against wallModel.ts:L18-35: the quarters overlap the halves, and the band crosses the floor parts. gradeCover now paints one art-pixel mask of the whole ship and emits non-overlapping merged row runs (L621, Decision 3). New test (L516), on the Cutter and the Skiff: no art pixel is covered twice, and the union is exact.

## R1-F3 [P2]: Stars mix pixel sizes in the sector

Confirmed. `stars(seed, band, t, artPx)` makes each star `artPx` square, snaps it to whole multiples of `artPx`, and drifts at 4 and 10 × `artPx` per second (L1652, Decision 14). The test runs at artPx 2, 4/3, 1.31 and 1. It is no longer a deviation.

## R1-F4 [P2]: Console desks and screens off the art-pixel grid

Confirmed (consoleModel.ts:L15 sets DESK_W 19 and SCREEN_D 3). New Task 5 sets DESK_W 20, DESK_D 10, SCREEN_D 2 and SCREEN_INSET 2, with a 2-wide outline drawn inside. An onGrid test covers every side and flush combination. The cursor test now uses exact bounds, with no +1 (Decision 19). The later tasks are renumbered 6-10.

## R1-F5 [P2]: InteriorFeel leaks shared GraphicsContexts

Confirmed (duelMode.ts:L80 rebuilds the interior on restart). `InteriorFeel.destroy()` (L2063) frees its Graphics and then the shared contexts, and interiorView.destroy calls it. The sector feel is built once; a layout change reuses its contexts. New test (L1809): switching layouts leaves exactly one set of glows, and destroy frees the contexts (Decision 18).

## R1-F6 [P3]: The presentation clock runs while paused

Confirmed (duelMode.ts:L84 freezes only the tactical fx). The duel now passes `runtime.paused() ? 0 : dt` as the presentation dt. The sector Renderer.draw gains an optional `paused` parameter, fed from the phase in session.ts and onlineSession.ts; only renderer-side signatures change, nothing in network, the sim or snapshots. New tests: interiorFeel freezes at dt 0, and session passes `paused` (Decision 17).

## Also changed

- Decisions, File Structure, the prototype table, expected counts (+80, 3461 tests in 244 files) and the self-review were updated to match.

## Files changed

- docs/superpowers/plans/2026-11-16-art-i-b-light-and-feel.md

<!-- end -->

---

# Round 2 (delta, reviewing 1fd401d, effort medium, 118 s, 902419 in / 808237 cached / 8769 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — plan L2016 now calls debrisBurst for every opened site whatever pdt is, and breachSeen is still updated each frame (L2015). debrisBurst calls e.spawn directly (L1262-1267), so it does not depend on the step rate. Debris uses blend 'normal' (L1266), so the new test at L1785-1793, which counts visible sprites in above.children[0], measures the right container. Without the fix, the venting stream and hit smoke over the few frames after the hitstop cannot reach 14 particles, so the test tells the two versions apart.
- R1-F2: resolved — gradeCover (L621-651) paints every floor/door tile and each wall's floor and band parts onto one art-pixel mask, then emits row runs. A run grows downward only when the row below has exactly the same start and end (key i*W+e, open/next maps), so no two output rects can overlap. All wallPicture offsets are even, so dividing by ART is exact. The duel flash at L1984 uses this same cover. The new test at L516-535 paints the cover onto cells and checks that each cell is painted exactly once and that the union equals the wall-picture parts, on both the Cutter and the Skiff.
- R1-F3: resolved — stars(seed, band, t, artPx) (L1652-1662) snaps x and y to whole multiples of artPx from the band's corner, sizes each star artPx, and moves the layers at speed*artPx with STAR_LAYERS speeds 4 and 10. The draw at L2051 uses frame.artPx for the size, and both views pass artPx = 2*fit.scale (L2535, duel at L2771). The test runs at artPx 2, 4/3, 1.31 and 1, and checks the movement against speed*artPx. Spec note 5 (L3034) has been updated to match.
- R1-F4: resolved — Task 5 (L1346-1483) matches the current consoleModel.ts:L15, L45 and L47 and consoleLayer's stroke, so the replace strings are exact. With WALL_GAP = 32-10-12 = 10, the new numbers put every rect on the grid: the desk at x 6, y -10, 20x10; the screen at 8,-8, 16x2; the outline's inner rect at 8,-8, 16x6. After the turn, south gives a desk at y 32 and a screen at y 38, and east gives a desk at x 32 and a screen at x 38, all even and with the screen inside the inner rect. The existing tests at consoleModel.test.ts:L31-37 still hold: (32-20)/2|0 = 6, the south desk ends at 42 = TILE_PX + WALL_GAP, and the west non-flush desk starts at x 0. No other file in src or tests references DESK_W, DESK_D or SCREEN_D (grep). The cursor (L1638-1642) is 4x2 or 2x4 inside a 16x2 screen, and its test now uses exact bounds (L1545-1551).
- R1-F5: resolved — InteriorFeel.destroy (L2063-2070) destroys each Graphics with no options, then coverCtx and the three glow contexts. interiorView.destroy calls fx.destroy() before container.destroy (L2776). duelMode's restart line (duelMode.ts:L80) is edited to pass renderer.feel (plan L2785), so it builds a fresh feel and destroys the old one. On a layout change, build() (L1969-1972) destroys the old glow Graphics and reuses the shared contexts, and the test at L1809-1819 checks this.
- R1-F6: resolved — Duel: plan L2800 passes runtime.paused() ? 0 : dt as presentDt, the same rule as stepFx at duelMode.ts:L84, while the tiles and boarders keep dt. Sector: the replace strings match session.ts:L26 and L109 and onlineSession.ts:L100. The `phase` variable exists at onlineSession.ts:L98, and OnlineRendererDeps picks SessionDeps['renderer'] (onlineSession.ts:L20), so editing the one type covers both sessions. The new session test uses APIs that exist: createSession, session.frame(), and pause()/resume() with their default reasons (session.ts:L172-175). clock.stopped is stop > 0 (L338), so a zero dt does not freeze animations, which matches Decision 17.

## Verified
- Decision 16's count adds up: 12+2+9+8+10+6+9+1+1+1+21 = 80, and the 7 new test files (feel, gradeModel, particles, particleSources, lightsModel, interiorFeel, feelBoot) take the suite from 237 to 244 files (plan L62, L2841).
- Task 5 Step 2's expected failure ([19,10,3,undefined] vs [20,10,2,2], and the n/true desk off the grid) matches the current consoleModel.ts:L15 and L45 values.
- strokeBand(r, width, alignment) in tests/helpers/artGrid.ts:L8-14 matches how Task 5 uses it; with alignment 1, outer equals the desk.
- The debris, paused and destroy tests in interiorFeel.test.ts (L1785-1819) import only exports that the plan defines: DEBRIS_COUNT (L1260), lampPoints, consoles and createSimState.
- The duelMode Step 4 edits (L2783-2811) match the current lines duelMode.ts:L80, L83, L87 and L97, and there are five as stated.
- No change touches the sim, network or snapshot code: Decision 17's new parameters are renderer-side only (session.ts and onlineSession.ts draw calls).

## Not verified
- That Pixi 8.19 GraphicsContext exposes `destroyed` and sets it in destroy(), and that Container.destroy removes the object from its parent. The destroy test at plan L1815-1818 depends on both. node_modules was out of bounds; the prototype report says this test passed.
- That gradeCover returns fewer rects than the Cutter's open tiles (`cover.length < open`, L514). This depends on how the merged wall runs come out; the prototype report says it passed.

---

# Round 2 response (no subject change)

Reviewed `round-2.json` against the subject at `1fd401d`. 0 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F6 as resolved, with no new findings. The first round-2 attempt failed (Claude exit 1 after 61 s, a usage limit); it is archived as `round-2.attempt-1.meta`.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

