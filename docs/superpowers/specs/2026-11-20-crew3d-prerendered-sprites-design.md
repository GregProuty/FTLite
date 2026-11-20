# Crew3D: pre-rendered 3D crew and boarder sprites

Date: 2026-11-20. Status: design approved by the owner in brainstorming; not planned.

## Goal

Diablo 2-style characters on the 2D ship: 3D models rendered offline into 8-direction sprite sheets, played back as
flat frames by the existing Pixi renderer. The first slice covers the four player crew and one enemy boarder type,
seen top-down on the painted Hound battlemap. Free (CC0) models first; paid packs only as a later upgrade.

Decisions taken (owner, 2026-11-20):

- Camera: top-down (option A). The Hound map is unchanged. Isometric 3/4 and portraits are out of scope.
- Source: we render the sprites ourselves from rigged, animated 3D models (not bought sprite sheets).
- Slice: crew plus boarders.
- Pipeline: a Blender headless script (not three.js offline, not live 3D in the game).
- Look development: agents drive Blender live through an MCP server, then the result is frozen into the script.

## 1. Render rig and look

- **Camera.** Orthographic, tilted 60 degrees from the horizon, always looking screen-up. The tilt is one value in
  the rig config (try range 50-75). Key light from the top-left (house light rule) and a soft blob shadow under the
  feet, rendered into the sprite.
- **Directions.** The model turns in 8 directions in 45-degree steps; the camera never moves.
- **Frame.** Each frame covers 2 x 2 tiles (64 world units), rendered at 128 px (2 art px per world unit, the
  current `artPx`). Each frame is rendered at 4x and downsampled.
- **Look.** Toon shading (a few flat light bands) plus a dark ink outline (Blender line art), so the figures read as
  painted and sit on the 2MT painting. Colours stay near the house palette; no hard palette snap in this slice.
- **Mask pass.** Each render also writes a mask holding only the outfit's team-colour areas. The game tints the mask
  with the player's `CREW_COLORS` entry, so one model serves every player.
- **Output per character.** One WebP sheet, one WebP mask sheet, and one JSON block in the existing manifest format
  (`frames`, `animations`), with names `crew3d.<char>.<anim>.<dir>`. The JSON also records the foot row and the head
  row, so the game reads its anchor and lifts from data.
- **Determinism.** Fixed seeds and sample counts: re-running the script on unchanged inputs gives the same sheets.
- **Budget.** At most 256 frames per character (one 2048 x 2048 sheet), about 1 MB per character plus its mask.

## 2. Look development through Blender MCP

Stage A uses an MCP server that lets the agent run Python in a live Blender session (candidates: the Blender Lab
official server for Blender 5.1+, or the community `blender-mcp` add-on; pick whichever installs and works; the two
listen on the same port and must not run together). The agent loads candidate models, sets the camera, shaders,
outline and light, renders test frames, and shows them to the owner.

Rules:

- A live session is exploration only. It is not reproducible, so every setting the owner accepts is written into the
  committed rig script (`tools/sprite-render/`), and every committed sheet comes from a headless script run.
- The MCP server runs agent-written Python with no guard. Only open .blend files and models we downloaded on purpose;
  do not run the MCP Blender session with unrelated files open.
- Downloaded models are untrusted data: each pack goes in its own folder under `C:\Users\djuar\FTLite-assets\3d\`
  (outside the repo), and .blend files from packs are opened with auto-run scripts off.

## 3. Cast and animations

**Audition first.** The rig renders 3-4 candidates in the real look (8 directions, idle and walk) on one contact
sheet over a Hound crop, and the owner picks. Candidates:

- Crew: KayKit Space Ranger (Mystery Monthly Series 4, CC0); Quaternius Universal Base Characters with gear from the
  Sci-Fi Essentials Kit (CC0); one more if the audition finds one.
- Boarder: a Quaternius Sci-Fi Essentials animated robot (CC0).

**Crew.** Two crew bodies (for example bulky and lean). Player slots alternate bodies; the colour comes from the mask.
Body and colour are a pure function of `pid`.

| Pose | Frames | When |
|---|---|---|
| idle | 4, loop | standing still |
| walk | 8, loop | moving, including carrying a torpedo (still drawn overhead) |
| work | 6, loop | seated, or working a power station, facing the console |
| repair | 6, loop | working a breach |
| firefight | 6, loop | working a fire, aimed at the burning tile |
| down | 1 | downed or dead (a real lying pose; dead keeps the grey tint) |

31 frames x 8 directions = 248 frames, all at 12 fps.

**Boarder.** idle 4, walk 8, attack 6, 8 directions (144 frames). No mask, no tint; the health bar stays.

**Animation sources.** Each character's own clips first; missing ones are retargeted from KayKit Character Animations
or the Quaternius animation library (CC0). Mixamo is allowed as a fallback: its raw files stay out of git (as the
paid packs do) and any Mixamo-derived sheet is listed in `docs/gates.md`. Only sheets from CC0 sources are committed.

## 4. Game side

- **Loading.** Sheets go in `public/assets/art/crew3d/` with their manifest entries, loaded through
  `assets.animation(name)` and `assets.texture(name)` like any other art.
- **Feature and fallback.** `crew3d` is a new art feature in `fallback.ts`. If any of its names are missing, the game
  draws what it draws today: painted tokens on the Hound, LimeZu elsewhere, then Puny, then circles.
- **`crew3dModel.ts` (pure, no Pixi).** `crew3dPose(pid, life, seat, working, facing, moving)` returns the animation
  name, the mask name, the facing and the dead tint. Priority: down, then working (firefight for fire, repair for
  breach, work for power, faced toward the target point), then seated (work, facing the console side), then walk,
  then idle. `crew3dBody(pid)` picks the body; the mask tint is `CREW_COLORS[pid % 4]`. Facing uses the full
  `Facing8`.
- **Crew layer.** `crewSprites.ts` gets a new branch, tried first when `crew3d` is ready. Each crew member is a
  Container with two AnimatedSprites (base, and mask tinted with the player colour) that play the same frames in
  lockstep. Position, interpolation, `bob`, the carried torpedo and the callout lifts are unchanged; anchor and lifts
  come from the sheet JSON. The `Working[]` list the renderer already computes for particles is passed in beside
  `bob`.
- **Boarder layer.** `boarderLayer.ts` uses the robot sheet when `crew3d` is ready: untinted, attack frames while
  fighting, same walker and health bar. Otherwise it draws today's tinted figure.
- **Scale.** One constant sizes the body to about the current token's footprint on the Hound; the look gate tunes it.
- **Dev toggle.** F8 switches between the 3D art and the old art, stored in localStorage like the F9 feel setting.
  Not a player-facing setting.
- **Sim.** Nothing changes. Presentation only: no SIM_VERSION bump, golden unchanged.

## 5. Testing

- `crew3dModel`: the pose priority table, fire/breach/power to firefight/repair/work, facing toward the target point,
  body and colour per `pid`, the dead tint.
- Manifest: every name `crew3dPose` can return exists for both bodies and all 8 directions, and every animation has
  the frame count in section 3.
- Fallback: with `crew3d` names missing, the crew layer takes the token or LimeZu branch as now; existing crew-layer
  tests pass unchanged.
- Rig script: a smoke test that runs only when Blender is installed (skipped otherwise). It renders one direction of
  one pose and checks the frame size, the transparent background and the foot row against the JSON.
- Visual check (playwright-core + Electron, as in earlier art passes): screenshots on the Hound of crew idle, walking, at consoles, on a fire, on a
  breach, downed, and boarders attacking, with F8 off and on, saved to `C:\Users\djuar\FTLite-shots\crew3d\`.

## 6. Gates (owner)

1. Audition: pick the two crew bodies and the boarder from the contact sheet before the full render.
2. Look: screenshots and live play; tune tilt, outline weight and scale.
3. Licences in `docs/gates.md`: CC0 sources noted; Mixamo-derived frames listed if used.

## 7. Build order

- **A. Rig and audition.** Install Blender and the MCP server, develop the look live, freeze it into the rig script,
  render the candidates, produce the contact sheet. Stop for the owner's pick.
- **B. Full render.** Two crew bodies and one boarder, with masks and JSON; commit the sheets.
- **C. Game swap.** `crew3dModel`, the crew and boarder layer branches, the F8 toggle, tests, screenshots.

Out of scope: player-facing settings, more boarder types, on-foot and port characters, portraits, palette snapping,
isometric ships.
