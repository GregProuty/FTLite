// The targeting line (FTL targeting spec §1): while a weapon is picked up at Weapons, a line from its card to the pointer,
// ending in a reticle, over the whole stage and never taking the pointer (a room click reaches the contact window under
// it). CRT amber ramp only: the reticle and the line are CRT.hot over a room of the enemy drawing (a valid drop), CRT.mid
// elsewhere, each on a CRT.glass underlay. A right-click anywhere drops the pick-up without a change.
import { memo, useEffect, useState } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { weaponCard } from '../../render/duel/consoleLayout';
import type { ContactView } from '../../render/duel/contactModel';
import { CRT } from '../../render/tactical/crtTheme';
import { pointInPolygon } from '../../render/tactical/hullModel';
import { useActions, useUi } from '../context';
import { hex } from '../stage/color';
import { boxCss } from '../stage/geometry';

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

export const TargetingLine = memo(function TargetingLine({ contact }: { contact: ContactView }) {
  const actions = useActions(), l = useUi((s) => s.layout), weapon = contact.aimWeapon;
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
  if (!weapon || !pointer) return null;
  const from = weaponCard(weapon).anchor, tint = hex(targetingTint(contact, pointer)), glass = hex(CRT.glass);
  return (
    <svg data-ui-targeting={weapon} viewBox={`0 0 ${INTERNAL_W} ${INTERNAL_H}`} preserveAspectRatio="none"
      style={{ position: 'absolute', ...boxCss(0, 0, INTERNAL_W, INTERNAL_H, l), pointerEvents: 'none', overflow: 'visible' }}>
      <line data-ui-targeting-line="" x1={from.x} y1={from.y} x2={pointer.x} y2={pointer.y} stroke={glass} strokeWidth={3} />
      <line x1={from.x} y1={from.y} x2={pointer.x} y2={pointer.y} stroke={tint} strokeWidth={1} strokeDasharray="6 4" />
      <g data-ui-contact-reticle="">
        <circle cx={pointer.x} cy={pointer.y} r={RETICLE_R} stroke={glass} strokeWidth={3} fill="none" />
        <path d={ticks(pointer.x, pointer.y)} stroke={glass} strokeWidth={3} fill="none" />
        <circle cx={pointer.x} cy={pointer.y} r={RETICLE_R} stroke={tint} strokeWidth={1} fill="none" />
        <path d={ticks(pointer.x, pointer.y)} stroke={tint} strokeWidth={1} fill="none" />
      </g>
    </svg>
  );
});
