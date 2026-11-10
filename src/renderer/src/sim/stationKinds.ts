/** The seven consoles. The numeric order is the Engineering list order (spec §3). */
export const StationKind = { Navigation: 0, Weapons: 1, Science: 2, Engineering: 3, LifeSupport: 4, Medbay: 5, Doors: 6 } as const;
/** Ship-data ids, indexed by kind. */
export const STATION_IDS = ['navigation', 'weapons', 'science', 'engineering', 'lifeSupport', 'medbay', 'doors'] as const;
export const STATION_COUNT = STATION_IDS.length;
export const STATION_NAMES = ['Navigation', 'Weapons', 'Science', 'Engineering', 'Life Support', 'Medbay', 'Doors'] as const;
export function kindOfStationId(id: string): number { return (STATION_IDS as readonly string[]).indexOf(id); }
