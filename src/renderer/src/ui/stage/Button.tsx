// The console button (spec 2026-11-17-artemis-consoles §3): an outlined box with a FONT_NATIVE label and key hint, in
// the CRT ramp or the theme. It never takes focus (no tabIndex), so Space and Enter stay the duel's; only buttons take
// pointer events on the stage. A press acts on a primary pointerdown; a hold is held until pointerup, pointercancel,
// lost capture, disable or unmount, and released exactly once.
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, PANEL_FILL, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useUi } from '../context';
import { hex } from './color';
import { useCrt } from './CrtContext';
import { boxCss } from './geometry';
import { PixelText } from './PixelText';

export type ButtonLook = 'idle' | 'hover' | 'lit' | 'disabled';
export function buttonColours(look: ButtonLook, crt: boolean): { outline: number; fill: number | null; text: number } {
  if (crt) {
    if (look === 'lit') return { outline: CRT.main, fill: CRT.main, text: CRT.glass };
    if (look === 'hover') return { outline: CRT.main, fill: CRT.glass, text: CRT.hot };
    if (look === 'disabled') return { outline: CRT.faint, fill: CRT.glass, text: CRT.faint };
    return { outline: CRT.mid, fill: CRT.glass, text: CRT.main };
  }
  if (look === 'lit') return { outline: AMBER, fill: AMBER, text: PANEL_FILL };
  if (look === 'hover') return { outline: AMBER, fill: PANEL_FILL, text: AMBER };
  if (look === 'disabled') return { outline: BAR_OFF, fill: PANEL_FILL, text: DIM };
  return { outline: DIM, fill: PANEL_FILL, text: TEXT };
}

/** `flash` (Feel-ii §2.8): the control was refused; its outline shows hot and thick for the flash. `dim` draws it as the
 *  disabled look while it still takes presses (a refused press flashes rather than doing nothing). */
export interface ButtonProps { name: string; x: number; y: number; w: number; h: number; label: string; hint?: string; lit?: boolean; disabled?: boolean; dim?: boolean; flash?: boolean; onPress?(): void; onHold?(on: boolean): void }
const PAD_X = 6;

export const Button = memo(function Button(p: ButtonProps) {
  const l = useUi((s) => s.layout), { crt } = useCrt(), [hover, setHover] = useState(false);
  const holding = useRef(false), onHold = useRef(p.onHold);
  onHold.current = p.onHold;
  const release = (): void => { if (holding.current) { holding.current = false; onHold.current?.(false); } };
  useEffect(() => release, []);
  useEffect(() => { if (p.disabled) release(); }, [p.disabled]);
  const look: ButtonLook = p.disabled || (p.dim && !p.lit && !hover) ? 'disabled' : p.lit ? 'lit' : hover ? 'hover' : 'idle', c = buttonColours(look, crt);
  const hair = Math.max(1, Math.round(l.scale * l.dpr)) / l.dpr;
  const stop = (e: SyntheticEvent): void => e.preventDefault();
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.button !== 0 || p.disabled) return;
    if (p.onHold) {
      if (holding.current) return;
      holding.current = true;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* no capture in this environment */ }
      p.onHold(true);
    } else p.onPress?.();
  };
  const ty = p.y + Math.round((p.h - FONT_NATIVE) / 2);
  return (
    <>
      <div data-testid={`console-${p.name}`} role="button" aria-disabled={p.disabled || undefined} data-ui-button={look} {...(p.flash ? { 'data-ui-refused': '1' } : {})}
        onPointerDown={down} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
        onMouseDown={stop} onContextMenu={stop} onAuxClick={stop}
        style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(p.x, p.y, p.w, p.h, l), pointerEvents: 'auto', cursor: p.disabled ? 'default' : 'pointer',
          border: p.flash ? `2px solid ${hex(crt ? CRT.hot : AMBER)}` : `${hair}px solid ${hex(c.outline)}`, background: c.fill === null ? 'transparent' : hex(c.fill) }} />
      {p.hint
        ? <><PixelText text={p.label} x={p.x + PAD_X} y={ty} size={FONT_NATIVE} tint={c.text} />
            <PixelText text={p.hint} x={p.x + p.w - PAD_X} y={ty} size={FONT_NATIVE} tint={look === 'lit' ? c.text : crt ? CRT.mid : DIM} anchorX={1} /></>
        : <PixelText text={p.label} x={p.x + p.w / 2} y={ty} size={FONT_NATIVE} tint={c.text} anchorX={0.5} />}
    </>
  );
});
