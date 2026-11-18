// The ship HUD on the SHIP view (duel polish i spec §E): the segmented hull bar and the shield layers top left, and the
// system columns bottom left (bars over an icon over a short name). Drawn from shipHud(d); the bars show each system's
// working capacity and take no clicks (power cannot be moved in the duel). The icons are original inline SVG.
import { memo, type ReactElement } from 'react';
import { HUD, hullSegX, sysBarY, sysColumnX, sysIconY, type HudSystem, type HudSystemKey, type HullTone, type ShipHudView } from '../../render/duel/shipHudModel';
import { AMBER, BAR_FAIL, BAR_OFF, BAR_ON, BLUE, CELL_EDGE, DIM, FONT_NATIVE, GOOD, TEXT, WARN, textPx } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { PixelText } from '../stage/PixelText';

const TONE: Record<HullTone, number> = { good: GOOD, warn: AMBER, alert: WARN };
const OUTLINE = `1px solid ${hex(CELL_EDGE)}`;

/** The icons on a 24 × 24 grid, stroked in the column's tint (§E: original art). */
const ICONS: Record<HudSystemKey, ReactElement> = {
  // Helm (Engines): a thruster bell over two exhaust chevrons.
  helm: <><path d="M8 3h8v5l3 6H5l3-6z" /><path d="M8 17l4 3 4-3M9 21l3 2 3-2" /></>,
  // Weapons: a reticle with four ticks and a centre pip.
  weapons: <><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /><rect x="11" y="11" width="2" height="2" /></>,
  // Shields: a heater shield with a centre rib.
  shields: <><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" /><path d="M12 7v10" /></>,
  // Medbay: a squared cross.
  medbay: <path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z" />
};

function SystemColumn({ s, n }: { s: HudSystem; n: number }) {
  const S = HUD.sys, x = sysColumnX(n), tint = s.look === 'offline' ? WARN : s.look === 'dim' ? CELL_EDGE : TEXT;
  const name = s.look === 'offline' ? WARN : s.look === 'dim' ? CELL_EDGE : DIM;
  return (
    <>
      {Array.from({ length: s.bars }, (_, k) => {
        const state = k < s.lit ? 'lit' : k < s.lit + s.damaged ? 'damaged' : 'off';
        return <Box key={k} x={x + (S.colW - S.barW) / 2} y={sysBarY(k)} w={S.barW} h={S.barH} attrs={{ 'data-ui-hud-bar': state }}
          style={{ background: hex(state === 'lit' ? BAR_ON : state === 'damaged' ? BAR_FAIL : BAR_OFF), border: OUTLINE }} />;
      })}
      <Box x={x + (S.colW - S.icon) / 2} y={sysIconY()} w={S.icon} h={S.icon} attrs={{ 'data-ui-hud-sys': s.key, 'data-ui-hud-look': s.look }}>
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={hex(tint)} strokeWidth={2} strokeLinejoin="miter" style={{ display: 'block' }}>{ICONS[s.key]}</svg>
      </Box>
      <PixelText text={s.name} x={x + S.colW / 2} y={S.bottom - S.nameH} size={FONT_NATIVE} tint={name} anchorX={0.5} />
    </>
  );
}

export const ShipHud = memo(function ShipHud({ hud }: { hud: ShipHudView }) {
  const H = HUD.hull, SH = HUD.shields, tone = TONE[hud.hull.tone], pipX = HUD.x + textPx('SHIELDS', 1) + 8;
  return (
    <>
      <PixelText text="HULL" x={HUD.x} y={H.labelY} size={FONT_NATIVE} tint={DIM} />
      {Array.from({ length: hud.hull.segments }, (_, k) => {
        const lit = k < hud.hull.lit;
        return <Box key={k} x={hullSegX(k)} y={H.barY} w={H.segW} h={H.segH} attrs={{ 'data-ui-hud-seg': lit ? 'lit' : 'off', 'data-ui-hud-tone': hud.hull.tone }}
          style={lit ? { background: hex(tone), border: `1px solid ${hex(tone)}` } : { background: hex(BAR_OFF, 0.6), border: OUTLINE }} />;
      })}
      <PixelText text="SHIELDS" x={HUD.x} y={SH.y - 2} size={FONT_NATIVE} tint={DIM} />
      {Array.from({ length: hud.shields.layers }, (_, k) => {
        const up = k < hud.shields.up;
        return <Box key={k} x={pipX + k * (SH.pip + SH.gap)} y={SH.y} w={SH.pip} h={SH.pip} attrs={{ 'data-ui-hud-shield': up ? 'up' : 'down' }}
          style={{ background: up ? hex(BLUE) : 'transparent', border: `1px solid ${hex(up ? BLUE : CELL_EDGE)}` }} />;
      })}
      {hud.systems.map((s, n) => <SystemColumn key={s.key} s={s} n={n} />)}
    </>
  );
});
