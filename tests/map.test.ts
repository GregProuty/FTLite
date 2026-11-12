import { describe, it, expect } from 'vitest';
import { buildHudModel, mapTitle } from '../src/renderer/src/render/hudModel';
import { NodeType } from '../src/renderer/src/sim/run';
import { RUN_COLUMNS } from '../src/renderer/src/sim/tuning';
import { makeState, mapM, setNodeTypes, seatNavigator, chargeJump, quiet } from './helpers/sim';

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
    expect(m.columns.length).toBe(8); expect(m.columns.map((c) => c.nodes.length)).toEqual([1, 3, 2, 2, 2, 2, 2, 1]);
    const flat = m.columns.flatMap((c, ci) => c.nodes.map((nd, k) => ({ ci, k, nd })));
    expect(flat.filter((x) => x.nd.current).map((x) => [x.ci, x.k])).toEqual([[1, 2]]);
    expect(flat.filter((x) => x.nd.reachable).map((x) => [x.ci, x.k])).toEqual([[2, 0]]);
    expect(flat.filter((x) => x.nd.selected).map((x) => [x.ci, x.k])).toEqual([[2, 0]]);
    expect(flat.filter((x) => x.nd.past).map((x) => x.ci)).toEqual([0]);
    expect(m.columns[1]!.nodes[0]!.type).toBe('shop'); expect(m.columns[2]!.nodes[1]!.type).toBe('event'); expect(m.columns[0]!.nodes[0]!.type).toBe('hazard');
    const expected: { from: [number, number]; to: [number, number] }[] = [];
    for (let c = 0; c < RUN_COLUMNS - 1; c++) for (let a = 0; a < s.run.colNodes[c]!; a++) for (let d = 0; d < s.run.colNodes[c + 1]!; d++) if (s.run.edgeMask[c * 3 + a]! & (1 << d)) expected.push({ from: [c, a], to: [c + 1, d] });
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
    s.run.jumpCharge = 0.64; expect(mapTitle(build(s)!)).toBe('SECTOR MAP   node 2/8   Jump 64%');
    chargeJump(s); expect(mapTitle(build(s)!)).toBe('SECTOR MAP   node 2/8   Jump READY');
  });
});
