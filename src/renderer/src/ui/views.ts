// What the duel and flight regions render (React UI spec §2): plain data built by the scene and the flight mode each frame.
import type { EndView } from '../render/duel/endModel';
import type { ReadoutRow } from '../render/duel/readoutModel';
import type { OverlayDraw } from '../render/tactical/tacticalModel';

/** The three banner lines; null hides one (spec §6 placements). */
export interface Banners { interior: string | null; tactical: string | null; notice: string | null }
export type MapOverlayView = Pick<OverlayDraw, 'zoomText' | 'scaleBar' | 'snapHint'>;
export interface DuelUiView { readout: { rows: readonly ReadoutRow[]; help: readonly string[] }; end: EndView | null; banners: Banners; overlay: MapOverlayView | null }
export interface FlightUiView { feel: readonly (readonly [string, string])[]; banners: Banners; overlay: MapOverlayView | null }

export function mapOverlayOf(o: OverlayDraw): MapOverlayView { return { zoomText: o.zoomText, scaleBar: o.scaleBar, snapHint: o.snapHint }; }
