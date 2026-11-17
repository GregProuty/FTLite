// npm run art:palette (Art-ii spec section 4): rebuilds src/renderer/src/render/palette.json from the art/import.json
// frames in FTLITE_ASSETS (else the owner's folder), the current palette's roles and ramps, and art/palette-overrides.json.
// Run npm run art:import afterwards so the sheets use the new palette. Exits 1 without writing anything on a problem.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPalette, packReader } from './art/buildPalette';
import { sourceFolder } from './art/importCore';

const PALETTE = 'src/renderer/src/render/palette.json';
try {
  const result = buildPalette({
    config: JSON.parse(readFileSync('art/import.json', 'utf8')),
    read: packReader(sourceFolder(process.env)),
    current: JSON.parse(readFileSync(PALETTE, 'utf8')),
    overrides: JSON.parse(readFileSync('art/palette-overrides.json', 'utf8'))
  });
  writeFileSync(PALETTE, result.text);
  console.log(`wrote ${PALETTE} (${result.file.colours.length} colours, ${result.kept} kept from the explosion pack)`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
