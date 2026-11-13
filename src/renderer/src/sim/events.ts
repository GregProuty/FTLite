import type { SimState } from './state';
import { nextFloat, nextInt } from '../../../shared/rng';
import { Health, Life, LifeState } from './components';
import { igniteRoom } from './hazards/fire';
import { activateBreach, freeSites } from './hazards/breach';
import { failStation, baseMax } from './power';
import { addScrap, spendScrap } from './scrap';
import { grantWeapon } from './weapons';
import { LOOT_WEAPON_TYPES } from './weaponDefs';
import { Encounter } from './enemy';
import { depthOf } from './depth';
import { skillLevelOf, SKILL_NAMES } from './skills';
import { STATION_NAMES } from './stationKinds';
import { EVENT_DEFS, type EventDef, type Effect, type Req, type Outcome } from './eventDefs';
import { HEALTH_MAX, HULL_MAX, TORP_CAP, TICK_HZ, ENCOUNTER_START, EVENT_SCRAP_SCALE, NOTICE_LINE_MAX } from './tuning';

export { EVENT_DEFS };
/** An event's scrap multiplier at the current depth: 1 + EVENT_SCRAP_SCALE x depth, 1 for an unscaled event (spec Loop-v section 1, amendment E1). */
export function eventScale(state: SimState, def: EventDef): number { return def.scaled === false ? 1 : 1 + EVENT_SCRAP_SCALE * depthOf(state); }
const scaled = (n: number, mult: number): number => Math.sign(n) * Math.round(Math.abs(n) * mult);

/** A blue option's tag (spec Loop-v section 1): `[Science 2] `, or '' for a choice without a station or skill requirement. */
export function blueTag(req: readonly Req[] | undefined): string {
  const r = req?.find((q) => q.kind === 'station' || q.kind === 'skill');
  if (!r) return '';
  return r.kind === 'station' ? `[${STATION_NAMES[r.station]} ${r.n}] ` : r.kind === 'skill' ? `[${SKILL_NAMES[r.skill]} ${r.n}] ` : '';
}
/** A label with its `{n}` scrap amounts at a multiplier. */
export const fillLabel = (label: string, mult: number): string => label.replace(/\{(\d+)\}/g, (_, n: string) => `${scaled(Number(n), mult)}`);
/** Choice k's label as Navigation shows it here: the blue tag, then the label with its scrap amounts scaled. */
export function choiceLabel(state: SimState, id: number, k: number): string {
  const def = EVENT_DEFS[id]!, c = def.choices[k]!;
  return blueTag(c.req) + fillLabel(c.label, eventScale(state, def));
}
/** Whether choice k is a blue option (a station or crew skill requirement). */
export const isBlue = (id: number, k: number): boolean => blueTag(EVENT_DEFS[id]?.choices[k]?.req) !== '';

/** The event list as the HUD and the bots read it: the title, the text on one line, the labels at depth 0 and the safe choice. */
export const EVENTS: readonly { title: string; text: string; choices: readonly [string, string, ...string[]]; safeChoice: number }[] = EVENT_DEFS.map((d) => ({ title: d.title, text: d.text.join(' '), choices: d.choices.map((c) => blueTag(c.req) + fillLabel(c.label, 1)) as unknown as [string, string, ...string[]], safeChoice: d.safeChoice }));

/** Whether one requirement holds at a scrap multiplier. */
export function reqMet(state: SimState, q: Req, mult: number): boolean {
  switch (q.kind) {
    case 'scrap': return state.run.scrap >= scaled(q.n, mult);
    case 'fuel': return state.run.fuel >= q.n;
    case 'hull': return state.hull > q.n;
    case 'torpedoes': return state.weapons.torpedoStock >= q.n;
    case 'torpedoRoom': return state.weapons.torpedoStock < TORP_CAP;
    case 'station': return state.derived.stationOfKind[q.station]! >= 0 && baseMax(state, q.station) >= q.n;
    case 'skill': for (let pid = 0; pid < state.playerCount; pid++) if (Life.state[state.crew[pid]!] === LifeState.Conscious && skillLevelOf(state, pid, q.skill) >= q.n) return true; return false;
  }
}

/** Whether choice k of event id can be taken: it exists and every requirement holds (spec Loop-v section 1). */
export function choiceEnabled(state: SimState, id: number, k: number): boolean {
  const def = EVENT_DEFS[id], c = def?.choices[k];
  if (!def || !c) return false;
  const mult = eventScale(state, def);
  return (c.req ?? []).every((q) => reqMet(state, q, mult));
}

/** Apply one effect (spec Loop-v section 1). Random picks draw rng.loot. */
export function applyEffect(state: SimState, e: Effect, mult: number): void {
  const r = state.run;
  switch (e.kind) {
    case 'scrap': { const n = scaled(e.n, mult); if (n >= 0) addScrap(state, n); else spendScrap(state, Math.min(r.scrap, -n)); break; }
    case 'fuel': r.fuel = Math.max(0, r.fuel + e.n); break;
    case 'hull': state.hull = Math.max(Math.min(state.hull, 1), Math.min(HULL_MAX, state.hull + e.n)); break;
    case 'torpedoes': state.weapons.torpedoStock = Math.max(0, Math.min(TORP_CAP, state.weapons.torpedoStock + e.n)); break;
    case 'heal': for (const eid of state.crew) if (Life.state[eid] === LifeState.Conscious) Health.cur[eid] = HEALTH_MAX; break;
    case 'crewDamage': for (const eid of state.crew) if (Life.state[eid] === LifeState.Conscious) Health.cur[eid] = Math.max(1, Health.cur[eid]! - e.n); break;
    case 'fire': igniteRoom(state, nextInt(state.rng.loot, state.layout.rooms.length)); break;
    case 'breach': { const sites = freeSites(state); if (sites.length) activateBreach(state, sites[nextInt(state.rng.loot, sites.length)]!); break; }
    case 'failStation': { const i = nextInt(state.rng.loot, state.stations.level.length); if (!state.stations.failed[i]) failStation(state, i); break; }
    case 'weapon': grantWeapon(state, 1 + nextInt(state.rng.loot, LOOT_WEAPON_TYPES), false); break;
    case 'fight': r.encounter = Encounter.Pending; r.encounterTick = state.tick; r.fieldNextTick = -1; if (e.elite) r.pursuitFought = 1; state.enemy.nextArrivalTick = state.tick + ENCOUNTER_START * TICK_HZ; break;
    case 'pursuit': r.pursuit += e.n; break;
    case 'driveReset': r.jumpCharge = 0; break;
    case 'nothing': break;
  }
}

/** Whether an event may be drawn here (spec Loop-v section 2): at or past its depth gate and, unless ignoreSeen, not yet drawn in this sector. */
export function eventEligible(state: SimState, id: number, ignoreSeen = false): boolean {
  return (EVENT_DEFS[id]!.minDepth ?? 0) <= depthOf(state) && (ignoreSeen || ((state.run.eventsSeen >>> id) & 1) === 0);
}
/** The event drawn on arrival at an Event beacon (spec Loop-v section 2): one rng.loot draw over the eligible events by weight; with every eligible event already seen in this sector, the seen ones count again. Marks the event seen. */
export function pickEvent(state: SimState): number {
  let ids = EVENT_DEFS.map((_, i) => i).filter((i) => eventEligible(state, i));
  if (ids.length === 0) ids = EVENT_DEFS.map((_, i) => i).filter((i) => eventEligible(state, i, true));
  const total = ids.reduce((a, i) => a + EVENT_DEFS[i]!.weight, 0);
  let u = nextFloat(state.rng.loot) * total, id = ids[ids.length - 1]!;
  for (const i of ids) { u -= EVENT_DEFS[i]!.weight; if (u < 0) { id = i; break; } }
  state.run.eventsSeen |= 1 << id;
  return id;
}

/** The notice's second line for an open event (spec Coop-ii section 3, Loop-v section 1): the labels, or numbered short labels when the labels do not fit NOTICE_LINE_MAX. */
export function noticeChoices(state: SimState, id: number): string {
  const def = EVENT_DEFS[id]!, mult = eventScale(state, def), full = def.choices.map((_, k) => choiceLabel(state, id, k)).join('  /  ');
  return full.length <= NOTICE_LINE_MAX ? full : def.choices.map((c, k) => `${k + 1} ${fillLabel(c.short ?? c.label, mult)}`).join('  /  ');
}

/** Apply choice k of the pending event; a no-op without a pending event or with a disabled choice (spec Loop-v section 1). A chance outcome draws rng.loot once, before its effects. */
export function resolveEvent(state: SimState, k: number): void {
  const r = state.run, id = r.event;
  if (id < 0 || r.eventChoice >= 0 || !choiceEnabled(state, id, k)) return;
  r.eventChoice = k; state.telemetry.eventsResolved++;
  const def = EVENT_DEFS[id]!;
  applyOutcome(state, def.choices[k]!.outcome, eventScale(state, def));
}
/** Apply an outcome at a scrap multiplier: a chance draws rng.loot once (success below the chance), then the branch's effects in order. Returns whether the success branch ran (true for plain effects). */
export function applyOutcome(state: SimState, o: Outcome, mult: number): boolean {
  const ok = 'chance' in o ? nextFloat(state.rng.loot) < o.chance : true;
  for (const e of 'chance' in o ? (ok ? o.success : o.failure) : o) applyEffect(state, e, mult);
  return ok;
}
