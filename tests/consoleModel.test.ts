import { describe, it, expect } from 'vitest';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { consoleLook, consoleSide, deskPicture, consoles, DESK_FILL, DESK_OUTLINE, DESK_W, DESK_D, SCREEN_LIT, SCREEN_DIM, SCREEN_DOWN, WALL_GAP } from '../src/renderer/src/render/consoleModel';
import { TILE_PX } from '../src/shared/resolution';
import { cutterState, RECRUITS } from './helpers/sim';

const SKIFF = parseShip(skiff);
const skiffState = () => createSimState(SKIFF, 2, 1, RECRUITS);

/** Visible consoles (spec Demo-xii section 1). */
describe('the console drawing model', () => {
  it('a desk about 0.6 tile wide and 0.3 deep, dark with a dark outline', () => {
    expect(DESK_W).toBe(Math.round(0.6 * TILE_PX)); expect(DESK_D).toBe(Math.round(0.3 * TILE_PX));
    expect(DESK_FILL).toBe(0x2b3647); expect(DESK_OUTLINE).toBe(0x1b1b1b);
  });
  it('each state lights the screen: free amber, occupied a dim amber, failed or unpowered red', () => {
    expect(SCREEN_LIT).toBe(0xf5b942); expect(SCREEN_DOWN).toBe(0xff5b4a);
    expect(deskPicture('n', true, 'free').screenFill).toBe(SCREEN_LIT);
    expect(deskPicture('n', true, 'occupied').screenFill).toBe(SCREEN_DIM);
    expect(deskPicture('n', true, 'down').screenFill).toBe(SCREEN_DOWN);
    expect(SCREEN_DIM).not.toBe(SCREEN_LIT);
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    expect(lum(SCREEN_DIM)).toBeLessThan(lum(SCREEN_LIT)); expect(lum(SCREEN_DIM)).toBeGreaterThan(lum(DESK_FILL));
  });
  it('the desk sits against the wall side, flush with the thin wall band when the wall is next to the tile, the screen on its wall edge', () => {
    const n = deskPicture('n', true, 'free');
    expect(n.desk).toEqual({ x: (TILE_PX - DESK_W) / 2 | 0, y: -WALL_GAP, w: DESK_W, h: DESK_D });
    expect(n.screen.y).toBeLessThan(n.desk.y + n.desk.h / 2);   // the screen strip along the wall edge
    const s = deskPicture('s', true, 'free');
    expect(s.desk.y + s.desk.h).toBe(TILE_PX + WALL_GAP);
    const e = deskPicture('e', true, 'free'), w = deskPicture('w', false, 'free');
    expect(e.desk.x + e.desk.w).toBe(TILE_PX + WALL_GAP); expect([e.desk.w, e.desk.h]).toEqual([DESK_D, DESK_W]);
    expect(w.desk.x).toBe(0);   // no wall next to the tile: the desk stands at the tile's edge
  });
  it('wall side: the nearest wall; a tie faces away from the room centre, then north, east, south, west', () => {
    expect(consoleSide({ n: 1, e: Infinity, s: 2, w: 3 }, { dx: 0, dy: 0 })).toBe('n');
    expect(consoleSide({ n: 1, e: 1, s: 2, w: 3 }, { dx: 1, dy: 0 })).toBe('e');   // two walls: the one facing away from the centre
    expect(consoleSide({ n: 1, e: 1, s: 1, w: 1 }, { dx: 0, dy: 1 })).toBe('s');
    expect(consoleSide({ n: 2, e: 2, s: 2, w: 2 }, { dx: 0, dy: 0 })).toBe('n');
  });
  it('the console state: failed or unpowered red, occupied dim, else free', () => {
    const s = cutterState(), w = s.derived.stationOfKind[StationKind.Weapons]!;
    expect(consoleLook(s, [w])).toBe('free');
    sitDown(s, 0, w); expect(consoleLook(s, [w])).toBe('occupied');
    s.stations.failed[w] = 1; expect(consoleLook(s, [w])).toBe('down');
    s.stations.failed[w] = 0; s.stations.occupant[w] = -1; s.stations.level[w] = 0; expect(consoleLook(s, [w])).toBe('down');
  });
  it('the cutter: one desk per station at its tile, on the wall side', () => {
    const s = cutterState(), list = consoles(s);
    expect(list).toHaveLength(s.derived.stationTile.length);
    const nav = list.find((c) => c.members.includes(s.derived.stationOfKind[StationKind.Navigation]!))!;
    expect(nav.side).toBe('e'); expect(nav.flush).toBe(true);   // the Bridge console against the bow wall
    const sci = list.find((c) => c.members.includes(s.derived.stationOfKind[StationKind.Science]!))!;
    expect(sci.side).toBe('s');
    for (const c of list) expect(c.x % TILE_PX).toBe(0);
  });
  it('a console group (the Skiff Helm and Ops) draws one desk; it is red only when every member is down', () => {
    const s = skiffState(), list = consoles(s);
    expect(list).toHaveLength(4);   // Helm, Ops, Life Support, Medbay
    const helm = list.find((c) => c.members.includes(s.derived.stationOfKind[StationKind.Navigation]!))!;
    expect(helm.members).toHaveLength(2); expect(helm.side).toBe('e');
    const [nav, wep] = helm.members as [number, number];
    s.stations.failed[nav] = 1; expect(consoles(s).find((c) => c.members.includes(nav))!.look).toBe('free');
    s.stations.failed[wep] = 1; expect(consoles(s).find((c) => c.members.includes(nav))!.look).toBe('down');
  });
});
