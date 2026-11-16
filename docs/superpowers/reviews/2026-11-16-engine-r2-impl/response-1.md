# Round 1 response (implementation revised, 9186aeb and c5ab155)

Reviewed `round-1.json` against the code. 4 accepted (1 P2, 3 P3), 0 rejected, 0 deferred.

## R1-F1 [P2]: The bump proof never ties the duel oracle baseline to the pinned duel golden

Confirmed: both cases could pass. The fix has two parts.

- **(a) Versions.** On a bump, `blessRefusal` now refuses unless every stale artifact is at `SIM_VERSION − 1`. This blocks goldens two versions back. `verifyDuelOracle` also refuses unless the baseline's version equals the stored `duel-1.json` version.
- **(b) Golden hashes.** The duel baseline now records `hashDuel` every `DUEL_GOLDEN_EVERY` (600) ticks of the scripted seed-1 run. A bump requires those hashes, the tick count, the outcome, the seed, the cadence and the version to equal the stored `duel-1.json`, so a baseline recorded after an unblessed rule change fails. The sector baseline is tied to `basic.json` the same way: hashes every 60 ticks, the final hash and the version. Baselines without the field are refused with "re-record the duel oracle baseline".

Unit tests cover goldens two back, a version mismatch, a hash mismatch, a missing field and the happy path.

It was also proven end to end. The new oracle ran on the pre-R-2 code (a scratch worktree at bc3d94e), keyed to this root. Its baseline matches the v37 golden, a tampered copy is refused at tick 3600, and the full bump from 37 to 38 passes (20 runs, 205,178 ticks).

## R1-F2 [P3]: Bless with every pinned artifact deleted runs neither proof

Fixed. A missing pinned artifact is refused by name unless `npm run bless -- --fresh` is given. The flag is documented in `docs/gates.md` and tested.

## R1-F3 [P3]: The oracle never checks that its schema covers the whole flattened duel

Fixed. `recordRun` throws if the schema's count differs from `flattenDuel`'s length minus 1. A test uses a schema one field short.

## R1-F4 [P3]: Two H-1 view spots still hard-code slot 1

Fixed. The enemy arrow uses `targetOf(state, CREW_SLOT)`. `hitsCrew` uses `e.ship !== CREW_SLOT`, with a comment that laser events carry no target until R-3/R-5. The view tests pass unchanged.

## Also changed

- (nothing)

Verified:
- `npm run typecheck`;
- 118 tests in the 9 touched or affected files, including the view tests;
- `npm run bless -- --baseline` (version 38);
- the full verify (typecheck, build, `npm test`): 3,173 of 3,174 pass. The one failure is the known worktree-only `tests/onlineAppRuntime.test.ts` flake, which fails the same way at bc3d94e.
- No golden or fixture changed.

## Files changed

- docs/gates.md
- scripts/bless-golden.ts
- scripts/golden/blessGuard.ts
- scripts/golden/duelOracle.ts
- scripts/golden/versionOnly.ts
- src/renderer/src/render/tactical/fxModel.ts
- src/renderer/src/render/tactical/tacticalModel.ts
- tests/blessGuard.test.ts
- tests/duelOracle.test.ts
- tests/versionOnly.test.ts

<!-- end -->
