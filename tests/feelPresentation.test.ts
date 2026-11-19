// Feel-i (spec 2026-11-17-console-feel-design §1 to §4): the status sentence and the card's why-not, the FIRING SOLUTION
// bracket and the bright arc, the hit juice (beams, flare, shield pop, floats, shakes, the kill and its render-only slow
// motion), and the sit-down card, goal glow and auto-frame. Presentation only: none of it touches the sim.
import { afterEach, describe, expect, it } from 'vitest';
import { gunnerPresent, laserCardReason, laserSituation, linedUp, SOLUTION_HOLD_S, statusSentence } from '../src/renderer/src/render/duel/situationModel';
import { countSit, createSitTracker, FRAME_ZOOM_MAX, FRAME_ZOOM_MIN, frameZoom, resetSits, SIT_CARD_S, sitCard, trackSit } from '../src/renderer/src/render/duel/sitModel';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { OWN_SHIP } from '../src/renderer/src/render/duel/consoleLayout';
import { createFx, FLOAT_STEP_PX, fxDt, KILL_SLOWMO_RATE, KILL_SLOWMO_S, pushEvents, pushKill, ROOM_SHAKE, shakeOffset, stepFx, TORPEDO_SHAKE, trackSolution, type ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { combatModel, INFO_Y, STATUS_Y } from '../src/renderer/src/render/tactical/weaponsModel';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import { shakeScale } from '../src/renderer/src/render/shake';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { createTacticalState, Outcome, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

afterEach(() => resetSits());
/** The enemy `dist` units off the crew's nose, `deg` degrees clockwise of it, both at rest, in open space far from the planet. */
function place(st: TacticalState, dist: number, deg = 0): void {
  const me = st.ships[0], e = st.ships[1], r = (deg * Math.PI) / 180;
  todaysCrewWeapons(st);   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)
  Object.assign(me, { x: 3000, y: 0, vx: 0, vy: 0, heading: 0 });
  st.map.asteroids.length = 0;
  const fx0 = hx(0), fy0 = hy(0), c = Math.cos(r), s = Math.sin(r);
  Object.assign(e, { x: me.x + dist * (fx0 * c - fy0 * s), y: me.y + dist * (fy0 * c + fx0 * s), vx: 0, vy: 0 });
}
const BAND = { left: 408, right: 1136 };
const input = (st: TacticalState, console: 'helm' | 'weapons', fx = createFx()) => ({
  state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha: 1, camera: createCamera(st.ships[0].x, st.ships[0].y, 1), viewport: { w: 1280, h: 720 },
  console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 156, reserveLeft: 228, missilePrev: [null, null], fx, infoBand: BAND
}) as const;

describe('the status sentence and the card why-not (spec §1, §3)', () => {
  it('reads out of range, out of arc (turn left or right), the solution, charging; the card says why in words', () => {
    const st = createTacticalState(5, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    place(st, 612);
    let s = laserSituation(st);
    expect([statusSentence(s), laserCardReason(s)]).toEqual(['ENEMY OUT OF RANGE: CLOSE TO 450', 'OUT OF RANGE 612/450']);
    place(st, 300, 90);
    s = laserSituation(st);
    expect([statusSentence(s), laserCardReason(s)]).toEqual(['ENEMY OUT OF ARC: TURN RIGHT', 'OUT OF ARC: HELM TURN RIGHT']);
    place(st, 300, -100);
    expect(statusSentence(laserSituation(st))).toBe('ENEMY OUT OF ARC: TURN LEFT');
    place(st, 300, 10);
    s = laserSituation(st);   // the round starts full and targeted at Shields
    expect([statusSentence(s), laserCardReason(s), linedUp(s)]).toEqual(['FIRING SOLUTION', 'FIRING', true]);
    st.systems[0].laserCharge = LASER_CHARGE_UNITS / 2;
    s = laserSituation(st);
    expect([statusSentence(s), laserCardReason(s), linedUp(s)]).toEqual(['LASER CHARGING', null, true]);
    expect(statusSentence(laserSituation(st, SOLUTION_HOLD_S / 2))).toBe('FIRING SOLUTION');   // a volley just fired holds it
    st.systems[0].laserTargeted = false; st.systems[0].laserCharge = LASER_CHARGE_UNITS;
    expect(statusSentence(laserSituation(st))).toBe('FIRING SOLUTION: PICK A ROOM');
    st.systems[0].rooms[Room.Weapons] = 2;
    s = laserSituation(st);
    expect([statusSentence(s), laserCardReason(s, true)]).toEqual(['WEAPONS OFFLINE: REPAIR', 'WEAPONS OFFLINE']);
    place(st, 900);
    expect(laserCardReason(laserSituation(st), true)).toBe('WEAPONS OFFLINE');   // offline first on the card
  });
  it('the torpedo in flight holds the laser; the Weapons panel carries the reason and the goal glow only while untargeted', () => {
    const st = createTacticalState(5, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    place(st, 300, 10);   // lined up, full and targeted: the sim would fire but for the torpedo (laserFrozen)
    expect(laserSituation(st).kind).toBe('solution');
    placeMissile(st, 0, { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    let s = laserSituation(st);
    expect([statusSentence(s), laserCardReason(s), linedUp(s)]).toEqual(['LASER HOLDS: TORPEDO FLYING', 'HOLDS: TORPEDO FLYING', true]);
    expect(laserSituation(st, SOLUTION_HOLD_S / 2).kind).toBe('solution');   // a volley already released is real
    const d = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      place(d.tactical, 612);
      const p = consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, goal: true })!.weapons!;
      expect([p.laserReason, p.goal]).toEqual(['OUT OF RANGE 612/450', false]);   // targeted at Shields: no glow
      d.tactical.systems[0].laserTargeted = false;
      expect(consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, goal: true })!.weapons!.goal).toBe(true);
    } finally { disposeDuel(d); }
  });
});

describe('the words never disagree with the sim (Feel-i review)', () => {
  it('no gunner at Weapons, with a full laser lined up: NO GUNNER, no bracket, no bright arc, no FIRING', () => {
    const st = createTacticalState(5, 2, ShipClass.ValkyrnLaser); place(st, 300, 10);   // W-4 spec §14.1: the beam's rule, on the laser fit
    const s = laserSituation(st, Infinity, false);
    expect([statusSentence(s), laserCardReason(s), linedUp(s)]).toEqual(['NO GUNNER: SIT AT WEAPONS', 'NO GUNNER', false]);
    const fx = createFx(); trackSolution(fx, linedUp(s), 0); trackSolution(fx, linedUp(s), 0.3);
    const h = combatModel({ ...input(st, 'helm', fx), gunner: false });
    expect([h.status!.label.text, h.status!.colour, h.solution, h.helmArc!.bright]).toEqual(['NO GUNNER: SIT AT WEAPONS', CRT.main, null, false]);
    const d = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      place(d.tactical, 300, 10);
      const panel = () => consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })!.weapons!;
      expect(gunnerPresent(d)).toBe(true); expect(panel().laserReason).toBe('FIRING');
      d.present[1] = false;   // the gunner Tabbed away online-style: seated but away
      expect(gunnerPresent(d)).toBe(false); expect(panel().laserReason).toBe('NO GUNNER');
    } finally { disposeDuel(d); }
  });
  it('once the round is decided: no sentence, no bracket or its label, no bright arc', () => {
    const st = createTacticalState(5, 2, ShipClass.ValkyrnLaser); place(st, 300, 10);   // W-4 spec §14.1: the beam's rule, on the laser fit
    const fx = createFx(); trackSolution(fx, true, 0); trackSolution(fx, true, 0.3);
    expect(combatModel(input(st, 'helm', fx)).solution!.label?.text).toBe('FIRING SOLUTION');
    st.outcome = Outcome.EnemyWins;   // a loss: the end card is up
    const s = laserSituation(st, 0);
    expect([s.kind, linedUp(s), laserCardReason(s)]).toEqual(['none', false, null]);
    trackSolution(fx, linedUp(s), 0.016);
    const h = combatModel(input(st, 'helm', fx));
    expect([h.status, h.solution, h.helmArc!.bright]).toEqual([null, null, false]);
  });
});

describe('the map: the sentence, the info line, the bright arc and the FIRING SOLUTION bracket (spec §1, §2)', () => {
  it('both seats show the same sentence at the top inside the band; Weapons keeps the BRG line under it; the Helm draws its arc', () => {
    const st = createTacticalState(5, 2, ShipClass.ValkyrnLaser); place(st, 612);   // W-4 spec §14.1: the beam's rule, on the laser fit
    const w = combatModel(input(st, 'weapons')), h = combatModel(input(st, 'helm'));
    expect(w.status!.label.text).toBe(h.status!.label.text);
    expect([w.status!.label.y, w.weapons!.info.y]).toEqual([STATUS_Y, INFO_Y]);
    expect(w.status!.colour).toBe(CRT.main);
    expect(h.helmArc).not.toBeNull(); expect(w.helmArc).toBeNull();
    expect(combatModel({ ...input(st, 'weapons'), infoBand: undefined }).status).toBeNull();   // no console, no sentence
  });
  it('lined up: the arc brightens with the laser ready; the bracket closes about the enemy, hot with its label once closed', () => {
    const st = createTacticalState(5, 2, ShipClass.ValkyrnLaser); place(st, 300, 10);   // W-4 spec §14.1: the beam's rule, on the laser fit
    const fx = createFx();
    expect(combatModel(input(st, 'helm', fx)).solution).toBeNull();   // the scene has not seen it lined up yet
    trackSolution(fx, true, 0);
    const open = combatModel(input(st, 'helm', fx)).solution!;
    trackSolution(fx, true, 0.3);
    const closed = combatModel(input(st, 'helm', fx));
    expect(closed.solution!.r).toBeLessThan(open.r);
    expect([closed.solution!.bright, closed.solution!.label?.text, closed.helmArc!.bright, closed.status!.colour]).toEqual([true, 'FIRING SOLUTION', true, CRT.hot]);
    st.systems[0].laserCharge = 0;
    const charging = combatModel(input(st, 'helm', fx));
    expect([charging.solution!.bright, charging.solution!.label, charging.helmArc!.bright]).toEqual([false, null, false]);
    trackSolution(fx, false, 0.016);
    expect(fx.solutionAge).toBe(-1);
  });
});

describe('hits are loud (spec §3)', () => {
  const laser = (over: Partial<Extract<ViewEvent, { kind: 'laser' }>>): ViewEvent => ({ kind: 'laser', ship: 0, hit: true, stripped: false, room: 1, x1: 0, y1: 0, x2: 100, y2: 0, ...over });
  it('a crew room hit floats -2 and shakes 2 px for 120 ms; a stripped layer pops the shield; the burst beams sit side by side', () => {
    const fx = createFx();
    pushEvents(fx, [laser({}), laser({ stripped: true, room: -1 })]);
    expect(fx.floats.map((f) => f.text)).toEqual(['-2']);
    expect([fx.shakePx, fx.shake]).toEqual([ROOM_SHAKE.px, ROOM_SHAKE.s]);
    expect(fx.items.map((i) => i.kind)).toEqual(['beam', 'flare', 'beam', 'flare', 'pop']);
    const beams = fx.items.filter((i) => i.kind === 'beam');
    expect(beams.map((b) => b.side)).toEqual([-1, 1]);
    expect(fx.sinceShot).toBe(0);
    const draw = combatModel(input(createTacticalState(5, 2, ShipClass.ValkyrnLaser), 'weapons', fx));   // W-4 spec §14.1: the beam's rule, on the laser fit
    expect(draw.effects.filter((e) => e.kind === 'beam').every((e) => e.width === 5 && e.core === true)).toBe(true);
    expect(draw.floats!.map((f) => f.text)).toEqual(['-2']);
  });
  it('a crew torpedo on the enemy floats its damage and shakes 4 px; a stronger shake is not cut short by a weaker one', () => {
    const fx = createFx();
    pushEvents(fx, [{ kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: 0, x: 5, y: 5 }]);
    expect(fx.floats.map((f) => f.text)).toEqual(['-3']);
    expect([fx.shakePx, fx.shake]).toEqual([TORPEDO_SHAKE.px, TORPEDO_SHAKE.s]);
    pushEvents(fx, [laser({})]);
    expect(fx.shakePx).toBe(TORPEDO_SHAKE.px);
  });
  it('successive floats stand side by side; a column frees when its float ends', () => {
    const fx = createFx(), at = laser({});
    pushEvents(fx, [at]); stepFx(fx, 0.2); pushEvents(fx, [at, at]);
    expect(fx.floats.map((f) => f.slot)).toEqual([0, 1, 2]);
    const xs = combatModel(input(createTacticalState(5, 2, ShipClass.ValkyrnLaser), 'weapons', fx)).floats!.map((f) => f.x);   // W-4 spec §14.1: the beam's rule, on the laser fit
    expect([xs[1]! - xs[0]!, xs[2]! - xs[1]!]).toEqual([FLOAT_STEP_PX, FLOAT_STEP_PX]);
    stepFx(fx, 0.95);   // the first has ended
    pushEvents(fx, [at]);
    expect(fx.floats.map((f) => f.slot)).toEqual([1, 2, 0]);
  });
  it('the shake setting scales the offset: off none, low half', () => {
    const fx = createFx();
    pushEvents(fx, [{ kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: 0, x: 5, y: 5 }]);
    stepFx(fx, 0.01);
    expect(shakeOffset(fx, shakeScale('off'))).toEqual({ x: 0, y: 0 });
    const full = shakeOffset(fx, shakeScale('full')), low = shakeOffset(fx, shakeScale('low'));
    expect(Math.hypot(full.x, full.y)).toBeGreaterThan(0);
    expect(Math.hypot(low.x, low.y)).toBeLessThanOrEqual(Math.hypot(full.x, full.y));
  });
  it('the kill: an explosion, TARGET DESTROYED, the hull flying apart, and 0.4 s of render-only slow motion', () => {
    const fx = createFx(), st = createTacticalState(5, 2, ShipClass.ValkyrnLaser); place(st, 300);   // W-4 spec §14.1: the beam's rule, on the laser fit
    pushKill(fx, st.ships[1].x, st.ships[1].y, 0);
    pushKill(fx, 0, 0, 0);   // once
    expect(fx.items.map((i) => i.kind)).toEqual(['boom']);
    expect(fx.callouts.map((c) => c.text)).toEqual(['TARGET DESTROYED']);
    expect(fxDt(fx, 0.1)).toBeCloseTo(0.1 * KILL_SLOWMO_RATE, 12);
    let real = 0.1; while (fx.slowmo > 0) { fxDt(fx, 0.1); real += 0.1; }
    expect(real).toBeGreaterThanOrEqual(KILL_SLOWMO_S - 1e-9); expect(real).toBeLessThanOrEqual(KILL_SLOWMO_S + 0.1 + 1e-9);   // counted down by the real dt
    expect(fxDt(fx, 0.1)).toBe(0.1);
    stepFx(fx, 0.2);
    const shards = combatModel({ ...input(st, 'weapons', fx), ships: [0] }).effects.filter((e) => e.kind === 'shard');
    expect(shards.length).toBeGreaterThan(3);
  });
});

describe('sitting down (spec §1)', () => {
  it('the card shows on the first three sits at a seat per session, for 4 s or until the first action, then never', () => {
    expect([countSit('helm'), countSit('helm'), countSit('helm'), countSit('helm')]).toEqual([true, true, true, false]);
    expect(countSit('weapons')).toBe(true);
    expect(sitCard('helm', 0.5, false)).toMatchObject({ title: 'HELM: POINT AT THE ENEMY', keys: ['HOLD LMB  STEER', 'W/S  THROTTLE', 'A/D  THRUSTERS'], alpha: 1, top: false });
    expect(sitCard('weapons', 0.5, false, true)).toMatchObject({ title: 'WEAPONS: CLICK A WEAPON, THEN A ROOM OR ROCK', top: true });
    expect(sitCard('weapons', 0.5, false, true)?.keys).toContain('L-CLICK MAP  PEW');   // W-1
    expect(sitCard('helm', SIT_CARD_S - 0.25, false)!.alpha).toBeCloseTo(0.5, 6);
    expect([sitCard('helm', SIT_CARD_S, false), sitCard('helm', 1, true)]).toEqual([null, null]);
  });
  it('a sit is a character sitting down, not a Tab to one already seated', () => {
    const tr = createSitTracker();
    expect(trackSit(tr, 0, [null, null])).toBe(false);
    expect(trackSit(tr, 0, ['helm', null])).toBe(true);          // player 0 sits at the Helm
    expect(trackSit(tr, 0, ['helm', null])).toBe(false);
    expect(trackSit(tr, 1, ['helm', null])).toBe(false);         // Tab to player 1, on foot
    expect(trackSit(tr, 1, ['helm', 'weapons'])).toBe(true);     // player 1 sits at Weapons
    expect(trackSit(tr, 0, ['helm', 'weapons'])).toBe(false);    // Tab back to the seated Helm: no sit
    expect(trackSit(tr, 1, ['helm', 'weapons'])).toBe(false);    // and to the seated gunner: no sit
    expect(trackSit(tr, 1, ['helm', null])).toBe(false);         // the gunner stands
    expect(trackSit(tr, 1, ['helm', 'weapons'])).toBe(true);     // and sits again: a sit
  });
  it('auto-frame fits the enemy inside the map, clamped to 0.25..1', () => {
    const vp = { w: 1280, h: 720 };
    expect(frameZoom(4000, 0, vp, 228, 156)).toBe(FRAME_ZOOM_MIN);
    expect(frameZoom(50, 0, vp, 228, 156)).toBe(FRAME_ZOOM_MAX);
    const z = frameZoom(600, 0, vp, 228, 156);
    expect(640 + 600 * z).toBeLessThanOrEqual(1280 - 156);
    const zl = frameZoom(-600, 300, vp, 228, 156);
    expect(640 - 600 * zl).toBeGreaterThanOrEqual(228); expect(360 + 300 * zl).toBeLessThanOrEqual(720);
  });
  it('own ship window spec §3 (owner 2026-11-18): the avoid cap uses the 28 px arrow margin, so (-200, -200) frames at 0.72', () => {
    const vp = { w: 1280, h: 720 };
    expect(frameZoom(-200, -200, vp, 228, 156, OWN_SHIP)).toBeCloseTo((640 - 468 - 28) / 200, 9);
  });
  it('own ship window spec §3: an up-left enemy is framed clear of the window on at least one axis; without avoid, unchanged', () => {
    const vp = { w: 1280, h: 720 };
    for (const [dx, dy] of [[-300, -250], [-500, -120], [-150, -400]] as const) {
      const z = frameZoom(dx, dy, vp, 228, 156, OWN_SHIP), sx = vp.w / 2 + dx * z, sy = vp.h / 2 + dy * z;
      expect(sx >= OWN_SHIP.x + OWN_SHIP.w || sy >= OWN_SHIP.y + OWN_SHIP.h || z === FRAME_ZOOM_MIN, `${dx},${dy}`).toBe(true);
      expect(z).toBeLessThanOrEqual(frameZoom(dx, dy, vp, 228, 156));
    }
    expect(frameZoom(300, -250, vp, 228, 156, OWN_SHIP)).toBe(frameZoom(300, -250, vp, 228, 156));   // up-right: no cap
    expect(frameZoom(-300, 250, vp, 228, 156, OWN_SHIP)).toBe(frameZoom(-300, 250, vp, 228, 156));   // down-left: no cap
  });
});
