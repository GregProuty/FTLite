// The scripted Valkyrn pilot (Valkyrn spec §10 Gate): sits at the Flight seat, aims at the lead, fires in bursts under
// the heat limit, launches torpedoes, stands to repair a level-2 Room and comes back, deterministically.
import { describe, expect, it } from 'vitest';
import valkyrn from '../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Seated } from '../src/renderer/src/sim/components';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPilot, PILOT_AWAY_THROTTLE, PILOT_HEAT_RELEASE, scriptedPilotInput, type ScriptedPilot } from '../src/renderer/src/sim/duel/scriptedPilot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createTelemetry } from '../src/renderer/src/sim/duel/telemetry';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { leadOffset, nearestHeading } from '../src/renderer/src/sim/tactical/lead';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { GUN_HEAT_MAX } from '../src/renderer/src/sim/tactical/tuning';

const VALKYRN = parseShip(valkyrn);
const seated = (d: DuelState): boolean => Seated.station[d.interior.crew[0]!]! >= 0;

/** Step the pilot until `done` or `max` ticks; every command must be applied. Returns the ticks taken. */
function fly(d: DuelState, p: ScriptedPilot, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    const input = scriptedPilotInput(p, d);
    for (const r of stepDuelTick(d, input)) expect(r.status, JSON.stringify(r)).toBe('applied');
  }
  throw Error(`not done in ${max} ticks`);
}

/** The Hunter placed `range` u dead ahead of the crew ship, at the crew ship's velocity. */
function hunterAhead(d: DuelState, range: number): void {
  const s = d.tactical.ships[0]!, e = d.tactical.ships[1]!;
  e.x = s.x + hx(s.heading) * range; e.y = s.y + hy(s.heading) * range; e.vx = s.vx; e.vy = s.vy;
}

describe('the scripted Valkyrn pilot', () => {
  it('runs a crew of one: one held input, one telemetry player', () => {
    const d = createDuel(VALKYRN, 1, 0, 1);
    try {
      expect(scriptedPilotInput(createScriptedPilot(), d).held).toHaveLength(1);
      expect(createTelemetry(d).players).toHaveLength(1);
    } finally { disposeDuel(d); }
  });
  it('walks from the Ops spawn to the Flight seat and sits within 20 s, then sends an aim every tick', () => {
    const d = createDuel(VALKYRN, 1, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      const aim = scriptedPilotInput(p, d).held[0]!.aim!;
      expect(Number.isInteger(aim) && aim >= 0 && aim < 256).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('aims at the lead pip when the Hunter is within the engage range', () => {
    const d = createDuel(VALKYRN, 2, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      const s = d.tactical.ships[0]!, e = d.tactical.ships[1]!;
      e.x = s.x + 400; e.y = s.y; e.vx = s.vx; e.vy = s.vy + 60;
      const o = leadOffset(d.tactical, 0)!;
      expect(scriptedPilotInput(p, d).held[0]!.aim).toBe(nearestHeading(o.x, o.y));
    } finally { disposeDuel(d); }
  });
  it('fires in bursts: releases at 80% heat, holds off while cooling, resumes at 0', () => {
    const d = createDuel(VALKYRN, 3, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      hunterAhead(d, 300);
      const sys = d.tactical.systems[0];
      expect(PILOT_HEAT_RELEASE).toBe(0.8 * GUN_HEAT_MAX);
      sys.gunHeat = 0; expect(scriptedPilotInput(p, d).held[0]!.gunHeld).toBe(true);
      sys.gunHeat = PILOT_HEAT_RELEASE; expect(scriptedPilotInput(p, d).held[0]!.gunHeld).toBe(false);
      sys.gunHeat = 400; expect(scriptedPilotInput(p, d).held[0]!.gunHeld).toBe(false);
      sys.gunHeat = 0; expect(scriptedPilotInput(p, d).held[0]!.gunHeld).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('launches a torpedo when it can, then waits the gap', () => {
    const d = createDuel(VALKYRN, 4, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      hunterAhead(d, 300);
      const launches = (): number => scriptedPilotInput(p, d).commands.filter((e) => e.command.kind === 'missileLaunch').length;
      expect(launches()).toBe(1);
      expect(launches()).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('stands to repair a level-2 Room, keeps the ship on its last aim, repairs it to 0 and sits again', () => {
    const d = createDuel(VALKYRN, 5, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      fly(d, p, () => p.aim >= 0, 5);
      d.tactical.systems[0].rooms[Room.Weapons] = 2;
      const stood = fly(d, p, () => !seated(d), 3);   // a throttle-down tick if the throttle is not 0, then the stand (Decision 7)
      expect(stood).toBeGreaterThanOrEqual(1);
      expect(stood).toBeLessThanOrEqual(2);
      expect(d.throttle).toBe(PILOT_AWAY_THROTTLE);
      expect(d.holdHeading).toBe(p.aim);
      fly(d, p, () => d.tactical.systems[0].rooms[Room.Weapons] === 0, 3600);
      fly(d, p, () => seated(d), 1200);
      expect(d.tactical.outcome).toBe(Outcome.Running);
    } finally { disposeDuel(d); }
  });
  it('is deterministic: two runs of 3000 ticks hash the same', () => {
    const run = (): string => {
      const d = createDuel(VALKYRN, 6, 0, 1), p = createScriptedPilot();
      try { fly(d, p, () => d.tactical.outcome !== Outcome.Running || d.interior.tick >= 3000, 3001); return hashDuel(d); } finally { disposeDuel(d); }
    };
    expect(run()).toBe(run());
  });
});
