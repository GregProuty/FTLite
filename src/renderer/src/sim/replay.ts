import type { Intent } from '../../../shared/intent';

export type CompactIntent = [number, number, number];
export interface Replay { version: number; seed: number; playerCount: number; layoutId: string; simVersion: number; layoutHash: string; intents: CompactIntent[][] }

export function encodeIntent(i: Intent): CompactIntent {
  return [i.moveX, i.moveY, (i.interactHeld ? 1 : 0) | (i.interactPressed ? 2 : 0) | (i.confirmPressed ? 4 : 0) | (i.cancelPressed ? 8 : 0)];
}
export function decodeIntent(c: CompactIntent): Intent {
  return { moveX: c[0], moveY: c[1], interactHeld: !!(c[2] & 1), interactPressed: !!(c[2] & 2), confirmPressed: !!(c[2] & 4), cancelPressed: !!(c[2] & 8) };
}
