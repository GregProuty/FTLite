import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildNotices, buildCreditLines } from '../src/renderer/src/render/creditsText';
import { parseManifest, type Manifest } from '../src/renderer/src/render/manifest';
import { CREDITS } from '../src/renderer/src/render/credits.generated';

const sample: Manifest = parseManifest([
  { file: 'raw/cozy/a.png', title: 'Cozy Space Interiors', author: 'Spaceyyy', source: 'https://oga/cozy', archived: 'https://web.archive.org/web/1/https://oga/cozy', license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', retrieved: '2026-11-10', credit: '"Cozy Space Interiors" by Spaceyyy (https://oga/cozy), CC-BY 4.0', name: 'floor.0' },
  { file: 'raw/cozy/b.png', title: 'Cozy Space Interiors', author: 'Spaceyyy', source: 'https://oga/cozy', archived: 'https://web.archive.org/web/1/https://oga/cozy', license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', retrieved: '2026-11-10', credit: '"Cozy Space Interiors" by Spaceyyy (https://oga/cozy), CC-BY 4.0', name: 'floor.1' },
  { file: 'raw/puny/p.png', title: 'Puny Characters', author: 'Shade', source: 'https://oga/puny', license: 'CC0-1.0', credit: '"Puny Characters" by Shade, CC0', name: 'crew.down' },
  { file: 'raw/font/f.ttf', title: 'Some Font', author: 'A Foundry', source: 'https://x', license: 'OFL-1.1', licenseFile: 'raw/font/OFL.txt', name: 'font.m5x7' },
  { file: 'art/tiles/breach.png', title: 'FTLite breach decal', author: 'FTLite project owner', source: 'assets/art', license: 'original', required: false, sheet: { frameW: 16, frameH: 16, frames: { 'breach.h': 0 }, animations: {} } },
  { file: 'art/crew/body_base.png', title: 'Puny Characters', author: 'Shade', source: 'https://oga/puny', license: 'CC0-1.0', modifications: 'recoloured', editedBy: 'FTLite project owner', credit: '"Puny Characters" by Shade, CC0', required: false, sheet: { frameW: 32, frameH: 32, frames: {}, animations: {} } }
]);

describe('buildNotices', () => {
  const text = buildNotices(sample, (p) => `OFL TEXT FOR ${p}`);
  it('groups by licence, lists CC-BY attribution fields once per asset, and names every file', () => {
    expect(text).toContain('== CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/) ==');
    expect(text.split('"Cozy Space Interiors" by Spaceyyy').length - 1).toBe(1);   // one block for two files
    expect(text).toContain('Files: raw/cozy/a.png, raw/cozy/b.png');
    expect(text).toContain('Title: Cozy Space Interiors'); expect(text).toContain('Author: Spaceyyy');
    expect(text).toContain('Source: https://oga/cozy'); expect(text).toContain('Modifications: none');
    expect(text).toContain('== CC0-1.0 (https://creativecommons.org/publicdomain/zero/1.0/) ==');
    expect(text).toContain('Modifications: recoloured (edited by FTLite project owner)');
  });
  it('appends the OFL text and omits original pieces', () => {
    expect(text).toContain('OFL TEXT FOR raw/font/OFL.txt');
    expect(text).not.toContain('FTLite breach decal');
  });
  it('is deterministic', () => { expect(buildNotices(sample, () => 'x')).toBe(buildNotices(sample, () => 'x')); });
});

describe('buildCreditLines', () => {
  it('lists each third-party credit once, then the in-house line', () => {
    const lines = buildCreditLines(sample);
    expect(lines[0]).toBe('FTLite');
    expect(lines.filter((l) => l.includes('Cozy Space Interiors'))).toHaveLength(1);
    expect(lines).toContain('"Puny Characters" by Shade, CC0');
    expect(lines).toContain('Some Font by A Foundry, OFL-1.1');
    expect(lines.at(-1)).toBe('Original art: FTLite project owner');
  });
});

describe('generated outputs are current', () => {
  const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
  it('THIRD_PARTY_NOTICES.txt matches the manifest', () => {
    expect(readFileSync('public/THIRD_PARTY_NOTICES.txt', 'utf8').replace(/\r\n/g, '\n')).toBe(buildNotices(real, (p) => readFileSync(`public/assets/${p}`, 'utf8').replace(/\r\n/g, '\n')));
  });
  it('credits.generated.ts matches the manifest', () => { expect([...CREDITS]).toEqual(buildCreditLines(real)); });
});
