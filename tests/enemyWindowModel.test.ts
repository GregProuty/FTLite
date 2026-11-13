import { describe, it, expect } from 'vitest';
import { enemyWindowModel, windowRoomCentre, stepWindowAnim, freshWindowAnim, WINDOW, SHIP_MARGIN, ARRIVE_SECONDS, BREAK_SECONDS, FLY_SECONDS, BOLT_SECONDS, type WindowAnim } from '../src/renderer/src/render/enemyWindowModel';
import { ENEMY_LAYOUT, ENEMY_TILE, OLD_ENEMY_TILE, enemyRoomAt } from '../src/renderer/src/render/enemyShipLayout';
import { projectilePath } from '../src/renderer/src/render/projectileModel';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { ObjectKind } from '../src/renderer/src/sim/debris';
import { EnemySystem, EnemyRoom, leave } from '../src/renderer/src/sim/enemy';
import { ENEMY_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT, ENEMY_PILOTING_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { ENEMY_SYS_HP, ENEMY_FIRE_SECONDS, ENEMY_BREACH_SECONDS, TICK_HZ, ENEMY_ROOMS, SHIELD_ROTATE } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, placeEnemy, disableSystem, placeDebris, room } from './helpers/sim';
import { textPx } from '../src/renderer/src/render/theme';

const T = TICK_HZ;
const present = () => { const s = makeState(2); quiet(s); s.tick = 6000; placeEnemy(s); s.enemy.nextShotTick = s.tick + 600; s.enemy.shotArmTick = s.tick; return s; };
/** An anim for an enemy that arrived long ago. */
const settled = (s: ReturnType<typeof makeState>): WindowAnim => { let a = freshWindowAnim(); s.tick -= 600; a = stepWindowAnim(a, s); s.tick += 600; return stepWindowAnim(a, s); };
const view = (s: ReturnType<typeof makeState>, anim = settled(s), now = s.tick) => enemyWindowModel(s, now, anim);
const seatWeapons = (s: ReturnType<typeof makeState>, cursor: number) => { const w = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, w); s.stations.cursor[w] = cursor; };

describe('enemy ship layout', () => {
  it('five rooms, 11 x 7 tiles of 32 px (1.6x the old 20), bow left towards our ship; doors join two rooms; consoles inside their rooms (spec Demo-x-c section 3)', () => {
    expect(ENEMY_LAYOUT.rooms.length).toBe(ENEMY_ROOMS); expect(ENEMY_TILE / OLD_ENEMY_TILE).toBe(1.6);
    expect([ENEMY_LAYOUT.tiles.length, ENEMY_LAYOUT.tiles[0]!.length]).toEqual([7, 11]);
    for (const d of ENEMY_LAYOUT.doors) { const a = enemyRoomAt(d.x, d.y), b = enemyRoomAt(d.x + 1, d.y); expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeGreaterThanOrEqual(0); expect(a).not.toBe(b); }
    ENEMY_LAYOUT.consoles.forEach((c, sys) => expect(enemyRoomAt(c.x, c.y)).toBe(sys));
    expect(ENEMY_LAYOUT.rooms[EnemyRoom.Weapons]!.x).toBe(0);   // the bow, on the left
  });
});

describe('enemy window model (spec Demo-viii section 2)', () => {
  it('the frame and timings', () => {
    expect(WINDOW).toEqual({ x: 872, y: 114, w: 400, h: 340 });   // the right column (spec Demo-x-c section 3) expect(SHIP_MARGIN).toBe(8);
    expect([ARRIVE_SECONDS, BREAK_SECONDS, FLY_SECONDS, BOLT_SECONDS]).toEqual([0.5, 1.2, 0.8, 0.4]);
  });
  it('hidden with no enemy; every room inside the frame less the 8 px margin (amendment R4)', () => {
    const q = makeState(2); expect(enemyWindowModel(q, q.tick, stepWindowAnim(freshWindowAnim(), q)).visible).toBe(false);
    const v = view(present());
    expect(v.visible).toBe(true); expect(v.phase).toBe('present'); expect(v.rooms.length).toBe(5);
    for (const r of v.rooms) { expect(r.rect.x).toBeGreaterThanOrEqual(SHIP_MARGIN); expect(r.rect.y).toBeGreaterThanOrEqual(SHIP_MARGIN); expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(WINDOW.w - SHIP_MARGIN); expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(WINDOW.h - SHIP_MARGIN); expect(r.rect.w % ENEMY_TILE).toBe(0); }
    expect(v.rooms.map((r) => r.glyph)).toEqual(['weapons', 'engines', 'shields', 'piloting', null]);   // Piloting is a system room (spec Demo-x-c section 4)
  });
  it('tints, health and the repair countdown', () => {
    const s = present(); s.enemy.sysHp[EnemySystem.Engines] = 12; disableSystem(s, EnemySystem.Shields); s.enemy.sysRepairTick[EnemySystem.Shields] = s.tick + 10 * T + 1;
    const v = view(s);
    expect(v.rooms.map((r) => r.tint)).toEqual(['normal', 'damaged', 'down', 'normal', 'normal']);
    expect(v.rooms.map((r) => r.hp)).toEqual([1, 12 / ENEMY_SYS_HP, 0, 1, null]);
    expect(v.rooms.map((r) => r.repairIn)).toEqual([null, null, 11, null, null]);
  });
  it('hull pips at 0, 35% and 100%; the frequency once scanned; the charge, hidden while weapons are down', () => {
    const s = present(); expect(view(s).hullPips).toEqual({ lit: 10, total: 10 });
    s.enemy.hull = 0.35 * s.enemy.maxHull; expect(view(s).hullPips).toEqual({ lit: 4, total: 10 });
    s.enemy.hull = 0; expect(view(s).hullPips.lit).toBe(0);
    expect(view(s).frequency).toBeNull(); s.enemy.scanned = 1; s.enemy.shieldFreq = 3; expect(view(s).frequency).toBe(`freq 3  ${SHIELD_ROTATE}s`);
    s.tick = s.enemy.shotArmTick + 300; expect(view(s).charge).toBeCloseTo(0.5, 9);
    disableSystem(s, EnemySystem.Weapons); expect(view(s).charge).toBeNull();
  });
  it('the shield: layers, the maximum, down, and the flash on a strip', () => {
    const s = present(); expect(view(s).shield).toEqual({ layers: 1, max: 1, down: false, flash: false });
    s.weapons.lastShotTick = s.tick - 5; s.weapons.lastShotResult = 1; s.weapons.lastShotTarget = ENEMY_SLOT; s.enemy.shieldLayers = 0;
    expect(view(s).shield).toEqual({ layers: 0, max: 1, down: false, flash: true });
    disableSystem(s, EnemySystem.Shields); expect(view(s).shield.down).toBe(true);
  });
  it('each status line', () => {
    const s = present(); expect(view(s).status).toBe('ENEMY');
    s.enemy.sysHp[EnemySystem.Engines] = 0; expect(view(s).status).toBe('ENGINES DOWN');
    s.enemy.sysHp[EnemySystem.Engines] = ENEMY_SYS_HP; s.enemy.fleeing = 1; s.enemy.surrenderIntact = 1; s.enemy.departTick = s.tick + 8 * T;
    expect(view(s).status).toBe('SURRENDERING 8s  hold fire');
    s.enemy.surrenderIntact = 0; s.enemy.departTick = s.tick + 12 * T; expect(view(s).status).toBe('FLEEING 12s');
    for (const t of ['ENEMY', 'ENGINES DOWN', 'SURRENDERING 8s  hold fire', 'FLEEING 12s']) expect(t.length * 6).toBeLessThanOrEqual(WINDOW.w - 2 * SHIP_MARGIN);
  });
  it('the problem line: the most recent fire or breach, one at a time', () => {
    const s = present(); expect(view(s).problem).toBeNull();
    s.enemy.roomFire[EnemyRoom.Shields] = 10; expect(view(s).problem).toBe('FIRE: Shields');
    s.enemy.roomBreach[EnemyRoom.Engines] = ENEMY_BREACH_SECONDS - 1; expect(view(s).problem).toBe('BREACH: Engines');   // 1 s old beats 5 s old
    s.enemy.roomFire[EnemyRoom.Hold] = ENEMY_FIRE_SECONDS; expect(view(s).problem).toBe('FIRE: Hold');
    expect(view(s).rooms.map((r) => [r.fire, r.breach])).toEqual([[false, false], [false, true], [true, false], [false, false], [true, false]]);
  });
  it('the reticle while Weapons is seated: the targeted room, the Hold and Piloting included (spec Demo-x-c section 4); null otherwise', () => {
    const s = present(); expect(view(s).reticle).toBeNull();
    seatWeapons(s, ENEMY_ENGINES_SLOT); expect(view(s).reticle).toEqual({ room: EnemyRoom.Engines });
    seatWeapons(s, ENEMY_SHIELDS_SLOT); expect(view(s).reticle).toEqual({ room: EnemyRoom.Shields });
    seatWeapons(s, ENEMY_SLOT); expect(view(s).reticle).toEqual({ room: EnemyRoom.Hold });
    seatWeapons(s, ENEMY_PILOTING_SLOT); expect(view(s).reticle).toEqual({ room: EnemyRoom.Piloting });
    const k = placeDebris(s, room(s, 'A'), 600, 1); seatWeapons(s, k); expect(view(s).reticle).toBeNull();
  });
  it('crew sit at their consoles; the nearest one walks to a burning room and works there', () => {
    const s = present(), consoles = ENEMY_LAYOUT.consoles.map((c) => ({ x: (c.x + 0.5) * ENEMY_TILE, y: (c.y + 0.5) * ENEMY_TILE }));
    const v0 = view(s), off = { x: v0.ship.x, y: v0.ship.y };
    expect(v0.crew.map((c) => ({ x: c.x - off.x, y: c.y - off.y }))).toEqual(consoles); expect(v0.crew.every((c) => c.working)).toBe(true);
    s.enemy.roomFire[EnemyRoom.Hold] = ENEMY_FIRE_SECONDS;   // just started: the walk begins at the console
    const moving = view(s); const mover = moving.crew.findIndex((c) => !c.working); expect(mover).toBe(3);   // the Piloting crew member is nearest to the Hold (every system room has one since Demo-x-c)
    s.enemy.roomFire[EnemyRoom.Hold] = ENEMY_FIRE_SECONDS - 5;   // five seconds on: arrived, working in the Hold
    const there = view(s).crew[3]!, rect = view(s).rooms[EnemyRoom.Hold]!.rect;
    expect(there.working).toBe(true); expect(there.x).toBeGreaterThan(rect.x); expect(there.x).toBeLessThan(rect.x + rect.w); expect(there.y).toBeGreaterThan(rect.y); expect(there.y).toBeLessThan(rect.y + rect.h);
    s.enemy.roomFire[EnemyRoom.Engines] = 3; const v = view(s); expect(v.crew[1]!.x - off.x).toBeCloseTo(consoles[1]!.x, 9);   // its own room: Engines crew stay put
  });
  it('the bolt: from our side to the target room over 0.4 s after lastShotTick, then null; a debris shot has no window target', () => {
    const s = present(); expect(view(s).bolt).toBeNull();
    s.weapons.lastShotTick = s.tick; s.weapons.lastShotTarget = ENEMY_ENGINES_SLOT; s.weapons.lastShotResult = 2; s.weapons.lastShotKind = 0;
    const b = view(s).bolt!, centre = view(s).rooms[EnemyRoom.Engines]!.rect;
    expect(b).toMatchObject({ t: 0, result: 2, kind: 0, slot: ENEMY_ENGINES_SLOT }); expect(b.to).toEqual({ x: centre.x + centre.w / 2, y: centre.y + centre.h / 2 });
    expect(view(s, settled(s), s.tick + 12).bolt!.t).toBeCloseTo(0.5, 9);
    expect(view(s, settled(s), s.tick + BOLT_SECONDS * T).bolt).toBeNull();
    const hold = view(s).rooms[EnemyRoom.Hold]!.rect; s.weapons.lastShotTarget = ENEMY_SLOT; expect(view(s).bolt!.to).toEqual({ x: hold.x + hold.w / 2, y: hold.y + hold.h / 2 });   // the Hold, a room like the others
    s.weapons.lastShotTarget = 2; expect(view(s).bolt!.to).toBeNull();
  });
  it('slides in over 0.5 s, breaks up over 1.2 s when destroyed, flies out over 0.8 s when it leaves; a jump closes it at once', () => {
    const s = makeState(2); quiet(s); s.tick = 1000; let a = stepWindowAnim(freshWindowAnim(), s);
    placeEnemy(s); a = stepWindowAnim(a, s);
    expect(enemyWindowModel(s, s.tick, a)).toMatchObject({ visible: true, phase: 'arriving', t: 0 });
    expect(enemyWindowModel(s, s.tick + 15, a).t).toBeCloseTo(0.5, 9); expect(enemyWindowModel(s, s.tick + 15, a).slideX).toBeGreaterThan(0);
    expect(enemyWindowModel(s, s.tick + ARRIVE_SECONDS * T, a)).toMatchObject({ phase: 'present', slideX: 0 });
    s.tick += 100; enemyWindowModel(s, s.tick, a); a = stepWindowAnim(a, s);
    s.telemetry.enemiesDestroyed++; leave(s, false); a = stepWindowAnim(a, s);   // counted as destroyed
    expect(enemyWindowModel(s, s.tick, a)).toMatchObject({ visible: true, phase: 'destroyed', t: 0 });
    expect(enemyWindowModel(s, s.tick, a).rooms.length).toBe(5);   // the last picture is kept for the break-up
    expect(enemyWindowModel(s, s.tick + BREAK_SECONDS * T, a).visible).toBe(false);
    const f = present(); let b = settled(f); leave(f, false); b = stepWindowAnim(b, f);
    expect(enemyWindowModel(f, f.tick, b)).toMatchObject({ visible: true, phase: 'leaving' });
    expect(enemyWindowModel(f, f.tick + 24, b).shipDY).toBeLessThan(0); expect(enemyWindowModel(f, f.tick + FLY_SECONDS * T, b).visible).toBe(false);
    const j = present(); let c = settled(j); leave(j, false); j.run.column += 1; c = stepWindowAnim(c, j);
    expect(enemyWindowModel(j, j.tick, c).visible).toBe(false);
  });
  it("a Shot's projectile origin is the window's Weapons room centre in internal pixels (amendment R3)", () => {
    const o = windowRoomCentre(EnemyRoom.Weapons), r = ENEMY_LAYOUT.rooms[EnemyRoom.Weapons]!;
    const v = view(present());
    expect(o).toEqual({ x: WINDOW.x + v.ship.x + (r.x + r.w / 2) * ENEMY_TILE, y: WINDOW.y + v.ship.y + (r.y + r.h / 2) * ENEMY_TILE });
    expect(projectilePath(5, ObjectKind.Shot, { x: 600, y: 260 }, WORLD_BAND, o).from).toEqual(o);
    expect(projectilePath(5, ObjectKind.Shot, { x: 600, y: 260 }, WORLD_BAND).from.x).toBeGreaterThan(WORLD_BAND.x + WORLD_BAND.w);
    expect(projectilePath(5, ObjectKind.Debris, { x: 600, y: 260 }, WORLD_BAND, o)).toEqual(projectilePath(5, ObjectKind.Debris, { x: 600, y: 260 }, WORLD_BAND));
  });
});

describe('the window frequency and its rotate countdown (spec Coop-i section 1)', () => {
  it('shows the frequency only while it is current, with the seconds to the next rotation; no countdown while the shields system is down', () => {
    const s = present(); s.enemy.scanned = 1; s.enemy.shieldFreq = 2;
    expect(view(s).frequency).toBe(`freq 2  ${SHIELD_ROTATE}s`);
    s.tick += 5.5 * T; expect(view(s).frequency).toBe(`freq 2  ${SHIELD_ROTATE - 5}s`);
    disableSystem(s, EnemySystem.Shields); expect(view(s).frequency).toBe('freq 2');
    s.enemy.sysHp[EnemySystem.Shields] = ENEMY_SYS_HP; s.enemy.scanned = 0; expect(view(s).frequency).toBeNull();   // a rotation clears the scan: the old frequency is never shown
  });
});

// ---- Loop-iii: an ionised system in the enemy window (spec Loop-iii section 4) ----
describe('enemy window: ion-disabled rooms', () => {
  it('an ionised system room is tinted ion with its whole seconds; a system down by damage stays down', () => {
    const s = present(); s.enemy.ionUntil[EnemySystem.Shields] = s.tick + 7 * T + 1;
    const v = view(s);
    expect(v.rooms.map((r) => r.tint)).toEqual(['normal', 'normal', 'ion', 'normal', 'normal']);
    expect(v.rooms.map((r) => r.ionIn)).toEqual([null, null, 8, null, null]); expect(v.rooms[2]!.repairIn).toBeNull();
    disableSystem(s, EnemySystem.Shields); expect(view(s).rooms[2]!.tint).toBe('down');
    s.tick = s.enemy.ionUntil[EnemySystem.Shields]!; s.enemy.sysHp[EnemySystem.Shields] = ENEMY_SYS_HP; expect(view(s).rooms[2]!.tint).toBe('normal');
  });
});

describe('the shot-result line under the status (spec Demo-xiv section 2)', () => {
  it('shows the last shot at an enemy room for three seconds, in place of the problem line; none for a debris shot', () => {
    const s = present(); s.enemy.scanned = 1; s.enemy.shieldFreq = 2; s.enemy.roomFire[EnemyRoom.Weapons] = 1;
    Object.assign(s.weapons, { lastShotTick: s.tick, lastShotTarget: ENEMY_SHIELDS_SLOT, lastShotResult: 1, lastShotSelector: 0, lastShotDamage: 0 });
    expect(view(s).shot).toEqual({ text: 'Shield stripped (freq 1, needs 2)', tone: 'strip' });
    s.tick += 3 * T; expect(view(s).shot).toBeNull();
    s.weapons.lastShotTick = s.tick; s.weapons.lastShotTarget = 0; s.weapons.lastShotResult = 2; expect(view(s).shot).toBeNull();
  });
  it('the corner reads freq N with the re-tune countdown, within the window beside the hull pips', () => {
    const s = present(); s.enemy.scanned = 1; s.enemy.shieldFreq = 3;
    expect(textPx(view(s).frequency!)).toBeLessThanOrEqual(WINDOW.w - 2 * SHIP_MARGIN - 10 * 18);
  });
});
