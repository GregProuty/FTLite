import { expect, it } from 'vitest';
import { makeState } from './helpers/sim';
import { flatten, unflatten, canonicalFields } from '../src/renderer/src/sim/flatten';
import { Position } from '../src/renderer/src/sim/components';
import { disposeSimState } from '../src/renderer/src/sim/state';
it('canonical access observes replaced records, typed arrays, targets and each live world', () => {
  const a = makeState(2), b = makeState(2);
  flatten(a); flatten(b); // Warm the shared layout access plan before changing owned storage.
  a.rooms = { ...a.rooms, fire: Float64Array.from(a.rooms.fire, (_, i) => i / 10) };
  a.run = { ...a.run, scrap: 27 };
  a.weapons.target = { kind: 'object', stableId: 99 };
  Position.x[a.crew[0]!] = 3.25; Position.x[b.crew[0]!] = 4.75;
  const fields = canonicalFields(a.layout, 2), offset = (name: string) => fields.find(f => f.name === name)!.offset;
  const values = flatten(a);
  expect(Array.from(values.slice(offset('rooms.fire'), offset('rooms.fire') + a.rooms.fire.length))).toEqual(Array.from(a.rooms.fire));
  expect(values[offset('run.scrap')]).toBe(27); expect(values[offset('weapons.$targetId')]).toBe(99);
  expect(values[offset('crew.0.x')]).toBe(3.25); expect(flatten(b)[offset('crew.0.x')]).toBe(4.75);
  b.rooms = { ...b.rooms, fire: new Float64Array(b.rooms.fire.length) };
  unflatten(b, values);
  expect(b.run.scrap).toBe(27); expect(b.rooms.fire).toEqual(a.rooms.fire);
  expect(Position.x[b.crew[0]!]).toBe(3.25); expect(b.weapons.target).toEqual({ kind: 'object', stableId: 99 });
  expect(flatten(b)).toEqual(values);
});
it('canonical access follows recycled ECS ownership after disposal', () => {
  const previous = makeState(2); Position.x[previous.crew[0]!] = 13.25; flatten(previous);
  disposeSimState(previous);
  const replacement = makeState(2), field = canonicalFields(replacement.layout, 2).find(f => f.name === 'crew.0.x')!;
  expect(flatten(replacement)[field.offset]).toBe(replacement.layout.spawns[0]![0] + .5);
});
it('restoring unchanged values still restores the sign of zero exactly', () => {
  const state = makeState(2), values = flatten(state), offset = canonicalFields(state.layout, 2).find(f => f.name === 'rooms.fire')!.offset;
  state.rooms.fire[0] = -0; unflatten(state, values); expect(Object.is(state.rooms.fire[0], -0)).toBe(false);
  values[offset] = -0; unflatten(state, values); expect(Object.is(state.rooms.fire[0], -0)).toBe(true);
});
