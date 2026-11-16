import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { createEndScreen, endModel } from '../src/renderer/src/render/duel/endScreen';
import { createReadoutPanel } from '../src/renderer/src/render/duel/readoutPanel';
import { readoutHelp, readoutRows, READOUT_ROWS, READOUT_W, type ReadoutInput, type ReadoutMode } from '../src/renderer/src/render/duel/readoutModel';
import { PAD, textPx } from '../src/renderer/src/render/theme';

const layout = parseShip(cutter);
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const pairs = (input: ReadoutInput) => readoutRows(input).map((r) => [r.label, r.value]);

describe('the duel readout (H-1 spec §7 item 9, §8)', () => {
  it('both hulls, both shields, the crew rooms and the enemy rooms; the other character status', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[1].hull = 21; d.tactical.ships[1].rooms = [0, 2, 1]; d.tactical.ships[0].rooms[Room.Engines] = 1; d.tactical.ships[0].shields = 1;
    const rows = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'AT WEAPONS' });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['HELM', ''], ['CUTTER', ''], ['HULL', '40/40'], ['SHIELD', ''], ['WEAPONS', 'OK'], ['SHIELDS', 'OK'], ['ENGINES', 'DMG 1'],
      ['HUNTER', ''], ['HULL', '21/40'], ['SHIELD', ''], ['ROOMS', 'W0 S2 E1'], ['OTHER', 'PRESENT'], ['', 'AT WEAPONS']
    ]);
    expect(rows[3]!.pips).toMatchObject({ n: 1, max: 2 }); expect(rows[9]!.pips).toMatchObject({ n: 2, max: 2 });
    disposeDuel(d);
  });
  it('repair progress is a bar on the damaged room row', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms[Room.Shields] = 2; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    const row = readoutRows({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' }).find((r) => r.label === 'SHIELDS')!;
    expect([row.value, row.bar?.fill]).toEqual(['DMG 2', 0.25]);
    disposeDuel(d);
  });
  it('Weapons adds the lock, the charge bar and hold timer, and the magazine', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    s.laserCharge = LASER_CHARGE_UNITS / 2;
    let w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w.slice(11, 15)).toEqual([['LASER', ''], ['LOCK', 'SHIELDS'], ['CHARGE', '50%'], ['MAG', '4/4']]);
    s.laserCharge = LASER_CHARGE_UNITS; s.laserHold = 60;
    w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w[13]).toEqual(['CHARGE', 'HOLD 2.0']);
    disposeDuel(d);
  });
  it('standing, the strip tells about the ship outside: empty consoles, the enemy, an inbound missile', () => {
    const d = createDuel(layout, 5);
    stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence: 0 }, requestedTick: 0, command: { kind: 'presence', present: false } }, { runId: 'duel', id: { player: 0, sequence: 0 }, requestedTick: 0, command: { kind: 'stand' } }] });
    const [crew, enemy] = d.tactical.ships;
    let out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.slice(11)).toEqual([
      ['OTHER', 'AWAY'], ['', 'AT WEAPONS'], ['OUTSIDE', ''], ['HELM', 'EMPTY'], ['', 'COASTING'], ['WEAPONS', 'EMPTY'],
      ['ENEMY', String(Math.round(Math.hypot(enemy.x - crew.x, enemy.y - crew.y)))], ['BEARING', expect.stringMatching(/^\d{3}$/)]
    ]);
    d.tactical.missiles[1] = { x: crew.x + 500, y: crew.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 };
    out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.at(-1)).toEqual(['MISSILE INBOUND', '']);
    disposeDuel(d);
  });
  it('every row and help line fits the 220-px column', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms = [2, 2, 2]; d.tactical.ships[0].laserCharge = LASER_CHARGE_UNITS; d.tactical.missiles[0] = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 };
    d.tactical.missiles[1] = { ...d.tactical.ships[0], heading: 0, headingAcc: 0, age: 0 };
    for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) for (const other of ['AT HELM', 'AT WEAPONS', 'WALKING', 'REPAIRING'] as const) {
      const rows = readoutRows({ duel: d, mode, active: 0, other });
      expect(rows.length).toBeLessThanOrEqual(READOUT_ROWS);
      for (const r of rows) expect(textPx(r.label) + 6 + (r.pips ? 32 : textPx(r.value)), `${mode} ${r.label} ${r.value}`).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
      for (const line of readoutHelp(mode)) expect(textPx(line, 1), line).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
    }
    disposeDuel(d);
  });
  it('the panel: a warm-up of 2 frames, then 60 frames across all three screens add no display objects', () => {
    const d = createDuel(layout, 5), panel = createReadoutPanel({ fontFamily: 'm5x7' });
    const modes: ReadoutMode[] = ['helm', 'weapons', 'interior'];
    const frame = (k: number): void => {
      const mode = modes[Math.floor(k / 7) % 3]!;
      d.tactical.ships[0].rooms[Room.Engines] = k % 3; d.repair[Room.Engines] = (k * 40) % REPAIR_UNITS;
      panel.draw(readoutRows({ duel: d, mode, active: 0, other: 'WALKING' }), readoutHelp(mode));
    };
    frame(0); frame(1);
    const n0 = count(panel.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(panel.container)).toBe(n0);
    disposeDuel(d);
  });
});

describe('the end screen (H-1 spec §4 End)', () => {
  it('names the outcome, the duel length and the next seed', () => {
    expect(endModel(Outcome.Running, 100, 5)).toBeNull();
    expect(endModel(Outcome.CrewWins, 83 * 60 + 30, 2026)).toMatchObject({ title: 'VICTORY', length: 'DUEL LENGTH 1:23', prompt: 'ENTER: NEW DUEL (SEED 2027)' });
    expect(endModel(Outcome.EnemyWins, 60, 7)!.title).toBe('DEFEAT');
    expect(endModel(Outcome.Draw, 60, 7)!.title).toBe('BOTH SHIPS LOST');
  });
  it('shows only while the duel is decided, and allocates nothing after creation', () => {
    const end = createEndScreen({ fontFamily: 'm5x7' }), n0 = count(end.container);
    end.draw(null); expect(end.container.visible).toBe(false);
    end.draw(endModel(Outcome.CrewWins, 600, 5)); expect(end.container.visible).toBe(true);
    end.draw(endModel(Outcome.EnemyWins, 1200, 6));
    expect(count(end.container)).toBe(n0);
  });
});
