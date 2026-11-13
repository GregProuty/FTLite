import { describe, it, expect } from 'vitest';
import { buildHudModel, mapTitle } from '../src/renderer/src/render/hudModel';
import { NodeType } from '../src/renderer/src/sim/run';
import { SECTOR_COLUMNS, NODE_STRIDE } from '../src/renderer/src/sim/tuning';
import { navRows } from '../src/renderer/src/sim/run';
import { makeState, mapM, setNodeTypes, seatNavigator, chargeJump, quiet, setEvent, grantScrap } from './helpers/sim';

const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: `kb:${i}` }));
const build = (s: ReturnType<typeof makeState>, phase: 'running' | 'paused' = 'running') => buildHudModel(s, slots(2), phase, '').map;

describe('sector map model', () => {
  it('is null with no one at Navigation and outside running', () => {
    const s = makeState(2); quiet(s); mapM(s);
    expect(build(s)).toBeNull();
    seatNavigator(s, 0);
    expect(build(s)).not.toBeNull(); expect(build(s, 'paused')).toBeNull();
    expect(buildHudModel(null, slots(1), 'lobby', '').map).toBeNull();
  });
  it('on fixture M at column 1 node 2 reports current, reachable, selected, past, edges and types', () => {
    const s = makeState(2); quiet(s); mapM(s);
    s.run.column = 1; s.run.node = 2;
    setNodeTypes(s, { '1:0': NodeType.Shop, '2:1': NodeType.Event });
    const n = seatNavigator(s, 0); s.stations.cursor[n] = 0;
    const m = build(s)!;
    expect(m.columns.length).toBe(6); expect(m.columns.map((c) => c.nodes.length)).toEqual([1, 3, 2, 2, 2, 1]);
    const flat = m.columns.flatMap((c, ci) => c.nodes.map((nd, k) => ({ ci, k, nd })));
    expect(flat.filter((x) => x.nd.current).map((x) => [x.ci, x.k])).toEqual([[1, 2]]);
    expect(flat.filter((x) => x.nd.reachable).map((x) => [x.ci, x.k])).toEqual([[1, 1], [2, 0]]);   // forward and the sideways neighbour (spec Loop-i section 1)
    expect(flat.filter((x) => x.nd.selected).map((x) => [x.ci, x.k])).toEqual([[2, 0]]);
    expect(flat.filter((x) => x.nd.past).map((x) => x.ci)).toEqual([0]);
    expect(m.columns[1]!.nodes[0]!.type).toBe('shop'); expect(m.columns[2]!.nodes[1]!.type).toBe('event'); expect(m.columns[0]!.nodes[0]!.type).toBe('hazard');
    const expected: { from: [number, number]; to: [number, number] }[] = [];
    for (let c = 0; c < SECTOR_COLUMNS; c++) {
      if (c > 0 && c < SECTOR_COLUMNS - 1) for (let a = 0; a + 1 < s.run.colNodes[c]!; a++) expected.push({ from: [c, a], to: [c, a + 1] });   // the sideways edges between vertical neighbours
      if (c < SECTOR_COLUMNS - 1) for (let a = 0; a < s.run.colNodes[c]!; a++) for (let d = 0; d < s.run.colNodes[c + 1]!; d++) if (s.run.edgeMask[c * NODE_STRIDE + a]! & (1 << d)) expected.push({ from: [c, a], to: [c + 1, d] });
    }
    expect(m.edges).toEqual(expected);
  });
  it('from the start the cursor selects its destination among two reachable nodes', () => {
    const s = makeState(2); quiet(s); mapM(s);
    const n = seatNavigator(s, 0); s.stations.cursor[n] = 1;
    const m = build(s)!;
    expect(m.columns[1]!.nodes.map((x) => [x.reachable, x.selected])).toEqual([[true, false], [false, false], [true, true]]);
  });
  it('the title carries the node ordinal and the footer jump text', () => {
    const s = makeState(2); quiet(s); mapM(s); s.run.column = 1; s.run.node = 2; seatNavigator(s, 0);
    s.run.jumpCharge = 0.64; expect(mapTitle(build(s)!)).toBe('SECTOR MAP   node 2/6   Jump 64%');
    chargeJump(s); expect(mapTitle(build(s)!)).toBe('SECTOR MAP   node 2/6   Jump READY');
  });
  it('a pending event selects nothing but the next column stays reachable', () => {
    const s = makeState(2); quiet(s); mapM(s); const n = seatNavigator(s, 0); s.stations.cursor[n] = 0; setEvent(s, 0);
    const m = build(s)!, flat = m.columns.flatMap((c) => c.nodes);
    expect(flat.some((x) => x.selected)).toBe(false);
    expect(m.columns[1]!.nodes.map((x) => x.reachable)).toEqual([true, false, true]);
  });
  it('a shop node selects nothing on a buy row, and exactly the destination on a jump row', () => {
    const s = makeState(2); quiet(s); mapM(s); setNodeTypes(s, { '0:0': NodeType.Shop }); grantScrap(s, 100);
    const n = seatNavigator(s, 0); s.stations.cursor[n] = 1;
    expect(navRows(s)[1]!.select).toBe('buy');
    expect(build(s)!.columns.flatMap((c) => c.nodes).some((x) => x.selected)).toBe(false);
    const j = navRows(s).findIndex((r) => r.select === 'jump'); expect(j).toBeGreaterThan(1);
    s.stations.cursor[n] = j;
    const sel = build(s)!.columns.flatMap((c, ci) => c.nodes.map((x, k) => ({ ci, k, x }))).filter((e) => e.x.selected);
    expect(sel.length).toBe(1); expect(sel[0]!.ci).toBe(1);
  });
  it('marks each node with its type, asteroid fields and empty beacons included', () => {
    const s = makeState(2); quiet(s); mapM(s); setNodeTypes(s, { '1:0': NodeType.Asteroid, '1:1': NodeType.Shop, '2:0': NodeType.Event, '2:1': NodeType.Empty }); seatNavigator(s, 0);
    const m = build(s)!;
    expect(m.columns[1]!.nodes.map((x) => x.type)).toEqual(['asteroid', 'shop', 'hazard']);
    expect(m.columns[2]!.nodes.map((x) => x.type)).toEqual(['event', 'empty']);
  });
});
