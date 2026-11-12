import { describe, it, expect } from 'vitest';
import { audioCues, cueCounters, type CueCounters } from '../src/renderer/src/app/audioCues';
import { createAudio } from '../src/renderer/src/app/audio';
import { EndReason } from '../src/renderer/src/sim/crew';
import { makeState } from './helpers/sim';

const Z: CueCounters = { spawns: 0, boardings: 0, encounters: 0, impacts: 0, shots: 0, hits: 0, shieldHits: 0, jumps: 0, ended: 0, endReason: 0, jumpReady: 0 };
const at = (over: Partial<CueCounters>): CueCounters => ({ ...Z, ...over });

describe('audioCues (spec Demo-ii section 5)', () => {
  it('alarm sources', () => {
    expect(audioCues(Z, at({ spawns: 1 }))).toEqual(['alarm']);
    expect(audioCues(Z, at({ boardings: 1 }))).toEqual(['alarm']);
    expect(audioCues(Z, at({ encounters: 1 }))).toEqual(['alarm']);
  });
  it('single edges', () => {
    expect(audioCues(Z, at({ impacts: 1 }))).toEqual(['impact']);
    expect(audioCues(Z, at({ shots: 1 }))).toEqual(['shot']);
    expect(audioCues(Z, at({ hits: 1 }))).toEqual(['hit']);
    expect(audioCues(Z, at({ shieldHits: 1 }))).toEqual(['hit']);
    expect(audioCues(Z, at({ jumpReady: 1 }))).toEqual(['ready']);
    expect(audioCues(at({ jumpReady: 1 }), at({ jumpReady: 1 }))).toEqual([]);
    expect(audioCues(Z, at({ jumps: 1 }))).toEqual(['jump']);
  });
  it('terminal cues fire once', () => {
    expect(audioCues(Z, at({ ended: 1, endReason: EndReason.Victory }))).toEqual(['victory']);
    expect(audioCues(Z, at({ ended: 1, endReason: EndReason.Hull }))).toEqual(['defeat']);
    expect(audioCues(at({ ended: 1, endReason: EndReason.Hull }), at({ ended: 1, endReason: EndReason.Hull }))).toEqual([]);
    expect(audioCues(Z, Z)).toEqual([]);
  });
  it('the full set in order', () => {
    expect(audioCues(Z, at({ spawns: 2, boardings: 1, impacts: 1, shots: 3, hits: 1, jumpReady: 1, jumps: 1, ended: 1, endReason: EndReason.Victory }))).toEqual(['alarm', 'impact', 'shot', 'hit', 'ready', 'jump', 'victory']);
  });
  it('cueCounters reads the state', () => {
    const s = makeState(2, 1); s.telemetry.spawns.set([2, 1, 0, 3]); s.run.jumpCharge = 1;
    expect(cueCounters(s)).toMatchObject({ spawns: 6, jumpReady: 1, ended: 0 });
  });
  it('createAudio without an AudioContext returns callable no-ops', () => {
    const a = createAudio(); expect(() => { a.play('alarm'); a.unlock(); }).not.toThrow();
  });
});
