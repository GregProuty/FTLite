// Audio-i spec sections 4-5: the duel's audio adapter, fed once per frame by the scene (Single player and the online duel
// alike): the event and state sounds, the round-end cue, and the music and loop report; duel polish i spec §C: the fire
// alarm, the downed and revived cues and the local character's heartbeat.
import type { AudioOut } from '../audio';
import type { DuelState } from '../../sim/duel/state';
import type { Axes } from '../../sim/tactical/state';
import type { ViewEvent } from '../../render/tactical/fxModel';
import {
  CREW, FIRE_ALARM, HEARTBEAT, OUTCOME_RUNNING, crewLifeSounds, duelEventSounds, duelStateSounds, fireAlarm, heartbeat, heartbeatOn,
  hostileWatch, type CrewLife, type CrewWatch, type DuelWatch, type HostileWatch, type Pan
} from '../../audio/duelSounds';
import { interiorAudioView, interiorSounds, type InteriorWatch } from '../../audio/interiorSounds';

/** `live`: false while the view is a frozen copy (a lost online link); absent means live. `me`: the local player's index
 *  (the active character in Single player, this seat online), `crew`: each character's health and downed state, `dt`: this
 *  frame's wall seconds (the heartbeat's and the fire alarm's clock; duel polish i spec §C). */
export interface DuelAudioFrame {
  duel: DuelState; events: readonly ViewEvent[]; axes: Axes; paused: boolean; pan: Pan; live?: boolean;
  me: number; crew: CrewLife; dt: number;
}

export function createDuelAudio(out: AudioOut) {
  let duelWatch: DuelWatch | null = null, inside: InteriorWatch | null = null, crewWatch: CrewWatch | null = null;
  let clock = 0, nextBeat: number | null = null, lastAlarm: number | null = null, hostile: HostileWatch | null = null;
  return {
    frame(f: DuelAudioFrame): void {
      const t = f.duel.tactical, ev = duelEventSounds(f.events, f.pan);
      const st = duelStateSounds(duelWatch, { tick: t.tick, round: f.duel.round, outcome: t.outcome, missiles: t.missiles }, f.pan);
      duelWatch = st.watch;
      const ins = interiorSounds(inside, interiorAudioView(f.duel.interior, t.tick));
      inside = ins.watch;
      // Duel polish i spec §C: a fire alarm at most once a second, the downed and revived cues, and the heartbeat. A frozen view
      // has no heartbeat.
      clock += Math.max(0, f.dt);
      const alarm = fireAlarm(lastAlarm, ins.ignited, clock), life = crewLifeSounds(crewWatch, { tick: t.tick, round: f.duel.round, downed: f.crew.downed });
      lastAlarm = alarm.last; crewWatch = life.watch;
      const beat = heartbeat(nextBeat, f.live !== false && heartbeatOn({ health: f.crew.health[f.me] ?? Infinity, downed: f.crew.downed[f.me] ?? true, running: t.outcome === OUTCOME_RUNNING, paused: f.paused }), clock);
      nextBeat = beat.next;
      const list = [...ev.sounds, ...st.sounds, ...ins.sounds, ...(alarm.play ? FIRE_ALARM : []), ...(beat.beat ? [HEARTBEAT] : [])];
      if (list.length) out.sounds(list);
      for (const cue of [...st.cues, ...life.cues]) out.play(cue);
      const ship = t.ships[CREW]!;
      // Engaged: the round is running and the enemy has turned hostile (spec section 5; owner 2026-11-17: calm first). The hum: thrust as the Helm holds it (a non-Helm online seat sees no
      // axes, so only the speed part), and the crew ship's speed. A frozen view (not live) holds no battle, hum or crackle.
      if (f.live === false) { out.status({ engaged: false, paused: f.paused, duck: ev.duck, fires: 0, hum: null }); return; }
      const [a, b] = t.ships;
      hostile = hostileWatch(hostile, { round: f.duel.round, distance: a && b && b.active ? Math.hypot(b.x - a.x, b.y - a.y) : Infinity,
        shot: f.events.some((e) => e.kind === 'laser' || e.kind === 'missileEnd'), missile: t.missiles.some((m) => m.active) });
      out.status({ engaged: t.outcome === OUTCOME_RUNNING && hostile.hostile, paused: f.paused, duck: ev.duck, fires: ins.fires,
        hum: { thrust: Number.isFinite(f.axes.thrust) ? Math.min(1, Math.abs(f.axes.thrust)) : 0, speed: Math.hypot(ship.vx, ship.vy), charge: 0 } });
    },
    /** A new round or a rebuilt scene: the next frame is a fresh baseline. */
    reset(): void { duelWatch = null; inside = null; crewWatch = null; nextBeat = null; lastAlarm = null; hostile = null; }
  };
}
export type DuelAudio = ReturnType<typeof createDuelAudio>;
