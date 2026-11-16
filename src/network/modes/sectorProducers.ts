import type { Authority, AttachOptions } from '../../renderer/src/authority/authority';
import { createCardUiState, type CardUiState } from '../../renderer/src/clientControl/cardController';
import { createBotClient } from '../../renderer/src/clientControl/botClient';
import { createClientRun } from '../../renderer/src/clientControl/clientRun';
import { createLoopbackHarness } from '../../renderer/src/net/loopback';
import type { Link, Unsubscribe } from '../../renderer/src/net/contracts';
import type { ShipLayout } from '../../renderer/src/sim/ship/schema';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';

interface SectorProducerOptions {
  authority: Authority; runId: string; playerCount: number; contentDigest: string;
  resolveLayout(id: string): ShipLayout;
  restoredControllers?: readonly CardUiState[];
}

interface Human {
  link: Link; players: readonly number[]; options: AttachOptions;
  detach?: Unsubscribe; offClose?: Unsubscribe;
}

/** Sector policy owns the producers. Ownership changes only bind at the authority's
 * completed-boundary hooks, including paused pumps. No callback binds recursively. */
export function createSectorProducers(options: SectorProducerOptions) {
  const { authority, runId, playerCount, contentDigest, resolveLayout } = options;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
  // Memory must exist before authority.start captures its initial crash baseline.
  // Older couch checkpoints used one shared controller for all players.
  const memory = Array.from({ length: playerCount }, (_, p) => structuredClone(
    options.restoredControllers?.[p] ?? options.restoredControllers?.[0] ?? createCardUiState(runId, playerCount)));
  const desired: (Human | undefined)[] = Array.from({ length: playerCount });
  const humans = new Set<Human>();
  const bots = new Map<number, ReturnType<typeof bindBot>>();
  let disposed = false;
  function bindBot(player: number) {
    const pair = transport.connectLocal();
    const client = createClientRun(pair.clientLink, [player], { runId, contentDigest, resolveLayout });
    Object.assign(client.ui, structuredClone(memory[player]));
    // This is a new producer. The first publication, not abandoned local counters,
    // determines the next admitted ID; retain cursor/repeat/decision memory.
    for (const producer of client.ui.players) { producer.nextSequence = 1; producer.heldSequence = 0; }
    let detach: Unsubscribe = () => {};
    const bot = createBotClient(player, client);
    const dispose = () => {
      memory[player] = bot.controllerState();
      try { detach(); } finally { client.dispose(); pair.host.close('bot-retired'); pair.client.close('bot-retired'); }
    };
    try { detach = authority.attach(pair.authorityLink, [player], { admissionPolicy: 'strict' }); }
    catch (error) { dispose(); throw error; }
    return { client, bot, dispose };
  }
  function cancel(human: Human): void {
    for (const player of human.players) if (desired[player] === human) desired[player] = undefined;
  }
  function wanted(human: Human): boolean { return human.players.every(player => desired[player] === human); }
  function retire(human: Human): void {
    if (!humans.delete(human)) return;
    cancel(human);
    human.offClose?.();
    try { human.detach?.(); } finally { human.link.close('sector-producer-retired'); }
  }
  function drain(): void {
    transport.drain();
    for (const { client } of bots.values()) { client.takeEvents(); client.takeResults(); }
  }
  function boundary(): void {
    if (disposed) return;
    drain();
    // Detach all old owners before any replacement can publish or send input.
    for (const human of humans) if (!wanted(human)) retire(human);
    for (const [player, bot] of bots) if (desired[player]) { bots.delete(player); bot.dispose(); }
    for (const human of [...humans]) {
      if (disposed) return;
      if (!wanted(human) || human.detach) continue;
      try { human.detach = authority.attach(human.link, human.players, human.options); }
      catch { retire(human); continue; }
      // Initial publication can synchronously close, replace, or dispose this owner.
      if (disposed || !wanted(human)) {
        human.detach(); retire(human);
      }
    }
    if (disposed) return;
    for (let player = 0; player < playerCount; player++) if (!desired[player] && !bots.has(player)) {
      const bot = bindBot(player);
      if (disposed || desired[player]) bot.dispose(); else bots.set(player, bot);
      if (disposed) return;
    }
    drain();
  }
  return {
    attachHuman(link: Link, players: readonly number[], attachOptions: AttachOptions): Unsubscribe {
      if (disposed || !players.length || players.some(p => !Number.isInteger(p) || p < 0 || p >= playerCount)
        || new Set(players).size !== players.length || [...humans].some(h => h.link === link)
        || (attachOptions.admissionPolicy !== undefined && attachOptions.admissionPolicy !== 'strict' && attachOptions.admissionPolicy !== 'receive-time'))
        throw Error('invalid sector producer');
      const human: Human = { link, players: [...players], options: { ...attachOptions } };
      for (const player of players) if (desired[player]) cancel(desired[player]!);
      for (const player of players) desired[player] = human;
      humans.add(human);
      human.offClose = link.onClose(() => cancel(human));
      // Superseded candidates own no admitted work and can close immediately;
      // retain at most one pending candidate and one bound owner per seat.
      for (const candidate of humans) if (!wanted(candidate) && !candidate.detach) retire(candidate);
      return () => cancel(human);
    },
    beforeControls: boundary,
    beforeTick(tick: number): void {
      boundary();
      if (disposed) return;
      for (const [player, { bot, client }] of bots) if (!desired[player]) client.send(bot.decide(tick));
      drain();
    },
    controllers(): readonly CardUiState[] {
      return memory.map((saved, player) => bots.get(player)?.bot.controllerState() ?? structuredClone(saved));
    },
    dispose(): void {
      if (disposed) return; disposed = true;
      for (const human of humans) retire(human);
      for (const bot of bots.values()) bot.dispose();
      bots.clear(); desired.fill(undefined);
    }
  };
}
