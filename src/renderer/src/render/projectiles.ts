import { Container, Graphics } from 'pixi.js';
import type { SimState } from '../sim/state';
import { ObjectKind } from '../sim/debris';
import { WORLD_BAND } from './worldFit';
import { projectilePath, projectilePos, evadePos, outcomeOf, shouldReset, roomCentrePx, asteroidShape, fragmentCount, hash01, showSecondsOf, SHAKE_ASTEROID_PX, SHAKE_SHOT_PX, SHAKE_SECONDS, type Path, type Pt } from './projectileModel';

/** Visible asteroids and enemy shots (spec Demo-vii section 2): a render-only layer over the ship, under the HUD, driven by the debris table. */
export interface ProjectileLayer { container: Container; reset(): void; draw(state: SimState, fit: { scale: number; x: number; y: number }, dt: number): Pt }

interface Tracked { id: number; kind: number; room: number; impactTick: number; path: Path; last: Pt | null; shape: Pt[]; spin: number }
interface Burst { x: number; y: number; age: number; parts: { vx: number; vy: number; size: number }[]; color: number; life: number }

const ROCK = 0x8a7a68, ROCK_EDGE = 0x5b4f43, DUST = 0xb8a890, BOLT = 0xff5a2a, BOLT_CORE = 0xffd0a0, PUFF = 0x9aa0ad;

export function createProjectileLayer(): ProjectileLayer {
  const container = new Container();
  const g = new Graphics(); container.addChild(g);
  let tracked = new Map<number, Tracked>(), evading: Tracked[] = [], bursts: Burst[] = [];
  let prevTick = -1, prevNode = -1, shakeAmp = 0, shakeLeft = 0, clock = 0;

  function reset(): void { tracked = new Map(); evading = []; bursts = []; shakeAmp = 0; shakeLeft = 0; prevTick = -1; prevNode = -1; }

  function burst(at: Pt, id: number, count: number, speed: number, color: number, life: number): void {
    const parts = Array.from({ length: count }, (_, k) => { const a = (k / count) * Math.PI * 2 + hash01(id, 20 + k) * 0.6; const v = speed * (0.5 + hash01(id, 40 + k)); return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 2 + Math.floor(hash01(id, 60 + k) * 3) }; });
    bursts.push({ x: at.x, y: at.y, age: 0, parts, color, life });
  }

  function drawRock(t: Tracked, p: Pt, alpha: number): void {
    const dir = { x: t.path.to.x - t.path.from.x, y: t.path.to.y - t.path.from.y }, len = Math.hypot(dir.x, dir.y) || 1;
    for (let k = 1; k <= 4; k++) g.circle(p.x - dir.x / len * k * 7, p.y - dir.y / len * k * 7, 3 - k * 0.5).fill({ color: DUST, alpha: alpha * (0.35 - k * 0.07) });   // faint dust trail
    const c = Math.cos(t.spin), s = Math.sin(t.spin);
    g.poly(t.shape.flatMap((q) => [p.x + q.x * c - q.y * s, p.y + q.x * s + q.y * c])).fill({ color: ROCK, alpha }).stroke({ color: ROCK_EDGE, width: 1, alpha });
  }

  function drawBolt(t: Tracked, p: Pt, alpha: number): void {
    const dir = { x: t.path.to.x - t.path.from.x, y: t.path.to.y - t.path.from.y }, len = Math.hypot(dir.x, dir.y) || 1, ux = dir.x / len, uy = dir.y / len;
    g.moveTo(p.x - ux * 26, p.y - uy * 26).lineTo(p.x, p.y).stroke({ color: BOLT, width: 2, alpha: alpha * 0.45 });   // trail
    g.moveTo(p.x - ux * 10, p.y - uy * 10).lineTo(p.x, p.y).stroke({ color: BOLT, width: 4, alpha });
    g.circle(p.x, p.y, 2).fill({ color: BOLT_CORE, alpha });
  }

  return {
    container, reset,
    draw(state, fit, dt) {
      clock += dt;
      const node = state.run.column * 3 + state.run.node, tick = state.tick, db = state.debris;
      if (prevTick >= 0 && shouldReset(prevTick, tick, prevNode, node)) reset();
      prevTick = tick; prevNode = node;
      const present = new Set<number>();
      for (let k = 0; k < db.active.length; k++) {
        if (!db.active[k]) continue;
        const id = db.stableId[k]!; present.add(id);
        if (!tracked.has(id)) {
          const kind = db.kind[k]!, room = db.room[k]!;
          tracked.set(id, { id, kind, room, impactTick: db.impactTick[k]!, path: projectilePath(id, kind, roomCentrePx(state.derived, room, fit), WORLD_BAND), last: null, shape: asteroidShape(id, kind === ObjectKind.Rock), spin: hash01(id, 6) * Math.PI * 2 });
        }
      }
      for (const [id, t] of tracked) {
        if (present.has(id)) continue;
        tracked.delete(id);
        const out = outcomeOf(tick, t.impactTick, state.rooms.impactTick[t.room] ?? -1);
        if (out === 'hit') {
          burst(t.path.to, id, t.kind === ObjectKind.Shot ? 8 : fragmentCount(id), t.kind === ObjectKind.Shot ? 70 : 55, t.kind === ObjectKind.Shot ? BOLT : ROCK, 0.6);
          shakeAmp = Math.max(shakeAmp * (shakeLeft / SHAKE_SECONDS), t.kind === ObjectKind.Shot ? SHAKE_SHOT_PX : SHAKE_ASTEROID_PX); shakeLeft = SHAKE_SECONDS;
        } else if (out === 'destroyed') { if (t.last) burst(t.last, id, 6, 18, PUFF, 0.5); }
        else evading.push(t);
      }
      g.clear();
      for (const t of tracked.values()) {
        const p = projectilePos(t.path, t.impactTick, tick, showSecondsOf(t.kind));
        t.last = p;
        if (!p) continue;
        if (t.kind === ObjectKind.Shot) drawBolt(t, p, 1); else { t.spin += dt * (0.6 + hash01(t.id, 7)); drawRock(t, p, 1); }
      }
      evading = evading.filter((t) => {
        const e = evadePos(t.path, t.impactTick, tick, showSecondsOf(t.kind));
        if (!e) return false;
        if (t.kind === ObjectKind.Shot) drawBolt(t, e, e.alpha); else { t.spin += dt; drawRock(t, e, e.alpha); }
        return true;
      });
      bursts = bursts.filter((b) => {
        b.age += dt;
        if (b.age >= b.life) return false;
        const a = 1 - b.age / b.life;
        for (const p of b.parts) g.rect(b.x + p.vx * b.age - p.size / 2, b.y + p.vy * b.age - p.size / 2, p.size, p.size).fill({ color: b.color, alpha: a });
        return true;
      });
      // World shake after a hit: amplitude decays linearly to zero over SHAKE_SECONDS.
      if (shakeLeft <= 0) return { x: 0, y: 0 };
      shakeLeft = Math.max(0, shakeLeft - dt);
      const amp = shakeAmp * (shakeLeft / SHAKE_SECONDS);
      return { x: Math.round(Math.sin(clock * 90) * amp), y: Math.round(Math.cos(clock * 77) * amp) };
    }
  };
}
