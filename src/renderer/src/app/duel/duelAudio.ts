// Audio-i spec sections 4-5: the duel's audio adapter, fed once per frame by the scene (Single player and the online duel
// alike): the event and state sounds, the round-end cue, and the music and loop report.
import type { AudioOut } from '../audio';
import type { DuelState } from '../../sim/duel/state';
import type { Axes } from '../../sim/tactical/state';
import type { ViewEvent } from '../../render/tactical/fxModel';
import { CREW, OUTCOME_RUNNING, duelEventSounds, duelStateSounds, type DuelWatch, type Pan } from '../../audio/duelSounds';
import { interiorAudioView, interiorSounds, type InteriorWatch } from '../../audio/interiorSounds';

/** `live`: false while the view is a frozen copy (a lost online link); absent means live. */
export interface DuelAudioFrame { duel: DuelState; events: readonly ViewEvent[]; axes: Axes; paused: boolean; pan: Pan; live?: boolean }

export function createDuelAudio(out: AudioOut) {
  let duelWatch: DuelWatch | null = null, inside: InteriorWatch | null = null;
  return {
    frame(f: DuelAudioFrame): void {
      const t = f.duel.tactical, ev = duelEventSounds(f.events, f.pan);
      const st = duelStateSounds(duelWatch, { tick: t.tick, round: f.duel.round, outcome: t.outcome, missiles: t.missiles }, f.pan);
      duelWatch = st.watch;
      const ins = interiorSounds(inside, interiorAudioView(f.duel.interior, t.tick));
      inside = ins.watch;
      const list = [...ev.sounds, ...st.sounds, ...ins.sounds];
      if (list.length) out.sounds(list);
      for (const cue of st.cues) out.play(cue);
      const ship = t.ships[CREW]!;
      // Engaged: the round is running (spec section 5). The hum: thrust as the Helm holds it (a non-Helm online seat sees no
      // axes, so only the speed part), and the crew ship's speed. A frozen view (not live) holds no battle, hum or crackle.
      if (f.live === false) { out.status({ engaged: false, paused: f.paused, duck: ev.duck, fires: 0, hum: null }); return; }
      out.status({ engaged: t.outcome === OUTCOME_RUNNING, paused: f.paused, duck: ev.duck, fires: ins.fires,
        hum: { thrust: Math.abs(f.axes.thrust) > 0 ? 1 : 0, speed: Math.hypot(ship.vx, ship.vy), charge: 0 } });
    },
    /** A new round or a rebuilt scene: the next frame is a fresh baseline. */
    reset(): void { duelWatch = null; inside = null; }
  };
}
export type DuelAudio = ReturnType<typeof createDuelAudio>;
