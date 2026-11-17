// The online duel's view source (H-2 spec §3): the DuelViewSource the scene draws, built from the stream client's
// confirmed replica at the sender's 20 Hz. Each newly observed publication moves the previous bodies into `prev` and
// starts a new interpolation over the actual tick gap. The per-tick tactical events are not in the snapshot, so beams,
// missile endings and contact sparks are derived from the cumulative counters the snapshot does carry; the sim's own
// `cue` events still bring the sounds. Cameras belong to this machine and never become commands.
import { Life, LifeState, Position } from '../../sim/components';
import type { DuelState } from '../../sim/duel/state';
import { hx, hy } from '../../sim/tactical/direction';
import { missileOf, NO_AXES, type Axes, type DuelEvent, type Missile, type TacticalState } from '../../sim/tactical/state';
import { LASER_RANGE } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import type { OtherStatus } from '../../render/duel/readoutModel';
import { createCamera, followBody, updateCamera, type Camera, type Viewport } from '../../render/tactical/camera';
import { createInteriorCamera, resetInteriorCamera } from '../../render/duel/interiorCamera';
import { interpolatedMissile, type ViewEvent } from '../../render/tactical/fxModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { repairInReach, seatOf } from './controls';
import { helmAxes, NO_HELD_FLAGS, type HeldFlags, type KeySample, type PointerSample } from './input';
import { createCameraInput, type DuelView } from './runtime';
import type { DuelViewSource } from './scene';

/** What the source reads from its client. */
export interface ConfirmedDuel {
  state(): DuelState | null; publication(): { publicationSequence: number; tick: number; phase: string } | null;
  /** False while the publication is not a live client's (the frozen copy across a reconnect): no arrival gap is timed
   *  across it. Absent means always live. */
  live?(): boolean;
}
interface Counters { shots: number; laserHits: number; launched: number; ended: number; missileHits: number; contacts: [number, number, number] }
/** Ship i's cumulative counters, which the snapshot carries. */
export const duelCounters = (t: TacticalState, i: number): Counters => {
  const s = t.systems[i]!, b = t.ships[i]!;
  return { shots: s.shots, laserHits: s.laserHits, launched: s.missilesLaunched, ended: s.missileHits + s.missilesLost, missileHits: s.missileHits, contacts: [b.planetHits, b.asteroidHits, b.shipHits] };
};
const body = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: Missile | null): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);
/** Each tactical Room's work so far: its repair progress plus its point room's extinguish progress (duel-fire spec §1.4),
 *  so either one rising reads as REPAIRING. While a room burns only the fire part moves; otherwise only the repair. */
const workOf = (d: DuelState): number[] => [0, 1, 2].map((r) => {
  const p = d.points.find((q) => q.tacticalRoom === r);
  return d.repair[r]! + (p ? d.interior.rooms.fireRepair[p.room]! : 0);
});

/**
 * The events of one publication gap (spec §3): each `shots` increment is a beam to the target (a hit when `laserHits`
 * rose) or to arc range along the firing ship's heading; each increment of `missileHits + missilesLost` is a missile
 * ending at the missile's previous position (a hit when `missileHits` rose; a loss draws the neutral burst); each
 * contact counter increment is a spark at the ship. An ending and a relaunch in one gap are told apart because both
 * counters rose: the ending is drawn at the old missile's last position.
 */
export function gapEvents(beforeCounters: readonly Counters[], beforeMissiles: readonly (PrevBody | null)[], t: TacticalState): ViewEvent[] {
  const out: ViewEvent[] = [];
  t.ships.forEach((ship, i) => {
    if (!ship.active) return;
    const was = beforeCounters[i], now = duelCounters(t, i);
    if (!was) return;
    const target = t.systems[i]!.target, tgt = t.ships[target];
    for (let k = 0; k < now.shots - was.shots; k++) {
      const hit = k < now.laserHits - was.laserHits && !!tgt;
      const x2 = hit ? tgt!.x : ship.x + hx(ship.heading) * LASER_RANGE, y2 = hit ? tgt!.y : ship.y + hy(ship.heading) * LASER_RANGE;
      out.push({ kind: 'laser', ship: i, hit, stripped: false, room: -1, x1: ship.x, y1: ship.y, x2, y2 } satisfies DuelEvent);
    }
    const old = beforeMissiles[i];
    for (let k = 0; k < now.ended - was.ended; k++) {
      const hit = k < now.missileHits - was.missileHits, at = old ?? body(ship);
      out.push({ kind: 'missileEnd', ship: i, cause: hit ? 'ship' : 'expired', target: hit ? target : -1, room: -1, x: at.x, y: at.y } satisfies DuelEvent);
    }
    (['planet', 'asteroid', 'ship'] as const).forEach((kind, k) => {
      for (let n = 0; n < now.contacts[k]! - was.contacts[k]!; n++) out.push({ kind: 'contact', ship: i, body: kind, x: ship.x, y: ship.y });
    });
  });
  return out;
}

export interface OnlineDuelSourceDeps { client: ConfirmedDuel; seat: 0 | 1; now(): number; viewport: Viewport }
export function createOnlineDuelSource(deps: OnlineDuelSourceDeps) {
  const { client, seat } = deps;
  let seen = 0, lastTick = -1, gap = 3, receivedAt = 0, round = -1, frameAlpha = 1;
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [];
  let latest: { bodies: PrevBody[]; missiles: (PrevBody | null)[]; crew: { x: number; y: number }[]; counters: Counters[]; repair: number[] } | null = null;
  let prevRepair: number[] = [0, 0, 0], events: ViewEvent[] = [], sentHeld = { moveX: 0, moveY: 0 };
  let cameras = { helm: createCamera(), weapons: createCamera() };
  let uiHeld: HeldFlags = NO_HELD_FLAGS;
  const cameraInput = createCameraInput(deps.now, deps.viewport), interiorCamera = createInteriorCamera();
  const gaps: number[] = [];
  /** Observe the client: on a new publication, roll the interpolation and derive the gap's events. True when one was new. */
  function observe(): boolean {
    const p = client.publication(), d = client.state();
    if (!p || !d || p.publicationSequence === seen) return false;
    seen = p.publicationSequence;
    const t = d.tactical, now = deps.now();
    if (d.round !== round) {   // the first publication or a new round: no interpolation across it, fresh cameras
      round = d.round; latest = null; lastTick = -1;
      const s = t.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y) }; cameraInput.reset(); resetInteriorCamera(interiorCamera);
    }
    if (latest) events.push(...gapEvents(latest.counters, latest.missiles, t));
    prev = latest ? latest.bodies : t.ships.map(body);
    missilePrev = latest ? latest.missiles : t.ships.map((_, i) => missileBody(missileOf(t, i)));
    // An ending and a relaunch in one gap: the new missile's trail starts where it is now, not at the old one.
    if (latest) t.ships.forEach((_, i) => { const was = latest!.counters[i]; if (was && duelCounters(t, i).ended > was.ended && missileOf(t, i)) missilePrev[i] = missileBody(missileOf(t, i)); });
    crewPrev = latest ? latest.crew : d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
    prevRepair = latest ? latest.repair : workOf(d);
    gap = lastTick >= 0 ? Math.max(1, p.tick - lastTick) : 3;
    // The record's jitter is live inter-arrival only: no gap is timed to or from the frozen copy (the reconnect time).
    const live = client.live?.() ?? true;
    if (lastTick >= 0 && live) { gaps.push(now - receivedAt); if (gaps.length > 4096) gaps.shift(); }
    lastTick = live ? p.tick : -1; receivedAt = now;
    latest = { bodies: t.ships.map(body), missiles: t.ships.map((_, i) => missileBody(missileOf(t, i))), crew: d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! })),
      counters: t.ships.map((_, i) => duelCounters(t, i)), repair: workOf(d) };
    return true;
  }
  const duel = (): DuelState => client.state()!;
  const source: DuelViewSource & {
    observe(): boolean; frame(dt: number, keys: KeySample | null, pointer: PointerSample | null): void; sent(held: { moveX: number; moveY: number }): void; heldFlags(flags: HeldFlags): void;
    arrivals(): readonly number[]; takeArrivals(): number[]; ready(): boolean;
  } = {
    get duel() { return duel(); },
    get seed() { return duel().tactical.seed; },
    get prev() { return prev; },
    get missilePrev() { return missilePrev; },
    get crewPrev() { return crewPrev; },
    get cameras() { return cameras; },
    interiorCamera,
    epoch: () => duel().round,
    active: () => seat,
    view: (): DuelView => { const s = seatOf(duel(), seat); return s === 'standing' ? 'interior' : s; },
    otherStatus(): OtherStatus {
      const d = duel(), other = seat === 0 ? 1 : 0, s = seatOf(d, other);
      if (Life.state[d.interior.crew[other]!] === LifeState.Downed) return 'DOWNED';   // duel-health spec §2
      if (s !== 'standing') return s === 'helm' ? 'AT HELM' : 'AT WEAPONS';
      const room = repairInReach(d, other);
      return d.present[other] && room >= 0 && workOf(d)[room]! > prevRepair[room]! ? 'REPAIRING' : 'WALKING';
    },
    axes: (): Axes => (seatOf(duel(), seat) === 'helm' ? helmAxes(sentHeld) : NO_AXES),
    steer: () => (seatOf(duel(), seat) === 'weapons' ? Math.sign(sentHeld.moveX) || 0 : 0),
    alpha: () => frameAlpha,
    paused: () => client.publication()?.phase === 'paused',
    live: () => client.live?.() ?? true,
    mode: 'online' as const,
    uiHeld: () => uiHeld,
    /** Only the publication phase 'running' shows the console (Artemis deviation 5). */
    running: () => client.publication()?.phase === 'running',
    drainEvents() { const out = events; events = []; return out; },
    observe,
    ready: () => !!client.state() && !!client.publication(),
    /** The time since the latest publication over its tick gap, clamped to 0..1 (spec §3: one gap behind, no more). */
    frame(dt, keys, pointer) {
      observe();
      const d = client.state(); if (!d) return;
      frameAlpha = Math.max(0, Math.min(1, (deps.now() - receivedAt) * TICK_HZ / (1000 * gap)));
      const view = seatOf(d, seat), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : null;
      if (keys && pointer) { if (cam) cameraInput.apply(cam, keys, pointer); else cameraInput.applyInterior(interiorCamera, keys, pointer); }
      for (const c of [cameras.helm, cameras.weapons]) {
        if (c.follow === 'missile' && !missileOf(d.tactical, 0)) followBody(c, 'ship');
        const target = c.follow === 'missile' ? interpolatedMissile(d.tactical, missilePrev, frameAlpha, 0) : followTarget(d.tactical, prev, frameAlpha, c.follow);
        updateCamera(c, deps.viewport, dt, target);
      }
    },
    /** The held axes this seat last sent (its own console's predicted path). */
    sent(held) { sentHeld = { moveX: held.moveX, moveY: held.moveY }; },
    /** The last pump's merged held keys and console holds (Artemis spec §6.1). */
    heldFlags(flags) { uiHeld = flags; },
    /** Publication inter-arrival gaps in milliseconds, for the record's jitter. */
    arrivals: () => gaps,
    /** The gaps since the last take, cleared (one round's record). */
    takeArrivals: () => gaps.splice(0)
  };
  return source;
}
export type OnlineDuelSource = ReturnType<typeof createOnlineDuelSource>;
