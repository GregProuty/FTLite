// One cached image at its natural size in internal pixels (hud.ts's Sprite), or tinted through a CSS mask (the station
// glyphs, drawn white and tinted like Pixi's Graphics.tint). Nothing when the cache lacks it.
import { memo } from 'react';
import { Box } from './Box';
import { hex } from './color';
import { useImages } from './ImagesContext';

export const Icon = memo(function Icon(p: { name: string; x: number; y: number; tint?: number }) {
  const img = useImages().get(p.name); if (!img) return null;
  const style = p.tint === undefined
    ? { backgroundImage: `url(${img.url})`, backgroundSize: '100% 100%', imageRendering: 'pixelated' as const }
    : { backgroundColor: hex(p.tint), maskImage: `url(${img.url})`, maskSize: '100% 100%', WebkitMaskImage: `url(${img.url})`, WebkitMaskSize: '100% 100%' };
  return <Box x={p.x} y={p.y} w={img.w} h={img.h} attrs={{ 'data-ui-image': p.name }} style={style} />;
});
