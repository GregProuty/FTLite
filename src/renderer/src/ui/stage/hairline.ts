import { useUi } from '../context';
/** One internal pixel as whole device pixels (Pixi's 1 px strokes, scaled by the letterbox like Panel's border). */
export function useHairline(): number { const l = useUi((s) => s.layout); return Math.max(1, Math.round(l.scale * l.dpr)) / l.dpr; }
