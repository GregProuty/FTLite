import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { Contact, Outcome, placeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { endModel } from '../src/renderer/src/render/duel/endModel';
import { readoutHelp, readoutRows, READOUT_ROWS, READOUT_W, type ReadoutInput, type ReadoutMode } from '../src/renderer/src/render/duel/readoutModel';
import { PAD, textPx } from '../src/renderer/src/render/theme';
import { makeHostile } from './helpers/hostile';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

const layout = parseShip(cutter);
const pairs = (input: ReadoutInput) => readoutRows(input).map((r) => [r.label, r.value]);

describe('the duel readout (H-1 spec §7 item 9, §8)', () => {
  it('both hulls, both shields, the crew rooms and the enemy rooms; the other character status', () => {
    const d = createDuel(layout, 5);
    makeHostile(d.tactical); d.tactical.known[Contact.Enemy] = 2;
    d.tactical.systems[1].hull = 21; d.tactical.systems[1].rooms = [0, 2, 1]; d.tactical.systems[0].rooms[Room.Engines] = 1; d.tactical.systems[0].shields = 1;
    const rows = readoutRows({ duel: d, mode: 'helm', active: 0 });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
    // Weapons update spec §3: the Hunter's own hull (HUNTER_HULL 123), the crew's 70 (W-1: duel hull ×1.75 to hold the 180 s floor with the pew; 70 and 40 before, SIM_VERSION 54).
      ['HELM', ''], ['CUTTER', ''], ['HULL', '70/70'], ['SHIELD', ''], ['WEAPONS', 'OK'], ['SHIELDS', 'OK'], ['ENGINES', 'DMG 1'],
      ['HUNTER', ''], ['HULL', '21/123'], ['SHIELD', ''], ['ROOMS', 'W0 S2 E1'], ['HEALTH', '100/100'], ['P2', 'ON FOOT']
    ]);
    expect(rows[3]!.pips).toMatchObject({ n: 1, max: 2 }); expect(rows[9]!.pips).toMatchObject({ n: 2, max: 2 });
    disposeDuel(d);
  });
  for (const [lvl, head, hull, shield, rooms] of [[0, 'CONTACT', '?', null, '?'], [1, 'HUNTER', '123/123', 2, '? ? ?'], [2, 'HUNTER', '123/123', 2, 'W0 S0 E0']] as const) {   // W-1: duel hull ×1.75 to hold the 180 s floor with the pew (70/70 before)
    it(`the enemy rows at scan level ${lvl}: ${lvl === 2 ? 'everything' : lvl === 1 ? 'hull and shield, rooms hidden' : 'nothing but a CONTACT heading'}`, () => {
      const d = createDuel(layout, 5);
      makeHostile(d.tactical); d.tactical.known[Contact.Enemy] = lvl;
      const rows = readoutRows({ duel: d, mode: 'helm', active: 0 });
      expect(rows.length).toBe(13);
      expect(pairs({ duel: d, mode: 'helm', active: 0 }).slice(7, 11)).toEqual([[head, ''], ['HULL', hull], ['SHIELD', shield === null ? '?' : ''], ['ROOMS', rooms]]);
      const pips = rows[9]!.pips;
      if (shield === null) expect(pips === undefined || pips.n === 0).toBe(true); else expect(pips).toMatchObject({ n: shield });
      disposeDuel(d);
    });
  }
  it('the crew-ship heading comes from the layout id (Art-iv): HOUND for the Hound duel, CUTTER for the Cutter', () => {
    for (const [ship, name] of [[hound, 'HOUND'], [cutter, 'CUTTER']] as const) {
      const d = createDuel(parseShip(ship), 5);
      expect(readoutRows({ duel: d, mode: 'helm', active: 0 })[1]!.label).toBe(name);
      disposeDuel(d);
    }
  });
  it('repair progress is a bar on the damaged room row', () => {
    const d = createDuel(layout, 5);
    d.tactical.systems[0].rooms[Room.Shields] = 2; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    const row = readoutRows({ duel: d, mode: 'interior', active: 0 }).find((r) => r.label === 'SHIELDS')!;
    expect([row.value, row.bar?.fill]).toEqual(['DMG 2', 0.25]);
    disposeDuel(d);
  });
  it('Weapons and Engines at level 2 read OFFLINE, the laser CHARGE too; Shields at 2 stays DMG 2 (owner 2026-11-17)', () => {
    const d = createDuel(layout, 5, 0, 2, ShipClass.ValkyrnLaser), s = d.tactical.systems[0];   // W-4 spec §14.1: the beam's rule, on the laser fit
    s.rooms = [2, 2, 2]; s.laserCharge = LASER_CHARGE_UNITS;
    const w = pairs({ duel: d, mode: 'weapons', active: 1 });
    expect(w.slice(4, 7)).toEqual([['WEAPONS', 'OFFLINE'], ['SHIELDS', 'DMG 2'], ['ENGINES', 'OFFLINE']]);
    const charge = readoutRows({ duel: d, mode: 'weapons', active: 1 }).find((r) => r.label === 'CHARGE')!;
    expect([charge.value, charge.bar?.fill, charge.emphasis]).toEqual(['OFFLINE', 0, 'warn']);
    s.rooms = [1, 0, 1];
    expect(pairs({ duel: d, mode: 'weapons', active: 1 }).slice(4, 7)).toEqual([['WEAPONS', 'DMG 1'], ['SHIELDS', 'OK'], ['ENGINES', 'DMG 1']]);
    disposeDuel(d);
  });
  it('Weapons adds the lock, the charge bar (READY when full: the crew laser never vents, FTL targeting spec §2), and the magazine', () => {
    const d = createDuel(layout, 5, 0, 2, ShipClass.ValkyrnLaser), s = d.tactical.systems[0];   // W-4 spec §14.1: the beam's rule, on the laser fit
    s.laserCharge = LASER_CHARGE_UNITS / 2;
    let w = pairs({ duel: d, mode: 'weapons', active: 1 });
    expect(w.slice(11, 15)).toEqual([['LASER', ''], ['LOCK', 'SHIELDS'], ['CHARGE', '50%'], ['MAG', '4/4']]);
    s.laserCharge = LASER_CHARGE_UNITS;
    w = pairs({ duel: d, mode: 'weapons', active: 1 });
    expect(w[13]).toEqual(['CHARGE', 'READY']);
    disposeDuel(d);
  });
  it('standing, the strip tells about the ship outside: empty consoles, the enemy, an inbound torpedo', () => {
    const d = createDuel(layout, 5);
    stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence: 0 }, requestedTick: 0, command: { kind: 'presence', present: false } }, { runId: 'duel', id: { player: 0, sequence: 0 }, requestedTick: 0, command: { kind: 'stand' } }] });
    const [crew, enemy] = d.tactical.ships;
    Object.assign(enemy!, { x: crew!.x + 600, y: crew!.y });   // Engineering spike §10.4: seen, so the range and bearing show
    let out = pairs({ duel: d, mode: 'interior', active: 0 });
    expect(out.slice(11)).toEqual([
      ['HEALTH', '100/100'], ['P2', 'AWAY'], ['OUTSIDE', ''], ['HELM', 'EMPTY'], ['', 'COASTING'], ['WEAPONS', 'EMPTY'],
      ['ENEMY', String(Math.round(Math.hypot(enemy.x - crew.x, enemy.y - crew.y)))], ['BEARING', expect.stringMatching(/^\d{3}$/)]
    ]);
    placeMissile(d.tactical, 1, { x: crew.x + 500, y: crew.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    out = pairs({ duel: d, mode: 'interior', active: 0 });
    expect(out.at(-1)).toEqual(['TORPEDO INBOUND', '']);   // homing torpedo spec §3: on screen it is a torpedo
    disposeDuel(d);
  });
  it('the Weapons help names the torpedo and has nothing to steer (homing torpedo spec §3)', () => {
    const help = readoutHelp('weapons').join(' ');
    expect(help).toContain('F TORPEDO');
    expect(help).toContain('L-CLICK MAP PEW');   // W-1
    expect(help).not.toMatch(/STEER|MISSILE/);
  });
  it('the interior help names the zoom, the drag and C (interior zoom spec rule 6)', () => {
    expect(readoutHelp('interior')).toContain('WHEEL ZOOM  DRAG PAN  C FOLLOW');
  });
  it('every row and help line fits the 220-px column', () => {
    const d = createDuel(layout, 5, 0, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    d.tactical.systems[0].rooms = [2, 2, 2]; d.tactical.systems[0].laserCharge = LASER_CHARGE_UNITS; placeMissile(d.tactical, 0, { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    placeMissile(d.tactical, 1, { ...d.tactical.ships[0], heading: 0, headingAcc: 0, age: 0 });
    for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) {
      const rows = readoutRows({ duel: d, mode, active: 0 });
      expect(rows.length).toBeLessThanOrEqual(READOUT_ROWS);
      for (const r of rows) expect(textPx(r.label) + 6 + (r.pips ? 32 : textPx(r.value)), `${mode} ${r.label} ${r.value}`).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
      for (const line of readoutHelp(mode)) expect(textPx(line, 1), line).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
    }
    disposeDuel(d);
  });
});

describe('the end screen (H-1 spec §4 End)', () => {
  it('names the outcome, the duel length and the next seed', () => {
    expect(endModel(Outcome.Running, 100, 'ENTER: REMATCH')).toBeNull();
    expect(endModel(Outcome.CrewWins, 83 * 60 + 30, 'ENTER: REMATCH')).toMatchObject({ title: 'VICTORY', length: 'DUEL LENGTH 1:23', prompt: 'ENTER: REMATCH' });
    expect(endModel(Outcome.EnemyWins, 60, 'ENTER: REMATCH')!.title).toBe('DEFEAT');
    expect(endModel(Outcome.CrewWins, 60, 'ENTER: REMATCH   ESC: LEAVE')!.prompt).toBe('ENTER: REMATCH   ESC: LEAVE');   // online (H-2 spec §7)
    expect(endModel(Outcome.Draw, 60, 'ENTER: REMATCH')!.title).toBe('BOTH SHIPS LOST');
  });
});
