import type { SimState } from './state';
import { nextInt } from '../../../shared/rng';
import { Health, Life, LifeState } from './components';
import { igniteRoom } from './hazards/fire';
import { activateBreach, freeSites } from './hazards/breach';
import { failStation } from './power';
import { addScrap, spendScrap } from './scrap';
import { HEALTH_MAX, TORP_CAP } from './tuning';

/** The six events (spec Run-ii section 7). Text is data; safeChoice is the bot's pick (spec Demo-i section 6); the effects live in resolveEvent. */
export const EVENTS: readonly { title: string; text: string; choices: readonly [string, string]; safeChoice: 0 | 1 }[] = [
  { title: 'Derelict hulk', text: 'A drifting hulk, still warm inside.', choices: ['Salvage it (+25 scrap, fire risk)', 'Leave it'], safeChoice: 1 },
  { title: 'Distress call', text: 'A venting freighter offers a reward.', choices: ['Help them (hull -10, +30 scrap)', 'Ignore it'], safeChoice: 1 },
  { title: 'Smugglers', text: 'Smugglers offer cheap torpedoes.', choices: ['Buy 2 torpedoes (20 scrap)', 'Refuse'], safeChoice: 1 },
  { title: 'Micrometeoroid field', text: 'A debris field lies across the lane.', choices: ['Push through (+20, breach risk)', 'Go around (drive recharges)'], safeChoice: 1 },
  { title: 'Supply cache', text: 'A cache, hard-wired to something.', choices: ['Take the scrap (+40)', 'Strip it bare (+60, a station fails)'], safeChoice: 0 },
  { title: 'Medical freighter', text: 'A hospital ship offers treatment.', choices: ['Treat the crew (15 scrap)', 'Decline'], safeChoice: 1 },
];

export function choiceEnabled(state: SimState, id: number, k: number): boolean {
  if (k !== 0) return true;
  if (id === 1) return state.hull > 10;
  if (id === 2) return state.run.scrap >= 20 && state.weapons.torpedoStock < TORP_CAP;
  if (id === 5) return state.run.scrap >= 15;
  return true;
}

/** Apply choice k of the pending event; a no-op without a pending event or with a disabled choice (spec Run-ii section 7). Loot draws only where listed. */
export function resolveEvent(state: SimState, k: number): void {
  const r = state.run, id = r.event;
  if (id < 0 || r.eventChoice >= 0 || !choiceEnabled(state, id, k)) return;
  r.eventChoice = k; state.telemetry.eventsResolved++;
  if (k === 1 && id !== 3 && id !== 4) return;
  switch (id) {
    case 0: { addScrap(state, 25); igniteRoom(state, nextInt(state.rng.loot, state.layout.rooms.length)); break; }
    case 1: { state.hull -= 10; addScrap(state, 30); break; }
    case 2: { spendScrap(state, 20); state.weapons.torpedoStock = Math.min(TORP_CAP, state.weapons.torpedoStock + 2); break; }
    case 3: { if (k === 1) { r.jumpCharge = 0; break; } addScrap(state, 20); const sites = freeSites(state); if (sites.length) activateBreach(state, sites[nextInt(state.rng.loot, sites.length)]!); break; }
    case 4: { if (k === 0) { addScrap(state, 40); break; } addScrap(state, 60); const i = nextInt(state.rng.loot, state.stations.level.length); if (!state.stations.failed[i]) failStation(state, i); break; }
    case 5: { spendScrap(state, 15); for (const eid of state.crew) if (Life.state[eid] === LifeState.Conscious) Health.cur[eid] = HEALTH_MAX; break; }
  }
}
