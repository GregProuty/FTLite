import { describe, it, expect } from 'vitest';
import { nextFloat, nextInt } from '../src/shared/rng';
import { EVENT_DEFS, EVENTS, applyEffect, applyOutcome, reqMet, choiceEnabled, choiceLabel, eventScale, fillLabel, blueTag, resolveEvent } from '../src/renderer/src/sim/events';
import type { Effect } from '../src/renderer/src/sim/eventDefs';
import type { SimState } from '../src/renderer/src/sim/state';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { downCrew } from '../src/renderer/src/sim/crew';
import { freeSites } from '../src/renderer/src/sim/hazards/breach';
import { Encounter } from '../src/renderer/src/sim/enemy';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Skill, xpIndex } from '../src/renderer/src/sim/skills';
import { LOOT_WEAPON_TYPES } from '../src/renderer/src/sim/weaponDefs';
import { HULL_MAX, HEALTH_MAX, TORP_CAP, TICK_HZ, ENCOUNTER_START, XP_THRESHOLDS, EVENT_SCRAP_SCALE } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, mapM, setEvent, grantScrap, run } from './helpers/sim';

const calm = (): SimState => { const s = makeState(2, 1); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); s.run.column = 1; s.run.node = 2; return s; };
const fx = (s: SimState, e: Effect, mult = 1): void => applyEffect(s, e, mult);
const lootAfter = (s: SimState, draws: (r: { s: number }) => void): number => { const ref = { s: s.rng.loot.s }; draws(ref); return ref.s; };

describe('the effects (spec Loop-v section 1)', () => {
  it('scrap: a gain is earned, a cost is spent and spends at most the balance; amounts scale and round', () => {
    const s = calm(); grantScrap(s, 50); const earned = s.telemetry.scrapEarned;
    fx(s, { kind: 'scrap', n: 20 }); expect([s.run.scrap, s.telemetry.scrapEarned - earned]).toEqual([70, 20]);
    fx(s, { kind: 'scrap', n: -30 }); expect([s.run.scrap, s.telemetry.scrapSpent]).toEqual([40, 30]);
    fx(s, { kind: 'scrap', n: -100 }); expect([s.run.scrap, s.telemetry.scrapSpent]).toEqual([0, 70]);
    fx(s, { kind: 'scrap', n: 25 }, 1.15); expect(s.run.scrap).toBe(29);   // 28.75 rounds to 29
    fx(s, { kind: 'scrap', n: -25 }, 1.15); expect(s.run.scrap).toBe(0);
  });
  it('fuel never below 0; hull capped at HULL_MAX and never below 1; torpedoes within 0..TORP_CAP', () => {
    const s = calm(); const f = s.run.fuel;
    fx(s, { kind: 'fuel', n: 2 }); expect(s.run.fuel).toBe(f + 2); fx(s, { kind: 'fuel', n: -99 }); expect(s.run.fuel).toBe(0);
    s.hull = 95; fx(s, { kind: 'hull', n: 10 }); expect(s.hull).toBe(HULL_MAX);
    s.hull = 12; fx(s, { kind: 'hull', n: -20 }); expect(s.hull).toBe(1); fx(s, { kind: 'hull', n: -5 }); expect(s.hull).toBe(1);
    s.weapons.torpedoStock = TORP_CAP - 1; fx(s, { kind: 'torpedoes', n: 3 }); expect(s.weapons.torpedoStock).toBe(TORP_CAP);
    fx(s, { kind: 'torpedoes', n: -99 }); expect(s.weapons.torpedoStock).toBe(0);
  });
  it('heal and crewDamage touch conscious crew only; damage never takes anyone below 1 health', () => {
    const s = calm(); const a = s.crew[0]!, b = s.crew[1]!; downCrew(s, 1); Health.cur[b] = 40; const hb = Health.cur[b]!;
    Health.cur[a] = 30; fx(s, { kind: 'heal' }); expect([Health.cur[a], Health.cur[b], Life.state[b]]).toEqual([HEALTH_MAX, hb, LifeState.Downed]);
    fx(s, { kind: 'crewDamage', n: 15 }); expect([Health.cur[a], Health.cur[b]]).toEqual([HEALTH_MAX - 15, hb]);
    Health.cur[a] = 10; fx(s, { kind: 'crewDamage', n: 15 }); expect([Health.cur[a], Life.state[a]]).toEqual([1, LifeState.Conscious]);
  });
  it('fire, breach, failStation and weapon each make exactly one loot draw; breach draws nothing without a free site', () => {
    const s = calm(); const roomIdx = nextInt({ s: s.rng.loot.s }, s.layout.rooms.length), after = lootAfter(s, (r) => nextInt(r, s.layout.rooms.length));
    fx(s, { kind: 'fire' }); expect(s.rooms.fire[roomIdx]).toBeGreaterThan(0); expect(s.rng.loot.s).toBe(after);
    const b = calm(); const sites = freeSites(b), site = sites[nextInt({ s: b.rng.loot.s }, sites.length)]!;
    fx(b, { kind: 'breach' }); expect(b.breaches.active[site]).toBe(1); expect(b.rng.loot.s).toBe(lootAfter(calm(), (r) => nextInt(r, sites.length)));
    const n = calm(); n.breaches.active.fill(1); const l = n.rng.loot.s; fx(n, { kind: 'breach' }); expect(n.rng.loot.s).toBe(l);
    const f = calm(); const i = nextInt({ s: f.rng.loot.s }, f.stations.level.length); fx(f, { kind: 'failStation' }); expect(f.stations.failed[i]).toBe(1);
    const w = calm(); const id = 1 + nextInt({ s: w.rng.loot.s }, LOOT_WEAPON_TYPES); fx(w, { kind: 'weapon' }); expect([w.weapons.slot[0], w.weapons.lootId, w.weapons.lootBought]).toEqual([id, id, 0]);
  });
  it('fight: the encounter is pending and an enemy arrives ENCOUNTER_START seconds later; elite marks the Pursuit elite', () => {
    const s = calm(); fx(s, { kind: 'fight', elite: false });
    expect([s.run.encounter, s.run.encounterTick, s.enemy.nextArrivalTick, s.run.pursuitFought]).toEqual([Encounter.Pending, s.tick, s.tick + ENCOUNTER_START * TICK_HZ, 0]);
    run(s, ENCOUNTER_START * TICK_HZ - 1); expect(s.enemy.present).toBe(0); run(s, 2); expect(s.enemy.present).toBe(1);
    const e = calm(); fx(e, { kind: 'fight', elite: true }); expect([e.run.encounter, e.run.pursuitFought]).toEqual([Encounter.Pending, 1]);
  });
  it('pursuit moves the front, driveReset empties the drive, nothing changes nothing and draws nothing', () => {
    const s = calm(); const p = s.run.pursuit; fx(s, { kind: 'pursuit', n: -0.75 }); expect(s.run.pursuit).toBe(p - 0.75);
    s.run.jumpCharge = 0.7; fx(s, { kind: 'driveReset' }); expect(s.run.jumpCharge).toBe(0);
    const snap = () => JSON.stringify([s.run.scrap, s.run.fuel, s.hull, s.rng.loot.s, s.run.jumpCharge, s.run.pursuit]);
    const before = snap(); fx(s, { kind: 'nothing' }); expect(snap()).toBe(before);
  });
  it('a chance outcome draws rng.loot once and takes the success branch below the chance', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = makeState(2, seed); const u = nextFloat({ s: s.rng.loot.s }), after = lootAfter(s, (r) => { nextFloat(r); });
      const ok = applyOutcome(s, { chance: 0.5, success: [{ kind: 'scrap', n: 10 }], failure: [{ kind: 'scrap', n: 1 }] }, 1);
      expect([ok, s.run.scrap, s.rng.loot.s]).toEqual([u < 0.5, u < 0.5 ? 10 : 1, after]);
    }
    const t = calm(); const l = t.rng.loot.s; expect(applyOutcome(t, [{ kind: 'scrap', n: 5 }], 1)).toBe(true); expect(t.rng.loot.s).toBe(l);
  });
});

describe('the requirements (spec Loop-v section 1)', () => {
  it('scrap (scaled), fuel, hull (strictly above), torpedoes, torpedo room', () => {
    const s = calm(); grantScrap(s, 23);
    expect([reqMet(s, { kind: 'scrap', n: 20 }, 1), reqMet(s, { kind: 'scrap', n: 20 }, 1.15), reqMet(s, { kind: 'scrap', n: 20 }, 1.2)]).toEqual([true, true, false]);
    s.run.fuel = 2; expect([reqMet(s, { kind: 'fuel', n: 2 }, 1), reqMet(s, { kind: 'fuel', n: 3 }, 1)]).toEqual([true, false]);
    s.hull = 10; expect([reqMet(s, { kind: 'hull', n: 10 }, 1), reqMet(s, { kind: 'hull', n: 9 }, 1)]).toEqual([false, true]);
    s.weapons.torpedoStock = 2; expect([reqMet(s, { kind: 'torpedoes', n: 2 }, 1), reqMet(s, { kind: 'torpedoes', n: 3 }, 1), reqMet(s, { kind: 'torpedoRoom' }, 1)]).toEqual([true, false, true]);
    s.weapons.torpedoStock = TORP_CAP; expect(reqMet(s, { kind: 'torpedoRoom' }, 1)).toBe(false);
  });
  it('a station level is the ship base level with its upgrades; a crew skill needs a conscious crew member', () => {
    const s = calm();
    expect([reqMet(s, { kind: 'station', station: StationKind.Science, n: 2 }, 1), reqMet(s, { kind: 'station', station: StationKind.Science, n: 3 }, 1)]).toEqual([true, false]);
    s.run.upgrades[StationKind.Science] = 1; expect(reqMet(s, { kind: 'station', station: StationKind.Science, n: 3 }, 1)).toBe(true);
    expect(reqMet(s, { kind: 'skill', skill: Skill.Repair, n: 2 }, 1)).toBe(false);
    s.skills.xp[xpIndex(1, Skill.Repair)] = XP_THRESHOLDS[2]!; expect(reqMet(s, { kind: 'skill', skill: Skill.Repair, n: 2 }, 1)).toBe(true);
    downCrew(s, 1); expect(reqMet(s, { kind: 'skill', skill: Skill.Repair, n: 2 }, 1)).toBe(false);
  });
  it('blue tags name the station or skill and its level; other requirements add none', () => {
    expect(blueTag([{ kind: 'station', station: StationKind.Science, n: 2 }])).toBe('[Science 2] ');
    expect(blueTag([{ kind: 'scrap', n: 5 }, { kind: 'skill', skill: Skill.Repair, n: 3 }])).toBe('[Repair 3] ');
    expect([blueTag([{ kind: 'scrap', n: 5 }]), blueTag(undefined)]).toEqual(['', '']);
  });
});

describe('scaling (spec Loop-v section 1)', () => {
  it('a scaled event multiplies by 1 + 0.15 x depth; the six Run-ii events stay unscaled; labels fill their {n} amounts', () => {
    const s = calm(); s.run.sector = 1; s.run.column = 2;   // depth 8
    expect(eventScale(s, { id: 'x', title: '', text: [], choices: [], safeChoice: 0, weight: 1 })).toBeCloseTo(1 + EVENT_SCRAP_SCALE * 8);
    for (let id = 0; id < 6; id++) expect(eventScale(s, EVENT_DEFS[id]!)).toBe(1);
    expect(fillLabel('Sell it (+{40} scrap, -{10})', 2.2)).toBe('Sell it (+88 scrap, -22)');
    expect(choiceLabel(s, 4, 0)).toBe('Take the scrap (+40)');
  });
});

describe('the six Run-ii events as data (spec Loop-v section 2)', () => {
  it('keep their titles, texts, labels and safe choices', () => {
    expect(EVENTS.slice(0, 6).map((e) => [e.title, e.text, ...e.choices, e.safeChoice])).toEqual([
      ['Derelict hulk', 'A drifting hulk, still warm inside.', 'Salvage it (+25 scrap, fire risk)', 'Leave it', 1],
      ['Distress call', 'A venting freighter offers a reward.', 'Help them (hull -10, +30 scrap)', 'Ignore it', 1],
      ['Smugglers', 'Smugglers offer cheap torpedoes.', 'Buy 2 torpedoes (20 scrap)', 'Refuse', 1],
      ['Micrometeoroid field', 'A debris field lies across the lane.', 'Push through (+20, breach risk)', 'Go around (drive recharges)', 1],
      ['Supply cache', 'A cache, hard-wired to something.', 'Take the scrap (+40)', 'Strip it bare (+60, a station fails)', 0],
      ['Medical freighter', 'A hospital ship offers treatment.', 'Treat the crew (15 scrap)', 'Decline', 1],
    ]);
  });
  it('a choice beyond the list is disabled and resolves nothing', () => {
    const s = calm(); setEvent(s, 4); expect(choiceEnabled(s, 4, 2)).toBe(false); resolveEvent(s, 2); expect(s.run.eventChoice).toBe(-1);
  });
});
