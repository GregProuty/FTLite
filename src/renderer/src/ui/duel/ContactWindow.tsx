// The contact window (enemy ship window spec §4, §5, §6.6): one map contact, here the enemy ship, at CONTACT below the
// top right. The ship drawing is an inline SVG in internal px inside the console's CRT glow; React draws only the
// view's resolved ramp colours and does no blinking of its own. At Weapons, LASER arms the aim: the drawing box hides
// the cursor and draws a reticle, the hovered room gets a hot stroke, and a room click picks it (the console lock).
// The Helm only looks. The window takes the pointer, so no click or wheel over it reaches the map.
// Sci-1 spec §7.2: the window shows a contact id at its scan level (the unknown contact and the derelict have no drawing), a SCAN button with its progress, and info lines under the drawing.
// FTL targeting spec §1: LASER and TORPEDO each pick their weapon up (the Weapons cards do too); a room click sets that
// weapon's target. Each target room carries its weapon's mark (the laser's corner brackets, the torpedo's diamond); the
// reticle at the pointer is TargetingLine's, drawn with the line from the card.
// W-4 amendment §3.6: at the Hound's Weapons seat a plain room click, with nothing picked up, sets the target room, and the
// laser's corner brackets mark it.
import { Fragment, memo, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { ContactView } from '../../render/duel/contactModel';
import { CONTACT } from '../../render/duel/consoleLayout';
import { FONT_NATIVE, textPx } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { pointInPolygon } from '../../render/tactical/hullModel';
import { useActions, useUi } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { boxCss } from '../stage/geometry';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { polyPoints, segPath } from './svgPaths';

/** The laser's target mark: four corner brackets; the torpedo's: a diamond. */
const LOCK_HALF = 9, LOCK_ARM = 4, DIAMOND = 6;
const brackets = (x: number, y: number): string => {
  const h = LOCK_HALF, a = LOCK_ARM;
  return `M${x - h} ${y - h + a}L${x - h} ${y - h}L${x - h + a} ${y - h}M${x + h - a} ${y - h}L${x + h} ${y - h}L${x + h} ${y - h + a}`
    + `M${x + h} ${y + h - a}L${x + h} ${y + h}L${x + h - a} ${y + h}M${x - h + a} ${y + h}L${x - h} ${y + h}L${x - h} ${y + h - a}`;
};
const diamond = (x: number, y: number): string => `M${x} ${y - DIAMOND}L${x + DIAMOND} ${y}L${x} ${y + DIAMOND}L${x - DIAMOND} ${y}Z`;
const stop = (e: SyntheticEvent): void => e.preventDefault();
const swallow = (e: ReactWheelEvent): void => e.stopPropagation();

/** The info lines' row height (Sci-1 spec §7.2): text, then the line's bar under it. */
const LINE_H = 20;

export const ContactWindow = memo(function ContactWindow({ contact }: { contact: ContactView }) {
  const actions = useActions(), l = useUi((s) => s.layout);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const b = contact.box, x0 = CONTACT.x + 8, right = CONTACT.x + CONTACT.w - 8, top = CONTACT.y;
  const statusY = top + 34, laserY = top + 270, missileY = top + 306, barX = x0 + 104;
  const linesY = contact.weapons ? top + 336 : top + 270, drawn = contact.outline.length > 0;
  const aiming = contact.aim && contact.weapons !== null;
  /** A client position to internal px: the inverse of boxCss on the stage (which starts below the session strip). */
  const toInternal = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const stageTop = Math.round(l.stripHeight * l.dpr) / l.dpr;
    return { x: (e.clientX - l.offsetX) / l.scale, y: (e.clientY - stageTop - l.offsetY) / l.scale };
  };
  const roomAt = (p: { x: number; y: number }): number => contact.rooms.findIndex((r) => pointInPolygon(p.x, p.y, r.points));
  const hover = aiming && pointer ? roomAt(pointer) : -1;
  const lock = contact.lockRoom === null ? null : contact.rooms[contact.lockRoom]?.centre ?? null;
  const torp = contact.torpRoom === null ? null : contact.rooms[contact.torpRoom]?.centre ?? null;
  const laser = contact.weapons?.laser ?? null, scan = contact.scan;
  const rootDown = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 2) actions.contact.cancelAim(); };
  const boxDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    e.preventDefault();
    if (e.button === 2) { actions.contact.cancelAim(); return; }
    if (e.button !== 0) return;
    const room = roomAt(toInternal(e));
    if (room < 0) return;   // a click on no room does nothing; the aim stays armed
    if (aiming) actions.contact.pick(room);
    else if (contact.roomClick) actions.console.lock(room);   // W-4 amendment §3.6: a plain room click sets the target room
  };
  const boxStyle = { position: 'absolute' as const, ...boxCss(b.x, b.y, b.w, b.h, l), overflow: 'hidden' as const };
  return (
    <>
      <div data-ui-contact="" onPointerDown={rootDown} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop} onWheel={swallow}
        style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(CONTACT.x, CONTACT.y, CONTACT.w, CONTACT.h, l), pointerEvents: 'auto' }} />
      <Panel x={CONTACT.x} y={CONTACT.y} w={CONTACT.w} h={CONTACT.h} />
      <PixelText text={contact.title} x={x0} y={top + 8} size={FONT_NATIVE} tint={CRT.main} />
      {contact.contact !== null && <Button name="contact-close" label="X" x={right - 24} y={top + 6} w={24} h={20} onPress={() => actions.contact.close()} />}
      {scan && scan.enabled && <Button name="contact-scan" label={scan.label} x={right - 24 - 6 - 132} y={top + 6} w={132} h={20} onPress={() => actions.contact.scan()} />}
      {scan && !scan.enabled && <><Box testId="contact-scanned" x={right - 24 - 6 - 132} y={top + 6} w={132} h={20} style={{ pointerEvents: 'none' }} />
        <PixelText text={scan.label} x={right - 24 - 6 - 132} y={top + 10} size={FONT_NATIVE} tint={CRT.mid} /></>}
      {scan?.progress != null && <Bar x={x0} y={top + 28} w={right - x0} h={3} fill={scan.progress} colour={CRT.main} />}
      {contact.shields && (
        <>
          <PixelText text="SHLD" x={x0} y={statusY} size={FONT_NATIVE} tint={CRT.mid} />
          {Array.from({ length: contact.shields.of }, (_, k) => (
            <Box key={k} x={x0 + 40 + k * 12} y={statusY + 4} w={8} h={8} attrs={{ 'data-ui-contact-pip': k < contact.shields!.up ? 'up' : 'down' }}
              style={k < contact.shields!.up ? { background: hex(CRT.main) } : { border: `1px solid ${hex(CRT.mid)}` }} />
          ))}
        </>
      )}
      {contact.hull && (
        <>
          <PixelText text="HULL" x={x0 + 120} y={statusY} size={FONT_NATIVE} tint={CRT.mid} />
          <Bar x={x0 + 156} y={statusY + 6} w={80} h={6} fill={contact.hull.fill} colour={CRT.main} />
          <PixelText text={String(contact.hull.value)} x={right} y={statusY} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />
        </>
      )}
      {drawn && (
        <svg data-ui-contact-box="" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="none" shapeRendering="crispEdges"
          style={{ ...boxStyle, pointerEvents: 'auto', cursor: aiming ? 'none' : 'default' }}
          onPointerMove={(e) => setPointer(toInternal(e))} onPointerLeave={() => setPointer(null)} onPointerDown={boxDown}
          onContextMenu={stop} onMouseDown={stop} onAuxClick={stop} onWheel={swallow}>
          <polygon points={polyPoints(contact.outline)} fill={hex(CRT.glass)} stroke={hex(contact.unknown ? CRT.mid : CRT.main)} strokeWidth={1} strokeDasharray={contact.unknown ? '6 4' : undefined} />
          {contact.rooms.map((r, k) => (
            <g key={k} data-ui-contact-room={r.label}>
              <polygon points={polyPoints(r.points)} fill={r.fill === null ? 'none' : hex(r.fill)} stroke={hex(r.stroke)} strokeWidth={1} />
              {r.hatch && <path d={segPath(r.hatch.segments)} stroke={hex(r.hatch.colour)} strokeWidth={1} fill="none" />}
            </g>
          ))}
        </svg>
      )}
      {contact.rooms.map((r, k) => {
        const w = Math.ceil(textPx(r.label, 1)), h = FONT_NATIVE, pad = 2;
        return (
          <Box key={k} x={Math.round(r.centre.x - w / 2) - pad} y={Math.round(r.centre.y - h / 2) - pad} w={w + 2 * pad} h={h + 2 * pad}
            attrs={{ 'data-ui-contact-label-bg': r.label }} style={{ background: hex(CRT.glass) }} />
        );
      })}
      {contact.rooms.map((r, k) => (
        <PixelText key={k} text={r.label} x={r.centre.x} y={r.centre.y} size={FONT_NATIVE} tint={CRT.hot} anchorX={0.5} anchorY={0.5} />
      ))}
      {drawn && (
        <svg data-ui-contact-marks="" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="none" style={{ ...boxStyle, pointerEvents: 'none' }}>
          {contact.flash.map((f) => (   // duel polish i spec §B: the struck room flashes, the ramp's hot as the spec's white
            <polygon key={`f${f.room}`} data-ui-contact-flash={contact.rooms[f.room]?.label ?? ''} points={polyPoints(f.points)} fill={hex(CRT.hot)} fillOpacity={f.alpha} stroke="none" />
          ))}
          {hover >= 0 && (
            <g data-ui-contact-hover="">
              <polygon points={polyPoints(contact.rooms[hover]!.points)} fill="none" stroke={hex(CRT.glass)} strokeWidth={3} />
              <polygon points={polyPoints(contact.rooms[hover]!.points)} fill="none" stroke={hex(CRT.hot)} strokeWidth={1} />
            </g>
          )}
          {lock && (
            <g data-ui-contact-lock="">
              <path d={brackets(lock.x, lock.y)} stroke={hex(CRT.glass)} strokeWidth={3} fill="none" />
              <path d={brackets(lock.x, lock.y)} stroke={hex(CRT.hot)} strokeWidth={1} fill="none" />
            </g>
          )}
          {torp && (
            <g data-ui-contact-torp="">
              <path d={diamond(torp.x, torp.y + 14)} stroke={hex(CRT.glass)} strokeWidth={3} fill="none" />
              <path d={diamond(torp.x, torp.y + 14)} stroke={hex(CRT.hot)} strokeWidth={1} fill="none" />
            </g>
          )}
        </svg>
      )}
      {contact.weapons && laser && (
        <>
          <Button name="contact-laser" label="LASER" x={x0} y={laserY} w={96} h={24} lit={laser.lit} disabled={!laser.enabled} onPress={() => actions.contact.arm()} />
          <PixelText text={laser.note ?? laser.label} x={barX} y={laserY + 2} size={FONT_NATIVE} tint={CRT.mid} />
          {laser.note === null && <PixelText text={laser.value} x={right} y={laserY + 2} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />}
          <Bar x={barX} y={laserY + 20} w={right - barX} h={4} fill={laser.fill} colour={CRT.main} />
          <Button name="contact-torpedo" label="TORPEDO" x={x0} y={missileY - 4} w={96} h={24} lit={contact.weapons.missile.lit} onPress={() => actions.contact.pickUp('torpedo')} />
          <PixelText text={`MAG ${contact.weapons.missile.magazine}`} x={barX} y={missileY} size={FONT_NATIVE} tint={CRT.mid} />
        </>
      )}
      {contact.lines.map((ln, k) => (
        <Fragment key={k}>
          <PixelText text={ln.text} x={x0} y={linesY + k * LINE_H} size={FONT_NATIVE} tint={ln.tint} />
          {ln.bar !== null && <Bar x={x0} y={linesY + k * LINE_H + 14} w={right - x0} h={3} fill={ln.bar} colour={CRT.main} />}
        </Fragment>
      ))}
    </>
  );
});
