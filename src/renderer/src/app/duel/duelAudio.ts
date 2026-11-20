// Audio-i spec sections 4-5: the duel's audio adapter, fed once per frame by the scene (Single player and the online duel
// alike): the event and state sounds, the round-end cue, and the music and loop report; duel polish i spec §C: the fire
// alarm, the downed and revived cues and the local character's heartbeat.
import type { AudioOut } from '../audio';
import type { DuelState } from '../../sim/duel/state';
import type { Axes } from '../../sim/tactical/state';
import type { ViewEvent } from '../../render/tactical/fxModel';
import {
  CREW, FIRE_ALARM, HEARTBEAT, OUTCOME_CREW_WINS, OUTCOME_RUNNING, PING_TONE, RCS_HISS, crewLifeSounds, duelEventSounds, duelMood, duelStateSounds, fireAlarm, heartbeat, heartbeatOn, lockTone, rcsHiss,
  type CrewLife, type CrewWatch, type DuelWatch, type LockWatch, type Pan, type TorpedoTone
} from '../../audio/duelSounds';
export type { TorpedoTone } from '../../audio/duelSounds';
import { interiorAudioView, interiorSounds, type InteriorWatch } from '../../audio/interiorSounds';
import { rockSounds, type RockSoundWatch } from '../../audio/rockSounds';

/** `live`: false while the view is a frozen copy (a lost online link); absent means live. `me`: the local player's index
 *  (the active character in Single player, this seat online), `crew`: each character's health and downed state, `dt`: this
 *  frame's wall seconds (the heartbeat's and the fire alarm's clock; duel polish i spec §C). */
export interface DuelAudioFrame {
  duel: DuelState; events: readonly ViewEvent[]; axes: Axes; paused: boolean; pan: Pan; live?: boolean;
  me: number; crew: CrewLife; dt: number;
  /** The enemy is hostile (Sci-1 spec §4.1, the Hunter-grace rule): the combat track waits until it is; absent means
   *  hostile. The scene reads it from the sim (`hostileAt >= 0`), since audio imports nothing from sim at runtime. */
  hostile?: boolean;
  /** Feel-ii §2.5: the torpedo lock tone's data (the scene's torpedoTone); absent: no tone. §2.7: the pings that appeared
   *  this frame (one soft ping tone for any). */
  torpedo?: TorpedoTone; pings?: number;
  /** Playtest2feedback §6: the crew ship's vent this frame (the hiss); absent: none. */
  vent?: { x: number; y: number };
}

export function createDuelAudio(out: AudioOut) {
  let duelWatch: DuelWatch | null = null, inside: InteriorWatch | null = null, crewWatch: CrewWatch | null = null;
  let clock = 0, nextBeat: number | null = null, lastAlarm: number | null = null, lock: LockWatch | null = null, crewFlying = false;
  let rockWatch: RockSoundWatch | null = null, nextHiss: number | null = null;
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
      // Feel-ii §2.5: the lock tone (silent on a frozen or paused view); the crew torpedo's launch is a missile going active.
      const flying = t.missiles.some((m) => m.active && m.owner === CREW), launched = flying && !crewFlying;
      crewFlying = flying;
      // A frozen frame keeps the watch (the steady tone already played stays played on resume).
      const tone = f.torpedo && f.live !== false && !f.paused ? lockTone(lock, f.torpedo, launched, clock) : { watch: lock, sounds: [] };
      lock = tone.watch;
      const rocks = rockSounds(rockWatch, f.events, f.pan, clock); rockWatch = rocks.watch;   // spike ii §7 item 8
      const v = f.vent, hiss = rcsHiss(nextHiss, f.live !== false && !f.paused && !!v && (v.x !== 0 || v.y !== 0), clock);   // playtest2feedback §6; helm round 2 §3.2: no turn-boost hiss
      nextHiss = hiss.next;
      const list = [...ev.sounds, ...st.sounds, ...ins.sounds, ...(alarm.play ? FIRE_ALARM : []), ...(beat.beat ? [HEARTBEAT] : []), ...tone.sounds, ...((f.pings ?? 0) > 0 ? [PING_TONE] : []), ...rocks.sounds, ...(hiss.play ? [RCS_HISS] : [])];
      if (list.length) out.sounds(list);
      for (const cue of [...st.cues, ...life.cues]) out.play(cue);
      const ship = t.ships[CREW]!;
      // The mood (music spike; duelMood): combat once the Hunter is hostile (hunter grace spec: none through the grace). The hum: thrust as the Helm holds it (a non-Helm online seat sees no
      // axes, so only the speed part), and the crew ship's speed. A frozen view (not live) holds no combat track, hum or crackle.
      if (f.live === false) { out.status({ mood: 'calm', paused: f.paused, duck: ev.duck, fires: 0, hum: null }); return; }
      const mood = duelMood({ running: t.outcome === OUTCOME_RUNNING, won: t.outcome === OUTCOME_CREW_WINS, hostile: f.hostile !== false, scanning: t.scan.contact >= 0, known: t.known.some((k) => k >= 1), fires: ins.fires });
      out.status({ mood, paused: f.paused, duck: ev.duck, fires: ins.fires,
        hum: { thrust: Number.isFinite(f.axes.thrust) ? Math.min(1, Math.abs(f.axes.thrust)) : 0, speed: Math.hypot(ship.vx, ship.vy), charge: 0 } });
    },
    /** A new round or a rebuilt scene: the next frame is a fresh baseline. */
    reset(): void { duelWatch = null; inside = null; crewWatch = null; nextBeat = null; lastAlarm = null; lock = null; crewFlying = false; rockWatch = null; nextHiss = null; }
  };
}
export type DuelAudio = ReturnType<typeof createDuelAudio>;
