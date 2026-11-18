// Audio-i spec section 4a: the duel's sounds from its view events and tactical state.
import { describe, it, expect } from 'vitest';
import {
  CREW, FIRE_ALARM, HEARTBEAT, HEARTBEAT_BELOW, HEARTBEAT_S, IMPACT_DELAY_S, OUTCOME_CREW_WINS, OUTCOME_RUNNING, crewLifeSounds, duelEventSounds, duelStateSounds,
  fireAlarm, heartbeat, heartbeatOn, type DuelWatchView
} from '../src/renderer/src/audio/duelSounds';
import { CUE_RECIPES } from '../src/renderer/src/audio/cueRecipes';
import { HEALTH_LOW } from '../src/renderer/src/render/duel/readoutModel';
import { CREW_SLOT, Outcome } from '../src/renderer/src/sim/tactical/state';
import { HIT_FRESH_TICKS } from '../src/renderer/src/render/impactModel';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';

const pan = (x: number): number => x / 1000;
const laser = (o: Partial<Extract<ViewEvent, { kind: 'laser' }>> = {}): ViewEvent => ({ kind: 'laser', ship: 0, hit: false, stripped: false, room: -1, x1: 100, y1: 0, x2: 500, y2: 0, ...o });
const end = (o: Partial<Extract<ViewEvent, { kind: 'missileEnd' }>> = {}): ViewEvent => ({ kind: 'missileEnd', ship: 1, cause: 'ship', target: 0, room: 0, x: 300, y: 0, ...o });

describe('duel event sounds (Audio-i spec section 4a)', () => {
  it('pins the copied sim constants', () => {
    expect(OUTCOME_RUNNING).toBe(Outcome.Running); expect(OUTCOME_CREW_WINS).toBe(Outcome.CrewWins); expect(CREW).toBe(CREW_SLOT);
  });
  it('crew and enemy lasers sound different, panned at the beam start', () => {
    expect(duelEventSounds([laser()], pan)).toEqual({ sounds: [{ key: 'laserSmall', gain: 0.7, pan: 0.1 }], duck: false, combat: true });
    expect(duelEventSounds([laser({ ship: 1 })], pan).sounds[0]).toMatchObject({ key: 'laserLarge', pan: 0.1 });
  });
  it('a hit lands a moment later at the beam end; a stripped layer shimmers instead', () => {
    expect(duelEventSounds([laser({ hit: true })], pan).sounds[1]).toEqual({ key: 'impactMetal', gain: 0.8, pan: 0.5, at: IMPACT_DELAY_S });
    expect(duelEventSounds([laser({ hit: true, stripped: true })], pan).sounds.map((s) => s.key)).toEqual(['laserSmall', 'forceField']);
  });
  it('a hit on the crew ship adds the low boom and ducks the music', () => {
    const r = duelEventSounds([laser({ ship: 1, hit: true })], pan);
    expect(r.sounds.map((s) => s.key)).toEqual(['laserLarge', 'impactMetal', 'lowBoom']); expect(r.duck).toBe(true);
    expect(duelEventSounds([laser({ hit: true })], pan).duck).toBe(false);
    expect(duelEventSounds([end()], pan)).toMatchObject({ duck: true, combat: true });
  });
  it('missile ends: full on a ship, softer on rocks and missiles, nothing at the edge or on expiry', () => {
    expect(duelEventSounds([end({ target: 1 })], pan).sounds).toEqual([{ key: 'explosionCrunch', gain: 1, pan: 0.3 }]);
    for (const cause of ['planet', 'asteroid', 'missile'] as const) expect(duelEventSounds([end({ cause, target: -1 })], pan).sounds).toEqual([{ key: 'explosionCrunch', gain: 0.6, pan: 0.3 }]);
    for (const cause of ['edge', 'expired'] as const) expect(duelEventSounds([end({ cause, target: -1 })], pan)).toEqual({ sounds: [], duck: false, combat: false });
  });
  it('contacts bump, louder for the crew ship', () => {
    expect(duelEventSounds([{ kind: 'contact', ship: 0, body: 'asteroid', x: 200, y: 0 }], pan).sounds).toEqual([{ key: 'impactMetal', gain: 0.6, rate: 0.8, pan: 0.2 }]);
    expect(duelEventSounds([{ kind: 'contact', ship: 1, body: 'ship', x: 200, y: 0 }], pan).sounds[0]!.gain).toBe(0.3);
  });
});

describe('duel state sounds (Audio-i spec section 4a)', () => {
  const idle = { active: false, x: 0, y: 0 };
  const view = (o: Partial<DuelWatchView> = {}): DuelWatchView => ({ tick: 10, round: 0, outcome: OUTCOME_RUNNING, missiles: [idle, idle], ...o });
  const launched = { missiles: [{ active: true, x: 400, y: 0 }, idle] };
  it('a launch whooshes once, panned at the missile', () => {
    const a = duelStateSounds(null, view(), pan); expect(a.sounds).toEqual([]);
    const b = duelStateSounds(a.watch, view({ tick: 11, ...launched }), pan);
    expect(b.sounds).toEqual([{ key: 'thruster', gain: 0.5, dur: 0.7, pan: 0.4 }]);
    expect(duelStateSounds(b.watch, view({ tick: 12, ...launched }), pan).sounds).toEqual([]);
  });
  it('the round ending plays victory or defeat once', () => {
    const a = duelStateSounds(null, view(), pan).watch;
    expect(duelStateSounds(a, view({ tick: 11, outcome: Outcome.CrewWins }), pan).cues).toEqual(['victory']);
    expect(duelStateSounds(a, view({ tick: 11, outcome: Outcome.EnemyWins }), pan).cues).toEqual(['defeat']);
    expect(duelStateSounds(a, view({ tick: 11, outcome: Outcome.Draw }), pan).cues).toEqual(['defeat']);
    const won = duelStateSounds(a, view({ tick: 11, outcome: Outcome.CrewWins }), pan).watch;
    expect(duelStateSounds(won, view({ tick: 12, outcome: Outcome.CrewWins }), pan).cues).toEqual([]);
  });
  it('re-baselines silently on a new round, a tick backwards or a stale jump', () => {
    const a = duelStateSounds(null, view(), pan).watch;
    for (const o of [{ round: 1 }, { tick: 9 }, { tick: 10 + HIT_FRESH_TICKS + 1 }]) {
      const r = duelStateSounds(a, view({ ...o, ...launched, outcome: Outcome.CrewWins }), pan);
      expect([r.sounds, r.cues]).toEqual([[], []]);
    }
    expect(duelStateSounds(a, view({ tick: 10 + HIT_FRESH_TICKS, ...launched }), pan).sounds).toHaveLength(1);
  });
});

describe('sound cues for trouble (duel polish i spec §C)', () => {
  it('pins the heartbeat threshold to HEALTH_LOW and the cue shapes', () => {
    expect(HEARTBEAT_BELOW).toBe(HEALTH_LOW);
    expect(HEARTBEAT).toEqual({ key: 'lowBoom', gain: 0.35, pan: 0, filter: { type: 'lowpass', from: 400 } });
    expect(FIRE_ALARM.map((r) => [r.key, r.gain])).toEqual([['alarm', 0.5], ['alarm', 0.5]]);
    expect(FIRE_ALARM.map((r) => r.variant)).toEqual(CUE_RECIPES.alarm!.map((r) => r.variant));
  });
  it('the fire alarm plays when a room catches fire, at most once a second', () => {
    let a = fireAlarm(null, 0, 0); expect(a.play).toBe(false);
    a = fireAlarm(a.last, 1, 0.5); expect(a).toEqual({ last: 0.5, play: true });
    a = fireAlarm(a.last, 2, 1.4); expect(a).toEqual({ last: 0.5, play: false });
    a = fireAlarm(a.last, 1, 1.5); expect(a).toEqual({ last: 1.5, play: true });
  });
  it('a character going down plays alarm, a revive plays ready; nothing on a re-baseline', () => {
    const v = (tick: number, downed: boolean[], round = 0) => ({ tick, round, downed });
    let r = crewLifeSounds(null, v(5, [false, false])); expect(r.cues).toEqual([]);
    r = crewLifeSounds(r.watch, v(6, [false, true])); expect(r.cues).toEqual(['alarm']);
    r = crewLifeSounds(r.watch, v(7, [false, true])); expect(r.cues).toEqual([]);
    r = crewLifeSounds(r.watch, v(8, [false, false])); expect(r.cues).toEqual(['ready']);
    const w = r.watch;
    for (const o of [v(7, [true, true]), v(8 + HIT_FRESH_TICKS + 1, [true, true]), v(9, [true, true], 1)]) expect(crewLifeSounds(w, o).cues).toEqual([]);
  });
  it('the heartbeat beats at once below 30, then every 0.8 s, and stops at 30, downed or paused', () => {
    const on = { health: 29.5, downed: false, running: true, paused: false };
    expect(heartbeatOn(on)).toBe(true);
    for (const off of [{ health: 30 }, { downed: true }, { paused: true }, { running: false }]) expect(heartbeatOn({ ...on, ...off })).toBe(false);
    let b = heartbeat(null, true, 1); expect(b).toEqual({ next: 1 + HEARTBEAT_S, beat: true });
    b = heartbeat(b.next, true, 1.5); expect(b.beat).toBe(false);
    b = heartbeat(b.next, true, 1.8); expect(b).toEqual({ next: 1.8 + HEARTBEAT_S, beat: true });
    b = heartbeat(b.next, false, 1.9); expect(b).toEqual({ next: null, beat: false });
    expect(heartbeat(b.next, true, 2).beat).toBe(true);   // back on: at once
  });
});
