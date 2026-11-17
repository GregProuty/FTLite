// The sector map's pure geometry (spec Ship-and-map section 5, Demo-x-c section 3), shared by the Pixi panel and the React one.
/** The map panel's size: the right column's window slot, 400 x 340. */
export const MAP_W = 400, MAP_H = 340;
export const MAP_FLEET = 0xd83a3a, NODE_R = 11;
/** At most this many marks ($, !, ? and EXIT) are drawn. */
export const MAP_MARKS = 24;
/** Node centres: six columns across, up to four beacons stacked under the title. */
export const nodeX = (c: number): number => 36 + 65 * c;
export const nodeY = (k: number, n: number): number => 184 + (k - (n - 1) / 2) * 64;
/** Three small irregular rocks (original glyph, spec Demo-viii section 1), offsets from the node centre. */
export const ROCKS: readonly (readonly number[])[] = [
  [-4.5, -1.5, -2.5, -3.5, -0.5, -2, -1, 0.5, -3.5, 1],
  [1, -4, 3, -4.5, 4.5, -2.5, 3.5, -0.5, 1.5, -1.5],
  [-0.5, 1.5, 2, 0.5, 4, 2.5, 2.5, 4.5, 0, 4],
];
