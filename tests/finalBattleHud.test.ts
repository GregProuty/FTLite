import { describe, it, expect } from 'vitest';
import { buildHudModel, runNotice, targetRowText, type WeaponsPanel, type SciencePanel } from '../src/renderer/src/render/hudModel';
import { enemyWindowModel, stepWindowAnim, freshWindowAnim } from '../src/renderer/src/render/enemyWindowModel';
import { sectorJump, navRows, EXIT_JUMP, NAV_TEXT_MAX } from '../src/renderer/src/sim/run';
import { EnemySystem, damageEnemy } from '../src/renderer/src/sim/enemy';
import { ENEMY_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { TICK_HZ, SECTORS, SECTOR_COLUMNS, ENCOUNTER_START, NOTICE_LINE_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, mapM, chargeJump, placeEnemy, wake } from './helpers/sim';

// Spec Loop-iv sections 1 and 2: the final row, the contact notice and the enemy window's title.
const T = TICK_HZ;
const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: i === 0 ? 'kb:0' : 'kb:1' }));
const lastExit = () => { const s = makeState(2); quiet(s); mapM(s); s.run.sector = SECTORS - 1; s.run.column = SECTOR_COLUMNS - 1; s.run.node = 0; chargeJump(s); return s; };
const engaged = () => { const s = lastExit(); sectorJump(s); s.boarders.nextArrivalTick = 1e9; return s; };
const withWarden = () => { const s = engaged(); run(s, ENCOUNTER_START * T + 1); s.enemy.nextShotTick = 1e9; return s; };
const settled = (s: ReturnType<typeof makeState>) => { let a = freshWindowAnim(); a = stepWindowAnim(a, s); s.tick += 600; a = stepWindowAnim(a, s); return a; };

describe('the final row and the contact notice (spec Loop-iv section 1)', () => {
  it('the last exit reads Engage the Warden (the earlier exits unchanged), as the row and as the pending jump', () => {
    const s = lastExit();
    expect(navRows(s).map((r) => [r.text, r.select, r.index, r.enabled])).toEqual([['Engage the Warden', 'sector', EXIT_JUMP, true], ['EVADE: Confirm', 'evade', 0, true]]);
    expect('Engage the Warden'.length).toBeLessThanOrEqual(NAV_TEXT_MAX);
    s.run.jumpPending = EXIT_JUMP; s.run.jumpPendingTick = s.tick; expect(runNotice(s)[0]).toBe('Engage the Warden? (1/2)');
    const e = makeState(2); quiet(e); mapM(e); e.run.column = SECTOR_COLUMNS - 1; expect(navRows(e)[0]!.text).toBe('Jump to sector 2');
  });
  it('from the jump to the arrival the notice reads The Warden is coming about; then the fight has no drive line', () => {
    const s = engaged();
    expect(runNotice(s)).toEqual(['The Warden is coming about']); expect('The Warden is coming about'.length).toBeLessThanOrEqual(NOTICE_LINE_MAX);
    run(s, ENCOUNTER_START * T); expect(runNotice(s)).toEqual(['The Warden is coming about']);
    run(s, 1); expect(s.enemy.present).toBe(1); expect(runNotice(s)).toEqual([]);
  });
  it('an ordinary contact keeps its own line', () => {
    const s = makeState(2); quiet(s); mapM(s); wake(s); s.run.column = 2; s.run.encounter = 1; s.enemy.nextArrivalTick = s.tick + 60;
    expect(runNotice(s)).toEqual(['Contact: enemy ship approaching']);
  });
});

describe('the Warden on the HUD and in the enemy window (spec Loop-iv section 2)', () => {
  it('the window title reads THE WARDEN; the status line follows the usual rules; three shield rings', () => {
    const s = withWarden(), v = enemyWindowModel(s, s.tick, settled(s));
    expect([v.title, v.status, v.shield.max, v.shield.layers]).toEqual(['THE WARDEN', 'ENEMY', 3, 3]);
    s.enemy.sysHp[EnemySystem.Engines] = 0; expect(enemyWindowModel(s, s.tick, settled(s)).status).toBe('ENGINES DOWN');
    const o = makeState(2); quiet(o); o.tick = 6000; placeEnemy(o); expect(enemyWindowModel(o, o.tick, settled(o)).title).toBeNull();
  });
  it('the Weapons hull row has no departure seconds (the Warden never leaves) and three layers; the threat line reads shields 3/3', () => {
    const s = withWarden(); const c = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 0, c); s.stations.cursor[c] = ENEMY_SLOT;   // the ship row is Science's since Demo-x-c (Weapons targets rooms)
    const m = buildHudModel(s, slots(2), 'running', ''), panel = m.players[0]!.console as SciencePanel, hull = panel.targets.find((t) => t.kind === 'enemy')!;
    expect(targetRowText(hull)).toBe('Enemy 100% S? [###]');
    expect(m.threats[0]!.text).toBe('Enemy 100% shields 3/3');
  });
  it('the victory screen after it falls', () => {
    const s = withWarden(); damageEnemy(s, ENEMY_SLOT, s.enemy.hull);
    const m = buildHudModel(s, slots(2), 'gameover', '');
    expect(m.summary![0]).toMatch(/^Survived \d+:\d\d {2}VICTORY {2}Reached sector 3 node 6 {2}Score \d+$/);
  });
});
