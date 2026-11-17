// The Artemis-style console layout (spec 2026-11-17-artemis-consoles §2), internal 1280×720. Pure: shared by the
// components, the scene's map reserves and the tests.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_W } from './readoutModel';

export const EDGE = 12;
export const TABS = { x: 12, y: 8, w: 96, gap: 4, h: 26 } as const;
export const TABS_RIGHT = TABS.x + 3 * TABS.w + 2 * TABS.gap;
export const STATUS = { x: 12, y: 42, w: READOUT_W } as const;
export const STATION = { x: 12, w: 300, h: { helm: 200, weapons: 216 } } as const;
export function stationTop(s: 'helm' | 'weapons'): number { return INTERNAL_H - EDGE - STATION.h[s]; }
export const SIDE = { x: INTERNAL_W - EDGE - 132, y: 42, w: 132 } as const;
/** The map's off-screen arrows and the Weapons notice keep clear of the status table and the right column. */
export const CONSOLE_RESERVE = { left: STATUS.x + STATUS.w + EDGE, right: EDGE + SIDE.w + EDGE } as const;
