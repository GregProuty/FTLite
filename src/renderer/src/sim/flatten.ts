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
function storage(s: SimState, f: CanonicalField): { object: NumericRecord; key: string | number } {
  const [group, key, crewKey] = f.parts;
  if (group === 'crew') return { object: crewCells[crewKey!]! as unknown as NumericRecord, key: s.crew[Number(key)]! };
  if (group === 'rng') return { object: s.rng[key as keyof SimState['rng']] as unknown as NumericRecord, key: 's' };
  return { object: (key === undefined ? s : (s as unknown as Record<string, unknown>)[group!]) as unknown as NumericRecord, key: key ?? group! };
}

/** Canonical order is defined once, including the virtual header/target fields. */
export function flatten(s: SimState): Float64Array {
  assertSimStateLive(s);
  const fields = canonicalFields(s.layout, s.playerCount), last = fields[fields.length - 1]!;
  const out = new Float64Array(last.offset + last.count);
  for (const f of fields) {
    let value: number | ArrayLike<number>;
    switch (f.name) {
      case '$simVersion': value = SIM_VERSION; break;
      case '$layoutId': value = layoutIdNumber(s); break;
      case '$layoutHash': value = layoutHashNumber(s); break;
      case '$crewCount': value = s.crew.length; break;
      default: {
        const [group, key] = f.parts;
        if (key?.startsWith('$target')) {
          const target = s[group as 'weapons' | 'science'].target;
          value = key === '$targetKind' ? (target === null ? 0 : target.kind === 'object' ? 1 : 2)
            : key === '$targetId' ? target?.stableId ?? 0 : target?.kind === 'enemy' ? target.room : -1;
        } else { const { object, key: property } = storage(s, f); value = object[property]!; }
      }
    }
    for (let k = 0; k < f.count; k++) {
      const v = f.array ? (value as ArrayLike<number>)[k]! : value as number;
      out[f.offset + k] = v === 0 ? 0 : v;
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
  for (const f of fields) {
    if (f.name.startsWith('$')) continue;
    const [group, key] = f.parts;
    if (key?.startsWith('$target')) {
      if (key === '$targetKind') {
        const kind = v[f.offset]!, stableId = v[f.offset + 1]!, room = v[f.offset + 2]!;
        s[group as 'weapons' | 'science'].target = kind === 0 ? null : kind === 1 ? { kind: 'object', stableId } : { kind: 'enemy', stableId, room };
      }
      continue;
    }
    const { object, key: property } = storage(s, f);
    if (f.array) {
      const array = object[property] as { [index: number]: number };
      for (let k = 0; k < f.count; k++) array[k] = v[f.offset + k]!;
    } else object[property] = v[f.offset]!;
  }
}
