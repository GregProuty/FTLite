import { describe, it, expect } from 'vitest';
import { downCrew } from '../src/renderer/src/sim/crew';
import { loadProgress, saveProgress, PROGRESS_KEY } from '../src/renderer/src/app/progressStore';
import { runScore } from '../src/renderer/src/sim/score';
import { EMPTY_PROGRESS, UNLOCKS, applyRun, veteranRepairXp, applyStartBonuses, type Progress } from '../src/renderer/src/sim/progress';
import { QUIRKS, QUIRK_NAMES, quirkPassageMult, quirkHeatRise, quirkDoorDelayMult, quirkDebrisHullOffset, quirkLeadOffset, quirkChargeMult } from '../src/renderer/src/sim/quirks';
import { deriveStreams } from '../src/renderer/src/sim/state';
import { telemetryRecord, type TelemetryRecord } from '../src/renderer/src/sim/telemetry';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { oxygenStep, passageFor } from '../src/renderer/src/sim/hazards/oxygen';
import { heatStep } from '../src/renderer/src/sim/heat';
import { scienceLead } from '../src/renderer/src/sim/debris';
import { DoorState } from '../src/renderer/src/sim/grid';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Skill } from '../src/renderer/src/sim/skillIds';
import { skillLevelOf } from '../src/renderer/src/sim/skills';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { nextInt } from '../src/shared/rng';
import { TICK_HZ, DT, FIRE_SPREAD_P, HULL_MAX, HEAT_RISE, DOOR_CLOSE_DELAY, PASSAGE_CLOSED, DEBRIS_HULL_DAMAGE, ENEMY_SHOT_HULL_DAMAGE, SCIENCE_LEAD_UNMANNED, JUMP_CHARGE_TIME, QUIRK_COUNT, TORP_START, TORP_CAP, SKILL_MAX, XP_THRESHOLDS, UNLOCK_SCRAP, REACTOR_CAPACITY } from '../src/renderer/src/sim/tuning';
import { makeState, quirkState, run, quiet, intents, teleport, placeDebris, placeShot, room, overdrive, seatNavigator } from './helpers/sim';
import { sitDown } from '../src/renderer/src/sim/stations';
import { RECRUITS } from './helpers/sim';

const rec = (over: Partial<TelemetryRecord> = {}): Omit<TelemetryRecord, 'score'> => ({
  version: 1, simVersion: 15, seed: 1, playerCount: 2, characters: ['Recruit', 'Recruit'], endReason: 'running', durationSeconds: 0,
  firstDown: null, firstDeath: null, stationsNeverManned: [], mannedSeconds: {}, longestIdleSeconds: [0, 0],
  spawns: { fire: 0, breach: 0, power: 0, debris: 0 }, impacts: 0, evadeRolls: 0, evasions: 0, shots: 0, hits: 0,
  repairs: { fire: 0, breach: 0, power: 0 }, maxStress: 0, phaseEntries: { buildUp: 0, sustainPeak: 0, peakFade: 0, relax: 0 }, enemy: { met: 0, destroyed: 0, disables: 0, fled: 0, surrenders: 0, shieldHits: 0 }, boarders: { parties: 0, killed: 0, vented: 0 },
  run: { nodesReached: 0, jumps: 0, columns: 8, scrap: { earned: 0, spent: 0 }, events: 0, purchases: 0, upgrades: {}, reactorBonus: 0, quirk: 'Leaky Seals', unlocks: [] }, teamwork: { lockedShots: 0, teamSeconds: 0, revives: 0, timedEvades: 0, votesUnanimous: 0, votesSplit: 0 }, skills: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], ...over
});
const runOver = (o: Partial<TelemetryRecord['run']>) => ({ ...rec().run, ...o });

describe('score', () => {
  it('weights nodes, victory, scrap and kills; zero for a fresh record; the record carries it', () => {
    expect(runScore(rec({ endReason: 'victory', run: runOver({ nodesReached: 7, scrap: { earned: 145, spent: 30 } }) }))).toBe(1345);
    expect(runScore(rec({ endReason: 'hull', run: runOver({ nodesReached: 3, scrap: { earned: 45, spent: 0 } }), boarders: { parties: 1, killed: 2, vented: 0 } }))).toBe(355);
    expect(runScore(rec())).toBe(0);
    const s = makeState(2); s.run.nodesReached = 2; s.telemetry.scrapEarned = 30; s.telemetry.boardersKilled = 1;
    const r = telemetryRecord(s, 1); expect(r.score).toBe(235); expect(r.score).toBe(runScore(r));
  });
});

describe('progress', () => {
  const clone = (p: Progress) => JSON.parse(JSON.stringify(p)) as Progress;
  it('counts runs, victories and bests and unlocks in UNLOCKS order without mutating its input', () => {
    expect(Object.isFrozen(EMPTY_PROGRESS) && Object.isFrozen(EMPTY_PROGRESS.unlocked)).toBe(true); const p0 = EMPTY_PROGRESS; const copy = clone(p0);
    const p1 = applyRun(p0, { ...rec({ endReason: 'hull', run: runOver({ nodesReached: 2, scrap: { earned: 30, spent: 0 } }) }), score: 230 });
    expect(p1).toEqual({ version: 1, runs: 1, victories: 0, bestScore: 230, bestNodes: 2, unlocked: ['scrap-reserve'] }); expect(p0).toEqual(copy);
    const p2 = applyRun(p1, { ...rec({ endReason: 'crew', run: runOver({ nodesReached: 5 }) }), score: 500 });
    expect([p2.runs, p2.bestNodes, p2.unlocked]).toEqual([2, 5, ['scrap-reserve', 'torpedo-rack']]);
    const p3 = applyRun(p2, { ...rec({ endReason: 'victory', run: runOver({ nodesReached: 7 }) }), score: 1200 });
    expect([p3.victories, p3.bestScore, p3.unlocked]).toEqual([1, 1200, ['scrap-reserve', 'torpedo-rack', 'veteran-crew']]);
    const direct = applyRun(EMPTY_PROGRESS, { ...rec({ endReason: 'victory', run: runOver({ nodesReached: 7 }) }), score: 1200 });
    expect(direct.unlocked).toEqual(['scrap-reserve', 'torpedo-rack', 'veteran-crew']);
    const p4 = applyRun(p3, { ...rec({ endReason: 'hull', run: runOver({ nodesReached: 1 }) }), score: 100 });
    expect([p4.bestScore, p4.bestNodes, p4.unlocked.length, p4.runs]).toEqual([1200, 7, 3, 4]);
    expect(UNLOCKS.map((u) => u.id)).toEqual(['scrap-reserve', 'torpedo-rack', 'veteran-crew']);
  });
  it('veteranRepairXp caps at SKILL_MAX', () => { expect(veteranRepairXp(0)).toBe(XP_THRESHOLDS[1]); expect(veteranRepairXp(3)).toBe(XP_THRESHOLDS[4]); expect(veteranRepairXp(SKILL_MAX)).toBe(XP_THRESHOLDS[SKILL_MAX]); });
});

describe('start bonuses', () => {
  it('torpedo-rack caps at TORP_CAP when the stock is already near it (applied directly)', () => {
    const s = makeState(2, 1, RECRUITS); s.weapons.torpedoStock = TORP_CAP - 1; applyStartBonuses(s, ['torpedo-rack']); expect([s.weapons.torpedoStock, s.run.startBonus]).toEqual([TORP_CAP, 0b010]);
  });
  it('apply all three, ignore unknown ids, cap torpedoes', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS, { unlocked: ['scrap-reserve', 'torpedo-rack', 'veteran-crew'] });
    expect([s.run.scrap, s.telemetry.scrapEarned, s.weapons.torpedoStock, s.run.startBonus]).toEqual([UNLOCK_SCRAP, UNLOCK_SCRAP, TORP_START + 2, 0b111]);
    expect(skillLevelOf(s, 0, Skill.Repair)).toBe(4); expect(skillLevelOf(s, 1, Skill.Repair)).toBe(1);   // Okoro 3 -> 4, Lindqvist 0 -> 1
    const plain = makeState(2, 1, DEFAULT_CHARACTERS), bogus = makeState(2, 1, DEFAULT_CHARACTERS, { unlocked: ['bogus'] });
    expect(bogus.run.startBonus).toBe(0); expect(hashState(bogus)).toBe(hashState(plain));
    const t = makeState(2, 1, RECRUITS, { unlocked: ['torpedo-rack'] }); expect(t.weapons.torpedoStock).toBe(Math.min(TORP_CAP, TORP_START + 2)); expect(t.run.startBonus).toBe(0b010);
    expect(telemetryRecord(s, 1).run.unlocks).toEqual(['scrap-reserve', 'torpedo-rack', 'veteran-crew']); expect(telemetryRecord(t, 1).run.unlocks).toEqual(['torpedo-rack']);
    expect([Array.from(s.run.upgrades), s.run.reactorBonus, s.power.capacity]).toEqual([[0, 0, 0, 0, 0, 0, 0], 0, REACTOR_CAPACITY]);   // no unlock grants a level or a reactor bar (spec Loop-ii section 4: none to convert)
  });
});

describe('quirk', () => {
  it('one draw from the seventh stream, the other streams unchanged, the override keeps the draw, names line up', () => {
    const ref = deriveStreams(7); const expected = nextInt(ref.quirk, QUIRK_COUNT);
    const s = makeState(2, 7); expect(s.run.quirk).toBe(expected); expect(s.rng.quirk.s).toBe(ref.quirk.s);
    const one = deriveStreams(1); expect([one.hazards.s, one.director.s, one.combat.s]).toEqual([2693262067, 11749833, 2265367787]);
    expect(makeState(2, 1).rng.map.s).toBe(1263695249);   // the six-column sector map's draws (spec Loop-i section 1; was 3031319865 for the eight-column map, 2463425392 before column 1 drew no type and the hidden ambushers and caches were drawn, spec Demo-x-b sections 2 and 3)
    expect(() => makeState(2, 7, RECRUITS, { quirk: 6 })).toThrow('quirk out of range: 6'); expect(() => makeState(2, 7, RECRUITS, { quirk: -1 })).toThrow(); expect(() => makeState(2, 7, RECRUITS, { quirk: 1.5 })).toThrow();
    const o = makeState(2, 7, RECRUITS, { quirk: 5 }); expect(o.run.quirk).toBe(5); expect(o.rng.quirk.s).toBe(ref.quirk.s);
    expect(QUIRKS).toHaveLength(QUIRK_COUNT); expect(QUIRK_NAMES).toEqual(['Leaky Seals', 'Hot Reactor', 'Sticky Doors', 'Lucky Hull', 'Twitchy Sensors', 'Old Drive']);
    expect(telemetryRecord(o, 1).run.quirk).toBe('Old Drive');
    const hooks = [quirkPassageMult, quirkHeatRise, quirkDoorDelayMult, quirkDebrisHullOffset, quirkLeadOffset, quirkChargeMult], values = [2, 1, 2, -2, 4, 1.25], neutral = [1, 0, 1, 0, 0, 1];
    for (let k = 0; k < QUIRK_COUNT; k++) for (let h = 0; h < 6; h++) expect(hooks[h]!(quirkState(k))).toBe(h === k ? values[h] : neutral[h]);
  });
  it('0 Leaky Seals: a closed door passes twice the oxygen', () => {
    const flow = (k: number) => { const s = quirkState(k); const A = room(s, 'A'), I = room(s, 'I'); s.rooms.o2.fill(0); s.rooms.o2[A] = s.derived.volume[A]!; s.doors.state[0] = DoorState.Closed; expect(passageFor(s, 0)).toBe(PASSAGE_CLOSED); oxygenStep(s, new Float64Array(s.rooms.o2.length)); return s.rooms.o2[I]!; };
    const quirky = flow(0), control = flow(5); expect(control).toBeGreaterThan(0); expect(quirky).toBeCloseTo(2 * control, 9);
    const spread = (k: number) => { const s = quirkState(k); s.doors.state[0] = DoorState.Closed; return FIRE_SPREAD_P * passageFor(s, 0); }; expect(spread(0)).toBe(spread(5));   // fire spread is unchanged
  });
  it('1 Hot Reactor: one more heat per hazard tick while overdriven', () => {
    const heat = (k: number) => { const s = quirkState(k); const i = overdrive(s, StationKind.Weapons); heatStep(s); return s.stations.heat[i]!; };
    expect(heat(1)).toBe(HEAT_RISE + 1); expect(heat(0)).toBe(HEAT_RISE);
  });
  it('2 Sticky Doors: a door stays open twice as long after the zone clears', () => {
    const closeTicks = (k: number) => { const s = quirkState(k); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; const t = s.derived.edgeTile[0]!, w = s.derived.width, tx = t % w, ty = (t - tx) / w; teleport(s, 0, tx + 0.5, ty + 0.5); run(s, 1); expect(s.doors.state[0]).toBe(DoorState.Open); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5); let n = 0; while (s.doors.state[0] !== DoorState.Closed && n < 1000) { run(s, 1); n++; } return n; };
    const quirky = closeTicks(2), control = closeTicks(0); expect(control).toBe(Math.round(DOOR_CLOSE_DELAY * TICK_HZ)); expect(quirky).toBe(Math.round(2 * DOOR_CLOSE_DELAY * TICK_HZ) + 1);   // 2 - 120 x DT leaves a float residual above 0, so the doubled timer needs a 121st tick (the plan's 120 ignored the accumulation)
  });
  it('3 Lucky Hull: debris costs 6 hull, shots are unchanged', () => {
    // impactTick = 1 resolves in the step that runs at tick 1, the second step (the plan's run(s, 1) stopped one short)
    const hit = (k: number, shot: boolean) => { const s = quirkState(k); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; const A = room(s, 'A'); if (shot) placeShot(s, A, 1); else placeDebris(s, A, 1); run(s, 2); return HULL_MAX - s.hull;  };
    expect(hit(3, false)).toBe(DEBRIS_HULL_DAMAGE - 2); expect(hit(5, false)).toBe(DEBRIS_HULL_DAMAGE); expect(hit(3, true)).toBe(ENEMY_SHOT_HULL_DAMAGE); expect(hit(5, true)).toBe(ENEMY_SHOT_HULL_DAMAGE);
  });
  it('4 Twitchy Sensors: the lead is 4 s longer manned or not', () => {
    const lead = (k: number, seated: boolean) => { const s = quirkState(k); if (seated) sitDown(s, 0, s.derived.stationOfKind[StationKind.Science]!); return scienceLead(s); };
    expect(lead(4, false)).toBe(SCIENCE_LEAD_UNMANNED + 4); expect(lead(0, false)).toBe(SCIENCE_LEAD_UNMANNED); expect(lead(4, true)).toBeCloseTo(22); expect(lead(0, true)).toBeCloseTo(18);
  });
  it('5 Old Drive: the charge takes 75 s; the ready tick is 4500', () => {
    const q = quirkState(5); quiet(q); q.enemy.nextArrivalTick = 1e9; q.boarders.nextArrivalTick = 1e9; q.run.jumpCharge = 0; run(q, 1); expect(q.run.jumpCharge).toBeCloseTo(DT / (JUMP_CHARGE_TIME * 1.25), 12);   // P1: the calm start beacon begins with a full drive
    const c = quirkState(0); quiet(c); c.enemy.nextArrivalTick = 1e9; c.boarders.nextArrivalTick = 1e9; c.run.jumpCharge = 0; run(c, 1); expect(c.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
    const ready = (k: number) => { const s = quirkState(k); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; s.run.jumpCharge = 0; seatNavigator(s, 0); downCrew(s, 1); run(s, 1); let n = 1; while (s.telemetry.jumps === 0 && n < 6000) { run(s, 1, () => intents({ confirmPressed: true }, {})); n++; } return s.tick; };
    expect(ready(5)).toBe(4500); expect(ready(0)).toBe(3600);
  });
  it('snapshot: quirk and startBonus round trip and hash; the header carries the quirk stream', () => {
    const s = makeState(2, 5, DEFAULT_CHARACTERS, { unlocked: ['scrap-reserve'] }); s.run.quirk = 4;
    const snap = saveSnapshot(s); expect(snap.header.rngStates['quirk']).toBe(s.rng.quirk.s);
    const base = hashState(makeState(2, 5)); const m1 = makeState(2, 5); m1.run.quirk = (m1.run.quirk + 1) % QUIRK_COUNT; const m2 = makeState(2, 5); m2.run.startBonus = 1;
    expect(hashState(m1)).not.toBe(base); expect(hashState(m2)).not.toBe(base);
  });
});

describe('progress store', () => {
  const mem = (init: Record<string, string> = {}, throwOn: 'get' | 'set' | null = null) => { const m = new Map(Object.entries(init)); return { getItem: (k: string) => { if (throwOn === 'get') throw new Error('denied'); return m.get(k) ?? null; }, setItem: (k: string, v: string) => { if (throwOn === 'set') throw new Error('full'); m.set(k, v); }, map: m }; };
  it('round-trips, defaults and sanitizes', () => {
    const p: Progress = { version: 1, runs: 4, victories: 1, bestScore: 900, bestNodes: 6, unlocked: ['scrap-reserve', 'torpedo-rack', 'veteran-crew'] };
    const st = mem(); saveProgress(st, p); expect(JSON.parse(st.map.get(PROGRESS_KEY)!)).toEqual(p); expect(loadProgress(st)).toEqual(p);
    expect(loadProgress(mem())).toEqual(EMPTY_PROGRESS);
    for (const raw of ['{', '[]', JSON.stringify({ version: 2, runs: 3 })]) expect(loadProgress(mem({ [PROGRESS_KEY]: raw }))).toEqual(EMPTY_PROGRESS);
    expect(loadProgress(mem({ [PROGRESS_KEY]: JSON.stringify({ version: 1, runs: '3', victories: -1, bestScore: 12.5, bestNodes: NaN, unlocked: ['torpedo-rack', 'bogus', 'scrap-reserve', 'torpedo-rack'] }) }))).toEqual({ version: 1, runs: 0, victories: 0, bestScore: 12.5, bestNodes: 0, unlocked: ['scrap-reserve', 'torpedo-rack'] });
    expect(loadProgress(mem({ [PROGRESS_KEY]: JSON.stringify({ version: 1, unlocked: 'x' }) })).unlocked).toEqual([]);
    expect(loadProgress(mem({}, 'get'))).toEqual(EMPTY_PROGRESS);
    expect(() => saveProgress(mem({}, 'set'), p)).not.toThrow();
  });
});
