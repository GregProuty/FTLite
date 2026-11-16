# Codex review exchange: art-i-spec

Subject: `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing fe61b3f, effort high, 420 s, 1785565 in / 1706496 cached / 33092 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The duel interior has no fire, oxygen or room-impact signal, so the grade, the hit flash and the vacuum screenshot cannot work there
Sections 5 and 7 assume the duel has the same hull, fire, low-oxygen and room-impact signals as the sector. It does not. d.interior never runs the fire, oxygen or debris systems, and rooms.impactTick is written only by the sector debris code. The duel's hit signal is a ViewEvent with no target room, and its hull lives on the tactical state. So in the duel, alert can only come from hull, vacuum can never happen, 'a white flash on the hit room' has no room to flash, fire lights and embers never appear, and the acceptance screenshot 'duel interior in ... vacuum' cannot be taken without changing sim state. · spec L49-52, L64, L74; sim/duel/step.ts:L1-2 (the sector step never runs on the interior; only sit, stand, repair and movement), L124; sim/duel/state.ts:L1-2; sim/debris.ts:L117 (the only writer of rooms.impactTick); render/tactical/fxModel.ts:L32-37 (hitsCrew; laser events carry no target), L45; sim/tactical/state.ts:L41, L116 (hull, max from the class) · An implementer writing the 'one adapter per mode' has nothing to read for fire, oxygen or the hit room in the duel, so each would invent something different. The stated screenshot gate is impossible. · Name the duel adapter exactly. hull fraction = d.tactical.systems[CREW_SLOT].hull / that class's starting hull. Fire and vacuum are always off in the duel; say so. A hit = hitsCrew(e) over the tick's ViewEvents (the same feed pushEvents gets). The hit room = the repair room (d.points) of the tactical room whose level rose this tick; if no level rose, flash every interior room. Change the screenshot list to duel normal and alert, and sector vacuum.

### [P1] R1-F2 Impact feel does not say whether it replaces or adds to the three existing shake and flash paths
Section 7 specifies a 6 art-pixel shake (0.25 s) and a 2-frame white flash. The code already has a sector shake (3 or 4 internal px over 0.25 s, applied to the world and the projectiles container), a sector red impact flash (18 ticks), and a duel shake (6 px over 0.2 s, applied to the whole duel scene including the readout column and tactical view). The spec does not say whether these are replaced, kept or stacked. It also does not say which container the new shake moves. '2-frame' counts render frames, which depends on the refresh rate (14 ms at 144 Hz), and it is unclear whether those frames count during the 60 ms hitstop. · spec L64; render/projectileModel.ts:L9; render/projectiles.ts:L96, L122-126; render/renderer.ts:L76; render/effects.ts:L15, L47-54; render/tactical/fxModel.ts:L14, L45, L56-60; app/duel/duelMode.ts:L91-92 · Two implementers would build different results: double shake, a red-then-white flash, or a shake that also moves the readout panel. 'off removes shake' is undefined if the old shakes survive. · State that the new shake replaces SHAKE_* in projectiles.ts and the duel fxModel shake. Give its target: sector = world plus projectiles container (as today); duel = interior.world only, not the readout. State that the white flash replaces the red impactLayer flash. Define the flash as 2 sim ticks (or 33 ms), not render frames, and say that hitstop does not extend it.

### [P1] R1-F3 The `feel` setting has nowhere to live and no way to change it
The spec adds a `feel` setting (full, reduced, off), but the renderer has no settings store. Menus and the HUD are non-goals, so there is no UI to change it. The spec gives no storage key, default, boot-time read, or test hook. · spec L13, L64; src/renderer/src/main.ts:L55-58 (the only localStorage uses: crash, telemetry, progress); no settings module under src/renderer/src · Implementers would each invent storage and a toggle, or skip it. The 'reduced halves, off removes' rule cannot be checked in the build. · Specify a localStorage key (for example 'ftlite-feel'), default 'full', read once at boot with a try/catch like main.ts L55-58, and a pure feelScale(setting) that unit tests cover. State that there is no menu UI in Art-i (a settings-screen entry is a follow-up), or name the dev key that cycles it.

### [P1] R1-F4 snapWorldScale: the Cutter outcomes are misstated, the ship is not re-centred, and callouts and projectiles still read the unsnapped fit
(a) The Cutter's fit 0.655 snaps to 0.5 at stage 1 (2·0.5·1 = 1, and 0.5 ≥ 0.75·0.655 = 0.491), so it is crisp at stage 1, which the spec does not say, but 24% smaller. At stage 1.5 it keeps fit (not crisp). At 2.5 it is 0.6. The spec says only 'crisp at stage 2 and above'. (b) Below stage 1, which letterbox.ts says is the normal minimum window, 2·fit·stage can be below 1; 'the largest worldScale ≤ fit that makes it whole' is then 0. (c) worldFit centres x,y for fit.scale, so swapping only the scale puts the ship off-centre. (d) callouts, projectile room centres and shot origins take `fit`, and projectile paths are cached at spawn, so a resize that changes the snap leaves shots in flight aimed at stale points. (e) 'World position rounds to whole screen pixels' needs round(x·stage)/stage, because world.position is in internal pixels under a 1.5 stage scale. · spec L40; render/letterbox.ts:L3-5; render/worldFit.ts:L10-11; render/renderer.ts:L71, L75-76, L84; render/calloutModel.ts:L48; render/projectileModel.ts:L72; render/projectiles.ts:L58, L87; render/duel/interiorView.ts:L49-50 · The unit test the spec asks for ('each stage scale, each ship') has no agreed expected values. A literal build shifts the ship and misplaces callouts and enemy-shot targets in ordinary sector play. · Define snapWorldScale(fit, stage) → n = floor(2·fit·stage); if n ≥ 1 and n/(2·stage) ≥ 0.75·fit, scale = n/(2·stage), else scale = fit. Have worldFit and duelFit take the stage scale and return the snapped {scale, x, y}, re-centred in the band, with x,y rounded so x·stage is whole. Pass that same object to callouts.draw and projectiles.draw. Put the expected table in the spec: Skiff and duel 1 at stages 1, 1.5, 2, 2.5, 3; Cutter 0.5, 0.655 (kept), 0.5, 0.6, 0.5. Note the 24% Cutter shrink at stage 1 as accepted, or change the 0.75 rule.

### [P1] R1-F5 The procedural walls and doors are off the art-pixel grid, so 'one pixel size' and 'crisp' are false for them
Walls and door panels are 11 world units thick at offset 10, which is 5.5 art pixels. Jambs start at BAND-3, the seal bar is 3 units high, held ticks are 3 wide, the door outline stroke is 1 world unit (half an art pixel), and vent specks are 4x4 at fractional centres. When the Cutter snaps to 1 screen px per art pixel, the 11-unit band renders 5.5 px and rounds unevenly. Section 4 also writes '1 px' light and shadow edges without saying whether that is a world pixel or an art pixel. · spec L9, L18, L41; render/doorModel.ts:L8, L29-33; render/wallModel.ts:L26; render/tiles.ts:L43; render/effects.ts:L102-103 · The headline goal (one pixel size) is not met by the layers this spec recolours, and implementers would pick different units for the new edges. · State that procedural geometry uses whole art pixels (2 world units): PANEL_THICK 10 or 12 with BAND to match, jamb, tick, bar and stroke sizes even, and the '1 px' edges = 1 art pixel = 2 world units. Add a unit test that every wallPicture and doorPicture rect has even x, y, w and h.

### [P1] R1-F6 No signal exists for 'a crew member repairing or fighting fire', or for 'sector systems below full'
SimState has no per-crew working flag. The sector's repair progress is stored per target (fire, breach, station), and whether a player is holding Interact is not in state; interactTarget only says what a crew member would act on. 'Fighting fire' in the sector is the same Repair-fire interaction. The sector has no system health: stations.level is the power allocation, and failed is a binary flag that the fx.arc already shows. The duel has per-player repairWork events, but they are cleared every tick, and the duel has no fire. · spec L59-60; src/renderer/src/sim/components.ts (Position, Health, Life, Stable, Owner, Seated only); render/hudModel.ts:L226-231; sim/interact.ts:L149-161; sim/state.ts:L43; sim/duel/state.ts:L15-20; render/effects.ts:L106-117 · Implementers would each invent a heuristic, or reach for input state the renderer does not have in the sector. · Define the derivations. Sector working = conscious, unseated, interactTarget(state,pid).kind in {Fire, Breach, Power}, and that target's progress rose since the last tick (kept in RenderMemory); foam when the kind is Fire, sparks otherwise. Duel working = a repairWork event for that player in d.events of the latest tick. Sector damaged system = stations.failed[i] === 1, and say whether sparks add to or replace the fx.arc.

### [P1] R1-F7 The paid licence class does not fit the manifest schema, the notices or the fallback as described
(a) The file regex accepts only raw/ or art/, so paid/ files fail to parse. (b) LICENSE_URLS is a Record over every licence except 'original', so adding 'paid' forces a URL entry. buildNotices prints LICENSE_URLS[lic] in the heading and the Licence line, which would read 'paid (undefined)'. (c) The spec does not say whether 'required: false' and 'source is the store URL' are enforced in superRefine. (d) 'Falls back exactly as optional art does today (featureReady)' only works for names registered as optional in ASSET_NAMES and grouped in FEATURE_NAMES; house.floor.0..3 is in neither. (e) A paid entry that rebinds an existing free name silently overrides it by manifest order, with no rule. So the goal 'paid art drops in without code changes' is false for any name not already registered. · spec L9, L26-28, L42; render/manifest.ts:L13, L28-44; render/licenses.ts:L2, L8-15; render/creditsText.ts:L16, L19-24; render/fallback.ts:L4-19; render/assets.ts:L61-71, L76, L86-87; render/assetNames.ts:L9-25; .gitignore:L1-14 (no paid/ yet) · Implementers would differ on the notices text, the validation rules and whether paid art may override free names. The 'without code changes' outcome cannot be tested. · Spell out the changes: regex ^(raw|art|paid)/; 'paid' is excluded from LICENSE_URLS like 'original', and notices print 'Licence: paid (commercial licence, <licenseUrl ?? source>)'. superRefine: paid ⇒ file starts with paid/, required false, credit, retrieved, and source a URL; paid/ ⇒ licence paid. Register house.floor.0..3 as optional plus a 'houseFloor' feature. Choose a rule for overrides (forbid two entries binding one name, or 'paid entries listed after free ones win'). Narrow the goal to 'drops in for names Art-i registers'. Add public/assets/paid/ to .gitignore.

### [P1] R1-F8 gradeModel's three states overlap and its thresholds are undefined
The spec lists normal, alert and vacuum as if they were one state. Vacuum is per room and alert is ship-wide, and a single hit often causes both a fire and a breach. The spec does not say whether gradeModel returns an enum or flags. 'The low-oxygen threshold' is ambiguous because two exist (render 0.98, HUD_LOW_O2_FRAC). The blue tint's alpha curve and blend (normal, like today's o2Layer, or multiply in the grade) are not given. · spec L49-52; render/effects.ts:L12-14, L41-46; render/hudModel.ts:L216; sim/debris.ts:L103-109 · Two implementers would produce different gradeModel signatures and different 'gradeModel per state' tests (L72). · Specify gradeModel(input) → { alert: boolean; pulse: 0..1; vacuum: { room: number; strength: number }[] }, with alert and vacuum independent. Threshold = LOW_O2_THRESHOLD (0.98). Strength = LOW_O2_MAX_ALPHA·(1−frac), as today. The blue tint replaces LOW_O2_COLOR in o2Layer with normal blend.

### [P2] R1-F9 The layer order omits real containers and contradicts the section's opening line
L46 describes one new layer 'over the ship and under the callouts', but L53 splits it into a multiply grade above the tiles and additive lights at the top of the world. The stated order leaves out the sector magazine layer and the duel's damage tint, markers and labels. Additive lights placed after the duel's labels would wash out the repair labels. The amber and red damage tint (alpha 0.28) also stacks with the red alert pulse. · spec L46, L53; render/renderer.ts:L53; render/duel/interiorView.ts:L43-45, L55-65 · Implementers would place lights differently in the duel, and the repair labels and markers may become unreadable. · Give both exact addChild orders. Sector: tiles, grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights. Duel: tiles, grade, effects.below, icons, desks, damage, crew, boarders, effects.above, lights, marks, labels. Reword L46 to match.

### [P2] R1-F10 How the palette loads, how roles map to it, and how the import script fails are unspecified
palette.json lives in public/ and is 'read by the renderer', but the spec does not say whether that is a runtime fetch (async, with a failure mode, while FLOOR, WALL and DOOR_FILL are module constants) or a build-time import. Roles map to palette indices, so swapping in a palette of different size or order (32-48 colours) does not 'recolour everything' sensibly. The import script has no stated behaviour when FTLITE_ASSETS is missing, a pack file is missing, or a frame rectangle is out of bounds. The contact sheet goes to out/, which electron-builder packages whole. · spec L19, L32-34, L41; render/tiles.ts:L13; render/doorModel.ts:L5; electron-builder.yml:L6 (out/**/*); electron.vite.config.ts:L16, L22 · Implementers would choose differently between async and static loading. A palette swap could silently map roles to the wrong colours. A half-failed import could leave partial PNGs in paid/. · Make palette.json hold { colours: hex[], roles: { floor: hex, ... } }, imported statically (a swap means a rebuild), with a test that every role colour is in colours. The import validates everything first, then writes, and exits non-zero listing every problem. Put the contact sheet in a gitignored directory outside out/ (for example .art/contact.png).

### [P2] R1-F11 The ambient-life requirements name things the layout does not have
The ship layout has no 'wall vents' (cells are only wall, door, floor or space, and walls are procedural bands), so the steam-puff sources are undefined. Alarm and flicker lamps are 'one per room' with no position rule. The starfield goes 'behind the hull in space tiles', but space cells are not drawn and the world band is not a tile grid, and 'two speeds' has nothing to move relative to, since the interior is stationary. 'Seeded schedule' does not name the seed source. · spec L48, L68; render/tiles.ts:L26-29; render/worldFit.ts:L4 · Each implementer would invent placement and the parallax rule. The owner gate would judge arbitrary choices. · Define the placement. Lamp = the room's top-left interior tile, at a fixed art-pixel offset. Vents = wall tiles adjacent to floor, picked by hash(tile) < k. Starfield = a container under the world that fills WORLD_BAND (or INTERIOR_BAND), with the layers drifting at fixed px/s. Seed = hash(layoutHash, run seed), read-only.

### [P2] R1-F12 Too much for one plan; split into pipeline and pixel-perfect, then light and feel
Eight sections cover a script toolchain (pngjs, a perceptual remap), schema and licence changes, a world-fit change across two views, recolouring three layers, a blend-mode grade, a pooled particle system with six emitters, impact feel with a new setting, and ambient life. Several depend on decisions not yet made (the palette, adapter signals). The process tier allows one impl review. · spec L5, L15-68 · A single plan executed by fresh subagents with one impl review risks a large, hard-to-review diff, and the owner's look gate mixes the foundations with the feel. · Split it. Art-i-a: bible, palette and roles, paid manifest, import script, snapped fit with the even-grid procedural art. Art-i-b: grade and lights, particles, impact feel, feel setting, ambient life. Each gets its own owner look.

## Verified
- Skiff 18x9 = 576x288 world px in WORLD_BAND 608x296 gives fit min(1, 1.056, 1.028) = 1, so 2·1·stage is whole at stages 1, 1.5, 2 and 3 (worldFit.ts:L4, L10).
- Duel band = 1280−220 = 1060 x 720 (interiorModel.ts:L8-10; resolution.ts:L4-6); a 29x13 Cutter (928x416) fits at scale 1, so the duel interior is crisp at stages 1, 1.5, 2 and 3 as the spec says.
- Cutter fit = 608/928 = 0.655 (the height ratio 296/416 = 0.712 is larger); the snapped values at stages 1, 1.5, 2, 2.5 and 3 are 0.5, kept fit, 0.5, 0.6 and 0.5 under spec L40's rule.
- The starter ship (25x12, fit 0.76) is not crisp at stage 1 (0.5 < 0.57) but stays out of app play: fleet.ts:L1-3 flies only the Skiff and the Cutter.
- Sector signals exist: state.hull (state.ts:L28) against HULL_MAX, rooms.fire, rooms.o2 / derived.volume (effects.ts:L43), and rooms.impactTick written on each debris or shot impact (debris.ts:L117), read by effects.ts:L47-54.
- Determinism boundary: no module under sim, authority, net, clientControl, headless or events imports from render/ (grep), and the boundary test roots do not include render/ (tests/boundary.test.ts:L12), so a render-owned seeded particle RNG and performance.now timing stay outside the deterministic graph. Nothing in sections 5-8 as written needs a sim write.
- The renderer's world container order is tiles, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above (renderer.ts:L53); the duel's is tiles, effects.below, icons, desks, damage, crew, boarders, effects.above, marks, labels (interiorView.ts:L45). Fire and the low-O2 tint sit in effects.below, so a grade placed under effects.below leaves crew, consoles and hazards untinted as the spec claims.
- Textures load with nearest scaling (assets.ts:L27-28) and the app inits with antialias false and roundPixels true (renderer.ts:L36).
- Optional assets that fail to load only warn (assets.ts:L67-69), so absent paid files with required false do not stop startup, in dev or packaged builds.

## Not verified
- Pixi 8.19 blend modes: I believe 'multiply' and 'add' are built-in WebGL blend modes and only the advanced modes need 'pixi.js/advanced-blend-modes', but I did not read node_modules (out of bounds), so the plan should confirm this.
- Whether Pixi 8 roundPixels also snaps Graphics vertices, as well as sprites, in this version; not checked in the library source.
- The Cutter's 29x13 size: taken from the brief, not counted from cutter.json rows.
- Read outside the manifest: sim/duel/step.ts, sim/duel/state.ts, sim/tactical/state.ts, render/tactical/fxModel.ts, app/duel/duelMode.ts, sim/debris.ts, hudModel.ts, sim/interact.ts, wallModel.ts, projectileModel.ts, calloutModel.ts, fleet.ts, electron-builder.yml and electron.vite.config.ts. Findings 1, 2, 4, 5, 6 and 10 needed them.
- The research report (reports/Premium pixel art and VFX.md) was not read; no finding depends on it.
- Whether a test asserts that every manifest-bound name isKnownName; not looked for. It would make the house.floor registration in finding 7 mandatory rather than advisable.
- Whether electron-vite empties out/ on each build, which would delete the contact sheet; not checked.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `4613d11`. 12 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: The duel interior has no fire, oxygen or room-impact signal

Confirmed. sim/duel/step.ts:L1-2 says the sector step never runs on the duel interior; sim/debris.ts:L117 is the only writer of rooms.impactTick. Section 5 now has adapters: the duel hull fraction comes from `d.tactical.systems[CREW_SLOT].hull` over the class hull (sim/tactical/defs.ts), and fire and vacuum are always off. Section 7 uses `hitsCrew(e)` (render/tactical/fxModel.ts:L35) as the duel hit and flashes the whole interior at half strength. The screenshot list now asks for duel normal and alert, and sector vacuum.

## R1-F2 [P1]: Impact feel does not say whether it replaces the existing shake and flash

Confirmed (projectileModel.ts:L9 SHAKE_*, fxModel.ts:L14 SHAKE_PX, effects.ts:L15 IMPACT_*). Section 7 "Replaces, not stacks" names what is replaced and which container each shake moves. The flash is 2 sim ticks, and the hitstop does not extend it.

## R1-F3 [P1]: The feel setting has nowhere to live

Confirmed (main.ts:L55-58 holds the only storage reads). Section 7 specifies the localStorage key `ftlite-feel` with default `full`, a boot read in try/catch, a pure tested `feelScale`, no menu, and an F9 dev cycle.

## R1-F4 [P1]: snapWorldScale outcomes, centring, callouts and projectiles

Confirmed (worldFit.ts:L10-11 centres for the unsnapped scale; renderer.ts:L75-84 passes `fit` to the projectiles and callouts). Section 4 now gives the formula with an n ≥ 1 guard. worldFit and duelFit take the stage scale, re-centre, and round so that x × stage is whole. The same object goes to the callouts and the projectiles, a resize resets the cached projectile paths, and a table covers every ship and stage. I recomputed the table by hand; the starter row is 0.76 (kept), 0.667, 0.75, 0.6, 0.667.

## R1-F5 [P1]: Procedural walls and doors are off the art-pixel grid

Confirmed (doorModel.ts:L8 gives PANEL_THICK round(32/3) = 11 and BAND 10; L29-33 has 3-unit jambs, bar and ticks). Section 1 states the even-unit rule. Section 4 sets PANEL_THICK 12 and BAND 10 (12 + 10 + 10 = 32), defines the edges as one art pixel, and adds the even-rectangle test.

## R1-F6 [P1]: No signal for working crew or damaged sector systems

Confirmed (sim/state.ts:L43: stations.failed is binary; sim/interact.ts:L39 interactTarget). Section 6 defines the sector "working" derivation as interactTarget plus a repair-progress rise kept in RenderMemory. The duel derivation uses the repair events in d.events. A damaged system is `stations.failed[i] === 1`, and its sparks add to fx.arc.

## R1-F7 [P1]: The paid licence does not fit the schema, notices or fallback

Confirmed (manifest.ts:L13 regex; licenses.ts:L8 LICENSE_URLS Record; fallback.ts:L4-19). Section 2 now covers the regex, excludes paid from LICENSE_URLS, adds the superRefine rules and the notices line, forbids two entries binding one name, registers `house.floor.*` with a houseFloor feature, and adds the gitignore entry. The goal is narrowed to registered names.

## R1-F8 [P1]: gradeModel states overlap and thresholds are undefined

Confirmed (effects.ts:L12-14). Section 5's gradeModel returns `{ ambient, alert, pulse, vacuum[] }` with alert and vacuum independent. It uses LOW_O2_THRESHOLD 0.98 and the existing strength formula, gives the pulse formula, and the vacuum tint replaces the o2Layer colour with normal blend.

## R1-F9 [P2]: Layer order omits real containers

Confirmed (renderer.ts:L53; interiorView.ts:L43-45). Section 5 "Containers" gives the exact sector and duel addChild orders, with the duel marks and labels above the lights.

## R1-F10 [P2]: Palette loading, role mapping and import failure

Confirmed. Section 4: palette.json holds `{ colours, roles, ramps }`, is imported statically, lists its roles, and has a membership test. Section 3: the script validates everything first and exits 1 listing every problem. The contact sheet goes to `.art/contact.png`, outside out/.

## R1-F11 [P2]: Ambient life names things the layout lacks

Confirmed (tiles.ts:L26-29 has only wall, door, floor and space cells). Section 5 places the lamp on the room's top-left floor tile. Section 8 picks vents as wall tiles next to floor with a hash mod 8, puts the starfield in a container under the world filling the band at 4 and 10 art px/s, and seeds everything from the layout hash.

## R1-F12 [P2]: Too much for one plan

Confirmed. The spec is now two milestones: Art-i-a (sections 1-4) and Art-i-b (sections 5-8), each with its own plan, implementation review and owner gate.

## Also changed

- The sector hull source is pinned to `state.hull / HULL_MAX` (sim/state.ts:L28, sim/tuning.ts:L11).
- palette.json moved from public/assets/ to src/renderer/src/render/ because it is a static import.

## Files changed

- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 57f03ea, effort medium, 88 s, 254702 in / 211632 cached / 6961 out)

Verdict: changes requested

## Findings

### [P2] R2-F1 The palette role list does not cover the door and effects colours that section 4 says will read roles
Section 4 says 'The tile layer, the door model and the effects read roles instead of their module constants', but the role list only has doorFill and doorOutline for doors and nothing for most effects colours. The door model also has SEALED_FILL, HELD_TICK and SPACE_GAP. effects.ts has the fire fallback orange, the active breach red, the airlock outline cyan, the vent speck pale blue, the failed-station yellow and the IMPACT colour. Section 1 says every procedural stroke is whole art pixels, but the effects airlock outline is a 3-unit stroke at offset -2, and the even-grid test only covers wallPicture and doorPicture. · spec L22, L58, L60; render/doorModel.ts:L5; render/effects.ts:L70, L79, L94, L103, L116 · Implementers would differ. One adds new roles, another maps these colours onto the nearest ramp entries, a third leaves the constants. A palette swap (Art-ii) would then only partly recolour the interior, and the 'one palette' goal fails for the effects layer. · Either add roles for the missing colours (sealed, heldTick, spaceGap, breach, airlockOutline, failed), or state which ramp entry each one takes (for example fire fallback = fire[2], vent = vent[1]). Either way, say that no 0x literal stays in tiles.ts, doorModel.ts or effects.ts. Extend the even-grid rule (or its test) to the effects rectangles and strokes, or say explicitly that effects outlines are out of scope for Art-i-a.

## Prior findings
- R1-F1: resolved — Section 5's duel adapter gives the hull from d.tactical.systems[CREW_SLOT].hull over the class hull and says fire and vacuum are always off (L78). Section 7 uses hitsCrew, and the duel flash covers the whole interior at half strength (L94-95). The screenshot list now asks for duel normal and alert and sector vacuum (L111). hitsCrew exists at fxModel.ts:L35.
- R1-F2: resolved — L96 names what each shake and flash replaces and which container each shake moves. L95 makes the flash 2 sim ticks, and L97 says the hitstop does not extend it.
- R1-F3: resolved — L98 gives the key, the default, a boot read in try/catch, a pure feelScale with its multipliers, no menu, and an F9 dev cycle.
- R1-F4: resolved — I recomputed the table at L49-54 from the formula at L47 and it matches. Cutter: 0.5, 1/3 < 0.491 so kept, 0.5, 0.6, 0.5. Starter: 0.5 < 0.57 so kept, 0.667, 0.75, 0.6, 0.667. Skiff: 1 at every stage. L47 covers re-centring, rounding so x times stage is whole, the same object going to callouts and projectiles, and the path reset on resize. L56 covers the n=0 case.
- R1-F5: still open — The static geometry is now on the grid. PANEL_THICK 12 and BAND 10 put every wallPicture rect on even values (wallModel.ts:L26-30 gives x/y 0, 10 or 22 and w/h 10 or 12). But a sliding door panel's width is continuous: doorPicture computes w = HALF*(1-p) and places the panel at x = T - w (doorModel.ts:L23-24), and the airlock stripes start at r.x+4 (L34). So for any progress strictly between 0 and 1, the panels and stripes have odd or fractional x and w. As written, the test that 'every doorPicture rectangle has even x, y, w and h' (spec L58) either fails or only gets run at rest states, and implementers would choose differently. Fix: quantise the slide, w = 2*round(HALF*(1-p)/2), and test doorPicture over a sweep of progress values.
- R1-F6: resolved — L88 and L90 define the sector and duel 'working' signals, the failed-station signal, and that the sparks add to fx.arc. interactTarget has the Fire, Breach and Power kinds (interact.ts:L61, L67, L75). repairWork events exist (duel/state.ts:L19, duel/step.ts:L54).
- R1-F7: resolved — L30-34 cover the regex, excluding paid from LICENSE_URLS, the superRefine rules, the one-name-one-entry rule, the notices line, the gitignore entry, and registering house.floor.* with the houseFloor feature. The goal is narrowed at L13.
- R1-F8: resolved — L71-74 give the return shape with alert and vacuum independent, LOW_O2_THRESHOLD 0.98 (matches effects.ts:L12), the LOW_O2_MAX_ALPHA strength formula (effects.ts:L14), the pulse formula, and that the vacuum tint is a normal-blend replacement of the o2Layer colour.
- R1-F9: resolved — The orders at L67-68 match today's addChild lists with grade and lights inserted (renderer.ts:L53, interiorView.ts:L45). The duel marks and labels sit above the lights. L66's opening line is consistent with them.
- R1-F10: resolved — L60 makes palette.json a static import with {colours, roles, ramps}, a role list and a membership test. L39 makes the import validate first and exit 1. L41 puts the contact sheet at .art/contact.png, outside out/.
- R1-F11: resolved — L80 places the lamp on the room's top-left floor tile. L104 picks vents by a hash of wall tiles next to floor. L105 puts the starfield in a container under the world filling WORLD_BAND or INTERIOR_BAND (both exist: worldFit.ts:L4, interiorModel.ts:L10), drifting at 4 and 10 art px/s. L85 seeds everything from the layout hash.
- R1-F12: resolved — L5-7 split the work into Art-i-a (sections 1-4) and Art-i-b (sections 5-8), each with its own plan, implementation review and owner gate (L112).

## Verified
- Recomputed the snapWorldScale table (spec L49-54) from the formula at L47 for every ship and stage; all values match.
- With PANEL_THICK 12 and BAND 10, every wallPicture rect is even (wallModel.ts:L26-30 gives 0/10/22 and 10/12).
- The sector and duel addChild orders at L67-68 are today's lists plus grade and lights (renderer.ts:L53, interiorView.ts:L45).
- HULL_MAX = 100 exists (sim/tuning.ts:L11) and state.hull exists (sim/state.ts:L28), so the sector adapter at L77 is buildable.
- LOW_O2_THRESHOLD 0.98 and LOW_O2_MAX_ALPHA 0.6 exist in effects.ts:L12-14, as L74 cites.
- The interactTarget kinds Fire, Breach and Power (interact.ts:L61-75) and the repairWork duel events (duel/state.ts:L19, duel/step.ts:L54) exist for the L90 derivations.
- duelFit and INTERIOR_BAND exist (duel/interiorModel.ts:L10-14).

## Not verified
- Whether every ship class's starting hull in sim/tactical/defs.ts is the right denominator for the duel hull fraction (I did not read defs.ts L16-24 in full).
- Whether the duel interior's fit is exactly 1 for every ship class (I did not compute duelFit's output per ship).
- Whether Pixi 8.19 renders 'multiply' without importing the advanced blend modes; the spec defers this check to the plan.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `57f03ea`. 2 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F4 and R1-F6 to R1-F12 as resolved; R1-F5 was reopened.

## R1-F5 [P1]: Procedural walls and doors are off the art-pixel grid (reopened)

Confirmed. The new evidence holds: doorModel.ts:L23-24 computes `w = HALF * (1 - p)` and places the panel at `T - w`, so the width is continuous mid-slide, and the stripes start at `r.x + 4` (L34). Section 4 now quantises the slide to `w = 2 × round(HALF × (1 − p) / 2)` and puts the stripes at even offsets. The test sweeps progress from 0 to 1 in steps of 0.01 for each look and both slides.

## R2-F1 [P2]: The palette role list does not cover the door and effects colours

Confirmed. doorModel.ts:L5 holds SEALED_FILL, HELD_TICK and SPACE_GAP, and effects.ts has colour literals at L13, L15, L70, L79, L94, L103 and L116. Section 4 now:
- adds the roles lowO2, impact, doorSealed, heldTick, spaceGap, fireFallback, breach, airlockOutline, ventSpeck and failed;
- states that no `0x` literal stays in tiles.ts, doorModel.ts, wallModel.ts or effects.ts, enforced by a grep test;
- extends the even-grid rule and its tests to the effects shapes (the airlock outline becomes a 2-unit stroke).

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md

<!-- end -->

---

# Round 3 (delta, reviewing 1e285dc, effort medium, 45 s, 73298 in / 49551 cached / 4380 out)

Verdict: ready with P2s

## Findings

### [P2] R3-F1 A 2-unit airlock outline at offset −2 lands on odd world units under Pixi's default centred stroke
Section 4 says the airlock outline becomes a 2-unit stroke at offset −2, but it does not give the stroke alignment. Pixi 8 centres a stroke on the path by default (alignment 0.5). A rect at tx·TILE_PX − 2 stroked 2 wide therefore covers −3..−1, which is off the art-pixel grid. The even-x/y/w/h rect test would still pass, because it checks the path rect and not the painted band. · spec L58 ('the airlock outline becomes a 2-unit stroke at offset −2'); render/effects.ts:L94 (rect(tx*TILE_PX − 2, …, TILE_PX + 4, …).stroke({ width: 3 }) with no alignment); compare render/tiles.ts:L43, where the door panel stroke sets alignment: 1 explicitly · The fix for R2-F1 leaves the one stroked effect half an art pixel off the grid. The test that should catch this checks the wrong quantity, so the miss would ship silently. · Give the alignment in the spec: 'a 2-unit stroke with alignment 1 (inside) on the rect at offset −2, covering −2..0 outside the tile', or a centred stroke on a rect at offset −1. Have the test check the painted band (rect offset adjusted by alignment × width), not just the path rect.

### [P3] R3-F2 The door seam is off the grid today and the spec does not say where it moves
The closed-door seam is {x: HALF − 1, w: 2}, so it starts at 15. The new sweep test over every doorPicture rect will fail on it, but section 4's list (jambs, ticks, seal bar, outline) does not name the seam or say how to re-centre it: 14..16, 16..18, or 4 wide at 14. The spec also says 'the effects' shape helpers', but effects.ts draws every shape inline and has no helpers to test. · render/doorModel.ts:L31 (seam x: HALF − 1); spec L58 (list of door parts; 'the effects' shape helpers'); render/effects.ts:L70, L79, L94, L103, L116 (inline Graphics calls) · These are small choices, but fresh subagents would each make them differently. · Add the seam to the list, for example 'seam 2 wide at x = HALF (the right panel's edge)'. Name the pure helpers the plan extracts from effects.ts (for example fireFallbackRect, breachRect, ventSpeckRect, failedRect, airlockOutlineRect) and say the vent speck centre is rounded to an even world unit.

## Prior findings
- R1-F5: resolved — PANEL_THICK 12 / BAND 10 sums to TILE_PX. The quantised slide w = 2·round(HALF(1−p)/2) is even in 0..16, so both the panel at 0 and the panel at T − w sit on even x, and stripes at r.x + 4 step 6 stay even. Jambs, ticks, bar and outline stroke are required even. The sweep test over progress, looks and slides covers the continuous case. The remaining seam detail is noted as a P3.
- R2-F1: resolved — The role list now covers doorSealed, heldTick, spaceGap, fireFallback, breach, airlockOutline, ventSpeck, failed, lowO2 and impact, which matches every literal in doorModel.ts:L5 and effects.ts:L13, L15, L70, L79, L94, L103 and L116. The no-0x grep covers tiles.ts:L13 (FLOOR, WALL) as well. The even-grid rule is extended to effects. The new stroke-alignment gap is raised separately.

## Verified
- doorModel.ts:L8: PANEL_THICK = round(32/3) = 11 and BAND = floor(21/2) = 10 today, so spec L58's 'today they are 11 and 10' is correct, and 12 + 10 + 10 = 32
- doorModel.ts:L23-24: the quantised w is even and always ≥ 2 when non-zero, so the existing w ≥ 0.5 guard still works
- doorModel.ts:L34: stripes start at r.x + 4, step 6, are 2 wide, at y r.y + 2 with h r.h − 4 = 8. All even once panels are even
- tiles.ts:L43: the panel outline is already an inside stroke (alignment 1), so an even width keeps it on the grid
- Every 0x literal in tiles.ts, doorModel.ts and effects.ts maps to a role in spec L60's list
- enemyWindow.ts:L13 imports DOOR_FILL and DOOR_OUTLINE (tactical view, out of scope). The exports can stay as role reads without a 0x literal, so there is no conflict

## Not verified
- Whether wallModel.ts has any 0x literals or odd rects beyond those cited in round 1 (not re-read; outside the diff)
- Whether duel/interiorView.ts draws doors or effects through other code paths that the grep test and even-grid tests would miss (not read this round)

---

# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `1e285dc`. 2 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F5 and R2-F1 as resolved.

## R3-F1 [P2]: The 2-unit airlock outline at offset −2 lands on odd world units

Confirmed. effects.ts:L94 strokes with no alignment, while tiles.ts:L43 sets `alignment: 1` explicitly. Section 4 now specifies alignment 1 (inside) on the rectangle at offset −2, so the stroke paints −2..0, and the test checks the painted band rather than the path.

## R3-F2 [P3]: The door seam is off the grid and the effects have no helpers

Confirmed. doorModel.ts:L31 has the seam at x = HALF − 1, and effects.ts draws every shape inline. Section 4 puts the seam 2 wide at x = HALF, names the pure helpers the plan extracts (fireFallbackRect, breachRect, ventSpeckRect, failedRect, airlockOutlineBand), and rounds the vent speck centre to an even world unit.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md

<!-- end -->

---

