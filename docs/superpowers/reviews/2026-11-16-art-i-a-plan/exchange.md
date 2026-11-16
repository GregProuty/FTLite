# Codex review exchange: art-i-a-plan

Subject: `docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 3b8069a, effort high, 553 s, 6189072 in / 6012026 cached / 44540 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The plan never states two of the spec deviations the planner reported: vent puffs stay rotated and the shake stays on whole internal pixels
Deviations (f) and (g) appear nowhere in the plan. No Decision mentions them, and a grep of the plan for 'rotat', 'shake' and 'deviat' finds only the bible line and the renderer note. The bible Task 1 writes says flatly 'No sprite is rotated' (plan L319), but effects.ts keeps `p.rotation = ventRotation(d, s)` on the vent.puff AnimatedSprite, and Task 5 Step 4 does not touch that line. The world also keeps moving by the existing shake, which is whole internal pixels (Math.round(sin·amp), amp 3-4). At stage 1.5 that shifts the world by fractions of an art pixel and half screen pixels, so x × stage stops being whole while the shake runs. · spec L22 ('No sprite is rotated or scaled except by whole numbers'); plan L319 (bible copies the rule); plan L44-63 (Decisions 1-17: no vent-rotation or shake decision); plan L1420-1456 (Task 5 Step 4 edits seven effects lines, not the rotation); src/renderer/src/render/effects.ts:L84 (`p.rotation = ventRotation(d, s)`); src/renderer/src/render/hazardTiles.ts:L49 (quarter turns); src/renderer/src/render/projectiles.ts:L126 (shake rounded to whole internal px); src/renderer/src/render/renderer.ts:L76 (world.position = fit.x + shake.x); spec L95-96 (Art-i-b replaces the shake with whole-art-pixel steps) · The spec is the contract, and the plan may only make deviations it states and justifies. As written, the committed bible contradicts the code it ships with, and the owner's crispness gate would see shake sub-pixel jitter and rotated puffs with no record that this was intended. · Add a Decision 18: (f) the existing sector shake is left as it is (whole internal pixels) until Art-i-b section 7 replaces it with whole-art-pixel steps; (g) vent.puff keeps its quarter-turn rotation (pixel-preserving, since 90° multiples keep the grid) until Art-i-b replaces it with particles. Reword the bible line at plan L319 to 'No sprite is rotated except by quarter turns (the vent puff, until Art-i-b)', or say there that the rule binds new art from Art-ii on.

### [P2] R1-F2 The bible drops the spec's 'dark' from the value hierarchy to fit the light placeholder floor
Spec section 1 says floors and walls are 'calm, dark mid-tones'. The bible Task 1 writes says 'calm mid-tones with low saturation' (no 'dark'), because the floor role is the light c7cfcc. Decision 1 justifies the colour as keeping today's look, but it never says the bible's value rule is weaker than the spec's. · spec L25; plan L338 (bible value hierarchy); plan L46-48 (Decision 1/2: floor c7cfcc chosen to match today's c9cdd6) · The bible is the section-1 deliverable that every later art change follows. Silently softening one of its rules means Art-ii would pick floors against the wrong rule. · Keep the spec wording ('calm, dark mid-tones') in the bible and add a sentence there and in Decision 1: 'The Art-i-a placeholder floor (c7cfcc) is lighter than this rule to keep today's look; Art-ii's pack palette brings floors down to dark mid-tones.'

### [P2] R1-F3 Step 0 skips the services/signalling node_modules junction and tells implementers the onlineAppRuntime failure is an environment flake
Step 0 runs only root `npm ci` in the new worktree, then labels the `tests/onlineAppRuntime.test.ts` failure as a loaded-machine timeout. In `.worktrees/` checkouts that failure comes from the missing services/signalling/node_modules (miniflare), and linking it makes the test pass. Step 0.3 also says '1 failed' while naming two failing files. · plan L104-109 (Step 0.1: no signalling junction or install); plan L121 (calls the failure environment-only and not a regression); tests/onlineAppRuntime.test.ts:L5 (imports scripts/network/online-app-runtime, which starts the local signalling runtime); the owner's recorded finding of 2026-11-16 (worktree-signalling-junction memory: 'Stop telling implementers that failure is an expected flake') · A known, fixable failure gets waved through as baseline noise twice (Step 0.3 and Task 7 Step 1). That hides a real regression in that test, and the baseline arithmetic is ambiguous. · In Step 0.1 add: `New-Item -ItemType Junction -Path .worktrees\art-i-a\services\signalling\node_modules -Target C:\Users\djuar\FTLite\services\signalling\node_modules` (or `npm --prefix services/signalling ci`). Remove both junctions before `git worktree remove`. In Step 0.3 expect a clean baseline (0 failed after Step 0.2 builds out/), and give the planning-machine numbers as 'N failed tests, M failed files'.

### [P3] R1-F4 The tileLayer rebuild assertion compares the live children array with itself
`const sprites = floorArt(layer).children as Sprite[]` keeps a reference to the container's live children array. Pixi 8's removeChildren splices that same array and addChild pushes into it, so after `layer.build(s)` the check `expect(floorArt(layer).children).toHaveLength(sprites.length)` compares the array's length with itself and always passes. `sp.texture.frame.width * 2 % 2` is also 0 for any integer width. · plan L1368 (sprites aliases children); plan L1374 (frame-width check that is always true); plan L1376-1377 (rebuild check); plan L1506 (build calls floorArt.removeChildren()) · The rebuild check would not catch floor sprites leaking or doubling on a rebuild, which is the risky part of the new floor-art container. · Record `const n = sprites.length;` before `layer.build(s)` and assert `floorArt(layer).children.length === n` afterwards (or copy with `[...children]`). Replace the frame check with `expect(sp.texture.frame.width * 2).toBeLessThanOrEqual(32)` plus a check that x and y fall inside the tile.

### [P3] R1-F5 No guard enforces 'pngjs and scripts/ never reach the renderer'
Global Constraint L21 and spec section 3 say pngjs is for scripts only and never imported by the renderer, but no test enforces it. artGuards checks only 0x literals and RNG imports, and boundary.test.ts walks only the deterministic roots. · plan L21; spec L42; plan L1326-1333 (artGuards RNG walk only); tests/boundary.test.ts:L12 (roots exclude render/ and app/) · A later edit that imports importCore.ts or pngjs from the renderer would build (pngjs is installed) and pull Node-only code into the renderer bundle with nothing failing. · In the artGuards walk loop also assert `moduleSpecifiers(source).filter((s) => s === 'pngjs' || /(^|\/)scripts\//.test(s))` is `[]`, and extend the walk to src/renderer/src/app.

## Verified
- Every worldFit/duelFit/createInteriorView caller is covered: renderer.ts:L71, interiorView.ts:L32,L49, duelMode.ts:L41,L80 (both exact strings `createInteriorView(renderer.assets)`), tests/layout.test.ts:L43,L46, tests/projectileModel.test.ts:L77, tests/duelInterior.test.ts:L38. No other caller in src/, tests/ or scripts/. The plan's replacement strings match the source text exactly.
- Adding `stageScale()` to `Renderer` breaks nothing: the only users of the type are duelMode.ts:L23 and flightMode.ts:L15. The test fakes (session/authority/onlineRenderer tests) use session.ts's own structural type, not `Renderer`.
- Recomputed the snapWorldScale table by hand for Cutter 608/928, starter 0.76 and fit 1 at stages 1, 1.5, 2, 2.5 and 3: it matches spec L49-54. worldFit(29,13,1) = {0.5, 328, 104}, Cutter at stage 1.5 gives x 256 and y 72, starter at stage 1 gives x 256 and y 62, Skiff gives {1, 272, 64} at every stage, duelFit(29,13,1) = {1, 66, 152}.
- Door model sweep: panelWidth gives [0, 0.1, 0.13, 0.5, 0.94, 0.95, 1] → [16, 14, 14, 8, 0, 0, 0]; jambs {0,8,2,16}, ticks {2|28,8,2,16}, bar {10,14,12,4} and seam {16,10,2,12} are all even; stripes stay inside the panels; an alignment-1 stroke of width 2 on even panels gives even bands.
- Wall light and shadow expectations for the straight wall, the isolated hub and the cross match the plan's hRow/vCol code (LO 10, HI 22, EDGE 2). Every edge segment lies inside a band rectangle.
- consoleModel.WALL_GAP = T − BAND − PANEL_THICK (consoleModel.ts:L17), and tests/consoleModel.test.ts:L31-36 derive their numbers from WALL_GAP, so 11 → 10 needs no test edit. DESK_OUTLINE 0x1b1b1b (L18) is not a door constant and is unaffected.
- The removed doorModel constants have no other importers: DOOR_FILL/DOOR_OUTLINE only enemyWindow.ts:L13,L90 (both handled; the sed address `/ENEMY_LAYOUT.doors/` hits L90 only), HELD_TICK/SPACE_GAP only tiles.ts:L9,L40,L47 (handled), FLOOR/WALL from tiles.ts have no importers.
- effects.ts 0x literals are exactly L13, L15, L70, L79, L94, L103 and L116, and Task 5 Step 4 replaces each one, so the four-file grep test (scoped exactly to tiles.ts, doorModel.ts, wallModel.ts and effects.ts, plan L1300) can pass. LOW_O2_COLOR and IMPACT_COLOR have no importers outside effects.ts.
- Palette: 46 distinct colours; all 27 roles match spec L60 in name and order; every role and ramp colour (fire 8, plasma 7, electric 5, vent 5) is a member of `colours`, including lowO2, impact, doorSealed, heldTick, spaceGap, fireFallback, breach, airlockOutline, ventSpeck and failed.
- tsconfig.web.json includes src/renderer/src/**/*.json, tests/**/* and scripts/**/* with resolveJsonModule. The palette.json import works from the renderer, tests and scripts/art/importCore.ts, and the plan correctly reads art/import.json with readFileSync (it is not in the include list).
- boundary.test.ts roots (src/shared, sim, authority, net, clientControl, headless, events) import nothing from render/, so palette.ts, effectsShapes.ts and importCore.ts never enter the deterministic graph. The render folder has 58 .ts files today, plus palette.ts and effectsShapes.ts = 60, which matches the 67 artGuards tests.
- Manifest rules: the zod array superRefine still runs after element custom issues (dirty, not aborted), and the neither-or-both guard keeps `boundNames` away from `sheet!` on a broken entry. The paidManifest expectations (regex message 'raw/, art/ or paid/', the four paid rules, the duplicate-name message, the notice header and licence line) follow from the plan's code. The existing manifest.test cases (L57-62) keep passing.
- assets.ts:L67-69 already treats a failed required:false entry as a warning, so a missing paid/ file falls back as spec L34 requires; featureReady/FEATURE_NAMES (fallback.ts:L6-20) and the assetNames `add('required', 'floor.0'...` anchor line (assetNames.ts:L10) exist as the plan assumes.
- artImport expectations check out by hand: OKLab picks for (250,10,10), (30,30,30) and (220,220,220); alphas [0,127,128,255] → [0,0,255,255]; the 32×16 sheet gives a 64×32 contact sheet with background at (0,0); a 16×16 packed sheet; problem order and texts; the zod first issue at outputs.0.frames.
- Test counts: worldFit 3→12 (+9), doorModel 7→8 (+1), wallModel 4→10 (+6), plus palette 5, paidManifest 11, tileLayer 2, artGuards 67 and artImport 10 = +111, consistent with prototype 3183 → 3294.
- Task order: Task 3 consumes ROLE (Task 1); Task 5 consumes Tasks 1, 3 and 4; Task 6 consumes Task 1; Task 4 stands alone. No task uses something a later task produces, and tiles.ts stays compiling after Task 3's stopgap edits.
- Deviation (a), exit 1 with no source folder even on an empty list, is stated (Decision 14) and follows spec L39 literally; acceptable for a manual tool. (b) the hard-coded owner folder is required by spec L38. (c) the floor seam and (d) floor art on wall-tile floor parts are stated in Decisions 9 and 10. (e) enemyWindow's door colour shift is implied by Decisions 2 and 12. The stage-change-only projectile reset is stated and justified in Decision 5.
- Task 7 harness signatures exist: createSimState(layout, playerCount, seed, characters = default) at sim/state.ts:L106, createDuel(layout, seed) at sim/duel/state.ts:L42, loadAssets(manifestUrl) resolving files relative to the manifest at assets.ts:L50-62. The only build-time global used on the renderer path is __GAMEPLAY_CONTENT_DIGEST__ (defined by the harness config); 1920×1080 and 2560×1440 give letterbox stages 1.5 and 2 (tests/render.test.ts:L14-15).

## Not verified
- That the Apollo hex list matches lospec.com/palette-list/apollo: no network access, read-only review.
- That @types/pngjs@6.0.5 and pngjs@7.0.0 resolve on the npm registry and that @types/pngjs accepts `{ colorType: 6, inputColorType: 6, bitDepth: 8 }`: node_modules was off limits and nothing was installed.
- Pixi 8.19 runtime behaviour in Node for `new TextureSource({ width, height })` in tests/tileLayer.test.ts, and that removeChildren mutates the children array in place (the P3 is based on Pixi 8's documented removeItems behaviour; node_modules was not read).
- That Task 7's Electron/CDP harness runs as written (Vite 7 bundled-config `import.meta.dirname`, Electron loading a .cjs entry, Emulation.setDeviceMetricsOverride on a 1280×720 window); I relied on the plan's prototype claim and did not run it.
- That `npm run credits` prints exactly '3678 chars ... 10 lines': scripts/gen-credits.ts was not run.
- That tests/onlineAppRuntime.test.ts reaches services/signalling through scripts/network/online-app-runtime; inferred from the owner's recorded 2026-11-16 finding, not traced through that script.
- That the hudLayout `inside` used by tests/layout.test.ts tolerates the floating-point widths at every stage (for example 800 × 0.76); the prototype reports 7 passed.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `3b8069a`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Two reported deviations are not stated in the plan

Confirmed. effects.ts:L84 keeps `p.rotation = ventRotation(d, s)`, projectiles.ts:L126 rounds the shake to whole internal pixels, and no Decision mentioned either. Decision 18 now states (f), the shake, and (g), the vent puff's quarter-turn rotation, as left for Art-i-b. The bible's pixel rule now allows quarter turns and names the vent puff.

## R1-F2 [P2]: The bible drops "dark" from the value hierarchy

Confirmed (spec L25 against plan L338). The bible keeps "calm, dark mid-tones" and notes that the placeholder floor is lighter on purpose. Decision 19 records the same.

## R1-F3 [P2]: Step 0 skips the signalling junction and calls the failure a flake

Confirmed against the recorded finding (memory worktree-signalling-junction, 2026-11-16): `.worktrees/` checkouts lack services/signalling/node_modules. Step 0.1 now creates that junction and says to remove it before `git worktree remove`. Step 0.3 and Task 7 now expect 0 failures and say to stop on any. The "1 failed" and "2 files" counts are reconciled.

## R1-F4 [P3]: The tileLayer rebuild assertion compares the array with itself

Confirmed: plan L1368 kept the live `children` array. The test now copies it and records `n` before `layer.build`. The always-true frame check is replaced by a ≤ 32 check on the width and height.

## R1-F5 [P3]: No guard enforces that pngjs and scripts/ never reach the renderer

Confirmed: artGuards walked only the RNG imports. A new describe block checks every `.ts` file under render/ and app/ for `pngjs` or `scripts/` imports. The Task 5, Task 7 and prototype-table counts are updated to +190; the new guard is marked as not prototype-run.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md

<!-- end -->

---

