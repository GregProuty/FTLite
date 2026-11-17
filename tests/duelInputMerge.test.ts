// Spec 2026-11-17-artemis-consoles §6.2: the duel keyboard is the merge point for keys and console clicks.
import { describe, expect, it } from 'vitest';
import { createDuelKeyboard, type EventSource } from '../src/renderer/src/app/duel/input';

function fakeWindow() {
  const fns = new Map<string, (e: unknown) => void>();
  const target: EventSource = { addEventListener: (t, fn) => { fns.set(t, fn as (e: unknown) => void); }, removeEventListener: (t) => { fns.delete(t); } };
  const key = (type: 'keydown' | 'keyup', code: string, repeat = false) => fns.get(type)!({ code, repeat, preventDefault() {} });
  return { target, down: (c: string, repeat = false) => key('keydown', c, repeat), up: (c: string) => key('keyup', c), blur: () => fns.get('blur')!({}) };
}

describe('keys and clicks merge (spec §6.2)', () => {
  it('a click hold alone gives one fireDown and one fireUp', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    kb.ui.hold('Space', true);
    let s = kb.sample(); expect(s.presses.fireDown).toBe(1); expect(s.fireHeld).toBe(true); expect(s.held!.fire).toBe(true);
    kb.ui.hold('Space', false);
    s = kb.sample(); expect(s.presses.fireUp).toBe(1); expect(s.fireHeld).toBe(false);
  });
  it('Space and the FIRE button overlapping give one edge each way, in every order', () => {
    for (const order of [['kd', 'ud', 'ku', 'uu'], ['kd', 'ud', 'uu', 'ku'], ['ud', 'kd', 'ku', 'uu'], ['ud', 'kd', 'uu', 'ku']]) {
      const w = fakeWindow(), kb = createDuelKeyboard(w.target);
      let downs = 0, ups = 0;
      for (const step of order) {
        if (step === 'kd') w.down('Space'); if (step === 'ku') w.up('Space');
        if (step === 'ud') kb.ui.hold('Space', true); if (step === 'uu') kb.ui.hold('Space', false);
        const s = kb.sample(); downs += s.presses.fireDown; ups += s.presses.fireUp;
      }
      expect([order.join(','), downs, ups]).toEqual([order.join(','), 1, 1]);
    }
  });
  it('A from one source and D from the other cancel; W from the UI moves up', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('KeyA'); kb.ui.hold('KeyD', true);
    expect(kb.sample().moveX).toBe(0);
    w.up('KeyA');
    expect(kb.sample().moveX).toBe(1);
    kb.ui.hold('KeyW', true);
    const s = kb.sample(); expect(s.moveY).toBeLessThan(0); expect(s.held).toMatchObject({ up: true, right: true, left: false });
  });
  it('press adds one edge; lock is last-wins and lasts one sample', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    kb.ui.press('launch'); kb.ui.press('switch'); kb.ui.lock(2); kb.ui.lock(1);
    let s = kb.sample(); expect(s.presses.launch).toBe(1); expect(s.presses.switch).toBe(1); expect(s.lockTo).toBe(1);
    s = kb.sample(); expect(s.presses.launch).toBe(0); expect(s.lockTo).toBeNull();
  });
  it('clearUi drops click holds with no edge and leaves a held key held', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('KeyA'); kb.ui.hold('Space', true); kb.ui.hold('KeyD', true); kb.sample();
    kb.ui.lock(0); kb.clearUi();
    const s = kb.sample();
    expect(s.presses.fireUp).toBe(0); expect(s.fireHeld).toBe(false); expect(s.moveX).toBe(-1); expect(s.lockTo).toBeNull();
  });
  it('clear drops both sources with no edge; a late release of a cleared hold counts nothing', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('Space'); kb.ui.hold('KeyD', true); kb.sample();
    kb.clear();
    kb.ui.hold('KeyD', false); w.up('Space');
    const s = kb.sample(); expect(s.presses.fireUp).toBe(0); expect(s.presses.fireDown).toBe(0); expect(s.moveX).toBe(0);
  });
  it('a repeat Space keydown after a clear counts no fireDown', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('Space'); kb.sample(); kb.clear();
    w.down('Space', true);
    const s = kb.sample(); expect(s.presses.fireDown).toBe(0); expect(s.fireHeld).toBe(true);
  });
  it('blur clears the UI holds too', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    kb.ui.hold('KeyA', true); kb.sample(); w.blur();
    expect(kb.sample().moveX).toBe(0);
  });
});
