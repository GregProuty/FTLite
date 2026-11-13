# Networking measurements: what the code says about Brief A and Brief B

Date: 2026-11-13. Branch `master` (HEAD 89aadad, SIM_VERSION as built). Machine: AMD Ryzen 7 9700X (8 cores, 16 threads), Windows 11, x64.
Node 24.18.0 (V8 13.6), Electron 37.10.3 run as Node (Node 22.21.1, V8 13.8), Chrome 157, Edge 157, Firefox 160.
No repo files were changed. Every script lives in the scratchpad folder
`C:\Users\djuar\AppData\Local\Temp\claude\86da55dbee83ee65\b0d62506-f1e2-4b2f-8539-6778ff35b15b\scratchpad\netmeasure\` (called `NM\` below). The scripts are listed at the end.

The two briefs: **Brief A** is `docs/superpowers/specs/2026-11-13-networking-research.md` (host relays input frames, every machine runs `step()`, prediction and rollback). **Brief B** is `research/2026-11-13-networking-research.md` (one authoritative sim, client commands up, snapshots down with interpolation, predict only your own movement).

In this document, **measured** means a script printed the number. **Inferred** means I reasoned it from the measured numbers or from reading the code.

---

## 0. Headline numbers

| Question | Answer | Source |
|---|---|---|
| Full state size | Skiff (2 crew): **630 values**. Cutter (4 crew): **773 values**. The count is fixed per ship and player count, because every pool is a fixed slot array. | `NM\measure-size.ts` |
| Full state, compressed | 5.0 / 6.2 KB as raw Float64. **0.27–0.84 KB deflated.** Lossless varint + deflate: 0.27–0.68 KB. | `NM\measure-size.ts` |
| Client-visible projection | 457 values (Skiff) / 571 values (Cutter). Quantized: 0.47–0.65 KB. Quantized + deflate: **0.13–0.34 KB**. | `NM\measure-size.ts` |
| Visible delta at 20 Hz, busy combat | Mean **20–32 B per packet** (p95 ≤ 49 B, max 89 B), which is **0.4–0.7 KB/s per peer** before transport headers. | `NM\measure-size.ts` |
| `step()` cost | Median **4.5–7.2 µs**. p99 14–27 µs. Max 0.1–0.4 ms (GC or JIT pauses). | `NM\measure-cpu.ts` |
| Rollback (restore + resimulate) | 24 ticks: **p99 0.15 ms (Skiff), 0.36 ms (Cutter)**. 60 ticks: p99 ≤ 0.86 ms. Resaving a ring entry every tick: 24 ticks p99 ≤ 0.57 ms. Rollback result matched the uninterrupted hash in 500/500 trials per N. | `NM\measure-cpu.ts` |
| Determinism across processes and engines | **900/900 per-second hashes identical** on both ships, 15 min of sim each, across 11 runs: two Node processes, Node `--jitless`, Node with no optimizing JIT, Electron's V8, Chrome and Edge (main thread and Web Worker), and Firefox/SpiderMonkey (main thread and Web Worker). | `NM\det-*.{ts,cjs}` |
| Re-host checkpoint (late run, sector 3) | `saveSnapshot` JSON is 2.3 / 2.8 KB; **gzip 0.84 / 0.97 KB**. Lossless binary + deflate: 0.53 / 0.64 KB. Load and continue for 30 s gives a hash identical to the uninterrupted run. | `NM\measure-size.ts` |

---

## 1. Full flattened state size

**Method.** `NM\find-states.ts` runs the bots (`sim/bot.ts:289 botIntent`, the same driver as `tests/gate-skiff.test.ts` and `scripts/playtest-audit.ts`) with `createSimState(layout, players, seed, DEFAULT_CHARACTERS)`. Players: Skiff 2, Cutter 4. It picks four states:
- **quiet**: seed 1, tick 600 (the calm start beacon).
- **busy**: over seeds 1–6, the tick in the first 15 minutes with the highest busyness score while an enemy is present.
- **late**: the first seed whose bots reach sector index 2 (the third sector) and survive 60 s more there.
- **busyMax**: the busy state with 2 boarders, 3 more shots, 3 fires and a breach placed by the test helpers. This is a synthetic worst case, because bots never had boarders aboard while an enemy was present.

What each state contained:
- Skiff busy: seed 4, tick 22276. Enemy present, 2 fires, 1 breach, 1 shot in flight.
- Cutter busy: seed 1, tick 13137. Enemy present, 2 fires, 1 shot.
- Skiff late: seed 3, tick 50585, sector 2, reached by the bots with no help.
- Cutter late: seed 1, tick 52469, sector 2. **The hull was refilled every tick to get there**, because no Cutter seed from 1 to 30 reached sector 3 with the bots unaided.

`NM\measure-size.ts` encodes each `flatten()` output six ways:
- **f64**: raw Float64Array bytes.
- **json**: `JSON.stringify` of the value array.
- **lossless**: integers as zigzag varints; other values as a tag plus 8 raw bytes.
- **quant**: integers as varints; non-integers as fixed point at 1/256 resolution. This loses precision, so it is for display only and is not a checkpoint.
- **deflate** (raw deflate, level 9) of f64, lossless and quant.
- **gzip** of the JSON.

Sizes are in bytes.

| Ship / state | values | f64 | f64+deflate | json | json+gzip | lossless | lossless+deflate | quant | quant+deflate |
|---|---|---|---|---|---|---|---|---|---|
| Skiff quiet | 630 | 5040 | 351 | 1546 | 283 | 762 | 266 | 705 | 238 |
| Skiff busy | 630 | 5040 | 736 | 2030 | 598 | 985 | 601 | 788 | 448 |
| Skiff late | 630 | 5040 | 642 | 1852 | 506 | 902 | 530 | 769 | 398 |
| Skiff busyMax | 630 | 5040 | 799 | 2061 | 639 | 1013 | 641 | 802 | 486 |
| Cutter quiet | 773 | 6184 | 392 | 1879 | 310 | 946 | 306 | 861 | 278 |
| Cutter busy | 773 | 6184 | 791 | 2377 | 637 | 1152 | 651 | 933 | 472 |
| Cutter late | 773 | 6184 | 769 | 2322 | 627 | 1116 | 639 | 947 | 483 |
| Cutter busyMax | 773 | 6184 | 838 | 2406 | 674 | 1172 | 684 | 946 | 511 |

The value count never changes during a run. Debris (8 slots), boarders (4), enemy rooms (5) and the run map are fixed-size pools (`sim/flatten.ts:9-17`). Only how well the state compresses changes, as more slots fill and more values become non-integers.

## 2. Client-visible projection

**Method.** Each flatten index was labeled with the source expression that writes it. `NM\gen-labels.mjs` generates `NM\labeled-flatten.ts` from `sim/flatten.ts`, with the same order and the same length (checked: 630 and 773).

The visibility test is `NM\hud-reads.ts`. For each value of the quiet, busy and late states, it:
1. perturbs the value (+1, 0↔1, +0.37, −1),
2. calls `unflatten`,
3. re-runs every pure presentation function: `buildHudModel`, `enemyWindowModel`, `consoles`, `roomIcons`, `shotResult`, `boarderMarkers`, plus a dump of the raw fields that the Pixi world layer reads (found by static grep of `render/*.ts`, because Pixi cannot run headless),
4. records whether the output changed.

This gives a **lower bound** on what a renderer reads: 229–289 values on the Skiff and 336–360 on the Cutter, per state. It is only a lower bound because some fields are read only in particular contexts. For example, `w.selector` matters only when someone sits at Weapons, `rn.vote` only during an event, and `en.shieldFreq` only after a scan.

The **projection** in the table below is therefore defined by hand as "everything except a hidden list" (`HIDDEN` in `NM\measure-size.ts`). It is cross-checked against the perturbation list: every label the perturbation found is in the projection.

Hidden fields:

| Hidden group | Values (Skiff / Cutter) | Why hidden |
|---|---|---|
| `rng.*` (7 streams) | 7 / 7 | They are the future. Anyone who has them can predict hazard, loot and combat draws. |
| `tm.*` telemetry | 57 / 63 | Statistics. The client needs them only at game over, and can get them as a single message then. |
| Director internals: `dr.phaseTick`, `nextStressTick`, `nextSpawnTick`, `budgetLeft`, `lastSpawnTick`, `lastType`, `sinceProductive` | 16 / 16 | Pacing internals. Note that `dr.phase` and `dr.stress` are **read by the HUD** (`render/hudModel.ts`), so they stay visible. |
| `rn.ambush`, `rn.cache` | 48 / 48 | Hidden map contents. Seeing them would be a cheat. |
| Timers and bookkeeping: `bd.nextArrivalTick`, `bd.nextMoveTick`, `bd.aloneSince`, `rn.fieldNextTick`, `rn.wakeTick`, `en.shieldRotateTick`, `doors.closeTimer`, `o2Counters`, skill stamps, `navSig`, `eventsSeen`, `startBonus`, `Stable.id`, `Life.reviverPid`, handshake constants | the rest | Not drawn. |
| `stick.heldDir`, `stick.repeat` | 4 / 8 | These are needed **only for prediction**. A client that predicts its own console cursor needs them; a pure-interpolation client does not. |

Sizes in bytes. The "HUD-read lower bound" row is the union, over the three states, of the labels the perturbation test found.

| Ship / state | visible values | f64 | f64+deflate | json+gzip | lossless+deflate | quant | quant+deflate |
|---|---|---|---|---|---|---|---|
| Skiff quiet | 457 | 3656 | 196 | 170 | 149 | 472 | 132 |
| Skiff busy | 457 | 3656 | 465 | 398 | 405 | 521 | 275 |
| Skiff late | 457 | 3656 | 361 | 301 | 300 | 507 | 218 |
| Skiff busyMax | 457 | 3656 | 525 | 430 | 447 | 531 | 308 |
| Cutter quiet | 571 | 4568 | 231 | 199 | 183 | 595 | 165 |
| Cutter busy | 571 | 4568 | 513 | 428 | 443 | 641 | 304 |
| Cutter late | 571 | 4568 | 468 | 401 | 413 | 649 | 283 |
| Cutter busyMax | 571 | 4568 | 559 | 458 | 475 | 650 | 336 |
| HUD-read lower bound (Skiff busy / Cutter busy) | 387 / 390 | 3096 / 3120 | 391 / 387 | 342 / 337 | 342 / 354 | 440 / 447 | 231 / 225 |

### Deltas between consecutive snapshots (busy window)

**Method** (`NM\measure-size.ts`). Start from the snapshot about 6 s before the busiest tick and run the bots for 60 s (3600 ticks), flattening every tick. At each send rate, compare snapshot *t* with snapshot *t − 60/Hz*. The packet is: a varint count of changed values, then a varint index gap and the new value for each change. Values are compared after quantizing, and the new values are quantized. "Full" deltas cover all values; "visible" deltas cover the projection only. Sizes are bytes per packet.

| Ship | Rate | visible changed (mean / p95 / max) | visible bytes (mean / p95 / max) | visible bytes/s per peer | full changed (mean / p95 / max) | full bytes (mean / p95 / max) | full lossless bytes (mean / p95) |
|---|---|---|---|---|---|---|---|
| Skiff | 10 Hz | 12.6 / 16 / 31 | 42.7 / 54 / 90 | 427 | 24.3 / 28 / 46 | 87.5 / 100 / 145 | 217 / 248 |
| Skiff | 20 Hz | 9.0 / 15 / 30 | 32.0 / 49 / 88 | 641 | 19.5 / 27 / 45 | 72.1 / 96 / 143 | 169 / 239 |
| Skiff | 30 Hz | 7.4 / 14 / 30 | 27.1 / 47 / 88 | 812 | 17.3 / 26 / 45 | 64.9 / 93 / 143 | 145 / 232 |
| Cutter | 10 Hz | 6.1 / 14 / 34 | 22.6 / 48 / 85 | 226 | 21.1 / 31 / 60 | 76.9 / 108 / 173 | 145 / 244 |
| Cutter | 20 Hz | 5.3 / 12 / 36 | 20.2 / 44 / 89 | 404 | 18.8 / 29 / 59 | 68.8 / 102 / 166 | 130 / 236 |
| Cutter | 30 Hz | 5.0 / 12 / 36 | 19.2 / 41 / 86 | 575 | 17.7 / 27 / 59 | 65.0 / 99 / 163 | 123 / 225 |

Deflating each delta on its own does not help: the deflated packets were the same size as the raw ones or larger. Do not compress per-packet deltas.

**Inferred bandwidth.** Visible deltas at 20 Hz to 3 peers come to 1.2–2 KB/s of payload from the host. Transport headers add more: about 40–60 B per packet for UDP, DTLS and SCTP on WebRTC, which is roughly 1 KB/s per peer at 20 Hz (inferred, not measured). Sending a full quantized visible **keyframe in every packet** with no deltas at all costs at most 650 B × 20 × 3 = 39 KB/s, about 0.31 Mbit/s.

Brief B's planning example assumed a "6 KiB update" and got 360 KiB/s. That is 10–20 times too high: the real full update is 0.3–0.65 KB.

## 3. CPU

**Method** (`NM\measure-cpu.ts`, Node 24). First a warm-up of 60 s of each ship's busy window. Then each call is timed on its own with `process.hrtime`, over 3600 ticks from each state, with the bots driving. Per-call timer overhead is about 0.1–0.3 µs and is included. All figures are µs.

| Ship / state | step med / p99 / max | bots, all crew, med / p99 | flatten med / p99 | unflatten med / p99 | hashState med / p99 |
|---|---|---|---|---|---|
| Skiff quiet | 4.5 / 19.1 / 228 | 1.2 / 5.3 | 6.8 / 35.1 | 11.0 / 25.2 | 10.9 / 47.5 |
| Skiff busy | 5.2 / 27.3 / 389 | 1.8 / 8.2 | 6.9 / 31.5 | 2.7 / 11.7 | 10.9 / 56.0 |
| Skiff late | 5.4 / 26.7 / 180 | 1.3 / 6.9 | 4.6 / 30.3 | 2.7 / 6.2 | 8.7 / 34.7 |
| Cutter quiet | 6.8 / 13.7 / 114 | 2.3 / 8.9 | 5.0 / 13.4 | 3.0 / 4.3 | 9.7 / 16.0 |
| Cutter busy | 7.2 / 15.9 / 136 | 3.5 / 17.8 | 5.0 / 8.7 | 3.0 / 3.9 | 9.6 / 12.8 |
| Cutter late | 7.0 / 21.6 / 172 | 3.3 / 19.1 | 5.0 / 18.9 | 3.0 / 4.5 | 9.7 / 27.9 |

### Rollback

**Method.** Record 60 s of the busy window, keeping the intents and a `flatten()` ring entry for every tick. Then, for 500 different ticks T: `unflatten(ring[T−N])`, step N ticks with the recorded intents, and compare the hash with the recorded hash for T. "With resave" also calls `flatten()` after every resimulated tick, which a real rollback ring must do.

| Ship | N ticks (ms at 60 Hz) | restore + resim, ms: med / p99 / max | with resave each tick, ms: med / p99 | hash matches |
|---|---|---|---|---|
| Skiff | 6 (100 ms) | 0.03 / 0.06 / 0.13 | 0.05 / 0.14 | 500/500 |
| Skiff | 12 (200 ms) | 0.05 / 0.09 / 0.13 | 0.09 / 0.17 | 500/500 |
| Skiff | 24 (400 ms) | 0.09 / 0.15 / 0.22 | 0.19 / 0.30 | 500/500 |
| Skiff | 60 (1 s) | 0.21 / 0.43 / 0.50 | 0.48 / 0.83 | 500/500 |
| Cutter | 6 | 0.05 / 0.13 / 0.21 | 0.08 / 0.21 | 500/500 |
| Cutter | 12 | 0.09 / 0.18 / 0.28 | 0.15 / 0.28 | 500/500 |
| Cutter | 24 | 0.19 / 0.36 / 0.43 | 0.30 / 0.57 | 500/500 |
| Cutter | 60 | 0.46 / 0.86 / 0.91 | 0.77 / 1.35 | 500/500 |

**Browser speed (measured as a by-product of section 4).** 2 × 54,000 ticks, with the bots and a hash every 60 ticks, took 0.38–0.50 s of wall time in every engine: Node, Electron, Chrome, Edge and Firefox, on the main thread or in a Worker. That is about 4 µs per tick, so browsers are no slower than Node. Node `--jitless`, the closest stand-in for a slow device, took 4.5 s, about 42 µs per tick. Even then, a 24-tick rollback would be about 1 ms (inferred).

### The module-global components (`sim/components.ts:2-13`) and what a restore needs

- `Position`, `Health`, `Life`, `Stable`, `Owner` and `Seated` are plain JS arrays, global to the module and indexed by entity id. Every world takes ids from one non-versioned index (`sim/state.ts:72-76`), so two states in one process get **different ids**.
- **Measured:** two live Skiff states in one process (crew eids 31–32 and 33–34) plus a third reference state (35–36) were stepped interleaved for 60 s. The final hash of state A equaled the reference **and** equaled a fresh run. So states in one process do **not** share crew positions.
- **Brief A's risk 1 ("two SimState objects share crew positions") is wrong.** Its advice still holds, for a different reason: keep the rollback ring as Float64Arrays and restore into the one live state.
- **Restore = `unflatten(liveState, savedArray)`.** That function writes every component value for `s.crew` (`sim/flatten.ts:126-129`). Nothing else is needed:
  - `scratch` is cleared at the top of every step (`sim/step.ts:31`), and `injectionScratch` is written and read within one hazard tick.
  - Crew entities are never added or removed after creation. Boarders and debris are slots, not entities.
  - `Owner.pid` is not flattened, but it is constant.
  - The resimulation matched in 500/500 trials per N, and the late-run save→load→continue test matched (section 6).
- **Leak (measured).** Entity ids are never recycled. Creating 2000 Cutter states grew `Position.x` from 39 to 8039 entries, and each `createSimState` costs 0.038 ms. This doesn't matter for a client. A long-lived dedicated server that runs many sessions in one process grows by 4 ids × 7 arrays per run. That is small but unbounded, so use one worker or process per run, or recycle ids.

## 4. Determinism

### Across processes, JIT tiers, V8 versions and engines (measured)

**Method.** `NM\det-core.ts` uses no Node APIs:
- Seed 11. Player 0 follows a **seeded script that does not depend on the state**: a held stick in one of 8 directions at analog magnitude 0.4–1.0, changed every 10–60 ticks; `interactHeld` 30% of the time; random Interact, Confirm and Cancel presses (Confirm on 3% of ticks).
- The other crew are bots. Their input is a function of the state, so any divergence in the state also changes their inputs.
- 15 minutes of sim (54,000 ticks) per ship, with `hashState` every 60 ticks. When a run ends, a new run with seed + 1000 is chained on, so every tick simulates something.
- All 900 hashes per ship were distinct.

The same file is bundled with esbuild:
- as CommonJS for Node: `NM\det-node.ts` → `det-node.cjs`;
- as an IIFE for browsers: `NM\det-browser.ts` → `det-browser.js`. The browser bundle runs on the page's main thread, then **inside a dedicated Web Worker** loaded from the same bundle, and POSTs both results to `NM\det-server.cjs`, which launches the headless browser.

`NM\det-compare.cjs` compares every result with `det/node-a.json`.

| Run | Engine | Skiff | Cutter |
|---|---|---|---|
| node-a, node-b (two concurrent processes) | Node 24.18 / V8 13.6 | 900/900 equal | 900/900 equal |
| node `--jitless` (interpreter only) | V8 13.6 | 900/900 equal | 900/900 equal |
| node `--no-turbofan --no-maglev` | V8 13.6 | 900/900 equal | 900/900 equal |
| Electron 37.10.3 as Node | V8 13.8 (a different V8) | 900/900 equal | 900/900 equal |
| Chrome 157 headless, main thread + Worker | V8 | 900/900 equal (both) | 900/900 equal (both) |
| Edge 157 headless, main thread + Worker | V8 | 900/900 equal (both) | 900/900 equal (both) |
| **Firefox 160 headless, main thread + Worker** | **SpiderMonkey** | **900/900 equal (both)** | **900/900 equal (both)** |

**Not tested, and not testable on this machine:**
- Safari or JavaScriptCore (macOS or iOS browsers).
- ARM64 CPUs (Apple Silicon, Snapdragon laptops), other x86 vendors, and Linux or macOS builds of the same engines.
- Soaks longer than 15 minutes.
- Human input patterns, such as fast stick reversals or presses on the exact tick a row list changes.

### Why the results are expected (from code reading)

The sim and `shared/` use only `Math.floor`, `ceil`, `round`, `min`, `max`, `abs`, `sign`, `imul` and `sqrt`. All of these are exactly specified by IEEE-754 and ECMAScript. Counted occurrences: floor 39, max 49, min 41, round 16, abs 10, ceil 6, imul 5, sqrt 6, sign 1.

`Math.sqrt` sites (correctly rounded, so safe):
- `sim/bot.ts:121`
- `sim/director.ts:59`, `sim/director.ts:84`
- `sim/interact.ts:31`, `sim/interact.ts:49`
- `shared/intent.ts:22`

Results of the grep for nondeterminism:
- **Not found anywhere in `src/renderer/src/sim/**` or `src/shared/**`:** `Math.sin/cos/tan/atan/atan2/asin/acos/pow/exp/log*/hypot/cbrt/sinh/cosh/tanh/expm1/log1p/random`, the `**` operator, `Date`, `performance`, `crypto`.
- **Sorts.** There are three, and each has a total-order comparator:
  - `sim/console.ts:129` (numbers, ascending)
  - `sim/interact.ts:118` (numbers, ascending)
  - `sim/debrisTargets.ts:30` (by StableId, then by `rank`)
- **Map/Set iteration** follows insertion order, and every insertion order is itself deterministic:
  - `sim/interact.ts:102`: `sitRequests` is iterated through a sort.
  - `sim/interact.ts:126,129`: `holders`/`teamed` are only looked up, never iterated in a way that affects state.
  - `sim/console.ts:73,130-132`: the door, door-cycle and airlock sets are applied in sorted order.
  - `sim/bot.ts:38,60,173,175,314`: BFS over sets built in tile order.
  - `sim/ship/derived.ts:31-62`: built from layout array order.
- **No `Object.keys/entries/values` or `for…in` over sim state.** `progress.ts:27` uses `UNLOCKS.forEach` over an array.
- **No module-level mutable state in the sim** except `SHARED_ENTITY_INDEX` (`sim/state.ts:76`). Its ids do not enter `flatten`.
- **Risks that remain** (inferred):
  1. Somebody adds a transcendental function later. Guard against this with a lint or a test that bans them in `sim/` and `shared/`.
  2. Analog stick doubles. `clampIntent` divides by a sqrt (`shared/intent.ts:22-23`). That is exact given identical inputs, so the doubles must cross the wire **bit-exact**. Quantize them, or send them as Float64.
  3. A different `layout` JSON or a different SIM_VERSION. `unflatten`, `loadSnapshot` and `runReplay` already refuse these.
  4. `createSimState` options. `characters` and `unlocked` change the initial state but are not in `Replay` (`sim/replay.ts:10`), so the network "start" message must carry `seed`, `layoutId`, `playerCount`, `characters` and `unlocked`.

## 5. Inputs: what is held, what is a press, and what depends on context

### Intent fields (`src/shared/intent.ts:4-11`; wire form `CompactIntent` `[moveX, moveY, bits]`, `sim/replay.ts:9-15`)

| Field | Kind | Meaning |
|---|---|---|
| `moveX`, `moveY` | **held**, analog | Walking (`movementSystem`). While seated, the **sim** turns it into cursor edges with its own repeat timer (`console.ts:23-33`: threshold 0.5, repeat every 8 ticks, `tuning.ts:54-55`, and state `stick.heldDir/repeat` is in the snapshot). How many cursor steps happen depends on **how many ticks** the stick is held. |
| `interactHeld` | **held** | Repair, extinguish, revive, fight, carry or deliver a torpedo. The sim picks the target from position (`interact.ts:38-80`). |
| `interactPressed` | **edge** | When seated: stand up (`console.ts:118`). |
| `confirmPressed` | **edge** | Heavily context-sensitive (see below). |
| `cancelPressed` | **edge** | When seated: stand up. |

`app/intents.ts:10-34` queues edges so that every press arrives on exactly one tick.

### Actions whose meaning depends on UI or cursor state (all decided inside `step()`)

1. **Standing Confirm** (`interact.ts:108-114`) is checked in priority order:
   - an open event makes it a **vote press**, which cycles your vote (`vote = (vote+1) % n`, `run.ts:346`);
   - else a pending jump makes it a **jump agreement**;
   - else it toggles the **nearest door**;
   - else it **sits** at the nearest console in your room.

   If an event opens or a jump becomes pending between the moment a player pressed and the tick the press lands, the press turns into a different action. Because vote presses are **relative**, a duplicated or dropped press changes the vote.
2. **Seated Confirm at another station during an event or pending jump** is consumed as a vote or an agreement (`interact.ts:107-109`, `confirmUsed`).
3. **Navigation** (`run.ts:203-216`). The cursor is a **row index** into `navRows(state)`, and that list changes with the event, the shop stock, scrap, fuel, the drive charge and the reachable beacons. Confirm on the row means vote for a choice, buy an item, jump to a beacon, take the sector exit, wait, or evade. `trackNavCursor` (`run.ts:191-200`) moves the cursor to follow its row when the list changes, but a press timed against a list the player saw a moment earlier can still land on another row.
4. **Weapons** (`weapons.ts:154-168`). Up/Down cycles the target through `warnedTargets(state)` (+ the cargo-swap row), and that list changes as shots and debris arrive or leave. Left/Right cycles the weapon selector. Confirm fires the selected weapon at the cursor target, or swaps cargo.
5. **Science** (`science.ts:73-84`). The cursor is a target id or −1 (the system row). Confirm starts a scan, a system scan, or a frequency lock, depending on the target and whether it was already scanned.
6. **Engineering** (`console.ts:39-61`). Rows are fixed station kinds plus UPGRADES. Left/Right shifts power at once, on every edge. Confirm cycles coolant or opens the upgrades page. On the upgrades page the rows come from `upgradeRows(state)`, which depends on scrap and levels, and Confirm buys or goes back.
7. **Doors console** (`console.ts:63-75`). The cursor walks a static door and airlock list. Confirm cycles a door or toggles an airlock when the console is online; when it is offline, it only toggles the seal.
8. **Console group tabs** (`console.ts:94-105`). Up on the first row enters the tab bar, and Left/Right switches tabs. Whether you are "on the first row" depends on the list contents.

### Estimated semantic command set

These commands would replace cursor + Confirm. **About 22 kinds:**
- move order (tile), or keep the held stick
- sit(station)
- stand
- toggleDoorLocal(edge)
- doorCycle(edge)
- airlockToggle(idx)
- power(station, ±1)
- coolant(station)
- buyUpgrade(station)
- buyReactor
- selectWeapon(selector)
- fire(selector, target)
- swapCargo
- scan(target)
- systemScan
- lockFrequency
- vote(event, choice)
- jumpAgree(pending)
- buy(item)
- jump(beacon)
- sectorJump
- wait
- evade
- (tab(group, tab), page changes and cursor rows can stay client-only UI state)

All of these fit in `[kind, a, b]` small integers.

**Inferred.** Under Brief A's exact input frames, context does **not** cause desyncs: every machine applies the same frame on the same tick. But Brief A also lets the host push a late input to a later tick (Brief A §1, row D). At that point, delayed context-sensitive presses carry the same misapplication risk as in Brief B. So semantic commands are worth doing under **either** design. The held-stick cursor edges (item 3 of the risk list above, `stick.repeat`) are the worst case: a stick hold stretched or squeezed by network jitter moves the cursor a different number of rows than the player saw locally.

## 6. Re-host checkpoint (owner decision: a host leaving pauses the run and saves it for re-hosting)

**Method** (`NM\measure-size.ts`): `saveSnapshot(lateState)`, measured as JSON, gzip, lossless binary and lossless + deflate. The JSON is then parsed again, `loadSnapshot(layout, …)` is called, and both copies are stepped 30 s with the bots and compared.

| Ship (late, sector 3) | JSON | JSON+gzip | lossless binary | lossless+deflate | load + 30 s continue = uninterrupted |
|---|---|---|---|---|---|
| Skiff | 2345 B | 839 B | 902 B | 530 B | **yes** (hash equal) |
| Cutter | 2815 B | 968 B | 1116 B | 639 B | **yes** (hash equal) |

What is in the snapshot and what is not:
- The checkpoint carries characters (`crewCharacter`), unlock bonuses (applied into the state), the quirk, the map and RNG. `loadSnapshot` needs only the layout and the snapshot (`sim/snapshot.ts:28-36`).
- **Not in it:** callouts, audio-cue counters, the crash/replay buffer, and the progress store (`app/session.ts:57,120,132`). The SIM_VERSION and layout must match exactly (`snapshot.ts:31-34`).
- One checkpoint under 1 KB compressed can be sent to every peer every few seconds at negligible cost (inferred). That makes "any remaining player can re-host" cheap. A friend-host already sees the full state, so this reveals nothing new.

## 7. Clock, loop and what a headless authority needs

### How ticks are scheduled today

- `main.ts:57`: Pixi's ticker (requestAnimationFrame) calls `session.frame()` once per display frame.
- `session.ts:98`: the frame delta is clamped to 250 ms.
- `session.ts:115` → `loop.ts:6-11`: a fixed-step accumulator runs at most `MAX_TICKS_PER_FRAME = 5` ticks per frame (`loop.ts:3`). On a long frame it **throws away the backlog** (`loop.ts:9`: slow motion instead of catching up).
- Input is sampled once per frame from devices (`session.ts:103`, `deviceManager`), and the frame's presses are queued one per tick (`intents.ts:14-33`).
- `recordPrev` runs before every tick for interpolation (`session.ts:118`). A crash baseline is saved every 300 ticks (`session.ts:120`). Cues are counter diffs computed once per frame (`session.ts:132-134`). Callouts are app state (`session.ts:57,137`).
- **Pause:** window blur, `visibilitychange` to hidden, and the OS suspend IPC all pause the run (`main.ts:52-56`). Resume needs a Confirm while focused (`session.ts:101`, `canResume`).

**Inferred, not measured here.** requestAnimationFrame stops in hidden tabs and minimized windows. An authority whose clock is the render loop therefore stops whenever the host's window is hidden, so the authority clock must come from somewhere else. In a browser, a dedicated Worker driven by a timer is the usual answer. How much browsers throttle timers in hidden tabs and in workers was **not measured**, and needs a spike.

### Import inventory (measured)

- **The sim is pure.** `src/renderer/src/sim/**` imports only `src/shared/*` and the npm packages `bitecs` and `zod` (zod is used in `sim/ship/schema.ts:1`). A browser IIFE bundle of the sim (`NM\det-browser.js`, 360 KB unminified, including zod) has **zero `require` calls**, and it ran in Chrome, Edge and Firefox **Web Workers** with hashes identical to Node (section 4). Each worker has its own module instance, and therefore its own component arrays and entity index.
- **`app/session.ts` runs headless in Node** (`NM\headless-session.ts`), with `renderer: null`, `hud: null` and a fake clock. Everything it imports is pure: `render/hudModel.ts`, `render/calloutModel.ts`, `input/deviceManager.ts`, `app/audioCues.ts`, `app/intents.ts`, `app/loop.ts`.
  - It is still the wrong entry point for an authority. It is driven by local devices and lobby phases, it drops backlog, it builds the HUD every frame, and it treats pause as focus loss.
  - The authority needs a new `TickDriver`: `createSimState(layout, n, seed, characters, {unlocked})`, then `step(state, intents)` on its own clock, then snapshot, hash, the crash ring, and the end-of-run telemetry and progress hooks. Its intents come from the network, not from `deviceManager`.
- **Must stay out of an authority** (these use DOM, Pixi, WebAudio or navigator):
  - `main.ts`
  - `render/renderer.ts`, `render/hud.ts`, `render/assets.ts`, `render/tiles.ts`, `render/crewSprites.ts`, `render/effects.ts`, `render/enemyWindow.ts`, `render/consoleLayer.ts`, `render/boarderLayer.ts`, `render/callouts.ts`, `render/mapPanel.ts`, `render/panel.ts`, `render/projectiles.ts`, `render/roomIcons.ts`, `render/torpedoLayer.ts`
  - `input/sources.ts` (keyboard events, `navigator.getGamepads`)
  - `app/audio.ts` (AudioContext)

### Electron and Node dependencies a browser build would lose (owner decision: web build with cross-play)

| Where | Uses | Browser replacement |
|---|---|---|
| `src/main/index.ts` | BrowserWindow, Menu, F11 fullscreen, `powerMonitor` suspend/resume | Fullscreen API; `visibilitychange`/`pagehide` (there is no OS-suspend event) |
| `src/preload/index.ts` | `contextBridge` + `ipcRenderer` for `app:suspend`/`app:resume` | It is used only optionally (`window.ftlite?.…`, `main.ts:55-56`), so it already degrades gracefully. |
| `render/assets.ts:37-44` | XHR fallback for `file://` | Not needed over http(s). It is harmless. |
| `localStorage` (`main.ts:43-46`) | crash, telemetry, progress | Works in a browser (per origin). |
| **Brief A Phase 1 transport** | WebSocket *server* in the main process plus UDP broadcast (`dgram`) | **Impossible in a browser**: a page cannot listen on a socket. A browser host needs WebRTC data channels, which Electron's Chromium also has, or a relay server. That makes Brief A's Phase 1 transport Electron-only. For cross-play the common transport has to be WebRTC (+ TURN) or a WebSocket relay. |

The renderer source has no `node:`, `fs`, `path`, `electron`, `require(` or `process.` references (grep, 0 hits). Build-time scripts (`scripts/*.ts`, credits generation) use `fs`, but they never ship.

**Partial check.** I served the built `out/renderer` over http and opened it in headless Chrome and Firefox (`NM\serve-out.cjs`). The page script ran: it fetched the manifest and requested art files, and the requests for 7 optional art PNGs got 404s from this `out/` build. The screenshots were black because headless WebGL is limited in this environment, so this is **not** proof that the game renders in a browser. A real headed browser check is still needed.

## 8. What the numbers say about Brief A and Brief B

**What was measured:**
1. **Bandwidth does not separate the two designs.** Brief B's snapshot replication costs at most 0.4–0.8 KB/s per peer at 20–30 Hz with deltas, and about 13 KB/s per peer if you sent a full visible keyframe in every packet with no deltas at all. Brief A's input frames cost a few hundred B/s. Both are far below any home connection. Brief B's 360 KiB/s planning figure came from a 6 KiB update; real updates are 20–90 B deltas, or 0.3–0.65 KB keyframes.
2. **Rollback is cheap.** A 24-tick (400 ms) rollback costs ≤ 0.36 ms p99, or 0.57 ms with resaving. A 60-tick (1 s) rollback costs ≤ 1.35 ms. At about 4 µs per tick in browsers, a 16.7 ms frame could absorb around 1000 ticks. **CPU is not a reason to defer whole-world rollback** (Brief B's "Defer" row). One correction: Brief B's "predict only owned movement" is no cheaper than predicting the whole world, because the full `step()` costs only 5–7 µs.
3. **Lockstep-style determinism holds on identical builds, and beyond them.** It held across processes, across V8 JIT tiers including the interpreter, across two V8 versions (Node 24 and Electron 37), in Chrome, Edge and Firefox/SpiderMonkey, and inside Web Workers: 1800 per-second hashes per configuration, all equal. This removes the main stated risk of Brief A for **Windows x64 Electron ↔ Chromium/Firefox web** cross-play.
4. **The full state is small enough to resync on any mismatch.** A full state is ≤ 0.85 KB compressed and a re-host checkpoint ≤ 1 KB, so Brief A's "hash every 60 ticks plus snapshot resync" safety net costs almost nothing. The same cost is also all Brief B needs to send every client the full state, if hiding information doesn't matter. With friends-only invites, it doesn't.
5. **Brief A's isolation claim is wrong** (section 3). Two states in one process do not interfere. This doesn't change either design. The real issue is that entity ids are never recycled, which matters only for a long-lived multi-run server.

**Inferred:**
- Both designs are viable on cost. The choice comes down to:
  - (a) how well determinism survives platforms not tested here: **Safari/JavaScriptCore and ARM**. If the web build must support Safari or iPad, run `NM\det-browser.js` there before committing to A.
  - (b) complexity. Brief A reuses `step`, `flatten`, `unflatten` and `hash` as they are, and needs a predicted-vs-confirmed event layer for audio and callouts. Brief B needs a projection schema, a client presentation model that the HUD can read (today the HUD calls sim helpers on a full `SimState`, for example `navRows` and `warnedTargets`, so a Brief B client would really receive the full state or a fake `SimState`), an interpolation layer, and a separate movement predictor.
  - The measured sizes make a **hybrid** cheap. Clients run the full sim with prediction and rollback, as in Brief A. The host also sends periodic full-state keyframes of about 0.6 KB, a little like Brief B. A mismatch never lasts more than one keyframe.
- **Semantic commands** (section 5) are needed under both designs, wherever the host can move an input to a different tick than the one the player aimed for.
- **The clock has to move off requestAnimationFrame under both designs.** In a browser host, the authority belongs in a Worker; this is shown to work for the sim itself, but timer throttling was not measured.

**Not testable on one machine:** cross-OS and cross-CPU determinism (ARM64, macOS, Linux), Safari/JavaScriptCore, real network latency, jitter and NAT behaviour, transport header overhead, and how hidden-tab throttling affects a Worker-hosted authority.

## Scripts (all in `C:\Users\djuar\AppData\Local\Temp\claude\86da55dbee83ee65\b0d62506-f1e2-4b2f-8539-6778ff35b15b\scratchpad\netmeasure\`)

Run the `.ts` scripts from the repo root with `node --import tsx <path>`.

| Script | Purpose |
|---|---|
| `common.ts` | Ship loading, bots, encoders (lossless and quantized varint, delta, deflate, gzip), the busyness score |
| `find-states.ts` → `states.json` | Bot-driven quiet, busy and late states per ship (plus the pre-busy snapshot) |
| `gen-labels.mjs` → `labeled-flatten.ts` | A label for every flatten index (a generated copy of `sim/flatten.ts`) |
| `hud-reads.ts` → `hud-reads.json` | Perturbation test: which values the HUD and presentation models depend on |
| `measure-size.ts` → `sizes.json` (`show-sizes.cjs` prints it) | Sections 1, 2 and 6: full, visible and HUD sizes, deltas at 10/20/30/60 Hz, the re-host checkpoint |
| `measure-cpu.ts` → `cpu-node.json` | Section 3: step, bots, flatten, unflatten, hash, rollback; two-state isolation; entity growth |
| `det-core.ts`, `det-node.ts` (→ `det-node.cjs`), `det-browser.ts` (→ `det-browser.js`), `det-server.cjs`, `det-compare.cjs`, results in `det/*.json` | Section 4: determinism across processes, engines and Workers. Bundled with `node_modules/.bin/esbuild`. Electron run: `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe det-node.cjs <out>` |
| `headless-session.ts` | Section 7: `app/session.ts` runs under plain Node |
| `serve-out.cjs` | Section 7: serves the built `out/renderer` for the browser boot check |
