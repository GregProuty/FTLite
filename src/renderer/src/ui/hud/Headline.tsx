// hud.ts's banner, progress line, run notices and banner glyph row (UI-iii).
import { memo } from 'react';
import { glyphName, type DeviceKind, type HudModel } from '../../render/hudModel';
import { BANNER_GLYPHS_Y, BANNER_Y, PROGRESS_Y } from '../../render/hudLayout';
import { AMBER, DIM, FONT_SIZE, LINE, TEXT, TITLE_SIZE } from '../../render/theme';
import { useImages } from '../stage/ImagesContext';
import { PixelText } from '../stage/PixelText';
import { Row } from '../stage/Row';
import { rowLayout } from '../stage/rowLayout';
import { useHudLayout } from '../stage/useStage';

const NOTICE_TINTS = [AMBER, TEXT] as const;

export const Headline = memo(function Headline(p: { phase: HudModel['phase']; message: string; progressLine: string; notice: readonly string[]; deviceKind: DeviceKind }) {
  const images = useImages(), { NOTICE, NOTICE_X, CENTER_X } = useHudLayout();
  const parts = (p.phase === 'lobby' || p.phase === 'gameover') && p.deviceKind
    ? [{ glyph: glyphName('confirm', p.deviceKind), text: 'Confirm' }, { glyph: glyphName('cancel', p.deviceKind), text: 'Cancel' }] : null;
  return (
    <>
      {p.phase !== 'running' && p.message && <PixelText text={p.message} x={CENTER_X} y={BANNER_Y} size={TITLE_SIZE} tint={TEXT} anchorX={0.5} />}
      {p.progressLine && <PixelText text={p.progressLine} x={CENTER_X} y={PROGRESS_Y} size={FONT_SIZE} tint={DIM} anchorX={0.5} />}
      {p.phase === 'running' && NOTICE_TINTS.map((tint, k) => { const line = p.notice[k]; return line ? <PixelText key={k} text={line} x={NOTICE_X} y={NOTICE.y + k * LINE} size={FONT_SIZE} tint={tint} anchorX={0.5} /> : null; })}
      {parts && <Row x={CENTER_X - rowLayout(parts, (n) => images.has(n)).width / 2} y={BANNER_GLYPHS_Y} parts={parts} />}
    </>
  );
});
