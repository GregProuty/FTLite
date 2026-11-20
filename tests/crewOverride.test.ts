// Net-4a §3.6: where a character is drawn: an overridden one (another player online) blended from its confirmed
// previous to its confirmed latest position by the gap alpha; any other from crewPrev by the view's alpha.
import { describe, expect, it } from 'vitest';
import { crewDrawAt, crewPresentation, type CrewOverride } from '../src/renderer/src/render/duel/crewOverride';

const o: CrewOverride = { at: [null, { x: 4, y: 2 }], prev: [null, { x: 2, y: 2 }], alpha: 0.25 };
describe('crew override (Net-4a §3.6)', () => {
  it('an overridden character blends its confirmed positions by the gap alpha, ignoring the predicted ones', () => {
    expect(crewDrawAt(1, 9, 9, [{ x: 0, y: 0 }, { x: 0, y: 0 }], 0.9, o)).toEqual({ x: 2.5, y: 2 });
  });
  it('this seat\'s own character blends crewPrev to the predicted position by the view alpha', () => {
    expect(crewDrawAt(0, 3, 1, [{ x: 1, y: 1 }], 0.5, o)).toEqual({ x: 2, y: 1 });
    expect(crewDrawAt(0, 3, 1, [], 0.5, null)).toEqual({ x: 3, y: 1 });
  });
  it('gives the crew layer a presentation point for each overridden character only', () => {
    expect(crewPresentation(o)).toEqual([{ id: 'crew:1', x: 2.5, y: 2, generation: 'online' }]);
    expect(crewPresentation(null)).toBeUndefined();
  });
});
