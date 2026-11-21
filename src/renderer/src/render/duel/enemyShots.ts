// UI round Part 3 spec §3: enemy shots seen from inside the crew ship. Pure (no Pixi): readHits turns a tick's view events
// into hits on a ship with a ship-frame bearing; a Shot then flies from outside the shield ellipse to its landing point in
// the interior's pixel frame, on the presentation clock (dt 0 holds).
import { TILE_PX } from '../../../../shared/resolution';
import { CREW_SLOT, targetOf, type TacticalState } from '../../sim/tactical/state';
import type { DuelState } from '../../sim/duel/state';
import type { TileRect } from '../battlemapModel';
import type { ViewEvent } from '../tactical/fxModel';
import { headingAngle } from '../tactical/tacticalModel';
import { ellipsePoint, type Ellipse } from '../shieldFx';

export type ShotKind = 'laser' | 'pew' | 'torpedo';
/** A hit on one ship, read from one view event: the target slot, its ship-frame bearing (as ShieldHit.a), and what it did. */
export interface ShipHitRead { target: number; a: number; kind: ShotKind; stopped: boolean; drop: boolean; room: number; miss: boolean }

export const FLIGHT_S: Record<ShotKind, number> = { laser: 0.12, pew: 0.18, torpedo: 0.35 };
export const SPLASH_S = 0.2, TRAIL_STEP_S = 0.03, TRAIL_POINTS = 4;

/** The bearing from ship `slot` to world point (px, py) in the ship's frame: 0 = nose, +PI/2 = starboard. The same transform the
 *  map uses to place a hull by heading: f = (sin a, -cos a), s = (cos a, sin a), a = headingAngle(heading). */
function bearing(state: TacticalState, slot: number, px: number, py: number): number {
  const sh = state.ships[slot]!, ang = headingAngle(sh.heading + sh.headingAcc), dx = px - sh.x, dy = py - sh.y;
  const f = dx * Math.sin(ang) - dy * Math.cos(ang), s = dx * Math.cos(ang) + dy * Math.sin(ang);
  return Math.atan2(s, f);
}

export function readHits(state: TacticalState, events: readonly ViewEvent[]): ShipHitRead[] {
  const out: ShipHitRead[] = [];
  for (const e of events) {
    if (e.kind === 'laser') {
      if ((e.rock ?? -1) >= 0) continue;
      const target = e.ship === CREW_SLOT ? targetOf(state, CREW_SLOT) : CREW_SLOT;
      if (target < 0 || target >= state.ships.length) continue;
      const a = bearing(state, target, e.x1, e.y1);
      if (!e.hit) out.push({ target, a, kind: 'laser', stopped: false, drop: false, room: -1, miss: true });
      else if (e.stripped) out.push({ target, a, kind: 'laser', stopped: true, drop: true, room: -1, miss: false });
      else if (e.room >= 0) out.push({ target, a, kind: 'laser', stopped: false, drop: false, room: e.room, miss: false });
    } else if (e.kind === 'pewHit') {
      const a = bearing(state, e.ship, e.x, e.y);
      if (e.stripped) out.push({ target: e.ship, a, kind: 'pew', stopped: true, drop: true, room: -1, miss: false });
      else if (e.hull || e.room >= 0) out.push({ target: e.ship, a, kind: 'pew', stopped: false, drop: false, room: e.room, miss: false });
    } else if (e.kind === 'missileEnd' && e.cause === 'ship' && e.target >= 0 && e.target < state.ships.length) {
      out.push({ target: e.target, a: bearing(state, e.target, e.x, e.y), kind: 'torpedo', stopped: false, drop: false, room: e.room, miss: false });
    }
  }
  return out;
}

type Pt = { x: number; y: number };
/** The interior's frame (ship px): the nose and starboard unit vectors, the shield ellipse, and each tactical room's landing point. */
export interface InteriorFrame { nose: Pt; star: Pt; ellipse: Ellipse; rooms: Pt[] }

export function interiorFrame(d: DuelState, rectTiles: TileRect): InteriorFrame {
  const w = d.interior.derived.width, rooms: Pt[] = [];
  for (let r = 0; r < 3; r++) {
    const p = d.points.find((q) => q.tacticalRoom === r);
    const t = p ? p.tile : 0, tx = t % w;
    rooms.push({ x: tx * TILE_PX + TILE_PX / 2, y: ((t - tx) / w) * TILE_PX + TILE_PX / 2 });
  }
  let nx = rooms[0]!.x - rooms[2]!.x, ny = rooms[0]!.y - rooms[2]!.y;
  const len = Math.hypot(nx, ny);
  if (len < 1e-6) { nx = 1; ny = 0; } else { nx /= len; ny /= len; }
  const ellipse: Ellipse = { cx: (rectTiles.x + rectTiles.w / 2) * TILE_PX, cy: (rectTiles.y + rectTiles.h / 2) * TILE_PX, rx: 0.56 * rectTiles.w * TILE_PX, ry: 0.56 * rectTiles.h * TILE_PX };
  return { nose: { x: nx, y: ny }, star: { x: -ny, y: nx }, ellipse, rooms };
}

export interface Shot { kind: ShotKind; age: number; life: number; from: Pt; to: Pt; stopped: boolean; landed: boolean; miss: boolean }
export interface ShotState { shots: Shot[] }
export function createShots(): ShotState { return { shots: [] }; }

/** Queue a shot for every enemy hit on the crew ship (and every enemy miss: it flies past, through the centre and out). */
export function pushShots(s: ShotState, hits: readonly ShipHitRead[], frame: InteriorFrame, reach: number): void {
  const e = frame.ellipse, big: Ellipse = { cx: e.cx, cy: e.cy, rx: reach, ry: reach };
  for (const h of hits) {
    if (h.target !== CREW_SLOT) continue;
    const from = ellipsePoint(big, h.a, frame.nose, frame.star);
    let to: Pt;
    if (h.miss) to = ellipsePoint(big, h.a + Math.PI, frame.nose, frame.star);
    else if (h.stopped || h.room < 0 || h.room >= frame.rooms.length) to = ellipsePoint(e, h.a, frame.nose, frame.star);
    else to = frame.rooms[h.room]!;
    s.shots.push({ kind: h.kind, age: 0, life: FLIGHT_S[h.kind], from, to, stopped: h.stopped, landed: false, miss: h.miss });
  }
}

export function stepShots(s: ShotState, dt: number): void {
  if (dt <= 0) return;
  let w = 0;
  for (const sh of s.shots) {
    sh.age += dt;
    if (sh.age >= sh.life) sh.landed = true;
    if (sh.age < sh.life + SPLASH_S) s.shots[w++] = sh;
  }
  s.shots.length = w;
}

/** Where a shot is now and its trail (torpedo only: 4 earlier points spaced 0.03 s back, else []); `burst` 0..1 after it lands. */
export function shotDraw(shot: Shot): { x: number; y: number; trail: Pt[]; burst: number; heading: number } {
  const at = (age: number): Pt => {
    const k = Math.min(1, Math.max(0, age / shot.life));
    return { x: shot.from.x + (shot.to.x - shot.from.x) * k, y: shot.from.y + (shot.to.y - shot.from.y) * k };
  };
  const p = at(shot.age), trail: Pt[] = [];
  if (shot.kind === 'torpedo') for (let i = 1; i <= TRAIL_POINTS; i++) trail.push(at(shot.age - i * TRAIL_STEP_S));
  const burst = shot.landed && !shot.miss ? Math.min(1, Math.max(0, (shot.age - shot.life) / SPLASH_S)) : 0;
  return { x: p.x, y: p.y, trail, burst, heading: Math.atan2(shot.to.y - shot.from.y, shot.to.x - shot.from.x) };
}
