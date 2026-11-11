import type { SimState } from './state';
import { Life, LifeState, Seated } from './components';
import { stationOnline } from './stations';
import { TICK_HZ, SIM_VERSION, SKILL_COUNT } from './tuning';
import { STATION_NAMES } from './stationKinds';
import { EndReason } from './crew';
import { characterOf } from './characters';
import { skillLevelOf } from './skills';
import { HazardType, Phase } from './director';

/** Indices into telemetry.repairs (spec 4-ii section 5). */
export const REPAIR_FIRE = 0, REPAIR_BREACH = 1, REPAIR_POWER = 2;

/** Last system in step(), after crewSystem and before tick++: final-state samples of manning and activity, and the life-state edges (spec 4-ii section 5). */
export function telemetrySystem(state: SimState): void {
  const t = state.telemetry, st = state.stations, d = state.derived;
  for (let i = 0; i < st.occupant.length; i++) if (st.occupant[i]! >= 0 && stationOnline(state, i)) t.mannedTicks[d.stationKind[i]!]!++;
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!, seat = Seated.station[eid]!;
    const active = (seat >= 0 && stationOnline(state, seat)) || state.scratch.activeThisTick[pid] === 1;
    if (active) t.idleRun[pid] = 0;
    else { t.idleRun[pid]!++; if (t.idleRun[pid]! > t.longestIdle[pid]!) t.longestIdle[pid] = t.idleRun[pid]!; }
    const life = Life.state[eid]!, prev = t.prevLife[pid]!;
    // Leaving Conscious is the "down" edge (a Conscious -> Dead jump in one tick sets both); reaching Dead is the "death" edge.
    if (prev === LifeState.Conscious && life !== LifeState.Conscious && t.firstDownTick < 0) { t.firstDownTick = state.tick; t.firstDownPid = pid; }
    if (prev !== LifeState.Dead && life === LifeState.Dead && t.firstDeathTick < 0) { t.firstDeathTick = state.tick; t.firstDeathPid = pid; }
    t.prevLife[pid] = life;
  }
}

export interface TelemetryRecord {
  version: 1; simVersion: number; seed: number; playerCount: number; characters: string[];
  endReason: 'hull' | 'crew' | 'running';
  durationSeconds: number;
  firstDown: { who: string; seconds: number } | null; firstDeath: { who: string; seconds: number } | null;
  stationsNeverManned: string[]; mannedSeconds: Record<string, number>; longestIdleSeconds: number[];
  spawns: { fire: number; breach: number; power: number; debris: number };
  impacts: number; evadeRolls: number; evasions: number; shots: number; hits: number;
  repairs: { fire: number; breach: number; power: number };
  maxStress: number; phaseEntries: { buildUp: number; sustainPeak: number; peakFade: number; relax: number };
  skills: number[][];
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
/** Completed ticks as seconds, one decimal. */
export function durationSeconds(ticks: number): number { return round1(ticks / TICK_HZ); }
/** An event stored at tick t happened during that tick; report the duration completed at its end (spec 4-ii section 2). */
export function eventSeconds(tick: number): number { return round1((tick + 1) / TICK_HZ); }

/** Pure: reads the state, allocates every array and object afresh (spec 4-ii section 6). */
export function telemetryRecord(state: SimState, seed: number): TelemetryRecord {
  const t = state.telemetry, d = state.derived;
  const characters = state.crew.map((_, pid) => characterOf(state, pid).name);
  const present: number[] = []; for (let k = 0; k < STATION_NAMES.length; k++) if (d.stationOfKind[k]! >= 0) present.push(k);
  const mannedSeconds: Record<string, number> = {};
  for (const k of present) mannedSeconds[STATION_NAMES[k]!] = durationSeconds(t.mannedTicks[k]!);
  const event = (tick: number, pid: number) => (tick < 0 ? null : { who: characters[pid]!, seconds: eventSeconds(tick) });
  return {
    version: 1, simVersion: SIM_VERSION, seed, playerCount: state.playerCount, characters,
    endReason: state.ended ? (state.endReason === EndReason.Hull ? 'hull' : 'crew') : 'running',
    durationSeconds: durationSeconds(state.tick),
    firstDown: event(t.firstDownTick, t.firstDownPid), firstDeath: event(t.firstDeathTick, t.firstDeathPid),
    stationsNeverManned: present.filter((k) => t.mannedTicks[k] === 0).map((k) => STATION_NAMES[k]!),
    mannedSeconds,
    longestIdleSeconds: Array.from(t.longestIdle, (v) => durationSeconds(v)),
    spawns: { fire: t.spawns[HazardType.Fire]!, breach: t.spawns[HazardType.Breach]!, power: t.spawns[HazardType.Power]!, debris: t.spawns[HazardType.Debris]! },
    impacts: t.impacts, evadeRolls: t.evadeRolls, evasions: t.evasions, shots: t.shots, hits: t.hits,
    repairs: { fire: t.repairs[REPAIR_FIRE]!, breach: t.repairs[REPAIR_BREACH]!, power: t.repairs[REPAIR_POWER]! },
    maxStress: t.maxStress,
    phaseEntries: { buildUp: t.phaseEntries[Phase.BuildUp]!, sustainPeak: t.phaseEntries[Phase.SustainPeak]!, peakFade: t.phaseEntries[Phase.PeakFade]!, relax: t.phaseEntries[Phase.Relax]! },
    skills: state.crew.map((_, pid) => Array.from({ length: SKILL_COUNT }, (_, k) => skillLevelOf(state, pid, k)))
  };
}
