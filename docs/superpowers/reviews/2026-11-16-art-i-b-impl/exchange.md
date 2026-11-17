# Codex review exchange: art-i-b-impl

Subject: `src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/feelBoot.ts src/renderer/src/app/onlineSession.ts src/renderer/src/app/session.ts src/renderer/src/main.ts src/renderer/src/render/consoleLayer.ts src/renderer/src/render/consoleModel.ts src/renderer/src/render/crewSprites.ts src/renderer/src/render/duel/interiorView.ts src/renderer/src/render/effects.ts src/renderer/src/render/feel.ts src/renderer/src/render/gradeModel.ts src/renderer/src/render/impactModel.ts src/renderer/src/render/interiorFeel.ts src/renderer/src/render/lightsModel.ts src/renderer/src/render/memory.ts src/renderer/src/render/particles/emitter.ts src/renderer/src/render/particles/particleLayer.ts src/renderer/src/render/particles/random.ts src/renderer/src/render/particles/sources.ts src/renderer/src/render/presentClock.ts src/renderer/src/render/projectileModel.ts src/renderer/src/render/projectiles.ts src/renderer/src/render/renderer.ts tests/consoleModel.test.ts tests/duelInterior.test.ts tests/feel.test.ts tests/feelBoot.test.ts tests/gradeModel.test.ts tests/interiorFeel.test.ts tests/lightsModel.test.ts tests/particleSources.test.ts tests/particles.test.ts tests/projectileModel.test.ts tests/session.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 526ebb7, effort high, 321 s, 3068849 in / 2921574 cached / 28732 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The white flash stays on for good when the sim tick stops (duel loss by a hit, a pause, sector game over)
The flash is timed only by sim ticks counted from the tick the hit was seen. If the tick stops advancing within 2 ticks of the hit, `state.tick - flashTick` stays at 0 or 1 and the flash never turns off. In the duel this happens on every loss to a hit while the interior view is showing: the killing hit's `hitsCrew` event is drained on the frame after the last tick, stepping then stops, and the whole interior stays under the white flash (0.85 × 0.5) behind the end screen's translucent backdrop until Enter restarts. The same happens if the duel or the sector is paused (Esc or window blur) within 33 ms of a hit, and on the sector's last frame when a hit ends the run. · interiorFeel.ts diff L933 `flashTick = state.tick` and L1000-1001 `flashAlpha(state.tick - flashTick, …)`; impactModel.ts diff L791-792 (the tick count is the only bound). app/duel/runtime.ts:217 `if (ended()) return;` stops stepping, and sim/duel/step.ts:126 `st.tick++` is the only place d.interior.tick moves. sim/tactical/duel.ts:38 sets EnemyWins when the crew ship goes down; render/tactical/fxModel.ts:35-36 `hitsCrew` matches that hit. duelMode.ts diff L44 passes the drained events into interior.draw. render/duel/endScreen.ts:29 draws the backdrop at `BACKDROP_ALPHA * 0.6`, so the interior shows through. The sector session freezes the tick while paused (session.ts diff L143). tests/interiorFeel.test.ts diff L2257-2260 tests the flash only with the tick advancing. · Spec section 7 promises a 33 ms flash. In ordinary play (losing a duel while walking the interior, or alt-tabbing during combat) the interior instead stays washed out for the rest of the end screen or the pause. This is the look-and-feel check the owner will see. · Bound the flash by real time as well. On a hit, set `flashLeft = FLASH_TICKS / TICK_HZ` and decrease it by the real frame dt (add `realDt` to FeelFrame: the renderer's `dt`, and the duel's `dt` rather than `presentDt`). Show the flash only while `ticksSince < FLASH_TICKS && flashLeft > 0`. A hitstop still does not extend it. Add an interiorFeel test that holds `state.tick` fixed for 10 frames after a hit and expects the flash to be hidden.

### [P3] R1-F2 A pause freezes the shake offset (and any running hitstop) on screen
While paused the views pass a presentation dt of 0, so `stepShake` does not advance and `shakeOffset` keeps returning the last non-zero offset. The world (and in the sector, the projectiles and callouts) sits up to 6 art pixels off-centre for the whole pause. If a hitstop was running when the pause began, `clock.stopped` also stays true, so fire and arc animations stay frozen during the pause, against Decision 17's 'AnimatedSprites keep playing while paused'. · renderer.ts diff L1813-1814 (`paused ? 0 : dt`, then `world.position.set(fit.x + shake.x, …)`); interiorView.ts diff L467-468; impactModel.ts diff L777-787 (stepShake holds at pdt 0, shakeOffset non-zero while left > 0); presentClock.ts diff L1564-1566 (`advance(0)` leaves `stop` untouched); plan L61 (Decision 17). The old sector shake decayed on the real dt (projectiles.ts diff L1694-1698). Task 8's review noted this. · Cosmetic: a paused ship drawn slightly off-centre, and fire that stops flickering only when a pause lands inside a 60 ms hitstop. It is not blocking, but it is a small change from today's pause behaviour. · Pass a separate paused flag (or the real dt) into InteriorFeel.draw. While paused, either return a {0,0} shake or step the shake and the hitstop's remaining stop by the real dt, leaving the rest of the presentation clock held.

### [P3] R1-F3 Per-frame rebuilds and allocations in interiorFeel
Every frame, the composite clears and refills the starfield Graphics (68 rects), the vacuum Graphics and the fixtures Graphics. It also rebuilds every particle Source with fresh closures and key strings, spreads them into a new array, calls `consoles(state)` again (consoleLayer already calls it each frame), allocates the 68-object `stars` array and the `burning` array (with an O(n²) `includes`), and the sector side allocates `Int32Array.from` and `Uint8Array.from` for sectorHits and breachOpenings. · interiorFeel.ts diff L965-966, L973, L977-978, L990-992, L1004-1005; lightsModel.ts diff L1107-1116; impactModel.ts diff L802; sources.ts diff L1488; renderer.ts diff L1811 and L1813. · Small at today's ship sizes (the plan's 600-sprite preallocation already holds the display tree steady), but this is avoidable GC and geometry churn at 60 fps on top of the existing layers. · Later: cache stars per t-quantum or move them as sprites, reuse source objects keyed by tile, pass the consoles list from the view, and keep seen buffers that are reused rather than reallocated. Not needed before merge.

## Verified
- Determinism boundary: the diff's file list (diff headers L1-L2654) touches no file under src/renderer/src/sim, authority, src/network or src/shared. The particle generator is mulberry32 seeded from hashString(layoutHash) (random.ts diff L1279-1314; interiorFeel.ts diff L918), never the sim RNG, and tests/artGuards.test.ts:39-43 walks every render .ts file, new ones included. interactTarget (sim/interact.ts:39-69), sampleRepair and every adapter only read state. The presentation clock and hitstop feed only the feel (presentClock.ts; interiorFeel.ts diff L959); tiles.update, boarders and projectiles keep the real dt (renderer.ts diff L1803-1804; interiorView.ts diff L450, L470).
- Sector addChild order matches spec L67 exactly: tiles, grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights (renderer.ts diff L1771). fixtures goes inside the desks and the particles/flash inside effects.above (L1772), and the starfield is at stage index 0 (L1773), as plan Decision 2 says.
- Duel order matches spec L68: tiles, grade, effects.below, icons, desks, damage, crew, boarders, effects.above, lights, marks, labels (interiorView.ts diff L440). The starfield sits under the world in interior.container (L425). The test pins the grade at index 1, the lights at 9 and the 4 text/mark children above (duelInterior.test.ts diff L1902-1917).
- The grade never reaches crew, consoles or hazards: it is the child right above tiles, and the vacuum tint (normal blend) sits where the old o2Layer was, under fire and breach decals (effects.ts diff L510-513 removed vs interiorFeel.ts diff L897-900). The duel damage tint stays above the grade. Repair labels and markers stay above the lights.
- Every removed effect has its replacement: the old projectile shake → sector shake via sectorHits, moving the world, projectiles and callouts (projectiles.ts diff L1694-1698 removed; renderer.ts diff L1811-1817). The red impactLayer → white flash on the hit room's tiles in effects.above (effects.ts diff L536-543 removed; interiorFeel.ts diff L942-949). The red low-O2 tint → vacuum role at the same threshold and strength (gradeModel.ts diff L650, L669). Vent puffs → venting stream plus opening debris (effects.ts diff L570-577 removed; sources.ts diff L1456-1501). The duel interior's fx shake is zeroed only while view is 'interior', so Helm and Weapons keep shakeOffset(fx) (duelMode.ts diff L55).
- No double count or lost hit in the duel: drainEvents is called once per frame and the same array goes to pushEvents and interior.draw (duelMode.ts diff L38-44). The interior world shakes and the scene does not while the interior shows. The sector shake no longer comes from projectiles.ts (ProjectileLayer.draw returns void, diff L1618).
- Sector reset: Renderer.reset clears seenImpact and calls feel.reset(), which resets the clock, shake, emitter, smokes, breachSeen, vent puffs and flash and releases a held hitstop (renderer.ts diff L1788; interiorFeel.ts diff L1012-1016). onlineSession.ts:81 and session.ts:72 call renderer.reset on a new run or attach. sectorHits ignores the first frame and length mismatches (impactModel.ts diff L801-807).
- Duel restart and lifetime: the old interior is destroyed (fx.destroy first, then container.destroy({children:true}), which does not destroy Texture.WHITE) and a new one is built with renderer.feel (interiorView.ts diff L473; duelMode.ts diff L34). On a layout change, build() destroys and rebuilds the glows, clears the cover context, resets the vent puffs (Task 4's minor), recreates the emitter and resets smokes (interiorFeel.ts diff L916-928). The test covers the layout round trip and destroy (interiorFeel.test.ts diff L2313-2323).
- Paused presentation is wired as Decision 17 says: session.ts passes `phase === 'paused'` with undefined presentation (diff L143), onlineSession.ts passes its own phase (diff L101), OnlineRendererDeps picks SessionDeps.renderer so the type follows (onlineSession.ts:20), duelMode passes `runtime.paused() ? 0 : dt` (diff L44), and session.test.ts diff L2667-2682 checks the flag.
- Feel setting: key 'ftlite-feel' with full/reduced/off, feelScale 1/1/1, 0.5/0.5/1, 0/0/0, loadFeel and saveFeel in try/catch around both the getter and the call (feel.ts diff L595-631). installFeel reads it once and adds the F9 listener only when dev, saving on change (feelBoot.ts diff L77-86). bootFeel uses import.meta.env.DEV right after each of the three createRenderer calls (main.ts diff L181-184, L192, L210, L221). Tests: feelBoot.test.ts diff L2063-2083.
- Hit timings: the shake is 6 art px decaying linearly over 0.25 s in whole art pixels × artPx = 2 × fit.scale (impactModel.ts diff L760-788). The hitstop is 0.06 s × feel, applied before advance so the hit frame's pdt is 0 (interiorFeel.ts diff L933, L958-959). The opening debris is spawned even at pdt 0 (L970). Smoke lasts 3 s per hit room in the sector, or on one floor tile picked by emitter.random in the duel (L940, L946).
- Grade cover: gradeCover paints onto an art-pixel mask and returns non-overlapping row runs, rebuilt only in build() on a layout change (gradeModel.ts diff L703-733; interiorFeel.ts diff L919-920). The test checks no cell is covered twice and the union is unchanged on the Cutter and the Skiff (gradeModel.test.ts diff L2163-2182).
- Performance: the 600 particle Sprites are created up front in particleLayer.ts (diff L1252), and 120 calm frames add no display objects (interiorFeel.test.ts diff L2227-2235).
- Console desks are on the art-pixel grid: DESK_W 20, DESK_D 10, SCREEN_D 2, inset 2, outline 2 drawn inside (consoleModel.ts diff L276, L294-298; consoleLayer.ts diff L254), tested for every side and flush case (consoleModel.test.ts diff L1850-1862).
- The space cell is not painted by tiles.ts (tiles.ts:50 `if (c === 'space') continue`), so the starfield shows outside the cover as spec section 8 intends. The duel interior SimState tick advances in stepDuelTick (sim/duel/step.ts:126), so the duel flash's tick count runs during normal play.
- Dead code: hazardTiles.ventRotation is kept on purpose (plan L56, Decision 12: still tested in renderPure). The palette roles lowO2 and impact are unread but harmless and listed in spec L60's role set. Remove both with Art-ii's palette swap, not now.
- Triage of the task minors (progress.md L286-294): none must be fixed before merge. The Task 7 'CHECK IN TASK 8' items are verified above (seenImpact is cleared in reset, and feel.reset runs on a same-layout new run). The Task 4 vent next[] reset is verified (build sets puffs = []). The Task 8 'shake holds during pause' is finding 2 (P3). The rest (cellAt duplicated, the HIT_FRESH_TICKS boundary test, life<=0 NaN, shift() at the cap, hash-key overlap, the -1 sentinel, reset() untested, per-frame allocations) are P3 nits or covered by finding 3.

## Not verified
- `tsc --noEmit` and lint: this session has no shell tool, only Read, Grep and Glob, so I could not run them. The Task 10 report in progress.md L295 says tsc and the build passed with 3461/3461 tests; that is not checked independently here.
- The visual result (multiply and add blending inside the world render group, how strong the alert pulse looks, how the vacuum stacks with the duel damage tint): checking needs screenshots or a running app. Task 10 reports shots in C:\Users\djuar\FTLite-shots\art-i-b, which I did not open.
- Whether every sector projectile hit that used to shake (shots and asteroids) stamps rooms.impactTick in the online client's replicated state. The new shake reads only impactTick; the old projectile 'hit' outcome read the same field (projectiles.ts outcomeOf), so they should match, but I did not trace the network snapshot fields.
- Whether the sector session keeps calling renderer.draw in the gameover phase. That decides whether finding 1's frozen-tick flash also shows at sector game over (the old red flash already lingered there).

---

# Round 1 response (fixes in 5b3c1ff)

Reviewed `round-1.json` against the branch at `526ebb7`. 2 accepted, 0 rejected, 1 deferred. `npx tsc -b` is clean and the full suite passes (3463 tests, 244 files).

## R1-F1 [P1]: The white flash stays on when the sim tick stops

Confirmed: interiorFeel.ts bounded the flash only by `state.tick - flashTick`, and app/duel/runtime.ts stops stepping once the duel has ended. In 5b3c1ff, `interiorFeel.draw(frame, dt, realDt)` sets `flashLeft = FLASH_TICKS / TICK_HZ` on a hit and drains it by the real dt, and the flash shows only while both `ticksSince < FLASH_TICKS` and `flashLeft > 0`. The hitstop still does not extend it. renderer.ts and duel/interiorView.ts pass the real dt. New test: the tick is held for 10 frames after a hit and the flash is hidden. The existing advancing-tick flash test still passes.

## R1-F2 [P3]: A pause freezes the shake offset and any running hitstop

Confirmed against impactModel.ts stepShake and presentClock.advance(0). While paused (presentation dt 0, real dt > 0) the shake offset is now {0,0} and drains on real time. A new `PresentClock.drain(seconds)` ends a running hitstop on real time without advancing `t`, so AnimatedSprites resume as Decision 17 says. New test.

## R1-F3 [P3]: Per-frame rebuilds and allocations in interiorFeel

Deferred, as the reviewer suggested ("not needed before merge"). The sizes are small: about 68 stars, a handful of sources and a few room tiles. Caching the stars, reusing the source objects and keeping the seen buffers are a performance follow-up.

## Also changed

- (nothing)

## Files changed

- src/renderer/src/render/interiorFeel.ts
- src/renderer/src/render/presentClock.ts
- src/renderer/src/render/renderer.ts
- src/renderer/src/render/duel/interiorView.ts
- tests/interiorFeel.test.ts

<!-- end -->

---

# Round 2 (delta, reviewing ebedf5c, effort medium, 29 s, 70653 in / 50889 cached / 2823 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — interiorFeel.ts now sets flashLeft = FLASH_TICKS / TICK_HZ in onHit and drains it by realDt every frame. The flash shows only while flashLeft > 0 and flashAlpha(ticksSince) > 0, so it ends on real time even when state.tick stops. In the ended duel, duelMode.ts:88 passes dt as both presentDt and realDt, so it drains. While paused, realDt = dt also drains it. The sector renderer passes the real dt (renderer.ts diff). build() and reset() clear flashLeft. A hitstop does not extend it, because flashLeft drains on realDt and not pdt. The new test holds state.tick at 10 and expects the flash hidden. At 1/60 frames, 1/30 - 2×(1/60) comes out to exactly 0, so no stray third frame is lit.
- R1-F2: resolved — paused = dt === 0 && realDt > 0. While paused, clock.advance(0) leaves t held, clock.drain(realDt) (presentClock.ts:31) ends a running hitstop, and the wasStopped check runs after the drain, so freezeAnimations releases the sprites. stepShake drains on realDt and the returned offset is {0,0}. duelMode.ts:88 passes 0 or dt as presentDt and dt as realDt, and the sector renderer passes paused ? 0 : dt plus dt. The new test runs 4 paused frames of 1/60 s. That covers the 0.0433 s of hitstop left after the hit frame, and the test checks that time() is held and anim.playing is true.

## Verified
- interiorFeel.ts draw(frame, dt, realDt = dt): the default keeps the existing two-argument calls and tests working as before
- duelMode.ts:88 passes the real dt to interior.draw. interiorView.ts:82 forwards presentDt as the presentation dt and dt as realDt
- presentClock.ts:24-33: drain lowers only stop and never advances t; advance and hitstop are unchanged
- impactModel.ts:7,39-42: FLASH_TICKS = 2. flashAlpha still bounds the flash by ticks, so with the sim ticking normally the flash still lasts 2 ticks
- impactModel.ts:26-37: stepShake on realDt during a pause fully drains a 0.25 s shake, so play resumes with no stale offset
- build() and reset() both clear flashLeft (interiorFeel diff), so a layout change or a restart cannot carry a lit flash over
- Per-task minor notes (progress.md): none is reopened by this delta. R1-F3 (per-frame allocations) stays deferred and is not blocking

## Not verified
- I did not run the test suite or tsc (the constraints forbid it). The responder reports 3463 tests passing and tsc -b clean
- No visual check of the running app (the flash and shake across pause and resume)

---

# Round 2 response (no subject change)

Reviewed `round-2.json` against the branch at `ebedf5c`. 0 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 and R1-F2 as resolved, with no new findings. R1-F3 stays deferred as a performance follow-up.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

