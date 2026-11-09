import { describe, it, expect } from 'vitest';
import { createSession } from '../src/renderer/src/app/session';
import type { SourceSample } from '../src/renderer/src/input/deviceManager';
import { LAYOUT } from './helpers/sim';

function harness() {
  let samples: SourceSample[] = [];
  let t = 0;
  const crashes: unknown[] = [];
  const session = createSession({
    layout: LAYOUT, sampleDevices: () => samples, renderer: null, hud: null,
    now: () => t, saveCrash: (p) => { crashes.push(p); }
  });
  const press = (key: string, o: Partial<SourceSample>) => { samples = [{ key, moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, ...o }]; };
  const frames = (n: number, ms = 1000 / 60) => { for (let i = 0; i < n; i++) { t += ms; session.frame(); } };
  return { session, press, frames, crashes, release: () => press('a', {}) };
}

describe('session', () => {
  it('joins in the lobby and starts on Confirm', () => {
    const h = harness();
    h.frames(1);
    expect(h.session.phase).toBe('lobby');
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    expect(h.session.phase).toBe('running');
    expect(h.session.state!.playerCount).toBe(1);
    h.frames(60);
    expect(h.session.state!.tick).toBeGreaterThanOrEqual(58);
  });
  it('pause stops ticking and resume continues without a backlog', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release(); h.frames(10);
    const tick = h.session.state!.tick;
    h.session.pause(); h.frames(100);
    expect(h.session.state!.tick).toBe(tick);
    h.session.resume(); h.frames(1);
    expect(h.session.state!.tick).toBeLessThanOrEqual(tick + 1);
  });
  it('ends when the solo player dies and restarts with the same or next seed', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    const seed = h.session.seed;
    h.session.state!.hull = 0; h.frames(2);
    expect(h.session.phase).toBe('gameover');
    h.press('a', { cancel: true }); h.frames(1); h.release();
    expect(h.session.phase).toBe('lobby');
    expect(h.session.seed).toBe(seed + 1);
  });
  it('a sim fault saves a crash payload and enters the error phase', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    (h.session.state as unknown as { rooms: null }).rooms = null;   // corrupt the state to force a throw
    h.frames(2);
    expect(h.session.phase).toBe('error');
    expect(h.crashes).toHaveLength(1);
  });
  it('after a fault, frames keep running without touching the corrupt state', () => {
    let hudModels = 0, faulted = false, t = 0;
    let samples: SourceSample[] = [];
    const session = createSession({
      layout: LAYOUT, sampleDevices: () => samples,
      renderer: { recordPrev() {}, draw() { if (faulted) throw new Error('draw must not run in error phase'); } },
      hud: { update(m) { hudModels++; if (m.phase === 'error') expect(m.players.every((p) => p.prompt === '')).toBe(true); } },
      now: () => (t += 20),   // time must advance by at least one tick (16.7ms, with margin for float error) or the fault never fires
      saveCrash: () => {}
    });
    samples = [{ key: 'a', moveX: 0, moveY: 0, interact: true, confirm: false, cancel: false }]; session.frame();
    samples = [{ key: 'a', moveX: 0, moveY: 0, interact: false, confirm: true, cancel: false }]; session.frame();
    (session.state as unknown as { rooms: null }).rooms = null;
    faulted = true;
    samples = [];
    expect(() => { for (let i = 0; i < 3; i++) session.frame(); }).not.toThrow();
    expect(session.phase).toBe('error');
    expect(hudModels).toBeGreaterThan(0);
  });
});
