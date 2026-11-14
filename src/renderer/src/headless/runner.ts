import type { ShipLayout } from '../sim/ship/schema';
import { deriveLayout } from '../sim/ship/derived';
import { DEFAULT_CHARACTERS } from '../sim/characters';
import { SIM_VERSION, TICK_HZ } from '../sim/tuning';
import { createLoopbackHarness } from '../net/loopback';
import { createAuthority, type Authority, type Checkpoint, type Authority1a, type AuthorityDeps, type CrashRecord } from '../authority/authority';
import { createClientRun } from '../clientControl/clientRun';
import { createBotClient } from '../clientControl/botClient';
import { createCardUiState, pauseActions, reconcileCommandResult, translateTick } from '../clientControl/cardController';
import { validateCheckpoint } from '../authority/checkpoint';
import type { InputFrame } from '../clientControl/inputFrame';
import type { Command } from '../net/contracts';

export interface ScriptedCommand { player: number; command: Command }

export interface HeadlessInit {
  layout: ShipLayout; playerCount: number; seed: number; contentDigest: string;
  runId?: string; characters?: readonly number[]; unlocked?: readonly string[]; quirk?: number;
  onCrash?(record: CrashRecord): void;
}
/** Synchronous orchestration using the same byte transport, controller and public authority as the app. */
export function createHeadlessRunner(init: HeadlessInit, authorityFactory: (deps: AuthorityDeps) => Authority1a = createAuthority) {
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: init.contentDigest });
  const owned = Array.from({ length: init.playerCount }, (_, p) => p), runId = init.runId ?? 'headless-1';
  let pair = transport.connectLocal();
  const makeClient = () => createClientRun(pair.clientLink, owned, { runId, contentDigest: init.contentDigest, resolveLayout: () => init.layout });
  let client = makeClient(), botControllers = owned.map(player => createBotClient(player, client));
  let detach = () => {};
  let now = 0, deadlineOrdinal = 0, frames: readonly InputFrame[] = [], fault: CrashRecord | null = null;
  let bots = false;
  let scripted: readonly ScriptedCommand[] = [];
  let authority: Authority1a | undefined, disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const cleanup of [() => authority?.dispose(), () => client.dispose(), () => pair.host.close('disposed'), () => pair.client.close('disposed')]) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw errors[0];
  }
  try {
  authority = authorityFactory({
    contentDigest: init.contentDigest, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, resolveLayout: () => init.layout,
    botControllers: () => [client.ui.players.length ? client.ui : createCardUiState(runId, init.playerCount)],
    onCrash(record) { fault = record; init.onCrash?.(record); },
    beforeControls() { transport.drain(); },
    beforeTick(tick) {
      transport.drain(); const view = client.state();
      if (view) {
        const actions = bots ? { held: [], commands: [] } as ReturnType<typeof translateTick> : translateTick(view, client.ui, frames, tick);
        if (bots) for (const bot of botControllers) {
          const next = bot.decide(tick);
          actions.held.push(...next.held); actions.commands.push(...next.commands);
        }
        for (const { player, command } of scripted) {
          const producer = client.ui.players[player];
          if (!producer || !Number.isSafeInteger(producer.nextSequence)) throw new Error('input sequence exhausted');
          actions.commands.push({ runId: client.ui.runId, id: { player, sequence: producer.nextSequence++ }, requestedTick: tick, command });
        }
        scripted = [];
        client.send(actions);
      }
      transport.drain();
    }
  });
  detach = authority.attach(pair.authorityLink, owned);
  authority.start({ runId, layoutId: init.layout.id, layoutHash: deriveLayout(init.layout).layoutHash, simVersion: SIM_VERSION, contentDigest: init.contentDigest,
    seed: init.seed, playerCount: init.playerCount, characters: init.characters ?? DEFAULT_CHARACTERS, unlocked: init.unlocked ?? [], quirk: init.quirk });
  transport.drain();
  } catch (error) {
    try { dispose(); } catch { /* preserve the startup error after attempting all cleanup */ }
    throw error;
  }
  function advance(): void {
    if (disposed) throw new Error('headless runner disposed');
    now = ++deadlineOrdinal * 1000 / TICK_HZ; authority!.pump(); transport.drain();
    // Headless runs consume reliable presentation events without playing them.
    client.takeEvents();
    if (fault && !init.onCrash) throw new Error(`headless authority fault: ${(fault as CrashRecord).error}`);
  }
  function durable(): Authority {
    if (!authority || !('checkpoint' in authority) || !('restore' in authority)) throw new Error('authority does not support durability');
    return authority as Authority;
  }
  return {
    checkpoint(): Checkpoint { transport.drain(); const cp = durable().checkpoint([client.ui]); transport.drain(); return cp; },
    restore(checkpoint: Checkpoint): void {
      if (disposed) throw new Error('headless runner disposed');
      const owner = durable(), cp = validateCheckpoint(init.layout, checkpoint, init.contentDigest);
      if (cp.init.runId !== runId || cp.init.playerCount !== owned.length) throw new Error('headless restore requires the same run ID and player ownership');
      // Validation must precede teardown. Sessions are retired without draining:
      // old reliable packets, ingress and producer counters belong to the old run.
      detach(); client.dispose(); pair.host.close('restore'); pair.client.close('restore');
      owner.restore(cp);
      pair = transport.connectLocal(); client = makeClient();
      if (cp.botControllers[0]) Object.assign(client.ui, structuredClone(cp.botControllers[0]));
      // The sealed ledger is authoritative even if saved producer memory had
      // emitted unadmitted commands. Keep checkpoint repeat/decision timestamps.
      for (let p = 0; p < client.ui.players.length; p++) {
        client.ui.players[p]!.nextSequence = cp.commandHighWater[p]! + 1;
        client.ui.players[p]!.heldSequence = cp.heldHighWater[p]!;
      }
      for (const { result } of cp.recentResults) reconcileCommandResult(client.ui, result);
      botControllers = owned.map(player => createBotClient(player, client));
      scripted = []; frames = []; fault = null;
      detach = owner.attach(pair.authorityLink, owned); transport.drain();
    },
    replay() { return durable().replay(); },
    setPaused(paused: boolean): void {
      const view = client.state(); if (!view) throw new Error('missing initial publication');
      client.send(pauseActions(client.ui, 0, view.tick, paused)); transport.drain(); authority!.pump(); transport.drain(); client.takeEvents();
    },
    advance(nextFrames: readonly InputFrame[], commands: readonly ScriptedCommand[] = []): void {
      bots = false; frames = nextFrames; scripted = commands; advance();
    },
    advanceBots(): void { bots = true; scripted = []; advance(); },
    get botControllers() { return botControllers; },
    view() { const view = client.state(); if (!view) throw new Error('missing initial publication'); return view; },
    get ui() { return client.ui; },
    drain() { transport.drain(); },
    dispose
  };
}
