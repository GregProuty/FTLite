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
