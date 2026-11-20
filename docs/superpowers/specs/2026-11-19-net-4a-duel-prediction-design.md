# Net-4a design: the duel client predicts by re-simulation

Date: 2026-11-19. Status: the owner ordered it in conversation ("ok do it", after the prediction and asteroid-physics cross-check) and took every recommendation of §8 ("take recommendations"). Not yet planned or built. Build on master after Asteroids-iii merges; nothing here depends on its rules.

## 1. Why

**Today.** An online duel client (the host's own window too) draws the authority's confirmed state one publication gap behind. What a player presses shows after the round trip plus at least 50 ms. A lost update freezes the picture until the next one. Three hand-written local guesses cover the worst of it: the crew Helm's throttle ramp and axes (`onlineSource.ts`), and the "in flight" holds for throttle, heading and the two weapon modes (`onlineDuel.ts`).

**The decision already made.** The networking decision record (Net-0, 2026-11-13, §3.4) chose prediction by re-simulation as milestone Net-4: the client keeps the latest authoritative state, replays its own unacknowledged inputs with the real step, and draws the result. It was never built for the duel.

**The physics direction.** Asteroids-iii (orbital gravity, bursts, billiards with real mass) and Asteroids-iv (rocks of cells and bonds) raised the worry that the simulation becomes too chaotic to predict. Measured, the opposite holds (§2): the rocks are the part that is never mispredicted, and it is the current "send every value, draw it late" approach that the rocks strain.

**Goal.** Your own ship, character and console answer on the next tick at any ordinary internet latency, the picture keeps moving through lost updates, and no simulation rule, golden hash or `SIM_VERSION` changes.

## 2. What was measured

Method: a scripted two-seat duel on the built Asteroids-iii branch (`spike/asteroids-iii` at 10abaa08, SIM 61, 3,900 state values), 3,600 ticks after the opening. At every third tick the state was saved; a copy was restored and stepped ahead with the real `stepDuelTick`, given only what one seat's client could know: its own inputs on every tick, and its partner's held input as of the saved tick. The result was compared value for value with what the authority reached. Node on the owner's desktop. "Busy" forces the biggest rail rocks to burst every 10 s. Packet sizes are estimated from the count of values that changed in three ticks (12 bytes each, plus today's fixed 734 bytes), not captured from a link.

| Run | Free rocks (mean) | State packet today, median / max | One tick, median / p99 |
|---|---|---|---|
| Quiet | 30 | 2.6 KB / 3.3 KB | 0.070 / 0.21 ms |
| Busy, 3 bursts per 10 s | 127 | 8.1 KB / 10.2 KB | 0.044 / 0.12 ms |
| Busy, 6 bursts per 10 s | 166 | 10.6 KB / 11.6 KB | 0.042 / 0.14 ms |

| Seat, 200 ms ahead (12 ticks) | Exactly right | Own-ship error when wrong, p95 / max | Rocks wrong |
|---|---|---|---|
| Helm | 96.7 to 96.8% | 0.00 / 0.00 u | none |
| Weapons | 67 to 81% | 0.14 to 0.19 / 0.44 u | none |
| Weapons, partner's held input not known | 0.1 to 8.6% | 0.37 to 0.53 / 0.67 u | none |

What it shows:

1. **No rock was ever misplaced or wrongly broken**, in any run, at 100, 200 or 300 ms. The sim is deterministic, so the same state and the same inputs give the same rocks however chaotic the billiards are, and each publication resets the client to the truth, so nothing compounds. Rail rocks are a pure function of the tick and cost nothing.
2. **A prediction is wrong only when the partner changed an input inside the window.** The miss rate tracks that rate (Helm 3 to 4%, Weapons 19 to 33% at 200 ms), and the error is small: at 300 ms the own-ship p95 is 0.6 u and the worst seen 1.5 u, against rocks 13 to 60 u in radius.
3. **The client must be told every player's held input.** Without it the Weapons seat is right 0.1% of the time, because the snapshot does not carry what the Helm is holding.
4. **It is cheap.** Restoring a state in place takes 0.2 ms, hashing it 0.07 ms, and restore plus 12 ticks 0.6 ms at the median and 0.9 to 1.4 ms at p99, with up to 214 live rocks.
5. **The rocks strain the current approach, not prediction.** With 130 to 170 free rocks a state packet is 8 to 11 KB, twenty times a second. Each is split into seven to ten datagrams and lost whole if one is dropped, and today a lost update freezes the view.

Limits: the players were scripted (they seldom shoot rocks on purpose or ram), the timings are Node on a desktop (a laptop browser is expected to be 2 to 5 times slower), and the earlier run on master's Asteroids-ii billiards gave the same picture.

## 3. Design

### 3.1 Two states on the client

- **Confirmed** (`C`): the stream client's replica, exactly as today. Nothing about accepting, checking or acknowledging publications changes.
- **Predicted** (`P`): a second `DuelState`, owned by a new headless module, `clientControl/duelPredictor.ts`. It is the confirmed state stepped ahead to "now" with the real `stepDuelTick`. The scene draws `P`.

The predictor knows nothing of Pixi or the network. It is given publications and this seat's inputs and gives back a state, so it is tested headless.

```ts
interface DuelPredictor {
  /** A publication was applied to the confirmed replica. */
  confirm(publication: DuelPublication): 'verified' | 'resimulated' | 'reset';
  /** One local tick with this seat's input; false when at the cap (it did not step). */
  tick(entry: LocalInput): boolean;
  state(): DuelState | null;
  stats(): PredictionStats;
  dispose(): void;
}
interface LocalInput { heldSequence: number; held: HeldInput; commands: readonly CommandEnvelope<DuelCommand>[] }
```

### 3.2 The publication carries every player's held input

`PublishedState` gains `held: HeldInput[]`, one per player: the held input the authority has latched when the publication is made. It is what its last tick used and, until a newer frame arrives or the 250 ms expiry clears it, what its next tick will use. The authority core already keeps this array and writes it into checkpoints.

- The field is in the shared core, so both modes' publications and both codecs' schemas gain it. The sector client ignores it.
- It rides in the image metadata (the JSON part of each state packet), about 45 to 110 bytes a player. That adds to a packet already over one datagram; moving it into the delta-coded numbers belongs to the wire-format change (§5).
- This changes the wire: the duel's `schemaVersion` goes 2 to 3 and the sector's 1 to 2, so mixed builds refuse each other at the handshake as they do today.

### 3.3 Local ticks and the input log

The session's pump today is a timer chain (`schedule(1000 / 60)`), which runs a little under 60 Hz in a browser. Stepping `P` once per timer call would run the world slow and then jump. So:

- The session keeps a **local tick** driven by elapsed time, 60 a second, as the authority's tick driver does. A late timer runs the ticks that are due, at most 4; any beyond that are dropped and the predictor realigns at the next publication (§3.4).
- Each local tick samples this seat's input (the first due tick takes the key presses, later ones repeat the held keys), sends its commands and one held frame as now, appends a `LocalInput` to the **input log**, and calls `predictor.tick`.
- `tick` steps `P` once with `held` = the latest publication's `held`, with this seat's entry in its own slot, and `commands` = that entry's commands with `requestedTick` set to `P`'s tick (the authority restamps them the same way).
- After each step the predictor records, per tick, the inputs it used, and on ticks where a publication can fall (every third tick) the hash of `P` (`hashF64(flattenDuel(P))`, the same values a publication hashes).

`setPaused`, `rematch` and `presence` are never predicted: they go to the authority only.

### 3.4 When a publication arrives: verify, else re-simulate

For a running publication at tick `T` with `heldHighWater h` and `commandHighWater c` for this seat:

1. **Trim the log.** Entries with `heldSequence <= h` are dropped. Commands with sequence `<= c` are removed from the entries that hold them (their effect, or their refusal, is in the confirmed state). The entries left are the unacknowledged ones, `N` of them: the **lead**.
2. **The inputs it would use now.** Tick `T + j` uses `publication.held` with this seat's slot from the j-th unacknowledged entry and that entry's commands; past the last entry, the last entry's held input and no commands.
3. **Verified.** If the recorded hash of `P` at `T` equals the publication's hash, and the inputs `P` actually used for every tick after `T` equal (by content) the inputs of step 2, and `P`'s tick is within 2 of `T + N`, then `P` is already what a re-simulation would produce. It is kept untouched.
4. **Re-simulated.** Otherwise (a mismatch, or no hash recorded for `T`) `P` is restored in place from the publication's snapshot (`restoreDuelSnapshot`) and stepped to `T + min(N, PREDICT_MAX_TICKS)` with the inputs of step 2. This also realigns the lead after a latency change or a stalled tab.

Constants: `PREDICT_MAX_TICKS = 30` (500 ms; today's `UNACKED_MAX`). `P` is never more than that many ticks past the confirmed tick.

Reset (`P` reloaded from the snapshot, the log and the records cleared, no stepping until a running publication):

- the replica was replaced (a new round's seed or a new layout);
- the publication's phase is not `running`, or its `controlRevision` changed (a pause or a resume);
- the confirmed round is decided (the end card): `P` is `C` until the rematch;
- the link closed (the frozen copy is drawn, as today).

### 3.5 Lost updates

`P` keeps stepping on its own while it is within `PREDICT_MAX_TICKS` of the last confirmed tick. At a 150 ms lead that is about 350 ms, seven lost updates in a row, with the picture still moving. Past the cap `tick` returns false and the view holds, as it does today after one loss. State deltas are already built against the last acknowledged image, so nothing needs resending.

### 3.6 What is drawn from which state

| On screen | From |
|---|---|
| Ships, torpedoes, rounds, rocks, this seat's own character, camera follow targets | `P`, blended between its last two local ticks, as Single player draws |
| Console read-outs: throttle, heading hold, weapon modes, charge, magazine, power, doors, the seat you occupy | `P` (your own command shows on the next tick) |
| Hull, shields, room levels, fire, oxygen, crew health | `P` |
| Other players' characters | `C`, interpolated one gap behind, as today (Net-0 §3.4) |
| Round outcome, end card, round record, pause banner, phase | `C` and the publication |
| Beams, hit flashes, missile endings, contact sparks and their sounds | confirmed counters, as today (§3.7) |
| Continuous sounds from state (engine, vent hiss) | `P` |
| Cues, pings, command results and refusals | the authority's stream, as today |

One timeline for the ship world: the Weapons player's view is the ship the Helm flies, so drawing "other players" late there would put the player's own ship in the past while the rocks ran ahead. The partner's steering is carried forward from `held` and corrected each publication (the 0.2 to 0.6 u of §2). Other players' characters are different: carrying a walk forward overshoots by up to half a tile every time they stop, they touch nothing physical, and Net-0 already says to interpolate them.

### 3.7 Effects stay on confirmed state

Beams, hits, missile endings and sparks keep coming from the confirmed counters (`gapEvents`), so an effect never shows for something that did not happen. One change: an effect tied to a ship is drawn at that ship's predicted position, not its confirmed one, or the beam would start behind the hull by the lead's travel.

The case to know about: a rock breaks in `P` because of a hit the partner's last-moment input then averts (a late swerve away from a ram, a MANUAL torpedo steered off). The pieces show for at most the lead (about 150 ms) and the rock comes back. It never occurred in the measured runs. Nothing irreversible (a sound, a flash, the end card) is ever played from `P`.

### 3.8 Corrections are not smoothed, yet

The measured corrections are under a unit at p95, below a pixel at the map's usual zoom, so a re-simulation simply replaces `P`. The playtest record measures the real figure (§3.10). If two humans produce visible pops, the fix is a per-body visual offset (shown position minus new position) that decays over 100 ms; it is not built until the measurement asks for it.

### 3.9 The hand-written predictions go

Once the predictor passes its gates, the session and the source read `P` and these are removed: `throttleSent`, `headingSent`, `laserModeSent`, `torpModeSent`, the `rampTicks(…, unackedFrames)` throttle ramp, the local `crewAxes` and vent, `unacked` and `UNACKED_MAX`. `P` holds every unacknowledged input already.

Kept: the always-send rule for shots (a press on a seemingly empty charge is sent anyway) and the authority's `unavailable` answer showing NO CHARGE. `P` is a better guess than the lagging replica, but the authority is still the judge.

### 3.10 Figures

- The F3 overlay gains: lead (ticks and ms), verified share, re-simulation time (p99), last correction size.
- The playtest record gains an optional `prediction` block: lead, verified share, own-ship correction p50, p95 and max, re-simulation p99. The record's `version` stays 1.

## 4. What rock work must keep true

Prediction rests on four properties the sim has today. Asteroids-iv and later rock work must keep them, and §6 pins each with a test.

1. **Restore, then step, is exact.** A state restored from a snapshot steps to the same values as the state it was saved from. Anything the step reads that is not in the snapshot must be rebuilt on restore or checked against its inputs on every read, as Asteroids-iii's rail memo and per-step table are.
2. **In-place restore covers every array.** Asteroids-iv's integer arrays (cell masks, bond health) need the same hash, snapshot and `restoreDuelSnapshot` support as the Float64 pool.
3. **What changes every tick is analytic.** Rail position is a function of the tick, so a rock on a rail costs no bytes and no error. Sim-side rotation in Asteroids-iv should be stored the same way (start angle, rate, start tick), not as an angle written every tick for every rock. Cell and bond damage changes only on hits and is cheap either way.
4. **The determinism guard stays** (+ − × ÷ sqrt only), with the cross-engine run.

## 5. Not in this change, and what comes next

- **The sector.** Only the duel predicts. The predictor is duel code; the sector gets its own when it is played online in earnest.
- **Net-4b, exact effects.** If each publication also carried the inputs the authority used since the last one, the client could replay the confirmed ticks exactly and take the sim's own per-tick events. Guests would then get rock break effects and exact room call-outs, and `gapEvents` could retire.
- **Net-4c, sending less.** Once every client simulates, the host can send only the values that differ from what the client computes for itself, and free rocks stop costing bytes. This is the answer to Asteroids-iii's own risk row ("debris in a lane band stays free, so deltas grow") and to the 8 to 11 KB packets of §2.
- **The wire format** (metadata resent in every packet, JSON held frames): still its own change, from the Perf-i audit.
- **Early effects for your own shots** and **lag compensation**: not needed for co-op at these latencies.

## 6. Tests and gates

New test rig: `tests/helpers/impairedLink.ts`, on `linkPair.ts`: a seeded delay, jitter and loss per direction on a fake clock (reliable packets are delayed, never lost), and an outage window. This is the latency and loss harness Net-0 asked of Net-4.

| # | Gate | Passes when |
|---|---|---|
| G1 | Exact when inputs are known | With the partner's input constant, `P` at every confirmed tick hashes equal to the publication, at 0, 50, 150 and 300 ms round trip and 0, 2 and 5% loss. |
| G2 | Restore, then step | From a snapshot at every third tick of a scripted duel, restore and 12 steps with the true inputs equals the straight run, on Node; the cross-engine run adds the same check on Chromium and Firefox. |
| G3 | Answers at once | A change in this seat's held input is in `P` on the next local tick at every round trip up to 500 ms. |
| G4 | Small corrections | Scripted pair, 50 to 200 ms round trip: own-ship correction p95 at most 1 u and max at most 5 u; this seat's own character is corrected by at most half a tile (Net-0's gate). |
| G5 | Rides out loss | 10% loss and one 300 ms outage: `P` never stops while within the cap, and the first publication after the outage corrects within G4's bound. |
| G6 | Affordable | In the Asteroids-iii stress rig (about 240 live rocks), Node on the owner's desktop: one local tick including its hash p99 at most 0.8 ms; one publication (verify, or restore and 12 ticks) p99 at most 4 ms; the verified share is reported. The host pays nothing new. |
| G7 | Nothing else moved | The full suite, `tsc -b`, the determinism run with no golden changed, `SIM_VERSION` unchanged, `npm run test:duel-app-runtime`. |
| G8 | Feels local | Owner playtest, two humans over the internet: F3 shows the lead, the verified share and the corrections; the record carries them. |

A measuring script, `scripts/measure-prediction.ts` (the method of §2 as a committed tool), prints the tables of §2 for the current tree.

## 7. Risks

| Risk | What holds it |
|---|---|
| Hidden state outside the snapshot makes a restored copy step differently | G2 fails at once; §4.1 is the rule. |
| An engine computes differently (Safari is untested) | Every publication then re-simulates: still correct and bounded, only slower, and the F3 verified share shows it. |
| A slow laptop | The verify path skips most re-simulations; G6 measures the worst case; `PREDICT_MAX_TICKS` bounds it. |
| A relative command (`shipPower`'s delta) applied twice | Commands leave the log by `commandHighWater`, which arrives in the same publication as the state that holds their effect. |
| A partner-caused change appears late | As today; no worse. Net-4b improves it. |
| A predicted break that is then averted | §3.7: at most the lead, never a sound or flash. |
| A hidden tab starves the timer | At most 4 local ticks per call, then a realign on return. |

## 8. The owner's decisions

Decided 2026-11-19: the owner took each recommendation.

1. **Duel only now.**
2. **Build after Asteroids-iii merges.** Asteroids-iii touches the online view, and the gates run against its rock pool.
3. **One timeline for the ship world, other players' characters interpolated** (§3.6).
4. **Effects on confirmation** (§3.7); early effects for your own shots are left for later.
5. **What follows.** Net-4b (exact effects, rock effects for guests), then the wire format, then Net-4c (sending less), unless a playtest shows packet loss hurting first, in which case Net-4c moves up.
