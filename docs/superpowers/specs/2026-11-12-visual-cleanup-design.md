# Visual Cleanup (Demo-iv) Design and Plan

Status: 2026-11-12, from the user's playtest ("several visual bugs like overlapping ui cards", "clean up the visuals, theres meaningless clutter all over the ship. just use blank floors and walls") and Claude's screenshots of the running app. Parent: foundation §7 (rendering); Demo-i/ii/iii HUD.

## 1. Problems seen (screenshots, 2026-11-12)

The cutter (928 × 416 at 32 px tiles) fills the 960 × 540 internal screen, so the right-hand power card covers the bow (Door Control, Sensors, Bridge); the top notice runs into the ship's top; a seated console card covers the stern's lower rooms; the enemy panel and the sector map sit over the ship. The tile art (tall front walls, vents, screens, pipe rails, damage decals) hides the room shapes; one-tile rooms read as walls.

## 2. Decision

Raise the internal resolution to **1280 × 720** and lay the screen out in bands that never overlap; scale the world to fit its band; replace the tile art with flat floors, walls and doors. (Alternatives: keep 960 × 540 and shrink the world to about 0.6 (tiles ~19 px, too small); keep the overlaps translucent (still overlapping).)

## 3. Layout (internal 1280 × 720; `LINE = 18`)

- `src/shared/resolution.ts`: `INTERNAL_W = 1280`, `INTERNAL_H = 720` (`TILE_PX` stays 32). The Electron window's minimum content size follows.
- **Letterbox** (`render/letterbox.ts`): scale steps of 0.5 at or above 1: `scale = max(1, floor(min(winW / W, winH / H) × 2) / 2)` (1080p fullscreen gives 1.5; 1440p gives 2). The letterbox test is updated.
- **Left column** (x 8..248): clock card `panel(8, 8, 240, 60)` with the top line at (16, 18) and the director line at (16, 36); power card `panel(8, 74, 240, 8 × LINE + 12)` with its title at (16, 80) and rows at (16, 80 + (i + 1) × LINE).
- **Right column** (x 1032..1272): threat card `panel(1032, 8, 240, 100)` with rows at (1040, 16 + i × LINE); the enemy panel 240 × 100 at (1032, 114) (its drawing widened: background 240 wide, every drawn element shifted right by 60 so the silhouette and ring centre at x 120, both bars 220 wide at x 10); the sector map 240 × 236 at (1032, 220) (columns at x = 18 + 29c; nodes at y = 128 + (k − (n − 1)/2) × 44; marks 14 px below the node; the title at (8, 4); `EXIT` under the last node).
- **Top centre**: the two notice rows centred at x 640, y 14 and 32; the 2× banner centred at (640, 24); the banner glyphs at y 64; the progress line at y 84; the summary rows from y 104 + k × LINE.
- **Bottom**: four player cards 308 × 90 at x = 8 + i × 316, y 626; each console card 308 wide, 8 × LINE + 12 tall, directly above its player card (y 466).
- **World band**: x 256..1024, y 76..456 (768 × 380). `world.scale = min(1, 768 / (width × TILE_PX), 380 / (height × TILE_PX))`, and the world is centred in the band (floored to whole pixels). The cutter gets 0.828 (768 × 344), the starter 0.96.
- Every coordinate in `hud.ts` that was written against 960 × 540 is moved to these values; nothing else in the HUD changes.

## 4. Flat tiles

`render/tiles.ts` draws, per tile, with `Graphics` built once per layout: void nothing; floor (and under each door) a flat `FLOOR = 0xc9cdd6` square; wall a flat `WALL = 0x3b4150` square (no tall front-wall sprite, no wall or floor variants). Doors are drawn per frame from the door state: closed `0x8a909e` filling the door tile with a 2 px darker centre line; open the floor colour with two 3 px jambs in `0x8a909e` on the wall sides; sealed `0xb05a4a`. The door animation is dropped. The effects layer keeps fire, breach, impact flash, venting and the failed-console arc; the persistent damaged-floor decals are removed. The tile-pick helpers stay (their tests are unchanged) but the renderer no longer uses the variants.

## 5. Tests and gate

- Letterbox: 1280 × 720 → 1; 1920 × 1080 → 1.5 with offsets 0; 2560 × 1440 → 2; a 1366 × 768 window → 1 with offsets (43, 24).
- World fit: a pure `worldFit(widthTiles, heightTiles)` in `render/` returning `{ scale, x, y }`; cutter → scale 0.8276 (768/928), x 256, y 94; starter → scale 0.96 (768/800 vs 380/384 = 0.9896, so 0.96), x 256, y 82.
- `npm test`, `npm run typecheck`, `npm run build`; the golden untouched (no sim change).
- **Visual check by Claude** with the scratchpad Playwright driver: the lobby, a running game, a seated console, the sector map and an enemy encounter, with no card overlapping another or the ship (the seated console cards and the game-over summary excepted, which overlay by design).
- Manual, two players: the same, plus the font at the window size used.

## 6. Plan

- **Task 1 (layout):** `resolution.ts`, `letterbox.ts` (+ test), `render/worldFit.ts` (new, pure, + test), `renderer.ts` (world scale and position from `worldFit`), `hud.ts` (every coordinate per §3), `enemyPanel.ts` (240 wide), `mapPanel.ts` (240 × 236 geometry), `src/main/index.ts` (min size follows). Commit `feat: a 1280 x 720 screen in non-overlapping bands: clock and power left, threats, enemy and the sector map right, notices top, player and console cards bottom, the ship scaled into the middle`.
- **Task 2 (flat tiles):** `tiles.ts`, `effects.ts` (drop damaged-floor decals), tests that referenced the removed sprites. Commit `feat: flat floors, walls and doors; no decorative wall or floor art; damage decals removed`.
- **Task 3:** Claude's visual check and fixes; `docs/gates.md` entry; roadmap item 14.
