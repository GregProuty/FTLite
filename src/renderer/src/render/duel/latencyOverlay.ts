// The F3 latency overlay (H-2 spec §9): the live median and 95th percentile of the held and command delays on either
// machine of an online duel, with the link's route and RTT. One self-contained module: `latencyOverlayLines` is the pure
// model (plain strings, so a React view can render the same lines), `createLatencyOverlay` is the thin Pixi draw on
// the stage above the duel scene, and `createKeyToggle` is the F3 switch. The duel scene itself is not touched.
import { BitmapText, type Container } from 'pixi.js';
import type { LatencyFigure } from '../../net/duelRecord';
import { FONT_NATIVE, TEXT } from '../theme';

/** The key that shows and hides the overlay. */
export const OVERLAY_CODE = 'F3';
export interface LatencyOverlayModel {
  transport: 'loopback' | 'lan' | 'internet' | null;
  held: LatencyFigure; command: LatencyFigure;
  rttMs: number | null;
}
const ms = (v: number | null): string => (v === null ? '-' : `${Math.round(v)}`);
const row = (label: string, f: LatencyFigure): string => `${label} n ${f.count}  MED ${ms(f.median)}  P95 ${ms(f.p95)}  MAX ${ms(f.max)} MS`;
/** The overlay's lines: the route, the held delay, the command delay and the RTT. */
export function latencyOverlayLines(m: LatencyOverlayModel): string[] {
  return [`LATENCY  ${m.transport === null ? 'LINK ?' : m.transport.toUpperCase()}   F3: HIDE`, row('HELD', m.held), row('CMD ', m.command), `RTT ${ms(m.rttMs)} MS`];
}

/** The structural subset of a DOM event target the toggle needs. */
export interface KeyTarget {
  addEventListener(type: string, fn: (e: never) => void): void;
  removeEventListener(type: string, fn: (e: never) => void): void;
}
/** A key that flips a switch on each press (auto-repeat ignored); starts off. */
export function createKeyToggle(target: KeyTarget, code = OVERLAY_CODE) {
  let on = false;
  const down = (e: { code: string; repeat: boolean; preventDefault(): void }): void => {
    if (e.code !== code) return;
    e.preventDefault();
    if (!e.repeat) on = !on;
  };
  target.addEventListener('keydown', down as (e: never) => void);
  return { on: () => on, destroy(): void { target.removeEventListener('keydown', down as (e: never) => void); } };
}

/** The Pixi draw: one text block in the top-left corner, added to `stage` last so it sits over the duel scene. */
export function createLatencyOverlay(stage: Container, fontFamily: string) {
  const text = new BitmapText({ text: '', style: { fontFamily, fontSize: FONT_NATIVE } });
  text.tint = TEXT; text.position.set(12, 12); text.visible = false;
  stage.addChild(text);
  return {
    /** Show `lines`, or hide the overlay with null. */
    draw(lines: readonly string[] | null): void {
      text.visible = lines !== null;
      if (lines) { const next = lines.join('\n'); if (text.text !== next) text.text = next; }
    },
    destroy(): void { stage.removeChild(text); text.destroy(); }
  };
}
export type LatencyOverlay = ReturnType<typeof createLatencyOverlay>;
