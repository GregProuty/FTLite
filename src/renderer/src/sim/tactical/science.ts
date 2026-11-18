// The duel's science rules (Sci-1 spec 2026-11-17-science-scans §4, §5): what an admitted scan command does to the
// ship's one scanner. Hostility, scan progress, the derelict's orbit and salvage follow; stepDuel calls the three steps in that order (spec §4.6). Sim
// code: the heading tables for trig, never Math.sin, Math.cos or Math.PI (the determinism guard).
import { dirBetween, wrapHeading } from './direction';
import { circularSpeed } from './map';
import { classOf, CREW_SLOT, HunterMode, idleScan, Loot, type TacticalState } from './state';
import { DT, HEADING_COUNT, HOSTILE_AFTER_TICKS, LOOT_HULL, SALVAGE_RANGE, SALVAGE_SPEED, SALVAGE_TICKS, SCAN_UNITS, TRAP_HULL } from './tuning';

/** A contactScan the duel step admitted (spec §5): scan the next level of `contact` at `rate` from station `by`. On the
 *  same contact and level the progress is kept: a faster station takes the scan over (applied), a slower or equal one
 *  is a noop (Artemis ignores a repeat click). Idle, or on the other contact, it starts afresh (that progress is lost). */
export function scanCommand(t: TacticalState, contact: number, rate: number, by: number): 'applied' | 'noop' {
  const level = t.known[contact]! + 1, s = t.scan;
  if (s.contact === contact && s.level === level) {
    if (rate <= s.rate) return 'noop';
    s.rate = rate; s.by = by;
    return 'applied';
  }
  s.contact = contact; s.level = level; s.progress = 0; s.rate = rate; s.by = by;
  return 'applied';
}

/** The round-relative tick (spec §4.1): ticks since the round began, read before the step's tick++. */
export function roundTick(t: TacticalState): number { return t.tick - t.startTick; }

/** Spec §4.1's hostility step, after the weapon clocks: while the enemy patrols, the first of the clock (the step of rt
 *  HOSTILE_AFTER_TICKS − 1), a crew laser release that hit, or a crew missile landing on the hunter slot turns it
 *  hostile for the round (Hunt) and pushes a hostile event, cause laser, then missile, then clock. */
export function hostilityStep(t: TacticalState, hunter: number): void {
  if (t.hostileAt >= 0 || hunter < 0) return;
  const rt = roundTick(t);
  const laser = t.events.some((e) => e.kind === 'laser' && e.ship === CREW_SLOT && e.hit);
  const missile = t.events.some((e) => e.kind === 'missileEnd' && e.ship === CREW_SLOT && e.cause === 'ship' && e.target === hunter);
  if (!laser && !missile && rt < HOSTILE_AFTER_TICKS - 1) return;
  t.hostileAt = rt; t.hunter.mode = HunterMode.Hunt;
  t.events.push({ kind: 'hostile', cause: laser ? 'laser' : missile ? 'missile' : 'clock' });
}

/** Spec §4.3's progress step, after hostility: a running scan advances by its rate while the station running it is
 *  attended (`scanner`, the crew input's), or goes idle when it is not; at its level's units the contact becomes known to
 *  that level, a scanDone event is pushed and the scanner goes idle. */
export function scanStep(t: TacticalState, scanner: boolean): void {
  const s = t.scan;
  if (s.contact < 0) return;
  if (!scanner) { Object.assign(s, idleScan()); return; }
  s.progress += s.rate;
  if (s.progress < SCAN_UNITS[s.level]!) return;
  t.known[s.contact as 0 | 1] = s.level;
  t.events.push({ kind: 'scanDone', contact: s.contact, level: s.level });
  Object.assign(s, idleScan());
}

/** 2π, as a literal: Math.PI is outside the determinism guard's allowlist. */
const TWO_PI = 6.283185307179586;

/** The derelict's place and velocity at the state's round-relative tick (spec §4.5): it circles the planet at the origin
 *  clockwise at radius orbitR and the circular speed, starting at heading `phase`; table trig only. */
export function derelictPos(t: TacticalState): { x: number; y: number; vx: number; vy: number } {
  const { orbitR, phase } = t.derelict, v = circularSpeed(orbitR);
  const wh = ((v / orbitR) * DT * HEADING_COUNT) / TWO_PI, a = phase + wh * roundTick(t), i = Math.floor(a), f = a - i;
  const [ux, uy] = dirBetween(wrapHeading(i), f), [px, py] = dirBetween(wrapHeading(i + HEADING_COUNT / 4), f);   // prograde, as spawnAt
  return { x: ux * orbitR, y: uy * orbitR, vx: px * v, vy: py * v };
}

/** The derelict's loot on the crew's systems (spec §4.5). */
function applyLoot(t: TacticalState, loot: number): void {
  const sys = t.systems[CREW_SLOT], c = classOf(t, CREW_SLOT);
  if (loot === Loot.Hull) sys.hull = Math.min(c.hull, sys.hull + LOOT_HULL);
  else if (loot === Loot.Missiles) sys.magazine = c.slots.missile.magazine;
  else sys.shields = Math.min(c.shields.layers + 1, sys.shields + 1);   // one layer over the class layers, never regained
}

/** Spec §4.5's salvage step, after the scan step: while the derelict is not salvaged, the crew ship within SALVAGE_RANGE
 *  of it and at most SALVAGE_SPEED relative to its velocity adds one to the hold, anything else resets it. At
 *  SALVAGE_TICKS it is salvaged (the hold back to 0): the loot applies, then a trap costs TRAP_HULL hull (floor 0, so the
 *  outcome check that follows can end the round), and a salvage event is pushed. Needs no scan and no seated Helm. */
export function salvageStep(t: TacticalState): void {
  const dr = t.derelict;
  if (dr.salvaged) return;
  const s = t.ships[CREW_SLOT], p = derelictPos(t), dx = s.x - p.x, dy = s.y - p.y, wx = s.vx - p.vx, wy = s.vy - p.vy;
  if (dx * dx + dy * dy > SALVAGE_RANGE * SALVAGE_RANGE || wx * wx + wy * wy > SALVAGE_SPEED * SALVAGE_SPEED) { dr.salvage = 0; return; }
  if (++dr.salvage < SALVAGE_TICKS) return;
  dr.salvage = 0; dr.salvaged = true;
  applyLoot(t, dr.loot);
  if (dr.trapped) { const sys = t.systems[CREW_SLOT]; sys.hull = Math.max(0, sys.hull - TRAP_HULL); }
  t.events.push({ kind: 'salvage', loot: dr.loot, trapped: dr.trapped });
}
