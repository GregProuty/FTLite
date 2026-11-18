import cutter from './cutter.json';
import hound from './hound.json';
import skiff from './skiff.json';
import valkyrn from './valkyrn.json';

/** Which ship flies (spec Art-iv-b): the Hound at every crew size. App policy; the Skiff, Cutter and starter stay as
 *  layouts for tests, gates and fixed-layout scenarios. */
export type ShipId = 'skiff' | 'cutter' | 'hound';
export function shipForCrew(_players: number): ShipId { return 'hound'; }
const LINES: Record<ShipId, string> = { skiff: 'Ship: Skiff (2 crew)', cutter: 'Ship: Cutter (4 crew)', hound: 'Ship: Hound (4 crew)' };
/** The lobby line under the title, for the players joined so far (none joined reads as one). */
export function shipLine(players: number): string { return LINES[shipForCrew(Math.max(1, players))]; }
/** The fleet's raw layouts, read field by field (Valkyrn spec §3.2: no id compares outside this file). */
const FLEET: Readonly<Record<ShipId, { id: string; magazine?: readonly number[] }>> = { skiff, cutter, hound };
/** Whether a fleet ship's torpedo tube loads itself: its layout has no magazine tile (the lobby card's helm line). */
export function tubeLoadsItself(id: ShipId): boolean { return FLEET[id].magazine === undefined; }

/** Valkyrn spec §9: the Single player ship choice, in picker order. `laserFit` is the developer switch's class (§8), null
 *  for a ship with none. Multiplayer stays on shipForCrew. */
export const SOLO_SHIPS = [
  { id: 'hound', name: 'Hound', line: 'crew of two, Tab between them', layout: hound, laserFit: null },
  { id: 'valkyrn', name: 'Valkyrn', line: 'solo fighter: mouse to fly, gun and torpedoes', layout: valkyrn, laserFit: 'valkyrnLaser' }
] as const;
export type SoloShipId = (typeof SOLO_SHIPS)[number]['id'];
export const DEFAULT_SOLO_SHIP: SoloShipId = SOLO_SHIPS[0].id;
export function isSoloShipId(v: unknown): v is SoloShipId { return SOLO_SHIPS.some((s) => s.id === v); }
/** The solo ship `id` (the first when unknown). */
export function soloShip(id: string): (typeof SOLO_SHIPS)[number] { return SOLO_SHIPS.find((s) => s.id === id) ?? SOLO_SHIPS[0]; }

/** The console-map silhouettes a layout's `hull` field may name (Valkyrn spec §3.1, §4.5); render/tactical/hullModel.ts
 *  draws one per id. Kept here, a file allowed ship id literals (spec §3.2), so the schema carries none. */
export const HULL_IDS = ['hound', 'scout', 'valkyrn'] as const;
