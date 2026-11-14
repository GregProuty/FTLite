import { buy, itemEnabled, WEAPON_ITEM } from './shop';
import { startTargetScan, startSystemScan, lockFrequency } from './science';
import { resolveTarget } from './debrisTargets';
import { weaponMatches, canFireWeaponAt, fireWeaponAt, swapCargo, canSwap } from './weapons';
import { NEUTRAL_INTENT, type Intent } from '../../../shared/intent';
import type { CommandEnvelope, CommandReason, CommandResult, HeldInput, LegacyInputEnvelope, VisitRef, EventRef } from '../net/contracts';
import type { SimState } from './state';
import { Life, LifeState, Position, Seated } from './components';
import { roomAt } from './grid';
import { inReachOfTile } from './interact';
import { stationOnline, sitDown, standUp, selectTab } from './stations';
import { shedPower, shiftBar, buyUpgrade, buyReactor } from './power';
import { cycleCoolant } from './heat';
import { StationKind } from './stationKinds';
import { hereIndex, navRows, contentOf, NodeType, requestJump, EXIT_JUMP, startWait, startEvade } from './run';
import { choiceEnabled, EVENT_DEFS } from './events';
import { CONFIRM_SECONDS, TICK_HZ } from './tuning';

export interface TickInput { held: readonly HeldInput[]; commands: readonly CommandEnvelope[] }
export interface MigrationTickInput extends TickInput { legacyCardInput: readonly LegacyInputEnvelope[] }
export function isPauseControl(envelope: CommandEnvelope | LegacyInputEnvelope): envelope is CommandEnvelope & { command: { kind: 'setPaused'; paused: boolean } } {
  return !('kind' in envelope) && envelope.command.kind === 'setPaused';
}
/** Held inputs never carry one-shot actions into the simulation. */
export function heldPhaseInputs(input: TickInput, players: number): Intent[] {
  return Array.from({ length: players }, (_, p) => ({ ...NEUTRAL_INTENT, ...input.held[p] }));
}
export function visitRef(state: SimState): VisitRef { return { sector: state.run.sector, beacon: hereIndex(state), arrivalTick: state.run.arrivalTick }; }
export function eventRef(state: SimState): EventRef { return { visit: visitRef(state), eventId: state.run.event }; }
export function sameVisit(state: SimState, visit: VisitRef): boolean { return visit.sector === state.run.sector && visit.beacon === hereIndex(state) && visit.arrivalTick === state.run.arrivalTick; }
export function navigationOfficer(state: SimState): number { const nav = state.derived.stationOfKind[StationKind.Navigation]!; return nav >= 0 ? state.stations.occupant[nav]! : -1; }
export function commandResult(state: SimState, envelope: CommandEnvelope | LegacyInputEnvelope, reason?: CommandReason, noop = false): CommandResult {
  return { id: { ...envelope.id }, tick: state.tick, status: reason ? 'rejected' : noop ? 'noop' : 'applied', ...(reason ? { reason } : {}) };
}
function conscious(state: SimState, pid: number): boolean { return pid >= 0 && pid < state.playerCount && Life.state[state.crew[pid]!] === LifeState.Conscious; }
function voteReason(state: SimState, envelope: CommandEnvelope): CommandReason | undefined {
  const c = envelope.command; if (c.kind !== 'vote') return 'unsupported';
  if (!sameVisit(state, c.event.visit) || c.event.eventId !== state.run.event || state.run.eventChoice >= 0 || state.run.event < 0) return 'stale-target';
  if (!Number.isInteger(c.choice) || c.choice < 0 || c.choice >= EVENT_DEFS[state.run.event]!.choices.length) return 'unavailable';
  return undefined;
}
/** I phase: validate explicit targets, collect votes/agreements, then arbitrate seats. */
export function applyInteractionCommands(state: SimState, commands: readonly CommandEnvelope[]): void {
  const requests = new Map<number, CommandEnvelope[]>();
  for (const envelope of commands) {
    const { command: c, id: { player: pid } } = envelope;
    if (!['sit', 'toggleDoorLocal', 'vote', 'jumpAgree'].includes(c.kind)) continue;
    // Navigation votes execute at the officer's C slot, including invalid inactive-tab attempts.
    if (c.kind === 'vote' && navigationOfficer(state) === pid) continue;
    let reason: CommandReason | undefined;
    if (envelope.requestedTick !== state.tick) reason = 'stale-tick';
    else if (!conscious(state, pid)) reason = 'unavailable';
    else {
      const eid = state.crew[pid]!;
      if (c.kind === 'sit') {
        const i = c.station, tile = state.derived.stationTile[i], g = state.derived.stationGroup[i], members = g !== undefined && g >= 0 ? state.derived.groupStations[g]! : [i];
        if (Seated.station[eid]! >= 0) reason = 'invalid-seat';
        else if (tile === undefined || roomAt(state, Position.x[eid]!, Position.y[eid]!) !== state.derived.stationRoom[i] || !inReachOfTile(state, eid, tile)) reason = 'stale-target';
        else if (members.some(j => state.stations.occupant[j]! >= 0) || !members.some(j => stationOnline(state, j))) reason = 'unavailable';
        else { const first = members[0]!; requests.set(first, [...(requests.get(first) ?? []), envelope]); continue; }
      } else if (c.kind === 'toggleDoorLocal') {
        if (Seated.station[eid]! >= 0) reason = 'invalid-seat';
        else if (!state.derived.edgeIsDoor[c.edge] || !inReachOfTile(state, eid, state.derived.edgeTile[c.edge]!)) reason = 'stale-target';
        else state.scratch.doorToggles.add(c.edge);
      } else if (c.kind === 'vote') {
        reason = voteReason(state, envelope);
        if (!reason) { state.scratch.voteChoices[pid] = c.choice; state.scratch.confirmUsed[pid] = 1; }
      } else if (c.kind === 'jumpAgree') {
        const r = state.run;
        if (navigationOfficer(state) === pid) reason = 'invalid-seat';
        else if (!sameVisit(state, c.pending.visit) || r.jumpPending < 0 || r.jumpPending !== c.pending.destination || r.jumpPendingTick !== c.pending.requestedAtTick) reason = 'stale-target';
        else if ((r.event >= 0 && r.eventChoice < 0) || state.tick >= r.jumpPendingTick + CONFIRM_SECONDS * TICK_HZ) reason = 'unavailable';
        else { state.scratch.jumpConfirm[pid] = 1; state.scratch.confirmUsed[pid] = 1; }
      }
    }
    state.scratch.commandResults.push(commandResult(state, envelope, reason));
  }
  for (const station of [...requests.keys()].sort((a,b) => a-b)) {
    const ordered = requests.get(station)!.sort((a,b) => a.id.player-b.id.player || a.id.sequence-b.id.sequence);
    for (const envelope of ordered) {
      const pid = envelope.id.player;
      if (state.scratch.satThisTick[pid] || state.stations.occupant[station]! >= 0) state.scratch.commandResults.push(commandResult(state, envelope, 'unavailable'));
      else { sitDown(state, pid, station); state.scratch.satThisTick[pid] = 1; state.scratch.commandResults.push(commandResult(state, envelope)); }
    }
  }
}
/** C phase; callers preserve ascending player/sequence order and whole-slot stand/tab consumption. */
export function applyConsoleCommand(state: SimState, envelope: CommandEnvelope): CommandResult {
  const { command: c, id: { player: pid } } = envelope;
  if (envelope.requestedTick !== state.tick) return commandResult(state, envelope, 'stale-tick');
  if (c.kind === 'moveTo') return commandResult(state, envelope, 'unsupported');
  if (!conscious(state, pid)) return commandResult(state, envelope, 'unavailable');
  const seat = Seated.station[state.crew[pid]!]!;
  if (seat < 0 || state.scratch.satThisTick[pid] || state.scratch.stoodThisTick[pid]) return commandResult(state, envelope, 'invalid-seat');
  if (c.kind === 'stand') { standUp(state, pid); shedPower(state); state.scratch.stoodThisTick[pid] = 1; return commandResult(state, envelope); }
  if (c.kind === 'tab') {
    const members = state.derived.groupStations[c.group];
    if (!members || state.derived.stationGroup[seat] !== c.group || !members.includes(c.station) || members.some(i => state.stations.occupant[i] !== pid)) return commandResult(state, envelope, 'invalid-seat');
    selectTab(state, pid, c.group, members.indexOf(c.station)); return commandResult(state, envelope);
  }
  if (c.kind === 'vote') {
    const nav = state.derived.stationOfKind[StationKind.Navigation]!;
    if (navigationOfficer(state) !== pid || seat !== nav) return commandResult(state, envelope, 'invalid-seat');
    const reason = voteReason(state, envelope); if (reason) return commandResult(state, envelope, reason);
    if ((state.derived.stationGroup[seat]! >= 0 && !stationOnline(state, seat)) || !choiceEnabled(state, state.run.event, c.choice)) return commandResult(state, envelope, 'unavailable');
    const unchanged = state.run.vote[pid] === c.choice;
    if (!unchanged) { state.run.vote[pid] = c.choice; state.run.voteTick = state.tick; }
    return commandResult(state, envelope, undefined, unchanged);
  }
  if (c.kind === 'buy' || c.kind === 'jump' || c.kind === 'sectorJump' || c.kind === 'wait' || c.kind === 'evade') {
    if (c.station !== seat || state.stations.occupant[seat] !== pid || state.derived.stationKind[seat] !== StationKind.Navigation) return commandResult(state, envelope, 'invalid-seat');
    if (state.derived.stationGroup[seat]! >= 0 && !stationOnline(state, seat)) return commandResult(state, envelope, 'unavailable');
    if (c.kind === 'evade') return commandResult(state, envelope, startEvade(state) ? undefined : 'unavailable');
    if (!sameVisit(state, c.visit)) return commandResult(state, envelope, 'stale-target');
    const rows = navRows(state);
    if (c.kind === 'buy') {
      if (contentOf(state) !== NodeType.Shop || c.expectedOffer !== (c.item === WEAPON_ITEM ? state.run.shopWeapon : 0)) return commandResult(state, envelope, 'stale-target');
      if (!rows.some(row => row.select === 'buy' && row.index === c.item) || !itemEnabled(state, c.item)) return commandResult(state, envelope, 'unavailable');
      buy(state, c.item); return commandResult(state, envelope);
    }
    if (c.kind === 'wait') return commandResult(state, envelope, rows.some(row => row.select === 'wait' && row.enabled) && startWait(state) ? undefined : 'unavailable');
    const destination = c.kind === 'sectorJump' ? EXIT_JUMP : c.destination;
    if (!rows.some(row => row.select === (c.kind === 'sectorJump' ? 'sector' : 'jump') && row.index === destination)) return commandResult(state, envelope, 'stale-target');
    if (state.run.jumpCharge < 1 || state.run.fuel < 1) return commandResult(state, envelope, 'unavailable');
    const pending = state.run.jumpPending, reached = state.run.nodesReached;
    requestJump(state, destination);
    return commandResult(state, envelope, undefined, pending === state.run.jumpPending && reached === state.run.nodesReached);
  }
  if (c.kind === 'scan' || c.kind === 'systemScan' || c.kind === 'lockFrequency' || (c.kind === 'selectTarget' && state.derived.stationKind[seat] === StationKind.Science)) {
    if (c.station !== seat || state.stations.occupant[seat] !== pid || state.derived.stationKind[seat] !== StationKind.Science) return commandResult(state, envelope, 'invalid-seat');
    if (state.derived.stationGroup[seat]! >= 0 && !stationOnline(state, seat)) return commandResult(state, envelope, 'unavailable');
    if (c.kind === 'selectTarget' || c.kind === 'scan') {
      if (c.target && (resolveTarget(state, c.target) === null || (c.target.kind === 'enemy' && c.target.room !== 4))) return commandResult(state, envelope, 'stale-target');
      if (c.kind === 'selectTarget') {
        const old = state.science.target, unchanged = old === null ? c.target === null : c.target !== null && old.kind === c.target.kind && old.stableId === c.target.stableId && (old.kind !== 'enemy' || (c.target.kind === 'enemy' && old.room === c.target.room));
        state.science.target = c.target ? { ...c.target } : null;
        return commandResult(state, envelope, undefined, unchanged);
      }
      return commandResult(state, envelope, startTargetScan(state, seat, c.target) ? undefined : 'unavailable');
    }
    if (c.kind === 'systemScan') {
      if (!sameVisit(state, c.visit)) return commandResult(state, envelope, 'stale-target');
      return commandResult(state, envelope, startSystemScan(state, seat) ? undefined : 'unavailable');
    }
    if (!state.enemy.present || state.enemy.stableId !== c.enemyId) return commandResult(state, envelope, 'stale-target');
    return commandResult(state, envelope, lockFrequency(state, seat, c.enemyId) ? undefined : 'unavailable');
  }
  if (c.kind === 'selectWeapon' || c.kind === 'selectTarget' || c.kind === 'fire' || c.kind === 'swapCargo') {
    if (c.station !== seat || state.stations.occupant[seat] !== pid || state.derived.stationKind[seat] !== StationKind.Weapons) return commandResult(state, envelope, 'invalid-seat');
    if (state.derived.stationGroup[seat]! >= 0 && !stationOnline(state, seat)) return commandResult(state, envelope, 'unavailable');
    if (c.kind === 'selectTarget') {
      if (c.target && resolveTarget(state, c.target) === null) return commandResult(state, envelope, 'stale-target');
      const previous = state.weapons.target;
      const unchanged = previous === null ? c.target === null : c.target !== null && previous.kind === c.target.kind && previous.stableId === c.target.stableId && (previous.kind !== 'enemy' || (c.target.kind === 'enemy' && previous.room === c.target.room));
      state.weapons.target = c.target ? { ...c.target } : null;
      return commandResult(state, envelope, undefined, unchanged);
    }
    if (c.kind === 'swapCargo') {
      if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot >= state.weapons.slot.length || state.weapons.cargo !== c.expectedCargo || state.weapons.slot[c.slot] !== c.expectedEquipped) return commandResult(state, envelope, 'stale-target');
      if (!canSwap(state)) return commandResult(state, envelope, 'unavailable');
      swapCargo(state, c.slot); return commandResult(state, envelope);
    }
    if (!weaponMatches(state, c.weapon)) return commandResult(state, envelope, 'stale-target');
    if (c.kind === 'selectWeapon') { const unchanged = state.weapons.selector === c.weapon.selector; state.weapons.selector = c.weapon.selector; return commandResult(state, envelope, undefined, unchanged); }
    if (resolveTarget(state, c.target) === null) return commandResult(state, envelope, 'stale-target');
    if (!canFireWeaponAt(state, c.weapon, c.target)) return commandResult(state, envelope, 'unavailable');
    fireWeaponAt(state, c.weapon, c.target); return commandResult(state, envelope);
  }
  if (c.kind === 'power' || c.kind === 'coolant' || c.kind === 'buyUpgrade' || c.kind === 'buyReactor' || c.kind === 'doorCycle' || c.kind === 'airlockToggle') {
    const engineering = c.kind === 'power' || c.kind === 'coolant' || c.kind === 'buyUpgrade' || c.kind === 'buyReactor';
    if (c.station !== seat || state.stations.occupant[seat] !== pid || state.derived.stationKind[seat] !== (engineering ? StationKind.Engineering : StationKind.Doors)) return commandResult(state, envelope, 'invalid-seat');
    const online = stationOnline(state, seat), grouped = state.derived.stationGroup[seat]! >= 0;
    if (grouped && !online) return commandResult(state, envelope, 'unavailable');
    if (c.kind === 'power' || c.kind === 'coolant') {
      if (!Number.isInteger(c.target) || c.target < 0 || c.target >= state.derived.stationKind.length) return commandResult(state, envelope, 'stale-target');
      const changed = c.kind === 'power' ? shiftBar(state, c.target, c.delta) : cycleCoolant(state, c.target);
      if (changed) state.skills.lastEngChangeTick = state.tick;
      return commandResult(state, envelope, undefined, !changed);
    }
    if (c.kind === 'buyUpgrade' || c.kind === 'buyReactor') {
      if (!online) return commandResult(state, envelope, 'unavailable');
      if (c.kind === 'buyUpgrade' ? state.run.upgrades[c.system] !== c.expectedLevel : state.run.reactorBonus !== c.expectedBonus) return commandResult(state, envelope, 'stale-target');
      const bought = c.kind === 'buyUpgrade' ? buyUpgrade(state, c.system) : buyReactor(state);
      return commandResult(state, envelope, bought ? undefined : 'unavailable');
    }
    if (c.kind === 'doorCycle') {
      if (!state.derived.doorEdges.includes(c.edge)) return commandResult(state, envelope, 'stale-target');
      if (c.mode !== (online ? 'cycle' : 'seal')) return commandResult(state, envelope, 'unavailable');
      (online ? state.scratch.doorCycles : state.scratch.doorToggles).add(c.edge);
    } else {
      if (!Number.isInteger(c.airlock) || c.airlock < 0 || c.airlock >= state.airlocks.open.length) return commandResult(state, envelope, 'stale-target');
      if (!online) return commandResult(state, envelope, 'unavailable');
      state.scratch.airlockToggles.add(c.airlock);
    }
    state.skills.lastDoorToggleTick = state.tick;
    return commandResult(state, envelope);
  }
  return commandResult(state, envelope, 'unsupported');
}
/** Empty migration scaffolding: no card family accepts raw input. */
export function legacyCardReason(_state: SimState, _envelope: LegacyInputEnvelope, _inTick = false): CommandReason {
  return 'unsupported';
}
