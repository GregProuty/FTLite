// The readout's emphasis (CRT map spec section 2): every row readoutRows builds (Task 3), and how the CRT panel draws it (Task 6).
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { Contact, placeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';
import { readoutRows, type ReadoutRow } from '../src/renderer/src/render/duel/readoutModel';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import { crtRowLook } from '../src/renderer/src/ui/duel/ReadoutPanel';

const layout = parseShip(hound);
const marks = (rows: readonly ReadoutRow[]) => rows.map((r) => [r.label || r.value, r.emphasis ?? '-']);

describe('readoutRows emphasis (CRT map spec section 2)', () => {
  it('helm, healthy: the crew heading and pips crew, rooms good, the HUNTER heading, pips and nothing else enemy', () => {
    const d = createDuel(layout, 5);
    d.tactical.known[Contact.Enemy] = 2;   // the full enemy rows are what this test is about
    expect(marks(readoutRows({ duel: d, mode: 'helm', active: 0, other: 'AT WEAPONS' }))).toEqual([
      ['HELM', '-'], ['HOUND', 'crew'], ['HULL', '-'], ['SHIELD', 'crew'], ['WEAPONS', 'good'], ['SHIELDS', 'good'], ['ENGINES', 'good'],
      ['HUNTER', 'enemy'], ['HULL', '-'], ['SHIELD', 'enemy'], ['ROOMS', '-'], ['HEALTH', '-'], ['OTHER', '-'], ['AT WEAPONS', '-']
    ]);
    disposeDuel(d);
  });
  it('helm, hurt: own low hull alert, damaged rooms warn (with the repair bar), enemy low hull good, enemy rooms warn', () => {
    const d = createDuel(layout, 5), s = d.tactical.systems;
    d.tactical.known[Contact.Enemy] = 2;
    s[0].hull = SHIP_HULL / 4; s[0].rooms = [1, 2, 0]; d.repair[Room.Shields] = REPAIR_UNITS / 2; s[1].hull = SHIP_HULL / 4; s[1].rooms = [0, 0, 1];
    const rows = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'AT WEAPONS' });
    expect(marks(rows)).toEqual([
      ['HELM', '-'], ['HOUND', 'crew'], ['HULL', 'alert'], ['SHIELD', 'crew'], ['WEAPONS', 'warn'], ['SHIELDS', 'warn'], ['ENGINES', 'good'],
      ['HUNTER', 'enemy'], ['HULL', 'good'], ['SHIELD', 'enemy'], ['ROOMS', 'warn'], ['HEALTH', '-'], ['OTHER', '-'], ['AT WEAPONS', '-']
    ]);
    expect(rows[5]!.value).toBe('DMG 2'); expect(rows[5]!.bar?.fill).toBe(0.5);
    disposeDuel(d);
  });
  it('weapons: LASER heading plain, LOCK enemy, CHARGE good only when full and no missile flies, MAG plain', () => {
    const d = createDuel(layout, 5), s = d.tactical.systems[0];
    const tail = (): (string | undefined)[][] => marks(readoutRows({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' })).slice(11, 15);
    expect(tail()).toEqual([['LASER', '-'], ['LOCK', 'enemy'], ['CHARGE', '-'], ['MAG', '-']]);
    s.laserCharge = LASER_CHARGE_UNITS; expect(tail()[2]).toEqual(['CHARGE', 'good']);
    placeMissile(d.tactical, 0, { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 }); expect(tail()[2]).toEqual(['CHARGE', '-']);
    disposeDuel(d);
  });
  it('interior: EMPTY, COASTING and MISSILE INBOUND are alert (they keep their tints: the interior has no CRT)', () => {
    const d = createDuel(layout, 5), t = d.tactical, c = t.ships[0];
    d.interior.stations.occupant[d.nav] = -1; d.interior.stations.occupant[d.weapons] = -1;
    placeMissile(t, 1, { x: c.x + 100, y: c.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    const rows = readoutRows({ duel: d, mode: 'interior', active: 0, other: 'WALKING' });
    expect(marks(rows).slice(14)).toEqual([['OUTSIDE', '-'], ['HELM', 'alert'], ['COASTING', 'alert'], ['WEAPONS', 'alert'], ['ENEMY', '-'], ['BEARING', '-'], ['MISSILE INBOUND', 'alert']]);
    disposeDuel(d);
  });
});

describe('the CRT row look (CRT map spec section 2)', () => {
  const r = (patch: Partial<ReadoutRow>): ReadoutRow => ({ label: 'HULL', value: '10/40', labelTint: 1, valueTint: 2, ...patch });
  it('labels mid and values main; a heading main', () => {
    expect(crtRowLook(r({}), 0)).toMatchObject({ label: CRT.mid, value: CRT.main, inverse: null, bar: CRT.main });
    expect(crtRowLook(r({ label: 'LASER', value: '' }), 0)).toMatchObject({ label: CRT.main, inverse: null });
  });
  it('good and warn: hot text and a hot bar, never dimmer than a plain value', () => {
    for (const e of ['good', 'warn'] as const) expect(crtRowLook(r({ emphasis: e }), 0)).toMatchObject({ value: CRT.hot, bar: CRT.hot, inverse: null });
  });
  it('alert: the value on an inverse bar (glass text) alternating main and hot at 2 Hz; an alert heading inverts its label', () => {
    expect(crtRowLook(r({ emphasis: 'alert' }), 0)).toMatchObject({ inverse: 'value', value: CRT.glass, block: CRT.main });
    expect(crtRowLook(r({ emphasis: 'alert' }), 0.3)).toMatchObject({ inverse: 'value', value: CRT.glass, block: CRT.hot });
    expect(crtRowLook(r({ label: 'MISSILE INBOUND', value: '', emphasis: 'alert' }), 0)).toMatchObject({ inverse: 'label', label: CRT.glass });
  });
  it('enemy: the HUNTER heading and the LOCK value on a main inverse bar; enemy pips stay text-free (hollow pips)', () => {
    expect(crtRowLook(r({ label: 'HUNTER', value: '', emphasis: 'enemy' }), 0)).toMatchObject({ inverse: 'label', label: CRT.glass, block: CRT.main });
    expect(crtRowLook(r({ label: 'LOCK', value: 'SHIELDS', emphasis: 'enemy' }), 0)).toMatchObject({ inverse: 'value', value: CRT.glass, block: CRT.main });
    expect(crtRowLook(r({ label: 'SHIELD', value: '', pips: { n: 1, max: 2, colour: 0 }, emphasis: 'enemy' }), 0)).toMatchObject({ inverse: null, label: CRT.mid });
  });
  it('crew: the crew heading main text, no bar', () => {
    expect(crtRowLook(r({ label: 'HOUND', value: '', emphasis: 'crew' }), 0)).toMatchObject({ label: CRT.main, inverse: null });
  });
});

