# Asteroids look pass: rocks as background

Date: 2026-11-20. Owner request, approved the same day. Drawing only: no sim change, SIM_VERSION unchanged.

## 1. Why

The owner's words: rocks should "look and feel like background", with no bright colours on them. They look right when a
round starts. What is wrong is everything that happens after: the outline brightens on the first hit, the cracks carry a
light highlight, free rocks drag trails and speed streaks, and a break throws a bright ring and amber shards.

This pass removes those. It is the first of two parts. The second (Asteroids-iv, its own spec) replaces the round-piece
breaks with rocks built of blocks that part into real pieces of the original rock.

## 2. The rock itself

- **Fill and outline.** A rock is a `CRT.dim` fill with a 1 px `CRT.mid` outline for its whole life, whatever its wear.
  The fill no longer drops to `CRT.faint` at half wear and the outline no longer turns `CRT.main` on the first hit.
- **Cracks.** The same four fixed cracks, revealed by wear as before (asteroids-iii spec §7.3 steps 1 to 5). Each segment
  is now one 1 px `CRT.faint` stroke at alpha 0.6 (`CRACK_ALPHA`): darker than the fill, never lighter. The `CRT.mid`
  highlight 0.6 px beside each cut is gone, and so is the near-black `CRT.glass` cut.
- **Trails.** Removed. The rock track keeps only each slot's last two places, for smooth motion.
- **Streaks.** Removed.
- **Unchanged.** The 2 px dot for a rock too small to outline, the outline's slow spin, the weapon brackets on a targeted
  rock, and the dotted predicted path of the Weapons map's rock target.

## 3. Effects

A weapon's own effects stay as they are. A rock's own effects become background.

| Event | Before | Now |
| --- | --- | --- |
| A split or a dust | A `CRT.hot` burst ring sized by the rock, then 16 `CRT.main` shards (a torpedo's direct hit) or 6 `CRT.mid` specks | 6 `CRT.dim` specks at 20 to 90 u/s about the rock's velocity, living 0.5 s |
| A torpedo's direct hit | An 80 ms hit-stop of the map drawing | No hit-stop |
| Two rocks touch | A `CRT.mid` spark | Nothing |
| Two rocks collide hard | A `CRT.hot` spark | Nothing |
| A laser shot meets a rock | A flare and 5 to 8 hot chips | Unchanged (the laser's) |
| A torpedo blast | A shockwave, a core flash and a hot spray | Unchanged (the torpedo's) |
| An autocannon round hits a rock | A hot spark | Unchanged (the gun's) |
| Screen shake for a blast or a break | 8 px falling with distance; 2 px | Unchanged |

## 4. Code

- `render/tactical/tacticalLayer.ts`: the rock body and crack strokes; the trail and streak drawing removed.
- `render/tactical/tacticalModel.ts`: `AsteroidDraw` loses `streak` and `trail`; `crackDraw` returns cut segments only.
- `render/tactical/rockTrack.ts`: the trail ring and its readers removed.
- `render/tactical/rockFx.ts`: the puff; `holdFrame`, the shards, the burst ring and the two rock-rock sparks removed.
- `render/tactical/fxModel.ts`: `FxState.hold` and `holdGap` removed.
- `app/duel/scene.ts`: the hit-stop removed from the frame loop.

## 5. Tests

- `tests/rockLook.test.ts` (new): the layer draws a rock with the same fill and outline at every wear, the cracks in
  `CRT.faint` at alpha 0.7 or less, and nothing of a rock in `CRT.main` or `CRT.hot`.
- `tests/rockFx.test.ts`: a break is 6 dim specks and nothing else; rock-rock events draw nothing; the weapons' effects
  are unchanged; `FxState` has no hit-stop fields.
- `tests/rockTrack.test.ts`: the history resets as before; no trail is kept; a rock draw has no `streak` or `trail`.
- `tests/rockCracks.test.ts`: `crackDraw` returns one stroke per cut segment.

## 6. Owner's look gate

Play a round at Weapons: shoot a rock, break one with the laser and one with a torpedo, and watch free rocks drift. Open
items for that look: whether the break's 2 px screen shake and the laser's hot chips also read as too loud.
