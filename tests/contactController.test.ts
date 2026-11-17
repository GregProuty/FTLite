// Enemy ship window spec §3, §5, §6.1, §6.2, §8: the contact window's local state, its closing rules and its key intercept.
import { describe, expect, it, vi } from 'vitest';
import { createContactController, type ContactSync } from '../src/renderer/src/app/duel/contactController';

const live = (over: Partial<ContactSync> = {}): ContactSync => ({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, ...over });

describe('opening and closing (spec §3)', () => {
  it('a map click opens, a click on another ship switches (disarmed), a click on the shown ship closes; null does nothing', () => {
    const c = createContactController();
    c.click(null); expect(c.state()).toBeNull();
    c.click(1); expect(c.state()).toEqual({ ship: 1, aim: false });
    c.arm(); c.click(2); expect(c.state()).toEqual({ ship: 2, aim: false });
    c.click(null); expect(c.state()).toEqual({ ship: 2, aim: false });
    c.click(2); expect(c.state()).toBeNull();
  });
  it('toggle opens on the target slot or closes; close closes', () => {
    const c = createContactController();
    c.toggle(1); expect(c.state()).toEqual({ ship: 1, aim: false });
    c.toggle(1); expect(c.state()).toBeNull();
    c.click(1); c.close(); expect(c.state()).toBeNull();
  });
  it('arm toggles the aim while open (nothing while closed); cancelAim disarms', () => {
    const c = createContactController();
    c.arm(); expect(c.state()).toBeNull();
    c.click(1); c.arm(); expect(c.state()).toEqual({ ship: 1, aim: true });
    c.arm(); expect(c.state()).toEqual({ ship: 1, aim: false });
    c.arm(); c.cancelAim(); expect(c.state()).toEqual({ ship: 1, aim: false });
  });
  it('escape disarms, then closes, then returns false', () => {
    const c = createContactController();
    c.click(1); c.arm();
    expect(c.escape()).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
    expect(c.escape()).toBe(true); expect(c.state()).toBeNull();
    expect(c.escape()).toBe(false);
  });
});

describe('sync, once per frame (spec §3)', () => {
  it('returns whether the window is shown', () => {
    const c = createContactController();
    expect(c.sync(live())).toBe(false);
    c.click(1); expect(c.sync(live())).toBe(true);
  });
  it('clears when the console is not shown (hidden, SHIP, a pause)', () => {
    const c = createContactController();
    c.click(1); c.arm();
    expect(c.sync(live({ shown: false, station: null }))).toBe(false); expect(c.state()).toBeNull();
    c.click(1);
    expect(c.sync(live({ shown: false, station: 'ship' }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('clears when the shown ship is inactive', () => {
    const c = createContactController();
    c.click(1);
    expect(c.sync(live({ active: (slot) => slot !== 1 }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('clears on a new epoch (the first sync only records it)', () => {
    const c = createContactController();
    c.click(1); expect(c.sync(live({ epoch: 3 }))).toBe(true);
    expect(c.sync(live({ epoch: 3 }))).toBe(true);
    expect(c.sync(live({ epoch: 4 }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('a station change disarms and keeps the window open', () => {
    const c = createContactController();
    c.sync(live({ station: 'helm' })); c.click(1); c.arm();
    expect(c.sync(live({ station: 'helm' }))).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: true });
    expect(c.sync(live({ station: 'weapons' }))).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
  });
});

describe('target change', () => {
  it('disarms (and keeps the window open) when the laser target moves off the shown ship', () => {
    const c = createContactController();
    c.sync(live()); c.click(1); c.arm();
    expect(c.sync(live())).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: true });
    expect(c.sync(live({ target: 2 }))).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
  });
});

describe('pick (spec §5)', () => {
  it('calls lock only while armed, then disarms and keeps the window open', () => {
    const c = createContactController(), lock = vi.fn();
    c.click(1); c.pick(2, lock); expect(lock).not.toHaveBeenCalled();
    c.arm(); c.pick(2, lock);
    expect(lock).toHaveBeenCalledTimes(1); expect(lock).toHaveBeenCalledWith(2);
    expect(c.state()).toEqual({ ship: 1, aim: false });
    c.pick(0, lock); expect(lock).toHaveBeenCalledTimes(1);
  });
});

describe('the key intercept (spec §6.2)', () => {
  it('takes KeyT on a Helm or Weapons station: toggles on the last frame\'s target slot, or closes while shown', () => {
    for (const station of ['helm', 'weapons'] as const) {
      const c = createContactController();
      c.sync(live({ station, target: 1 }));
      expect(c.intercept('KeyT')).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
      c.sync(live({ station, target: 1 }));
      expect(c.intercept('KeyT')).toBe(true); expect(c.state()).toBeNull();
    }
  });
  it('declines KeyT before any frame, on a hidden console and on the SHIP console', () => {
    const c = createContactController();
    expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: null })); expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: 'ship' })); expect(c.intercept('KeyT')).toBe(false);
    expect(c.state()).toBeNull();
  });
  it('declines KeyT on the interior view at Weapons (station weapons but the console not shown on a map view)', () => {
    const c = createContactController();
    c.sync(live({ shown: false, station: 'weapons' }));
    expect(c.intercept('KeyT')).toBe(false); expect(c.state()).toBeNull();
  });
  it('takes Escape only while shown: first it disarms, then it closes; declines it when closed or hidden', () => {
    const c = createContactController();
    c.sync(live()); expect(c.intercept('Escape')).toBe(false);
    c.click(1); c.sync(live()); c.arm();
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toBeNull();
    expect(c.intercept('Escape')).toBe(false);
    c.click(1); c.sync(live({ shown: false, station: null }));
    expect(c.intercept('Escape')).toBe(false);
  });
  it('declines every other code, even while shown', () => {
    const c = createContactController();
    c.click(1); c.sync(live());
    for (const code of ['KeyE', 'KeyQ', 'Space', 'Tab', 'KeyW', 'Enter']) expect(c.intercept(code), code).toBe(false);
    expect(c.state()).toEqual({ ship: 1, aim: false });
  });
});
