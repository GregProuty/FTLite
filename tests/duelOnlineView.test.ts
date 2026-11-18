// The online duel's view source and the renderer's online session wrapper (H-2 spec §3, §10): interpolation over the
// actual 20 Hz gap, the counter-derived beams, missile endings and sparks against the local runtime's events, the
// online REPAIRING status, the end card's leave prompt across a partner's rematch, and the wrapper choosing the duel or
// sector session by the port descriptor's mode.
import { describe, expect, it, vi } from 'vitest';
import { CLOSED_PROMPT, leavePromptKeys } from '../src/renderer/src/app/duel/onlineDuel';
import { createOnlineDuelSource, gapEvents, duelCounters } from '../src/renderer/src/app/duel/onlineSource';
import { createOnlineModeSession, type InnerOnlineSession } from '../src/renderer/src/app/onlineModeSession';
import { Position } from '../src/renderer/src/sim/components';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { CUTTER_REPAIR_POINTS } from '../src/renderer/src/sim/duel/tuning';
import { createTacticalState, missileOf, Outcome, placeMissile } from '../src/renderer/src/sim/tactical/state';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import type { OnlinePortDescriptor } from '../src/shared/onlineSession';
import { CUTTER } from './helpers/scriptedDuel';
import { emptyPresses } from '../src/renderer/src/app/duel/input';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** A fake confirmed client: `publish` restores a fresh replica from the live duel, as a received publication would. */
function confirmed() {
  let replica: DuelState | null = null, publication: { publicationSequence: number; tick: number; phase: string } | null = null, sequence = 0;
  return {
    client: { state: () => replica, publication: () => publication },
    publish(d: DuelState) {
      const next = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      if (replica) disposeDuel(replica);
      replica = next; publication = { publicationSequence: ++sequence, tick: d.interior.tick, phase: 'running' };
    },
    dispose() { if (replica) disposeDuel(replica); }
  };
}

describe('the online duel view source (spec §3)', () => {
  it('reports whether the view is live from the client (absent: live), so a frozen copy holds no battle music', () => {
    const c = confirmed();
    let live = true;
    const always = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
    const tracked = createOnlineDuelSource({ client: { ...c.client, live: () => live }, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
    expect(always.live?.()).toBe(true); expect(tracked.live?.()).toBe(true);
    live = false; expect(tracked.live?.()).toBe(false);
    c.dispose();
  });
  it('interpolates over the actual tick gap: alpha reaches 1 only when the next publication is due', () => {
    const d = createSeatedDuel(CUTTER, 3), c = confirmed();
    let now = 0;
    const source = createOnlineDuelSource({ client: c.client, seat: 0, now: () => now, viewport: { w: 1280, h: 720 } });
    try {
      c.publish(d); source.frame(1 / 60, null, null);
      for (let k = 0; k < 3; k++) stepDuelTick(d, { held: [], commands: [] });
      c.publish(d); source.frame(1 / 60, null, null);
      expect(source.alpha()).toBe(0);
      now += 1000 / 60; source.frame(1 / 60, null, null); expect(source.alpha()).toBeCloseTo(1 / 3, 6);
      now += 1000 / 60; source.frame(1 / 60, null, null); expect(source.alpha()).toBeCloseTo(2 / 3, 6);
      now += 1000 / 60 - 1; source.frame(1 / 60, null, null); expect(source.alpha()).toBeLessThan(1);
      now += 1; source.frame(1 / 60, null, null); expect(source.alpha()).toBe(1);
      now += 30; source.frame(1 / 60, null, null); expect(source.alpha()).toBe(1);   // clamped: a late publication freezes, never extrapolates
    } finally { disposeDuel(d); c.dispose(); }
  });
  it('derives every beam and missile ending exactly once from the counters, with every third tick published and one in five dropped', () => {
    const d = createSeatedDuel(CUTTER, 7), pair = createScriptedPair(7), c = confirmed(), local: ViewEvent[] = [], online: ViewEvent[] = [];
    let now = 0, published = 0;
    const source = createOnlineDuelSource({ client: c.client, seat: 1, now: () => now, viewport: { w: 1280, h: 720 } });
    try {
      c.publish(d); source.frame(1 / 60, null, null);
      while (d.tactical.outcome === Outcome.Running && d.interior.tick < 12000) {
        stepDuelTick(d, scriptedInput(pair, d)); local.push(...d.tactical.events); now += 1000 / 60;
        if (d.interior.tick % 3 === 0 && ++published % 5 !== 0) { c.publish(d); source.frame(1 / 60, null, null); online.push(...source.drainEvents()); }
      }
      c.publish(d); source.frame(1 / 60, null, null); online.push(...source.drainEvents());
      const count = (events: ViewEvent[], kind: string, ship: number, hit?: boolean) =>
        events.filter((e) => e.kind === kind && e.ship === ship && (hit === undefined || (e as { hit?: boolean; cause?: string }).hit === hit || (kind === 'missileEnd' && ((e as { cause: string }).cause === 'ship') === hit))).length;
      for (const ship of [0, 1]) {
        expect(count(online, 'laser', ship), `ship ${ship} beams`).toBe(count(local, 'laser', ship));
        expect(count(online, 'laser', ship, true), `ship ${ship} beam hits`).toBe(count(local, 'laser', ship, true));
        expect(count(online, 'missileEnd', ship), `ship ${ship} missile endings`).toBe(count(local, 'missileEnd', ship));
      }
      expect(count(local, 'laser', 0) + count(local, 'laser', 1)).toBeGreaterThan(10);
      expect(count(local, 'missileEnd', 0) + count(local, 'missileEnd', 1)).toBeGreaterThan(0);
    } finally { disposeDuel(d); c.dispose(); }
  }, 60_000);
  it('an ending and a relaunch in one gap: the ending at the old missile, the new one counted launched', () => {
    const before = createTacticalState(4), after = createTacticalState(4);
    placeMissile(before, 0, { x: 100, y: 200, vx: 1, vy: 0, heading: 0, headingAcc: 0, age: 50 });
    placeMissile(after, 0, { x: -300, y: 50, vx: 0, vy: 1, heading: 64, headingAcc: 0, age: 2 });
    after.systems[0].missilesLaunched = before.systems[0].missilesLaunched + 1; after.systems[0].missilesLost = before.systems[0].missilesLost + 1;
    const events = gapEvents([duelCounters(before, 0), duelCounters(before, 1)], [{ x: 100, y: 200, h: 0 }, null], after);
    expect(events).toEqual([{ kind: 'missileEnd', ship: 0, cause: 'expired', target: -1, room: -1, x: 100, y: 200 }]);
    expect(missileOf(after, 0)).not.toBeNull();
  });
  it('online hits say what they did (duel polish i spec §B): a strip, the lock room, and a missile on the room that rose', () => {
    const before = createTacticalState(4), after = createTacticalState(4), a = after.systems[0], e = after.systems[1];
    a.lock = 2; a.shots += 3; a.laserHits += 2; a.layersStripped += 1; e.rooms[2] = 1;   // a strip, an Engines hit, a miss
    a.missileHits += 1; e.rooms[0] = 1;                                                   // a missile on Weapons
    const ev = gapEvents([duelCounters(before, 0), duelCounters(before, 1)], [{ x: 5, y: 6, h: 0 }, null], after);
    expect(ev.filter((x) => x.kind === 'laser').map((x) => x.kind === 'laser' && [x.hit, x.stripped, x.room])).toEqual([[true, true, -1], [true, false, 2], [false, false, -1]]);
    expect(ev.find((x) => x.kind === 'missileEnd')).toMatchObject({ cause: 'ship', target: 1, room: 0 });
  });
  it('shows the other character REPAIRING only while a repair it stands at has progressed since the last publication', () => {
    const d = createSeatedDuel(CUTTER, 5), c = confirmed();
    const source = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
    try {
      // Player 1 stands at the Weapons room's repair point with the room damaged.
      stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } }] });
      const p = CUTTER_REPAIR_POINTS[0]!, eid = d.interior.crew[1]!;
      Position.x[eid] = p.tile[0] + 0.5; Position.y[eid] = p.tile[1] + 0.5; d.tactical.systems[0].rooms[0] = 1;
      c.publish(d); source.frame(1 / 60, null, null);
      expect(source.otherStatus()).toBe('WALKING');
      for (let k = 0; k < 3; k++) stepDuelTick(d, { held: [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: true }], commands: [] });
      c.publish(d); source.frame(1 / 60, null, null);
      expect(d.repair[0]).toBeGreaterThan(0);
      expect(source.otherStatus()).toBe('REPAIRING');
      for (let k = 0; k < 3; k++) stepDuelTick(d, { held: [], commands: [] });
      c.publish(d); source.frame(1 / 60, null, null);
      expect(source.otherStatus()).toBe('WALKING');   // no progress since the last publication
    } finally { disposeDuel(d); c.dispose(); }
  });
});

describe('the online end card leave prompt (spec §7)', () => {
  it('a partner rematch closes an open prompt: Escape in the next round sends setPaused, and no prompt shows', () => {
    const d = createSeatedDuel(CUTTER, 3), c = confirmed(), esc = { pause: 1, confirm: 0 }, enter = { pause: 0, confirm: 1 };
    try {
      d.tactical.systems[1].hull = 0; stepDuelTick(d, { held: [], commands: [] });
      c.publish(d);
      const decided = c.client.state()!;
      expect([decided.round, decided.tactical.outcome === Outcome.Running]).toEqual([0, false]);
      // This player presses Escape on the end card: the prompt opens and nothing is sent.
      const opened = leavePromptKeys(CLOSED_PROMPT, decided, 'running', esc);
      expect(opened).toEqual({ prompt: { open: true, round: 0 }, send: null, leave: false });
      expect(leavePromptKeys(opened.prompt, decided, 'running', enter)).toEqual({ prompt: CLOSED_PROMPT, send: null, leave: true });   // Enter there leaves
      // The partner presses Enter: the rematch applies and the next round is published.
      d.present[0] = true;
      const rematch = stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'rematch' } }] });
      expect(rematch.map((r) => r.status)).toEqual(['applied']);
      c.publish(d);
      const next = c.client.state()!;
      expect([next.round, next.tactical.outcome]).toEqual([1, Outcome.Running]);
      // Escape now pauses as in play, and the stale prompt is gone (the banner reads prompt.open).
      expect(leavePromptKeys(opened.prompt, next, 'running', esc)).toEqual({ prompt: CLOSED_PROMPT, send: { kind: 'setPaused', paused: true }, leave: false });
      // Without Escape the stale prompt closes too, and Enter does not Leave mid-round.
      expect(leavePromptKeys(opened.prompt, next, 'running', enter)).toEqual({ prompt: CLOSED_PROMPT, send: null, leave: false });
    } finally { disposeDuel(d); c.dispose(); }
  });
});

describe('the online session wrapper (spec §3)', () => {
  const descriptor = (epoch: number, modeId: string): OnlinePortDescriptor => ({ epoch, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1,
    compatibility: { protocolVersion: 2, modeId, schemaVersion: 2, simVersion: 39, contentDigest: 'b'.repeat(64), layoutHash: '00000000' } });
  const inner = (): InnerOnlineSession & { calls: string[] } => {
    const calls: string[] = [];
    return { calls, attach: () => { calls.push('attach'); }, setStatus: () => { calls.push('status'); }, setFocused: (v) => { calls.push(`focused:${v}`); },
      setInputBlocked: (v) => { calls.push(`blocked:${v}`); }, pause: () => { calls.push('pause'); }, frame: () => { calls.push('frame'); }, dispose: () => { calls.push('dispose'); } };
  };
  it('holds no inner session until the first port, builds the mode the descriptor names, replays status, focus and block, and swaps on a mode change', () => {
    const made: ReturnType<typeof inner>[] = [], factories = { duel: vi.fn(() => { const s = inner(); made.push(s); return s; }), sector: vi.fn(() => { const s = inner(); made.push(s); return s; }) };
    const w = createOnlineModeSession(factories), port = { close: vi.fn() } as unknown as MessagePort;
    w.frame(); w.setFocused(false); w.setInputBlocked(true); w.setStatus({ phase: 'syncing' } as never);
    expect(made).toHaveLength(0);
    w.attach(descriptor(1, 'duel'), port);
    expect(factories.duel).toHaveBeenCalledOnce(); expect(w.mode).toBe('duel');
    expect(made[0]!.calls).toEqual(['status', 'focused:false', 'blocked:true', 'attach']);
    w.attach(descriptor(2, 'duel'), port); expect(factories.duel).toHaveBeenCalledOnce();
    w.attach(descriptor(3, 'sector'), port);
    expect(made[0]!.calls.at(-1)).toBe('dispose'); expect(factories.sector).toHaveBeenCalledOnce(); expect(w.mode).toBe('sector');
    w.attach(descriptor(4, 'elsewhere'), port); expect(port.close).toHaveBeenCalled(); expect(w.mode).toBeNull();
    w.dispose();
  });
});

describe('the online interior zoom camera (interior zoom spec rule 5)', () => {
  it('this seat standing: the wheel, the zoom keys, a drag and C feed the interior camera; a new round resets it', () => {
    const d = createSeatedDuel(CUTTER, 3), c = confirmed();
    let now = 0;
    const source = createOnlineDuelSource({ client: c.client, seat: 1, now: () => now, viewport: { w: 1280, h: 720 } });
    const keys = (over: Partial<ReturnType<typeof emptyPresses>> = {}) => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: { ...emptyPresses(), ...over } });
    const pointer = (over: object = {}) => ({ x: 400, y: 300, wheel: 0, dragX: 0, dragY: 0, ...over });
    try {
      c.publish(d); source.frame(1 / 60, keys(), pointer({ wheel: -100 }));
      expect(source.interiorCamera.notches).toBe(0);   // seated at Weapons: the wheel is the Weapons camera's
      stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence: 0 }, requestedTick: d.interior.tick, command: { kind: 'stand' } }] });
      now += 50; c.publish(d);
      expect(source.view()).toBe('interior');
      source.frame(1 / 60, keys({ zoomIn: 1 }), pointer({ wheel: -100, dragX: 7 }));
      expect([source.interiorCamera.notches, source.interiorCamera.anchor, source.interiorCamera.dragX]).toEqual([2, { x: 400, y: 300 }, 7]);
      source.interiorCamera.follow = false;
      source.frame(1 / 60, keys({ camera: 1 }), pointer());
      expect(source.interiorCamera.follow).toBe(true);
      source.interiorCamera.level = 3;
      d.tactical.systems[1].hull = 0; stepDuelTick(d, { held: [], commands: [] }); d.present[0] = true;
      stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'rematch' } }] });
      expect(d.round).toBe(1);
      now += 50; c.publish(d); source.frame(1 / 60, null, null);
      expect([source.interiorCamera.level, source.interiorCamera.notches]).toEqual([0, 0]);
    } finally { disposeDuel(d); c.dispose(); }
  });
});

describe('the online source follows the throttle (Artemis spec §5.3, §6.1)', () => {
  it('the Helm seat flies the replica throttle; throttle() is the session base, else the replica', () => {
    const d = createSeatedDuel(CUTTER, 3), c = confirmed();
    const source = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
    try {
      d.throttle = 2; c.publish(d); source.observe();
      source.sent({ moveX: 1, moveY: -1 });
      expect([source.axes(), source.throttle()]).toEqual([{ turn: 1, thrust: 0.5 }, 2]);
      source.throttleBase(4);
      expect([source.throttle(), source.axes().thrust]).toEqual([4, 0.5]);   // the drawn path follows the replica
      source.throttleBase(null);
      expect(source.throttle()).toBe(2);
      const gunner = createOnlineDuelSource({ client: c.client, seat: 1, now: () => 0, viewport: { w: 1280, h: 720 } });
      gunner.observe();
      expect(gunner.axes()).toEqual({ turn: 0, thrust: 0 });
    } finally { disposeDuel(d); c.dispose(); }
  });
  it('the end card flies nothing: axes() is NO_AXES on a decided round whatever the throttle', () => {
    const d = createSeatedDuel(CUTTER, 3), c = confirmed();
    const source = createOnlineDuelSource({ client: c.client, seat: 0, now: () => 0, viewport: { w: 1280, h: 720 } });
    try {
      d.throttle = 3; c.publish(d); source.observe();
      expect(source.axes().thrust).toBe(0.75);
      d.tactical.outcome = Outcome.CrewWins; d.decidedTick = d.interior.tick; c.publish(d); source.observe();
      expect(source.axes()).toEqual({ turn: 0, thrust: 0 });
    } finally { disposeDuel(d); c.dispose(); }
  });
});
