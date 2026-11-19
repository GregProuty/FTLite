# Perf-i design: the host's publish path and boot asset loading

Date: 2026-11-19. Status: approved by the owner in conversation ("recommendation sounds good"); this document records it. Branch `perf-i`.

## 1. Why

A read-through of the sim, the network path and the renderer (2026-11-19) measured where the time goes. Numbers are Node on the owner's desktop; a laptop browser worker is expected to be 2 to 5 times slower.

- One duel tick costs 0.01 to 0.06 ms. The sim is not the cost and is not touched.
- The host's tick costs 1.55 ms with two streamed seats and 3.7 ms with four (p99 6 ms, max 16 ms), against a 16.7 ms budget. Almost all of it is the publish path around the sim.
- The page loads 46 boot assets one request at a time, and every visit revalidates each of them.

This change takes the wins that alter no rule, no wire byte and no golden hash. `SIM_VERSION` does not change.

## 2. Changes

### 2.1 Flatten with a plain loop

`flattenDuel` (`sim/duel/hash.ts`) and `flattenTactical` (`sim/tactical/hash.ts`) end with `Float64Array.from(out, mapper)`, which V8 runs on its slow iterator path: 115 µs for the duel's 3,084 values, against 8 µs for a preallocated array and a loop. The loop writes the same values, with −0 as 0, so every hash is unchanged.

### 2.2 Build a state image only when it can be sent

Today, on every tick and for every streamed binding, the host clones the publication, validates it, builds the image and encodes it, and then the sender drops two ticks in three (`sender.ts`: ordinary state goes out when `tick % 3 === 0`).

The stream binding's publication sink now returns before building anything when the publication is ordinary (not reliable) and its tick is off the cadence. The cadence is one exported constant, `STATE_CADENCE_TICKS`, read by the sender and the binding.

Reliable publications (an attach, a control change, a paused or ended phase) are never skipped.

**The one behaviour difference.** The sender used to see every tick, so its `newest` image was the last tick's. It now sees cadence ticks and reliable publications only. Two paths read `newest`: the resend after a stalled full image is retired, and the answer to a client's `refresh`. Each may now send an image up to two ticks (33 ms) older than before. The next cadence tick supersedes it as before. Sequence order, the acknowledgement rules and the notification floors are unchanged, because an off-cadence image was never transmitted on the ordinary path anyway.

### 2.3 One image per publication for all bindings

The image of a publication is the same for every binding of an authority, yet each binding validated and built its own. Each mode host now owns one `SharedStateImage` store, renewed when its authority is replaced, and passes it to every stream binding it makes. A binding takes the stored image when its publication sequence matches and builds and stores it otherwise. The sender already copies the image it is given, so sharing is safe.

- The authority still hands each sink its own detached clone (`core.ts`); that contract and its test are unchanged.
- A binding made without a store (tests that build one directly) behaves as before.
- A build that throws stores nothing, so each binding still validates and closes its own link.
- The host keeps validating what it publishes, once per sent publication instead of once per binding per tick.

### 2.4 Parse each tactical field name once

`validateTacticalValues` ran three regular expressions on every field name on every call (405 fields for a duel). The parse of a name is now cached by name. The checks, their order and their messages are unchanged. This also runs on every client, 20 times a second.

### 2.5 Load boot assets together

`loadAssets` awaited each manifest image and the font in turn. It now starts every load at once and then binds, reports failures and logs in manifest order, so the result and the error list are what they were.

## 3. Not in this change

- The wire format (the metadata resent in every state packet, JSON held frames): a protocol change, planned separately.
- Music size, the CRT setting, the paintings: separate, and they need the owner's ear and eye.
- Any sim arithmetic.

## 4. Tests and checks

- `tests/perfPublish.test.ts`: the cadence skip, reliable publications on any tick, the shared store, a failed build, and that flatten holds no −0.
- The full suite, `npm run typecheck`, and the determinism run stay green with no golden re-blessed.
- `scripts/profile-duel-publication.ts` before and after.

## 5. Measured (2026-11-19, Node on the owner's desktop)

The real authority core with real stream bindings, pumped one tick at a time for 2,400 ticks. Both runs sent the same 20.0 deltas a second and 20.6 KiB a second per seat.

| Host, per tick | Before | After |
|---|---|---|
| Crew 2, two streamed seats: mean | 2.47 ms | 0.66 ms |
| Crew 4, four streamed seats: mean | 4.13 ms | 0.99 ms |
| Crew 4, four streamed seats: p99 | 7.0 ms | 3.3 ms |
| One pump after a 2 s clock jump, two seats | 309 ms | 84 ms |
| One pump after a 2 s clock jump, four seats | 578 ms | 122 ms |

`scripts/profile-duel-publication.ts`, which calls the image build directly and so shows only §2.1 and §2.4: host 1.27 to 1.09 ms a tick, client 0.79 to 0.65 ms a publication.

Checks run: the full suite (5,808 tests) and `tsc -b`; the determinism run on Node, Chromium and Firefox with no golden changed; `npm run test:duel-app-runtime` (two app processes, host, join, two rounds, hash agreement, peer-lost pause and rejoin) passed.

Not measured: the boot time saved by §2.5 on the live site. The app boots and binds every asset with the new loader; the saving depends on the visitor's round-trip time.
