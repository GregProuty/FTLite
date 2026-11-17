// The settings store and the controls list (main menu spec, 2026-11-16), kept from mainMenu.test.ts when the DOM menu
// moved to React (UI-i).
import { describe, expect, it } from 'vitest';
import { controlSections, keyLabel } from '../src/renderer/src/app/controlsList';
import { FIRE_HELD, INTERACT_HELD, MOVE_CODES, PRESS_CODES } from '../src/renderer/src/app/duel/input';
import { SECTOR_KEYS } from '../src/renderer/src/input/sources';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, VOLUME_STEPS } from '../src/renderer/src/app/settingsStore';

describe('settings store', () => {
  it('persists the volume and falls back to the default on missing, malformed or unknown data', () => {
    const map = new Map<string, string>(), storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    saveSettings(storage, { version: 1, volume: 0.25 }); expect(loadSettings(storage)).toEqual({ version: 1, volume: 0.25 });
    for (const bad of ['{', '[]', '{"version":2,"volume":0}', '{"version":1,"volume":0.3}', '{"version":1,"volume":"1"}']) { map.set(SETTINGS_KEY, bad); expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS); }
    const throwing = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS); expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
    expect(VOLUME_STEPS).toContain(DEFAULT_SETTINGS.volume);
  });
});

describe('the controls list', () => {
  it('names every bound key from the input tables, with no gamepad or second keyboard', () => {
    const sections = controlSections(), all = sections.flatMap(s => s.rows.map(r => r.keys)).join(' | ');
    expect(sections.map(s => s.title)).toEqual(['Single player', 'Multiplayer', 'Anywhere']);
    for (const code of Object.keys(PRESS_CODES)) expect(all).toContain(keyLabel(code));
    for (const code of [...Object.values(MOVE_CODES), INTERACT_HELD, FIRE_HELD]) expect(all).toContain(keyLabel(code));
    const sector = sections[1]!.rows.map(r => r.keys).join(' ');
    for (const code of [SECTOR_KEYS.up, SECTOR_KEYS.left, SECTOR_KEYS.down, SECTOR_KEYS.right, SECTOR_KEYS.interact, SECTOR_KEYS.confirm, SECTOR_KEYS.cancel, SECTOR_KEYS.callout]) expect(sector).toContain(keyLabel(code));
    expect(sections[0]!.rows.find(r => r.keys === 'M')!.action).toContain('main menu');
    expect(all).not.toMatch(/pad|stick|arrow/i);
    const action = (keys: string): string => sections[0]!.rows.find(r => r.keys === keys)!.action;   // interior zoom spec rule 6
    expect([action('Mouse wheel'), action('Right or middle drag'), action('C')].every(t => /ship/.test(t))).toBe(true);
    expect([keyLabel('KeyE'), keyLabel('Equal'), keyLabel('NumpadAdd'), keyLabel('Escape')]).toEqual(['E', '=', 'Num +', 'Esc']);
  });
});
