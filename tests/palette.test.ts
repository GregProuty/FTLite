import { describe, it, expect } from 'vitest';
import data from '../src/renderer/src/render/palette.json';
import { PALETTE, RAMPS, ROLE, ROLES, hexToNumber, parsePalette } from '../src/renderer/src/render/palette';

describe('the house palette (Art-i spec section 4)', () => {
  it('holds 32 to 48 distinct colours', () => {
    expect(PALETTE.colours.length).toBeGreaterThanOrEqual(32); expect(PALETTE.colours.length).toBeLessThanOrEqual(48);
    expect(new Set(PALETTE.colours).size).toBe(PALETTE.colours.length);
  });
  it('defines every role the spec names, and every role colour is in colours', () => {
    expect(ROLES).toEqual(['background', 'floor', 'floorSeam', 'wall', 'wallLight', 'wallShadow', 'doorFill', 'doorOutline', 'space', 'ambient', 'alert', 'vacuum',
      'flash', 'lampOn', 'lampOff', 'screenA', 'screenB', 'lowO2', 'impact', 'doorSealed', 'heldTick', 'spaceGap', 'fireFallback', 'breach', 'airlockOutline', 'ventSpeck', 'failed']);
    const colours = new Set(PALETTE.colours);
    for (const r of ROLES) expect(colours.has(ROLE[r]), r).toBe(true);
    expect(Object.keys(data.roles).sort()).toEqual([...ROLES].sort());
  });
  it('defines the four ramps, 5 to 8 colours each, every colour in colours', () => {
    expect(RAMPS).toEqual(['fire', 'plasma', 'electric', 'vent']);
    const colours = new Set(PALETTE.colours);
    for (const name of RAMPS) {
      const ramp = PALETTE.ramps[name];
      expect(ramp.length, name).toBeGreaterThanOrEqual(5); expect(ramp.length, name).toBeLessThanOrEqual(8);
      for (const c of ramp) expect(colours.has(c), `${name} ${c.toString(16)}`).toBe(true);
    }
  });
  it('keeps the placeholder close to the pre-Art-i look', () => {
    expect(ROLE.floor).toBe(hexToNumber('#c7cfcc')); expect(ROLE.wall).toBe(hexToNumber('#394a50')); expect(ROLE.doorFill).toBe(hexToNumber('#de9e41'));
  });
  it('rejects a role colour outside colours, a missing role, an unknown role, a short ramp and a bad hex', () => {
    const good = structuredClone(data);
    expect(() => parsePalette({ ...good, roles: { ...good.roles, floor: '#123456' } })).toThrow(/role floor #123456 is not in colours/);
    const { wall: _wall, ...noWall } = good.roles;
    expect(() => parsePalette({ ...good, roles: noWall })).toThrow(/role wall is missing/);
    expect(() => parsePalette({ ...good, roles: { ...good.roles, extra: '#ebede9' } })).toThrow(/unknown role extra/);
    expect(() => parsePalette({ ...good, ramps: { ...good.ramps, vent: ['#ebede9'] } })).toThrow(/ramp vent has 1 colours/);
    expect(() => hexToNumber('ebede9')).toThrow(/#rrggbb/);
    expect(hexToNumber('#ebede9')).toBe(15461865);
  });
});
