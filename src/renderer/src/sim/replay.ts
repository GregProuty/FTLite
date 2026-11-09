import type { Intent } from '../../../shared/intent';
import type { ShipLayout } from './ship/schema';
import { createSimState } from './state';
import { step } from './step';
import { hashState } from './hash';

export type CompactIntent = [number, number, number];
export interface Replay { version: number; seed: number; playerCount: number; layoutId: string; intents: CompactIntent[][] }

export function encodeIntent(i: Intent): CompactIntent {
  return [i.moveX, i.moveY, (i.interactHeld ? 1 : 0) | (i.interactPressed ? 2 : 0) | (i.confirmPressed ? 4 : 0) | (i.cancelPressed ? 8 : 0)];
}
export function decodeIntent(c: CompactIntent): Intent {
  return { moveX: c[0], moveY: c[1], interactHeld: !!(c[2] & 1), interactPressed: !!(c[2] & 2), confirmPressed: !!(c[2] & 4), cancelPressed: !!(c[2] & 8) };
}

/** Headless replay. Hashes every `every` ticks localize a divergence; the final hash is the verdict (spec §10). */
export function runReplay(layout: ShipLayout, replay: Replay, every = 60): { hashes: string[]; finalHash: string } {
  if (replay.layoutId !== layout.id) throw new Error(`replay is for layout ${replay.layoutId}, loaded ${layout.id}`);
  const state = createSimState(layout, replay.playerCount, replay.seed);
  const hashes: string[] = [];
  for (let t = 0; t < replay.intents.length; t++) {
    step(state, replay.intents[t]!.map(decodeIntent));
    if ((t + 1) % every === 0) hashes.push(hashState(state));
  }
  return { hashes, finalHash: hashState(state) };
}
