// The F3 latency overlay (H-2 spec §9, H-2b Decision 5): the thin view of latencyOverlayLines, one native-size line
// per row in the top-left corner over the duel, as the Pixi text it replaces drew it.
import { memo } from 'react';
import { FONT_NATIVE, TEXT } from '../../render/theme';
import { PixelText } from '../stage/PixelText';

const X = 12, Y = 12, STEP = FONT_NATIVE;

export const LatencyOverlay = memo(function LatencyOverlay({ lines }: { lines: readonly string[] }) {
  return <>{lines.map((line, k) => <PixelText key={k} text={line} x={X} y={Y + k * STEP} size={FONT_NATIVE} tint={TEXT} />)}</>;
});
