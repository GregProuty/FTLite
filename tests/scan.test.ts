import { targetRef, scienceTargetSlot } from '../src/renderer/src/sim/debrisTargets';
import { describe, it, expect } from 'vitest';
import { generateMap, NodeType, beaconIndex, beaconMark, jumpShip, sectorJump, reachable } from '../src/renderer/src/sim/run';
import { createRng, nextFloat } from '../src/shared/rng';
import { TICK_HZ, DT, SECTOR_COLUMNS, NODE_STRIDE, SYSTEM_SCAN_TIME, SCAN_DETECT_BASE, SCAN_DETECT_SKILL, SCAN_DETECT_MAX, AMBUSH_CHANCE, AMBUSH_EVENT_CHANCE, CACHE_CHANCE, AMBUSH_DELAY, AMBUSH_WARN, FIRST_STRIKE_SECONDS, ENEMY_FIRST_SHOT, CACHE_FUEL, scrapCache, SCAN_RESULT_SECONDS, SCAN_NOTICE_SECONDS, ENCOUNTER_START } from '../src/renderer/src/sim/tuning';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Skill } from '../src/renderer/src/sim/skills';
import { sitDown, stationOutput } from '../src/renderer/src/sim/stations';
import { scanDetectChance, detectChance, SystemScan, ScanFound } from '../src/renderer/src/sim/science';
import { EnemySystem, enemyWeaponCharge, Encounter } from '../src/renderer/src/sim/enemy';
import { shotsInFlight } from '../src/renderer/src/sim/debris';
import { applyEffect } from '../src/renderer/src/sim/events';
import { depthOf } from '../src/renderer/src/sim/depth';
import { flatten, unflatten } from '../src/renderer/src/sim/flatten';
import { hashState } from '../src/renderer/src/sim/hash';
import { buildHudModel, runNotice, type SciencePanel } from '../src/renderer/src/render/hudModel';
import { makeState, quiet, intents, run, mapM, setNodeTypes, chargeJump, setSkill, at, placeDebris } from './helpers/sim';

const T = TICK_HZ;
const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: i === 0 ? 'kb:0' : 'kb:1' }));
const confirm1 = () => intents({}, { confirmPressed: true });

/** Seed s on map M, beacon 1:1 of the given type (an ambusher and a cache as asked), jumped to; P2 seated at Science. */
function arriveAt(seed: number, type: number, o: { ambush?: boolean; cache?: boolean; skill?: number } = {}) {
  const s = makeState(2, seed); quiet(s); s.boarders.nextArrivalTick = 1e9; mapM(s);
  s.run.edgeMask[0] = 0b010;   // the start reaches 1:1 only
  setNodeTypes(s, { '1:1': type, '1:0': NodeType.Event, '1:2': NodeType.Asteroid, '2:0': NodeType.Empty });
  s.run.ambush.fill(0); s.run.cache.fill(0);
  if (o.ambush) s.run.ambush[beaconIndex(1, 1)] = 1;
  if (o.cache) s.run.cache[beaconIndex(1, 1)] = 1;
  chargeJump(s); jumpShip(s, at(1, 1));
  const sci = s.derived.stationOfKind[StationKind.Science]!;
  if (o.skill !== undefined) setSkill(s, 1, Skill.Science, o.skill);
  sitDown(s, 1, sci); run(s, 1);
  return { s, sci };
}
const panel = (s: ReturnType<typeof makeState>) => buildHudModel(s, slots(2), 'running', '').players[1]!.console as SciencePanel;
/** Run the scan to its end; returns the ticks it took. */
function scanToEnd(s: ReturnType<typeof makeState>): number { const t0 = s.tick; run(s, 1, confirm1); while (s.science.systemState !== SystemScan.Done && s.tick - t0 < 60 * T) run(s, 1); return s.tick - t0; }
/** The rng.loot draws the scan will make, read from a copy of the stream. */
const peek = (s: ReturnType<typeof makeState>, n: number): number[] => { const c = { s: s.rng.loot.s }; return Array.from({ length: n }, () => nextFloat(c)); };

describe('the system scan: ambushers and caches on the map (spec Demo-x-b section 3)', () => {
  it('ambushers only at Empty (0.5) and Event (0.2) beacons, caches only at Empty (0.4), over 400 seeds; drawn from rng.map after the types', () => {
    expect([AMBUSH_CHANCE, AMBUSH_EVENT_CHANCE, CACHE_CHANCE]).toEqual([0.5, 0.2, 0.4]);
    const n = { empty: 0, event: 0, emptyAmbush: 0, eventAmbush: 0, cache: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const g = generateMap(createRng(seed));
      for (let k = 0; k < SECTOR_COLUMNS * NODE_STRIDE; k++) {
        const t = g.nodeType[k]!;
        if (t === NodeType.Empty) { n.empty++; n.emptyAmbush += g.ambush[k]!; n.cache += g.cache[k]!; }
        else if (t === NodeType.Event) { n.event++; n.eventAmbush += g.ambush[k]!; expect(g.cache[k]).toBe(0); }
        else { expect(g.ambush[k]).toBe(0); expect(g.cache[k]).toBe(0); }
      }
    }
    expect(n.emptyAmbush / n.empty).toBeGreaterThan(0.4); expect(n.emptyAmbush / n.empty).toBeLessThan(0.6);
    expect(n.eventAmbush / n.event).toBeGreaterThan(0.15); expect(n.eventAmbush / n.event).toBeLessThan(0.25);
    expect(n.cache / n.empty).toBeGreaterThan(0.3); expect(n.cache / n.empty).toBeLessThan(0.5);
  });
  // the draw order against a replay: tests/run.test.ts (the map stream ends where the replay ends)
  it('a sector jump draws the next sector’s ambushers and caches and clears the reveals', () => {
    const s = makeState(2, 5); s.run.revealed[beaconIndex(2, 0)] = 1; s.run.column = SECTOR_COLUMNS - 1; s.run.node = 0;
    const ref = { s: s.rng.map.s }, g = generateMap(ref);
    sectorJump(s);
    expect(Array.from(s.run.ambush)).toEqual(Array.from(g.ambush)); expect(Array.from(s.run.cache)).toEqual(Array.from(g.cache));
    expect(Array.from(s.run.revealed).every((v) => v === 0)).toBe(true);
  });
});

describe('the system scan: the row, its chance and its time (spec Demo-x-b section 3)', () => {
  it('the chance: 0.45 + 0.15 per Science level, capped at 0.95', () => {
    expect([SCAN_DETECT_BASE, SCAN_DETECT_SKILL, SCAN_DETECT_MAX]).toEqual([0.45, 0.15, 0.95]);
    expect([0, 1, 2, 3, 4, 10].map(scanDetectChance)).toEqual([0.45, 0.6, 0.75, 0.9, 0.95, 0.95]);
  });
  it('the Science card lists the row last with its percentage, the seated officer’s skill; the cursor reaches it with Up/Down', () => {
    const { s, sci } = arriveAt(1, NodeType.Empty, { skill: 1 });
    expect(detectChance(s, sci)).toBe(0.6);
    let p = panel(s);
    expect(p.system).toEqual({ text: 'Scan system  (detect 60%)', enabled: true, results: [] });
    expect(p.cursor).toBe(p.targets.length);   // no target: the cursor is on the row
    const slot = placeDebris(s, 0, 60 * T, 1); s.science.target = targetRef(s, slot);   // one warned object
    run(s, 1, () => intents({}, { moveY: 1 })); expect(scienceTargetSlot(s)).toBe(-1);
    run(s, 1); run(s, 1, () => intents({}, { moveY: 1 })); expect(scienceTargetSlot(s)).toBe(slot);
    p = panel(s); expect(p.cursor).toBe(0);
  });
  it('Confirm on the row starts it; it lasts SYSTEM_SCAN_TIME (8 s) at output 1, scaled by the output; the row shows its progress', () => {
    expect(SYSTEM_SCAN_TIME).toBe(8);
    const { s, sci } = arriveAt(1, NodeType.Empty);
    const out = stationOutput(s, sci);
    run(s, 1, confirm1); expect(s.science.systemState).toBe(SystemScan.Running);
    run(s, 60); expect(panel(s).system.text).toBe(`Scanning system  ${Math.floor(s.science.system * 100)}%`);
    while (s.science.systemState === SystemScan.Running) run(s, 1);
    const ticks = Math.ceil(SYSTEM_SCAN_TIME / (DT * out) - 1e-6);
    expect(s.science.systemTick).toBeGreaterThan(0);
    expect(Math.abs(s.science.systemTick - s.science.systemStartTick - ticks)).toBeLessThanOrEqual(1);
    expect(panel(s).system.text).toBe('System scanned');
  });
  it('one scan per beacon visit: Confirm again does nothing; a jump makes it ready again', () => {
    const { s } = arriveAt(1, NodeType.Hazard); scanToEnd(s);
    const tick = s.science.systemTick; run(s, 1, confirm1); expect([s.science.systemState, s.science.systemTick]).toEqual([SystemScan.Done, tick]);
    chargeJump(s); jumpShip(s, at(2, 0));
    expect([s.science.systemState, s.science.system, s.science.systemResult, s.science.systemTick]).toEqual([SystemScan.Ready, 0, 0, -1]);
  });
  it('the scan pauses while the officer stands (a failed or unpowered Science stands them up)', () => {
    const { s, sci } = arriveAt(1, NodeType.Hazard); run(s, 1, confirm1); run(s, 30);
    run(s, 1, () => intents({}, { cancelPressed: true })); const p0 = s.science.system; run(s, 60);
    expect(s.science.system).toBe(p0); expect(s.science.systemState).toBe(SystemScan.Running);
    expect(s.stations.occupant[sci]).toBe(-1);
  });
});

describe('the system scan: what it finds (spec Demo-x-b section 3)', () => {
  it('a hidden ship: one loot draw below the chance detects it; above it stays hidden', () => {
    let detected = 0, missed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { s, sci } = arriveAt(seed, NodeType.Empty, { ambush: true });
      expect(s.run.ambushState).toBe(1);
      run(s, 1, confirm1); while (s.science.system + DT * stationOutput(s, sci) / SYSTEM_SCAN_TIME < 1 - 1e-9) run(s, 1);
      const [u] = peek(s, 1), p = detectChance(s, sci), lootBefore = s.rng.loot.s;
      run(s, 1);
      expect(s.science.systemState).toBe(SystemScan.Done);
      expect(s.rng.loot.s).not.toBe(lootBefore);
      if (u! < p) { detected++; expect(s.run.ambushState).toBe(2); expect(s.science.systemResult & ScanFound.Ship).toBeTruthy(); }
      else { missed++; expect(s.run.ambushState).toBe(1); expect(s.science.systemResult & ScanFound.Ship).toBe(0); }
    }
    expect(detected).toBeGreaterThan(0); expect(missed).toBeGreaterThan(0);
  });
  it('nothing hidden and no neighbour to chart: no draw at all', () => {
    const { s } = arriveAt(1, NodeType.Hazard);
    s.run.visited[beaconIndex(2, 0)] = 1; s.run.revealed[beaconIndex(1, 0)] = 1; s.run.nodeType[beaconIndex(1, 2)] = NodeType.Shop;   // every neighbour already known
    const before = s.rng.loot.s; scanToEnd(s); expect(s.rng.loot.s).toBe(before); expect(s.science.systemResult).toBe(0);
  });
  it('a cache: the draw below the chance collects it (a second draw: 2 fuel below one half, else scrap 20-40 by depth); the cache is gone', () => {
    let found = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const { s, sci } = arriveAt(seed, NodeType.Empty, { cache: true });
      s.run.visited[beaconIndex(2, 0)] = 1; s.run.revealed[beaconIndex(1, 0)] = 1; s.run.revealed[beaconIndex(1, 2)] = 1;   // only the cache draws
      run(s, 1, confirm1); while (s.science.system + DT * stationOutput(s, sci) / SYSTEM_SCAN_TIME < 1 - 1e-9) run(s, 1);
      const [u, kind] = peek(s, 2), p = detectChance(s, sci), scrap = s.run.scrap, fuel = s.run.fuel;
      run(s, 1);
      if (u! < p) {
        found++; expect(s.run.cache[beaconIndex(1, 1)]).toBe(0); expect(s.science.systemResult & ScanFound.Cache).toBeTruthy();
        if (kind! < 0.5) { expect(s.run.fuel).toBe(fuel + CACHE_FUEL); expect(s.science.systemResult & ScanFound.Fuel).toBeTruthy(); }
        else { expect(s.run.scrap).toBe(scrap + scrapCache(depthOf(s))); expect(s.science.systemResult & ScanFound.Fuel).toBe(0); }
      } else { expect(s.run.cache[beaconIndex(1, 1)]).toBe(1); expect([s.run.scrap, s.run.fuel]).toEqual([scrap, fuel]); }
    }
    expect(found).toBeGreaterThan(0);
    expect([scrapCache(0), scrapCache(17)]).toEqual([20, 40]);
  });
  it('neighbours: each unknown reachable beacon is revealed with the chance, one draw each; the map and the Navigation rows show its type', () => {
    let revealed = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { s, sci } = arriveAt(seed, NodeType.Hazard);
      const unknown = reachable(s).filter((b) => !s.run.visited[beaconIndex(b.column, b.node)]);
      expect(unknown.map((b) => beaconMark(s, b.column, b.node))).toEqual(unknown.map(() => '?'));
      run(s, 1, confirm1); while (s.science.system + DT * stationOutput(s, sci) / SYSTEM_SCAN_TIME < 1 - 1e-9) run(s, 1);
      const u = peek(s, unknown.length), p = detectChance(s, sci);
      run(s, 1);
      unknown.forEach((b, k) => { const k2 = beaconIndex(b.column, b.node); expect(s.run.revealed[k2]).toBe(u[k]! < p ? 1 : 0); if (u[k]! < p) { revealed++; expect(beaconMark(s, b.column, b.node)).not.toBe('?'); } });
      expect(s.science.systemResult >> 3).toBe(u.filter((x) => x < p).length);
    }
    expect(revealed).toBeGreaterThan(0);
    const { s } = arriveAt(1, NodeType.Hazard); s.run.revealed[beaconIndex(1, 0)] = 1;
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.map).toBeNull();   // nobody at Navigation: the map is the officer's
    expect(beaconMark(s, 1, 0)).toBe('Event'); expect(beaconMark(s, 1, 2)).toBe('?');
  });
});

describe('the system scan: ambushes (spec Demo-x-b section 3)', () => {
  it('an undetected ambusher arrives AMBUSH_DELAY after arrival with its first shot charged; the contact notice comes only 3 s before', () => {
    expect([AMBUSH_DELAY, AMBUSH_WARN]).toEqual([30, 3]);
    const { s } = arriveAt(2, NodeType.Empty, { ambush: true });
    const arrival = s.tick - 1;
    expect(s.run.encounter).toBe(Encounter.Pending); expect(s.enemy.nextArrivalTick).toBe(arrival + AMBUSH_DELAY * T);
    run(s, s.enemy.nextArrivalTick - (AMBUSH_WARN * T) - s.tick - 1);
    expect(runNotice(s).some((l) => l.includes('AMBUSH') || l.startsWith('Contact'))).toBe(false);
    run(s, 1); expect(runNotice(s)[0]).toBe('AMBUSH: a hidden ship decloaks!');
    while (!s.enemy.present) run(s, 1);
    expect(enemyWeaponCharge(s)).toBe(1);
    run(s, 1); expect(shotsInFlight(s)).toBe(1);
  });
  it('a detected ambusher: the notice and the threat while it comes, then it arrives on time with its shields down for 10 s and its first shot on the usual clock', () => {
    const { s } = arriveAt(2, NodeType.Empty, { ambush: true });
    s.run.ambushState = 2;   // as a scan's detection leaves it
    const m = buildHudModel(s, slots(2), 'running', ''), left = Math.ceil((s.enemy.nextArrivalTick - s.tick) / T);
    expect(runNotice(s)[0]).toBe(`Hidden ship detected: cloaked raider   contact ${left}s`);
    expect(runNotice(s)[1]).toBe('Strike first: its shields will be down 10s');
    expect(m.threats.some((t) => t.text === `Hidden ship: contact ${left}s`)).toBe(true);
    chargeJump(s); expect(runNotice(s)[1]).toBe('Jump away, or strike first: shields down 10s');
    s.run.jumpCharge = 0;
    while (!s.enemy.present) run(s, 1);
    const t0 = s.tick - 1;
    expect(s.enemy.shieldLayers).toBe(0); expect(s.enemy.ionUntil[EnemySystem.Shields]).toBe(t0 + FIRST_STRIKE_SECONDS * T);
    expect(s.enemy.nextShotTick).toBe(t0 + ENEMY_FIRST_SHOT * T);
    run(s, FIRST_STRIKE_SECONDS * T - 2); expect(s.enemy.shieldLayers).toBe(0);
  });
  it('the ambusher is spent on arrival: leaving and coming back finds no second one; an event’s fight replaces it', () => {
    const { s } = arriveAt(2, NodeType.Empty, { ambush: true });
    expect(s.run.ambush[beaconIndex(1, 1)]).toBe(0);
    const e = arriveAt(2, NodeType.Event, { ambush: true }).s;
    expect(e.run.ambushState).toBe(1);
    applyEffect(e, { kind: 'fight', elite: false }, 1); expect(e.run.ambushState).toBe(0); expect(e.enemy.nextArrivalTick).toBe(e.tick + ENCOUNTER_START * T);
  });
});

describe('the system scan: results on the card and in a notice (spec Demo-x-b section 3)', () => {
  it('the card lists the results for 10 s; the notice summarizes them for 5 s', () => {
    expect([SCAN_RESULT_SECONDS, SCAN_NOTICE_SECONDS]).toEqual([10, 5]);
    const { s } = arriveAt(1, NodeType.Hazard);
    s.science.systemState = SystemScan.Done; s.science.systemTick = s.tick; s.science.systemResult = ScanFound.Ship | ScanFound.Cache | (2 << 3);
    expect(panel(s).system.results).toEqual(['Hidden ship detected: cloaked raider', `Cache found: +${scrapCache(depthOf(s))} scrap`, 'Charted 2 beacons']);
    expect(runNotice(s)).toEqual(['SCAN: hidden ship detected', `cache +${scrapCache(depthOf(s))} scrap, 2 beacons charted`]);   // too wide for one line at the larger font: split at the first comma (spec Demo-x-c section 1)
    s.science.systemResult = 0;
    expect(panel(s).system.results).toEqual(['No hidden ship found', 'No cache found', 'No beacons charted']);
    expect(runNotice(s)[0]).toBe('SCAN: nothing found');
    s.science.systemResult = ScanFound.Cache | ScanFound.Fuel | (1 << 3);
    expect(panel(s).system.results).toEqual(['No hidden ship found', `Cache found: +${CACHE_FUEL} fuel`, 'Charted 1 beacon']);
    run(s, SCAN_NOTICE_SECONDS * T); expect(runNotice(s)[0] ?? '').not.toMatch(/^SCAN/); expect(panel(s).system.results.length).toBe(3);
    run(s, (SCAN_RESULT_SECONDS - SCAN_NOTICE_SECONDS) * T); expect(panel(s).system.results).toEqual([]);
  });
});

describe('the system scan: state (spec Demo-x-b section 4)', () => {
  it('the new fields round-trip and each changes the hash', () => {
    const { s } = arriveAt(4, NodeType.Empty, { ambush: true, cache: true });
    s.run.revealed[beaconIndex(2, 0)] = 1; s.science.system = 0.25; s.science.systemState = SystemScan.Running; s.science.systemStartTick = 7; s.science.systemTick = 9; s.science.systemResult = 5;
    const t = makeState(2, 99); unflatten(t, flatten(s));
    expect(Array.from(t.run.ambush)).toEqual(Array.from(s.run.ambush)); expect(Array.from(t.run.cache)).toEqual(Array.from(s.run.cache)); expect(Array.from(t.run.revealed)).toEqual(Array.from(s.run.revealed));
    expect([t.run.ambushState, t.science.system, t.science.systemState, t.science.systemStartTick, t.science.systemTick, t.science.systemResult]).toEqual([1, 0.25, 1, 7, 9, 5]);
    for (const poke of [() => { s.run.ambush[3] = 1; }, () => { s.run.cache[3] = 1; }, () => { s.run.revealed[3] = 1; }, () => { s.run.ambushState = 2; }, () => { s.science.system = 0.5; }, () => { s.science.systemState = 2; }, () => { s.science.systemStartTick++; }, () => { s.science.systemTick++; }, () => { s.science.systemResult++; }]) { const h = hashState(s); poke(); expect(hashState(s)).not.toBe(h); }
  });
});
