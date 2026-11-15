import type { CommandEnvelope, CommandResult } from '../net/contracts';

export type OutboxState = 'ready' | 'resync-required';
export type CommandOutbox = ReturnType<typeof createCommandOutbox>;

function sequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('invalid expected sequence');
}

/** One producer generation. Payloads remain private until authority admission advances. */
export function createCommandOutbox(player: number, initialSequence: number, capacity = 256) {
  if (!Number.isSafeInteger(player) || player < 0) throw new Error('invalid outbox player');
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('invalid outbox capacity');
  sequence(initialSequence);
  let expected = initialSequence, next = initialSequence, state: OutboxState = 'ready', retry: number | null = null;
  const retained = new Map<number, { envelope: CommandEnvelope; sendable: boolean }>();
  function canAllocate(control: boolean, staged = 0): boolean {
    if (!Number.isSafeInteger(staged) || staged < 0) throw new Error('invalid staged commands');
    return state === 'ready' && Number.isSafeInteger(next + staged) && retained.size + staged < capacity - (control ? 0 : 1);
  }
  function reconcile(value: number): OutboxState {
    sequence(value);
    if (state === 'resync-required' || value < expected) return state;
    if (value > next) return state = 'resync-required';
    expected = value;
    for (const id of retained.keys()) if (id < expected) retained.delete(id);
    if (retry !== null && expected > retry) retry = null;
    if (expected < next && !retained.has(expected)) state = 'resync-required';
    return state;
  }
  return {
    canAllocate,
    enqueue(envelope: CommandEnvelope): void {
      if (envelope.id.player !== player || envelope.id.sequence !== next) throw new Error('noncontiguous outbox command');
      if (!canAllocate(envelope.command.kind === 'setPaused')) throw new Error('outbox capacity unavailable');
      retained.set(next, { envelope: structuredClone(envelope), sendable: true }); next++;
    },
    takeSendable(): readonly CommandEnvelope[] {
      if (state !== 'ready') return [];
      const ready: CommandEnvelope[] = [];
      for (const [id, entry] of retained) if (entry.sendable && (retry === null || id === retry)) {
        entry.sendable = false; ready.push(structuredClone(entry.envelope));
      }
      return ready;
    },
    ack(result: CommandResult): OutboxState {
      if (result.id.player !== player || !result.admission) return state;
      const { expectedSequence, disposition } = result.admission;
      sequence(expectedSequence);
      if (expectedSequence < expected || reconcile(expectedSequence) !== 'ready') return state;
      if (disposition === 'retryable') {
        if (!retained.has(expected)) return state = 'resync-required';
        retry = expected;
        // Higher commands may already have been refused behind this gap. They
        // become eligible again only after the missing ID has been admitted.
        for (const entry of retained.values()) entry.sendable = true;
      }
      return state;
    },
    reconcile,
    reset(value: number): void {
      sequence(value); retained.clear(); expected = next = value; retry = null; state = 'ready';
    },
    size: () => retained.size
  };
}
