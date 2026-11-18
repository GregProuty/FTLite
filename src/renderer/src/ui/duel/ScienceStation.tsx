// The Science station block (Sci-1 spec 2026-11-17-science-scans §7.3): the map and the contact window are the Science
// console's controls, so the block holds only the hover readout (bearing and range from the crew ship to the cursor)
// and the key help, at the bottom left.
import { memo } from 'react';
import type { SciencePanel } from '../../render/duel/consoleModel';
import { STATION, stationTop } from '../../render/duel/consoleLayout';
import { DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

export const ScienceStation = memo(function ScienceStation({ science }: { science: SciencePanel }) {
  const { crt } = useCrt(), top = stationTop('science'), x0 = STATION.x + 8, dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.science} />
      <PixelText text="SCIENCE" x={x0} y={top + 6} size={FONT_NATIVE} tint={dim} />
      <PixelText text={science.hover ?? 'BRG --- RNG ---'} x={x0} y={top + 24} size={FONT_SIZE} tint={main} />
      <PixelText text="CLICK: SELECT   S: SCAN   T: NEXT" x={x0} y={top + 66} size={FONT_NATIVE} tint={dim} />
    </>
  );
});
