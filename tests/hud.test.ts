import { fixtureCouchViewer } from './helpers/cardUi';
import { fixtureCardUi } from './helpers/cardUi';
import { targetRef, scienceTargetSlot } from '../src/renderer/src/sim/debrisTargets';
import { weaponSelection } from './helpers/weaponFixture';
import { buildFixtureHud as buildHudModel } from './helpers/cardUi';
import { cardSelection } from './helpers/cardUi';
import { describe, it, expect } from 'vitest';
import { Phase } from '../src/renderer/src/sim/director';
import { QUIRK_NAMES } from '../src/renderer/src/sim/quirks';
import {  clockLine, sectorLine, navigationFooter, deviceKindOf, glyphName, targetWindow, targetRowText, upgradeRowText, engineeringFooter } from '../src/renderer/src/render/hudModel';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Life, LifeState } from '../src/renderer/src/sim/components';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from './helpers/simLifetime';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown, stationOutput } from '../src/renderer/src/sim/stations';
import { failStation, repairStation, shiftBar, buyUpgrade, buyReactor, REACTOR_ROW } from '../src/renderer/src/sim/power';
import { HIT_FLASH_TICKS, SECTOR_COLUMNS, EVADE_BASE, EVADE_SCALE, HEAT_MAX, COOLANT_POOL, TORP_START, TORP_CAP, ENCOUNTER_MAX, STATION_MAX, BOARDER_HEALTH } from '../src/renderer/src/sim/tuning';
import type { EngineeringPanel, WeaponsPanel, SciencePanel, NavigationPanel } from '../src/renderer/src/render/hudModel';
import { Skill } from '../src/renderer/src/sim/skills';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { EndReason } from '../src/renderer/src/sim/crew';
import { ENEMY_SLOT, ENEMY_SLOTS, ENEMY_SHIELDS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { NodeType } from '../src/renderer/src/sim/run';
import { resolveEvent } from '../src/renderer/src/sim/events';
import { EnemySystem, EnemyRoom } from '../src/renderer/src/sim/enemy';
import { enemyWindowModel, stepWindowAnim, freshWindowAnim, rightColumn, windowShown } from '../src/renderer/src/render/enemyWindowModel';
import { LOBBY_LINE_MAX, CONSOLE_LINE_MAX } from '../src/renderer/src/sim/tuning';
import { DoorState } from '../src/renderer/src/sim/grid';
import type { DoorsPanel } from '../src/renderer/src/render/hudModel';
import { confirmTarget, ConfirmKind } from '../src/renderer/src/sim/interact';
import { boarderMarkers } from '../src/renderer/src/sim/boarders';
import { makeState, room, run, teleport, placeDebris, seconds, setSkill, intents, placeEnemy, placeShot, quiet, disableSystem, guardDebris, placeBoarder, setMap, seatNavigator, chargeJump, mapM, setEvent, setNodeTypes, grantScrap, cutterState } from './helpers/sim';

const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: i === 0 ? 'kb:0' : i === 1 ? 'kb:1' : `gp:${i}` }));

describe('the Doors card (spec Demo-vii section 1)', () => {
  const seated = () => { const s = cutterState(); const i = s.derived.stationOfKind[StationKind.Doors]!; sitDown(s, 0, i); return { s, i }; };
  const card = (s: ReturnType<typeof cutterState>) => buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.console as DoorsPanel;
  it('names the selected door or airlock, its state and the Confirm action, for every state', () => {
    const { s, i } = seated(), e = s.derived.doorEdges[3]!;   // edge 3: Aft Passage <-> Weapons
    cardSelection(s, i).cursor = 3;
    const row = (st: number) => { s.doors.state[e] = st; const c = card(s); return c.item === null ? null : [c.item, c.status, c.action]; };
    expect(row(DoorState.Closed)).toEqual(['Door  Aft Passage / Weapons', 'Auto', 'Seal']);
    expect(row(DoorState.Open)).toEqual(['Door  Aft Passage / Weapons', 'Auto', 'Seal']);
    expect(row(DoorState.HeldOpen)).toEqual(['Door  Aft Passage / Weapons', 'Held open', 'Release']);
    expect(row(DoorState.Sealed)).toEqual(['Door  Aft Passage / Weapons', 'Sealed', 'Hold open']);
    s.doors.state[e] = DoorState.Closed; s.doors.sealRequested[e] = 1; expect([card(s).item, (card(s) as { status: string }).status, (card(s) as { action: string }).action]).toEqual(['Door  Aft Passage / Weapons', 'Sealing', 'Hold open']); s.doors.sealRequested[e] = 0;   // a pending seal (Codex render review 2)   // the online cycle: Auto -> Sealed -> Held open -> Auto (spec Demo-vii amendment 19)
    cardSelection(s, i).cursor = s.derived.doorEdges.length + 2;
    expect([card(s).item, (card(s) as { status: string }).status, (card(s) as { action: string }).action]).toEqual(['Airlock  Engines', 'Airlock closed', 'Open airlock']);
    s.airlocks.open[2] = 1; s.airlocks.open[0] = 1;
    expect(card(s)).toEqual({ kind: 'doors', item: 'Airlock  Engines', status: 'AIRLOCK OPEN', action: 'Close airlock', openAirlocks: 2 });
  });
  it('offline: a door shows the plain seal toggle and an airlock no action', () => {
    const { s, i } = seated();
    s.stations.level[i] = 0;
    cardSelection(s, i).cursor = 0;
    expect((card(s) as { action: string }).action).toBe('Seal');
    s.doors.state[s.derived.doorEdges[0]!] = DoorState.Sealed;
    expect((card(s) as { action: string }).action).toBe('Release');
    cardSelection(s, i).cursor = s.derived.doorEdges.length;
    expect((card(s) as { action: string }).action).toBe('');
  });
  it('every card line fits CONSOLE_LINE_MAX, for every door and airlock on the cutter', () => {
    const { s, i } = seated();
    s.airlocks.open.fill(1);
    for (let c = 0; c < s.derived.doorEdges.length + s.airlocks.open.length; c++) {
      cardSelection(s, i).cursor = c;
      const p = card(s) as Exclude<DoorsPanel, { item: null }>;
      for (const line of [p.item, p.status, `Confirm: ${p.action}`, `Open airlocks: ${p.openAirlocks}`]) expect(line.length, line).toBeLessThanOrEqual(CONSOLE_LINE_MAX);
    }
  });
  it('lists each open airlock as a threat', () => {
    const s = cutterState(); s.airlocks.open[2] = 1; s.airlocks.open[3] = 1;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).threats).toEqual([{ icon: 'icon.breach', text: 'Airlock open: Engines' }, { icon: 'icon.breach', text: 'Airlock open: Forward Corridor' }]);
  });
  it('the local confirm prompt on a held-open door is Seal door', () => {
    const s = makeState(1), e = 5, t = s.derived.edgeTile[e]!, w = s.derived.width;
    s.doors.state[e] = DoorState.HeldOpen;
    teleport(s, 0, (t % w) + 0.5, Math.floor(t / w) + 1.9);
    expect(confirmTarget(s, 0)).toEqual({ kind: ConfirmKind.Door, index: e });
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.confirmPrompt).toBe('Seal door');
  });
});

describe('deviceKindOf and glyphName', () => {
  it('maps slot keys to device kinds', () => {
    expect(deviceKindOf('kb:0')).toBe('kb0'); expect(deviceKindOf('kb:1')).toBe('kb1');
    expect(deviceKindOf('gp:0')).toBe('pad'); expect(deviceKindOf('gp:7')).toBe('pad');
    expect(deviceKindOf(null)).toBeNull(); expect(deviceKindOf('x')).toBeNull();
  });
  it('picks the glyph per action and device, none for a null device', () => {
    expect(glyphName('interact', 'kb0')).toBe('prompt.kb.E'); expect(glyphName('confirm', 'kb0')).toBe('prompt.kb.F'); expect(glyphName('cancel', 'kb0')).toBe('prompt.kb.Q');
    expect(glyphName('interact', 'kb1')).toBe('prompt.kb.Enter'); expect(glyphName('confirm', 'kb1')).toBe('prompt.kb.ShiftRight'); expect(glyphName('cancel', 'kb1')).toBe('prompt.kb.Backspace');
    expect(glyphName('interact', 'pad')).toBe('prompt.pad.A'); expect(glyphName('confirm', 'pad')).toBe('prompt.pad.X'); expect(glyphName('cancel', 'pad')).toBe('prompt.pad.B');
    expect(glyphName('interact', null)).toBeNull();
  });
});

describe('buildHudModel', () => {
  it('lists threats with icons by room name and shows the sim clock', () => {
    const s = makeState(2);
    igniteRoom(s, room(s, 'A')); activateBreach(s, 6);
    run(s, 120);
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' });
    expect(m.simSeconds).toBe(2);
    expect(m.threats).toEqual([{ icon: 'icon.fire', text: 'Fire: Bridge' }, { icon: 'icon.breach', text: 'Breach: Crew Quarters' }]);
    expect(m.hull).toBe(100);
    expect(m.credits).toBeNull(); expect(m.creditsScroll).toBe(0);
  });
  it('splits Interact and Confirm prompts with their icons and device kinds', () => {
    const s = makeState(3);
    igniteRoom(s, room(s, 'G'));
    teleport(s, 0, 2.5, 8.6);
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(3), phase: 'running', message: '' });
    const p0 = m.players[0]!;
    expect(p0.interactPrompt).toBe('Repair fire'); expect(p0.interactIcon).toBe('icon.repair');
    expect(p0.confirmPrompt).toBe('Seal door'); expect(p0.confirmIcon).toBe('icon.door');
    expect(p0.deviceKind).toBe('kb0'); expect(m.players[1]!.deviceKind).toBe('kb1'); expect(m.players[2]!.deviceKind).toBe('pad');
    expect(p0.lifeText).toBe('');
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 12.4;
    teleport(s, 1, 2.5, 9.2);
    const m2 = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(3), phase: 'running', message: '' });
    expect(m2.players[0]!.interactPrompt).toBe('Revive P2'); expect(m2.players[0]!.interactIcon).toBeNull();
    expect(m2.players[1]!.lifeText).toBe('DOWNED 13s');   // Math.ceil: never shows 0s while still alive
    expect(m2.players[1]!.interactPrompt).toBe(''); expect(m2.players[1]!.confirmPrompt).toBe('');
    Life.state[s.crew[1]!] = LifeState.Dead;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(3), phase: 'running', message: '' }).players[1]!.lifeText).toBe('DEAD');
  });
  it('flags low oxygen for a player whose room is below half', () => {
    const s = makeState(1);
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.lowOxygen).toBe(false);
    const r = room(s, 'G'); s.rooms.o2[r] = s.derived.volume[r]! * 0.4;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.lowOxygen).toBe(true);
  });
  it('lobby model without state shows slot status and null device for empty slots', () => {
    const m = buildHudModel(null, fixtureCouchViewer(null), { slots: [{ status: 'active', key: 'gp:2' }, { status: 'empty', key: null }, { status: 'reconnect', key: null }], phase: 'lobby', message: 'Press Interact to join' });
    expect(m.players).toHaveLength(3);
    expect(m.players[0]!.deviceKind).toBe('pad'); expect(m.players[1]!.status).toBe('empty'); expect(m.players[1]!.deviceKind).toBeNull(); expect(m.players[2]!.deviceKind).toBeNull();
    expect(m.weapons).toEqual({ charge: 0, ready: false, torpedoLoaded: false, torpedoStock: 0 });
  });
  it('passes the credits sub-state through', () => {
    const m = buildHudModel(null, fixtureCouchViewer(null), { slots: [], phase: 'lobby', message: '', credits: { lines: ['a', 'b'], scroll: 1 } });
    expect(m.credits).toEqual(['a', 'b']); expect(m.creditsScroll).toBe(1);
  });
  it('reports power, stations, a failed station as a threat with the repair prompt and progress', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!;
    const m0 = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' });
    expect(m0.power).toEqual({ capacity: 10, used: 9 });
    expect(m0.stations.map((st) => st.kind)).toEqual([0, 6, 1, 2, 5, 4, 3]);
    expect(m0.stations.find((st) => st.kind === StationKind.LifeSupport)).toEqual({ kind: 4, name: 'Life Support', level: 2, max: 3, online: true, occupant: null, heat: 0, coolant: 0, overdriven: false, unpowered: false, icon: 'lifeSupport', iconTint: 'normal' });
    failStation(s, eng); teleport(s, 0, 18.5, 9.5); s.stations.repair[eng] = 0.4;
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' });
    expect(m.threats).toEqual([{ icon: 'icon.power', text: 'Power: Engineering' }]);
    expect(m.stations.find((st) => st.kind === StationKind.Engineering)!.online).toBe(false);
    expect(m.players[0]!.interactPrompt).toBe('Repair power'); expect(m.players[0]!.interactIcon).toBe('icon.power'); expect(m.players[0]!.progress).toBe(0.4);
  });
  it('offers Sit at a same-room console, and shows Stand plus the Engineering panel while seated', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!;
    teleport(s, 0, 17.5, 9.5);
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.confirmPrompt).toBe('Sit: Engineering');
    sitDown(s, 0, eng); cardSelection(s, eng).cursor = StationKind.Weapons;
    const p = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!;
    expect(p.seated).toBe(StationKind.Engineering); expect(p.cancelPrompt).toBe('Stand'); expect(p.confirmPrompt).toBe(''); expect(p.interactPrompt).toBe('');
    const panel = p.console as EngineeringPanel;
    expect(panel.cursor).toBe(StationKind.Weapons); expect(panel.pool).toBe(1);
    expect(panel.rows[StationKind.Weapons]).toEqual({ kind: 1, name: 'Weapons', level: 2, max: 3, failed: false, heat: 0, coolant: 0, overdriven: false, unpowered: false });
    expect(panel.coolantFree).toBe(COOLANT_POOL);
    expect(panel.rows).toHaveLength(7); expect(panel.page).toBe(0);
  });
  it('shows the Doors panel with the selected door, or No doors on a doorless ship', () => {
    const s = makeState(1);
    const doors = s.derived.stationOfKind[StationKind.Doors]!;
    sitDown(s, 0, doors);
    const p = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!;
    const e = s.derived.doorEdges[0]!;
    expect(p.console).toEqual({ kind: 'doors', item: `Door  ${s.layout.rooms[s.derived.edgeA[e]!]!.name} / ${s.layout.rooms[s.derived.edgeB[e]!]!.name}`, status: 'Auto', action: 'Seal', openAirlocks: 0 });
    const noDoors = JSON.parse(JSON.stringify(starter)) as typeof starter;
    for (const edge of noDoors.edges) (edge as { kind: string }).kind = 'opening';
    const t = createSimState(parseShip(noDoors), 1, 1);
    sitDown(t, 0, t.derived.stationOfKind[StationKind.Doors]!);
    expect(buildHudModel(t, fixtureCouchViewer(t), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console).toEqual({ kind: 'doors', item: null });
  });
  it('lists warned debris as threats in StableId order with the ETA, hides unwarned ones, and exposes tick, charge and impact ticks', () => {
    const s = makeState(1), A = room(s, 'A'), B = room(s, 'B');
    s.director.nextSpawnTick = 1e9;
    placeDebris(s, A, seconds(10) + 1, 1, 30); placeDebris(s, B, seconds(3), 1, 10); placeDebris(s, A, seconds(20), 0, 20);
    s.weapons.charge = 1; s.rooms.impactTick[B] = 5;
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' });
    expect(m.threats).toEqual([{ icon: 'icon.sensors', text: 'Debris: Weapons Bay 3s' }, { icon: 'icon.sensors', text: 'Debris: Bridge 11s' }]);
    expect(m.tick).toBe(0); expect(m.weapons).toEqual({ charge: 1, ready: true, torpedoLoaded: false, torpedoStock: TORP_START }); expect(m.impactTick[B]).toBe(5); expect(m.impactTick[A]).toBe(-1);
  });
  it('a warned field rock reads Rock in the threats and its target row (spec Demo-viii amendment A1)', () => {
    const s = makeState(1), B = room(s, 'B'); quiet(s);
    const k = placeDebris(s, B, seconds(3), 1, 10); s.debris.kind[k] = 2;
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' });
    expect(m.threats).toEqual([{ icon: 'icon.sensors', text: 'Rock: Weapons Bay 3s' }]);
    expect(targetRowText({ stableId: 10, kind: 'rock', room: 'Weapons Bay', eta: 3, frequency: null, hull: null, system: null, status: null, shieldsUp: null } as never)).toBe('Rock Weapons Bay 3s freq ?');
  });
  it('shows the Weapons panel with charge, targets by StableId and the cursor index', () => {
    const s = makeState(1), A = room(s, 'A'), B = room(s, 'B');
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    placeDebris(s, A, seconds(10), 1, 30); placeDebris(s, B, seconds(5), 1, 10);
    sitDown(s, 0, wpn); s.weapons.charge = 0.25;
    const p = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!;
    expect(p.seated).toBe(StationKind.Weapons);
    const panel = p.console as WeaponsPanel;
    expect(panel.kind).toBe('weapons'); expect(panel.charge).toBe(0.25);
    expect(panel.targets).toEqual([{ stableId: 10, room: 'Weapons Bay', eta: 5, frequency: null, kind: 'debris', hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null }, { stableId: 30, room: 'Bridge', eta: 10, frequency: null, kind: 'debris', hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null }]);
    expect(panel.selector).toBe(0); expect(panel.torpedo).toEqual({ stock: TORP_START, cap: TORP_CAP, loaded: false, load: 0, fetch: false, fed: false });
    expect(panel.cursor).toBe(0);                                                  // sitDown selected id 10 (slot 1), which is targets[0]
    weaponSelection(s).cursor = 0;                                                    // slot 0 is id 30: targets[1]
    expect((buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as WeaponsPanel).cursor).toBe(1);
    s.debris.warned.fill(0); weaponSelection(s).cursor = -1;
    const empty = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as WeaponsPanel;
    expect(empty.targets).toEqual([]); expect(empty.cursor).toBe(-1);
  });
  it('shows the Science and Navigation panels', () => {
    const s = makeState(2), A = room(s, 'A');
    placeDebris(s, A, seconds(10), 1);
    sitDown(s, 0, s.derived.stationOfKind[StationKind.Science]!); sitDown(s, 1, s.derived.stationOfKind[StationKind.Navigation]!);
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' });
    const sciPanel = m.players[0]!.console as SciencePanel, navPanel = m.players[1]!.console as NavigationPanel;
    expect(sciPanel.kind).toBe('science'); expect(sciPanel.leadSeconds).toBeCloseTo(18); expect(sciPanel.targets).toHaveLength(1); expect(sciPanel.cursor).toBe(0); expect(sciPanel.scanning).toBe(false);
    expect(navPanel.kind).toBe('navigation'); expect(navPanel.evadeChance).toBeCloseTo(0.35);
  });
  it('shows a scanned frequency in the threat text and on both panels, with scan progress and the selector and torpedo state', () => {
    const s = makeState(2), A = room(s, 'A'), B = room(s, 'B');
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!, sci = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 300, 1, 10, 2); placeDebris(s, B, 600, 1, 20, 3);
    s.debris.scanned[0] = 1; s.debris.scan[0] = 1; s.debris.scan[1] = 0.4;
    sitDown(s, 0, wpn); sitDown(s, 1, sci); s.science.scanning = 1; s.science.target = targetRef(s, 1);
    s.weapons.selector = 3; s.weapons.torpedoLoaded = 1; s.weapons.torpedoStock = 2; s.weapons.torpedoLoad = 0;
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' });
    expect(m.threats.map((t) => t.text)).toEqual(['Debris: Bridge 5s freq 2', 'Debris: Weapons Bay 10s']);
    expect(m.weapons).toEqual({ charge: 0, ready: false, torpedoLoaded: true, torpedoStock: 2 });
    const w = m.players[0]!.console as WeaponsPanel;
    expect(w.selector).toBe(3); expect(w.torpedo).toEqual({ stock: 2, cap: TORP_CAP, loaded: true, load: 0, fetch: false, fed: false });
    expect(w.targets.map((t) => t.frequency)).toEqual([2, null]);
    const p = m.players[1]!.console as SciencePanel;
    expect(p.targets).toEqual([{ stableId: 10, kind: 'debris', hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null, room: 'Bridge', eta: 5, frequency: 2, scan: 1 }, { stableId: 20, kind: 'debris', hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null, room: 'Weapons Bay', eta: 10, frequency: null, scan: 0.4 }]);
    expect(p.cursor).toBe(1); expect(p.scanning).toBe(true);
  });
  it('threat rows: the enemy first with its hull percent, shots with and without a scanned frequency; none when absent', () => {
    const s = makeState(1), A = room(s, 'A'); quiet(s);
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).threats.some((t) => t.text.startsWith('Enemy'))).toBe(false);
    placeEnemy(s); s.enemy.hull = 64;
    placeShot(s, A, 7 * 60, 1); const k2 = placeShot(s, A, 7 * 60, 1, undefined, 2); s.debris.scanned[k2] = 1;
    const th = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).threats;
    expect(th[0]).toEqual({ icon: 'icon.weapons', text: 'Enemy 64% shields 1/1' });
    const shotRows = th.filter((t) => t.text.startsWith('Shot'));
    expect(shotRows).toEqual([{ icon: 'icon.sensors', text: `Shot: ${s.layout.rooms[A]!.name} 7s` }, { icon: 'icon.sensors', text: `Shot: ${s.layout.rooms[A]!.name} 7s freq 2` }]);
  });
  it('target rows: the enemy row on Weapons and Science, nothing throws with the cursor on the enemy or with it unselected', () => {
    const s = makeState(2), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!, c = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 600, 1); placeEnemy(s); s.enemy.hull = 64; sitDown(s, 0, w); sitDown(s, 1, c);
    const k = placeShot(s, A, 420, 1, undefined, 2); s.debris.scanned[k] = 1;
    weaponSelection(s).cursor = ENEMY_SLOT;                                   // Science stays on the object
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' });
    const wp = m.players[0]!.console as WeaponsPanel, sp = m.players[1]!.console as SciencePanel;
    expect(wp.targets[1]).toEqual({ enemyRoom: EnemyRoom.Hold, stableId: s.enemy.stableId, kind: 'enemy', room: 'Enemy ship', eta: ENCOUNTER_MAX, frequency: null, hull: 0.64, system: null, status: null, shieldsUp: true, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null });   // Weapons: the Hold room (spec Demo-x-c section 4)
    expect(wp.cursor).toBe(1); expect(wp.first).toBe(0);
    expect(sp.targets[1]).toEqual({ stableId: s.enemy.stableId, kind: 'enemy', room: 'Enemy ship', eta: ENCOUNTER_MAX, frequency: null, hull: 0.64, system: null, status: null, shieldsUp: true, layers: 1, layersMax: 1, weaponCharge: 0, fleeSeconds: 0, scan: 0 });
    expect(sp.targets[0]!.kind).toBe('debris'); expect(sp.cursor).toBe(0);
    for (const panel of [wp, sp]) expect(panel.targets.find((t) => t.stableId === s.debris.stableId[k])).toMatchObject({ kind: 'shot', frequency: 2, eta: 7, hull: null });
  });
  it('targetWindow follows the cursor; a twelve-entry list with the cursor last gives first 3 on Weapons', () => {
    expect([targetWindow(-1, 3, 6), targetWindow(5, 9, 6), targetWindow(6, 9, 6), targetWindow(8, 9, 6), targetWindow(8, 9, 7), targetWindow(2, 2, 6)]).toEqual([0, 0, 1, 3, 2, 0]);
    const s = makeState(1), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!;
    for (let n = 0; n < 8; n++) placeDebris(s, A, 600, 1); placeEnemy(s);
    sitDown(s, 0, w); weaponSelection(s).cursor = ENEMY_SLOT;
    const wp = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as WeaponsPanel;
    expect(wp.targets).toHaveLength(13); expect(wp.cursor).toBe(8); expect(wp.first).toBe(3);   // eight objects and five rooms (spec Demo-x-c section 4)
    weaponSelection(s).cursor = ENEMY_SHIELDS_SLOT; const wp2 = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as WeaponsPanel; expect(wp2.cursor).toBe(12); expect(wp2.first).toBe(7);
    run(s, 1, () => intents({ cancelPressed: true })); const c = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 0, c); s.science.target = targetRef(s, ENEMY_SLOT);
    const sp = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as SciencePanel;
    expect(sp.targets).toHaveLength(9); expect(sp.cursor).toBe(8); expect(sp.first).toBe(2);        // seven Science rows; the ship is one row there (spec Demo-x-c section 4)
  });
  it('targetRowText renders the exact row strings for debris, shots and the enemy on both panels', () => {
    const debris = { stableId: 1, kind: 'debris' as const, room: 'Engine', eta: 7, frequency: null, hull: null, system: null, status: null, shieldsUp: null, layers: null as number | null, layersMax: null as number | null, weaponCharge: null as number | null, fleeSeconds: null as number | null };
    expect(targetRowText(debris)).toBe('Engine 7s freq ?'); expect(targetRowText({ ...debris, frequency: 2 })).toBe('Engine 7s freq 2'); expect(targetRowText(debris, 0.4)).toBe('Engine 7s freq ? 40%');
    const shot = { ...debris, kind: 'shot' as const };
    expect(targetRowText(shot)).toBe('Shot Engine 7s freq ?'); expect(targetRowText({ ...shot, frequency: 2 })).toBe('Shot Engine 7s freq 2'); expect(targetRowText(shot, 0.4)).toBe('Shot Engine 7s freq ? 40%'); expect(targetRowText({ ...shot, frequency: 2 }, 0.4)).toBe('Shot Engine 7s freq 2');
    const enemy = { stableId: 9, kind: 'enemy' as const, room: 'Enemy ship', eta: 87, frequency: null, hull: 0.64, system: null, status: null, shieldsUp: true, layers: 1, layersMax: 1, weaponCharge: 0, fleeSeconds: 0 };
    expect(targetRowText(enemy)).toBe('Enemy 64% leaves 87s freq ? [#]'); expect(targetRowText(enemy, 0.4)).toBe('Enemy 64% leaves 87s freq ? [#] 40%');   // marker, then the scan suffix
  });
  it('targetRowText: the hull row markers and scan suffix, the subsystem rows intact and down', () => {
    const hull = { stableId: 9, kind: 'enemy' as const, room: 'Enemy ship', eta: 87, frequency: null as number | null, hull: 0.64, system: null, status: null, shieldsUp: true as boolean | null, layers: 1 as number | null, layersMax: 1 as number | null, weaponCharge: 0 as number | null, fleeSeconds: 0 as number | null };
    expect(targetRowText(hull)).toBe('Enemy 64% leaves 87s freq ? [#]'); expect(targetRowText({ ...hull, frequency: 2 })).toBe('Enemy 64% leaves 87s freq 2 [#]');
    expect(targetRowText({ ...hull, frequency: 2, shieldsUp: false })).toBe('Enemy 64% leaves 87s shields down'); expect(targetRowText({ ...hull, shieldsUp: false }, 0.4)).toBe('Enemy 64% out 87s shields down 40%');
    expect(targetRowText(hull, 0.4)).toBe('Enemy 64% leaves 87s freq ? [#] 40%'); expect(targetRowText({ ...hull, frequency: 2 }, 1)).toBe('Enemy 64% leaves 87s freq 2 [#]');
    const sys = (system: number, hp: number, repairIn: number | null) => ({ ...hull, hull: null, system, status: { hp, repairIn } });
    expect(targetRowText(sys(0, 30, null))).toBe('Enemy weapons 100%'); expect(targetRowText(sys(0, 15, null))).toBe('Enemy weapons 50%');
    expect(targetRowText(sys(0, 0, 31))).toBe('Enemy weapons DOWN 31s'); expect(targetRowText(sys(1, 0, 1))).toBe('Enemy engines DOWN 1s'); expect(targetRowText(sys(2, 30, null), 0.4)).toBe('Enemy shields 100%');
  });
  it('the model gives five enemy room rows on Weapons in window order with system and status, the ship row on Science with its scan, and the threat rows (spec Demo-x-c section 4)', () => {
    const s = makeState(2), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!, c = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 600, 1); placeEnemy(s, 64, 2); sitDown(s, 0, w); sitDown(s, 1, c); s.enemy.scan = 0.4;
    let m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }); let wp = m.players[0]!.console as WeaponsPanel, sp = m.players[1]!.console as SciencePanel;
    expect(wp.targets.slice(1).map((t) => [t.kind, t.system, t.status, t.shieldsUp, t.frequency, t.hull])).toEqual([
      ['enemy', null, null, true, null, 0.64], ['enemy', 0, { hp: 30, repairIn: null }, true, null, 0.64], ['enemy', 3, { hp: 30, repairIn: null }, true, null, 0.64], ['enemy', 1, { hp: 30, repairIn: null }, true, null, 0.64], ['enemy', 2, { hp: 30, repairIn: null }, true, null, 0.64]]);
    expect(wp.targets.slice(1).map((t) => t.enemyRoom)).toEqual([EnemyRoom.Hold, EnemyRoom.Weapons, EnemyRoom.Piloting, EnemyRoom.Engines, EnemyRoom.Shields]);
    expect(sp.targets.slice(1).map((t) => t.scan)).toEqual([0.4]);
    expect(m.threats[0]).toEqual({ icon: 'icon.weapons', text: 'Enemy 64% shields 1/1' });
    s.enemy.scanned = 1;
    expect((buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[1]!.console as SciencePanel).targets[1]).toMatchObject({ frequency: 2, shieldsUp: true });   // revealed on the ship row, shields still up
    disableSystem(s, EnemySystem.Weapons);
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).threats[0]!.text).toEqual('Enemy 64% shields 1/1'); expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).threats[1]!.text).toBe('Down: weapons');   // two rows at the larger font (spec Demo-x-c section 1)
    disableSystem(s, EnemySystem.Shields);
    m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }); wp = m.players[0]!.console as WeaponsPanel;
    expect((m.players[1]!.console as SciencePanel).targets[1]).toMatchObject({ frequency: 2, shieldsUp: false }); expect(wp.targets[2]!.status).toEqual({ hp: 0, repairIn: 45 }); expect(wp.targets[5]!.status).toEqual({ hp: 0, repairIn: 45 });
    expect(m.threats[0]!.text).toBe('Enemy 64% shields DOWN'); expect(m.threats[1]!.text).toBe('Down: weapons');
    guardDebris(s);                                                                       // a read at slots 8..11 throws: the model must branch before indexing
    expect(() => { for (const slot of ENEMY_SLOTS) { weaponSelection(s).cursor = slot; s.science.target = targetRef(s, slot); buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }); } }).not.toThrow();
  });
  it('reports heat fraction, coolant and overdrive per Engineering row and per station, and the free coolant', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!, nav = s.derived.stationOfKind[StationKind.Navigation]!;
    s.power.capacity = 20; shiftBar(s, nav, 1); shiftBar(s, nav, 1);
    s.stations.heat[nav] = HEAT_MAX / 2; s.stations.coolant[nav] = 2; s.stations.coolant[s.derived.stationOfKind[StationKind.Science]!] = 1;
    sitDown(s, 0, eng);
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' });
    const panel = m.players[0]!.console as EngineeringPanel;
    expect(panel.rows[StationKind.Navigation]).toEqual({ kind: 0, name: 'Navigation', level: 3, max: 2, failed: false, heat: 0.5, coolant: 2, overdriven: true, unpowered: false });
    expect(panel.coolantFree).toBe(COOLANT_POOL - 3);
    const st = m.stations.find((x) => x.kind === StationKind.Navigation)!;
    expect(st.level).toBe(3); expect(st.max).toBe(2); expect(st.heat).toBe(0.5); expect(st.coolant).toBe(2); expect(st.overdriven).toBe(true);
  });
  it('reports the six skill levels per player and zeros for empty slots or no state', () => {
    const s = makeState(2);
    setSkill(s, 0, Skill.Navigation, 1); setSkill(s, 0, Skill.Repair, 3); setSkill(s, 1, Skill.Weapons, 10);
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' });
    expect(m.players[0]!.skills).toEqual([1, 0, 0, 0, 0, 3]); expect(m.players[1]!.skills).toEqual([0, 0, 10, 0, 0, 0]);
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(3), phase: 'running', message: '' }).players[2]!.skills).toEqual([0, 0, 0, 0, 0, 0]);
    expect(buildHudModel(null, fixtureCouchViewer(null), { slots: slots(1), phase: 'lobby', message: '' }).players[0]!.skills).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('the Engineering footer pool and the strip capacity include bonus bars while a skilled engineer sits, and drop after standing', () => {
    const s = makeState(1), eng = s.derived.stationOfKind[StationKind.Engineering]!;
    s.director.nextSpawnTick = 1e9; setSkill(s, 0, Skill.Engineering, 8); sitDown(s, 0, eng);
    const m1 = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' });
    expect((m1.players[0]!.console as EngineeringPanel).pool).toBe(3); expect(m1.power).toEqual({ capacity: 12, used: 9 });
    shiftBar(s, s.derived.stationOfKind[StationKind.Science]!, 1); shiftBar(s, s.derived.stationOfKind[StationKind.Medbay]!, 1); shiftBar(s, s.derived.stationOfKind[StationKind.Medbay]!, 1);
    const m2 = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' });
    expect((m2.players[0]!.console as EngineeringPanel).pool).toBe(0); expect(m2.power).toEqual({ capacity: 12, used: 12 });
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).power).toEqual({ capacity: 10, used: 10 });
  });
  it("reports each slot's character with trait names, from the state when there is one and from the default list otherwise", () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS);
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(3), phase: 'running', message: '' });
    expect(m.players[0]!.character).toEqual({ name: 'Okoro', asset: 'Quick Hands', complication: 'Heavy Boots' });
    expect(m.players[1]!.character).toEqual({ name: 'Lindqvist', asset: 'Cool Head', complication: 'Flammable' });
    expect(m.players[2]!.character).toEqual({ name: 'Reyes', asset: 'Iron Lungs', complication: 'Slow Learner' });   // slot beyond the crew: the default list
    const lobby = buildHudModel(null, fixtureCouchViewer(null), { slots: slots(4), phase: 'lobby', message: '' });
    expect(lobby.players[3]!.character).toEqual({ name: 'Dubois', asset: 'Sprinter', complication: 'Frail' });
    const recruit = makeState(1);
    expect(buildHudModel(recruit, fixtureCouchViewer(recruit), { slots: slots(1), phase: 'running', message: '' }).players[0]!.character).toEqual({ name: 'Recruit', asset: '', complication: '' });
    expect(m.players[1]!.skills).toEqual([0, 3, 0, 0, 0, 0]);                                              // Lindqvist's head start shows as a level
  });
  it('the game-over summary has six headline lines then one skill line per crew member, and is null in every other phase', () => {
    const s = makeState(3, 1, DEFAULT_CHARACTERS); const t = s.telemetry;
    s.tick = 452 * 60; s.ended = 1; s.endReason = EndReason.Hull;
    t.firstDownTick = 190 * 60 - 1; t.firstDownPid = 0;                       // Okoro at 3:10
    t.mannedTicks.fill(1); t.mannedTicks[StationKind.Doors] = 0; t.mannedTicks[StationKind.Medbay] = 0;
    t.longestIdle.set([95 * 60, 40 * 60, 7 * 60]);
    setSkill(s, 2, Skill.Science, 3); setSkill(s, 0, Skill.Repair, 4); setSkill(s, 0, Skill.Navigation, 1);
    const over = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(3), phase: 'gameover', message: 'HULL LOST' });
    expect(over.summary).toEqual([
      'Survived 7:32  HULL LOST  Reached sector 1 node 1  Score 0', 'First down: Okoro 3:10   First death: none', 'Never manned: Medbay, Doors', 'Longest idle: Okoro 95 s, Lindqvist 40 s, Reyes 7 s', `Ship: ${QUIRK_NAMES[s.run.quirk]}`, 'Teamwork  locked shots 0  shared repairs 0s  revives 0',   // StationKind order, as in the record
      'Okoro: Navigation 0 -> 1, Repair 3 -> 4', 'Lindqvist: no skill gains', 'Reyes: Science 2 -> 3']);
    for (const phase of ['lobby', 'paused', 'running'] as const) expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(3), phase: phase, message: '' }).summary).toBeNull();
    expect(buildHudModel(null, fixtureCouchViewer(null), { slots: slots(1), phase: 'gameover', message: '' }).summary).toBeNull();
    s.endReason = EndReason.Crew; t.mannedTicks.fill(1); t.firstDeathTick = 452 * 60 - 1; t.firstDeathPid = 2;
    const crew = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(3), phase: 'gameover', message: 'CREW LOST' }).summary!;
    expect(crew[0]).toBe('Survived 7:32  CREW LOST  Reached sector 1 node 1  Score 0'); expect(crew[1]).toBe('First down: Okoro 3:10   First death: Reyes 7:32'); expect(crew[2]).toBe('Every station manned');
    const four = makeState(4, 1, DEFAULT_CHARACTERS); four.ended = 1; four.endReason = EndReason.Hull;
    expect(buildHudModel(four, fixtureCouchViewer(four), { slots: slots(4), phase: 'gameover', message: '' }).summary).toEqual([
      'Survived 0:00  HULL LOST  Reached sector 1 node 1  Score 0', 'First down: none   First death: none', 'Never manned: Navigation, Weapons, Science, Engineering, Life Support, Medbay, Doors',
      'Longest idle: Okoro 0 s, Lindqvist 0 s, Reyes 0 s, Dubois 0 s', `Ship: ${QUIRK_NAMES[four.run.quirk]}`, 'Teamwork  locked shots 0  shared repairs 0s  revives 0',
      'Okoro: no skill gains', 'Lindqvist: no skill gains', 'Reyes: no skill gains', 'Dubois: no skill gains']);
  });
  it('reports the director phase name and stress', () => {
    const s = makeState(2); s.director.phase = Phase.PeakFade; s.director.stress = 0.42;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).director).toEqual({ phase: 'Peak Fade', stress: 0.42 });
    expect(buildHudModel(null, fixtureCouchViewer(null), { slots: slots(1), phase: 'lobby', message: '' }).director).toEqual({ phase: 'Build Up', stress: 0 });
  });
  it('boarders: threat rows per room after the enemy row, the Fight prompt with a draining bar, and the markers', () => {
    const s = makeState(1), A = room(s, 'A'), G = room(s, 'G'); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).boarders).toEqual([]); expect(buildHudModel(null, fixtureCouchViewer(null), { slots: slots(1), phase: 'lobby', message: '' }).boarders).toEqual([]);
    const k0 = placeBoarder(s, G), k1 = placeBoarder(s, A), k2 = placeBoarder(s, G, 30);
    placeEnemy(s); igniteRoom(s, room(s, 'B'));
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' });
    expect(m.threats.slice(0, 4).map((t) => t.text)).toEqual([expect.stringMatching(/^Enemy [0-9]/), 'Boarders: Bridge x1', 'Boarders: Crew Quarters x2', 'Fire: Weapons Bay']);
    expect(m.threats[1]!.icon).toBe('icon.sensors');
    expect(m.boarders).toEqual([
      { stableId: s.boarders.stableId[k0], x: 4 - 0.6, y: 9.5, health: 1 },
      { stableId: s.boarders.stableId[k1], x: 3 - 0.2, y: 2.5, health: 1 },
      { stableId: s.boarders.stableId[k2], x: 4 + 0.2, y: 9.5, health: 0.5 }]);
    expect(m.boarders).toEqual(boarderMarkers(s));
    teleport(s, 0, 2.5, 9.5);
    const lowId = s.boarders.stableId[k0]!; s.boarders.stableId[k0] = s.boarders.stableId[k2]!; s.boarders.stableId[k2] = lowId;
    let p = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!;
    expect(p.interactPrompt).toBe('Fight boarder'); expect(p.interactIcon).toBeNull(); expect(p.progress).toBeCloseTo(30 / BOARDER_HEALTH, 12);
    s.boarders.health[k2] = 15; p = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!; expect(p.progress).toBeCloseTo(15 / BOARDER_HEALTH, 12);
  });
  it('the clock card carries the hull, time and FUEL, then the sector and node (spec Loop-i sections 1 and 2); the Navigation panel lists destinations, cursor and jump state; the footer shows the fuel left after the highlighted jump', () => {
    const s = makeState(2); quiet(s); const model = () => buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' });
    expect([clockLine(model()), sectorLine(model())]).toEqual(['HULL 100   FUEL 8', 'SECTOR 1/3  node 1/6']); expect(model().run.quirk).toBe(QUIRK_NAMES[s.run.quirk]); expect([clockLine(buildHudModel(null, fixtureCouchViewer(null), { slots: slots(1), phase: 'lobby', message: '' })), sectorLine(buildHudModel(null, fixtureCouchViewer(null), { slots: slots(1), phase: 'lobby', message: '' }))]).toEqual(['HULL 0   FUEL 0', 'SECTOR 1/3  node 1/6']);
    s.run.column = 3; s.run.sector = 1; s.run.fuel = 6; expect([clockLine(model()), sectorLine(model())]).toEqual(['HULL 100   FUEL 6', 'SECTOR 2/3  node 4/6']);
    s.tick = 999 * 60; expect(clockLine(model()).length).toBeLessThanOrEqual(20); s.tick = 0;   // the 240 px card holds about 20 glyphs at the larger font (tests/hudFit measures it)
    s.run.column = 0; s.run.sector = 0; s.run.fuel = 8; setMap(s, [1, 2, 2, 2, 2, 1], { '0:0': 0b11, '1:0': 1, '1:1': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1 }); setNodeTypes(s, {});   // all Hazard: the labels are plain node labels
    const n = seatNavigator(s, 0); cardSelection(s, n).cursor = 1; s.run.jumpCharge = 0.64;
    const nav = () => model().players[0]!.console as NavigationPanel, p = nav();
    const evade = `Evade ${Math.round((EVADE_BASE + EVADE_SCALE * stationOutput(s, n)) * 100)}%`;
    expect(p.here).toBe('Node 1a'); expect(p.rows.map((r) => [r.text, r.selectable, r.enabled, r.cursor])).toEqual([['Node 2a  ?', true, true, false], ['Node 2b  ?', true, true, true]]);   // no evade row at a calm beacon (spec Demo-xii section 4) expect(p.scrap).toBe(0); expect(p.jump).toEqual({ charge: 0.64, ready: false }); expect([p.fuel, p.fuelAfter]).toEqual([8, 7]);
    expect(navigationFooter(p)).toBe(`${evade}  Jump 64%  Fuel 8>7  Scrap 0`);
    cardSelection(s, n).cursor = 2; expect(navigationFooter(nav())).toBe(`${evade}  Jump 64%  Fuel 8  Scrap 0`);   // the evade row: no jump chosen
    cardSelection(s, n).cursor = 1; chargeJump(s); expect(navigationFooter(nav())).toBe(`${evade}  Jump READY  Fuel 8>7  Scrap 0`);
    s.run.column = SECTOR_COLUMNS - 1; cardSelection(s, n).cursor = 0; const f = nav();
    expect(f.rows.map((r) => r.text)).toEqual(['Jump to sector 2']); expect(navigationFooter(f)).toBe(`${evade}  Jump READY  Fuel 8>7  Scrap 0`);
    s.run.fuel = 0; expect(nav().rows.map((r) => r.text)).toEqual(['Wait for help']); expect(navigationFooter(nav())).toBe(`${evade}  Jump READY  Fuel 0  Scrap 0`);
    s.run.fuel = 10; s.run.scrap = 999; s.run.column = 0; cardSelection(s, n).cursor = 0; const wide = navigationFooter(nav());
    expect(wide).toBe(`${evade}  Jump READY  Fuel 10>9  Scrap 999`); expect(wide.length).toBeLessThanOrEqual(44);   // 44 glyphs at about 6.25 px fit the 308 px card from x = 8 (CONSOLE_LINE_MAX 40 is the card's comfortable budget)
  });
  it('the panel window and the highlighted row come from the model: the first selectable row while the sim cursor is still 0, the cursor row scrolls the window', () => {
    const e = makeState(2); quiet(e); mapM(e); e.run.column = 1; e.run.node = 2; setEvent(e, 4); seatNavigator(e, 0);
    const ep = buildHudModel(e, fixtureCouchViewer(e), { slots: slots(2), phase: 'running', message: '' }).players[0]!.console as NavigationPanel; expect([ep.rows[0]!.cursor, ep.rows[2]!.cursor, ep.first]).toEqual([false, true, 0]);
    const s = makeState(2); quiet(s); setMap(s, [1, 3, 2, 2, 2, 1], { '0:0': 0b101, '1:0': 0b11 }); s.run.column = 1; s.run.node = 0; setNodeTypes(s, { '1:0': NodeType.Shop }); const n = seatNavigator(s, 0);
    cardSelection(s, n).cursor = 7; const p = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.console as NavigationPanel; expect(p.rows).toHaveLength(8); expect(p.first).toBe(1);   // three shop items (spec Loop-ii section 3), two forward and one sideways destination, evade
    cardSelection(s, n).cursor = 1; expect((buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.console as NavigationPanel).first).toBe(0);
  });
  it('event and shop rows: four event rows with the cursor on the first choice, the shop list, the footer scrap, the threat rows last, and baseMax on the power rows', () => {
    const s = makeState(2); quiet(s); mapM(s); s.run.column = 1; s.run.node = 2; setEvent(s, 4); grantScrap(s, 45); const n = seatNavigator(s, 0); run(s, 1); fixtureCardUi(s);
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }); const p = m.players[0]!.console as NavigationPanel;
    expect(p.rows.map((r) => [r.text, r.selectable, r.enabled, r.cursor])).toEqual([['Supply cache', false, false, false], ['A cache, hard-wired to something.', false, false, false], ['Take the scrap (+40)', true, true, true], ['Strip it bare (+60, a station fails)', true, true, false]]);
    expect(p.scrap).toBe(45); s.run.jumpCharge = 0.64; expect(navigationFooter(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.console as NavigationPanel)).toMatch(/^Evade \d+%  Jump 64%  Fuel 8  Scrap 45$/);
    expect(m.threats).toEqual([{ icon: 'icon.sensors', text: 'Event: Supply cache', info: true }]);   // spec Demo-i section 4: the run rows trail the hazards
    igniteRoom(s, room(s, 'A')); placeEnemy(s); const t = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).threats; expect(t[0]!.icon).toBe('icon.weapons'); expect(t[1]!.text).toBe('Fire: Bridge'); expect(t[2]!.text).toBe('Event: Supply cache');
    setNodeTypes(s, { '1:2': NodeType.Shop }); const sh = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).threats; expect(sh.map((x) => x.text).slice(-2)).toEqual(['Event: Supply cache', 'Shop here']); expect(sh.map((x) => x.text).slice(0, 2)).toEqual([expect.stringMatching(/^Enemy [0-9]/), 'Fire: Bridge']);
    resolveEvent(s, 0); const q = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.console as NavigationPanel;
    expect(q.rows).toHaveLength(7); expect(q.rows[0]!.text).toBe('Shop   scrap 85'); expect(q.rows[1]!.text).toBe('Hull +25 (30 scrap)'); expect(q.rows[1]!.enabled).toBe(false); expect(q.rows[3]!.text).toBe('Fuel +2 (12 scrap)'); expect(q.rows[4]!.text).toBe('Node 3a  ?');   // mask 1:2 = 1: one forward destination, then the sideways Node 2b
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).threats.map((x) => x.text).slice(-1)).toEqual(['Shop here']);
    s.run.upgrades[StationKind.Weapons] = 1; const eng = s.derived.stationOfKind[StationKind.Engineering]!; sitDown(s, 1, eng);
    const m2 = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }); expect(m2.stations.find((x) => x.kind === StationKind.Weapons)!.max).toBe(STATION_MAX[StationKind.Weapons]! + 1);
    expect((m2.players[1]!.console as EngineeringPanel).rows[StationKind.Weapons]!.max).toBe(STATION_MAX[StationKind.Weapons]! + 1); expect((m2.players[1]!.console as EngineeringPanel).rows[StationKind.Science]!.max).toBe(STATION_MAX[StationKind.Science]!);
    void n;
  });
  it('the summary carries the ship line, then the optional progress lines, then the gains', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS); s.ended = 1; s.endReason = EndReason.Hull;
    const ship = `Ship: ${QUIRK_NAMES[s.run.quirk]}`, gain = 'Okoro: no skill gains';
    const a = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'gameover', message: '' }).summary!; expect(a[4]).toBe(ship); expect(a[6]).toBe(gain);
    const b = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'gameover', message: '', credits: null, progress: { bestScore: 10, runs: 2, victories: 0, newUnlocks: [], unlocked: [] } }).summary!; expect(b[4]).toBe(ship); expect(b[6]).toBe('Best 10   Runs 2   Victories 0'); expect(b[7]).toBe(gain);
    const c = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'gameover', message: '', credits: null, progress: { bestScore: 10, runs: 2, victories: 0, newUnlocks: ['Scrap reserve'], unlocked: ['Scrap reserve'] } }).summary!; expect(c[7]).toBe('Unlocked: Scrap reserve'); expect(c[8]).toBe(gain);
  });
  it('the teamwork line (spec Coop-i section 4): locked shots, shared repair seconds (rounded), revives', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS); s.ended = 1; s.endReason = EndReason.Hull;
    s.telemetry.lockedShots = 4; s.telemetry.teamSeconds = 37.6; s.telemetry.revives = 2;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'gameover', message: '' }).summary![5]).toBe('Teamwork  locked shots 4  shared repairs 38s  revives 2');
  });
  it('the game-over headline counts the node and names a victory', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS); s.tick = 452 * 60; s.ended = 1; s.endReason = EndReason.Hull;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'gameover', message: '' }).summary![0]).toBe('Survived 7:32  HULL LOST  Reached sector 1 node 1  Score 0');
    s.endReason = EndReason.Victory; s.run.sector = 2; s.run.column = 5; s.run.nodesReached = 17; s.telemetry.scrapEarned = 145;
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'gameover', message: '' }).summary![0]).toBe('Survived 7:32  VICTORY  Reached sector 3 node 6  Score 2345');
  });
});

describe('Demo-i HUD: controls card, enemy hull row, threat row, threat order (spec sections 3, 4, 8, 11.4, 11.5)', () => {
  const CARD = [
    'Move: WASD or left stick      Interact: E / A      Confirm: F / X      Cancel: Q / B',
    'Keyboard 2: arrows, Enter (Interact), Right Shift (Confirm), Backspace (Cancel)',
    'Stand by a console, press Confirm to sit. Up/Down pick a row, Confirm acts, Cancel stands',
    'Hold Interact at a fire, breach, failed console or downed friend. Repairs need a bar',
    'Navigation jumps when the drive reads READY. Events and shops are chosen there',
    'Cross three sectors, then destroy the Warden',
    'Callout: R / Slash / Y shows what you need over your head',
  'Science locks the frequency, Weapons fires. Two on one job are faster',
  'Helm: evade as a hit lands. Torpedoes are carried from the hold',
  'Events: everyone votes with Confirm. Jumps need a second Confirm'
  ];
  it('the lobby card is the ten exact ASCII lines (the callout line, spec Coop-i section 3; three co-op lines, Coop-ii) within LOBBY_LINE_MAX; every other phase gives none', () => {
    const skiffCard = CARD.map((l, k) => (k === 8 ? 'Helm: evade as a hit lands. Up from the top row, Left/Right: tabs' : l));   // the Skiff loads its own torpedoes and has console tabs (spec Demo-x-a amendment)
    // Art-iv-b: the Hound flies at every crew size; like the Skiff its tube loads itself and its consoles have tabs, so the lobby shows that helm line.
    for (const n of [1, 2, 3, 4]) expect(buildHudModel(null, fixtureCouchViewer(null), { slots: slots(n), phase: 'lobby', message: '' }).lobbyLines).toEqual(skiffCard);
    expect(skiffCard[8]!.length).toBeLessThanOrEqual(LOBBY_LINE_MAX);
    const s = makeState(1); quiet(s);
    for (const phase of ['running', 'gameover', 'paused', 'error'] as const) expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: phase, message: '' }).lobbyLines).toEqual([]);
    for (const l of CARD) { expect(l.length).toBeLessThanOrEqual(LOBBY_LINE_MAX); expect(/^[\x20-\x7e]+$/.test(l)).toBe(true); }
  });
  /** The hull row of the Weapons panel for an enemy placed with the given fields. */
  const hullRow = (s: ReturnType<typeof makeState>) => { sitDown(s, 0, s.derived.stationOfKind[StationKind.Science]!); const wp = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as SciencePanel;  const t = wp.targets.find((x) => x.kind === 'enemy' && x.system === null)!; return { t, text: targetRowText(t) }; };   // the ship row is Science's since Demo-x-c (Weapons targets rooms)
  const charge = (s: ReturnType<typeof makeState>, frac: number) => { s.enemy.shotArmTick = s.tick - Math.round(frac * 100); s.enemy.nextShotTick = s.tick + Math.round((1 - frac) * 100); };
  it('the enemy hull row in four states: full at column 0, a stripped layer at column 5 scanned, shields down, fleeing', () => {
    const a = makeState(1); quiet(a); placeEnemy(a);
    expect(hullRow(a).text).toBe('Enemy 100% leaves 120s freq ? [#]'); expect(hullRow(a).t).toMatchObject({ layers: 1, layersMax: 1, weaponCharge: 0, fleeSeconds: 0 });
    const b = makeState(1); quiet(b); b.run.column = 5; placeEnemy(b, 150, 2); b.enemy.shieldLayers = 1; b.enemy.scanned = 1; charge(b, 0.5);
    expect(hullRow(b).text).toBe('Enemy 100% leaves 120s freq 2 [#.]'); expect(hullRow(b).t).toMatchObject({ layers: 1, layersMax: 2, weaponCharge: 0.5, hull: 1 });
    const c = makeState(1); quiet(c); placeEnemy(c, 64); disableSystem(c, EnemySystem.Shields); c.enemy.departTick = c.tick + 90 * 60; charge(c, 0.7);
    expect(hullRow(c).text).toBe('Enemy 64% leaves 90s shields down');
    const d = makeState(1); quiet(d); placeEnemy(d, 20); disableSystem(d, EnemySystem.Shields); d.enemy.fleeing = 1; d.enemy.surrenderIntact = 1; d.enemy.departTick = d.tick + 7 * 60; charge(d, 0.3);
    expect(hullRow(d).text).toBe('Enemy 20% FLEE 7s shields down'); expect(hullRow(d).t.fleeSeconds).toBe(7);
  });
  it('room rows carry no layer fields; the Hold row carries the hull as a fraction of maxHull', () => {
    const s = makeState(1); quiet(s); s.run.column = 5; placeEnemy(s, 75); sitDown(s, 0, s.derived.stationOfKind[StationKind.Weapons]!);
    const wp = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as WeaponsPanel;
    expect(wp.targets.find((t) => t.system === null)!.hull).toBe(0.5); expect(wp.targets.filter((t) => t.system !== null).map((t) => [t.layers, t.layersMax, t.weaponCharge, t.fleeSeconds])).toEqual([[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]]);
  });
  it('the threat rows: shields n/m while up or DOWN, FLEEING; the other systems down on a second row (spec Demo-x-c section 1: two rows fit the panel at the larger font); the percentage uses maxHull', () => {
    const s = makeState(1); quiet(s); placeEnemy(s);
    const row = () => buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).threats.find((t) => /^Enemy [0-9]/.test(t.text))!.text, down = () => buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).threats.find((t) => t.text.startsWith('Down: '))?.text;
    expect(row()).toBe('Enemy 100% shields 1/1');
    s.enemy.hull = 64; disableSystem(s, EnemySystem.Weapons); disableSystem(s, EnemySystem.Shields); expect(row()).toBe('Enemy 64% shields DOWN'); expect(down()).toBe('Down: weapons');
    s.enemy.hull = 20; s.enemy.fleeing = 1; disableSystem(s, EnemySystem.Engines); expect(row()).toBe('Enemy 20% shields DOWN FLEEING'); expect(down()).toBe('Down: weapons engines');
    const t = makeState(1); quiet(t); t.run.column = 5; placeEnemy(t, 75); t.enemy.shieldLayers = 1; expect(buildHudModel(t, fixtureCouchViewer(t), { slots: slots(1), phase: 'running', message: '' }).threats[0]!.text).toBe('Enemy 50% shields 1/2');
  });
  it('threat order: an enemy, a fire, then Event, then Shop here (hazards before the run rows)', () => {
    const s = makeState(2); quiet(s); mapM(s); s.run.column = 1; s.run.node = 0; setNodeTypes(s, { '1:0': NodeType.Shop }); setEvent(s, 2); placeEnemy(s); igniteRoom(s, room(s, 'A'));
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).threats.map((t) => t.text)).toEqual([expect.stringMatching(/^Enemy [0-9]/), 'Fire: Bridge', 'Event: Smugglers', 'Shop here']);
  });
});

describe('Demo-ii HUD: unpowered consoles, card line 4, the enemy block (spec sections 3, 4, 7)', () => {
  const unp = (s: ReturnType<typeof makeState>, kind: number) => buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).stations.find((x) => x.kind === kind)!.unpowered;
  const rowUnp = (s: ReturnType<typeof makeState>, kind: number) => {
    const eng = s.derived.stationOfKind[StationKind.Engineering]!; sitDown(s, 0, eng);
    return (buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as EngineeringPanel).rows[kind]!.unpowered;
  };
  it('unpowered: a repaired console at level 0 is true, at level 1 false, a failed one false, Engineering never', () => {
    const s = makeState(1); quiet(s); teleport(s, 0, 17.5, 9.5);
    const w = s.derived.stationOfKind[StationKind.Weapons]!;
    failStation(s, w); expect(unp(s, StationKind.Weapons)).toBe(false);
    repairStation(s, w); s.stations.level[w] = 0; expect(unp(s, StationKind.Weapons)).toBe(true); expect(rowUnp(s, StationKind.Weapons)).toBe(true);
    s.stations.level[w] = 1; expect(unp(s, StationKind.Weapons)).toBe(false); expect(rowUnp(s, StationKind.Weapons)).toBe(false);
    failStation(s, w); expect(rowUnp(s, StationKind.Weapons)).toBe(false);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!; s.stations.level[eng] = 0;
    expect(unp(s, StationKind.Engineering)).toBe(false); expect(rowUnp(s, StationKind.Engineering)).toBe(false);
  });
  it('card line 4 is exact and at most 90 characters', () => {
    const line = buildHudModel(null, fixtureCouchViewer(null), { slots: slots(1), phase: 'lobby', message: '' }).lobbyLines[3]!;
    expect(line).toBe('Hold Interact at a fire, breach, failed console or downed friend. Repairs need a bar');
    expect(line.length).toBeLessThanOrEqual(LOBBY_LINE_MAX);
  });
  it('the enemy panel is gone from the HUD model (spec Demo-viii section 2)', () => {
    const s = makeState(2); quiet(s); placeEnemy(s);
    expect('enemy' in buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' })).toBe(false);
  });
  it('the right column: the map with a navigator seated, else the enemy window while it shows; never both (amendment R1)', () => {
    for (const enemy of [false, true]) for (const nav of [false, true]) for (const phase of ['running', 'paused'] as const) {
      const s = makeState(2); quiet(s); let a = freshWindowAnim();
      if (enemy) { placeEnemy(s); a = stepWindowAnim(a, s); s.tick += 60; }
      a = stepWindowAnim(a, s);
      if (nav) seatNavigator(s, 0);
      const view = enemyWindowModel(s, s.tick, a), col = rightColumn(s, phase, view), map = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: phase, message: '' }).map;
      const want = nav && phase === 'running' ? 'map' : enemy && !nav ? 'window' : 'none';
      expect(col, `enemy ${enemy} nav ${nav} ${phase}`).toBe(want);
      expect(map !== null, `map enemy ${enemy} nav ${nav} ${phase}`).toBe(col === 'map');
      expect(windowShown(s, view), `window enemy ${enemy} nav ${nav} ${phase}`).toBe(col === 'window');
    }
  });
});

describe('the Navigation evade row (spec Coop-ii section 1)', () => {
  it('reads EVADE: Confirm when ready, EVADING inside the window, EVADE 4s on the cooldown, dimmed while not ready', () => {
    const s = makeState(2); quiet(s); seatNavigator(s, 0); placeEnemy(s);   // the row shows with an enemy present (spec Demo-xii section 4)
    const row = () => { const p = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.console as NavigationPanel; return p.rows[p.rows.length - 1]!; };
    expect([row().text, row().selectable, row().enabled]).toEqual(['EVADE: Confirm', true, true]);
    s.run.evadeUntilTick = s.tick + 30; s.run.evadeReadyTick = s.tick + 400; expect([row().text, row().enabled]).toEqual(['EVADING', false]);
    s.run.evadeUntilTick = s.tick; s.run.evadeReadyTick = s.tick + 4 * 60; expect([row().text, row().enabled]).toEqual(['EVADE 4s', false]);
    s.run.evadeReadyTick = s.tick + 4 * 60 - 59; expect(row().text).toBe('EVADE 4s');   // whole seconds, rounded up
  });
});

describe('torpedo prompts (spec Coop-ii section 2)', () => {
  it('Take torpedo at the magazine, Load torpedo at Weapons while carrying; the panel reads FETCH on a magazine ship', () => {
    const s = cutterState(1, 2); quiet(s); const d = s.derived, w = d.width;
    teleport(s, 0, d.magazineTile % w + 0.5, Math.floor(d.magazineTile / w) + 0.5);
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.interactPrompt).toBe('Take torpedo');
    const wt = d.stationTile[d.stationOfKind[StationKind.Weapons]!]!; s.carrying[0] = 1; teleport(s, 0, wt % w - 0.5, Math.floor(wt / w) + 0.5);
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.interactPrompt).toBe('Load torpedo');
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.carrying).toBe(true);
    sitDown(s, 1, d.stationOfKind[StationKind.Weapons]!);
    const p = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[1]!.console as WeaponsPanel; expect(p.torpedo.fetch).toBe(true);
    s.weapons.torpedoFed = 1; expect((buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[1]!.console as WeaponsPanel).torpedo.fetch).toBe(false);
  });
});

describe('the standing Confirm prompt during votes and a pending jump (spec Coop-ii amendment D7)', () => {
  it('reads Vote 1, then Vote 2 after a first vote; Agree: jump while a jump waits; the footer shows the doubled evade chance during a manoeuvre', () => {
    const s = makeState(2); quiet(s); setEvent(s, 4);
    const p = () => buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[1]!;
    expect(p().confirmPrompt).toBe('Vote 1'); s.run.vote[1] = 0; expect(p().confirmPrompt).toBe('Vote 2'); s.run.vote[1] = 1; expect(p().confirmPrompt).toBe('Vote 1');
    s.run.eventChoice = 0; s.run.jumpPending = 0; s.run.jumpPendingTick = s.tick; expect(p().confirmPrompt).toBe('Agree: jump');
    const n = seatNavigator(s, 0); s.run.evadeUntilTick = s.tick + 30;
    const f = buildHudModel(s, fixtureCouchViewer(s), { slots: slots(2), phase: 'running', message: '' }).players[0]!.console as NavigationPanel;
    expect(f.evadeChance).toBeCloseTo(Math.min(0.8, 2 * (EVADE_BASE + EVADE_SCALE * stationOutput(s, n))), 12);
  });
});

// Spec Loop-ii section 2: the Engineering card's UPGRADES row, the Upgrades page and its footer.
describe('the Upgrades page in the HUD model', () => {
  const seat = (scrap: number) => { const s = makeState(1); quiet(s); const eng = s.derived.stationOfKind[StationKind.Engineering]!; sitDown(s, 0, eng); grantScrap(s, scrap); return { s, eng }; };
  const panelOf = (s: ReturnType<typeof makeState>) => buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as EngineeringPanel;
  it('the power page: the cursor on the UPGRADES row (index 7) and the pool footer', () => {
    const { s, eng } = seat(120); cardSelection(s, eng).cursor = 7; const p = panelOf(s);
    expect([p.page, p.cursor, p.scrap]).toEqual([0, 7, 120]); expect(engineeringFooter(p)).toBe(`pool 1   coolant ${COOLANT_POOL}/${COOLANT_POOL}`);
  });
  it('the Upgrades page rows, prices and footer, exactly; the cursor row; disabled rows', () => {
    const { s, eng } = seat(120); cardSelection(s, eng).page = 1; cardSelection(s, eng).cursor = StationKind.Weapons; const p = panelOf(s);
    expect(p.upgrades.map(upgradeRowText)).toEqual(['Navigation  lvl 2/5  30', 'Weapons  lvl 3/6  30', 'Science  lvl 2/5  30', 'Life Support  lvl 3/6  30', 'Medbay  lvl 2/5  30', 'Doors  lvl 1/4  30', 'Reactor  +1 bar  25', 'BACK']);
    expect(p.upgrades.map((r) => r.cursor)).toEqual([false, true, false, false, false, false, false, false]);
    expect(p.upgrades.map((r) => r.row)).toEqual([0, 1, 2, 4, 5, 6, REACTOR_ROW, REACTOR_ROW + 1]);
    expect(p.upgrades.every((r) => r.enabled)).toBe(true); expect(engineeringFooter(p)).toBe('Scrap 120');
    buyUpgrade(s, StationKind.Weapons); buyUpgrade(s, StationKind.Weapons); buyReactor(s); grantScrap(s, 40);
    const q = panelOf(s); expect(upgradeRowText(q.upgrades[1]!)).toBe('Weapons  lvl 5/6  60'); expect(upgradeRowText(q.upgrades[6]!)).toBe('Reactor  +1 bar  35');
    expect(q.upgrades.map((r) => r.enabled)).toEqual([true, false, true, true, true, true, true, true]);   // 60 needed for Weapons; BACK always
    s.run.upgrades[StationKind.Weapons] = 3; s.run.reactorBonus = 5; grantScrap(s, 999);
    const m = panelOf(s); expect(upgradeRowText(m.upgrades[1]!)).toBe('Weapons  lvl 6/6  MAX'); expect(upgradeRowText(m.upgrades[6]!)).toBe('Reactor  MAX'); expect([m.upgrades[1]!.enabled, m.upgrades[6]!.enabled]).toEqual([false, false]);
    expect(engineeringFooter(m)).toBe('Scrap 999');
  });
  it('every Upgrades page line fits CONSOLE_LINE_MAX at any level', () => {
    const { s, eng } = seat(999); cardSelection(s, eng).page = 1;
    for (let lvl = 0; lvl <= 3; lvl++) { s.run.upgrades.fill(lvl); s.run.reactorBonus = Math.min(5, lvl * 2); for (const r of panelOf(s).upgrades) expect(upgradeRowText(r).length, upgradeRowText(r)).toBeLessThanOrEqual(CONSOLE_LINE_MAX); }
    expect(engineeringFooter(panelOf(s)).length).toBeLessThanOrEqual(CONSOLE_LINE_MAX);
  });
});

// ---- Loop-iii: the Weapons card shows every gun (spec Loop-iii sections 3 and 4) ----
import { weaponsStrip, weaponsLootLine, weaponsFooter, weaponsFooterLines, weaponsFooterTone, weaponsRowTexts, objectThreatText } from '../src/renderer/src/render/hudModel';
import { Weapon, SWAP_SLOT } from '../src/renderer/src/sim/weapons';
import { LootWeapon } from '../src/renderer/src/sim/weaponDefs';
import { ENEMY_SYS_HP as SYS_HP_FULL } from '../src/renderer/src/sim/tuning';
import { rowPx } from '../src/renderer/src/render/theme';
import { CARD_INNER_W } from '../src/renderer/src/render/hudLayout';

describe('the Weapons card with loot weapons', () => {
  const seatedW = () => { const s = makeState(1); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, w); return { s, w }; };
  const panel = (s: ReturnType<typeof makeState>) => buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as WeaponsPanel;
  it('the strip: Pulse freq 1 2 3, the filled slots by short name, Torp; the selected one lit; the widest strip fits the card (spec Demo-xiv section 3)', () => {
    const { s } = seatedW();
    expect(weaponsStrip(panel(s))).toEqual([{ text: 'Pulse freq 1', lit: true, match: false }, { text: '2', lit: false, match: false }, { text: '3', lit: false, match: false }, { text: 'Torp', lit: false, match: false }]);
    s.weapons.slot[0] = LootWeapon.Burst; s.weapons.slot[1] = LootWeapon.Ion; s.weapons.selector = Weapon.Slot2;
    expect(weaponsStrip(panel(s)).map((p) => (p.lit ? `<${p.text}>` : p.text)).join(' ')).toBe('Pulse freq 1 2 3 Burst <Ion> Torp');
    s.weapons.slot[1] = 0; expect(weaponsStrip(panel(s)).map((p) => p.text)).toEqual(['Pulse freq 1', '2', '3', 'Burst', 'Torp']);
    s.weapons.slot[0] = LootWeapon.Missile; s.weapons.slot[1] = LootWeapon.Missile;
    expect(rowPx(weaponsStrip(panel(s)))).toBeLessThanOrEqual(CARD_INNER_W);   // the pixel fit rule (spec Demo-xii section 3) in place of the old glyph count
  });
  it('the footer: Pulse, Torp and the stock; the loot line one figure per extra slot (READY, a percentage, OFF below its Weapons level, EMPTY without a torpedo); all within the card', () => {
    const { s, w } = seatedW(); s.weapons.charge = 0.8; s.weapons.torpedoLoaded = 1;
    expect(weaponsFooter(panel(s))).toBe(`Pulse 80%  Torp LOADED  Stock ${TORP_START}/${TORP_CAP}`); expect(weaponsLootLine(panel(s))).toBe('');
    s.weapons.charge = 1; expect(weaponsFooter(panel(s)).startsWith('Pulse READY  ')).toBe(true);
    s.weapons.slot[0] = LootWeapon.Burst; s.weapons.charge2[0] = 1; s.weapons.slot[1] = LootWeapon.Heavy; s.weapons.charge2[1] = 0.4; s.stations.level[w] = 2;
    expect(weaponsLootLine(panel(s))).toBe('Burst READY  Heavy OFF');
    s.stations.level[w] = 4; expect(weaponsLootLine(panel(s))).toBe('Burst READY  Heavy 40%');
    s.weapons.slot[1] = LootWeapon.Missile; s.weapons.charge2[1] = 1; s.weapons.torpedoStock = 0; expect(weaponsLootLine(panel(s))).toBe('Burst READY  Missile EMPTY');
    s.weapons.slot[0] = LootWeapon.Missile; s.weapons.charge2[0] = 0.55; s.weapons.torpedoStock = TORP_CAP;
    expect(weaponsLootLine(panel(s)).length).toBeLessThanOrEqual(CONSOLE_LINE_MAX);
    placeEnemy(s); s.enemy.scanned = 1; s.enemy.lockUntilTick = s.tick + 100;
    const locked = weaponsFooter(panel(s)); expect(locked.endsWith('  LOCKED')).toBe(true); expect(locked.length).toBeLessThanOrEqual(44);   // 44 glyphs fit the 308 px card (as the Navigation footer)
  });
  it('a threats-panel object row reads freq N; too wide, a debris row drops its label (spec Demo-xiv section 3)', () => {
    expect(objectThreatText('Shot', 'Bridge', 7, 2)).toBe('Shot: Bridge 7s freq 2'); expect(objectThreatText('Rock', 'Bridge', 7, null)).toBe('Rock: Bridge 7s');
    expect(objectThreatText('Debris', 'Bridge', 7, 3)).toBe('Debris: Bridge 7s freq 3');
    expect(objectThreatText('Debris', 'Forward Corridor', 99, 3)).toBe('Forward Corridor 99s freq 3');
  });
  it('the strip marks the known enemy frequency in brackets, reads freq ? before the scan, and drops words to fit (spec Demo-xiv section 1)', () => {
    const { s } = seatedW(); placeEnemy(s, 100, 2);
    const row = () => weaponsStrip(panel(s)).map((p) => p.text).join(' ');
    expect(row()).toBe('Pulse freq 1 2 3 Torp freq ?');
    s.enemy.scanned = 1; expect(row()).toBe('Pulse freq 1 [2] 3 Torp'); expect(weaponsStrip(panel(s)).map((p) => p.match)).toEqual([false, true, false, false]);
    s.enemy.shieldFreq = 1; expect(row()).toBe('Pulse freq [1] 2 3 Torp');
    s.enemy.scanned = 0; s.enemy.sysHp[EnemySystem.Shields] = 0; expect(row()).toBe('Pulse freq 1 2 3 Torp');   // shields down: the frequency does not matter
    s.enemy.sysHp[EnemySystem.Shields] = SYS_HP_FULL; s.weapons.slot[0] = LootWeapon.Missile; s.weapons.slot[1] = LootWeapon.Missile;
    expect(row()).toBe('Pulse 1 2 3 Missile Missile Torp ?');   // the fit rule: never a smaller font
    s.enemy.scanned = 1; s.enemy.shieldFreq = 3; expect(row()).toBe('Pulse 1 2 [3] Missile Missile Torp');
  });
  it('the footer asks to match the frequency while a Pulse selector is off it and the shields are up, unlocked (spec Demo-xiv section 1)', () => {
    const { s } = seatedW(); placeEnemy(s, 100, 2); s.enemy.scanned = 1;
    expect(weaponsFooterLines(panel(s))[1]).toBe(`Stock ${TORP_START}/${TORP_CAP}  Match freq 2`); expect(weaponsFooterTone(panel(s))).toBe('match');
    s.weapons.selector = Weapon.BeamF2; expect(weaponsFooterLines(panel(s))[1]).toBe(`Stock ${TORP_START}/${TORP_CAP}`); expect(weaponsFooterTone(panel(s))).toBe('plain');
    s.weapons.selector = Weapon.Torpedo; expect(weaponsFooterLines(panel(s))[1]).not.toContain('Match');
    s.weapons.selector = Weapon.BeamF3; s.enemy.lockUntilTick = s.tick + 100; expect(weaponsFooterLines(panel(s))[1]).toBe(`Stock ${TORP_START}/${TORP_CAP}  LOCKED`); expect(weaponsFooterTone(panel(s))).toBe('locked');
    s.enemy.lockUntilTick = -1; s.enemy.sysHp[EnemySystem.Shields] = 0; expect(weaponsFooterLines(panel(s))[1]).not.toContain('Match');
    s.enemy.sysHp[EnemySystem.Shields] = SYS_HP_FULL; s.enemy.scanned = 0; expect(weaponsFooterLines(panel(s))[1]).not.toContain('Match');
  });
  it('the last shot result takes the second footer line for its three seconds (spec Demo-xiv section 2)', () => {
    const { s } = seatedW(); placeEnemy(s, 100, 2); s.enemy.scanned = 1; s.tick = 900;
    Object.assign(s.weapons, { lastShotTick: 900, lastShotTarget: ENEMY_SLOT, lastShotResult: 1, lastShotSelector: Weapon.BeamF1, lastShotDamage: 0 });
    expect(weaponsFooterLines(panel(s))[1]).toBe('Shield stripped (freq 1, needs 2)'); expect(weaponsFooterTone(panel(s))).toBe('strip');
    s.weapons.lastShotResult = 2; s.weapons.lastShotDamage = 15; expect(weaponsFooterLines(panel(s))[1]).toBe('Hit: Hold -15'); expect(weaponsFooterTone(panel(s))).toBe('hit');
    s.tick = 900 + 3 * 60; expect(weaponsFooterLines(panel(s))[1]).toBe(`Stock ${TORP_START}/${TORP_CAP}  Match freq 2`);
  });
  it('a filled slot takes the last target row for the loot line: five target rows, else six', () => {
    const { s } = seatedW(); expect(panel(s).rows).toBe(6); s.weapons.slot[1] = LootWeapon.Ion; expect(panel(s).rows).toBe(5);
  });
  it('the SWAP row: listed after the targets while cargo holds a weapon and no enemy is present; Down reaches it; Confirm swaps with the selected slot, or slot 1; no draws', () => {
    const { s, w } = seatedW(); s.weapons.slot[0] = LootWeapon.Burst; s.weapons.slot[1] = LootWeapon.Heavy; s.weapons.charge2[0] = 0.9; s.weapons.charge2[1] = 0.6; s.weapons.cargo = LootWeapon.Missile;
    weaponSelection(s).cursor = placeDebris(s, room(s, 'A'), 600, 1);   // the cursor on the one target: Down goes to the SWAP row
    expect(panel(s).swap).toBe('SWAP: cargo Missile for Burst'); expect(weaponsRowTexts(panel(s)).slice(-1)).toEqual(['SWAP: cargo Missile for Burst']);
    run(s, 1, () => intents({ moveY: 1 })); run(s, 1, () => intents({}));
    expect(s.weapons.target).toBeNull(); expect(panel(s).cursor).toBe(panel(s).targets.length);
    const r0 = JSON.stringify([s.rng.combat.s, s.rng.loot.s]);
    run(s, 1, () => intents({ confirmPressed: true }));
    expect([Array.from(s.weapons.slot), s.weapons.cargo, s.weapons.charge2[0], s.weapons.charge2[1]]).toEqual([[LootWeapon.Missile, LootWeapon.Heavy], LootWeapon.Burst, 0, 0.6]);
    expect(JSON.stringify([s.rng.combat.s, s.rng.loot.s])).toBe(r0);
    s.weapons.selector = Weapon.Slot2; expect(panel(s).swap).toBe('SWAP: cargo Burst for Heavy');
    run(s, 1, () => intents({ confirmPressed: true })); expect([Array.from(s.weapons.slot), s.weapons.cargo]).toEqual([[LootWeapon.Missile, LootWeapon.Burst], LootWeapon.Heavy]);
    expect(panel(s).swap!.length).toBeLessThanOrEqual(CONSOLE_LINE_MAX);
  });
  it('no SWAP row with an enemy present or an empty cargo; a cursor left on it moves off', () => {
    const { s, w } = seatedW(); s.weapons.slot[0] = LootWeapon.Burst; s.weapons.slot[1] = LootWeapon.Heavy;
    expect(panel(s).swap).toBeNull(); run(s, 1, () => intents({ moveY: 1 })); expect(weaponSelection(s).cursor).toBe(-1);
    s.weapons.cargo = LootWeapon.Ion; weaponSelection(s).cursor = SWAP_SLOT; placeEnemy(s);
    expect(panel(s).swap).toBeNull();
    run(s, 1, () => intents({ confirmPressed: true })); expect(s.weapons.cargo).toBe(LootWeapon.Ion);
    run(s, 1, () => intents({ moveY: 1 })); expect(weaponSelection(s).cursor).not.toBe(SWAP_SLOT);
  });
});

describe('the Weapons target rows under an ion disable (spec Loop-iii section 1)', () => {
  it('an ionised system row reads ION with its whole seconds; a fresh row reads as before', () => {
    const s = makeState(1); quiet(s); placeEnemy(s); const w = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, w);
    const rows = () => (buildHudModel(s, fixtureCouchViewer(s), { slots: slots(1), phase: 'running', message: '' }).players[0]!.console as WeaponsPanel).targets.map((t) => targetRowText(t));
    expect(rows()).toEqual(['Hold  hull 100%', 'Weapons room  100%', 'Piloting room  100%', 'Engines room  100%', 'Shields room  100%']);   // the rooms in window order (spec Demo-x-c section 4)
    s.enemy.ionUntil[EnemySystem.Shields] = s.tick + 9 * 60; expect(rows()[4]).toBe('Shields room  100%  ION 9s'); expect(rows()[4]!.length).toBeLessThanOrEqual(CONSOLE_LINE_MAX);
    disableSystem(s, EnemySystem.Piloting); expect(rows()[2]).toBe(`Piloting room  DOWN ${45}s`);
  });
});
