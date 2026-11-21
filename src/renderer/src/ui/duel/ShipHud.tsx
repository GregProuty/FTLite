// The ship HUD on the ship view (duel polish i spec §E; Engineering spike §6), in the consoles' amber CRT ramp (Decision 8:
// its own CRT context and glow, over the non-CRT interior). Top left: the segmented hull bar and the shield layers
// (raised, powered or beyond the bars' cap). Bottom left, on a glass backing: one power column per system (slots on,
// empty or lost and crossed, the overdrive slot dashed), its heat bar and two coolant pips, and the reactor's bars. A left
// click on a column adds a bar, a right click removes one, a click on the pips cycles the coolant (actions.ship).
// UI round §2.4a: a power column's name shows its room (FIRE blinking inverse, OFFLINE inverse, damaged hot, a 2 px repair or
// extinguish bar under it), and a HEALTH bar under the shields shows when the active player is hurt (DOWNED when downed).
import { memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import { coolantY, HEALTH_ROW, heatY, HUD, hullSegX, overdriveSlot, powerBarY, powerColumnX, powerNameY, powerPanel, slotState, type HullTone, type PowerColumn, type ShipHudView } from '../../render/duel/shipHudModel';
import { ALERT_BLINK_HZ, blink, CRT } from '../../render/tactical/crtTheme';
import { FONT_SIZE, textPx } from '../../render/theme';
import { useActions, useUi } from '../context';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { CrtGlow, CrtProvider, useCrt } from '../stage/CrtContext';
import { boxCss } from '../stage/geometry';
import { PixelText } from '../stage/PixelText';
import { useStage } from '../stage/useStage';

const TONE: Record<HullTone, number> = { good: CRT.main, warn: CRT.mid, alert: CRT.hot };
const P = HUD.power;

/** A click target (spec §6): the left button and the right button, never focus, never the browser menu. */
function Hit(p: { name: string; x: number; y: number; w: number; h: number; onLeft(): void; onRight?(): void }) {
  const l = useUi((s) => s.layout);
  const stop = (e: SyntheticEvent): void => e.preventDefault();
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 0) p.onLeft(); else if (e.button === 2) p.onRight?.(); };
  return <div data-testid={p.name} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}
    style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(p.x, p.y, p.w, p.h, l), pointerEvents: 'auto', cursor: 'pointer' }} />;
}

function PowerCol({ c, n, now }: { c: PowerColumn; n: number; now: number }) {
  const actions = useActions(), sh = useStage().h, x = powerColumnX(n), bx = x + (P.colW - P.barW) / 2;
  const hot = c.failed ? (blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.dim) : c.overdriven || c.heat > 0.75 * c.heatMax ? CRT.hot : CRT.main;   // spec §6: hot near HEAT_MAX
  const top = powerBarY(c.slots - 1, sh), room = c.room, inverse = room?.state === 'fire' || room?.state === 'offline';
  const nameTint = inverse ? CRT.glass : room?.state === 'damaged' ? CRT.hot : c.failed ? hot : CRT.mid, nameW = textPx(c.name, 2), nameY = powerNameY(sh);
  return (
    <>
      {Array.from({ length: c.slots }, (_, k) => {
        const s = slotState(c, k), od = overdriveSlot(c, k);
        return (
          <Box key={k} x={bx} y={powerBarY(k, sh)} w={P.barW} h={P.barH} attrs={{ 'data-ui-hud-slot': s, 'data-ui-hud-sys': String(c.system), ...(od ? { 'data-ui-hud-od': '' } : {}) }}
            style={{ background: s === 'on' ? hex(od ? CRT.hot : CRT.main) : hex(CRT.glass), border: `1px ${od ? 'dashed' : 'solid'} ${hex(s === 'lost' ? CRT.faint : od ? CRT.hot : CRT.dim)}` }}>
            {s === 'lost' && <svg width="100%" height="100%" viewBox={`0 0 ${P.barW} ${P.barH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <path d={`M0 0L${P.barW} ${P.barH}M${P.barW} 0L0 ${P.barH}`} stroke={hex(CRT.dim)} strokeWidth={1} /></svg>}
          </Box>
        );
      })}
      {c.cools && (
        <Box x={bx} y={heatY(sh)} w={P.barW} h={P.heatH} attrs={{ 'data-ui-hud-heat': String(c.heat), 'data-ui-hud-hot': c.failed ? 'failed' : c.overdriven ? 'overdriven' : 'idle' }} style={{ background: hex(CRT.faint) }}>
          <div style={{ width: `${Math.round((100 * Math.max(0, Math.min(c.heat, c.heatMax))) / c.heatMax)}%`, height: '100%', background: hex(hot) }} />
        </Box>
      )}
      {c.cools && Array.from({ length: 2 }, (_, k) => (
        <Box key={`pip${k}`} x={bx + k * (P.pipW + P.pipGap)} y={coolantY(sh)} w={P.pipW} h={P.pipH} attrs={{ 'data-ui-hud-pip': `${c.system}:${k}:${k < c.coolant ? 'on' : 'off'}` }}
          style={{ background: k < c.coolant ? hex(CRT.main) : 'transparent', border: `1px solid ${hex(CRT.mid)}` }} />
      ))}
      <Hit name={`hud-power-${c.system}`} x={x} y={top} w={P.colW} h={heatY(sh) + P.heatH - top} onLeft={() => actions.ship.power(c.system, 1)} onRight={() => actions.ship.power(c.system, -1)} />
      {c.cools && <Hit name={`hud-coolant-${c.system}`} x={bx} y={coolantY(sh)} w={2 * P.pipW + P.pipGap} h={P.pipH} onLeft={() => actions.ship.coolant(c.system)} />}
      {inverse && <Box x={x + (P.colW - nameW) / 2} y={nameY} w={nameW} h={26} attrs={{ 'data-ui-hud-room': room!.state }}
        style={{ background: hex(room!.state === 'fire' ? (blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.main) : CRT.main) }} />}
      {room && !inverse && <Box x={x} y={nameY} w={1} h={1} attrs={{ 'data-ui-hud-room': room.state }} />}
      <PixelText text={c.name} x={x + P.colW / 2} y={nameY} size={FONT_SIZE} tint={nameTint} anchorX={0.5} />
      {room && room.progress > 0 && <Box x={x + 4} y={nameY - 3} w={(P.colW - 8) * room.progress} h={2} style={{ background: hex(CRT.hot) }} />}
    </>
  );
}

function Reactor({ hud }: { hud: ShipHudView }) {
  const sh = useStage().h, n = hud.power.systems.length, x = powerColumnX(n), bx = x + (P.colW - P.barW) / 2;
  return (
    <>
      {Array.from({ length: hud.power.reactor }, (_, k) => {
        const spare = k < hud.power.spare;
        return <Box key={k} x={bx} y={powerBarY(k, sh)} w={P.barW} h={P.barH} attrs={{ 'data-ui-hud-reactor': spare ? 'spare' : 'used' }}
          style={{ background: spare ? hex(CRT.main) : hex(CRT.glass), border: `1px solid ${hex(spare ? CRT.main : CRT.faint)}` }} />;
      })}
      <PixelText text="PWR" x={x + P.colW / 2} y={powerNameY(sh)} size={FONT_SIZE} tint={CRT.mid} anchorX={0.5} />
    </>
  );
}

function HudBody({ hud }: { hud: ShipHudView }) {
  const { now } = useCrt(), H = HUD.hull, SH = HUD.shields, panel = powerPanel(useStage().h);   // UI round 2b: on the stage's bottom edge
  const tone = hud.hull.tone === 'alert' && blink(now, ALERT_BLINK_HZ) === 0 ? CRT.dim : TONE[hud.hull.tone], pipX = HUD.x + textPx('SHIELDS', 2) + 8;
  return (
    <>
      <PixelText text="HULL" x={HUD.x} y={H.labelY} size={FONT_SIZE} tint={CRT.mid} />
      {Array.from({ length: hud.hull.segments }, (_, k) => {
        const lit = k < hud.hull.lit;
        return <Box key={k} x={hullSegX(k)} y={H.barY} w={H.segW} h={H.segH} attrs={{ 'data-ui-hud-seg': lit ? 'lit' : 'off', 'data-ui-hud-tone': hud.hull.tone }}
          style={lit ? { background: hex(tone), border: `1px solid ${hex(tone)}` } : { background: hex(CRT.glass, 0.8), border: `1px solid ${hex(CRT.faint)}` }} />;
      })}
      <PixelText text="SHIELDS" x={HUD.x} y={SH.y - 2} size={FONT_SIZE} tint={CRT.mid} />
      {Array.from({ length: hud.shields.layers }, (_, k) => {
        const state = k < hud.shields.up ? 'up' : k < hud.shields.cap ? 'down' : 'unpowered';
        return <Box key={k} x={pipX + k * (SH.pip + SH.gap)} y={SH.y} w={SH.pip} h={SH.pip} attrs={{ 'data-ui-hud-shield': state }}
          style={{ background: state === 'up' ? hex(CRT.main) : 'transparent', border: `1px ${state === 'unpowered' ? 'dashed' : 'solid'} ${hex(state === 'unpowered' ? CRT.faint : CRT.mid)}` }} />;
      })}
      {hud.health && (hud.health.downed
        ? <PixelText text="DOWNED" x={HUD.x} y={HEALTH_ROW.y} size={FONT_SIZE} tint={blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.dim} />
        : <>
          <PixelText text="HEALTH" x={HUD.x} y={HEALTH_ROW.y - 2} size={FONT_SIZE} tint={CRT.mid} />
          <Box x={HEALTH_ROW.barX} y={HEALTH_ROW.barY} w={HEALTH_ROW.barW} h={HEALTH_ROW.barH} attrs={{ 'data-ui-hud-health': String(Math.round(hud.health.fill * 100)) }} style={{ background: hex(CRT.faint) }}>
            <div style={{ width: `${Math.round(100 * hud.health.fill)}%`, height: '100%', background: hex(hud.health.fill < 0.3 ? CRT.hot : CRT.main) }} />
          </Box></>)}
      {hud.health?.downed && <Box x={HUD.x} y={HEALTH_ROW.y} w={1} h={1} attrs={{ 'data-ui-hud-health': 'downed' }} />}
      <Box x={panel.x} y={panel.y} w={panel.w} h={panel.h} attrs={{ 'data-ui-hud-crt': '' }} style={{ background: hex(CRT.glass, 0.85), border: `1px solid ${hex(CRT.dim)}` }} />
      <PixelText text={`REACTOR ${hud.power.spare}/${hud.power.reactor}   COOLANT ${hud.power.coolantFree}/${hud.power.coolantPool}`} x={panel.x + P.pad} y={panel.y - 28} size={FONT_SIZE} tint={CRT.main} />
      {hud.power.systems.map((c, n) => <PowerCol key={c.system} c={c} n={n} now={now} />)}
      <Reactor hud={hud} />
    </>
  );
}

export const ShipHud = memo(function ShipHud({ hud }: { hud: ShipHudView }) {
  return <CrtProvider crt><CrtGlow><HudBody hud={hud} /></CrtGlow></CrtProvider>;
});
