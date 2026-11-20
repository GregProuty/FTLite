// @vitest-environment jsdom
// Valkyrn spec §8, §9: Single player opens the ship choice (Hound, Valkyrn, Back); the choice starts the duel and is remembered;
// Settings holds the developer switch "Valkyrn: fit laser instead of gun". Settings records read the new fields field by field.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { buttonIds, renderUi } from './helpers/uiRender';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from '../src/renderer/src/app/settingsStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const click = (id: string): void => { fireEvent.click(screen.getByTestId(id)); };

describe('the ship picker (Valkyrn spec §9)', () => {
  it('Single player lists the solo ships and Back; a ship starts the duel on it and is remembered', () => {
    const { deps, store, view } = renderUi();
    click('single-player');
    expect(buttonIds(view.container)).toEqual(['ship-hound', 'ship-valkyrn', 'back']);
    expect(screen.getByTestId('page-title').textContent).toBe('Single player');
    click('ship-valkyrn');
    expect(deps.single).toHaveBeenCalledWith('valkyrn');
    expect(store.getState().settings.soloShip).toBe('valkyrn');
    expect(store.getState().menu.page).toBe('single');
  });
  it('Back returns home without starting anything', () => {
    const { deps, store } = renderUi();
    click('single-player'); click('back');
    expect(store.getState().menu.page).toBe('home');
    expect(deps.single).not.toHaveBeenCalled();
  });
  it('the Settings switch fits the laser', () => {
    const setLaserFit = vi.fn(), { store } = renderUi({ deps: { setLaserFit } });
    click('settings');
    const box = screen.getByTestId('valkyrn-laser-fit') as HTMLInputElement;
    expect(box.checked).toBe(false);
    act(() => { fireEvent.click(box); });
    expect(setLaserFit).toHaveBeenCalledWith(true);
    expect(store.getState().settings.valkyrnLaserFit).toBe(true);
  });
  it('the Settings map grid starts Off, lists Off first and switches to the square grid (owner 2026-11-19)', () => {
    const setMapGrid = vi.fn(), { store } = renderUi({ deps: { setMapGrid } });
    click('settings');
    const pick = screen.getByTestId('map-grid') as HTMLSelectElement;
    expect(pick.value).toBe('off');
    expect(Array.from(pick.options).map((o) => o.textContent)).toEqual(['Off', 'Gravity well', 'Square']);
    act(() => { fireEvent.change(pick, { target: { value: 'square' } }); });
    expect(setMapGrid).toHaveBeenCalledWith('square');
    expect(store.getState().settings.mapGrid).toBe('square');
  });
  it('helm round 2 §6.3: the Settings throttle tap starts at 200 ms, offers 150 / 200 / 250 / 300, and saves a change', () => {
    const setThrottleTap = vi.fn(), { store } = renderUi({ deps: { setThrottleTap } });
    click('settings');
    const pick = screen.getByTestId('throttle-tap') as HTMLSelectElement;
    expect(pick.value).toBe('200');
    expect(Array.from(pick.options).map((o) => o.textContent)).toEqual(['150 ms', '200 ms', '250 ms', '300 ms']);
    act(() => { fireEvent.change(pick, { target: { value: '300' } }); });
    expect(setThrottleTap).toHaveBeenCalledWith(300);
    expect(store.getState().settings.throttleTapMs).toBe(300);
  });
});

describe('the settings record (Valkyrn spec §9)', () => {
  const map = new Map<string, string>(), storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
  it('defaults to the Hound with the gun; round-trips the choice; a bad value falls back field by field', () => {
    expect([DEFAULT_SETTINGS.soloShip, DEFAULT_SETTINGS.valkyrnLaserFit]).toEqual(['hound', false]);
    saveSettings(storage, { ...DEFAULT_SETTINGS, soloShip: 'valkyrn', valkyrnLaserFit: true });
    expect(loadSettings(storage)).toMatchObject({ soloShip: 'valkyrn', valkyrnLaserFit: true });
    map.set(SETTINGS_KEY, '{"version":2,"master":1,"music":1,"effects":1,"shake":"full","soloShip":"cutter","valkyrnLaserFit":"yes"}');
    expect(loadSettings(storage)).toMatchObject({ soloShip: 'hound', valkyrnLaserFit: false });
  });
  it('helm round 2 §6.3: throttleTapMs round-trips in a version 3 record (UI round §1.3)', () => {
    saveSettings(storage, { ...DEFAULT_SETTINGS, throttleTapMs: 150 });
    expect(loadSettings(storage)).toMatchObject({ version: 3, throttleTapMs: 150 });
    expect(DEFAULT_SETTINGS.throttleTapMs).toBe(200);
  });
});
