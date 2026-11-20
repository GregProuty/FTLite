// Net-4a §3.6: other players' characters are drawn from the confirmed state, one publication gap behind (Net-0 §3.4),
// while the ship world and this seat's own character are drawn from the prediction. The override gives each other
// character its confirmed latest (`at`) and previous (`prev`) position and the gap alpha; this seat's slot is null.
import type { PresentationPoint } from '../../../../network/state/timeline';

export interface CrewOverride { at: readonly ({ x: number; y: number } | null)[]; prev: readonly ({ x: number; y: number } | null)[]; alpha: number }
const clamp = (a: number): number => Math.max(0, Math.min(1, a));
/** Where character `pid` is drawn, in tiles: its override's blend when it has one, else (x, y) blended from crewPrev by alpha. */
export function crewDrawAt(pid: number, x: number, y: number, crewPrev: readonly ({ x: number; y: number } | undefined)[], alpha: number, override: CrewOverride | null): { x: number; y: number } {
  const at = override?.at[pid];
  if (at) { const was = override!.prev[pid] ?? at, a = clamp(override!.alpha); return { x: was.x + (at.x - was.x) * a, y: was.y + (at.y - was.y) * a }; }
  const was = crewPrev[pid];
  return was ? { x: was.x + (x - was.x) * alpha, y: was.y + (y - was.y) * alpha } : { x, y };
}
/** The crew layer's presentation points (crewSprites' `crew:<pid>` ids, tiles) for the overridden characters; none without an override. */
export function crewPresentation(override: CrewOverride | null): PresentationPoint[] | undefined {
  if (!override) return undefined;
  const out: PresentationPoint[] = [];
  override.at.forEach((at, pid) => { if (at) { const p = crewDrawAt(pid, at.x, at.y, [], 1, override); out.push({ id: `crew:${pid}`, x: p.x, y: p.y, generation: 'online' }); } });
  return out;
}
