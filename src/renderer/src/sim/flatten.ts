import type { SimState } from './state';
import { assertSimStateLive } from './state';
import { Position, Health, Life, Stable, Seated } from './components';
import { SIM_VERSION } from './tuning';
import { canonicalFields } from './canonicalFields';
import type { CanonicalField } from './canonicalFields';

export const FLATTEN_MANIFEST = ['header', 'rng', 'rooms', 'doors', 'airlocks', 'breaches', 'o2Counters', 'director', 'telemetry', 'stations', 'power', 'debris', 'weapons', 'enemy', 'boarders', 'run', 'science', 'skills', 'characters', 'crew'];
export { canonicalFields } from './canonicalFields';

export function layoutHashNumber(s: SimState): number { assertSimStateLive(s); return parseInt(s.derived.layoutHash, 16); }
export function layoutIdNumber(s: SimState): number { assertSimStateLive(s); return parseInt(s.derived.idHash, 16); }

const crewCells: Record<string, number[]> = { id: Stable.id, x: Position.x, y: Position.y, health: Health.cur, life: Life.state, bleed: Life.bleed, reviveProgress: Life.reviveProgress, reviverPid: Life.reviverPid, station: Seated.station };
type NumericRecord = Record<string, number | ArrayLike<number>>;
interface Access { field: CanonicalField; container: number; property: string; player?: number }
interface AccessPlan { containers: ((s: SimState) => NumericRecord)[]; fields: Access[]; targets: { group: 'weapons' | 'science'; offset: number }[] }
const accessPlans = new WeakMap<CanonicalField[], AccessPlan>();
function canonicalNumber(value: number): number { return value === 0 ? 0 : value; }
/** Compile field routing, never state storage. Records, arrays and ECS IDs can all be replaced. */
function accessPlan(fields: CanonicalField[]): AccessPlan {
  const cached = accessPlans.get(fields); if (cached) return cached;
  const plan: AccessPlan = { containers: [], fields: [], targets: [] }, containers = new Map<string, number>();
  for (const field of fields) {
    const { name, offset } = field, [group, key, crewKey] = field.parts;
    if (name.startsWith('$')) continue;
    if (key?.startsWith('$target')) {
      if (key === '$targetKind') plan.targets.push({ group: group as 'weapons' | 'science', offset });
      continue;
    }
    const containerKey = group === 'crew' ? `crew.${crewKey}` : group === 'rng' ? `rng.${key}` : key === undefined ? '' : group!;
    let container = containers.get(containerKey);
    if (container === undefined) {
      container = plan.containers.length; containers.set(containerKey, container);
      plan.containers.push(group === 'crew' ? () => crewCells[crewKey!]! as unknown as NumericRecord
        : group === 'rng' ? s => s.rng[key as keyof SimState['rng']] as unknown as NumericRecord
        : key === undefined ? s => s as unknown as NumericRecord : s => (s as unknown as Record<string, NumericRecord>)[group!]!);
    }
    plan.fields.push({ field, container, property: group === 'rng' ? 's' : key ?? group!, ...(group === 'crew' ? { player: Number(key) } : {}) });
  }
  accessPlans.set(fields, plan); return plan;
}

/** Canonical order is defined once, including the virtual header/target fields. */
export function flatten(s: SimState): Float64Array {
  assertSimStateLive(s);
  const fields = canonicalFields(s.layout, s.playerCount), last = fields[fields.length - 1]!;
  const out = new Float64Array(last.offset + last.count);
  const plan = accessPlan(fields), containers = plan.containers.map(read => read(s));
  out[0] = SIM_VERSION; out[1] = layoutIdNumber(s); out[2] = layoutHashNumber(s); out[9] = s.crew.length;
  for (const { group, offset } of plan.targets) {
    const target = s[group].target;
    out[offset] = canonicalNumber(target === null ? 0 : target.kind === 'object' ? 1 : 2);
    out[offset + 1] = canonicalNumber(target?.stableId ?? 0);
    out[offset + 2] = canonicalNumber(target?.kind === 'enemy' ? target.room : -1);
  }
  for (const access of plan.fields) {
    const f = access.field, value = containers[access.container]![access.player === undefined ? access.property : s.crew[access.player]!]!;
    for (let k = 0; k < f.count; k++) {
      const v = f.array ? (value as ArrayLike<number>)[k]! : value as number;
      out[f.offset + k] = canonicalNumber(v);
    }
  }
  return out;
}

/** Internal canonical decoder. Public snapshot APIs validate all fields first. */
export function unflatten(s: SimState, v: Float64Array): void {
  assertSimStateLive(s);
  const fields = canonicalFields(s.layout, s.playerCount), last = fields[fields.length - 1]!;
  if (v.length !== last.offset + last.count) throw new Error('snapshot length does not match state');
  if (v[0] !== SIM_VERSION) throw new Error('snapshot sim version does not match');
  if (v[1] !== layoutIdNumber(s) || v[2] !== layoutHashNumber(s)) throw new Error('snapshot layout does not match');
  if (v[5] !== s.playerCount || v[9] !== s.crew.length) throw new Error('snapshot crew count does not match state');
  const plan = accessPlan(fields), containers = plan.containers.map(read => read(s));
  for (const { group, offset } of plan.targets) {
    const kind = v[offset]!, stableId = v[offset + 1]!, room = v[offset + 2]!;
    s[group].target = kind === 0 ? null : kind === 1 ? { kind: 'object', stableId } : { kind: 'enemy', stableId, room };
  }
  for (const access of plan.fields) {
    const f = access.field, object = containers[access.container]!, property = access.player === undefined ? access.property : s.crew[access.player]!;
    // All values were validated. Avoid redundant stores to unchanged cells while
    // retaining exact -0 semantics and observing direct fixture mutations.
    if (f.array) { const array = object[property] as { [index: number]: number }; for (let k = 0; k < f.count; k++) if (!Object.is(array[k], v[f.offset + k])) array[k] = v[f.offset + k]!; }
    else if (!Object.is(object[property], v[f.offset])) object[property] = v[f.offset]!;
  }
}
