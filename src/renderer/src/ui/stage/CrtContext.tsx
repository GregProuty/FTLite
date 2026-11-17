// The CRT context (CRT map spec sections 1, 3, 4): whether the console overlays draw as an amber CRT screen, the strength
// of the screen effects (the store's `crt` setting) and a presentation time for the blinks and the flicker. With `crt`
// false every consumer renders exactly as before (the interior); the provider then hands out one constant value, so its
// clock never re-renders them.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { crtScale, type CrtScale } from '../../render/crt';
import { CRT } from '../../render/tactical/crtTheme';
import { useUi } from '../context';
import { useNow } from '../useNow';
import { hex } from './color';

export interface CrtValue { crt: boolean; scale: CrtScale; /** Seconds (wall clock), stepped every CRT_TICK_MS. */ now: number }
/** The blink and flicker clock's step: 8 per second covers the 2 Hz blinks' edges and a slow flicker. */
export const CRT_TICK_MS = 125;
export const CRT_OFF: CrtValue = { crt: false, scale: crtScale('off'), now: 0 };
export const CrtContext = createContext<CrtValue>(CRT_OFF);
export function useCrt(): CrtValue { return useContext(CrtContext); }

/** Provides the CRT value to its children; `crt` comes from the frame's view (DuelUiView.crt, FlightUiView.crt). */
export function CrtProvider(props: { crt: boolean; children: ReactNode }) {
  const setting = useUi((s) => s.crt), now = useNow(props.crt ? CRT_TICK_MS : 3_600_000);
  const value = useMemo(() => (props.crt ? { crt: true, scale: crtScale(setting), now: now / 1000 } : CRT_OFF), [props.crt, setting, now]);
  return <CrtContext.Provider value={value}>{props.children}</CrtContext.Provider>;
}

/** The text glow: one wrapper around the console overlay group with a drop-shadow filter scaled by the glow (spec section
 *  3; not text-shadow, PixelText is a canvas). Without CRT or glow there is no wrapper. */
export function CrtGlow(props: { children: ReactNode }) {
  const { crt, scale } = useCrt(), l = useUi((s) => s.layout);
  if (!crt || scale.glow <= 0) return <>{props.children}</>;
  const blur = Math.max(1, Math.round(3 * l.scale * scale.glow));
  return <div data-ui-crt-glow="" style={{ position: 'absolute', inset: 0, filter: `drop-shadow(0 0 ${blur}px ${hex(CRT.main, 0.6 * scale.glow)})` }}>{props.children}</div>;
}
