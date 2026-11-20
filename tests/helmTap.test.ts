// Helm round 2 (spec 2026-11-19-helm-round2-design §2.3, §8): the keyboard times W and S on a fake clock. A fresh keydown gives
// throttleDown (Shift held too); a keyup inside the tap time gives throttleTap; the tap time is read live; a key held across
// a sit (staleHeld), a blur or a clear gives no tap; clearUi drops the one-shot fields; a repeat keydown restarts nothing.
import { describe, expect, it } from 'vitest';
import { createDuelKeyboard, type EventSource } from '../src/renderer/src/app/duel/input';
import { DEFAULT_THROTTLE_TAP_MS, THROTTLE_TAP_STEPS } from '../src/renderer/src/app/settingsStore';

function rig(tapMs: () => number = () => 200) {
  const fns = new Map<string, ((e: never) => void)[]>();
  const target: EventSource & { fire(type: string, e: object): void } = {
    addEventListener(type: string, fn: (e: never) => void) { fns.set(type, [...(fns.get(type) ?? []), fn]); },
    removeEventListener() {},
    fire(type, e) { for (const f of fns.get(type) ?? []) f(e as never); }
  };
  let now = 1000;
  const kb = createDuelKeyboard(target, { now: () => now, tapMs });
  const ev = (code: string, more: object = {}) => ({ code, repeat: false, preventDefault() {}, ...more });
  return {
    kb, target,
    down(code: string, more: object = {}) { target.fire('keydown', ev(code, more)); },
    up(code: string) { target.fire('keyup', ev(code)); },
    wait(ms: number) { now += ms; },
    /** One sample's [throttleDown, throttleTap]. */
    fields(): [number, number] { const s = kb.sample(); return [s.throttleDown ?? 0, s.throttleTap ?? 0]; }
  };
}

describe('the throttle tap on the keyboard (spec §2.3)', () => {
  it('the tap time\'s steps and default (§6.3)', () => {
    expect([THROTTLE_TAP_STEPS, DEFAULT_THROTTLE_TAP_MS]).toEqual([[150, 200, 250, 300], 200]);
  });
  it('a fresh W or S keydown gives throttleDown (1 W, −1 S) once, with Shift held too', () => {
    const r = rig();
    r.down('KeyS'); expect(r.fields()).toEqual([-1, 0]); expect(r.fields()).toEqual([0, 0]);   // one-shot
    r.up('KeyS'); r.fields();
    r.down('KeyW'); expect(r.fields()[0]).toBe(1); r.up('KeyW'); r.fields();
    r.down('KeyW', { shiftKey: true }); expect(r.fields()[0]).toBe(1);   // Shift+W adds no press edge here, but is timed
  });
  it('at 200 ms a 100 ms S press gives throttleTap −1 and a 250 ms one gives none; a W tap gives 1', () => {
    const r = rig();
    r.down('KeyS'); r.fields(); r.wait(100); r.up('KeyS');
    expect(r.fields()).toEqual([0, -1]);
    expect(r.fields()).toEqual([0, 0]);   // one-shot
    r.down('KeyS'); r.fields(); r.wait(250); r.up('KeyS');
    expect(r.fields()).toEqual([0, 0]);
    r.down('KeyW'); r.wait(50); r.up('KeyW');
    expect(r.fields()).toEqual([1, 1]);   // a press shorter than a frame carries both in one sample
  });
  it('tapMs is read live on each keyup: its four values move the threshold', () => {
    let ms = 150;
    const r = rig(() => ms);
    for (const [setting, held, tap] of [[150, 149, -1], [150, 150, 0], [200, 199, -1], [200, 200, 0], [250, 240, -1], [250, 251, 0], [300, 299, -1], [300, 300, 0]] as const) {
      ms = setting;
      r.down('KeyS'); r.fields(); r.wait(held); r.up('KeyS');
      expect(r.fields()[1], `${setting} ms, held ${held}`).toBe(tap);
    }
  });
  it('a key held across a sit (staleHeld), a blur or a clear gives no tap when it comes up', () => {
    const r = rig();
    r.down('KeyS'); r.fields(); r.kb.staleHeld(); r.wait(50); r.up('KeyS'); expect(r.fields()).toEqual([0, 0]);
    r.down('KeyW'); r.fields(); r.target.fire('blur', {}); r.wait(50); r.up('KeyW'); expect(r.fields()).toEqual([0, 0]);
    r.down('KeyS'); r.fields(); r.kb.clear(); r.wait(50); r.up('KeyS'); expect(r.fields()).toEqual([0, 0]);
  });
  it('clearUi drops the one-shot fields but not the down time; a repeat keydown neither sets throttleDown nor restarts the timing', () => {
    const r = rig();
    r.down('KeyS'); r.kb.clearUi(); expect(r.fields()).toEqual([0, 0]);
    r.up('KeyS'); expect(r.fields()).toEqual([0, -1]);
    r.down('KeyS'); r.fields(); r.wait(150); r.down('KeyS', { repeat: true }); expect(r.fields()).toEqual([0, 0]);
    r.wait(100); r.up('KeyS');
    expect(r.fields()).toEqual([0, 0]);   // 250 ms since the fresh keydown
  });
});
