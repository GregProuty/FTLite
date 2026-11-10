import { describe, it, expect } from 'vitest';
import { createSession } from '../src/renderer/src/app/session';
import type { SourceSample } from '../src/renderer/src/input/deviceManager';
import { LAYOUT } from './helpers/sim';
import { loadSnapshot, type Snapshot } from '../src/renderer/src/sim/snapshot';
import { decodeIntent, type CompactIntent } from '../src/renderer/src/sim/replay';
import { hashState } from '../src/renderer/src/sim/hash';
import { step } from '../src/renderer/src/sim/step';

function harness(canResume?: () => boolean) {
  let samples: SourceSample[] = [];
  let t = 0;
  const crashes: unknown[] = [];
  const session = createSession({
    layout: LAYOUT, sampleDevices: () => samples, renderer: null, hud: null,
    now: () => t, canResume, saveCrash: (p) => { crashes.push(p); }
  });
  const press = (key: string, o: Partial<SourceSample>) => { samples = [{ key, moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, any: false, ...o }]; };
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
  it('a Confirm press while paused resumes and ticks advance again', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release(); h.frames(10);
    h.session.pause(); h.frames(5);
    expect(h.session.phase).toBe('paused');
    const tick = h.session.state!.tick;
    h.press('a', { confirm: true }); h.frames(1); h.release();
    expect(h.session.phase).toBe('running');
    h.frames(20);
    expect(h.session.state!.tick).toBeGreaterThan(tick);
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
      renderer: { reset() {}, recordPrev() {}, draw() { if (faulted) throw new Error('draw must not run in error phase'); } },
      hud: { update(m) { hudModels++; if (m.phase === 'error') expect(m.players.every((p) => p.prompt === '')).toBe(true); } },
      now: () => (t += 20),   // time must advance by at least one tick (16.7ms, with margin for float error) or the fault never fires
      saveCrash: () => {}
    });
    samples = [{ key: 'a', moveX: 0, moveY: 0, interact: true, confirm: false, cancel: false, any: true }]; session.frame();
    samples = [{ key: 'a', moveX: 0, moveY: 0, interact: false, confirm: true, cancel: false, any: true }]; session.frame();
    (session.state as unknown as { rooms: null }).rooms = null;
    faulted = true;
    samples = [];
    expect(() => { for (let i = 0; i < 3; i++) session.frame(); }).not.toThrow();
    expect(session.phase).toBe('error');
    expect(hudModels).toBeGreaterThan(0);
  });
  it('crash payload carries a rolling baseline and the intents since it', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    h.frames(700, 20);
    const st = h.session.state!;
    (st as unknown as { rooms: null }).rooms = null;
    const before = st.tick;
    h.frames(1, 20);
    expect(h.crashes).toHaveLength(1);
    const p = h.crashes[0] as { baseline: Snapshot; intentsSinceBaseline: CompactIntent[][]; tick: number };
    expect(p.baseline.header.tick).toBe(600);
    // The faulting tick's intents are recorded before step() throws, so they are included (+1).
    expect(p.intentsSinceBaseline.length).toBe(p.tick - 600 + 1);
    expect(p.tick).toBeGreaterThanOrEqual(before);
  });
  it('baseline plus recorded intents replays to the pre-fault state', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    h.frames(700, 20);
    const st = h.session.state!;
    const live = hashState(st);
    (st as unknown as { rooms: null }).rooms = null;
    h.frames(1, 20);
    const p = h.crashes[0] as { baseline: Snapshot; intentsSinceBaseline: CompactIntent[][]; tick: number };
    const replayed = loadSnapshot(LAYOUT, p.baseline);
    // The last recorded entry belongs to the tick that faulted; the ones before it lead to the pre-fault state.
    for (const c of p.intentsSinceBaseline.slice(0, -1)) step(replayed, c.map(decodeIntent));
    expect(hashState(replayed)).toBe(live);
  });
  it('a Confirm press while paused does not resume when canResume() is false', () => {
    let can = false;
    const h = harness(() => can);
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release(); h.frames(10);
    h.session.pause(); h.frames(5);
    h.press('a', { confirm: true }); h.frames(1); h.release(); h.frames(1);
    expect(h.session.phase).toBe('paused');
    can = true;
    h.press('a', { confirm: true }); h.frames(1); h.release();
    expect(h.session.phase).toBe('running');
  });
  it('calls renderer.reset() at every run start, before the first draw', () => {
    const calls: string[] = [];
    let samples: SourceSample[] = []; let t = 0;
    const session = createSession({
      layout: LAYOUT, sampleDevices: () => samples, hud: null, now: () => (t += 20), saveCrash: () => {},
      renderer: { reset() { calls.push('reset'); }, recordPrev() {}, draw() { if (calls.at(-1) !== 'draw') calls.push('draw'); } }
    });
    const press = (o: Partial<SourceSample>) => { samples = [{ key: 'a', moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, any: false, ...o }]; };
    press({ interact: true }); session.frame(); press({}); session.frame();
    press({ confirm: true }); session.frame(); press({}); session.frame();
    expect(calls.slice(0, 2)).toEqual(['reset', 'draw']);
    session.state!.hull = 0; session.frame(); session.frame();
    expect(session.phase).toBe('gameover');
    press({ confirm: true }); session.frame(); press({}); session.frame();   // back to lobby, same seed
    press({ confirm: true }); session.frame(); press({});                    // start again
    expect(calls.filter((c) => c === 'reset')).toHaveLength(2);
  });
});
