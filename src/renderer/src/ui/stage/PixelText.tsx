// Text from the glyph atlas (React UI spec §4): one canvas sized in device pixels, each glyph cell drawn with nearest
// sampling at size/16 x scale x dpr, then tinted. It redraws only when its inputs change; without an atlas (jsdom, or a
// failed build) it is an empty canvas that still carries its string for tests.
import { memo, useLayoutEffect, useRef } from 'react';
import { FONT_NATIVE, textPx } from '../../render/theme';
import { useUi } from '../context';
import { atlasTextWidth, GLYPH_X_OFFSET, GLYPH_X_PAD } from '../glyphs';
import { hex } from './color';
import { edge } from './geometry';
import { useGlyphs } from './GlyphContext';

export interface PixelTextProps { text: string; x: number; y: number; size: number; tint: number; anchorX?: number; anchorY?: number }

export const PixelText = memo(function PixelText(p: PixelTextProps) {
  const l = useUi((s) => s.layout), atlas = useGlyphs(), ref = useRef<HTMLCanvasElement>(null);
  const k = p.size / FONT_NATIVE, cellH = atlas?.cellH ?? FONT_NATIVE;
  const w = atlas ? atlasTextWidth(atlas, p.text) * k : textPx(p.text, k), h = cellH * k;
  const left = edge(p.x - (p.anchorX ?? 0) * w, l.offsetX, l.scale, l.dpr), top = edge(p.y - (p.anchorY ?? 0) * h, l.offsetY, l.scale, l.dpr);
  const devW = Math.max(1, Math.round(w * l.scale * l.dpr)), devH = Math.max(1, Math.round(h * l.scale * l.dpr));
  useLayoutEffect(() => {
    const c = ref.current; if (!c || !atlas) return;
    c.width = devW; c.height = devH;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, devW, devH);
    const g = k * l.scale * l.dpr, pad = GLYPH_X_PAD;
    let pen = 0;
    for (const ch of p.text) {
      const adv = atlas.advance[ch] ?? 6, sx = atlas.cells[ch];
      if (sx !== undefined) {
        const dx0 = Math.round((pen + GLYPH_X_OFFSET - pad) * g), dx1 = Math.round((pen + GLYPH_X_OFFSET + adv + pad) * g);
        ctx.drawImage(atlas.canvas, sx - pad, 0, adv + 2 * pad, cellH, dx0, 0, dx1 - dx0, Math.round(cellH * g));
      }
      pen += adv;
    }
    ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = hex(p.tint); ctx.fillRect(0, 0, devW, devH); ctx.globalCompositeOperation = 'source-over';
  }, [atlas, p.text, p.tint, devW, devH, k, l.scale, l.dpr, cellH]);
  return <canvas ref={ref} data-text={p.text} data-anchorx={String(p.anchorX ?? 0)} data-x={String(p.x)} data-y={String(p.y)}
    style={{ position: 'absolute', left, top, width: devW / l.dpr, height: devH / l.dpr, imageRendering: 'pixelated' }} />;
});
