// Engineering spike §10.4: the fog of war on the crew's maps. View state only, computed by each client from the sim state
// (no sim field): a contact (the enemy, the derelict, the enemy's torpedo) is seen while it is inside the sensor range of
// the crew ship's centre (the sim's contactSeen for the enemy and the derelict, its pointSeen for the torpedo, which has
// no sim gate). An unseen contact the screen saw before leaves a ghost at its last seen position and heading,
// fading over GHOST_SECONDS on the presentation clock, then gone. A contact that ends (destroyed, its torpedo ended)
// leaves no ghost, and a new round clears them all. Planets and asteroids are never fogged. The crew's own torpedo is
// always shown (Decision 15).
// Sensors blip spec §2 (2026-11-19) amends the above: the enemy ship leaves no ghost. While it is active and unseen it
// has a blip: a ping (a centre and a radius fixed when it is made) held until the next one. Pings are timed on the
// tactical state's tick, not the presentation clock, so a paused or frozen state makes no new ping. Each screen makes
// its own; the offset is a hash of the round's seed, the round and the ping's index, and reads no Math.random and none of the sim's
// random state.
import { contactSeen, derelictPos, pointSeen, sensorRange } from '../../sim/tactical/science';
import { Contact, CREW_SLOT, missileOf, targetOf, type TacticalState } from '../../sim/tactical/state';

export const GHOST_SECONDS = 10;
/** Sensors blip spec §2.2, §2.3: the blip's radius in world units is BLIP_R_MIN just beyond sensor range, grows by
 *  BLIP_GROW a unit beyond it and stops at BLIP_R_MAX; a new ping every BLIP_PING_TICKS game ticks (2 s at TICK_HZ 60). */
export const BLIP_R_MIN = 150, BLIP_GROW = 0.25, BLIP_R_MAX = 600, BLIP_PING_TICKS = 120;
export type GhostKind = 'enemy' | 'derelict' | 'missile';
/** A ghost in world units: its last seen place and continuous heading (heading + headingAcc), and its alpha 0..1. */
export interface Ghost { kind: GhostKind; x: number; y: number; h: number; alpha: number }
/** Sensors blip spec §2.4: the held ping in world units, and its age 0..1 across its life (the draw fades by it). */
export interface Blip { x: number; y: number; r: number; age: number }
/** `seen` keeps the enemy's flag, but no ghost of kind 'enemy' is produced (sensors blip spec §2.1). `blip`: absent or
 *  null means none. */
export interface FogView { range: number; seen: Record<GhostKind, boolean>; ghosts: Ghost[]; blip?: Blip | null }
interface Track { x: number; y: number; h: number; seenAt: number }
/** The held ping (sensors blip spec §2.3): its index (floor(tick / BLIP_PING_TICKS)), the tick it was made at, and its
 *  centre and radius in world units. */
interface Ping { index: number; madeAt: number; x: number; y: number; r: number }
export interface FogTracker { tracks: Map<GhostKind, Track>; epoch: number | null; ping: Ping | null }
const KINDS: readonly GhostKind[] = ['enemy', 'derelict', 'missile'];

export function createFog(): FogTracker { return { tracks: new Map(), epoch: null, ping: null }; }

/** Sensors blip spec §2.3 (amended 2026-11-20: the seed keeps the offsets from repeating across games): the hash of the
 *  round's seed, the round (`epoch`) and the ping's `index`, in 32-bit integer arithmetic, as two
 *  numbers in 0..1. The same seed, round and index give the same pair. Plain view code: no Math.random, no sim state. */
export function blipHash(seed: number, epoch: number, index: number): { u: number; v: number } {
  let h = Math.imul(epoch ^ Math.imul(seed, 0x27d4eb2d) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return { u: (h & 0xffff) / 65536, v: (h >>> 16) / 65536 };
}
/** Sensors blip spec §2.2: the blip's radius for an enemy `beyond` world units past sensor range (never below 0). */
export function blipRadius(beyond: number): number { return Math.min(BLIP_R_MAX, BLIP_R_MIN + BLIP_GROW * Math.max(0, beyond)); }

/** One frame of the fog at presentation time `now` (seconds) in round `epoch`. */
export function stepFog(f: FogTracker, t: TacticalState, now: number, epoch: number): FogView {
  if (f.epoch !== epoch) { f.tracks.clear(); f.ping = null; f.epoch = epoch; }   // sensors blip spec §2.3: a new round clears the ping too
  const range = sensorRange(t.systems[CREW_SLOT]!), slot = targetOf(t, CREW_SLOT), e = t.ships[slot], m = missileOf(t, slot), w = derelictPos(t);
  const facts: Record<GhostKind, { present: boolean; seen: boolean; x: number; y: number; h: number }> = {
    enemy: { present: e?.active === true, seen: e?.active === true && contactSeen(t, Contact.Enemy), x: e?.x ?? 0, y: e?.y ?? 0, h: e ? e.heading + e.headingAcc : 0 },
    derelict: { present: true, seen: contactSeen(t, Contact.Derelict), x: w.x, y: w.y, h: 0 },
    missile: { present: m !== null, seen: m !== null && pointSeen(t, m.x, m.y), x: m?.x ?? 0, y: m?.y ?? 0, h: m ? m.heading + m.headingAcc : 0 }
  };
  const seen = { enemy: false, derelict: false, missile: false }, ghosts: Ghost[] = [];
  for (const kind of KINDS) {
    const k = facts[kind];
    seen[kind] = k.seen;
    if (kind === 'enemy') continue;   // sensors blip spec §2.1: the enemy ship leaves no ghost (its blip is made below)
    if (!k.present) { f.tracks.delete(kind); continue; }
    if (k.seen) { f.tracks.set(kind, { x: k.x, y: k.y, h: k.h, seenAt: now }); continue; }
    const tr = f.tracks.get(kind);
    if (!tr) continue;
    const alpha = 1 - (now - tr.seenAt) / GHOST_SECONDS;
    if (alpha <= 0) { f.tracks.delete(kind); continue; }
    ghosts.push({ kind, x: tr.x, y: tr.y, h: tr.h, alpha });
  }
  // Sensors blip spec §2.1, §2.3: a blip while the enemy ship is active and unseen. A new ping is made when none is held
  // or the held one's index is not this tick's: the enemy's true place plus an offset of length 0.8 r sqrt(u) along the
  // angle 2 pi v, so the enemy is inside the circle when the ping is made and the centre is not a good guess of it.
  // Between pings the circle holds still. Seen, destroyed or absent: the held ping is dropped at once.
  let blip: Blip | null = null;
  const en = facts.enemy;
  if (en.present && !en.seen) {
    const index = Math.floor(t.tick / BLIP_PING_TICKS);
    let p = f.ping;
    if (!p || p.index !== index) {
      const own = t.ships[CREW_SLOT]!, dx = en.x - own.x, dy = en.y - own.y, r = blipRadius(Math.sqrt(dx * dx + dy * dy) - range);
      const { u, v } = blipHash(t.seed, epoch, index), len = 0.8 * r * Math.sqrt(u), a = 2 * Math.PI * v;
      p = f.ping = { index, madeAt: t.tick, x: en.x + Math.cos(a) * len, y: en.y + Math.sin(a) * len, r };
    }
    // Its age: 0 when made (a ping made partway through a period too), 1 as the next is due.
    blip = { x: p.x, y: p.y, r: p.r, age: Math.min(1, Math.max(0, (t.tick - p.madeAt) / ((p.index + 1) * BLIP_PING_TICKS - p.madeAt))) };
  } else f.ping = null;
  return { range, seen, ghosts, blip };
}
