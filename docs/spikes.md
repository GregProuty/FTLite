# Spikes and recorded decisions

## Licence check (Task 1)

Command: `node -e "...readFileSync('node_modules/<pkg>/package.json')...license"` (a plain `require(p+'/package.json')` fails with ERR_PACKAGE_PATH_NOT_EXPORTED on bitecs, so the files are read directly).

```
bitecs MPL-2.0
pixi.js MIT
zod MIT
fast-check MIT
electron MIT
electron-vite MIT
vitest MIT
```

All licences are MIT or MPL-2.0; acceptable.

## Ship format decisions (Task 4)

- The spec's `defaultOpen` and `"space"` edges are not in the format: every door starts Closed and opens on approach, and the only edges to space are active breaches on `breachSites`.

## bitECS 0.4.0 entity recycling (Task 15)

- `createEntityIndex()` without versioning; `withVersioning()` was found unreliable under churn in the previous project.
- Removed ids are recycled: immediately (from the spike test console output).
- Decision: crew are the only entities in increments 0-1 and are never removed. `StableId` (sim-owned, monotonic) is the only id the renderer or snapshots use. Snapshots use our own `flatten()`; `bitecs/serialization` was not adopted because it has no header versioning (spec §4 rule 6).
- Measured (from the spike test's console output): snapshot size 976 bytes for 4 players on the starter ship; `hashState` 0.0050 ms per call.
- Debris (increment 2a) will be the first churned entities; re-run this spike then.

## bitECS query ordering (Task 15)

- Not relied on: every system iterates `state.crew` by PlayerId or arrays by index (spec §4 rule 4).
