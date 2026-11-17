# Interior zoom (2026-11-17)

## Goal

The owner: "lets add a scroll to the ship view also, you should be able to zoom into the ship and also out somewhat".
The duel's interior view (the ship you walk around in) gains mouse-wheel zoom, a drag pan and a follow camera, in
Single player and online alike, without losing the crisp whole-pixel art (Art-i spec section 4).

## Rules

1. **Levels.** The fit gives k screen pixels per art pixel. Zoom level z is in {-1, 0, +1, +2, +3, +4} and gives
   max(1, k + z) screen pixels per art pixel (k rounded to a whole number first when the fit could not snap). Level 0
   is today's exact view (the fit's scale and position). -1 is offered only when it is smaller than the fit. The wheel
   moves one level per notch with the map views' notch accumulator (100 px a notch, remainder dropped after 200 ms
   idle); the zoom keys (= and -, Num + and Num -) move one level per press.
2. **Follow and clamp.** At level 0 or below the ship is centred in the band. Above level 0 the view follows the active
   character (Single player: the one being played; online: this seat's character) at its interpolated position, clamped
   so the ship's edge never comes further in than the band's edge; on an axis where the ship is smaller than the band it
   is centred. A right or middle drag above level 0 pans away from the follow (clamped the same way); C snaps back to
   following. C does nothing else while standing in the interior, so it keeps its meaning ("the camera") there.
   Positions are rounded to whole screen pixels.
3. **Anchor.** When not following, a wheel zoom keeps the point under the cursor still (a key zoom keeps the band's
   centre still); when following, the character stays centred (clamp allowing).
4. **Lifetime.** Zoom and pan belong to the view session: a new round (rematch) resets to level 0 and following; pause
   keeps them (and the camera still moves while paused); Tab keeps the level and re-follows the newly active character.
5. **Both modes.** Single player and online use the same model and input path; the hit shake applies on top.
6. **Help.** The interior readout's help gains the zoom, drag and follow keys; the Settings Controls list says the wheel,
   the drag and C also work in the ship view.

## Design

A pure model `render/duel/interiorCamera.ts` holds the state (level, follow, last placement, pending input). The duel
runtime and the online source record each frame's interior input into it through `createCameraInput` (the same wheel
accumulator as the map cameras), only while the interior is the view. The interior view resolves it each draw against
the fit, the painted bounds, the stage scale and the active character's position, and places `world` (scale, then the
shake on top).

## Tests

- Model: levels and the max(1, k + z) rule, the -1 floor, clamping both axes (larger and smaller than the band),
  follow centring and its clamp, drag pan and its clamp, cursor anchoring, whole-pixel rounding at stage scales 1 and
  1.5, the reset and Tab rules, level 0 equals the fit exactly.
- Wiring: the runtime records wheel, zoom keys, drag and C only in the interior; Tab keeps the level and re-follows; a
  rematch resets; pause keeps it; the online source does the same from its keys and pointer and resets on a new round;
  the interior view places the world from the camera with the shake on top.
- Text: the interior help line and the Settings Controls rows, and the help fits the readout width.

## Acceptance

`npm run typecheck`, the touched tests, `npm run build`, the full `npm test`, `npm run test:duel-app-runtime` pass;
screenshots of the interior at levels 0, +3 and -1 show crisp art, the follow at +3 and the centred ship at -1; and the
owner's eye check in the running game (zoom feels right, the follow is not jarring, the art stays crisp).
