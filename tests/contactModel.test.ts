// Enemy ship window spec §4.2, §6.4; Sci-1 spec §7.2: the contact window's view model by contact and level: the unknown
// contact, the enemy at Level 1 (rooms outlined, labels ?, no damage) and Level 2 (today's window plus the readings),
// the derelict, Science with nothing selected.
import { describe, expect, it } from 'vitest';
import { contactModel, type ContactModelInput, type ContactView } from '../src/renderer/src/render/duel/contactModel';
import { CONTACT_BOX } from '../src/renderer/src/render/duel/consoleLayout';
import { blink, CRT, DAMAGE_BLINK_HZ, roomLook } from '../src/renderer/src/render/tactical/crtTheme';
import { derelictPos } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, Loot, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { TEXT } from '../src/renderer/src/render/theme';

const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const model = (state: TacticalState, over: Partial<ContactModelInput> = {}): ContactView | null =>
  contactModel({ state, contact: 0, aim: false, station: 'weapons', t: 0, weapons: { charge }, ...over });
const known = (level: number): TacticalState => { const st = createTacticalState(4); st.known[0] = level; return st; };
const pointsOf = (v: ContactView): number[] => [...v.outline, ...v.rooms.flatMap((r) => [...r.points, ...(r.hatch?.segments ?? []), r.centre.x, r.centre.y])];

describe('the enemy at Level 2 (enemy ship window spec §4.2)', () => {
  it('the title, the shields and hull, the box and the room labels', () => {
    const st = known(2); st.systems[1].shields = 1; st.systems[1].hull = 10;
    const v = model(st)!, cls = classOf(st, 1);
    expect([v.contact, v.title]).toEqual([0, 'ENEMY SHIP']);
    expect(v.shields).toEqual({ up: 1, of: cls.shields.layers });
    expect(v.hull).toEqual({ value: 10, fill: 10 / cls.hull });
    expect(v.box).toEqual(CONTACT_BOX);
    expect(v.rooms.map((r) => r.label)).toEqual(['WEAP', 'SHLD', 'ENG']);
  });
  it('the outline, rooms, hatch and centres lie inside the box with 8 px padding; the outline fills one axis', () => {
    const st = known(2); st.systems[1].rooms = [1, 1, 1];
    const v = model(st)!, b = v.box, pts = pointsOf(v);
    for (let k = 0; k < pts.length; k += 2) {
      expect(pts[k]!, `x ${k}`).toBeGreaterThanOrEqual(b.x + 8 - 1e-9); expect(pts[k]!, `x ${k}`).toBeLessThanOrEqual(b.x + b.w - 8 + 1e-9);
      expect(pts[k + 1]!, `y ${k}`).toBeGreaterThanOrEqual(b.y + 8 - 1e-9); expect(pts[k + 1]!, `y ${k}`).toBeLessThanOrEqual(b.y + b.h - 8 + 1e-9);
    }
    const xs = v.outline.filter((_, k) => k % 2 === 0), ys = v.outline.filter((_, k) => k % 2 === 1);
    expect(Math.max(Math.max(...xs) - Math.min(...xs) - (b.w - 16), Math.max(...ys) - Math.min(...ys) - (b.h - 16))).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeGreaterThan(v.rooms[0]!.centre.x);   // nose right: Weapons (forward) is right of Engines
    expect(v.rooms[0]!.centre.x).toBeGreaterThan(v.rooms[2]!.centre.x);
  });
  it('each room\'s look is roomLook(false, level, phase) in both blink phases; the lock room is the crew laser\'s target', () => {
    const st = known(2); st.systems[1].rooms = [0, 1, 2]; st.systems[0].lock = 2; st.systems[0].laserTargeted = true;
    expect([0, 0.3].map((t) => blink(t, DAMAGE_BLINK_HZ))).toEqual([0, 1]);
    for (const t of [0, 0.3]) {
      const v = model(st, { t })!, phase = blink(t, DAMAGE_BLINK_HZ);
      v.rooms.forEach((r, k) => {
        if (r.hatch) { expect(r.hatch.segments.length).toBeGreaterThan(0); expect(r.hatch.segments.length % 4).toBe(0); }
        const look = roomLook(false, k as 0 | 1 | 2, phase);
        expect({ fill: r.fill, stroke: r.stroke, hatch: r.hatch?.colour ?? null }, `room ${k} at ${t}`).toEqual({ fill: look.fill, stroke: look.stroke, hatch: look.hatch });
      });
      expect(v.lockRoom).toBe(2);
    }
  });
  it('Weapons: LASER is the station\'s charge row, lit while armed; MISSILE the magazine. The Helm: no weapon list, no aim', () => {
    const st = known(2), v = model(st, { aim: true })!;
    expect(v.weapons).toEqual({ laser: { label: 'CHARGE', value: '40%', fill: 0.4, lit: true, enabled: true, note: null }, missile: { magazine: st.systems[0].magazine, lit: false } });
    expect([v.aim, v.aimWeapon]).toEqual([true, 'laser']);
    const torp = model(st, { aim: true, weapon: 'torpedo' })!;   // FTL targeting spec §1: the torpedo picked up
    expect([torp.weapons!.laser.lit, torp.weapons!.missile.lit, torp.aimWeapon]).toEqual([false, true, 'torpedo']);
    const h = model(st, { station: 'helm', weapons: null, aim: true })!;
    expect([h.weapons, h.aim, h.aimWeapon]).toEqual([null, false, null]);
  });
  it('FTL targeting spec §1: the target marks are the laser target (only while it has one) and the torpedo target, at Level 1 too', () => {
    const st = known(1);
    expect([model(st)!.lockRoom, model(st)!.torpRoom]).toEqual([null, null]);
    st.systems[0].lock = 0; st.systems[0].laserTargeted = true; st.systems[0].torpLock = 2;
    expect([model(st)!.lockRoom, model(st)!.torpRoom]).toEqual([0, 2]);
    st.systems[0].laserTargeted = false;
    expect(model(st)!.lockRoom).toBeNull();
  });
  it('the readings: the weak frequency, the enemy laser\'s charge, TORPEDO READY or RELOADING; SCANNED', () => {
    const st = known(2); st.hostileAt = 0; st.tick = 1000;   // hostile long ago: no hostility line
    st.weakFreq = 1; st.systems[1].laserCharge = classOf(st, 1).slots.laser.chargeUnits / 2;
    const v = model(st)!;
    expect(v.lines).toEqual([{ text: 'WEAK FREQ B', tint: CRT.main, bar: null }, { text: 'ENEMY LASER', tint: CRT.main, bar: 0.5 }, { text: 'TORPEDO READY', tint: CRT.main, bar: null }]);
    expect(v.scan).toEqual({ label: 'SCANNED', enabled: false, progress: null });
    st.systems[1].magazine = 0;
    expect(model(st)!.lines[2]!.text).toBe('RELOADING');
  });
});

describe('the enemy below Level 2 (Sci-1 spec §7.2)', () => {
  it('Level 0: UNKNOWN CONTACT, no drawing, no weapon list, SCAN 1 (SLOW) at Weapons', () => {
    expect(model(known(0))).toMatchObject({ contact: 0, title: 'UNKNOWN CONTACT', shields: null, hull: null, outline: [], rooms: [], lockRoom: null, weapons: null, aim: false,
      scan: { label: 'SCAN 1 (SLOW)', enabled: true, progress: null }, lines: [] });
  });
  it('Level 1 on the Weapons station: the weapon block is present and the aim passes through (spec §7.2)', () => {
    const v = model(known(1), { aim: true })!;
    expect(v.weapons).not.toBeNull(); expect(v.aim).toBe(true);
  });
  it('Level 1: the outline with ? labels and no damage looks, no lock mark; pips, hull, the hostility line; SCAN 2', () => {
    const st = known(1); st.systems[1].rooms = [2, 2, 2]; st.tick = 600;
    const v = model(st, { station: 'science', weapons: null })!;
    expect(v.rooms.map((r) => r.label)).toEqual(['?', '?', '?']);
    for (const r of v.rooms) expect({ fill: r.fill, stroke: r.stroke, hatch: r.hatch }).toEqual({ fill: roomLook(false, 0, 0).fill, stroke: roomLook(false, 0, 0).stroke, hatch: null });
    expect([v.lockRoom, v.shields !== null, v.hull !== null]).toEqual([null, true, true]);
    expect(v.lines).toEqual([{ text: 'HOSTILE IN 20 s', tint: CRT.main, bar: null }]);   // rt 600 of the 1800-tick hold
    expect(v.scan).toEqual({ label: 'SCAN 2', enabled: true, progress: null });
  });
  it('null for an inactive enemy', () => {
    const st = known(2); st.ships[1].active = false;
    expect(model(st)).toBeNull();
  });
});

describe('the derelict and no selection (Sci-1 spec §7.2, §7.3)', () => {
  it('Level 0: UNKNOWN CONTACT and SCAN 1; Level 1: DERELICT with its loot, TRAPPED blinking, the range and the hint with the hold', () => {
    const st = createTacticalState(4);
    expect(model(st, { contact: 1, station: 'science', weapons: null })).toMatchObject({ contact: 1, title: 'UNKNOWN CONTACT', scan: { label: 'SCAN 1' }, weapons: null });
    st.known[1] = 1; Object.assign(st.derelict, { loot: Loot.Shield, trapped: true, salvage: 150, salvaged: false });
    const p = derelictPos(st), range = Math.round(Math.hypot(p.x - st.ships[0].x, p.y - st.ships[0].y) / 10) * 10;
    const v = model(st, { contact: 1, station: 'helm', weapons: null, t: 0.3 })!;
    expect([v.title, v.shields, v.hull, v.outline, v.weapons]).toEqual(['DERELICT', null, null, [], null]);
    expect(v.lines).toEqual([
      { text: 'LOOT SHIELD', tint: CRT.main, bar: null }, { text: 'TRAPPED', tint: CRT.hot, bar: null },
      { text: `RANGE ${range}`, tint: CRT.main, bar: null }, { text: 'CLOSE TO 60, MATCH SPEED', tint: CRT.mid, bar: 0.5 }
    ]);
    expect(model(st, { contact: 1, station: 'helm', weapons: null, t: 0 })!.lines[1]!.tint).toBe(CRT.main);   // the other blink phase
    expect(v.scan).toEqual({ label: 'SCANNED', enabled: false, progress: null });
    st.derelict.salvaged = true;
    expect(model(st, { contact: 1, station: 'helm', weapons: null })!.lines.map((l) => l.text)).toEqual(['SALVAGED', `RANGE ${range}`]);
  });
  it('Science with nothing selected: NO CONTACT SELECTED; Helm and Weapons with nothing: no window', () => {
    expect(model(createTacticalState(4), { contact: null, station: 'science', weapons: null })).toMatchObject({ contact: null, title: 'NO CONTACT SELECTED', scan: null, lines: [], rooms: [] });
    expect(model(createTacticalState(4), { contact: null })).toBeNull();
  });
});
