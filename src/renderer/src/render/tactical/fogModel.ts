// Engineering spike §10.4: the fog of war on the crew's maps. View state only, computed by each client from the sim state
// (no sim field): a contact (the enemy, the derelict, the enemy's torpedo) is seen while it is inside the sensor range of
// the crew ship's centre (the sim's contactSeen for the enemy and the derelict, its pointSeen for the torpedo, which has
// no sim gate). An unseen contact the screen saw before leaves a ghost at its last seen position and heading,
// fading over GHOST_SECONDS on the presentation clock, then gone. A contact that ends (destroyed, its torpedo ended)
// leaves no ghost, and a new round clears them all. Planets and asteroids are never fogged. The crew's own torpedo is
// always shown (Decision 15).
import { contactSeen, derelictPos, pointSeen, sensorRange } from '../../sim/tactical/science';
import { Contact, CREW_SLOT, missileOf, targetOf, type TacticalState } from '../../sim/tactical/state';

export const GHOST_SECONDS = 10;
export type GhostKind = 'enemy' | 'derelict' | 'missile';
/** A ghost in world units: its last seen place and continuous heading (heading + headingAcc), and its alpha 0..1. */
export interface Ghost { kind: GhostKind; x: number; y: number; h: number; alpha: number }
export interface FogView { range: number; seen: Record<GhostKind, boolean>; ghosts: Ghost[] }
interface Track { x: number; y: number; h: number; seenAt: number }
export interface FogTracker { tracks: Map<GhostKind, Track>; epoch: number | null }
const KINDS: readonly GhostKind[] = ['enemy', 'derelict', 'missile'];

export function createFog(): FogTracker { return { tracks: new Map(), epoch: null }; }

/** One frame of the fog at presentation time `now` (seconds) in round `epoch`. */
export function stepFog(f: FogTracker, t: TacticalState, now: number, epoch: number): FogView {
  if (f.epoch !== epoch) { f.tracks.clear(); f.epoch = epoch; }
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
    if (!k.present) { f.tracks.delete(kind); continue; }
    if (k.seen) { f.tracks.set(kind, { x: k.x, y: k.y, h: k.h, seenAt: now }); continue; }
    const tr = f.tracks.get(kind);
    if (!tr) continue;
    const alpha = 1 - (now - tr.seenAt) / GHOST_SECONDS;
    if (alpha <= 0) { f.tracks.delete(kind); continue; }
    ghosts.push({ kind, x: tr.x, y: tr.y, h: tr.h, alpha });
  }
  return { range, seen, ghosts };
}
