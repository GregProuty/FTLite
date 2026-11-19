// Engineering spike §9.3, §10.4: a console's own system power in the CRT ramp, beside its station block: the slots (on,
// empty, lost and crossed, the overdrive slot dashed), the heat bar, the reactor's spare bars, and on Science the sensor
// range. Read-only: power moves on the ship view, weapon bars on the Weapons block.
import { memo } from 'react';
import { POWER_STRIP, stripTop } from '../../render/duel/consoleLayout';
import { overdriveSlot, slotState, type ConsolePowerStrip } from '../../render/duel/shipHudModel';
import { ALERT_BLINK_HZ, blink, CRT } from '../../render/tactical/crtTheme';
import { FONT_NATIVE } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

export const PowerStrip = memo(function PowerStrip({ strip }: { strip: ConsolePowerStrip }) {
  const { now } = useCrt(), S = POWER_STRIP, top = stripTop(), x0 = S.x + 8, heatW = strip.slots * (S.slotW + S.slotGap) - S.slotGap;
  const hot = strip.failed ? (blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.dim) : strip.overdriven ? CRT.hot : CRT.main;
  return (
    <>
      <Panel x={S.x} y={top} w={S.w} h={S.h} />
      <Box x={S.x} y={top} w={S.w} h={1} attrs={{ 'data-ui-strip': String(strip.system), ...(strip.range !== undefined ? { 'data-ui-strip-range': String(strip.range) } : {}) }} style={{ pointerEvents: 'none' }} />
      <PixelText text={`${strip.name} POWER`} x={x0} y={top + 4} size={FONT_NATIVE} tint={strip.failed ? hot : CRT.mid} />
      <PixelText text={`SPARE ${strip.spare}`} x={S.x + S.w - 8} y={top + 4} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />
      {Array.from({ length: strip.slots }, (_, k) => {
        const s = slotState(strip, k), od = overdriveSlot(strip, k);
        return (
          <Box key={k} x={x0 + k * (S.slotW + S.slotGap)} y={top + 22} w={S.slotW} h={S.slotH} attrs={{ 'data-ui-strip-slot': s, ...(od ? { 'data-ui-strip-od': '' } : {}) }}
            style={{ background: s === 'on' ? hex(od ? CRT.hot : CRT.main) : hex(CRT.glass), border: `1px ${od ? 'dashed' : 'solid'} ${hex(s === 'lost' ? CRT.faint : od ? CRT.hot : CRT.dim)}` }}>
            {s === 'lost' && <svg width="100%" height="100%" viewBox={`0 0 ${S.slotW} ${S.slotH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <path d={`M0 0L${S.slotW} ${S.slotH}M${S.slotW} 0L0 ${S.slotH}`} stroke={hex(CRT.dim)} strokeWidth={1} /></svg>}
          </Box>
        );
      })}
      <Box x={x0} y={top + 40} w={heatW} h={4} attrs={{ 'data-ui-strip-heat': String(strip.heat) }} style={{ background: hex(CRT.faint) }}>
        <div style={{ width: `${Math.round((100 * Math.max(0, Math.min(strip.heat, strip.heatMax))) / strip.heatMax)}%`, height: '100%', background: hex(hot) }} />
      </Box>
      {strip.range !== undefined && <PixelText text={`RANGE ${strip.range}`} x={S.x + S.w - 8} y={top + 22} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />}
    </>
  );
});
