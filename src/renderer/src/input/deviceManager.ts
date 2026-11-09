import { MAX_PLAYERS } from '../../../shared/intent';
import { NEUTRAL_FRAME, type InputFrame } from '../app/intents';

export interface SourceSample {
  key: string; moveX: number; moveY: number;
  interact: boolean; confirm: boolean; cancel: boolean;
  presses?: { interact: number; confirm: number; cancel: number };
}
export type SlotStatus = 'empty' | 'active' | 'reconnect';
export interface SlotInfo { status: SlotStatus; key: string | null }

/** Device-to-player mapping (spec §6). Pure: feed it samples, get frames. Device polling lives in sources.ts. */
export function createDeviceManager(maxPlayers = MAX_PLAYERS) {
  let slots: SlotInfo[] = [];
  let prev = new Map<string, SourceSample>();
  const reset = (): void => { slots = Array.from({ length: maxPlayers }, () => ({ status: 'empty', key: null })); prev = new Map(); };
  reset();

  const edges = (cur: SourceSample): { interact: number; confirm: number; cancel: number } => {
    if (cur.presses) return cur.presses;   // the device counted its own edges (keyboard)
    const p = prev.get(cur.key);
    return {
      interact: cur.interact && !(p?.interact ?? false) ? 1 : 0,
      confirm: cur.confirm && !(p?.confirm ?? false) ? 1 : 0,
      cancel: cur.cancel && !(p?.cancel ?? false) ? 1 : 0
    };
  };

  return {
    reset,
    update(samples: readonly SourceSample[], allowJoin: boolean) {
      const present = new Map(samples.map((x) => [x.key, x] as const));
      // Disconnects.
      for (const slot of slots) if (slot.status === 'active' && !present.has(slot.key!)) { slot.status = 'reconnect'; slot.key = null; }
      const assigned = new Set(slots.map((x) => x.key).filter((k): k is string => k !== null));
      // Joins and reclaims, in sample order.
      for (const smp of samples) {
        if (assigned.has(smp.key)) continue;
        const e = edges(smp);
        if (!(e.interact || e.confirm || e.cancel)) continue;
        let target = slots.findIndex((x) => x.status === 'reconnect');
        if (target < 0 && allowJoin && e.interact) target = slots.findIndex((x) => x.status === 'empty');
        if (target < 0) continue;
        slots[target] = { status: 'active', key: smp.key }; assigned.add(smp.key);
      }
      // Frames.
      const frames: InputFrame[] = slots.map((slot) => {
        if (slot.status !== 'active') return { ...NEUTRAL_FRAME };
        const smp = present.get(slot.key!)!, e = edges(smp);
        return { moveX: smp.moveX, moveY: smp.moveY, interactHeld: smp.interact, interactPresses: e.interact, confirmPresses: e.confirm, cancelPresses: e.cancel };
      });
      prev = present; // keys that vanished forget their history, so a reconnect emits a fresh edge
      return { frames, slots: slots.map((x) => ({ ...x })), joinedCount: slots.filter((x) => x.status !== 'empty').length };
    }
  };
}
