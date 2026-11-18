// Valkyrn spec §5, §8: the Flight seat's weapon block, beside the Helm block. GUN: its state (READY, OVERHEAT blinking, OFFLINE)
// and heat bar, fired by the left mouse. TORPEDO: the magazine, its range state or FLYING, its target room; the right mouse
// launches it. With the laser fit, LASER (its charge, target room) takes GUN's place, with the frequency row. A click on a
// card picks the weapon up (the contact window opens and a targeting line runs to the pointer); a right-click clears its
// target. 2 (and 1 with the laser fit) pick them up from the keyboard. Drawn in the CRT ramp on the console.
import { memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import type { FlightPanel } from '../../render/duel/consoleModel';
import { FLIGHT, flightCard } from '../../render/duel/consoleLayout';
import { FREQ_NAMES } from '../../render/duel/scienceModel';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useActions } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { targetText } from './WeaponsStation';

type Weapon = 'laser' | 'torpedo';
/** The GUN card's OVERHEAT blink (Hz, on the CRT clock), as the map's heat word. */
export const OVERHEAT_CARD_HZ = 4;
const stop = (e: SyntheticEvent): void => e.preventDefault();

export const FlightStation = memo(function FlightStation({ flight, aim = null }: { flight: FlightPanel; aim?: Weapon | null }) {
  const actions = useActions(), { crt, now } = useCrt();
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER;
  const w = flight.weapons, gun = flight.gun, A = flightCard(0), T = flightCard(1), ax = A.x + 6, tx = T.x + 6, x0 = FLIGHT.x + 8;
  const blinkOn = Math.floor(now * 2 * OVERHEAT_CARD_HZ) % 2 === 0, refused = w.refused ?? null;
  const card = (slot: 0 | 1, weapon: Weapon | null, lit: boolean) => {
    const c = flightCard(slot);
    const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
      e.preventDefault();
      if (!weapon) return;
      if (e.button === 2) { if (weapon === 'torpedo') actions.console.torpLock(-1); else actions.console.lock(-1); return; }
      if (e.button === 0) actions.contact.pickUp(weapon);
    };
    return (
      <>
        <Box x={c.x} y={c.y} w={c.w} h={c.h} attrs={{ 'data-ui-flight-card': weapon ?? 'gun' }} style={{ border: `1px solid ${hex(lit ? hot : dim)}`, pointerEvents: 'none' }} />
        {weapon && <div data-testid={`flight-card-${weapon}`} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
          <Box x={c.x} y={c.y} w={c.w} h={c.hitH} style={{ pointerEvents: 'auto', cursor: 'pointer', background: lit ? hex(crt ? CRT.glass : BAR_OFF) : 'transparent' }} />
        </div>}
      </>
    );
  };
  const reason = refused !== null ? `${refused.control === 'launch' ? 'TORPEDO' : gun ? 'GUN' : 'LASER'}: ${refused.reason}`
    : !gun && w.laserReason && w.laserReason !== 'FIRING' ? `LASER: ${w.laserReason}` : null;
  return (
    <>
      <Panel x={FLIGHT.x} y={FLIGHT.y} w={FLIGHT.w} h={FLIGHT.h} />
      {gun ? (
        <>
          {card(0, null, false)}
          <PixelText text="GUN" x={ax} y={A.y + 6} size={FONT_NATIVE} tint={dim} />
          <PixelText text="L-CLICK" x={A.x + A.w - 6} y={A.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
          {(gun.state !== 'OVERHEAT' || blinkOn) && <PixelText text={gun.state} x={ax} y={A.y + 20} size={FONT_SIZE} tint={gun.state === 'READY' ? main : hot} />}
          <PixelText text="HEAT" x={ax} y={A.y + 44} size={FONT_NATIVE} tint={dim} />
          <Bar x={ax + 36} y={A.y + 47} w={A.w - 48} h={6} fill={gun.heat} colour={gun.locked ? hot : main} />
        </>
      ) : (
        <>
          {card(0, 'laser', aim === 'laser')}
          <PixelText text="LASER" x={ax} y={A.y + 6} size={FONT_NATIVE} tint={aim === 'laser' ? hot : dim} />
          <PixelText text="1" x={A.x + A.w - 6} y={A.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
          <PixelText text={w.laserReason === 'FIRING' ? 'FIRING' : w.charge.value} x={ax} y={A.y + 20} size={FONT_SIZE} tint={w.laserReason === 'FIRING' ? hot : main} />
          <Bar x={ax} y={A.y + 44} w={A.w - 12} h={6} fill={w.charge.bar?.fill ?? 0} colour={main} />
          <PixelText text={targetText(w.laserTarget)} x={ax} y={A.y + 56} size={FONT_NATIVE} tint={w.laserTarget >= 0 ? hot : dim} />
        </>
      )}
      {card(1, 'torpedo', aim === 'torpedo')}
      <PixelText text="TORPEDO" x={tx} y={T.y + 6} size={FONT_NATIVE} tint={aim === 'torpedo' ? hot : dim} />
      <PixelText text="2" x={T.x + T.w - 6} y={T.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={`MAG ${w.magazine}`} x={tx} y={T.y + 20} size={FONT_SIZE} tint={main} />
      {w.missileFlying
        ? <PixelText text="FLYING" x={tx} y={T.y + 42} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={w.torpedoInRange ? 'IN RANGE' : 'OUT OF RANGE'} x={tx} y={T.y + 42} size={FONT_NATIVE} tint={w.torpedoInRange ? main : dim} />}
      <PixelText text={targetText(w.torpTarget)} x={tx} y={T.y + 56} size={FONT_NATIVE} tint={w.torpTarget >= 0 ? hot : dim} />
      <PixelText text="R-CLICK: LAUNCH" x={tx} y={T.y + 84} size={FONT_NATIVE} tint={dim} />
      {reason !== null
        ? <PixelText text={reason} x={x0} y={FLIGHT.y + 118} size={FONT_NATIVE} tint={hot} />
        : <PixelText text="Q/E TORPEDO ROOM   T ENEMY" x={x0} y={FLIGHT.y + 118} size={FONT_NATIVE} tint={dim} />}
      {!gun && (
        <>
          <PixelText text="FREQ" x={x0} y={FLIGHT.y + 140} size={FONT_NATIVE} tint={main} />
          {FREQ_NAMES.map((label, f) => <Button key={f} name={`flight-freq-${f}`} label={label} x={x0 + 52 + f * 56} y={FLIGHT.y + 136} w={52} h={24}
            lit={w.freq === f} onPress={() => actions.console.frequency(f)} />)}
        </>
      )}
    </>
  );
});
