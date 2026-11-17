// hud.ts's lobby card and game-over summary (UI-iii): twelve centred rows over a dark backdrop. hud.ts draws the
// backdrop under the banner and the rows over the banner glyphs, so the Hud places the two parts apart.
import { memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import type { HudModel } from '../../render/hudModel';
import { SUMMARY_TOP, SUMMARY_W } from '../../render/hudLayout';
import { AMBER, BACKDROP, BACKDROP_ALPHA, FONT_SIZE, LINE, RULE, TEXT, textPx } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { useHairline } from '../stage/hairline';
import { PixelText } from '../stage/PixelText';

export interface SummaryProps { phase: HudModel['phase']; lobbyShip: string; lobbyLines: readonly string[]; summary: readonly string[] | null }
/** Rows 0-11: the lobby's ship (row 1) and lines (rows 2-11), or the game-over summary; '' hidden. */
function summaryLines(p: SummaryProps): string[] {
  return Array.from({ length: 12 }, (_, k) => (p.phase === 'lobby' ? (k === 1 ? p.lobbyShip : p.lobbyLines[k - 2]) : p.summary?.[k]) ?? '');
}

export const SummaryBack = memo(function SummaryBack(p: SummaryProps) {
  const hair = useHairline(), shown = summaryLines(p).filter((t) => t);
  if (!(p.phase === 'gameover' || p.phase === 'lobby') || shown.length === 0) return null;
  const lobby = p.phase === 'lobby', wide = Math.min(SUMMARY_W, Math.max(0, ...shown.map((t) => Math.ceil(textPx(t)))));
  const top = SUMMARY_TOP + (lobby ? LINE : 0), bottom = SUMMARY_TOP + 12 * LINE;
  const h = Math.min(bottom, SUMMARY_TOP + (lobby ? 12 : p.summary!.length) * LINE) - top + 12;
  return <Box x={INTERNAL_W / 2 - wide / 2 - 16} y={top - 6} w={wide + 32} h={h} attrs={{ 'data-ui-summary-back': '' }}
    style={{ background: hex(BACKDROP, BACKDROP_ALPHA), border: `${2 * hair}px solid ${hex(RULE)}` }} />;
});

export const SummaryRows = memo(function SummaryRows(p: SummaryProps) {
  return <>{summaryLines(p).map((line, k) => line
    ? <PixelText key={k} text={line} x={INTERNAL_W / 2} y={SUMMARY_TOP + k * LINE} size={FONT_SIZE} anchorX={0.5}
      tint={(p.phase === 'lobby' && k === 1) || (p.phase === 'gameover' && k === 0) ? AMBER : TEXT} />
    : null)}</>;
});
