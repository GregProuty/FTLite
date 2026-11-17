# Deep Space backdrop with twinkling stars (Art-v): design

Date: 2026-11-16. Owner: "make this the background and make the stars twinkle", pointing at `Downloads\battlemaps\Diver-Class Scout Ship\Deep Space - Red - 32x22.jpg`. Tier: views (one-page spec, build, one review, owner look check).

## Source and licence

- `Deep Space - Red - 32x22.jpg` (2304x1584) is from the 2-Minute Tabletop Diver-Class pack the owner bought, under CC BY-NC 4.0, the same terms as the Hound. The owner says the demo is non-commercial.
- It is staged as a PNG at `C:\Users\djuar\FTLite-assets\2mt-diver\deep-space-red.png` (already converted). `npm run art:import` copies it raw (`remap: false`, no flip) to `public/assets/paid/2mt/deep-space-red.png`, which is gitignored.
- The manifest entry follows the Hound's: licence `CC-BY-NC-4.0`, file under `paid/`, `required: false`, name `space.backdrop`. Its credit line names Deep Space (Red) from the Diver-Class Scout Ship pack by 2-Minute Tabletop under CC BY-NC 4.0. Regenerate credits, and extend the existing Hound gate in `docs/gates.md` to cover this image.

## 1. The backdrop

- The image covers the whole 1280x720 internal stage in the sector view and in the duel interior view. "Cover" means it is scaled to fill the stage and centred, with the excess cropped. That gives a scale of max(1280/2304, 720/1584) = 0.5556, so it shows at 1280x880 with 80 px cropped top and bottom.
- It sits behind everything, in the place of today's procedural starfield: at stage index 0 in `renderer.ts`, and under the world in `duel/interiorView.ts`.
- It uses linear filtering with mipmaps, the same pattern as `battlemapLayer.ts`, including setting the flags before the texture's first upload.
- When the asset is loaded, today's drifting procedural starfield (`stars()` in `lightsModel.ts`) is not drawn. When the asset is missing (a fresh clone), today's starfield draws exactly as before.
- The duel's helm (tactical map) view keeps its own background. Only the interior and sector ship views change.

## 2. Twinkling stars

- **The star list.** The painted stars are small bright orange specks. A deterministic script, `scripts/art/findStars.ts` (`npm run art:stars`, pngjs and scripts only), reads the staged PNG and finds stars:
  - star pixels are those with luminance >= 110 (0.3R + 0.59G + 0.11B); tune the threshold so the clear specks are caught but not the dull ones;
  - each 4-connected component of star pixels is one star: its centroid x and y in source pixels, its pixel count (size) and its peak luminance;
  - components larger than 40 px are dropped, because they are not stars.
  
  It writes `art/deep-space-red.stars.json`: `{ "source": "2mt-diver/deep-space-red.png", "width": 2304, "height": 1584, "stars": [[x, y, size, peak], ...] }`, sorted by y then x. The file holds coordinates only, no image data, and it is committed.
- **The twinkle model**, `render/twinkleModel.ts`, is pure. Each star k gets the following, all deterministic from k through the existing `hash2`:
  - a frequency of 0.25 to 1.0 Hz;
  - a phase;
  - a depth of 0.6 to 1 (the alpha swing; tuned up from 0.35-0.85 so the twinkle reads).
  
  `twinkleAlpha(k, t, feelScale) = 1 - depth * feelScale * (0.5 + 0.5 * sin(2π f t + φ))^3`. The cube keeps a star mostly lit with brief dips. A few bright stars (peak in the top 10 %) also get a slow cross-glint pulse. The output is clamped to [0, 1]. `feelScale` 0 (feel off) gives a constant 1, which is no twinkle.
- **The twinkle layer**, `render/twinkleLayer.ts`. One additive soft-dot sprite per star sits over its painted speck, mapped through the same cover transform as the backdrop.
  - The dot's radius is `2 + sqrt(size)` source px (tuned), glow alpha 1 x twinkleAlpha, threshold 80 (372 stars; 110 found only 130) scaled to the stage. Its tint is the star's orange; take it as the warm role from the palette, or sample the speck's mean colour in the script and store it.
  - The dot brightens and dims the speck: alpha = (1 - twinkleAlpha) for a darkening overlay, or an additive glow with alpha = twinkleAlpha * 0.6. Pick whichever looks right in screenshots and record it.
  - It runs on the presentation clock that interior feel already uses, so a pause freezes it, and it respects the feel setting.
  - Use one shared generated dot texture and plain Sprites in a Container. With hundreds of stars, update only alpha each frame; no Graphics redraws.
- Without the star JSON or the asset, nothing twinkles.

## 3. Tests and checks

- `findStars`: a unit test on a generated PNG fixture with known specks (centroids, sizes, the size cap, the threshold, and sort order). The script is deterministic: the same input gives byte-identical JSON.
- `twinkleModel`: the output stays in [0, 1]; it is periodic in t; it is deterministic per k; feelScale 0 gives 1; different stars get different phases.
- Layer choice: the backdrop and twinkle layers are used only when `space.backdrop` is loaded, and the old starfield only when it is not. Test the pure decision.
- `npm run typecheck`, `npm test`, `npm run test:determinism` (render-only change, so it must pass unchanged), and `npm run build`.
- Screenshots (owner gate): the duel interior and the sector view in `C:\Users\djuar\FTLite-shots\art-v\`, plus two frames 0.5 s apart that show the twinkle.
