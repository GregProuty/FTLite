# Round 1 response (implementation revised)

Reviewed `round-1.json` against the subject at `717e3e63`. 4 accepted, 0 rejected, 0 deferred.

## R1-F1 [P2]: Mouse aim follows the cursor over the console blocks, so using a side tool turns the ship toward it

Confirmed. scene.ts sent steer every frame from the last canvas pointer, and the panels are pointer-events:none. New pure `app/duel/flightPointer.ts`: `onFlightMap(p, contactShown)` excludes the tab strip, the side column, the Helm and FLIGHT blocks, and CONTACT while it is shown, using the consoleLayout rectangles; the whole reserve bands would also block open map. scene.ts runs the Flight block after `contact.sync` and sends steer only when `flightPointer` returns a bearing, so the runtime keeps the last map bearing. Test: `tests/flightPointer.test.ts`.

## R1-F2 [P3]: Spec §6.1's 'NO LASER' refusal flash is not implemented and no plan records the deviation

Confirmed. On the gun fit, Digit1 and 3/4/5 at the Flight seat now go through the existing refusal path: `refuse('laser', NO_LASER)` in runtime.ts, with a `'laser'` RefusedControl in situationModel and the reason line in FlightStation. The laser fit is unaffected (tested). Tests: valkyrnRuntime, flightConsole.

## R1-F3 [P3]: A right-click while the torpedo is picked up both cancels the targeting and launches a torpedo

Confirmed. `flightPointer` returns `launch = press && !aimed`. The scene counts the pick-up from the last drawn frame as well, because TargetingLine's window listener clears it first. Spec §5.1 now says the right button only cancels a pick-up.

## R1-F4 [P3]: Gun hits give no struck-room flash or ROOM HIT/OFFLINE callout in the enemy window

Confirmed. `gunHit` gains an event-only `level` flag, set in gun.ts when the room wear wraps; the hashed state is untouched, and the oracle and trace `same` checks pass at 53. In hitModel, every enemy gun room hit flashes the room; a level change gives `GUN: <ROOM> HIT`, or OFFLINE / SHIELDS DMG 2 at level 2. Online synthesized hits send `level: false`. Tests: valkyrnViews, valkyrnRounds, valkyrnOnline.

## Also changed

- The side column (ZOOM/SNAP) is also excluded from steering. The review did not list it, but it is a drawn panel the canvas sees through.

## Files changed

- docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md
- src/renderer/src/app/duel/contactController.ts
- src/renderer/src/app/duel/flightPointer.ts
- src/renderer/src/app/duel/onlineSource.ts
- src/renderer/src/app/duel/runtime.ts
- src/renderer/src/app/duel/scene.ts
- src/renderer/src/render/duel/situationModel.ts
- src/renderer/src/render/tactical/hitModel.ts
- src/renderer/src/sim/tactical/gun.ts
- src/renderer/src/sim/tactical/state.ts
- src/renderer/src/ui/duel/FlightStation.tsx
- tests/flightConsole.test.tsx
- tests/flightPointer.test.ts
- tests/valkyrnOnline.test.ts
- tests/valkyrnRounds.test.ts
- tests/valkyrnRuntime.test.ts
- tests/valkyrnViews.test.ts

<!-- end -->
