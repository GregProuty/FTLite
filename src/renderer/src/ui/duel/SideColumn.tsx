// The console's right column (spec 2026-11-17-artemis-consoles §2 "Right column"): the zoom value with - and + buttons, and
// the camera snap button (lit while the camera is free).
import { memo } from 'react';
import type { ConsoleView } from '../../render/duel/consoleModel';
import { SIDE } from '../../render/duel/consoleLayout';
import { DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useActions } from '../context';
import { Button } from '../stage/Button';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

export const SideColumn = memo(function SideColumn({ side }: { side: NonNullable<ConsoleView['side']> }) {
  const actions = useActions(), { crt } = useCrt();
  return (
    <>
      <Panel x={SIDE.x} y={SIDE.y} w={SIDE.w} h={96} />
      <PixelText text="ZOOM" x={SIDE.x + 8} y={SIDE.y + 6} size={FONT_NATIVE} tint={crt ? CRT.mid : DIM} />
      <Button name="zoom-out" label="-" x={SIDE.x + 8} y={SIDE.y + 28} w={24} h={24} onPress={() => actions.console.press('zoomOut')} />
      <PixelText text={side.zoom} x={SIDE.x + SIDE.w / 2} y={SIDE.y + 30} size={FONT_SIZE} tint={crt ? CRT.main : TEXT} anchorX={0.5} />
      <Button name="zoom-in" label="+" x={SIDE.x + SIDE.w - 8 - 24} y={SIDE.y + 28} w={24} h={24} onPress={() => actions.console.press('zoomIn')} />
      <Button name="snap" label={side.snapLabel} hint="C" lit={side.free} x={SIDE.x + 8} y={SIDE.y + 60} w={SIDE.w - 16} h={24} onPress={() => actions.console.press('camera')} />
    </>
  );
});
