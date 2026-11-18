// Spike ii §7 item 8: the rock sounds: a crack on a laser hit, a crunch on a break, a deep boom on a blast, a soft knock
// on a damaging rock-rock contact, at most six a second, the boom first.
import { describe, expect, it } from 'vitest';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { ROCK_BOOM, ROCK_CRACK, ROCK_CRUNCH, ROCK_KNOCK, ROCK_SOUNDS_PER_S, rockSounds } from '../src/renderer/src/audio/rockSounds';

const pan = () => 0.1;
const ev = (what: 'hit' | 'split' | 'dust' | 'blast' | 'bump', by: 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet', rock = 1): ViewEvent =>
  ({ kind: 'rock', what, by, rock, x: 0, y: 0, r: 30, vx: 0, vy: 0 });

describe('rock sounds (spec §7 item 8)', () => {
  it('maps each event to its sound, the boom, then crunches, cracks and knocks', () => {
    const r = rockSounds(null, [ev('bump', 'collision'), ev('hit', 'laser'), ev('split', 'laser'), ev('blast', 'torpedo'), ev('bump', 'ram'), ev('dust', 'planet'), ev('hit', 'torpedo')], pan, 0);
    expect(r.sounds).toEqual([{ ...ROCK_BOOM, pan: 0.1 }, { ...ROCK_CRUNCH, pan: 0.1 }, { ...ROCK_CRACK, pan: 0.1 }, { ...ROCK_KNOCK, pan: 0.1 }]);
  });
  it('plays at most six a second', () => {
    expect(ROCK_SOUNDS_PER_S).toBe(6);
    let r = rockSounds(null, Array.from({ length: 10 }, (_, k) => ev('blast', 'torpedo', k)), pan, 0);
    expect(r.sounds).toHaveLength(6);
    r = rockSounds(r.watch, [ev('blast', 'torpedo')], pan, 0.5);
    expect(r.sounds).toHaveLength(0);
    r = rockSounds(r.watch, [ev('blast', 'torpedo')], pan, 1.01);
    expect(r.sounds).toHaveLength(1);
  });
  it('a dust event with rock -1 or evicted is not a break: no crunch; an ordinary break dust still crunches', () => {
    const lost: ViewEvent = { ...ev('dust', 'laser'), rock: -1 } as ViewEvent;
    const evicted: ViewEvent = { ...ev('dust', 'laser'), evicted: true } as ViewEvent;
    expect(rockSounds(null, [lost, evicted], pan, 0).sounds).toEqual([]);
    expect(rockSounds(null, [ev('dust', 'laser')], pan, 0).sounds).toEqual([{ ...ROCK_CRUNCH, pan: 0.1 }]);
  });
});
