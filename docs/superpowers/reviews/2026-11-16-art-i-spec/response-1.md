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
