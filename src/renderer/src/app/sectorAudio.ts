// Audio-i spec sections 4c-4d and 5: the sector's audio adapter, fed once per drawn frame by the online sector session:
// the interior sounds (doors, consoles, fire) and the music and loop report. The cues themselves still play through
// playCue (now as samples, the jump as its layered recipe).
import type { SimState } from '../sim/state';
import type { Cue } from '../events/audioCues';
import type { AudioOut } from './audio';
import { interiorAudioView, interiorSounds, type InteriorWatch } from '../audio/interiorSounds';
import { chargeSwell, sectorEngaged } from '../audio/sectorSounds';

/** `live`: false while the session draws its frozen copy (the connection is lost); absent means live. */
export interface SectorAudio { frame(state: SimState, paused: boolean, cues: ReadonlySet<Cue>, live?: boolean): void; reset(): void }

export function createSectorAudio(out: AudioOut): SectorAudio {
  let inside: InteriorWatch | null = null;
  return {
    frame(state, paused, cues, live = true) {
      const r = interiorSounds(inside, interiorAudioView(state));
      inside = r.watch;
      if (r.sounds.length) out.sounds(r.sounds);
      // The impact cue ducks the music itself (DUCK_CUES), so the report carries no duck. The sector has no thrust: the hum
      // idles and swells while the drive charges.
      // A frozen copy (the connection lost) holds no battle, hum or crackle.
      if (!live) { out.status({ engaged: false, paused, duck: false, fires: 0, hum: null }); return; }
      out.status({ engaged: sectorEngaged(state, cues), paused, duck: false, fires: r.fires, hum: { thrust: 0, speed: 0, charge: chargeSwell(state.run.jumpCharge) } });
    },
    reset() { inside = null; }
  };
}
