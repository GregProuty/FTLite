import { describe, it, expect } from 'vitest';
import { buildHudModel, threatTint } from '../src/renderer/src/render/hudModel';
import { TEXT, WARN } from '../src/renderer/src/render/theme';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { NodeType } from '../src/renderer/src/sim/run';
import { makeState, quiet, mapM, setEvent, setNodeTypes, room } from './helpers/sim';

/** Event colour in the threats panel (spec Demo-xii section 5): the run rows read in the text colour, the hazards in warning red. */
const slots = [{ status: 'active' as const, key: 'kb:0' }, { status: 'active' as const, key: 'kb:1' }];
describe('R5: the threats panel colours', () => {
  it('Event and Shop here rows use TEXT; a fire stays WARN', () => {
    const s = makeState(2); quiet(s); mapM(s); s.run.column = 1; s.run.node = 2; setEvent(s, 4); igniteRoom(s, room(s, 'A')); setNodeTypes(s, { '1:2': NodeType.Shop });
    const t = buildHudModel(s, slots, 'running', '').threats, tint = (prefix: string) => threatTint(t.find((x) => x.text.startsWith(prefix))!);
    expect(tint('Event: ')).toBe(TEXT); expect(tint('Shop here')).toBe(TEXT); expect(tint('Fire: ')).toBe(WARN);
  });
});
