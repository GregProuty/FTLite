import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { LICENSE_URLS, licenseAllowed } from '../src/renderer/src/render/licenses';
import { buildCreditLines, buildNotices } from '../src/renderer/src/render/creditsText';
import { ASSET_NAMES } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES, featureReady } from '../src/renderer/src/render/fallback';

/** Paid assets in the manifest (Art-i spec section 2). */
const paid = {
  file: 'paid/house-interior/floor.png', title: 'House Interior Pack', author: 'Example Studio', source: 'https://example.itch.io/house-interior',
  license: 'paid', retrieved: '2026-11-20', credit: 'House Interior Pack by Example Studio (commercial licence)', required: false,
  sheet: { frameW: 16, frameH: 16, frames: { 'house.floor.0': 0, 'house.floor.1': 1, 'house.floor.2': 2, 'house.floor.3': 3 }, animations: {} }
};
const font = { file: 'raw/m5x7/m5x7.ttf', title: 'm5x7', author: 'Daniel Linssen', source: 'https://managore.itch.io/m5x7', license: 'CC0-1.0', name: 'font.m5x7' };

describe('the paid licence', () => {
  it('is allowed, has no public licence URL, and accepts a well-formed paid entry under paid/', () => {
    expect(licenseAllowed('paid', 'none')).toBe(true);
    expect(Object.keys(LICENSE_URLS)).not.toContain('paid'); expect(Object.keys(LICENSE_URLS)).not.toContain('original');
    const [e] = parseManifest([paid]);
    expect(e!.required).toBe(false); expect(e!.license).toBe('paid');
  });
  it('licence paid and a file under paid/ go together, both ways', () => {
    expect(() => parseManifest([{ ...paid, file: 'raw/house/floor.png' }])).toThrow(/licence paid and a file under paid\/ go together/);
    expect(() => parseManifest([{ ...font, file: 'paid/m5x7.ttf' }])).toThrow(/licence paid and a file under paid\/ go together/);
  });
  it('a paid entry must be required: false (the default true is refused too)', () => {
    expect(() => parseManifest([{ ...paid, required: true }])).toThrow(/required: false/);
    const { required: _r, ...noRequired } = paid;
    expect(() => parseManifest([noRequired])).toThrow(/required: false/);
  });
  it('a paid entry needs a store URL as source, a purchase date and a credit line', () => {
    expect(() => parseManifest([{ ...paid, source: 'bought on itch' }])).toThrow(/store page URL/);
    const { retrieved: _d, ...noDate } = paid;
    expect(() => parseManifest([noDate])).toThrow(/purchase date/);
    const { credit: _c, ...noCredit } = paid;
    expect(() => parseManifest([noCredit])).toThrow(/credit line/);
  });
  it('accepts a paid/ path in the file pattern and still refuses paths outside raw/, art/ and paid/', () => {
    expect(() => parseManifest([{ ...paid, file: 'store/floor.png' }])).toThrow(/raw\/, art\/ or paid\//);
  });
});

describe('no two entries bind the same name', () => {
  it('refuses a paid file that shadows a free entry by binding its name', () => {
    const free = { ...font, file: 'raw/a.ttf' }, shadow = { ...paid, sheet: { frameW: 16, frameH: 16, frames: {}, animations: {} }, name: undefined };
    expect(() => parseManifest([free, { ...free, file: 'raw/b.ttf' }])).toThrow(/name font\.m5x7 is already bound by raw\/a\.ttf/);
    expect(() => parseManifest([paid, { ...shadow, file: 'paid/other.png', sheet: { ...shadow.sheet, frames: { 'house.floor.2': 0 } } }])).toThrow(/house\.floor\.2 is already bound/);
  });
  it('the real manifest binds every name once', () => {
    expect(() => parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')))).not.toThrow();
  });
});

describe('paid entries in the notices and the credits', () => {
  const m = parseManifest([font, paid]);
  it('prints the title, author, credit line and the commercial licence with the store page', () => {
    const text = buildNotices(m, () => '');
    expect(text).toContain('== paid (commercial licences) ==');
    expect(text).toContain('House Interior Pack by Example Studio (commercial licence)');
    expect(text).toContain('  Title: House Interior Pack'); expect(text).toContain('  Author: Example Studio');
    expect(text).toContain('  Licence: paid (commercial licence, https://example.itch.io/house-interior)');
    expect(text).not.toContain('undefined');
  });
  it('prefers licenseUrl over the store page when given', () => {
    const text = buildNotices(parseManifest([{ ...paid, licenseUrl: 'https://example.itch.io/licence' }]), () => '');
    expect(text).toContain('  Licence: paid (commercial licence, https://example.itch.io/licence)');
  });
  it('lists the paid credit line on the credits screen', () => {
    expect(buildCreditLines(m)).toContain('House Interior Pack by Example Studio (commercial licence)');
  });
});

describe('house floor names (Art-i spec section 2)', () => {
  it('registers house.floor.0 to 3 as optional and groups them as the houseFloor feature', () => {
    for (let n = 0; n < 4; n++) expect(ASSET_NAMES[`house.floor.${n}`]).toBe('optional');
    expect(FEATURE_NAMES.houseFloor).toEqual(['house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3']);
    expect(featureReady(new Set(['house.floor.2']), 'houseFloor')).toBe(false);
    expect(featureReady(new Set(), 'houseFloor')).toBe(true);
  });
});
