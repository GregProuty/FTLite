// The duel's science rules (Sci-1 spec 2026-11-17-science-scans §4, §5): what an admitted scan command does to the
// ship's one scanner. Hostility, scan progress, the derelict's orbit and salvage follow; stepDuel calls the three steps in that order (spec §4.6). Sim
// code: the heading tables for trig, never Math.sin, Math.cos or Math.PI (the determinism guard).
import { dirBetween, wrapHeading } from './direction';
import { circularSpeed } from './map';
import { classOf, Contact, CREW_SLOT, idleScan, Loot, Room, type ShipSystems, type TacticalState } from './state';
import { DT, HACK_DISABLE_TICKS, HACK_TICKS, HEADING_COUNT, HOSTILE_AFTER_TICKS, LOOT_HULL, SALVAGE_RANGE, SALVAGE_SPEED, SALVAGE_TICKS, SCAN_RATE_SCIENCE, SCAN_UNITS, TRAP_HULL } from './tuning';
import { hackOnline, SCAN_OTHER_BY_BARS, SCAN_SCIENCE_BY_BARS, scannerBars, SENSOR_RANGE_BY_BARS } from './bars';

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

/** Whether the enemy is hostile this round (spec §4.1): the one predicate the hunter's hold, the views and the battle
 *  music read. */
export function enemyHostile(t: TacticalState): boolean { return t.hostileAt >= 0; }

/** Spec §4.1's hostility step, after the weapon clocks (owner decision 2026-11-17, the Hunter-grace rule): while the
 *  enemy holds, the first of the clock (the step of rt HOSTILE_AFTER_TICKS − 1, so it acts from rt 1800) or the crew's
 *  first shot this round (a laser release, hit or miss, a gun round (Valkyrn spec §7.2), or a missile launch: the
 *  round's own counters) turns it hostile for the round (hostileAt = rt) and pushes a hostile event, cause laser, then
 *  gun, then pew, then missile, then clock. */
export function hostilityStep(t: TacticalState, hunter: number): void {
  if (t.hostileAt >= 0 || hunter < 0) return;
  const rt = roundTick(t), crew = t.systems[CREW_SLOT], hacked = enemyHacked(t);   // hacking spike R1-1: a landed hack is an attack (state-derived)
  if (crew.shots + crew.gunShots + crew.pewShots === 0 && crew.missilesLaunched === 0 && !hacked && rt < HOSTILE_AFTER_TICKS - 1) return;   // W-1: a pew round is a shot
  t.hostileAt = rt;
  t.events.push({ kind: 'hostile', cause: crew.shots > 0 ? 'laser' : crew.gunShots > 0 ? 'gun' : crew.pewShots > 0 ? 'pew' : crew.missilesLaunched > 0 ? 'missile' : hacked ? 'hack' : 'clock' });
}

/** Engineering spike spec §10.4 (Task 10): the crew's sensor range by its effective Sensors bars. */
export function sensorRange(sys: Pick<ShipSystems, 'rooms' | 'bars' | 'hackPower'>): number { return SENSOR_RANGE_BY_BARS[scannerBars(sys)]!; }   // hacking spike: the scanner's bars (the Sensors bars not on HACK)
/** Whether a point is within sensor range of the crew ship's centre (a torpedo in flight, for Part ii's fog). */
export function pointSeen(t: TacticalState, x: number, y: number): boolean {
  const a = t.ships[CREW_SLOT], r = sensorRange(t.systems[CREW_SLOT]), dx = x - a.x, dy = y - a.y;
  return dx * dx + dy * dy <= r * r;
}
/** Whether ship slot i is seen by the crew: the crew's own slot always; any other active slot within sensor range. */
export function shipSeen(t: TacticalState, i: number): boolean {
  if (i === CREW_SLOT) return true;
  const b = t.ships[i];
  return b !== undefined && b.active && pointSeen(t, b.x, b.y);
}
/** Whether a scan contact (Contact.Enemy: the crew's target ship; Contact.Derelict: the wreck) is seen. */
export function contactSeen(t: TacticalState, contact: number): boolean {
  if (contact === Contact.Enemy) return shipSeen(t, t.systems[CREW_SLOT].target);
  const p = derelictPos(t);
  return pointSeen(t, p.x, p.y);
}
/** Spec §2 Scans (Decision 8), §10.4: a running scan's progress this tick, from its station's row (scan.rate keeps the
 *  base rate, SCAN_RATE_SCIENCE for Science, so it picks the row) at the crew's current effective Sensors bars. */
export function scanProgressRate(t: TacticalState): number {
  const row = t.scan.rate === SCAN_RATE_SCIENCE ? SCAN_SCIENCE_BY_BARS : SCAN_OTHER_BY_BARS;
  return row[scannerBars(t.systems[CREW_SLOT])]!;   // hacking spike: the scanner's bars
}

/** Spec §4.3's progress step, after hostility: a running scan advances by its rate while the station running it is
 *  attended (`scanner`, the crew input's), or goes idle when it is not; at its level's units the contact becomes known to
 *  that level, a scanDone event is pushed and the scanner goes idle. */
export function scanStep(t: TacticalState, scanner: boolean): void {
  const s = t.scan;
  if (s.contact < 0) return;
  if (!scanner) { Object.assign(s, idleScan()); return; }
  if (!contactSeen(t, s.contact)) return;   // spec §10.4: a running scan pauses while its contact is unseen
  s.progress += scanProgressRate(t);         // spec §2, §10.4: no longer s.rate
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

// ---- Hacking (hacking spike 2026-11-20, spec §2.5, §6 R1) ----
/** Whether any Room of the crew's target ship is switched off by a hack now. */
export function enemyHacked(t: TacticalState): boolean {
  const h = t.systems[t.systems[CREW_SLOT].target]?.hacked;
  return h !== undefined && (h[0] > 0 || h[1] > 0 || h[2] > 0);
}
/** Why a hack on the target's `room` could not run now, or null: the hack module offline (below HACK_MIN_BARS), the enemy
 *  not designated by Science, the enemy unseen (outside the scanner's sensor range), or (`room` ≥ 0) that room already
 *  down. The admission's refusals and the hold's loss conditions (with the Science seat, which the step checks). */
export function hackBlocked(t: TacticalState, room = -1): 'HACK OFFLINE' | 'SELECT THE ENEMY' | 'OUT OF RANGE' | 'ALREADY DOWN' | null {
  const crew = t.systems[CREW_SLOT];
  if (!hackOnline(crew)) return 'HACK OFFLINE';
  if (t.designated !== Contact.Enemy) return 'SELECT THE ENEMY';
  if (!shipSeen(t, crew.target)) return 'OUT OF RANGE';
  if (room >= 0 && (t.systems[crew.target]?.hacked[room] ?? 0) > 0) return 'ALREADY DOWN';
  return null;
}
/** Spec §2.5, after the scan step: every slot's hacked rooms count down one tick; then a running hack is lost (event, back
 *  to idle) when the Science console is unattended (`hacker`) or hackBlocked, else it holds one more tick, and at
 *  HACK_TICKS it lands: the target's room is off for HACK_DISABLE_TICKS (a Shields hack also drops every layer), a done
 *  event is pushed and the hack goes idle. */
export function hackStep(t: TacticalState, hacker: boolean): void {
  for (const s of t.systems) for (let r = 0; r < 3; r++) if (s.hacked[r]! > 0) s.hacked[r as 0 | 1 | 2]--;
  const room = t.hackRoom;
  if (room < 0) return;
  if (!hacker || hackBlocked(t) !== null) { t.hackRoom = -1; t.hackTicks = 0; t.events.push({ kind: 'hack', what: 'lost', room }); return; }
  if (++t.hackTicks < HACK_TICKS) return;
  const target = t.systems[t.systems[CREW_SLOT].target]!;
  target.hacked[room as 0 | 1 | 2] = HACK_DISABLE_TICKS;
  if (room === Room.Shields) { target.shields = 0; target.shieldClock = 0; }
  t.hackRoom = -1; t.hackTicks = 0;
  t.events.push({ kind: 'hack', what: 'done', room });
}
