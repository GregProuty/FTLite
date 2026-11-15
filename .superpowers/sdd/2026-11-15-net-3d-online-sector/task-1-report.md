# Net-3d Task 1 report

Status: DONE

Commit: `b898ef4 feat(net): define private online session boundary and seat store`
Base: `695996c`, branch `codex/net-3`, worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`.

## Implemented

- Strict bounded renderer action validation, detached safe statuses and attachment descriptors, and fixed typed operation outcomes.
- Main-only saved-seat persistence with strict v1 records, a bounded 8193-byte probe (8192-byte accepted maximum), fatal UTF-8 decoding and bounded duplicate-key-aware JSON parsing.
- Serialized reads/saves/removals; save captures serialized credentials at invocation so callers cannot mutate pending writes. A failed operation does not poison later work.
- Unique same-directory exclusive temporary files (mode 0600), completed file sync and close before rename; failed rename preserves the previous saved seat. Cleanup only removes temporary files the operation successfully created.
- Development-only HTTP loopback configuration, disabled in packaged builds. No environment loading or dependency change.
- Compatibility-sensitive shared online contract added to the content digest and its mutation tests.

## Exported interfaces for consumers

`src/shared/onlineSession.ts`:

- `OnlineAction`: individual discriminants `host`, `join`, `ready`, `remove-seat`, `view-state`, `reconnect`, `start`, `retry`, `leave`, `forget-seat`.
- `validateOnlineAction(unknown)` checks exact keys. Join accepts raw strings up to 32 characters that become eight Crockford characters after trim/uppercase; it does not mutate or normalize the caller's string. Main must trim/uppercase when making its service join request.
- `OnlineStatus`: `{phase, role, ownSeat, snapshot, attachmentEpoch, error, retryAtMs, persistent, actions}`. The roster property is named `snapshot`; it is `RoomSnapshot|null`. Status attachmentEpoch permits zero before an attachment; port and view-state epochs require positive safe integers.
- `validateOnlineStatus`, `copyOnlineStatus`; copy validates then recursively detaches. Unsafe copy input throws fixed `invalid-status`.
- `OnlinePortDescriptor`: `{epoch, runId, hostGeneration, seatId, compatibility}`; `validateOnlinePortDescriptor`, `copyOnlinePortDescriptor`. Unsafe copy input throws fixed `invalid-port`.
- `OnlineResult`, `validateOnlineResult`: exact `{ok:true}` or `{ok:false,code:OnlineErrorCode}`.
- `OnlinePhase`, `OnlineErrorCode`, `ONLINE_ERROR_CODES`, `isOnlineErrorCode`.
- Error codes include all existing `ServiceErrorCode` values plus `online-disabled`, `invalid-action`, `invalid-status`, `invalid-port`, `busy`, `cancelled`, `storage-invalid`, `storage-read-failed`, `storage-write-failed`, `storage-clear-failed`, `transport-lost`, `host-lost`, `suspended`, `clock-discontinuity`, `retry-exhausted`.
- A lobby with `persistent:false,error:'storage-write-failed'` is valid, distinguishing persistence warnings from failed join/session phase.

`src/main/network/seatStore.ts`:

- `SavedSeatV1`, `validateSavedSeat`, `createSeatStore(directory, optionalFilesystem)` and inferred `SeatStore` type.
- Store methods: async `load():SavedSeatV1|null`, `save(record):void`, `clear():void`.
- `SeatStoreError` exposes only fixed `code` and matching `message`; `SeatStoreErrorCode` is the four storage codes above. No raw provider cause, path, contents or token is retained in surfaced errors.
- `SeatStoreFileSystem` is structural `{mkdir,open,rename,unlink}`. `SeatStoreFileHandle` provides `{read,writeFile,sync,close}`. Defaults use Node promises; tests retain real filesystem behavior and inject selected failures only.
- Filename: `online-seat-v1.json` inside caller-provided userData directory.

`src/main/network/onlineConfig.ts`:

- `OnlineConfig`, `resolveOnlineConfig({packaged,localServiceUrl?})` returns `{enabled:false}` or `{enabled:true,baseUrl,allowInsecureLocalhost:true}`.

## TDD evidence

1. Initial RED command:
   `npx vitest run tests/onlineSessionContract.test.ts tests/seatStore.test.ts tests/onlineConfig.test.ts`
   Exit 1, three suites failed with missing implementation modules `onlineSession`, `seatStore`, `onlineConfig`, as required by the task brief.
2. Digest RED command after adding its new fixture entry, before adding the manifest path:
   `npx vitest run tests/contentDigest.test.ts`
   Exit 1; 31 passed, 1 failed: `invalidates when gameplay or protocol source src/shared/onlineSession.ts changes`, because the digest remained identical after changing that source.
3. Serializer regression RED:
   `npx vitest run tests/seatStore.test.ts tests/onlineSessionContract.test.ts`
   Exit 1; 49 passed, 1 failed: `sanitizes serialization errors and preserves the saved credential`. A deliberately hostile test serializer exposed a raw synthetic error instead of `storage-invalid`. Save validation/serialization now catches it and validates the serialized representation before enqueueing.
4. Temporary ownership regression RED:
   `npx vitest run tests/seatStore.test.ts`
   Exit 1; 17 passed, 1 failed: `does not remove a temporary file it could not create exclusively`. The previous unconditional cleanup removed a collision fixture; cleanup now requires successful exclusive creation.
5. Final GREEN command:
   `npx vitest run tests/onlineSessionContract.test.ts tests/seatStore.test.ts tests/onlineConfig.test.ts tests/contentDigest.test.ts tests/roomServiceClient.test.ts`
   Exit 0: 5 test files passed, 155 tests passed. Breakdown: online config 16, online contract 33, seat store 18, digest 32, existing service client 56. Output had no test warnings/errors.
6. Root typecheck:
   `npm run typecheck`
   Exit 0: `tsc -b` with no diagnostics.
7. Whitespace verification:
   `git diff --check` and `git diff --cached --check`, no whitespace errors. Git emitted only its normal LF-to-CRLF conversion notices during staging.

The first implementation run additionally had one accidental leftover test reference (`readFile is not defined`); it was removed before the recorded green runs. No production behavior depended on that test typo.

## Decisions and self-review

- Existing service URL validation is inline, so the short predicate is mirrored locally with controller agreement instead of widening scope to a generic abstraction. Config intentionally requires HTTP and exactly the existing parsed hostname allowlist (`localhost`, `127.0.0.1`, `[::1]`), denies credentials/path/query/fragment, and canonicalizes to URL origin.
- Saved service origins are canonical URL origins under the existing generic policy (HTTPS or HTTP loopback). This does not enable a remote playable configuration; coordinator use must still match resolved active configuration.
- Every no-payload action is a separate union member so `Extract<OnlineAction,{type:'start'}>` and similar consumer typing work.
- Self-review caught and fixed serialization error redaction and exclusive temporary-file cleanup ownership. Reviewed staged source/tests against the brief, verified only the eight task files were staged, and confirmed the worktree was clean after commit.
- On this Windows host, real open/write/sync/close/rename replacement and removal behavior passed. Missing-file `ENOENT` becomes load-null/clear-success. Other platform file errors are mapped to fixed read/write/clear errors. File permissions remain platform-dependent; no encryption-at-rest or power-loss directory-durability claim is made. Failed temp cleanup can leave a unique private temporary file, while preserving the fixed write error and previous saved seat.
- The full root/service suites and final application gates remain controller-owned as instructed; this task ran focused coverage, the adjacent service-client suite and root typecheck only.
- No cloud, deploy, secret, .env, owner checkout, dependency or ledger changes. No subagents dispatched.

## Files changed

- `src/shared/onlineSession.ts`
- `src/main/network/seatStore.ts`
- `src/main/network/onlineConfig.ts`
- `tests/onlineSessionContract.test.ts`
- `tests/seatStore.test.ts`
- `tests/onlineConfig.test.ts`
- `build/contentDigest.ts`
- `tests/contentDigest.test.ts`

No unresolved task concerns.

## Review fix round 1 (Important: unchecked array properties)

Status: DONE
Commit: `c52ea64 fix(net): reject unchecked online status array properties`.

Review reproduction confirmed that extra enumerable properties on either `OnlineStatus.actions` or `OnlineStatus.snapshot.seats` passed element-only validation and could therefore be forwarded by `structuredClone`. Added regression cases for credential-like properties at both array locations and for sparse holes, which element-only `.every` also skipped.

Smallest source fix stays inside `src/shared/onlineSession.ts`: a private `hasOnlyArrayIndices` check requires exactly the dense array index keys. Both status arrays must pass it before `copyOnlineStatus` is allowed. The existing detached copy remains guarded by complete status validation; malformed arrays now produce fixed `invalid-status` and never enter the copy operation. No other room-service validators or consumer interfaces changed.

RED command: `npx vitest run tests/onlineSessionContract.test.ts`
Result: exit 1, 33 passed and 4 failed. Both `rejects credential properties attached to the actions/seats array` and both `rejects holes in the actions/seats array` failed with `expected true to be false`, proving the boundary accepted these malformed arrays before the fix.

GREEN command: `npx vitest run tests/onlineSessionContract.test.ts tests/seatStore.test.ts tests/onlineConfig.test.ts tests/contentDigest.test.ts`
Result: exit 0, 4 files passed, 103 tests passed (37 contract, 18 store, 16 config, 32 digest); no warnings or errors.

Typecheck command: `npm run typecheck`
Result: exit 0, `tsc -b`, no diagnostics.

Self-review: checked the diff against the finding, confirmed both malformed array locations reject before copy, retained normal empty action arrays and populated roster arrays through existing passing tests, and verified dense-key checks also reject a hole paired with an extra key. `git diff --check` and `git diff --cached --check` reported no whitespace errors. Only `src/shared/onlineSession.ts` and `tests/onlineSessionContract.test.ts` were staged. Full suites remain controller-owned as instructed. No unresolved concerns.
