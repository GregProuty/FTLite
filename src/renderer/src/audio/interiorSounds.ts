// Audio-i spec section 4c: the ship interior's sounds from render-side state diffs, for the sector state and the duel's
// interior alike: a door opening or closing, sitting at a console, a room catching fire, and the burning-room count that
// drives the crackle loop. The same stale-replay guard as render/impactModel.ts.
import type { SimState } from '../sim/state';
import { HIT_FRESH_TICKS } from '../render/impactModel';
import { tilePan } from './voices';
import type { SoundRequest } from './soundBank';

/** The door states that pass crew (Open, HeldOpen): a copy of sim/grid's, pinned by tests/audioInterior.test.ts. */
export const OPEN_DOOR_STATES: readonly number[] = [1, 3];

/** What the diff reads: the tick, the per-edge door states, the per-room fire, the per-station occupant (-1 empty), and a
 *  pan per door edge and per station. */
export interface InteriorAudioView {
  tick: number; doors: ArrayLike<number>; fire: ArrayLike<number>; occupant: ArrayLike<number>;
  doorPan: readonly number[]; stationPan: readonly number[];
}
export interface InteriorWatch { tick: number; open: boolean[]; burning: boolean[]; seated: boolean[] }

/** A sim state as the diff reads it; `tick` defaults to the state's own (the duel passes its tactical tick). */
export function interiorAudioView(state: SimState, tick = state.tick): InteriorAudioView {
  const d = state.derived, w = d.width;
  return {
    tick, doors: state.doors.state, fire: state.rooms.fire, occupant: state.stations.occupant,
    doorPan: Array.from(d.edgeTile, (t) => tilePan(t % w, w)), stationPan: Array.from(d.stationTile, (t) => tilePan(t % w, w))
  };
}

export function interiorSounds(w: InteriorWatch | null, v: InteriorAudioView): { watch: InteriorWatch; sounds: SoundRequest[]; fires: number } {
  const open = Array.from(v.doors, (s) => OPEN_DOOR_STATES.includes(s)), burning = Array.from(v.fire, (f) => f > 0), seated = Array.from(v.occupant, (o) => o >= 0);
  const fires = burning.filter(Boolean).length, watch: InteriorWatch = { tick: v.tick, open, burning, seated };
  const fresh = !!w && v.tick >= w.tick && v.tick - w.tick <= HIT_FRESH_TICKS
    && w.open.length === open.length && w.burning.length === burning.length && w.seated.length === seated.length;
  if (!w || !fresh) return { watch, sounds: [], fires };
  const sounds: SoundRequest[] = [];
  open.forEach((o, e) => { if (o !== w.open[e]) sounds.push({ key: o ? 'doorOpen' : 'doorClose', gain: 0.6, pan: v.doorPan[e] ?? 0 }); });
  seated.forEach((s, k) => { if (s && !w.seated[k]) sounds.push({ key: 'console', gain: 0.5, pan: v.stationPan[k] ?? 0 }); });
  burning.forEach((b, r) => { if (b && !w.burning[r]) sounds.push({ key: 'thruster', gain: 0.45, dur: 0.5, filter: { type: 'lowpass', from: 1200 } }); });
  return { watch, sounds, fires };
}
