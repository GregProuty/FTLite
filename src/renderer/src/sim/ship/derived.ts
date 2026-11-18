import type { ShipLayout } from './schema';
import { hashF64 } from '../../../../shared/hash';
import { STATION_COUNT, kindOfStationId } from '../stationKinds';
import { O2_K, HAZARD_DT, PASSAGE_OPEN, PASSAGE_BREACH, AIRLOCK_PASSAGE } from '../tuning';

export interface Derived {
  width: number; height: number;
  roomIndex: Map<string, number>;
  roomOfTile: Int16Array;
  wallTile: Uint8Array;
  doorTileToEdge: Int16Array;
  volume: Float64Array;
  roomTiles: number[][];
  edgeA: Int16Array; edgeB: Int16Array; edgeWidth: Float64Array; edgeIsDoor: Uint8Array; edgeTile: Int32Array;
  siteRoom: Int16Array; siteWidth: Float64Array; siteTile: Int32Array;
  airlockRoom: Int16Array; airlockTile: Int32Array;   // hull doors to space (spec Demo-vii section 1)
  airlockOfTile: Int16Array;  // tile -> airlock index, -1
  magazineTile: number; magazineRoom: number;   // the torpedo magazine (spec Coop-ii section 2), -1 without one
  kEff: number;
  stationKind: Uint8Array; stationRoom: Int16Array; stationTile: Int32Array;
  stationOfKind: Int8Array;   // kind -> station index
  doorEdges: number[];        // edge indices that are doors, ascending
  stationGroup: Int8Array;    // station index -> console group index, -1 outside a group (spec Demo-x-a section 1)
  groupStations: number[][];  // console group -> its station indices in tab order
  layoutHash: string;   // content hash: rows, room order, edges, sites, airlocks, stations, spawns
  idHash: string;       // hash of layout.id
}

export function deriveLayout(layout: ShipLayout): Derived {
  const { width, height } = layout;
  const roomIndex = new Map<string, number>();
  layout.rooms.forEach((r, i) => roomIndex.set(r.id, i));
  const n = width * height;
  const roomOfTile = new Int16Array(n).fill(-1);
  const wallTile = new Uint8Array(n);
  const doorTileToEdge = new Int16Array(n).fill(-1);
  const volume = new Float64Array(layout.rooms.length);
  const roomTiles: number[][] = layout.rooms.map(() => []);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const c = layout.rows[y]!.charAt(x), i = y * width + x;
    if (c === '#' || c === ' ') { wallTile[i] = 1; continue; }
    if (c === '+') continue;
    const r = roomIndex.get(c)!;
    roomOfTile[i] = r; volume[r]! += 1; roomTiles[r]!.push(i);
  }
  const E = layout.edges.length;
  const edgeA = new Int16Array(E), edgeB = new Int16Array(E), edgeWidth = new Float64Array(E), edgeIsDoor = new Uint8Array(E), edgeTile = new Int32Array(E);
  layout.edges.forEach((e, i) => {
    edgeA[i] = roomIndex.get(e.a)!; edgeB[i] = roomIndex.get(e.b)!;
    edgeWidth[i] = e.width; edgeIsDoor[i] = e.kind === 'door' ? 1 : 0;
    edgeTile[i] = e.tile[1] * width + e.tile[0];
    if (e.kind === 'door') doorTileToEdge[edgeTile[i]!] = i;
  });
  const S = layout.breachSites.length;
  const siteRoom = new Int16Array(S), siteWidth = new Float64Array(S), siteTile = new Int32Array(S);
  layout.breachSites.forEach((b, i) => { siteRoom[i] = roomIndex.get(b.room)!; siteWidth[i] = b.width; siteTile[i] = b.tile[1] * width + b.tile[0]; });
  const A = layout.airlocks.length;
  const airlockRoom = new Int16Array(A), airlockTile = new Int32Array(A), airlockOfTile = new Int16Array(n).fill(-1);
  layout.airlocks.forEach((a, i) => { airlockRoom[i] = roomIndex.get(a.room)!; airlockTile[i] = a.tile[1] * width + a.tile[0]; airlockOfTile[airlockTile[i]!] = i; });
  const N = layout.stations.length;
  const stationKind = new Uint8Array(N), stationRoom = new Int16Array(N), stationTile = new Int32Array(N), stationOfKind = new Int8Array(STATION_COUNT).fill(-1);
  layout.stations.forEach((st, i) => {
    const k = kindOfStationId(st.id);
    stationKind[i] = k; stationRoom[i] = roomIndex.get(st.room)!; stationTile[i] = st.tile[1] * width + st.tile[0]; stationOfKind[k] = i;
  });
  const stationGroup = new Int8Array(N).fill(-1);
  const groupStations = layout.consoleGroups.map((cg, g) => cg.kinds.map((k) => { const i = stationOfKind[kindOfStationId(k)]!; stationGroup[i] = g; return i; }));
  const doorEdges: number[] = [];
  for (let i = 0; i < E; i++) if (edgeIsDoor[i]) doorEdges.push(i);
  // Layout identity covers everything the derived tables depend on: row text, room order, edge endpoints,
  // site rooms, stations and spawns. Reordering rooms must change the hash (snapshots index rooms by position).
  const codes: number[] = [width, height, layout.rooms.length, E, S, layout.stations.length, layout.spawns.length];
  for (const row of layout.rows) for (let i = 0; i < row.length; i++) codes.push(row.charCodeAt(i));
  for (const r of layout.rooms) codes.push(r.id.charCodeAt(0));
  for (let i = 0; i < E; i++) codes.push(edgeA[i]!, edgeB[i]!, edgeTile[i]!, edgeWidth[i]!, edgeIsDoor[i]!);
  for (let i = 0; i < S; i++) codes.push(siteRoom[i]!, siteTile[i]!, siteWidth[i]!);
  // Airlocks (count, then room and tile each) only when there are any, so a layout without them keeps its hash (spec Demo-vii amendment 11).
  if (A > 0) { codes.push(A); for (let i = 0; i < A; i++) codes.push(airlockRoom[i]!, airlockTile[i]!); }
  for (const st of layout.stations) codes.push(roomIndex.get(st.room)!, st.tile[1] * width + st.tile[0], kindOfStationId(st.id), st.allocation);
  for (const sp of layout.spawns) codes.push(sp[1] * width + sp[0]);
  const magazineTile = layout.magazine ? layout.magazine[1] * width + layout.magazine[0] : -1, magazineRoom = magazineTile >= 0 ? roomOfTile[magazineTile]! : -1;
  if (magazineTile >= 0) codes.push(magazineTile);   // only when present, so a layout without one keeps its hash (spec Coop-ii amendment D4)
  if (groupStations.length) { codes.push(-1, groupStations.length); for (const g of groupStations) codes.push(g.length, ...g); }   // console groups only when present, so a layout without them keeps its hash (spec Demo-x-a section 1)
  // Valkyrn spec §3.1: the crew class, the fixed crew and the unattended Helm change the duel, so they join the identity,
  // only when any is present, so a layout without them keeps its hash; `hull` is view data and stays out.
  if (layout.shipClass !== undefined || layout.crew !== undefined || layout.helmHoldsUnattended !== undefined) {
    codes.push(-2, layout.crew ?? 0, layout.helmHoldsUnattended === undefined ? -1 : layout.helmHoldsUnattended ? 1 : 0, layout.shipClass?.length ?? -1);
    if (layout.shipClass !== undefined) for (let i = 0; i < layout.shipClass.length; i++) codes.push(layout.shipClass.charCodeAt(i));
  }
  const idCodes: number[] = []; for (let i = 0; i < layout.id.length; i++) idCodes.push(layout.id.charCodeAt(i));
  // Stability bound (spec §5): k·dt·Σ incident conductance / V ≤ 1/2 for every room, at maximum passage.
  const maxCond = new Float64Array(layout.rooms.length);
  for (let e = 0; e < E; e++) { maxCond[edgeA[e]!]! += edgeWidth[e]! * PASSAGE_OPEN; maxCond[edgeB[e]!]! += edgeWidth[e]! * PASSAGE_OPEN; }
  for (let s = 0; s < S; s++) maxCond[siteRoom[s]!]! += siteWidth[s]! * PASSAGE_BREACH;
  for (let a = 0; a < A; a++) maxCond[airlockRoom[a]!]! += AIRLOCK_PASSAGE;
  let kEff = O2_K;
  for (let r = 0; r < maxCond.length; r++) if (maxCond[r]! > 0) kEff = Math.min(kEff, 0.5 * volume[r]! / maxCond[r]! / HAZARD_DT);
  return {
    width, height, roomIndex, roomOfTile, wallTile, doorTileToEdge, volume, roomTiles,
    edgeA, edgeB, edgeWidth, edgeIsDoor, edgeTile, siteRoom, siteWidth, siteTile, airlockRoom, airlockTile, airlockOfTile, magazineTile, magazineRoom,
    stationKind, stationRoom, stationTile, stationOfKind, doorEdges, stationGroup, groupStations,
    kEff,
    layoutHash: hashF64(Float64Array.from(codes)),
    idHash: hashF64(Float64Array.from(idCodes))
  };
}
