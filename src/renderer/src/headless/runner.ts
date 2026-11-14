import type { ShipLayout } from '../sim/ship/schema';
import { deriveLayout } from '../sim/ship/derived';
import { DEFAULT_CHARACTERS } from '../sim/characters';
import { SIM_VERSION, TICK_HZ } from '../sim/tuning';
import { createLoopbackHarness } from '../net/loopback';
import { createAuthority, type Authority, type Checkpoint, type Authority1a, type AuthorityDeps, type CrashRecord } from '../authority/authority';
import { createClientRun } from '../clientControl/clientRun';
import { createBotClient } from '../clientControl/botClient';
import { createCardUiState, pauseActions, translateTick } from '../clientControl/cardController';
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
  const pair = transport.connectLocal(), owned = Array.from({ length: init.playerCount }, (_, p) => p), runId = init.runId ?? 'headless-1';
  const client = createClientRun(pair.clientLink, owned, { runId, contentDigest: init.contentDigest, resolveLayout: () => init.layout });
  const botControllers = owned.map(player => createBotClient(player, client));
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
  authority.attach(pair.authorityLink, owned);
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
      if (checkpoint.init.runId !== runId) throw new Error('headless restore requires the same run ID');
      durable().restore(checkpoint);
      if (checkpoint.botControllers[0]) Object.assign(client.ui, structuredClone(checkpoint.botControllers[0]));
      scripted = []; frames = []; fault = null; transport.drain(); client.takeEvents(); client.takeResults();
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
    botControllers,
    view() { const view = client.state(); if (!view) throw new Error('missing initial publication'); return view; },
    ui: client.ui,
    drain() { transport.drain(); },
    dispose
  };
}
