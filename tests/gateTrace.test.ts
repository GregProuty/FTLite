import { describe, expect, it } from 'vitest';
import { firstDifference } from './helpers/gameplayTrace';
import { firstGateDifference, type GateTrace } from './helpers/gateTrace';

const trace = (): GateTrace => ({ name: 'negative', initial: { tick: 0 }, final: { tick: 110 }, minHealth: 100, minHull: 100, actions: [{ tick: 0, through: 99, inputs: [[0, 0, 0]] }], rng: [] });

describe('chronological gate divergence', () => {
  it('reports the tick of an added trailing observation instead of the enclosing tick', () => {
    expect(firstDifference([{ tick: 0 }, { tick: 60 }], [{ tick: 0 }, { tick: 60 }, { tick: 900 }])).toEqual({ tick: 900, field: '[2]' });
  });
  it('reports an earlier shared observation difference before a trailing length difference', () => {
    expect(firstDifference([{ tick: 0, hull: 100 }, { tick: 60 }], [{ tick: 0, hull: 99 }])).toEqual({ tick: 0, field: '[0].hull' });
  });
  it('reports the first covered tick of a late added action span', () => {
    const expected = trace(), actual = trace(); actual.actions.push({ tick: 100, through: 109, inputs: [[0, 0, 4]] });
    expect(firstGateDifference(expected, actual)).toEqual({ tick: 100, field: 'actions[100].inputs' });
  });
  it('reports the first missing covered tick when a span is shortened', () => {
    const expected = trace(), actual = trace(); actual.actions[0]!.through = 49;
    expect(firstGateDifference(expected, actual)).toEqual({ tick: 50, field: 'actions[50].inputs' });
  });
  it('compares covered inputs independently of equivalent span segmentation', () => {
    const expected = trace(), actual = trace(); actual.actions[0]!.through = 49;
    actual.actions.push({ tick: 50, through: 99, inputs: [[0, 0, 0]] });
    expect(firstGateDifference(expected, actual)).toBeNull();
  });
  it('reports an earlier RNG change before a later action difference and summary difference', () => {
    const expected = trace(), actual = trace(); actual.actions[0]!.through = 89;
    actual.actions.push({ tick: 90, through: 99, inputs: [[0, 0, 4]] });
    expected.rng.push({ tick: 20, changed: { combat: 1 } }); actual.rng.push({ tick: 20, changed: { combat: 2 } });
    actual.minHealth = 99;
    expect(firstGateDifference(expected, actual)).toEqual({ tick: 20, field: 'rng[20].changed.combat' });
  });
  it('reports a late inserted RNG record at its own tick', () => {
    const expected = trace(), actual = trace(); expected.rng.push({ tick: 10, changed: { loot: 1 } });
    actual.rng.push({ tick: 10, changed: { loot: 1 } }, { tick: 85, changed: { combat: 2 } });
    expect(firstGateDifference(expected, actual)).toEqual({ tick: 85, field: 'rng[85]' });
  });
});
