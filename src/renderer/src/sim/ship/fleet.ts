/** Which ship flies (spec Art-iv-b): the Hound at every crew size. App policy; the Skiff, Cutter and starter stay as
 *  layouts for tests, gates and fixed-layout scenarios. */
export type ShipId = 'skiff' | 'cutter' | 'hound';
export function shipForCrew(_players: number): ShipId { return 'hound'; }
const LINES: Record<ShipId, string> = { skiff: 'Ship: Skiff (2 crew)', cutter: 'Ship: Cutter (4 crew)', hound: 'Ship: Hound (4 crew)' };
/** The lobby line under the title, for the players joined so far (none joined reads as one). */
export function shipLine(players: number): string { return LINES[shipForCrew(Math.max(1, players))]; }

/** The console-map silhouettes a layout's `hull` field may name (Valkyrn spec §3.1, §4.5); render/tactical/hullModel.ts
 *  draws one per id. Kept here, a file allowed ship id literals (spec §3.2), so the schema carries none. */
export const HULL_IDS = ['hound', 'scout', 'valkyrn'] as const;
