// What the duel and flight regions render (React UI spec §2): plain data built by the scene and the flight mode each frame.
import type { EndView } from '../render/duel/endModel';
import type { ConsoleView } from '../render/duel/consoleModel';
import type { ContactView } from '../render/duel/contactModel';
import type { OwnShipView } from '../render/duel/ownShipModel';
import type { ShipHudView } from '../render/duel/shipHudModel';
import type { OverlayDraw } from '../render/tactical/tacticalModel';

/** The three banner lines; null hides one (spec §6 placements). */
export interface Banners { interior: string | null; tactical: string | null; notice: string | null }
export type MapOverlayView = Pick<OverlayDraw, 'zoomText' | 'scaleBar' | 'snapHint'>;
/** `crt`: the frame is a console view, drawn as an amber CRT screen (CRT map spec section 1: crtActive(view)). */
export interface DuelUiView { end: EndView | null; banners: Banners; overlay: MapOverlayView | null; crt: boolean;
  /** The Artemis console (spec 2026-11-17-artemis-consoles §6.1); absent or null draws today's screen. */
  console?: ConsoleView | null;
  /** The contact window (enemy ship window spec §6.5): set while it is shown; absent or null draws no window. */
  contact?: ContactView | null;
  /** The own ship window (own ship window spec §4): set exactly when the scene's onMap is true; absent or null draws none. */
  ownShip?: OwnShipView | null;
  /** FTL targeting spec §1: the map pointer's last position in internal px (the app's pointer source), set only while a
   *  weapon is picked up, so the targeting line can draw before the mouse next moves; absent or null when unknown. */
  pointer?: { x: number; y: number } | null;
  /** The ship HUD (duel polish i spec §E): set on every view (UI round §2.4); absent or null draws none. */
  hud?: ShipHudView | null;
  /** Feel-i (console feel spec §1): the sit-down card over the map, its seat's goal and three keys; absent or null draws none. */
  sitCard?: import('../render/duel/sitModel').SitCardView | null }
export interface FlightUiView { feel: readonly (readonly [string, string])[]; banners: Banners; overlay: MapOverlayView | null; crt: boolean }

export function mapOverlayOf(o: OverlayDraw): MapOverlayView { return { zoomText: o.zoomText, scaleBar: o.scaleBar, snapHint: o.snapHint }; }
