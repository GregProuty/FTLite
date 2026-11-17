// Enemy ship window spec §4.2, §6.4, §8: the contact window's view model.
import { describe, expect, it } from 'vitest';
import { contactModel, type ContactModelInput, type ContactView } from '../src/renderer/src/render/duel/contactModel';
import { CONTACT_BOX } from '../src/renderer/src/render/duel/consoleLayout';
import { blink, DAMAGE_BLINK_HZ, roomLook } from '../src/renderer/src/render/tactical/crtTheme';
import { classOf, createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { TEXT } from '../src/renderer/src/render/theme';

const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const model = (state: TacticalState, over: Partial<ContactModelInput> = {}): ContactView | null =>
  contactModel({ state, ship: 1, aim: false, station: 'weapons', t: 0, weapons: { charge }, ...over });
const pointsOf = (v: ContactView): number[] => [...v.outline, ...v.rooms.flatMap((r) => [...r.points, ...(r.hatch?.segments ?? []), r.centre.x, r.centre.y])];

describe('the contact view (spec §4.2)', () => {
  it('the title, the shown ship\'s shields and hull, the box and the room labels', () => {
    const st = createTacticalState(4); st.systems[1].shields = 1; st.systems[1].hull = 10;
    const v = model(st)!, cls = classOf(st, 1);
    expect(v.title).toBe('ENEMY SHIP');
    expect(v.shields).toEqual({ up: 1, of: cls.shields.layers });
    expect(v.hull).toEqual({ value: 10, fill: 10 / cls.hull });
    expect(v.box).toEqual(CONTACT_BOX);
    expect(v.rooms.map((r) => r.label)).toEqual(['WEAP', 'SHLD', 'ENG']);
  });
  it('the outline, rooms, hatch and centres lie inside the box with 8 px padding; the outline fills one axis', () => {
    const st = createTacticalState(4); st.systems[1].rooms = [1, 1, 1];
    const v = model(st)!, b = v.box, pts = pointsOf(v);
    for (let k = 0; k < pts.length; k += 2) {
      expect(pts[k]!, `x ${k}`).toBeGreaterThanOrEqual(b.x + 8 - 1e-9); expect(pts[k]!, `x ${k}`).toBeLessThanOrEqual(b.x + b.w - 8 + 1e-9);
      expect(pts[k + 1]!, `y ${k}`).toBeGreaterThanOrEqual(b.y + 8 - 1e-9); expect(pts[k + 1]!, `y ${k}`).toBeLessThanOrEqual(b.y + b.h - 8 + 1e-9);
    }
    const xs = v.outline.filter((_, k) => k % 2 === 0), ys = v.outline.filter((_, k) => k % 2 === 1);
    const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
    expect(Math.max(spanX - (b.w - 16), spanY - (b.h - 16))).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeGreaterThan(v.rooms[0]!.centre.x);   // nose right: Weapons (forward) is right of Engines
    expect(v.rooms[0]!.centre.x).toBeGreaterThan(v.rooms[2]!.centre.x);
  });
  it('each room\'s fill, stroke and hatch colour is roomLook(false, level, phase) in both blink phases', () => {
    const st = createTacticalState(4); st.systems[1].rooms = [0, 1, 2];
    const phases = [0, 0.3].map((t) => blink(t, DAMAGE_BLINK_HZ));
    expect(phases).toEqual([0, 1]);
    for (const t of [0, 0.3]) {
      const v = model(st, { t })!, phase = blink(t, DAMAGE_BLINK_HZ);
      v.rooms.forEach((r, k) => {
        const look = roomLook(false, k as 0 | 1 | 2, phase);
        expect({ fill: r.fill, stroke: r.stroke }, `room ${k} at ${t}`).toEqual({ fill: look.fill, stroke: look.stroke });
        expect(r.hatch?.colour ?? null, `hatch ${k} at ${t}`).toBe(look.hatch);
        if (r.hatch) { expect(r.hatch.segments.length).toBeGreaterThan(0); expect(r.hatch.segments.length % 4).toBe(0); }
      });
    }
  });
  it('the lock room shows only while the shown ship is the crew laser\'s target slot', () => {
    const st = createTacticalState(4, 3); st.ships[2]!.active = true; st.systems[0].lock = 2;
    expect(model(st)!.lockRoom).toBe(2);
    expect(model(st, { ship: 2 })!.lockRoom).toBeNull();
  });
  it('the Helm gets no weapon list and no aim', () => {
    const v = model(createTacticalState(4), { station: 'helm', weapons: null, aim: true })!;
    expect(v.weapons).toBeNull(); expect(v.aim).toBe(false);
  });
  it('Weapons: LASER is the station\'s charge row, lit while armed; MISSILE is the magazine', () => {
    const st = createTacticalState(4), v = model(st, { aim: true })!;
    expect(v.weapons).toEqual({ laser: { label: 'CHARGE', value: '40%', fill: 0.4, lit: true, enabled: true, note: null }, missile: { magazine: st.systems[0].magazine } });
    expect(v.aim).toBe(true);
  });
  it('a ship that is not the laser\'s target: LASER disabled, NOT TARGETED', () => {
    const st = createTacticalState(4, 3); st.ships[2]!.active = true;
    expect(model(st, { ship: 2 })!.weapons!.laser).toMatchObject({ enabled: false, note: 'NOT TARGETED' });
  });
  it('null for an inactive ship', () => {
    const st = createTacticalState(4, 3);
    expect(model(st, { ship: 2 })).toBeNull();
    st.ships[1].active = false;
    expect(model(st)).toBeNull();
  });
});
