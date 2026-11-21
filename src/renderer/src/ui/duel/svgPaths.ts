// SVG path text from flat coordinate arrays, shared by the contact window and the own ship window (own ship window spec §4).
import { hexPoints } from '../../render/shieldFx';
/** [x0, y0, x1, y1, ...] as an SVG `points` attribute. */
export const polyPoints = (p: readonly number[]): string => { const out: string[] = []; for (let k = 0; k + 1 < p.length; k += 2) out.push(`${p[k]},${p[k + 1]}`); return out.join(' '); };
/** The shield shimmer's hex cells grouped by alpha: one closed-hexagon path per distinct alpha (the models round alpha to 1/20 steps). */
export const cellPaths = (cells: readonly { x: number; y: number; alpha: number }[], r: number): { alpha: number; d: string }[] => {
  const by = new Map<number, string>();
  for (const c of cells) {
    let d = by.get(c.alpha) ?? '';
    const p = hexPoints(c.x, c.y, r);
    for (let i = 0; i < 6; i++) d += `${i === 0 ? 'M' : 'L'}${+p[2 * i]!.toFixed(2)} ${+p[2 * i + 1]!.toFixed(2)}`;
    by.set(c.alpha, d + 'Z');
  }
  return [...by].map(([alpha, d]) => ({ alpha, d }));
};
/** Segments [x1, y1, x2, y2, ...] as one SVG path of move-line pairs. */
export const segPath = (s: readonly number[]): string => { let d = ''; for (let k = 0; k + 3 < s.length; k += 4) d += `M${s[k]} ${s[k + 1]}L${s[k + 2]} ${s[k + 3]}`; return d; };
