// Enemy ship window spec §3, §5, §6.1, §6.2; Sci-1 spec §7.2, §7.3: the contact window's local state keyed on contact
// ids (0 the enemy, 1 the derelict), its closing rules, Science's selection and requests, and its key intercept.
import { describe, expect, it, vi } from 'vitest';
import { createContactController, type ContactSync } from '../src/renderer/src/app/duel/contactController';

const live = (over: Partial<ContactSync> = {}): ContactSync => ({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, ...over });
const none = { designate: null, scan: null };

describe('Helm and Weapons (enemy ship window spec §3, Sci-1 spec §7.2)', () => {
  it('a map click opens, a click on the other contact switches (disarmed), a click on the shown one closes; null does nothing', () => {
    const c = createContactController(); c.sync(live());
    c.click(null); expect(c.state()).toBeNull();
    c.click(0); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.arm(); c.click(1); expect(c.state()).toEqual({ contact: 1, aim: false });
    c.click(1); expect(c.state()).toBeNull();
    expect(c.takeRequests()).toEqual(none);
  });
  it('close() closes an open window on Helm and Weapons; arm() while closed is a no-op', () => {
    for (const station of ['helm', 'weapons'] as const) {
      const c = createContactController(); c.sync(live({ station }));
      c.arm(); expect(c.state()).toBeNull();
      c.click(0); c.close(); expect(c.state()).toBeNull();
    }
  });
  it('click(null) leaves an open window open', () => {
    const c = createContactController(); c.sync(live());
    c.click(1); c.click(null); expect(c.state()).toEqual({ contact: 1, aim: false });
  });
  it('T cycles enemy, derelict, closed', () => {
    const c = createContactController(); c.sync(live({ station: 'helm' }));
    c.toggle(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.toggle(); expect(c.state()).toEqual({ contact: 1, aim: false });
    c.toggle(); expect(c.state()).toBeNull();
    expect(c.takeRequests()).toEqual(none);
  });
  it('arm toggles the aim on the enemy at any scan level (Feel-i: the "?" rooms below Level 1); a no-op on the derelict', () => {
    const c = createContactController(); c.sync(live({ enemyKnown: 0 }));
    c.click(0); c.arm(); expect(c.state()).toEqual({ contact: 0, aim: true });
    c.arm(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.sync(live({ enemyKnown: 1 })); c.arm(); expect(c.state()).toEqual({ contact: 0, aim: true });
    c.arm(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.arm(); c.cancelAim(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.click(1); c.arm(); expect(c.state()).toEqual({ contact: 1, aim: false });
  });
  it('escape disarms, then closes, then returns false', () => {
    const c = createContactController(); c.sync(live());
    c.click(0); c.arm();
    expect(c.escape()).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
    expect(c.escape()).toBe(true); expect(c.state()).toBeNull();
    expect(c.escape()).toBe(false);
  });
  it('SCAN requests a scan of the shown contact, once per take; nothing with no contact shown', () => {
    const c = createContactController(); c.sync(live());
    c.scan(); expect(c.takeRequests()).toEqual(none);
    c.click(1); c.scan(); c.scan();
    expect(c.takeRequests()).toEqual({ designate: null, scan: 1 });
    expect(c.takeRequests()).toEqual(none);
  });
});

describe('the closing rules in sync (enemy ship window spec §3)', () => {
  it('returns whether the window is shown; clears when the console is not shown', () => {
    const c = createContactController();
    expect(c.sync(live())).toBe(false);
    c.click(0); expect(c.sync(live())).toBe(true);
    c.arm(); expect(c.sync(live({ shown: false, station: null }))).toBe(false); expect(c.state()).toBeNull();
    c.click(0); expect(c.sync(live({ shown: false, station: 'ship' }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('clears the enemy contact when its slot (the laser target) is inactive; the derelict stays', () => {
    const c = createContactController(); c.sync(live());
    c.click(0); expect(c.sync(live({ active: (slot) => slot !== 1 }))).toBe(false); expect(c.state()).toBeNull();
    c.click(1); expect(c.sync(live({ active: (slot) => slot !== 1 }))).toBe(true); expect(c.state()).toEqual({ contact: 1, aim: false });
  });
  it('clears on a new epoch (the first sync only records it)', () => {
    const c = createContactController();
    c.click(0); expect(c.sync(live({ epoch: 3 }))).toBe(true);
    expect(c.sync(live({ epoch: 3 }))).toBe(true);
    expect(c.sync(live({ epoch: 4 }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('a station change disarms and keeps the window open; the scan level never disarms (a pick-up waits for the rooms)', () => {
    const c = createContactController();
    c.sync(live({ station: 'helm' })); c.click(0); c.arm();
    expect(c.sync(live({ station: 'helm' }))).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: true });
    expect(c.sync(live({ station: 'weapons' }))).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.arm(); expect(c.sync(live({ enemyKnown: 0 }))).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: true });
  });
});

describe('pick (enemy ship window spec §5)', () => {
  it('calls lock only while armed, then disarms and keeps the window open', () => {
    const c = createContactController(), lock = vi.fn(); c.sync(live());
    c.click(0); c.pick(2, lock); expect(lock).not.toHaveBeenCalled();
    c.arm(); c.pick(2, lock);
    expect(lock).toHaveBeenCalledTimes(1); expect(lock).toHaveBeenCalledWith(2, 'laser');
    expect(c.state()).toEqual({ contact: 0, aim: false });
    c.pick(0, lock); expect(lock).toHaveBeenCalledTimes(1);   // disarmed by the pick: a further pick does not lock
  });
});

describe('Science (Sci-1 spec §7.3)', () => {
  it('a click selects (no toggle) and requests designate; T cycles enemy, derelict, none, requesting each', () => {
    const c = createContactController(); c.sync(live({ station: 'science' }));
    c.click(1); expect(c.state()).toEqual({ contact: 1, aim: false });
    c.click(1); expect(c.state()).toEqual({ contact: 1, aim: false });
    expect(c.takeRequests()).toEqual({ designate: 1, scan: null });
    c.toggle(); expect(c.state()).toBeNull(); expect(c.takeRequests()).toEqual({ designate: -1, scan: null });
    c.toggle(); expect(c.state()).toEqual({ contact: 0, aim: false }); expect(c.takeRequests()).toEqual({ designate: 0, scan: null });
    c.toggle(); expect(c.state()).toEqual({ contact: 1, aim: false }); expect(c.takeRequests()).toEqual({ designate: 1, scan: null });
  });
  it('is shown with nothing selected; never aims; Esc deselects (designate −1), then declines so Esc pauses', () => {
    const c = createContactController();
    expect(c.sync(live({ station: 'science' }))).toBe(true);
    c.click(0); c.arm(); expect(c.state()).toEqual({ contact: 0, aim: false });
    c.takeRequests();
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toBeNull();
    expect(c.takeRequests()).toEqual({ designate: -1, scan: null });
    expect(c.intercept('Escape')).toBe(false);
  });
  it('the close button deselects and requests designate −1', () => {
    const c = createContactController(); c.sync(live({ station: 'science' }));
    c.click(0); c.takeRequests(); c.close();
    expect([c.state(), c.takeRequests()]).toEqual([null, { designate: -1, scan: null }]);
  });
});

describe('the key intercept (enemy ship window spec §6.2, Sci-1 spec §7.2, §7.3)', () => {
  it('takes KeyT on Helm, Weapons and Science while the console is shown, cycling', () => {
    for (const station of ['helm', 'weapons', 'science'] as const) {
      const c = createContactController(); c.sync(live({ station }));
      expect(c.intercept('KeyT'), station).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
      expect(c.intercept('KeyT')).toBe(true); expect(c.state()).toEqual({ contact: 1, aim: false });
      expect(c.intercept('KeyT')).toBe(true); expect(c.state()).toBeNull();
    }
  });
  it('declines KeyT before any frame, on a hidden console, on the SHIP console and on the interior view', () => {
    const c = createContactController();
    expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: null })); expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: 'ship' })); expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: 'weapons' })); expect(c.intercept('KeyT')).toBe(false);
    expect(c.state()).toBeNull();
  });
  it('takes KeyS on Science only: a scan request of the selection, and taken even with nothing selected', () => {
    const c = createContactController(); c.sync(live({ station: 'science' }));
    expect(c.intercept('KeyS')).toBe(true); expect(c.takeRequests()).toEqual(none);
    c.click(1); c.takeRequests();
    expect(c.intercept('KeyS')).toBe(true); expect(c.takeRequests()).toEqual({ designate: null, scan: 1 });
    const h = createContactController(); h.sync(live({ station: 'helm' })); h.click(0);
    expect(h.intercept('KeyS')).toBe(false);
  });
  it('takes Escape only while shown with a contact: disarm, then close; declines every other code', () => {
    const c = createContactController();
    c.sync(live()); expect(c.intercept('Escape')).toBe(false);
    c.click(0); c.sync(live()); c.arm();
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toEqual({ contact: 0, aim: false });
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toBeNull();
    expect(c.intercept('Escape')).toBe(false);
    c.click(0); c.sync(live({ shown: false, station: null })); expect(c.intercept('Escape')).toBe(false);   // hidden: declined
    c.click(0); c.sync(live());
    for (const code of ['KeyE', 'KeyQ', 'Space', 'Tab', 'KeyW', 'Enter', 'KeyS', 'Digit3']) expect(c.intercept(code), code).toBe(false);
    expect(c.state()).toEqual({ contact: 0, aim: false });
  });
});

describe('the weapon pick-up (FTL targeting spec §1)', () => {
  it('pickUp opens the window on the enemy armed with that weapon; the same weapon again cancels, the other swaps', () => {
    const c = createContactController(); c.sync(live({ enemyKnown: 1 }));
    expect(c.aimWeapon()).toBeNull();
    c.pickUp('torpedo'); expect([c.state(), c.aimWeapon()]).toEqual([{ contact: 0, aim: true }, 'torpedo']);
    c.pickUp('laser'); expect(c.aimWeapon()).toBe('laser');
    c.pickUp('laser'); expect([c.state(), c.aimWeapon()]).toEqual([{ contact: 0, aim: false }, null]);
    c.click(1); c.pickUp('laser'); expect([c.state(), c.aimWeapon()]).toEqual([{ contact: 0, aim: true }, 'laser']);   // from the derelict
  });
  it('an unknown enemy (below Level 1): the pick-up still arms, requests the enemy scan once, and stays live until the rooms arrive; Science never picks up', () => {
    const c = createContactController(), lock = vi.fn(); c.sync(live({ enemyKnown: 0 }));
    c.pickUp('laser'); expect([c.state(), c.aimWeapon()]).toEqual([{ contact: 0, aim: true }, 'laser']);
    expect(c.takeRequests()).toEqual({ designate: null, scan: 0 });                  // the SCAN button's request
    for (let f = 0; f < 3; f++) c.sync(live({ enemyKnown: 0 }));                      // the scan runs: still picked up
    expect(c.aimWeapon()).toBe('laser'); expect(c.takeRequests()).toEqual({ designate: null, scan: null });
    c.sync(live({ enemyKnown: 1 }));                                                  // Level 1: the rooms show
    c.pick(2, lock); expect(lock).toHaveBeenCalledWith(2, 'laser');
    c.pickUp('torpedo'); expect(c.takeRequests()).toEqual({ designate: null, scan: null });   // known: no scan request
    const k = createContactController(); k.sync(live({ enemyKnown: 0 }));
    expect(k.intercept('Digit2')).toBe(true); expect(k.aimWeapon()).toBe('torpedo');   // the key too
    expect(k.takeRequests().scan).toBe(0);
    k.pickUp('torpedo'); expect(k.takeRequests().scan).toBeNull();                    // the cancel requests nothing
    const s = createContactController(); s.sync(live({ station: 'science' }));
    s.pickUp('torpedo'); expect(s.state()).toBeNull();
  });
  it('a pick sends the weapon picked up, then disarms', () => {
    const c = createContactController(), lock = vi.fn(); c.sync(live());
    c.pickUp('torpedo'); c.pick(1, lock);
    expect(lock).toHaveBeenCalledWith(1, 'torpedo');
    expect([c.state(), c.aimWeapon()]).toEqual([{ contact: 0, aim: false }, null]);
  });
  it('Esc cancels the pick-up, then closes; arm (the LASER button) toggles the laser', () => {
    const c = createContactController(); c.sync(live());
    c.pickUp('torpedo'); c.arm(); expect(c.aimWeapon()).toBe('laser');
    c.arm(); expect(c.aimWeapon()).toBeNull();
    c.pickUp('torpedo'); c.sync(live());
    expect(c.intercept('Escape')).toBe(true); expect([c.state(), c.aimWeapon()]).toEqual([{ contact: 0, aim: false }, null]);
  });
  it('the keys at Weapons: 1 and 2 pick up (taken), elsewhere declined; E and Q with the torpedo step its target and keep it picked up, with the laser drop the pick-up and pass', () => {
    const c = createContactController(); c.sync(live());
    expect(c.intercept('Digit1')).toBe(true); expect(c.aimWeapon()).toBe('laser');
    expect(c.intercept('Digit1')).toBe(true); expect(c.aimWeapon()).toBeNull();
    expect(c.intercept('Digit2')).toBe(true); expect(c.aimWeapon()).toBe('torpedo');
    expect(c.intercept('KeyE')).toBe(true); expect(c.aimWeapon()).toBe('torpedo');   // the torpedo stays picked up
    expect(c.intercept('KeyE')).toBe(true); expect(c.aimWeapon()).toBe('torpedo');   // a second E steps it again, never the laser
    expect(c.takeRequests()).toEqual({ designate: null, scan: null, torpStep: 2 });
    c.intercept('KeyQ');
    expect(c.takeRequests()).toEqual({ designate: null, scan: null, torpStep: -1 });
    expect(c.intercept('Digit2')).toBe(true); expect(c.aimWeapon()).toBeNull();      // the key again cancels
    expect(c.intercept('KeyE')).toBe(false);   // nothing picked up: E is the lock cycle again
    c.intercept('Digit1'); expect(c.intercept('KeyQ')).toBe(false); expect(c.aimWeapon()).toBeNull();
    expect(c.takeRequests()).toEqual({ designate: null, scan: null });
    const h = createContactController(); h.sync(live({ station: 'helm' }));
    expect(h.intercept('Digit1')).toBe(false); expect(h.state()).toBeNull();
    const hidden = createContactController(); hidden.sync(live({ shown: false, station: null }));
    expect(hidden.intercept('Digit2')).toBe(false);
  });
});

describe('Science adopts the shared designation (Sci-1 fix B)', () => {
  it('after a hidden frame the next shown frame selects the designated contact without a request', () => {
    const c = createContactController();
    c.sync(live({ station: 'science', designated: 1 })); c.takeRequests();
    c.sync(live({ station: null, shown: false, designated: 1 }));
    expect(c.sync(live({ station: 'science', designated: 1 }))).toBe(true);
    expect(c.state()).toEqual({ contact: 1, aim: false });
    expect(c.takeRequests()).toEqual(none);
  });
  it('staying on Science, a deliberate deselect is not undone by a lagging designation on the next shown frame', () => {
    const c = createContactController();
    c.sync(live({ station: 'science', designated: 1 })); c.takeRequests();
    c.click(0); c.takeRequests();
    c.intercept('Escape');
    expect(c.state()).toBeNull();
    expect(c.takeRequests()).toEqual({ designate: -1, scan: null });
    expect(c.sync(live({ station: 'science', designated: 1 }))).toBe(true);
    expect(c.state()).toBeNull();
    expect(c.takeRequests()).toEqual(none);
  });
});
