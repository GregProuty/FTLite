// The F3 latency overlay (H-2 spec §9): the live median and 95th percentile of the held and command delays on either
// machine of an online duel, with the link's route and RTT. `latencyOverlayLines` is the pure model (plain strings) and
// `createKeyToggle` is the F3 switch; the online session hands the lines to the UI store's latency sink, and the thin
// React view (ui/duel/LatencyOverlay.tsx) draws them over the duel (H-2b Decision 5, after UI-ii). No Pixi here.
import type { LatencyFigure } from '../../net/duelRecord';

/** The key that shows and hides the overlay. */
export const OVERLAY_CODE = 'F3';
/** Net-4a §3.10: the prediction's figures. Fable #1, #2: the last correction's own-ship heading change (heading steps) and
 *  the retargets in the last 60 s. */
export interface PredictionFigures { leadTicks: number; verifiedShare: number | null; resimP99Ms: number | null; correction: number | null; heading: number | null; retargetsPerMin: number }
export interface LatencyOverlayModel {
  transport: 'loopback' | 'lan' | 'internet' | null;
  held: LatencyFigure; command: LatencyFigure;
  rttMs: number | null;
  prediction?: PredictionFigures | null;
}
const ms = (v: number | null): string => (v === null ? '-' : `${Math.round(v)}`);
const row = (label: string, f: LatencyFigure): string => `${label} n ${f.count}  MED ${ms(f.median)}  P95 ${ms(f.p95)}  MAX ${ms(f.max)} MS`;
/** The overlay's lines: the route, the held delay, the command delay and the RTT. */
export function latencyOverlayLines(m: LatencyOverlayModel): string[] {
  const lines = [`LATENCY  ${m.transport === null ? 'LINK ?' : m.transport.toUpperCase()}   F3: HIDE`, row('HELD', m.held), row('CMD ', m.command), `RTT ${ms(m.rttMs)} MS`];
  const p = m.prediction;
  if (p) lines.push(`PRED LEAD ${p.leadTicks} (${Math.round(p.leadTicks * 1000 / 60)} MS)  OK ${p.verifiedShare === null ? '?' : `${Math.round(p.verifiedShare * 100)}%`}  RESIM ${p.resimP99Ms === null ? '?' : p.resimP99Ms.toFixed(2)} MS  FIX ${p.correction === null ? '0' : p.correction.toFixed(2)} U  HDG ${p.heading === null ? '0' : p.heading.toFixed(2)}  RT ${p.retargetsPerMin}/MIN`);
  return lines;
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
