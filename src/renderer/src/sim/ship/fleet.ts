/** Which ship flies (spec Demo-x-a section 3): the Skiff for one or two players, the cutter for three or four. App policy; the starter stays for tests and gates. */
export type ShipId = 'skiff' | 'cutter' | 'hound';
export function shipForCrew(players: number): ShipId { return players <= 2 ? 'skiff' : 'cutter'; }
const LINES: Record<ShipId, string> = { skiff: 'Ship: Skiff (2 crew)', cutter: 'Ship: Cutter (4 crew)', hound: 'Ship: Hound (4 crew)' };
/** The lobby line under the title, for the players joined so far (none joined reads as one). */
export function shipLine(players: number): string { return LINES[shipForCrew(Math.max(1, players))]; }
