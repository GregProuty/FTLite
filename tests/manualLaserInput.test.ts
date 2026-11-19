// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §4, §5): Z (and the card's tag, a laserMode press) toggles
// the laser mode from the latest queued one. In MANUAL, Space sends laserFire along the Weapons map's aim (the nose with
// none yet), or says NO CHARGE without a full charge and queues nothing. In AUTO, Space keeps today's meaning. The
// Settings list names Z.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { controlSections } from '../src/renderer/src/app/controlsList';
import { emptyPresses, PRESS_CODES, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { refusal } from '../src/renderer/src/render/duel/situationModel';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { aimDir, clampAim } from '../src/renderer/src/sim/tactical/pew';
import { HEADING_COUNT, LASER_ARC_STEPS } from '../src/renderer/src/sim/tactical/tuning';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
function rig(aim: { at: number | null }) {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; },
    laserAim: () => aim.at
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  seatDuelCrew(rt.duel);
  press('switch'); tick(); tick();   // Tab takes the gunner (player 1, at Weapons)
  return { rt, tick, press };
}
/** The crew laser event among a tick's view events, as a unit direction. */
function crewBeam(events: ViewEvent[]): [number, number] {
  const e = events.find((x) => x.kind === 'laser' && x.ship === 0);
  if (!e || e.kind !== 'laser') throw new Error('no crew laser event');
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1, n = Math.hypot(dx, dy);
  return [dx / n, dy / n];
}

describe('Z (spec §2)', () => {
  it('is bound, and toggles the laser mode from the latest queued one', () => {
    expect(PRESS_CODES.KeyZ).toBe('laserMode');
    const { rt, tick, press } = rig({ at: null });
    try {
      expect(rt.view()).toBe('weapons');
      press('laserMode'); tick();
      expect(rt.duel.tactical.systems[0].laserManual).toBe(true);
      press('laserMode'); tick();
      expect(rt.duel.tactical.systems[0].laserManual).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('Space in MANUAL (spec §2, §4)', () => {
  it('sends laserFire along the map aim, and the beam leaves along it', () => {
    const aim = { at: null as number | null }, { rt, tick, press } = rig(aim);
    try {
      rt.duel.tactical.systems[0].laserManual = true;
      const h = rt.duel.tactical.ships[0].heading, before = rt.duel.tactical.systems[0].shots;
      aim.at = ((h + 20) % 256) * HEADING_COUNT + 100;
      rt.drainEvents();
      press('fireDown'); tick();
      expect(rt.duel.tactical.systems[0].shots).toBe(before + 1);
      const [ux, uy] = aimDir(clampAim(h, aim.at, LASER_ARC_STEPS)), [bx, by] = crewBeam(rt.drainEvents());
      expect(bx).toBeCloseTo(ux, 6); expect(by).toBeCloseTo(uy, 6);
    } finally { rt.dispose(); }
  });
  it('with no aim yet it fires along the nose', () => {
    const { rt, tick, press } = rig({ at: null });
    try {
      rt.duel.tactical.systems[0].laserManual = true;
      const h = rt.duel.tactical.ships[0].heading;
      rt.drainEvents();
      press('fireDown'); tick();
      const [bx, by] = crewBeam(rt.drainEvents());
      expect(bx).toBeCloseTo(hx(h), 6); expect(by).toBeCloseTo(hy(h), 6);
    } finally { rt.dispose(); }
  });
  it('without a full charge says NO CHARGE and queues nothing', () => {
    const { rt, tick, press } = rig({ at: 0 });
    try {
      rt.duel.tactical.systems[0].laserManual = true;
      rt.duel.tactical.systems[0].laserCharge = 0;
      expect(refusal(rt.duel, 'fire')).toBe('NO CHARGE');
      expect(refusal(rt.duel, 'fire', false)).toBeNull();   // in AUTO an uncharged press says nothing, as today
      rt.takeRefusals();
      press('fireDown'); tick();
      expect(rt.takeRefusals()).toEqual([{ control: 'fire', reason: 'NO CHARGE' }]);
      expect(rt.duel.tactical.systems[0].shots).toBe(0);
    } finally { rt.dispose(); }
  });
});

describe('Space in AUTO (spec §2)', () => {
  it('keeps today\'s meaning: one press fires the full laser', () => {
    const { rt, tick, press } = rig({ at: 0 });
    try {
      const before = rt.duel.tactical.systems[0].shots;
      press('fireDown'); tick();
      expect(rt.duel.tactical.systems[0].shots).toBe(before + 1);
      expect(rt.duel.tactical.systems[0].laserManual).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('the Settings controls list (spec §5)', () => {
  it('names Z at Weapons', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'Z')?.action).toMatch(/Weapons.*AUTO.*MANUAL/);
  });
});
