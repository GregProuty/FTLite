// UI round spec §1.7: the FPS readout, bottom right, native size, dim, in every view and over the menu (its own layer at
// z 30, the stage's offsets). Hidden by the Settings switch, and until the first reading.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../shared/resolution';
import { DIM, FONT_NATIVE } from '../render/theme';
import { useUi } from './context';
import { PixelText } from './stage/PixelText';
import { useStage } from './stage/useStage';

/** The reference stage's spot; UI round 2b: the readout follows the stage's bottom-right corner (`w - 8`, `h - 18`). */
export const FPS_X = INTERNAL_W - 8, FPS_Y = INTERNAL_H - 18;

export const FpsCounter = memo(function FpsCounter() {
  const on = useUi((s) => s.settings.fpsCounter), fps = useUi((s) => s.fps);
  const top = useUi((s) => s.layout.stripHeight), dpr = useUi((s) => s.layout.dpr), stage = useStage();
  if (!on || fps === null) return null;
  return (
    <div data-ui-fps="" style={{ position: 'fixed', left: 0, right: 0, top: Math.round(top * dpr) / dpr, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 30 }}>
      <PixelText text={`${fps} FPS`} x={stage.w - (INTERNAL_W - FPS_X)} y={stage.h - (INTERNAL_H - FPS_Y)} size={FONT_NATIVE} tint={DIM} anchorX={1} />
    </div>
  );
});
