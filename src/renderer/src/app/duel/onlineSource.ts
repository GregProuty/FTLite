// The online duel's view source (H-2 spec §3): the DuelViewSource the scene draws, built from the stream client's
// confirmed replica at the sender's 20 Hz. Each newly observed publication moves the previous bodies into `prev` and
// starts a new interpolation over the actual tick gap. The per-tick tactical events are not in the snapshot, so beams,
// missile endings and contact sparks are derived from the cumulative counters the snapshot does carry; the sim's own
// `cue` events still bring the sounds. Cameras belong to this machine and never become commands.
import { Position } from '../../sim/components';
import type { DuelState } from '../../sim/duel/state';
import { throttleThrust } from '../../sim/duel/throttle';
import { engineBars, heldAxis, noVent, rampTicks, throttleCap, throttleFloor, ventOf, type HelmVent } from '../../sim/duel/helmFlight';
import { crewAxes } from '../../sim/duel/step';
import { hx, hy } from '../../sim/tactical/direction';
import { CREW_SLOT, missileOf, NO_AXES, Outcome, type Axes, type DuelEvent, type Missile, type TacticalState } from '../../sim/tactical/state';
import { LASER_RANGE } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import { createCamera, followBody, updateCamera, type Camera, type Viewport } from '../../render/tactical/camera';
import { createInteriorCamera, resetInteriorCamera } from '../../render/duel/interiorCamera';
import { interpolatedMissile, type ViewEvent } from '../../render/tactical/fxModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { crewHelmSeat, seatOf } from './controls';
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
import { createTorpedoFollow, trackManualTorpedo } from './torpedoCamera';
import { NO_HELD_FLAGS, type HeldFlags, type KeySample, type PointerSample } from './input';
import { createCameraInput, heldTurn, type DuelView } from './runtime';
import type { HeldInput } from '../../net/contracts';
import type { DuelViewSource, Refusal } from './scene';
import { stateAxes } from '../../render/duel/situationModel';

/** What the source reads from its client. */
export interface ConfirmedDuel {
  state(): DuelState | null; publication(): { publicationSequence: number; tick: number; phase: string } | null;
  /** False while the publication is not a live client's (the frozen copy across a reconnect): no arrival gap is timed
   *  across it. Absent means always live. */
  live?(): boolean;
}
interface Counters { shots: number; laserHits: number; stripped: number; launched: number; ended: number; missileHits: number; gunHits: number; pewShots: number; pewHits: number; contacts: [number, number, number]; rooms: [number, number, number] }
/** Ship i's cumulative counters, which the snapshot carries. `ended` is every missile that has ended: launched minus the
 *  one in flight, which also counts a self-hit (neither a hit nor a loss); never fewer than hits plus losses. */
export const duelCounters = (t: TacticalState, i: number): Counters => {
  const s = t.systems[i]!, b = t.ships[i]!, ended = Math.max(s.missileHits + s.missilesLost, s.missilesLaunched - (missileOf(t, i) ? 1 : 0));
  return { shots: s.shots, laserHits: s.laserHits, stripped: s.layersStripped, launched: s.missilesLaunched, ended, missileHits: s.missileHits, gunHits: s.gunHits, pewShots: s.pewShots, pewHits: s.pewHits, contacts: [b.planetHits, b.asteroidHits, b.shipHits], rooms: [s.rooms[0], s.rooms[1], s.rooms[2]] };
};
const body = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: Missile | null): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);

/**
 * The events of one publication gap (spec §3): each `shots` increment is a beam to the target (a hit when `laserHits`
 * rose) or to arc range along the firing ship's heading; each increment of `ended` (launched minus in flight) is a
 * missile ending at the missile's previous position (a hit when `missileHits` rose; a loss or a self-hit draws the
 * neutral burst); each
 * contact counter increment is a spark at the ship; each gunHits increment is a gun hit at the target (Valkyrn spec §7.3).
 * An ending and a relaunch in one gap are told apart because both
 * counters rose: the ending is drawn at the old missile's last position.
 * W-2 approximation (plan Decision 13): the crew laser's mode is read once per gap, from the replica's current state, for
 * every shot in it, so a shot fired in the other mode before a Z toggle inside the same gap may name the wrong room; and a
 * MANUAL hit on a room already at level 2 (the level did not rise) is drawn with no room callout.
 */
export function gapEvents(beforeCounters: readonly Counters[], beforeMissiles: readonly (PrevBody | null)[], t: TacticalState): ViewEvent[] {
  const out: ViewEvent[] = [];
  t.ships.forEach((ship, i) => {
    if (!ship.active) return;
    const was = beforeCounters[i], now = duelCounters(t, i);
    if (!was) return;
    const target = t.systems[i]!.target, tgt = t.ships[target], lock = t.systems[i]!.lock, manual = t.systems[i]!.laserManual;
    // What each hit did (duel polish i spec §B, online): the first `stripped` hits took a shield layer; the rest struck the
    // laser's lock room. A missile hit struck a room whose level rose beyond what those laser hits explain, else unknown (−1).
    const tw = beforeCounters[target], tn = tgt ? duelCounters(t, target) : null;
    const rose = tw && tn ? tn.rooms.map((r, k) => r - tw.rooms[k]!) : [0, 0, 0];
    // A weak-frequency crew shot strips 2 layers (Sci-1 §4.4), so the layers stripped are spent per stripping hit, in order.
    const hits = now.laserHits - was.laserHits, weak = i === CREW_SLOT && t.systems[i]!.freq === t.weakFreq;
    let layers = now.stripped - was.stripped;
    for (let k = 0; k < now.shots - was.shots; k++) {
      // W-2 (pew pew spec §2): a MANUAL hit struck the room under its hit point, which the snapshot does not carry: the first
      // room whose level rose in the gap, else none.
      const hit = k < hits && !!tgt, stripped = hit && layers > 0, room = hit && !stripped ? (manual ? rose.findIndex((r) => r > 0) : lock) : -1;
      if (stripped) layers -= weak ? Math.min(2, layers) : 1;
      if (room >= 0 && rose[room]! > 0) rose[room]!--;
      const x2 = hit ? tgt!.x : ship.x + hx(ship.heading) * LASER_RANGE, y2 = hit ? tgt!.y : ship.y + hy(ship.heading) * LASER_RANGE;
      out.push({ kind: 'laser', ship: i, hit, stripped, room, x1: ship.x, y1: ship.y, x2, y2 } satisfies DuelEvent);
    }
    const old = beforeMissiles[i];
    for (let k = 0; k < now.ended - was.ended; k++) {
      const hit = k < now.missileHits - was.missileHits, at = old ?? body(ship);
      const room = hit ? rose.findIndex((r) => r > 0) : -1;
      if (room >= 0) rose[room]!--;
      out.push({ kind: 'missileEnd', ship: i, cause: hit ? 'ship' : 'expired', target: hit ? target : -1, room, x: at.x, y: at.y } satisfies DuelEvent);
    }
    // Valkyrn spec §7.3: each gunHits increment is a round that hit the target; the snapshot carries neither the Room nor
    // a strip, so the event names none (−1, not stripped), at the target's position.
    if (tgt) for (let k = 0; k < now.gunHits - was.gunHits; k++) out.push({ kind: 'gunHit', ship: target, room: -1, stripped: false, hull: false, level: false, x: tgt.x, y: tgt.y } satisfies DuelEvent);
    // W-1 (pew pew spec §1): each pewShots increment is a round fired at the ship, each pewHits increment a round that hit the
    // target (the snapshot carries neither the strip nor the hull, so the event names neither).
    for (let k = 0; k < now.pewShots - was.pewShots; k++) out.push({ kind: 'pewFire', ship: i, x: ship.x, y: ship.y } satisfies DuelEvent);
    if (tgt) for (let k = 0; k < now.pewHits - was.pewHits; k++) out.push({ kind: 'pewHit', ship: target, owner: i, stripped: false, hull: false, x: tgt.x, y: tgt.y } satisfies DuelEvent);
    (['planet', 'asteroid', 'ship'] as const).forEach((kind, k) => {
      for (let n = 0; n < now.contacts[k]! - was.contacts[k]!; n++) out.push({ kind: 'contact', ship: i, body: kind, x: ship.x, y: ship.y });
    });
  });
  return out;
}

export interface OnlineDuelSourceDeps { client: ConfirmedDuel; seat: number; now(): number; viewport: Viewport }
export function createOnlineDuelSource(deps: OnlineDuelSourceDeps) {
  const { client, seat } = deps;
  let seen = 0, lastTick = -1, gap = 3, receivedAt = 0, round = -1, frameAlpha = 1;
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [];
  let latest: { bodies: PrevBody[]; missiles: (PrevBody | null)[]; crew: { x: number; y: number }[]; counters: Counters[] } | null = null;
  let events: ViewEvent[] = [], sentHeld: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
  let cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() }, torpFollow = createTorpedoFollow();
  let uiHeld: HeldFlags = NO_HELD_FLAGS, shownThrottle: number | null = null, refusals: Refusal[] = [];
  let unackedFrames = 0;   // playtest2feedback Decision 14: this seat's held frames the replica has not taken yet
  /** Playtest2feedback §3: this seat flies the crew Helm (a newtonianHelm class) in a running round. */
  const crewHelm = (d: DuelState): boolean => crewHelmSeat(d, seat) && d.tactical.outcome === Outcome.Running;
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
      const s = t.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y), science: createCamera(s.x, s.y) }; torpFollow = createTorpedoFollow(); cameraInput.reset(); resetInteriorCamera(interiorCamera);
    }
    if (latest) events.push(...gapEvents(latest.counters, latest.missiles, t));
    prev = latest ? latest.bodies : t.ships.map(body);
    missilePrev = latest ? latest.missiles : t.ships.map((_, i) => missileBody(missileOf(t, i)));
    // An ending and a relaunch in one gap: the new missile's trail starts where it is now, not at the old one.
    if (latest) t.ships.forEach((_, i) => { const was = latest!.counters[i]; if (was && duelCounters(t, i).ended > was.ended && missileOf(t, i)) missilePrev[i] = missileBody(missileOf(t, i)); });
    crewPrev = latest ? latest.crew : d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
    gap = lastTick >= 0 ? Math.max(1, p.tick - lastTick) : 3;
    // The record's jitter is live inter-arrival only: no gap is timed to or from the frozen copy (the reconnect time).
    const live = client.live?.() ?? true;
    if (lastTick >= 0 && live) { gaps.push(now - receivedAt); if (gaps.length > 4096) gaps.shift(); }
    lastTick = live ? p.tick : -1; receivedAt = now;
    latest = { bodies: t.ships.map(body), missiles: t.ships.map((_, i) => missileBody(missileOf(t, i))), crew: d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! })),
      counters: t.ships.map((_, i) => duelCounters(t, i)) };
    return true;
  }
  const duel = (): DuelState => client.state()!;
  const source: DuelViewSource & {
    observe(): boolean; frame(dt: number, keys: KeySample | null, pointer: PointerSample | null): void; sent(held: HeldInput): void; heldFlags(flags: HeldFlags): void;
    thrMille(): number; helmVent(): HelmVent; unacked(n: number): void; weaponSel(): number;
    throttleBase(level: number | null): void;
    refuse(control: Refusal['control'], reason: string): void;
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
    axes: (): Axes => {   // Artemis spec §5.3: the held turn and the replica's throttle, while this seat flies a running round
      const d = duel();
      if (crewHelm(d)) return crewAxes(d, sentHeld, source.thrMille());   // playtest2feedback §3, §6: the local prediction
      return seatOf(d, seat) === 'helm' && d.tactical.outcome === Outcome.Running ? { turn: heldTurn(d, sentHeld), thrust: throttleThrust(d.throttle) } : NO_AXES;
    },
    /** Playtest2feedback §3: the crew Helm's thrMille: the replica's plus the ramp this seat's held W/S adds over its
     *  unacknowledged frames (the sim's rule); away from the Helm, the replica's. */
    thrMille: (): number => {
      const d = duel();
      if (!crewHelm(d)) return d.thrMille;
      const e = engineBars(d);
      return rampTicks(d.thrMille, heldAxis(sentHeld.throttleHeld), throttleFloor(e), throttleCap(e), unackedFrames);
    },
    weaponSel: (): number => sentHeld.weaponSel ?? 0,   // W-4 spec §10: the selection this seat last sent
    /** Playtest2feedback Decision 11: the puffs and the hiss online: this seat's own predicted vent at the crew Helm, else none. */
    helmVent: (): HelmVent => { const d = duel(); return crewHelm(d) ? ventOf(crewAxes(d, sentHeld)) : noVent(); },
    unacked(n) { unackedFrames = Math.max(0, n); },
    alpha: () => frameAlpha,
    paused: () => client.publication()?.phase === 'paused',
    live: () => client.live?.() ?? true,
    mode: 'online' as const,
    uiHeld: () => uiHeld,
    /** Only the publication phase 'running' shows the console (Artemis deviation 5). */
    running: () => client.publication()?.phase === 'running',
    /** The level the console shows (Artemis spec §6.1): the session's level in flight, else the replica's. */
    throttle: () => shownThrottle ?? duel().throttle,
    /** The session's level in flight (spec §5.4's throttleSent), or null. */
    throttleBase(level) { shownThrottle = level; },
    /** Feel-ii §1.2: this seat's own axes at the Helm, else what the replica alone tells (no partner's A/D or Space). */
    helmAxes: (): Axes => (seatOf(duel(), seat) === 'helm' ? source.axes() : stateAxes(duel())),
    /** Feel-ii §2.8: the session's refused controls, drained by the scene. */
    refuse(control, reason) { refusals.push({ control, reason }); },
    takeRefusals() { const out = refusals; refusals = []; return out; },
    drainEvents() { const out = events; events = []; return out; },
    observe,
    ready: () => !!client.state() && !!client.publication(),
    /** The time since the latest publication over its tick gap, clamped to 0..1 (spec §3: one gap behind, no more). */
    frame(dt, keys, pointer) {
      observe();
      const d = client.state(); if (!d) return;
      frameAlpha = Math.max(0, Math.min(1, (deps.now() - receivedAt) * TICK_HZ / (1000 * gap)));
      const view = seatOf(d, seat), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : view === 'science' ? cameras.science : null;
      if (keys && pointer) { if (cam) cameraInput.apply(cam, keys, pointer, view === 'helm' || (view === 'weapons' && manualTorpedoFlying(d.tactical))); else cameraInput.applyInterior(interiorCamera, keys, pointer); }   // W-3: at Weapons the right button steers a MANUAL torpedo
      trackManualTorpedo(cameras.weapons, torpFollow, manualTorpedoFlying(d.tactical));   // W-3 (pew pew spec §3): follow a MANUAL torpedo, then go back
      for (const c of [cameras.helm, cameras.weapons, cameras.science]) {
        if (c.follow === 'missile' && !missileOf(d.tactical, 0)) followBody(c, 'ship');
        const target = c.follow === 'missile' ? interpolatedMissile(d.tactical, missilePrev, frameAlpha, 0) : followTarget(d.tactical, prev, frameAlpha, c.follow);
        updateCamera(c, deps.viewport, dt, target);
      }
    },
    /** The held axes this seat last sent (its own console's predicted path). */
    sent(held) { sentHeld = { ...held, interactHeld: false }; },   // playtest2feedback: the crew Helm's fields and aim too
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
