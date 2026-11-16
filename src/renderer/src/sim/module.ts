// The sim module contract (engine refactor spec §6). Each part of an encounter declares its canonical fields in a
// fixed order; flatten, hash, snapshot and restore are derived from those declarations, and the completeness test
// requires every member of the module's state to be a field or on its declared not-snapshotted list. R-1 puts the
// duel on it (space, presence, repair and the interior wrapper); R-2, R-4 and R-5 move the rest.

/** One canonical field: `count` values read in order, written back in the same order. */
export interface ModuleField<S> {
  readonly name: string;
  readonly count: number;
  read(s: S, out: number[]): void;
  /** Write `count` values starting at `values[offset]`. Throws on a value the state cannot hold. */
  write(s: S, values: ArrayLike<number>, offset: number): void;
}

export interface SimModule<S, K extends string = string> {
  readonly id: string;
  /** The canonical fields in order. The list may depend on the state's shape (the map's asteroid count), never on its values. */
  fields(s: S): readonly ModuleField<S>[];
  /** Members of S outside the canonical fields, by dotted path, each with the reason it is not snapshotted. */
  readonly notSnapshotted: Readonly<Record<string, string>>;
  /** The command kinds this module owns. */
  readonly commands: readonly K[];
  /** The rejection reasons its commands may return. */
  readonly reasons: readonly string[];
}

/** A scalar field read and written through a getter and setter. */
export function scalar<S>(name: string, get: (s: S) => number, set: (s: S, v: number) => void): ModuleField<S> {
  return { name, count: 1, read: (s, out) => { out.push(get(s)); }, write: (s, values, offset) => { set(s, values[offset]!); } };
}
/** A boolean field, written as 1 or 0. */
export function flag<S>(name: string, get: (s: S) => boolean, set: (s: S, v: boolean) => void): ModuleField<S> {
  return { name, count: 1, read: (s, out) => { out.push(get(s) ? 1 : 0); }, write: (s, values, offset) => { set(s, values[offset]! !== 0); } };
}
/** A fixed-length numeric array field (a tuple or typed array whose length is part of the state's shape). */
export function vector<S>(name: string, count: number, get: (s: S) => { length: number; [k: number]: number }): ModuleField<S> {
  return {
    name, count,
    read(s, out) { const a = get(s); if (a.length !== count) throw new Error(`${name}: length ${a.length}, declared ${count}`); for (let k = 0; k < count; k++) out.push(a[k]!); },
    write(s, values, offset) { const a = get(s); if (a.length !== count) throw new Error(`${name}: length ${a.length}, declared ${count}`); for (let k = 0; k < count; k++) a[k] = values[offset + k]!; }
  };
}

/** The number of values a module writes for this state. */
export function moduleLength<S>(m: SimModule<S>, s: S): number {
  let n = 0; for (const f of m.fields(s)) n += f.count; return n;
}
/** Append the module's canonical values, checking each field writes exactly its declared count. */
export function flattenModule<S>(m: SimModule<S>, s: S, out: number[]): void {
  for (const f of m.fields(s)) {
    const before = out.length; f.read(s, out);
    if (out.length - before !== f.count) throw new Error(`${m.id}.${f.name}: wrote ${out.length - before} values, declared ${f.count}`);
  }
}
/** Write the module's values back from `values[offset]`; returns the offset after them. */
export function unflattenModule<S>(m: SimModule<S>, s: S, values: ArrayLike<number>, offset: number): number {
  for (const f of m.fields(s)) {
    if (offset + f.count > values.length) throw new Error(`${m.id}.${f.name}: values end early`);
    f.write(s, values, offset); offset += f.count;
  }
  return offset;
}
