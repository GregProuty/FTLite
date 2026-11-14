import type { ClientMessage, Command, Compatibility, HeldFrame } from '../../src/renderer/src/net/contracts';

export const compatibility: Compatibility = { protocolVersion: 1, simVersion: 34, contentDigest: 'a'.repeat(64) };
export const visit = { sector: 0, beacon: 1, arrivalTick: 0 };
export const weapon = { selector: 0, expectedWeaponId: 1 };
export const target = { kind: 'object' as const, stableId: 12 };
export const commands: Command[] = [
  { kind: 'moveTo', tile: 0 }, { kind: 'sit', station: 0 }, { kind: 'stand' },
  { kind: 'toggleDoorLocal', edge: 0 }, { kind: 'doorCycle', station: 0, edge: 0, mode: 'cycle' },
  { kind: 'airlockToggle', station: 0, airlock: 0 }, { kind: 'power', station: 0, target: 1, delta: -1 },
  { kind: 'coolant', station: 0, target: 1 }, { kind: 'buyUpgrade', station: 0, system: 0, expectedLevel: 1 },
  { kind: 'buyReactor', station: 0, expectedBonus: 0 }, { kind: 'selectWeapon', station: 0, weapon },
  { kind: 'selectTarget', station: 0, target: null }, { kind: 'fire', station: 0, weapon, target },
  { kind: 'swapCargo', station: 0, slot: 0, expectedCargo: 2, expectedEquipped: 0 },
  { kind: 'scan', station: 0, target: { kind: 'enemy', stableId: 13, room: 0 } },
  { kind: 'systemScan', station: 0, visit }, { kind: 'lockFrequency', station: 0, enemyId: 13 },
  { kind: 'vote', event: { visit, eventId: 0 }, choice: 0 },
  { kind: 'jumpAgree', pending: { visit, requestedAtTick: 0, destination: 2 } },
  { kind: 'buy', station: 0, visit, item: 0, expectedOffer: 1 },
  { kind: 'jump', station: 0, visit, destination: 2 }, { kind: 'sectorJump', station: 0, visit },
  { kind: 'wait', station: 0, visit }, { kind: 'evade', station: 0 }, { kind: 'tab', group: 0, station: 1 },
  { kind: 'setPaused', paused: true }
];
export function commandMessage(command: Command = { kind: 'stand' }, sequence = 1): ClientMessage {
  return { kind: 'command', envelope: { runId: 'run-1', id: { player: 0, sequence }, requestedTick: 0, command } };
}
export function heldMessage(player = 0, sequence = 1, runId = 'run-1'): ClientMessage & { kind: 'held' } {
  const frame: HeldFrame = { runId, player, tick: 0, sequence, held: { moveX: 0.8, moveY: 0.8, interactHeld: false } };
  return { kind: 'held', frame };
}
