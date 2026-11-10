import { describe, it, expect } from 'vitest';
import { LICENSES, licenseAllowed } from '../src/renderer/src/render/licenses';
import { ASSET_NAMES, FACINGS, requiredNames } from '../src/renderer/src/render/assetNames';
import { parseManifest, boundNames } from '../src/renderer/src/render/manifest';

const cozy = {
  file: 'raw/cozy-space-interiors/door_slide.png', title: 'Cozy Space Interiors', author: 'Spaceyyy',
  source: 'https://opengameart.org/content/cozy-space-interiors-16-px-top-down-sci-fi-tileset',
  archived: 'https://web.archive.org/web/20261110000000/https://opengameart.org/content/cozy-space-interiors-16-px-top-down-sci-fi-tileset',
  license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', retrieved: '2026-11-10',
  modifications: 'none', credit: '"Cozy Space Interiors" by Spaceyyy, CC-BY 4.0', required: true,
  sheet: { frameW: 16, frameH: 32, frames: { 'door.closed': 0, 'door.sealed': 4 }, animations: { 'door.open': { frames: [0, 1, 2, 3], fps: 12, loop: false } } }
};
const font = { file: 'raw/m5x7/m5x7.ttf', title: 'm5x7', author: 'Daniel Linssen', source: 'https://managore.itch.io/m5x7', license: 'CC0-1.0', name: 'font.m5x7' };

describe('licenses', () => {
  it('allows the §12 list and rejects everything else', () => {
    expect(LICENSES).toEqual(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'OGA-BY-3.0', 'OFL-1.1', 'original', 'CC-BY-SA-4.0']);
    expect(licenseAllowed('CC0-1.0', 'recoloured')).toBe(true);
    expect(licenseAllowed('CC-BY-SA-4.0', 'none')).toBe(true);
    expect(licenseAllowed('CC-BY-SA-4.0', 'recoloured')).toBe(false);
    expect(licenseAllowed('GPL-3.0', 'none')).toBe(false);
    expect(licenseAllowed('CC-BY-NC-4.0', 'none')).toBe(false);
  });
});

describe('assetNames', () => {
  it('lists every name the renderer uses, with the 8 facings expanded', () => {
    expect(FACINGS).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
    for (const f of FACINGS) { expect(ASSET_NAMES[`crew.idle.${f}`]).toBe('required'); expect(ASSET_NAMES[`crew.walk.${f}`]).toBe('required'); }
    for (const n of ['floor.0', 'floor.3', 'wall.flat', 'wall.plain', 'wall.vent', 'wall.pipes', 'wall.screen', 'door.closed', 'door.sealed', 'door.open',
      'fire.loop', 'crew.down', 'ui.panel', 'ui.bar.bg', 'ui.bar.fill', 'prompt.kb.E', 'prompt.kb.F', 'prompt.kb.Q', 'prompt.kb.Enter', 'prompt.kb.ShiftRight',
      'prompt.kb.Backspace', 'prompt.pad.A', 'prompt.pad.X', 'prompt.pad.B', 'font.m5x7']) expect(ASSET_NAMES[n]).toBe('required');
    for (const n of ['breach.h', 'breach.v', 'floor.damaged.0', 'floor.damaged.1', 'vent.puff', 'fx.arc', 'crew.sit', 'icon.fire', 'icon.oxygen', 'icon.breach',
      'icon.door', 'icon.repair', 'icon.medical', 'icon.power', 'icon.sensors', 'icon.weapons', 'icon.navigation']) expect(ASSET_NAMES[n]).toBe('optional');
    expect(ASSET_NAMES['floor.4']).toBeUndefined();
    expect(requiredNames()).toContain('door.open');
    expect(requiredNames()).not.toContain('breach.h');
  });
});

describe('parseManifest', () => {
  it('accepts a sheet entry and a single-name entry and reports bound names', () => {
    const m = parseManifest([cozy, font]);
    expect(m).toHaveLength(2);
    expect(boundNames(m[0]!)).toEqual(['door.closed', 'door.sealed', 'door.open']);
    expect(boundNames(m[1]!)).toEqual(['font.m5x7']);
    expect(m[0]!.required).toBe(true);
    expect(m[1]!.required).toBe(true);        // default
    expect(m[1]!.modifications).toBe('none'); // default
  });
  it('rejects a licence off the allow-list and CC-BY-SA with modifications', () => {
    expect(() => parseManifest([{ ...font, license: 'GPL-3.0' }])).toThrow(/license/);
    expect(() => parseManifest([{ ...font, license: 'CC-BY-SA-4.0', modifications: 'recoloured' }])).toThrow(/CC-BY-SA/);
  });
  it('requires exactly one of name or sheet, and a file under raw/ or art/', () => {
    expect(() => parseManifest([{ ...font, name: undefined }])).toThrow(/name or sheet/);
    expect(() => parseManifest([{ ...cozy, name: 'x' }])).toThrow(/name or sheet/);
    expect(() => parseManifest([{ ...font, file: 'assets/raw/m5x7/m5x7.ttf' }])).toThrow(/file/);
  });
  it('rejects an entry whose file appears twice and malformed nineSlice or animation', () => {
    expect(() => parseManifest([font, font])).toThrow(/twice/);
    expect(() => parseManifest([{ ...font, nineSlice: { left: 4, top: 4, right: 4 } }])).toThrow();
    expect(() => parseManifest([{ ...cozy, sheet: { ...cozy.sheet, animations: { 'door.open': { frames: [], fps: 12, loop: false } } } }])).toThrow();
  });
  it('requires original entries to name the owner, use source assets/art and carry no archived URL', () => {
    const orig = { file: 'art/tiles/breach.png', title: 'FTLite breach decal', author: 'FTLite project owner', source: 'assets/art', license: 'original', required: false, sheet: { frameW: 16, frameH: 16, frames: { 'breach.h': 0, 'breach.v': 1 }, animations: {} } };
    expect(parseManifest([orig])).toHaveLength(1);
    expect(() => parseManifest([{ ...orig, author: 'Someone Else' }])).toThrow(/original/);
    expect(() => parseManifest([{ ...orig, source: 'https://example.com' }])).toThrow(/original/);
    expect(() => parseManifest([{ ...orig, archived: 'https://web.archive.org/x' }])).toThrow(/original/);
  });
  it('requires derived art/ files to carry a third-party licence and a real modification note', () => {
    const derived = { file: 'art/crew/body_base.png', title: 'Puny Characters', author: 'Shade', source: 'https://opengameart.org/content/puny-characters', license: 'CC0-1.0', modifications: 'outfit recoloured to light grey', editedBy: 'FTLite project owner', required: false, sheet: { frameW: 32, frameH: 32, frames: {}, animations: {} } };
    expect(parseManifest([derived])).toHaveLength(1);
    expect(() => parseManifest([{ ...derived, modifications: 'none' }])).toThrow(/derived/);
    expect(() => parseManifest([{ ...derived, editedBy: undefined }])).toThrow(/derived/);
  });
  it('requires CC-BY entries to carry credit and archived URL', () => {
    expect(() => parseManifest([{ ...cozy, credit: undefined }])).toThrow(/credit/);
    expect(() => parseManifest([{ ...cozy, archived: undefined }])).toThrow(/archived/);
  });
});

import { pngSize } from '../src/renderer/src/render/png';

describe('pngSize', () => {
  const png = (w: number, h: number): Uint8Array => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);          // IHDR length + type
    new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  it('reads width and height from the IHDR chunk', () => {
    expect(pngSize(png(160, 32))).toEqual({ width: 160, height: 32 });
    expect(pngSize(png(1, 70000))).toEqual({ width: 1, height: 70000 });
  });
  it('rejects a non-PNG', () => {
    expect(() => pngSize(new Uint8Array(40))).toThrow(/PNG/);
    expect(() => pngSize(png(16, 16).slice(0, 20))).toThrow(/PNG/);
  });
});
