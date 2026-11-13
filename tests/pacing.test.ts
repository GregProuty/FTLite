import { describe, it, expect } from 'vitest';
import { generateMap, assignNodeTypes, NodeType, navRows, beaconIndex, sectorJump } from '../src/renderer/src/sim/run';
import { createRng } from '../src/shared/rng';
import { SECTOR_COLUMNS, NODE_STRIDE, SHOP_CHANCE, EVENT_CHANCE, ASTEROID_CHANCE, EMPTY_CHANCE } from '../src/renderer/src/sim/tuning';
import { failStation, shiftBar } from '../src/renderer/src/sim/power';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { buildHudModel, runNotice } from '../src/renderer/src/render/hudModel';
import { makeState, quiet, chargeJump } from './helpers/sim';

const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: i === 0 ? 'kb:0' : 'kb:1' }));
const HELM = 'HELM OFFLINE: repair Navigation to jump';

describe('pacing: the map (spec Demo-x-b section 2)', () => {
  it('column 1 is all Hazard and column 2 has no Empty beacon, for seeds 1..300 and every sector', () => {
    let empties = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = generateMap(createRng(seed));
      for (let n = 0; n < g.colNodes[1]!; n++) expect(g.nodeType[beaconIndex(1, n)]).toBe(NodeType.Hazard);
      for (let n = 0; n < g.colNodes[2]!; n++) expect(g.nodeType[beaconIndex(2, n)]).not.toBe(NodeType.Empty);
      for (let c = 3; c < SECTOR_COLUMNS - 1; c++) for (let n = 0; n < g.colNodes[c]!; n++) if (g.nodeType[beaconIndex(c, n)] === NodeType.Empty) empties++;
    }
    expect(empties).toBeGreaterThan(0);   // Empty still happens from column 3
    const s = makeState(2, 4); s.run.column = SECTOR_COLUMNS - 1; s.run.node = 0; sectorJump(s);
    for (let n = 0; n < s.run.colNodes[1]!; n++) expect(s.run.nodeType[beaconIndex(1, n)]).toBe(NodeType.Hazard);
  });
  it('the thresholds: Shop 0.15, Event 0.25, Asteroid 0.15, Empty 0.05, else Hazard (0.40); no draw in column 1; an Empty draw in column 2 is a Hazard', () => {
    expect([SHOP_CHANCE, EVENT_CHANCE, ASTEROID_CHANCE, EMPTY_CHANCE]).toEqual([0.15, 0.25, 0.15, 0.05]);
    const cn = makeState(2, 1).run.colNodes, drawn = Array.from(cn).slice(2, -1).reduce((a, b) => a + b, 0);
    for (const [u, want, want2] of [[0.14, NodeType.Shop, NodeType.Shop], [0.15, NodeType.Event, NodeType.Event], [0.39, NodeType.Event, NodeType.Event], [0.4, NodeType.Asteroid, NodeType.Asteroid], [0.54, NodeType.Asteroid, NodeType.Asteroid], [0.55, NodeType.Empty, NodeType.Hazard], [0.59, NodeType.Empty, NodeType.Hazard], [0.6, NodeType.Hazard, NodeType.Hazard], [0.99, NodeType.Hazard, NodeType.Hazard]] as const) {
      const t = new Uint8Array(SECTOR_COLUMNS * NODE_STRIDE); let draws = 0;
      assignNodeTypes(createRng(1), cn, t, () => { draws++; return draws === 1 ? 0.1 : u; });   // the first drawn node (column 2 node 0) a shop, so no fallback
      expect(draws).toBe(drawn);
      for (let n = 0; n < cn[1]!; n++) expect(t[beaconIndex(1, n)]).toBe(NodeType.Hazard);
      expect(t[beaconIndex(2, 0)]).toBe(NodeType.Shop);
      for (let n = 1; n < cn[2]!; n++) expect(t[beaconIndex(2, n)]).toBe(want2);
      for (let c = 3; c < SECTOR_COLUMNS - 1; c++) for (let n = 0; n < cn[c]!; n++) expect(t[beaconIndex(c, n)]).toBe(want);
    }
  });
});

describe('pacing: the helm-offline warning (spec Demo-x-b section 2)', () => {
  for (const how of ['failed', 'unpowered'] as const) {
    it(`a ${how} Navigation: the notice, the jump rows and the threats panel say so`, () => {
      const s = makeState(2, 1); quiet(s); s.run.column = 1; s.run.calm = 0; chargeJump(s);
      const nav = s.derived.stationOfKind[StationKind.Navigation]!;
      expect(runNotice(s)[0]).not.toBe(HELM);
      expect(navRows(s).filter((r) => r.select === 'jump').every((r) => r.text !== 'Helm offline' && r.enabled)).toBe(true);
      if (how === 'failed') failStation(s, nav); else while (s.stations.level[nav]! > 0) shiftBar(s, nav, -1);
      const notice = runNotice(s);
      expect(notice[0]).toBe(HELM);
      expect(notice.length).toBeLessThanOrEqual(2);
      const jumps = navRows(s).filter((r) => r.select === 'jump');
      expect(jumps.length).toBeGreaterThan(0);
      for (const r of jumps) { expect(r.text).toBe('Helm offline'); expect(r.enabled).toBe(false); }
      const m = buildHudModel(s, slots(2), 'running', '');
      expect(m.threats[0]).toEqual({ icon: 'icon.power', text: 'Helm offline' });
      expect(m.notice[0]).toBe(HELM);
    });
  }
  it('the warning keeps the next notice line but drops the ready drive line (no one can take Navigation)', () => {
    const s = makeState(2, 1); quiet(s); s.run.column = 1; s.run.calm = 0; chargeJump(s); s.enemy.nextArrivalTick = 1e9;
    failStation(s, s.derived.stationOfKind[StationKind.Navigation]!);
    expect(runNotice(s)).toEqual([HELM]);
    s.run.column = 0; s.run.calm = 1;
    expect(runNotice(s)).toEqual([HELM, 'Safe here. Jump when ready']);
  });
});
