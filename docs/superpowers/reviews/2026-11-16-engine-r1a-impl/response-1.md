# Round 1 response (implementation revised, 7a2f297)

Reviewed `round-1.json` against the code. A parallel Opus whole-branch review also ran; its fixes are under "Also changed". 0 accepted, 0 rejected, 1 deferred (P2).

## R1-F1 [P2]: Tie the message codec's snapshot type to its wire schema

Deferred to R-1b. The claim is right: `codecFor<S>(wire)` (`src/renderer/src/net/codec.ts:144`) does not tie `S` to `wire.snapshotHeader`, and `decodeMessage` casts unchecked (`codec.ts:156`). The watermark refine also casts the header (`codec.ts:125`).

This is harmless in R-1a, because the sector is the only mode, and its codec builds today's schemas exactly (`tests/commandUnion.test.ts` compares them).

The fix changes `ModeWire`'s and `codecFor`'s signatures, which the reviewed R-1b plan builds on. R-1b adds the second `ModeWire` (the duel's). It also needs per-mode end-record and cue schemas on `ModeWire`: today the `ended` union and the cue enum are shared, so the sector codec would admit a duel end record. So R-1b makes `ModeWire<S>` generic, with `snapshotHeader(p): z.ZodType<S['header']>` and an `endRecord(p)` hook, in one change.

## Also changed

From the Opus final review (ready to merge; these were its minors):
- **The authority trace reaches `ended`.** A fifth scenario in `scripts/golden/authority-trace.ts` zeroes the hull in a checkpoint, restores it on a fresh authority and ticks to the ended event. It records the results, events, publications, the end-record hash, the safe-point capture and the replay round trip. All five scenarios were re-recorded at pre-refactor master 8755199 in a scratch worktree. The end record is normalised to the bare record for comparison, and the branch separately asserts the `'sector'` tag. `same` reports golden 134, live 666, lease 47, crash 23 and ended 15 entries. The check bites: adding 1 to the sector end record's `score` fails it at `ended[7].event.payload.record.score: 0 → 1`.
- **Null init.** `sectorRules.validateInit` now reads `layoutId` with `?.`, so a JSON `null` init gives master's 'unknown sector layout' instead of a TypeError. A test covers it.
- **Ended without a record.** The core throws `<modeId> rules reported ended without an end record` instead of silently skipping the ended event that clients wait for. A stub-rules test covers it.
- **Codec label.** `jsonModeCodecs`' label defaults to `rules.modeId`.
- **Error-string tests.** They assert the expected messages, including the real sector mode's `invalid sector ownership`.
- **Tracking.** `.superpowers/sdd/final-fix-report.md` is no longer tracked (970971b).

Verified:
- `npm run typecheck`;
- 81 tests in the touched files;
- authority-trace and canonical-trace `same`;
- the full verify (typecheck, build, `npm test`): 3,105 of 3,106 pass; the one failure is the known worktree-only `tests/onlineAppRuntime.test.ts` flake.

## Files changed

- scripts/golden/authority-trace.ts
- src/network/modes/encounterMode.ts
- src/renderer/src/authority/core.ts
- src/renderer/src/authority/sectorRules.ts
- tests/encounterAuthority.test.ts
- tests/encounterMode.test.ts

<!-- end -->
