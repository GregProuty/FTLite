# UI round Part 3 (the look): report

Spec: docs/superpowers/specs/2026-11-20-ui-round-design.md §3. Plan: docs/superpowers/plans/2026-11-20-ui-round-part3.md.
Branch ui-round-3 from origin/master 7e92c060, with the owner's hud-bars and the later HUD commit (crew health bar, S badge) merged in. No sim change (SIM 69).

## What was built

- **Shield fx model** (`render/shieldFx.ts`): per ship, each shield hit from the view events lights a patch of hex cells at the impact bearing. The patch spreads ring by ring, each ring later and dimmer, and is gone by 0.5 s. A layer drop adds one whole-grid flicker; the last layer's drop flickers and the bubble fades out. At rest the bubble is a thin ellipse, brighter with more layers. Cells near the edge are brighter. Everything runs on the presentation clock, so pause holds it.
- **Enemy shots** (`render/duel/enemyShots.ts`): laser, pew, gun and torpedo events on the crew ship become shots in the interior's pixel frame. Each flies in from off-screen on its true ship-frame bearing (the map's own hull transform). A stopped shot bursts on the bubble; a hit flies on to its room; a miss crosses and leaves. Torpedoes have a trail. The fog is respected: a hit from an unseen enemy takes its bearing from the impact point, and an unseen miss is not drawn.
- **Ship view**: the bubble, the shimmer and the shots draw in the Pixi interior in the shield blue. The HUD's shield box for the layer that dropped flashes hot.
- **The Hunter** (`tools/ship-render/hunter.py`, headless Blender 5.3): an original top-down ship built on the scout hull read from `hullModel.ts`, so it sits exactly under the window's room outlines. It is rendered in neutral greys to `public/assets/art/ships/hunter.png` and credited as original in the manifest (`ship.hunter.art`).
- **Enemy window**: at scan Level 1 and up, the Hunter draws under the room outlines through a shared SVG amber filter (`crt-amber`, luminance onto the CRT ramp). The shield and hull bars sit under the picture, with the shield bubble and shimmer on it. Unscanned, today's dashed shape stays.
- **Own ship window**: the painted Hound or Valkyrn in the same amber, fitted by its painted bounds, so the whole ship shows. Damaged and burning tiles, fire bars and crew dots draw on top, with the bubble and shimmer.
- `GameAssets.image(name)` gives the React windows an image's URL and size. Without the paid art (the web build), the own ship window draws its plain tiles.

## Verification

- Typecheck clean. Full suite: 558 files, 6553 passed, 3 skipped (on the merged tree).
- No change under `src/renderer/src/sim`, `tests/golden` or `tests/fixtures`.
- Duel app smoke: PASS (180 s). Determinism: PASS in Node, Electron and Firefox (duel restore 597 checks).
- Reviews: one task review per task, then a final whole-branch review (Opus). Its one Important finding (shots revealing an unseen enemy's bearing) is fixed in 701a2a4c, along with the bubble blink, cell grouping by alpha, the Valkyrn gun's strips, and a slot guard.
- Screenshots: `C:\Users\djuar\FTLite-shots\ui-round-3\`, from script `scripts/ui-round-3-shots.cjs`.
  - `helm-own-ship.png`
  - `weapons-window-scanned.png` and `weapons-window-unscanned.png`
  - `ship-NN.png`: hull hits with the shields down
  - `ship-shield-NN.png`: the shields held up, showing the bubble and hex patches
- A note on the earlier onlineAppRuntime failure: it was this worktree's `services/signalling/node_modules` junction, created with a relative path that resolved to `C:\Users\services\...`. With an absolute target it passes.

## Open, for the owner's look gate

- The Hunter render, the shimmer and the shots.
- The shot's flight (0.12 s laser to 0.35 s torpedo) lands just after the room's flash and shake, which fire on the event.
- Online guests see no pew shots or pew shimmer. Online pew events carry no strip or hull result; that predates this branch.
- The enemy window's bubble (0.56 of the outline) just touches the drawing box's edges.
