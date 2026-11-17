import { Fragment, memo } from 'react';
import { FONT_SIZE } from '../../render/theme';
import { Icon } from './Icon';
import { useImages } from './ImagesContext';
import { PixelText } from './PixelText';
import { rowLayout, type RowPart } from './rowLayout';

/** A HUD row (hud.ts's fillRow) at internal (x, y): images at y + 7, text at y, FONT_SIZE. */
export const Row = memo(function Row(p: { x: number; y: number; parts: readonly RowPart[]; gap?: number }) {
  const images = useImages(), { items } = rowLayout(p.parts, (n) => images.has(n), p.gap);
  return <>{items.map((it, k) => (
    <Fragment key={k}>
      {it.glyph && <Icon name={it.glyph.name} x={p.x + it.glyph.x} y={p.y + 7} />}
      {it.icon && <Icon name={it.icon.name} x={p.x + it.icon.x} y={p.y + 7} />}
      {it.text.text && <PixelText text={it.text.text} x={p.x + it.text.x} y={p.y} size={FONT_SIZE} tint={it.text.tint} />}
    </Fragment>
  ))}</>;
});
