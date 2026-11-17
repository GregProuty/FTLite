// Audio-i spec sections 1-2: (re)writes the manifest's audio entries from the sound bank table, in table order, after
// every other entry. Idempotent: run `npx tsx scripts/audio-manifest.ts` again after editing SFX in
// src/renderer/src/audio/soundBank.ts, then `npm run credits`.
import { readFileSync, writeFileSync } from 'node:fs';
import { MUSIC_BATTLE, MUSIC_CALM, MUSIC_FILES, PACK_DIRS, isAudioName, sfxFiles } from '../src/renderer/src/audio/soundBank';

const PATH = 'public/assets/manifest.json', RETRIEVED = '2026-11-17';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/', CCBY = 'https://creativecommons.org/licenses/by/4.0/';
const PACKS: Record<string, { title: string; source: string; archived: string; credit: string }> = {
  [PACK_DIRS.sci]: { title: 'Sci-fi Sounds', source: 'https://kenney.nl/assets/sci-fi-sounds', archived: 'https://web.archive.org/web/20261115051605/https://kenney.nl/assets/sci-fi-sounds', credit: '"Sci-fi Sounds" by Kenney (www.kenney.nl), CC0' },
  [PACK_DIRS.ui]: { title: 'Interface Sounds', source: 'https://kenney.nl/assets/interface-sounds', archived: 'https://web.archive.org/web/20261109194509/https://kenney.nl/assets/interface-sounds', credit: '"Interface Sounds" by Kenney (www.kenney.nl), CC0' }
};
const TRACKS: Record<string, { title: string; source: string; archived: string }> = {
  [MUSIC_CALM]: { title: 'Cobalt', source: 'https://www.scottbuckley.com.au/library/cobalt/', archived: 'https://web.archive.org/web/20261026145225/https://www.scottbuckley.com.au/library/cobalt/' },
  [MUSIC_BATTLE]: { title: 'Time and Space', source: 'https://www.scottbuckley.com.au/library/time-and-space/', archived: 'https://web.archive.org/web/20251205061037/https://www.scottbuckley.com.au/library/time-and-space/' }
};

const text = readFileSync(PATH, 'utf8'), eol = text.includes('\r\n') ? '\r\n' : '\n';
const kept = (JSON.parse(text) as { name?: string }[]).filter((e) => !isAudioName(e.name));
const effects = sfxFiles().map((f) => {
  const p = PACKS[f.file.slice(0, f.file.lastIndexOf('/'))]!;
  return { file: f.file, title: p.title, author: 'Kenney', source: p.source, archived: p.archived, license: 'CC0-1.0', licenseUrl: CC0, retrieved: RETRIEVED, modifications: 'none', credit: p.credit, required: false, name: f.name };
});
const music = Object.entries(MUSIC_FILES).map(([name, file]) => {
  const t = TRACKS[name]!;
  return { file, title: t.title, author: 'Scott Buckley', source: t.source, archived: t.archived, license: 'CC-BY-4.0', licenseUrl: CCBY, retrieved: RETRIEVED, modifications: 'none',
    credit: `'${t.title}' by Scott Buckley, CC-BY 4.0 (creativecommons.org/licenses/by/4.0). www.scottbuckley.com.au`, required: false, name };
});
writeFileSync(PATH, JSON.stringify([...kept, ...effects, ...music], null, 2).replace(/\n/g, eol) + eol);
console.log(`wrote ${effects.length} effect and ${music.length} music entries to ${PATH}`);
