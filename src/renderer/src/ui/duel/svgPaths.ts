// SVG path text from flat coordinate arrays, shared by the contact window and the own ship window (own ship window spec §4).
/** [x0, y0, x1, y1, ...] as an SVG `points` attribute. */
export const polyPoints = (p: readonly number[]): string => { const out: string[] = []; for (let k = 0; k + 1 < p.length; k += 2) out.push(`${p[k]},${p[k + 1]}`); return out.join(' '); };
/** Segments [x1, y1, x2, y2, ...] as one SVG path of move-line pairs. */
export const segPath = (s: readonly number[]): string => { let d = ''; for (let k = 0; k + 3 < s.length; k += 4) d += `M${s[k]} ${s[k + 1]}L${s[k + 2]} ${s[k + 3]}`; return d; };
