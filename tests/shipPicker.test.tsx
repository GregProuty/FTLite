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
});
