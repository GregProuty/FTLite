# Codex review exchange: engine-r1a-impl

Subject: `scripts/golden/authority-trace.ts src/network/modes/encounterMode.ts src/network/modes/sector.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/session.ts src/renderer/src/authority/authority.ts src/renderer/src/authority/core.ts src/renderer/src/authority/ledger.ts src/renderer/src/authority/replay.ts src/renderer/src/authority/rules.ts src/renderer/src/authority/sectorRules.ts src/renderer/src/net/codec.ts src/renderer/src/net/contracts.ts src/renderer/src/sim/duel/commands.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/replay.ts tests/commandUnion.test.ts tests/duel.test.ts tests/duelControls.test.ts tests/duelInterior.test.ts tests/duelReadout.test.ts tests/duelTelemetry.test.ts tests/encounterAuthority.test.ts tests/encounterMode.test.ts tests/helpers/scriptedDuel.ts tests/netCodec.test.ts tests/networkBoundary.test.ts tests/sectorStream.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 3d94023, effort high, 183 s, 1247536 in / 1132800 cached / 8292 out)

Verdict: ready with P2s

## Findings

### [P2] R1-F1 Tie the message codec’s snapshot type to its wire schema
The generic codec can claim any snapshot type without proving that its wire schema validates that type. · plan L52-L53; src/renderer/src/net/codec.ts:L33,L144,L156; src/renderer/src/authority/rules.ts:L56 · When R-1b adds the duel codec, TypeScript would accept a duel snapshot type paired with the wrong snapshot header schema, and decoded publications would carry a false type. · Make ModeWire generic over the snapshot header and have codecFor derive or check its snapshot type from that schema; remove the unchecked decode cast.

## Verified
- The sector rules supply the planned init, step, terminal, cue, snapshot, checkpoint and codec hooks; createAuthority delegates to them. plan L50-L56; src/renderer/src/authority/sectorRules.ts:L23,L39,L52; src/renderer/src/authority/authority.ts:L46.
- The changed core retains admission, the lease gate, held input, captures, segment rotation, publication, event routing and disposal in the corresponding paths. src/renderer/src/authority/core.ts:L227,L313,L430,L456,L619.
- The mode factory retains the old sector host’s replacement, ownership, checkpoint, capture, attachment and disposal paths; sector.ts supplies its existing producers and stream adapter. src/network/modes/encounterMode.ts:L84,L110,L121,L128; src/network/modes/sector.ts:L18.
- Sector replays omit the mode field, non-sector replays record it, and parsing checks the rules’ mode. plan L57; src/renderer/src/authority/core.ts:L571; src/renderer/src/authority/replay.ts:L35,L42.
- The ended record is tagged, and its readers either use the inner sector record or inspect only the event kind. src/renderer/src/net/contracts.ts:L97; src/renderer/src/app/session.ts:L100; src/renderer/src/clientControl/clientRun.ts:L157; src/renderer/src/app/onlineSession.ts:L54.
- Although the authority trace does not reach ended, an existing recovery test drives a terminal tick through the authority and client; the new tests check the record and codec shape. scripts/golden/authority-trace.ts:L77,L132; tests/authorityRecovery.test.ts:L52; tests/encounterAuthority.test.ts:L43; tests/commandUnion.test.ts:L50.
- The network boundary adds encounterMode.ts to its mode-file exception, and the determinism guard covers the authority and net roots. tests/networkBoundary.test.ts:L28; tests/boundary.test.ts:L12,L21.

## Not verified
- I did not run Jest, the golden comparisons, the host-runtime gate or the cross-engine determinism gate; their passing results are reported by the implementers.
- I could not read the run directory’s brief.md because filesystem access was denied. Targeted reads beyond the manifest covered checkpoint validation, ended-event readers and the existing terminal recovery test; other unlisted files were not audited.

---

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

---

