// The settings store and the controls list (main menu spec, 2026-11-16), kept from mainMenu.test.ts when the DOM menu
// moved to React (UI-i).
import { describe, expect, it } from 'vitest';
import { controlSections, keyLabel } from '../src/renderer/src/app/controlsList';
import { FIRE_HELD, INTERACT_HELD, MOVE_CODES, PRESS_CODES } from '../src/renderer/src/app/duel/input';
import { SECTOR_KEYS } from '../src/renderer/src/input/sources';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, VOLUME_CHANNELS, VOLUME_STEPS } from '../src/renderer/src/app/settingsStore';

describe('settings store (Audio-i spec section 6)', () => {
  const memory = () => { const map = new Map<string, string>(); return { map, storage: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } } }; };
  it('persists the three volumes and falls back to the default on missing, malformed or unknown data', () => {
    const { map, storage } = memory();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ version: 2, master: 1, music: 0.5, effects: 1, shake: 'full', soloShip: 'hound', valkyrnLaserFit: false });   // music at half (owner 2026-11-17); Feel-i: full shake
    saveSettings(storage, { version: 2, master: 0.25, music: 0.5, effects: 0, shake: 'low', soloShip: 'hound', valkyrnLaserFit: false }); expect(loadSettings(storage)).toEqual({ version: 2, master: 0.25, music: 0.5, effects: 0, shake: 'low', soloShip: 'hound', valkyrnLaserFit: false });
    for (const bad of ['{', '[]', 'null', '{"version":3,"master":0}', '{"version":"2"}']) { map.set(SETTINGS_KEY, bad); expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS); }
    map.set(SETTINGS_KEY, '{"version":2,"master":0.3,"music":"1","effects":0.75}');
    expect(loadSettings(storage)).toEqual({ version: 2, master: 1, music: 0.5, effects: 0.75, shake: 'full', soloShip: 'hound', valkyrnLaserFit: false });   // field by field (no shake: full)
    map.set(SETTINGS_KEY, '{"version":2,"master":1,"music":1,"effects":1,"shake":"wild"}'); expect(loadSettings(storage).shake).toBe('full');
    map.set(SETTINGS_KEY, '{"version":2,"master":1,"music":1,"effects":1,"shake":"off"}'); expect(loadSettings(storage).shake).toBe('off');
    const throwing = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS); expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
    for (const ch of VOLUME_CHANNELS) expect(VOLUME_STEPS).toContain(DEFAULT_SETTINGS[ch]);
  });
  it('migrates a version 1 record: its volume becomes Master, and Music starts at its default half and Effects full', () => {
    const { map, storage } = memory();
    map.set(SETTINGS_KEY, '{"version":1,"volume":0.25}'); expect(loadSettings(storage)).toEqual({ version: 2, master: 0.25, music: 0.5, effects: 1, shake: 'full', soloShip: 'hound', valkyrnLaserFit: false });
    map.set(SETTINGS_KEY, '{"version":1,"volume":0}'); expect(loadSettings(storage).master).toBe(0);
    for (const bad of ['{"version":1,"volume":0.3}', '{"version":1,"volume":"1"}', '{"version":1}']) { map.set(SETTINGS_KEY, bad); expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS); }
  });
});

describe('the controls list', () => {
  it('names every bound key from the input tables, with no gamepad or second keyboard', () => {
    const sections = controlSections(), all = sections.flatMap(s => s.rows.map(r => r.keys)).join(' | ');
    expect(sections.map(s => s.title)).toEqual(['Single player', 'Single player: Valkyrn', 'Multiplayer', 'Anywhere']);
    for (const code of Object.keys(PRESS_CODES)) expect(all).toContain(keyLabel(code));
    for (const code of [...Object.values(MOVE_CODES), INTERACT_HELD, FIRE_HELD]) expect(all).toContain(keyLabel(code));
    const sector = sections.find(s => s.title === 'Multiplayer')!.rows.map(r => r.keys).join(' ');
    for (const code of [SECTOR_KEYS.up, SECTOR_KEYS.left, SECTOR_KEYS.down, SECTOR_KEYS.right, SECTOR_KEYS.interact, SECTOR_KEYS.confirm, SECTOR_KEYS.cancel, SECTOR_KEYS.callout]) expect(sector).toContain(keyLabel(code));
    expect(sections[0]!.rows.find(r => r.keys === 'M')!.action).toContain('main menu');
    expect(all).not.toMatch(/pad|stick|arrow/i);
    const action = (keys: string): string => sections[0]!.rows.find(r => r.keys === keys)!.action;   // interior zoom spec rule 6
    expect([action('Mouse wheel'), action('Middle drag'), action('C')].every(t => /ship/.test(t))).toBe(true);
    expect(action('Left click')).toMatch(/Weapons.*pew/);   // W-1: the pew's left click
    expect(action('Z')).toMatch(/Weapons.*AUTO.*MANUAL/);   // W-2: the laser's mode
    expect(action('V')).toMatch(/Weapons.*torpedo.*AUTO.*MANUAL/);   // W-3: the torpedo's mode
    expect(action('Right click or drag')).toMatch(/Helm.*heading/);   // Feel-ii: the Helm's right button aims the heading
    expect(action('G / Middle click')).toBe('Ping the map point (or the enemy) for the crew');
    expect(sections[0]!.rows.some((r) => r.keys === 'Shift+W' || /notch/.test(r.action))).toBe(false);   // playtest2feedback §6: the crew Helm has no notches
    expect([action('Hold W / S'), action('Hold left mouse'), action('A Q / D E / ← →'), action('↑ ↓'), action('1 / 2')].every((t) => t.startsWith('At the Helm'))).toBe(true);
    expect([keyLabel('KeyE'), keyLabel('Equal'), keyLabel('NumpadAdd'), keyLabel('Escape')]).toEqual(['E', '=', 'Num +', 'Esc']);
  });
});
