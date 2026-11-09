import type { ShipLayout } from './schema';
import { hashF64 } from '../../../../shared/hash';
import { O2_K, HAZARD_DT, PASSAGE_OPEN, PASSAGE_BREACH } from '../tuning';

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
  kEff: number;
  layoutHash: string;   // content hash: rows, room order, edges, sites, stations, spawns
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
  // Layout identity covers everything the derived tables depend on: row text, room order, edge endpoints,
  // site rooms, stations and spawns. Reordering rooms must change the hash (snapshots index rooms by position).
  const codes: number[] = [width, height, layout.rooms.length, E, S, layout.stations.length, layout.spawns.length];
  for (const row of layout.rows) for (let i = 0; i < row.length; i++) codes.push(row.charCodeAt(i));
  for (const r of layout.rooms) codes.push(r.id.charCodeAt(0));
  for (let i = 0; i < E; i++) codes.push(edgeA[i]!, edgeB[i]!, edgeTile[i]!, edgeWidth[i]!, edgeIsDoor[i]!);
  for (let i = 0; i < S; i++) codes.push(siteRoom[i]!, siteTile[i]!, siteWidth[i]!);
  for (const st of layout.stations) codes.push(roomIndex.get(st.room)!, st.tile[1] * width + st.tile[0]);
  for (const sp of layout.spawns) codes.push(sp[1] * width + sp[0]);
  const idCodes: number[] = []; for (let i = 0; i < layout.id.length; i++) idCodes.push(layout.id.charCodeAt(i));
  // Stability bound (spec §5): k·dt·Σ incident conductance / V ≤ 1/2 for every room, at maximum passage.
  const maxCond = new Float64Array(layout.rooms.length);
  for (let e = 0; e < E; e++) { maxCond[edgeA[e]!]! += edgeWidth[e]! * PASSAGE_OPEN; maxCond[edgeB[e]!]! += edgeWidth[e]! * PASSAGE_OPEN; }
  for (let s = 0; s < S; s++) maxCond[siteRoom[s]!]! += siteWidth[s]! * PASSAGE_BREACH;
  let kEff = O2_K;
  for (let r = 0; r < maxCond.length; r++) if (maxCond[r]! > 0) kEff = Math.min(kEff, 0.5 * volume[r]! / maxCond[r]! / HAZARD_DT);
  return {
    width, height, roomIndex, roomOfTile, wallTile, doorTileToEdge, volume, roomTiles,
    edgeA, edgeB, edgeWidth, edgeIsDoor, edgeTile, siteRoom, siteWidth, siteTile,
    kEff,
    layoutHash: hashF64(Float64Array.from(codes)),
    idHash: hashF64(Float64Array.from(idCodes))
  };
}
