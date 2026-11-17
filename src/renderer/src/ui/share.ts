// Structural sharing (React UI spec §2): returns `next`, except that every subtree deeply equal to the same place in
// `prev` is `prev`'s own object, so selectors and React.memo see unchanged references. Plain objects and arrays only.
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return prev as T;
  const arrays = Array.isArray(prev) && Array.isArray(next);
  if (!arrays && !(isPlain(prev) && isPlain(next))) return next;
  const p = prev as Record<string, unknown>, n = next as unknown as Record<string, unknown>;
  const keys = Object.keys(n), out: Record<string, unknown> = arrays ? ([] as unknown as Record<string, unknown>) : {};
  let same = Object.keys(p).length === keys.length;
  for (const k of keys) {
    const v = replaceEqualDeep(p[k], n[k]); out[k] = v;
    if (v !== p[k] || !(k in p)) same = false;
  }
  return (same ? prev : out) as T;
}
