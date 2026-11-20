// Audio-i spec sections 1-2: (re)writes the manifest's audio entries from the sound bank table, in table order, after
// every other entry. Idempotent: run `npx tsx scripts/audio-manifest.ts` again after editing SFX in
// src/renderer/src/audio/soundBank.ts, then `npm run credits`.
import { readFileSync, writeFileSync } from 'node:fs';
import { MUSIC, PACK_DIRS, isAudioName, sfxFiles } from '../src/renderer/src/audio/soundBank';
import { MOODS, type Mood } from '../src/renderer/src/audio/musicState';

const PATH = 'public/assets/manifest.json', RETRIEVED = '2026-11-17';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/', CCBY = 'https://creativecommons.org/licenses/by/4.0/', CCBY3 = 'https://creativecommons.org/licenses/by/3.0/';
const PACKS: Record<string, { title: string; source: string; archived: string; credit: string }> = {
  [PACK_DIRS.sci]: { title: 'Sci-fi Sounds', source: 'https://kenney.nl/assets/sci-fi-sounds', archived: 'https://web.archive.org/web/20261115051605/https://kenney.nl/assets/sci-fi-sounds', credit: '"Sci-fi Sounds" by Kenney (www.kenney.nl), CC0' },
  [PACK_DIRS.ui]: { title: 'Interface Sounds', source: 'https://kenney.nl/assets/interface-sounds', archived: 'https://web.archive.org/web/20261109194509/https://kenney.nl/assets/interface-sounds', credit: '"Interface Sounds" by Kenney (www.kenney.nl), CC0' }
};
/** The five tracks (music spike, 2026-11-19), all from OpenGameArt. Each was trimmed, level-matched and re-encoded, which every one of these licences allows. */
const OGA = 'https://opengameart.org/content/', OGA_BY = 'https://static.opengameart.org/OGA-BY-3.0.txt', MUSIC_RETRIEVED = '2026-11-19';
const MUSIC_EDIT = 'silence trimmed at both ends, level-matched, re-encoded to OGG Vorbis';
interface TrackInfo { title: string; author: string; user: string; slug: string; stamp: string; license: 'CC0-1.0' | 'CC-BY-4.0' | 'CC-BY-3.0' | 'OGA-BY-3.0' }
const TRACKS: Record<Mood, TrackInfo> = {
  calm: { title: 'Bit Space (FTL Inspired)', author: 'Beam Theory', user: 'beam-theory', slug: 'bit-space-ftl-inspired-loop-0', stamp: '20260220053333', license: 'OGA-BY-3.0' },
  space: { title: 'Observing the Star', author: 'yd', user: 'yd', slug: 'another-space-background-track', stamp: '20260725074235', license: 'CC0-1.0' },
  intrigue: { title: 'Cyberpunk Moonlight Sonata', author: 'Joth', user: 'joth', slug: 'cyberpunk-moonlight-sonata', stamp: '20260417093211', license: 'CC0-1.0' },
  adventure: { title: 'Brave Space Explorers', author: 'Alexandr Zhelanov', user: 'alexandr-zhelanov', slug: 'brave-space-explorers', stamp: '20250904102653', license: 'CC-BY-4.0' },
  combat: { title: 'Orbital Colossus', author: 'Matthew Pablo', user: 'matthew-pablo', slug: 'space-boss-battle-theme', stamp: '20260314112542', license: 'CC-BY-3.0' }
};
/** The credit names the licence in short: the in-game credits card is one narrow line per work (tests/hudFit.test.ts); the notices file carries the licence URL. */
const LICENCE_TEXT: Record<TrackInfo['license'], { url: string; credit: string }> = {
  'CC0-1.0': { url: CC0, credit: 'CC0' },
  'CC-BY-4.0': { url: CCBY, credit: 'CC-BY 4.0' },
  'CC-BY-3.0': { url: CCBY3, credit: 'CC-BY 3.0' },
  'OGA-BY-3.0': { url: OGA_BY, credit: 'OGA-BY 3.0' }
};

const text = readFileSync(PATH, 'utf8'), eol = text.includes('\r\n') ? '\r\n' : '\n';
const kept = (JSON.parse(text) as { name?: string }[]).filter((e) => !isAudioName(e.name));
const effects = sfxFiles().map((f) => {
  const p = PACKS[f.file.slice(0, f.file.lastIndexOf('/'))]!;
  return { file: f.file, title: p.title, author: 'Kenney', source: p.source, archived: p.archived, license: 'CC0-1.0', licenseUrl: CC0, retrieved: RETRIEVED, modifications: 'none', credit: p.credit, required: false, name: f.name };
});
const music = MOODS.map((mood) => {
  const t = TRACKS[mood], l = LICENCE_TEXT[t.license];
  return { file: MUSIC[mood].file, title: t.title, author: t.author, source: OGA + t.slug, archived: `https://web.archive.org/web/${t.stamp}/${OGA}${t.slug}`, license: t.license, licenseUrl: l.url,
    retrieved: MUSIC_RETRIEVED, modifications: MUSIC_EDIT, credit: `'${t.title}' by ${t.author} (opengameart.org/users/${t.user}), ${l.credit}`, required: false, name: MUSIC[mood].name };
});
writeFileSync(PATH, JSON.stringify([...kept, ...effects, ...music], null, 2).replace(/\n/g, eol) + eol);
console.log(`wrote ${effects.length} effect and ${music.length} music entries to ${PATH}`);
