import { z } from 'zod';
import { reachableTiles } from './reachability';
import { STATION_IDS, StationKind } from '../stationKinds';
import { STATION_MAX, REACTOR_CAPACITY } from '../tuning';

const tile = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

const shipSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  width: z.number().int().min(3),
  height: z.number().int().min(3),
  rows: z.array(z.string()),
  rooms: z.array(z.object({ id: z.string().length(1), name: z.string().min(1), system: z.string().nullable() })),
  edges: z.array(z.object({
    a: z.string().length(1), b: z.string().length(1), kind: z.enum(['door', 'opening']), tile, width: z.number().positive()
  })),
  breachSites: z.array(z.object({ room: z.string().length(1), tile, width: z.number().positive() })),
  stations: z.array(z.object({
    id: z.enum(STATION_IDS, { errorMap: () => ({ message: `station id must be one of ${STATION_IDS.join(', ')}` }) }),
    room: z.string().length(1), tile,
    allocation: z.number().int('station allocation must be an integer').min(0, 'station allocation must be >= 0')
  })),
  spawns: z.array(tile).min(4)
}).superRefine((s, ctx) => {
  const fail = (message: string): void => { ctx.addIssue({ code: z.ZodIssueCode.custom, message }); };
  if (s.rows.length !== s.height) return fail(`rows: expected ${s.height} rows (height)`);
  for (let y = 0; y < s.height; y++) if (s.rows[y]!.length !== s.width) return fail(`rows[${y}]: expected width ${s.width}`);
  const roomIds = new Set(s.rooms.map((r) => r.id));
  if (roomIds.size !== s.rooms.length) return fail('rooms: duplicate room id');
  if (new Set(s.stations.map((st) => st.id)).size !== s.stations.length) return fail('stations: duplicate station id');
  if (s.stations.length !== STATION_IDS.length) return fail(`stations: expected exactly ${STATION_IDS.length} stations, one per kind`);
  let budget = 0;
  for (const st of s.stations) {
    const kind = STATION_IDS.indexOf(st.id);
    if (st.allocation > STATION_MAX[kind]!) return fail(`station ${st.id}: allocation ${st.allocation} exceeds max ${STATION_MAX[kind]}`);
    if (kind === StationKind.Engineering && st.allocation < 1) return fail('station engineering: allocation must be at least 1');
    budget += st.allocation;
  }
  if (budget > REACTOR_CAPACITY) return fail(`stations: total allocation ${budget} exceeds reactor capacity ${REACTOR_CAPACITY}`);
  if (new Set(s.stations.map((st) => `${st.tile[0]},${st.tile[1]}`)).size !== s.stations.length) return fail('stations: two stations on one tile');
  if (new Set(s.edges.map((e) => `${e.tile[0]},${e.tile[1]}`)).size !== s.edges.length) return fail('edge: two edges on one tile');
  if (new Set(s.breachSites.map((b) => `${b.tile[0]},${b.tile[1]}`)).size !== s.breachSites.length) return fail('breach site: two sites on one tile');
  const at = (tx: number, ty: number): string => (tx < 0 || ty < 0 || tx >= s.width || ty >= s.height) ? '#' : s.rows[ty]!.charAt(tx);
  const drawn = new Set<string>();
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const c = at(x, y);
    if (c === '#' || c === '+' || c === ' ') continue;
    if (!roomIds.has(c)) return fail(`rows: unknown room char '${c}' at ${x},${y}`);
    drawn.add(c);
  }
  for (const id of roomIds) if (!drawn.has(id)) return fail(`rooms: room ${id} is never drawn in rows (stray room)`);
  const neighbours = (tx: number, ty: number): string[] => [at(tx + 1, ty), at(tx - 1, ty), at(tx, ty + 1), at(tx, ty - 1)];
  const adjacency = new Map<string, Set<string>>();
  for (const id of roomIds) adjacency.set(id, new Set());
  for (let i = 0; i < s.edges.length; i++) {
    const e = s.edges[i]!;
    if (!roomIds.has(e.a) || !roomIds.has(e.b)) return fail(`edge ${i}: unknown room`);
    const [tx, ty] = e.tile;
    if (e.kind === 'door' && at(tx, ty) !== '+') return fail(`edge ${i}: door tile must be '+'`);
    const n = neighbours(tx, ty);
    if (!n.includes(e.a) || !n.includes(e.b)) return fail(`edge ${i}: tile does not touch both rooms ${e.a} and ${e.b}`);
    if (n.some((c) => c !== '#' && c !== '+' && c !== ' ' && c !== e.a && c !== e.b)) return fail(`edge ${i}: tile touches rooms other than ${e.a} and ${e.b}`);
    adjacency.get(e.a)!.add(e.b); adjacency.get(e.b)!.add(e.a);
  }
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    if (at(x, y) === '+' && !s.edges.some((e) => e.tile[0] === x && e.tile[1] === y)) return fail(`edge: '+' at ${x},${y} has no edge entry`);
  }
  const first = s.rooms[0]!.id, seen = new Set([first]), stack = [first];
  while (stack.length) for (const nb of adjacency.get(stack.pop()!)!) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
  if (seen.size !== roomIds.size) return fail('rooms: room graph is not connected');
  for (let i = 0; i < s.breachSites.length; i++) {
    const b = s.breachSites[i]!;
    if (!roomIds.has(b.room)) return fail(`breach site ${i}: unknown room`);
    if (at(b.tile[0], b.tile[1]) !== '#' || !neighbours(b.tile[0], b.tile[1]).includes(b.room)) return fail(`breach site ${i}: must be a wall tile adjacent to room ${b.room}`);
  }
  for (let i = 0; i < s.stations.length; i++) {
    const st = s.stations[i]!;
    if (at(st.tile[0], st.tile[1]) !== st.room) return fail(`station ${i}: tile is not in room ${st.room}`);
  }
  // Crew-sized reachability: CREW_HALF (0.3 tiles, Task 6) is under half a tile, so 4-neighbour BFS over floor and door tiles is exact.
  const passable = (tx: number, ty: number): boolean => { const c = at(tx, ty); return c !== '#' && c !== ' '; };
  for (const sp of s.spawns) {
    if (!passable(sp[0], sp[1])) return fail(`spawn ${sp} is not a floor tile`);
    const reach = reachableTiles(s.width, s.height, sp, passable);
    for (const st of s.stations) if (!reach.has(st.tile[1] * s.width + st.tile[0])) return fail(`station ${st.id} is not reachable from spawn ${sp}`);
    for (const e of s.edges) if (!reach.has(e.tile[1] * s.width + e.tile[0])) return fail(`edge at ${e.tile} is not reachable from spawn ${sp}`);
  }
});

export type ShipLayout = z.infer<typeof shipSchema>;

export function parseShip(json: unknown): ShipLayout {
  const r = shipSchema.safeParse(json);
  if (!r.success) throw new Error('Invalid ship: ' + r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}
