/** Keep a display-object cache in step with the live StableIds (spec §7): never keyed by raw entity id. */
export function syncCache<T>(cache: Map<number, T>, liveIds: readonly number[], create: (id: number) => T, destroy: (item: T, id: number) => void): void {
  const live = new Set(liveIds);
  for (const [id, item] of cache) if (!live.has(id)) { destroy(item, id); cache.delete(id); }
  for (const id of liveIds) if (!cache.has(id)) cache.set(id, create(id));
}
