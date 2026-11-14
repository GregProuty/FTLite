import { describe, expect, it } from 'vitest';
import * as bots from '../src/renderer/src/clientControl/botClient';
import { pauseActions } from '../src/renderer/src/clientControl/cardController';
import { Health, Position } from '../src/renderer/src/sim/components';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { targetRef, ENEMY_SHIELDS_SLOT, ENEMY_WEAPONS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { createHeadlessRunner } from '../src/renderer/src/headless/runner';
import { JUMP_CHARGE_TIME, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { quirkChargeMult } from '../src/renderer/src/sim/quirks';
import { makeState, quiet, wake, placeEnemy, LAYOUT } from './helpers/sim';
import { publishedBotHarness } from './helpers/net';

function fight() {
  const state = makeState(2); wake(state); quiet(state); placeEnemy(state);
  state.enemy.nextShotTick = state.enemy.departTick = state.enemy.nextArrivalTick = state.boarders.nextArrivalTick = 1e9;
  state.run.jumpCharge = 0; state.weapons.torpedoStock = state.weapons.torpedoLoaded = 0;
  sitDown(state, 1, state.derived.stationOfKind[StationKind.Weapons]!);
  return state;
}

describe('published-state bot clients', () => {
  it('exposes a per-player producer and drives the headless runner through it', () => {
    expect(bots.createBotClient).toBeTypeOf('function');
    const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 2, seed: 1, contentDigest: 'a'.repeat(64) });
    try { runner.advanceBots(); expect(runner.view().tick).toBe(1); expect(runner.botControllers).toHaveLength(2); }
    finally { runner.dispose(); }
  });

  it('does not consume an unpublished tick and starts fresh with a new run identity', () => {
    const h = publishedBotHarness(fight(), false), bot = bots.createBotClient(1, h.client);
    try {
      const before = bot.controllerState();
      expect(bot.decide(0)).toEqual({ held: [], commands: [] });
      expect(bot.controllerState()).toEqual(before);
      h.publish();
      expect(bot.decide(0).held.map(f => f.sequence)).toEqual([1]);
      expect(bot.controllerState().players[1]!.botDecisionTick).toBe(0);
    } finally { h.dispose(); }
    for (const runId of ['before-restart', 'after-restart']) {
      const runner = createHeadlessRunner({ layout: LAYOUT, playerCount: 2, seed: 1, contentDigest: 'a'.repeat(64), runId });
      try {
        runner.advanceBots();
        const capture = runner.botControllers[1]!.controllerState();
        expect(capture.runId).toBe(runId);
        expect(capture.players[1]!.heldSequence).toBe(1);
        expect(capture.players[1]!.botDecisionTick).toBe(0);
      } finally { runner.dispose(); }
    }
  });

  it('shares sequence ownership without neutralizing another player or advancing its repeat memory', () => {
    const state = fight(), h = publishedBotHarness(state);
    try {
      const captain = bots.createBotClient(0, h.client), gunner = bots.createBotClient(1, h.client);
      const other = structuredClone(h.client.ui.players[1]);
      const first = captain.decide(0);
      expect(first.held.map(f => [f.player, f.sequence])).toEqual([[0, 1]]);
      expect(h.client.ui.players[1]).toEqual(other);
      const captainAfter = structuredClone(h.client.ui.players[0]);
      h.client.send(first);
      const second = gunner.decide(0);
      expect(second.held.map(f => [f.player, f.sequence])).toEqual([[1, 1]]);
      expect(h.client.ui.players[0]).toEqual(captainAfter);
      expect(second.commands.map(c => [c.id.player, c.id.sequence, c.command.kind])).toEqual([[1, 1, 'selectTarget']]);
      h.client.send(second);
      const captured = gunner.controllerState();
      expect(gunner.decide(0)).toEqual({ held: [], commands: [] });
      expect(gunner.controllerState()).toEqual(captured);
      captured.players[1]!.nextSequence = 999; captured.stations[0]!.rowKey = 'changed';
      expect(h.client.ui.players[1]!.nextSequence).toBe(2);
      expect(h.client.ui.stations[0]!.rowKey).not.toBe('changed');
      const pause = pauseActions(h.client.ui, 1, 0, true);
      expect(pause.commands[0]!.id.sequence).toBe(2);
      expect(h.sent.map(m => m.kind)).toEqual(['held', 'held', 'command']);
      expect(h.sent.filter(m => m.kind === 'held').map(m => m.frame.player)).toEqual([0, 1]);
    } finally { h.dispose(); }
  });

  it('decides from the completed publication while the live authority state is poisoned', () => {
    const state = fight(), h = publishedBotHarness(state);
    const saved = Object.getOwnPropertyDescriptor(state, 'crew')!;
    try {
      const bot = bots.createBotClient(1, h.client);
      Object.defineProperty(state, 'crew', { configurable: true, get() { throw new Error('live authority read'); } });
      const before = JSON.stringify(h.client.state()!.rng);
      const actions = bot.decide(0);
      expect(actions.commands[0]!.command.kind).toBe('selectTarget');
      expect(JSON.stringify(h.client.state()!.rng)).toBe(before);
      h.client.send(actions);
      expect(h.sent.map(m => m.kind)).toEqual(['held', 'command']);
    } finally { Object.defineProperty(state, 'crew', saved); h.dispose(); }
  });

  it('keeps the two-tick direction release and fires only after the prior completed aim publication', () => {
    const state = fight(); state.weapons.charge = 1;
    // Original row order: Hold, Weapons, Piloting, Engines, Shields. Starting
    // at Weapons takes two Up edges (via Hold) rather than three Down edges.
    state.weapons.target = targetRef(state, ENEMY_WEAPONS_SLOT);
    const h = publishedBotHarness(state), bot = bots.createBotClient(1, h.client);
    try {
      const first = bot.decide(0);
      expect(first.held[0]!.held.moveY).toBe(-1);
      expect(first.commands.map(c => c.command.kind)).toEqual(['selectTarget']);
      h.client.send(first); h.advance();
      expect(h.client.publication()!.tick).toBe(1);
      const second = bot.decide(1);
      expect(second.held[0]!.held.moveY).toBe(0);
      expect(second.commands).toHaveLength(0);
      h.client.send(second); h.advance();
      const third = bot.decide(2);
      expect(third.held[0]!.held.moveY).toBe(-1);
      h.client.send(third); h.advance();
      const fourth = bot.decide(3);
      expect(fourth.commands.map(c => c.command.kind)).toEqual(['fire']);
      expect(fourth.commands[0]!.command).toMatchObject({ target: targetRef(state, ENEMY_SHIELDS_SLOT) });
      h.client.send(fourth); h.advance();
      expect(state.telemetry.shots).toBe(1);
    } finally { h.dispose(); }
  });

  it('retains calm-beacon charge waiting and the 50/60 health gunner recovery boundaries', () => {
    const calm = makeState(2), c = publishedBotHarness(calm);
    try {
      const view = c.client.state()!, wait = Math.round(JUMP_CHARGE_TIME * quirkChargeMult(view) * TICK_HZ);
      view.tick = view.run.arrivalTick + wait - 1;
      expect(bots.botFrame(view, c.client.ui, 0)).toEqual(NEUTRAL_FRAME);
      view.tick++;
      expect(bots.botFrame(view, c.client.ui, 0)).not.toEqual(NEUTRAL_FRAME);
    } finally { c.dispose(); }
    const state = fight(); standUp(state, 1);
    const med = state.derived.stationOfKind[StationKind.Medbay]!;
    const tile = state.derived.roomTiles[state.derived.stationRoom[med]!]![0]!;
    const h = publishedBotHarness(state);
    try {
      const view = h.client.state()!, e = view.crew[1]!;
      Position.x[e] = tile % view.derived.width + 0.5; Position.y[e] = Math.floor(tile / view.derived.width) + 0.5;
      for (const health of [49, 50, 59]) {
        Health.cur[e] = health;
        expect(bots.botFrame(view, h.client.ui, 1)).toEqual(NEUTRAL_FRAME);
      }
      Health.cur[e] = 60;
      expect(bots.botFrame(view, h.client.ui, 1)).not.toEqual(NEUTRAL_FRAME);
      const weaponTile = view.derived.stationTile[view.derived.stationOfKind[StationKind.Weapons]!]!;
      Position.x[e] = weaponTile % view.derived.width + 0.5; Position.y[e] = Math.floor(weaponTile / view.derived.width) + 0.5;
      Health.cur[e] = 49;
      expect(bots.botFrame(view, h.client.ui, 1).confirmPresses).toBe(0);
      Health.cur[e] = 50;
      expect(bots.botFrame(view, h.client.ui, 1).confirmPresses).toBe(1);
    } finally { h.dispose(); }
  });
});
