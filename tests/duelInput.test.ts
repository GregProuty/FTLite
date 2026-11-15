import { describe, expect, it, vi } from 'vitest';
import { createDuelKeyboard, createPointerSource, helmAxes, accumulateWheel, type EventSource } from '../src/renderer/src/app/duel/input';

/** A fake event target: records listeners and dispatches plain objects to them. */
function fakeTarget() {
  const listeners = new Map<string, ((e: never) => void)[]>();
  const target: EventSource & { fire(type: string, e: object): void; count(): number } = {
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    fire(type, e) { for (const fn of listeners.get(type) ?? []) fn(e as never); },
    count() { return [...listeners.values()].reduce((n, l) => n + l.length, 0); }
  };
  return target;
}
const key = (code: string, repeat = false) => ({ code, repeat, preventDefault: vi.fn() });

describe('duel keyboard (H-1 spec §5)', () => {
  it('maps WASD to the move vector and the Helm axes', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('KeyW'));
    let s = kb.sample();
    expect([s.moveX, s.moveY]).toEqual([0, -1]);
    expect(helmAxes(s)).toEqual({ turn: 0, thrust: 1 });
    t.fire('keydown', key('KeyD'));
    s = kb.sample();
    expect(s.moveX).toBeCloseTo(Math.SQRT1_2, 12); expect(s.moveY).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(helmAxes(s)).toEqual({ turn: 1, thrust: 1 });
    t.fire('keyup', key('KeyW')); t.fire('keyup', key('KeyD')); t.fire('keydown', key('KeyS')); t.fire('keydown', key('KeyA'));
    expect(helmAxes(kb.sample())).toEqual({ turn: -1, thrust: -1 });
    t.fire('keyup', key('KeyS')); t.fire('keyup', key('KeyA'));
    const idle = helmAxes(kb.sample());
    expect(Object.is(idle.turn, 0) && Object.is(idle.thrust, 0)).toBe(true);
  });
  it('counts press edges once per sample, ignoring auto-repeat', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('Escape')); t.fire('keydown', key('KeyC')); t.fire('keydown', key('KeyC', true));
    t.fire('keydown', key('Equal')); t.fire('keydown', key('Minus')); t.fire('keydown', key('NumpadSubtract'));
    const s = kb.sample();
    expect(s.presses.pause).toBe(1); expect(s.presses.camera).toBe(1); expect(s.presses.zoomIn).toBe(1); expect(s.presses.zoomOut).toBe(2);
    expect(kb.sample().presses.camera).toBe(0);
  });
  it('Space down and up are two edges and fireHeld follows the key', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('Space'));
    let s = kb.sample(); expect(s.presses.fireDown).toBe(1); expect(s.fireHeld).toBe(true);
    t.fire('keyup', key('Space'));
    s = kb.sample(); expect(s.presses.fireUp).toBe(1); expect(s.fireHeld).toBe(false);
  });
  it('prevents the browser default on Tab, Space, the arrows and Backspace only, on press and release', () => {
    const t = fakeTarget(); createDuelKeyboard(t);
    for (const code of ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']) {
      const down = key(code); t.fire('keydown', down); expect(down.preventDefault, `${code} down`).toHaveBeenCalled();
      const up = key(code); t.fire('keyup', up); expect(up.preventDefault, `${code} up`).toHaveBeenCalled();
    }
    for (const code of ['KeyW', 'Escape', 'F11', 'Equal']) {
      const down = key(code); t.fire('keydown', down); expect(down.preventDefault, `${code} down`).not.toHaveBeenCalled();
      const up = key(code); t.fire('keyup', up); expect(up.preventDefault, `${code} up`).not.toHaveBeenCalled();
    }
  });
  it('blur and clear drop held keys and pending presses; destroy removes every listener', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('KeyW')); t.fire('keydown', key('KeyC')); t.fire('blur', {});
    let s = kb.sample(); expect(s.moveY).toBe(0); expect(s.presses.camera).toBe(0);
    t.fire('keydown', key('KeyE')); kb.clear();
    s = kb.sample(); expect(s.interactHeld).toBe(false); expect(s.presses.interact).toBe(0);
    kb.destroy(); expect(t.count()).toBe(0);
  });
});

describe('pointer source (H-1 spec §5)', () => {
  const half = (x: number, y: number) => ({ x: x / 2, y: y / 2 });   // a 2× letterbox
  const ptr = (clientX: number, clientY: number, button: number, buttons: number) => ({ clientX, clientY, button, buttons, preventDefault: vi.fn() });
  it('tracks the position in internal pixels and sums the wheel', () => {
    const t = fakeTarget(), p = createPointerSource(t, half);
    expect(p.sample()).toEqual({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 });
    t.fire('pointermove', ptr(200, 100, -1, 0));
    expect(p.sample()).toEqual({ x: 100, y: 50, wheel: 0, dragX: 0, dragY: 0 });   // a move alone: the letterbox inverse
    expect(p.sample()).toMatchObject({ x: 100, y: 50 });                           // the position persists across samples
    const w = { clientX: 400, clientY: 300, deltaY: 100, deltaMode: 0, preventDefault: vi.fn() };
    t.fire('wheel', w); t.fire('wheel', { ...w, deltaY: 100 });
    const s = p.sample();
    expect([s.x, s.y, s.wheel]).toEqual([200, 150, 200]);
    expect(w.preventDefault).toHaveBeenCalled();
    expect(p.sample().wheel).toBe(0);
  });
  it('drags with the right or middle button only, and suppresses the context menu', () => {
    const t = fakeTarget(), p = createPointerSource(t, half);
    t.fire('pointerdown', ptr(100, 100, 2, 2));
    t.fire('pointermove', ptr(140, 80, -1, 2));
    expect(p.sample()).toMatchObject({ dragX: 20, dragY: -10 });
    t.fire('pointerup', ptr(140, 80, 2, 0));
    t.fire('pointermove', ptr(200, 80, -1, 0));
    expect(p.sample()).toMatchObject({ dragX: 0, dragY: 0 });
    t.fire('pointerdown', ptr(200, 80, 0, 1)); t.fire('pointermove', ptr(260, 80, -1, 1));   // left button: no pan
    expect(p.sample().dragX).toBe(0);
    t.fire('pointerdown', ptr(260, 80, 1, 4)); t.fire('pointermove', ptr(270, 80, -1, 4));   // middle button pans
    expect(p.sample().dragX).toBe(5);
    const menu = { preventDefault: vi.fn() }; t.fire('contextmenu', menu); expect(menu.preventDefault).toHaveBeenCalled();
  });
  it('wheel accumulator: small deltas sum to whole notches, remainder carries, scrolling up zooms in', () => {
    expect(accumulateWheel(0, 0)).toEqual({ notches: 0, acc: 0 });
    expect(accumulateWheel(0, -100).notches).toBe(1); expect(accumulateWheel(0, 300).notches).toBe(-3);
    expect(accumulateWheel(0, 4)).toEqual({ notches: 0, acc: 4 });
    let acc = 0, total = 0;
    for (let i = 0; i < 30; i++) { const r = accumulateWheel(acc, 4); acc = r.acc; total += r.notches; }
    expect(total).toBe(-1); expect(acc).toBe(20);
    const r = accumulateWheel(60, 150); expect(r.notches).toBe(-2); expect(r.acc).toBe(10);
  });
});
