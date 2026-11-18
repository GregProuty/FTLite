import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { Outcome, placeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { endModel } from '../src/renderer/src/render/duel/endModel';
import { readoutHelp, readoutRows, READOUT_ROWS, READOUT_W, type ReadoutInput, type ReadoutMode } from '../src/renderer/src/render/duel/readoutModel';
import { PAD, textPx } from '../src/renderer/src/render/theme';

const layout = parseShip(cutter);
const pairs = (input: ReadoutInput) => readoutRows(input).map((r) => [r.label, r.value]);

describe('the duel readout (H-1 spec §7 item 9, §8)', () => {
  it('both hulls, both shields, the crew rooms and the enemy rooms; the other character status', () => {
    const d = createDuel(layout, 5);
    d.tactical.systems[1].hull = 21; d.tactical.systems[1].rooms = [0, 2, 1]; d.tactical.systems[0].rooms[Room.Engines] = 1; d.tactical.systems[0].shields = 1;
    const rows = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'AT WEAPONS' });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['HELM', ''], ['CUTTER', ''], ['HULL', '40/40'], ['SHIELD', ''], ['WEAPONS', 'OK'], ['SHIELDS', 'OK'], ['ENGINES', 'DMG 1'],
      ['HUNTER', ''], ['HULL', '21/40'], ['SHIELD', ''], ['ROOMS', 'W0 S2 E1'], ['HEALTH', '100/100'], ['OTHER', 'PRESENT'], ['', 'AT WEAPONS']
    ]);
    expect(rows[3]!.pips).toMatchObject({ n: 1, max: 2 }); expect(rows[9]!.pips).toMatchObject({ n: 2, max: 2 });
    disposeDuel(d);
  });
  it('the crew-ship heading comes from the layout id (Art-iv): HOUND for the Hound duel, CUTTER for the Cutter', () => {
    for (const [ship, name] of [[hound, 'HOUND'], [cutter, 'CUTTER']] as const) {
      const d = createDuel(parseShip(ship), 5);
      expect(readoutRows({ duel: d, mode: 'helm', active: 0, other: 'AT WEAPONS' })[1]!.label).toBe(name);
      disposeDuel(d);
    }
  });
  it('repair progress is a bar on the damaged room row', () => {
    const d = createDuel(layout, 5);
    d.tactical.systems[0].rooms[Room.Shields] = 2; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    const row = readoutRows({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' }).find((r) => r.label === 'SHIELDS')!;
    expect([row.value, row.bar?.fill]).toEqual(['DMG 2', 0.25]);
    disposeDuel(d);
  });
  it('Weapons and Engines at level 2 read OFFLINE, the laser CHARGE too; Shields at 2 stays DMG 2 (owner 2026-11-17)', () => {
    const d = createDuel(layout, 5), s = d.tactical.systems[0];
    s.rooms = [2, 2, 2]; s.laserCharge = LASER_CHARGE_UNITS;
    const w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w.slice(4, 7)).toEqual([['WEAPONS', 'OFFLINE'], ['SHIELDS', 'DMG 2'], ['ENGINES', 'OFFLINE']]);
    const charge = readoutRows({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' }).find((r) => r.label === 'CHARGE')!;
    expect([charge.value, charge.bar?.fill, charge.emphasis]).toEqual(['OFFLINE', 0, 'warn']);
    s.rooms = [1, 0, 1];
    expect(pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' }).slice(4, 7)).toEqual([['WEAPONS', 'DMG 1'], ['SHIELDS', 'OK'], ['ENGINES', 'DMG 1']]);
    disposeDuel(d);
  });
  it('Weapons adds the lock, the charge bar and hold timer, and the magazine', () => {
    const d = createDuel(layout, 5), s = d.tactical.systems[0];
    s.laserCharge = LASER_CHARGE_UNITS / 2;
    let w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w.slice(11, 15)).toEqual([['LASER', ''], ['LOCK', 'SHIELDS'], ['CHARGE', '50%'], ['MAG', '4/4']]);
    s.laserCharge = LASER_CHARGE_UNITS; s.laserHold = 60;
    w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w[13]).toEqual(['CHARGE', 'HOLD 2.0']);
    disposeDuel(d);
  });
  it('standing, the strip tells about the ship outside: empty consoles, the enemy, an inbound torpedo', () => {
    const d = createDuel(layout, 5);
    stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence: 0 }, requestedTick: 0, command: { kind: 'presence', present: false } }, { runId: 'duel', id: { player: 0, sequence: 0 }, requestedTick: 0, command: { kind: 'stand' } }] });
    const [crew, enemy] = d.tactical.ships;
    let out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.slice(11)).toEqual([
      ['HEALTH', '100/100'], ['OTHER', 'AWAY'], ['', 'AT WEAPONS'], ['OUTSIDE', ''], ['HELM', 'EMPTY'], ['', 'COASTING'], ['WEAPONS', 'EMPTY'],
      ['ENEMY', String(Math.round(Math.hypot(enemy.x - crew.x, enemy.y - crew.y)))], ['BEARING', expect.stringMatching(/^\d{3}$/)]
    ]);
    placeMissile(d.tactical, 1, { x: crew.x + 500, y: crew.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.at(-1)).toEqual(['TORPEDO INBOUND', '']);   // homing torpedo spec §3: on screen it is a torpedo
    disposeDuel(d);
  });
  it('the Weapons help names the torpedo and has nothing to steer (homing torpedo spec §3)', () => {
    const help = readoutHelp('weapons').join(' ');
    expect(help).toContain('F TORPEDO');
    expect(help).not.toMatch(/STEER|MISSILE/);
  });
  it('the interior help names the zoom, the drag and C (interior zoom spec rule 6)', () => {
    expect(readoutHelp('interior')).toContain('WHEEL ZOOM  DRAG PAN  C FOLLOW');
  });
  it('every row and help line fits the 220-px column', () => {
    const d = createDuel(layout, 5);
    d.tactical.systems[0].rooms = [2, 2, 2]; d.tactical.systems[0].laserCharge = LASER_CHARGE_UNITS; placeMissile(d.tactical, 0, { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    placeMissile(d.tactical, 1, { ...d.tactical.ships[0], heading: 0, headingAcc: 0, age: 0 });
    for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) for (const other of ['AT HELM', 'AT WEAPONS', 'WALKING', 'REPAIRING'] as const) {
      const rows = readoutRows({ duel: d, mode, active: 0, other });
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
