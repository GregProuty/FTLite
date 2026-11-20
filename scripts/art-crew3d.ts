// npm run art:crew3d (Crew3D spec section 1): binds the rendered crew sheets in public/assets/manifest.json. Run it after
// tools/sprite-render/render.py has written public/assets/art/crew3d/*.png and crew3d.generated.json: the entries are
// rebuilt from that layout (crew3dModel.crew3dSheet), replacing any earlier art/crew3d/ entries in place.
import { readFileSync, writeFileSync } from 'node:fs';
import { CREW3D_SHEETS, crew3dSheet } from '../src/renderer/src/render/crew3dModel';
import { OWNER_AUTHOR } from '../src/renderer/src/render/licenses';
import { parseManifest } from '../src/renderer/src/render/manifest';

const MANIFEST = 'public/assets/manifest.json';
const TITLES: Readonly<Record<string, string>> = { crewA: 'FTLite rendered crew (heavy suit)', crewB: 'FTLite rendered crew (light suit)', boarder: 'FTLite rendered boarder' };

const text = readFileSync(MANIFEST, 'utf8'), eol = text.includes('\r\n') ? '\r\n' : '\n';
const entries = (JSON.parse(text) as { file: string }[]).filter((e) => !e.file.startsWith('art/crew3d/'));
for (const s of CREW3D_SHEETS) entries.push({
  file: s.file, title: `${TITLES[s.char] ?? `FTLite rendered ${s.char}`}${s.mask ? ', team colour layer' : ''}`, author: OWNER_AUTHOR, source: 'assets/art', license: 'original',
  required: false, sheet: crew3dSheet(s.char, s.mask)
} as { file: string });
parseManifest(entries);   // throws with every problem before anything is written
writeFileSync(MANIFEST, JSON.stringify(entries, null, 2).replace(/\n/g, eol) + eol);
console.log(`wrote ${MANIFEST}: ${CREW3D_SHEETS.length} crew3d sheets bound`);
