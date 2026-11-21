// The targeting line (FTL targeting spec §1): while a weapon is picked up at Weapons, a line from its card to the pointer,
// ending in a reticle, over the whole stage and never taking the pointer (a room click reaches the contact window under
// it). CRT amber ramp only: the reticle and the line are CRT.hot over a room of the enemy drawing (a valid drop), CRT.mid
// elsewhere, each on a CRT.glass underlay. A right-click anywhere drops the pick-up without a change. Until the pointer
// moves over the stage the line ends at the app's last pointer position, else at the enemy drawing's centre.
import { memo, useEffect, useState } from 'react';
import type { ContactView } from '../../render/duel/contactModel';
import { CRT } from '../../render/tactical/crtTheme';
import { pointInPolygon } from '../../render/tactical/hullModel';
import { useActions, useUi } from '../context';
import { hex } from '../stage/color';
import { boxCss } from '../stage/geometry';
import { useConsoleLayout } from '../stage/useStage';

/** The reticle: a ring 20 internal px across with four ticks across it. */
export const RETICLE_R = 10;
const TICK = 3;
const ticks = (x: number, y: number): string => {
  const a = RETICLE_R - TICK, b = RETICLE_R + TICK;
  return `M${x} ${y - b}L${x} ${y - a}M${x} ${y + a}L${x} ${y + b}M${x - b} ${y}L${x - a} ${y}M${x + a} ${y}L${x + b} ${y}`;
};

/** The line's and the reticle's ramp colour: hot over a room of the drawing, mid elsewhere. */
export function targetingTint(contact: Pick<ContactView, 'rooms'>, p: { x: number; y: number }): number {
  return contact.rooms.some((r) => pointInPolygon(p.x, p.y, r.points)) ? CRT.hot : CRT.mid;
}

/** Where the line ends before the pointer moves over the stage: the app's last pointer position (`seed`), else the
 *  centre of the enemy window's ship drawing. */
export function targetingEnd(contact: Pick<ContactView, 'box'>, seed: { x: number; y: number } | null): { x: number; y: number } {
  return seed ?? { x: contact.box.x + contact.box.w / 2, y: contact.box.y + contact.box.h / 2 };
}

export const TargetingLine = memo(function TargetingLine({ contact, seed = null, from }: { contact: ContactView; seed?: { x: number; y: number } | null; from?: { x: number; y: number } }) {
  const actions = useActions(), l = useUi((s) => s.layout), weapon = contact.aimWeapon, lay = useConsoleLayout();
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!weapon) return;
    const stageTop = Math.round(l.stripHeight * l.dpr) / l.dpr;
    const move = (e: PointerEvent): void => setPointer({ x: (e.clientX - l.offsetX) / l.scale, y: (e.clientY - stageTop - l.offsetY) / l.scale });
    const down = (e: PointerEvent): void => { if (e.button === 2) actions.contact.cancelAim(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', down); };
  }, [weapon, l, actions]);
  if (!weapon) return null;
  const end = pointer ?? targetingEnd(contact, seed);
  const start = from ?? lay.weaponCard(weapon).anchor, tint = hex(targetingTint(contact, end)), glass = hex(CRT.glass);   // Valkyrn spec §5: from the picked Flight card
  return (
    <svg data-ui-targeting={weapon} viewBox={`0 0 ${lay.stage.w} ${lay.stage.h}`} preserveAspectRatio="none"
      style={{ position: 'absolute', ...boxCss(0, 0, lay.stage.w, lay.stage.h, l), pointerEvents: 'none', overflow: 'visible' }}>
      <line data-ui-targeting-line="" x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={glass} strokeWidth={3} />
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={tint} strokeWidth={1} strokeDasharray="6 4" />
      <g data-ui-contact-reticle="">
        <circle cx={end.x} cy={end.y} r={RETICLE_R} stroke={glass} strokeWidth={3} fill="none" />
        <path d={ticks(end.x, end.y)} stroke={glass} strokeWidth={3} fill="none" />
        <circle cx={end.x} cy={end.y} r={RETICLE_R} stroke={tint} strokeWidth={1} fill="none" />
        <path d={ticks(end.x, end.y)} stroke={tint} strokeWidth={1} fill="none" />
      </g>
    </svg>
  );
});
