// hud.ts's banner, progress line, run notices and banner glyph row (UI-iii).
import { memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import { glyphName, type DeviceKind, type HudModel } from '../../render/hudModel';
import { BANNER_GLYPHS_Y, BANNER_Y, NOTICE, NOTICE_X, PROGRESS_Y } from '../../render/hudLayout';
import { AMBER, DIM, FONT_SIZE, LINE, TEXT, TITLE_SIZE } from '../../render/theme';
import { useImages } from '../stage/ImagesContext';
import { PixelText } from '../stage/PixelText';
import { Row } from '../stage/Row';
import { rowLayout } from '../stage/rowLayout';

const NOTICE_TINTS = [AMBER, TEXT] as const;

export const Headline = memo(function Headline(p: { phase: HudModel['phase']; message: string; progressLine: string; notice: readonly string[]; deviceKind: DeviceKind }) {
  const images = useImages();
  const parts = (p.phase === 'lobby' || p.phase === 'gameover') && p.deviceKind
    ? [{ glyph: glyphName('confirm', p.deviceKind), text: 'Confirm' }, { glyph: glyphName('cancel', p.deviceKind), text: 'Cancel' }] : null;
  return (
    <>
      {p.phase !== 'running' && p.message && <PixelText text={p.message} x={INTERNAL_W / 2} y={BANNER_Y} size={TITLE_SIZE} tint={TEXT} anchorX={0.5} />}
      {p.progressLine && <PixelText text={p.progressLine} x={INTERNAL_W / 2} y={PROGRESS_Y} size={FONT_SIZE} tint={DIM} anchorX={0.5} />}
      {p.phase === 'running' && NOTICE_TINTS.map((tint, k) => { const line = p.notice[k]; return line ? <PixelText key={k} text={line} x={NOTICE_X} y={NOTICE.y + k * LINE} size={FONT_SIZE} tint={tint} anchorX={0.5} /> : null; })}
      {parts && <Row x={INTERNAL_W / 2 - rowLayout(parts, (n) => images.has(n)).width / 2} y={BANNER_GLYPHS_Y} parts={parts} />}
    </>
  );
});
