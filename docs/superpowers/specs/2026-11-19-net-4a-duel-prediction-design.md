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

Limits:

- The measurement placed the seat's own inputs on exactly the ticks the authority used them. A real link cannot (§3.4 step 2), so on a link a change in your own input can also cause a miss for one publication. The "exactly right" shares are therefore an upper bound.
- The players were scripted: they seldom shoot rocks on purpose or ram.
- The timings are Node on a desktop; a laptop browser is expected to be 2 to 5 times slower.
- The earlier run on master's Asteroids-ii billiards gave the same picture.

## 3. Design

### 3.1 Two states on the client

- **Confirmed** (`C`): the stream client's replica, exactly as today. The logic that accepts, checks and acknowledges publications is unchanged; only the publication's schema gains a field (§3.2).
- **Predicted** (`P`): a second `DuelState`, owned by a new headless module, `clientControl/duelPredictor.ts`. It is the confirmed state stepped ahead to "now" with the real `stepDuelTick`. The scene draws `P`.

The predictor knows nothing of Pixi, the network or the clock. It is given publications and this seat's inputs and gives back a state, so it is tested headless. `clientControl` is inside the deterministic module graph (`tests/boundary.test.ts`), where `performance` and `Date` are refused, so the predictor measures no time: the session times its calls to `confirm` and `tick` (§3.10).

```ts
interface DuelPredictor {
  /** A publication was applied to the confirmed replica. */
  confirm(publication: DuelPublication): 'verified' | 'resimulated' | 'reset';
  /** One local tick with this seat's input; false when it did not step (no running round, or at the cap). */
  tick(entry: LocalInput): boolean;
  state(): DuelState | null;
  /** Counts and sizes only: verified, re-simulated and reset publications, the lead in ticks, the last correction. */
  stats(): PredictionStats;
  dispose(): void;
}
/** `heldSequence` is the sequence of the held frame sent on this local tick, or null when none was sent. */
interface LocalInput { heldSequence: number | null; held: HeldInput; commands: readonly CommandEnvelope<DuelCommand>[] }
```

### 3.2 The publication carries every player's held input

`PublishedState` gains `held: HeldInput[]`, one per player: the held input the authority has latched when the publication is made. On a publication made right after a tick (every cadence publication is one: `executeTick` copies `held`, steps and publishes with no ingress between) it is what that tick used. Until a newer frame arrives or the 250 ms expiry clears it, it is what the next tick will use. A pause clears it before the pause is published. The authority core already keeps this array and writes it into checkpoints.

- The field is in the shared core, so both modes' publications gain it. Both codecs build their publication schema from one function in `net/codec.ts`: it gains `held`, an array of the held-input schema, and its refine checks that the array's length is the player count, as it does for the three watermarks. The sector client ignores the field.
- It rides in the image metadata (the JSON part of each state packet), about 45 to 110 bytes a player. That adds to a packet already over one datagram; moving it into the delta-coded numbers belongs to the wire-format change (§5).
- This changes the wire: the duel's `schemaVersion` goes 2 to 3 and the sector's 1 to 2, so mixed builds refuse each other at the handshake as they do today. Each version is written in two places that `createHostRuntime` compares, and both of a pair must move together or hosting itself fails: the duel's in `network/modes/duel.ts` and `DUEL_SCHEMA_VERSION` in `network/online/onlineDuel.ts`; the sector's in `network/modes/sector.ts` and the literal in `network/online/onlineSector.ts`.

### 3.3 Local ticks and the input log

The session's pump today is a timer chain (`schedule(1000 / 60)`), which runs a little under 60 Hz in a browser. Stepping `P` once per timer call would run the world slow and then jump. So:

- The session keeps a **local tick** counter driven by elapsed time, 60 a second, as the authority's tick driver does. A late timer runs the ticks that are due, at most 4; any beyond that are dropped (they get no number and no log entry) and the predictor realigns at the next publication (§3.4).
- Local ticks run, and `P` steps, whenever the confirmed publication is running and its round is undecided. That holds whether or not this seat is producing input, so an unfocused window's world keeps moving.
- Each local tick appends one `LocalInput` to the **input log** and calls `predictor.tick`:
  - **Producing** (today's conditions: focused, not blocked, synced, phase running): the tick samples this seat's input, sends its commands and one held frame as now, and logs the held input, that frame's sequence and the commands. When several ticks are due in one pump, the first takes the key presses and every once-per-pump step the pump has today (the leave prompt, the crew Helm's stale-key rule, the drained map requests, the ping); the later ones repeat the first's held input with no presses and no commands, and each still sends its own held frame.
  - **Not producing** (unfocused, blocked, not yet synced, or `client.held` returned null): the entry has neutral held input, no commands and a null sequence. The frames today's code sends in these states are logged with their sequences as neutral entries: the leave prompt's neutral frame, and the `neutralize` that `stopInput` sends.
- `tick` steps `P` once with `held` = the latest publication's `held`, with this entry's held input in this seat's slot, and `commands` = this entry's commands with `requestedTick` set to `P`'s tick (the authority restamps them the same way, and the step refuses most kinds stamped with another tick).
- Before every step, in `tick` and in a re-simulation alike, the bodies the view blends from are captured (§3.6), so after a re-simulation the blend runs between the last two ticks of the new chain.
- After each step the predictor records, per tick, the inputs it used, and on ticks where a cadence publication can fall (`tick % STATE_CADENCE_TICKS === 0`; the authority's tick and `P`'s share one numbering) the hash of `P` (`hashF64(flattenDuel(P))`, the same values a publication hashes).

`setPaused`, `rematch` and `presence` are never predicted: they go to the authority only.

### 3.4 When a publication arrives: verify, else re-simulate

For a running publication of an undecided round at tick `T`, with `heldHighWater h` and `commandHighWater c` for this seat:

1. **Anchor.** The newest log entry whose held sequence is at most `h` is the anchor: the authority is taken to have used it on tick `T`. The **offset** is `T` minus the anchor's local tick. When the log holds no such entry (the seat is not producing, or nothing new was acknowledged), the last offset is kept; after a reset it is set so that the newest local tick maps to `T` (no lead until the first anchor). Entries at or before the anchor's local tick are dropped. Commands with sequence `<= c` are removed from the entries that hold them.
2. **The inputs it would use now.** Tick `T + j` uses `publication.held` with this seat's slot from the entry of local tick `T + j - offset`, and that entry's commands. Past the newest entry it uses the newest entry's held input and no commands; with an empty log, `publication.held` as it stands.
3. **The tick to stand on.** The measured target is `T` plus the number of local ticks after the anchor's (the newest local tick minus `T - offset`). If `P`'s own tick is within 2 of it, `P`'s tick is the target: one tick of network jitter does not nudge the screen's clock. Either way the target is at most `T + PREDICT_MAX_TICKS`.
4. **Verified.** If the recorded hash of `P` at `T` equals the publication's hash, and the inputs `P` used for every tick after `T` equal (by content) the inputs of step 2, and `P` stands on the target, `P` is already what a re-simulation would produce. It is kept untouched.
5. **Re-simulated.** Otherwise (a mismatch, or no hash recorded for `T`) `P` is restored in place from the publication's snapshot (`restoreDuelSnapshot`) and stepped to the target with the inputs of step 2.

`P` and the measured target both advance once per local tick, so they move apart only when the anchor does; the 2-tick allowance cannot drift further, and a larger gap realigns in step 5.

**Step 2 is an estimate.** The authority does not apply held frames by tick: it latches the newest frame that has arrived and uses it until the next. The mapping is exact when one frame arrives per authority tick, and off by a tick or two when a held frame is lost, two frames arrive inside one authority tick, a tick runs with no new frame, the authority runs several ticks in one pump, or a command (reliable channel) arrives apart from the held frame sent beside it. The error matters only while this seat's input is changing, shows as a hash mismatch at the next publication, and is corrected there.

**The watermarks are exact only after a tick.** On a publication made right after a tick, every frame up to `h` has been latched for that tick and every command up to `c` has been executed or refused, so step 1 is right. The authority also publishes between ticks, reliably, when a seat attaches or a control is applied; those can count a frame or command it has admitted but not yet run. A pause or resume resets the predictor anyway (below). The attach broadcast while running is accepted as it is: `P` may lack this seat's just-admitted frame or command until the next cadence publication, 50 ms later, which corrects it.

Constants: `PREDICT_MAX_TICKS = 30` (500 ms; today's `UNACKED_MAX`). `P` is never more than that many ticks past the confirmed tick: `tick` returns false there, and a lead longer than the cap shows this seat's newest input only once the lead has fallen back under it.

**Reset.** `P` is reloaded or restored from the snapshot as it stands, the log and the records are cleared, and the offset is set anew (step 1). When the publication that caused the reset is itself running and undecided (a resume, a new round), prediction starts again from it; otherwise `tick` does nothing until such a publication arrives. A reset happens when:

- the replica was replaced (a new round's seed or a new layout);
- the publication's phase is not `running`, or its `controlRevision` changed (a pause or a resume);
- the confirmed round is decided. A decided round keeps publishing with phase `running` (the end card ticks), and every such publication is a reset, so `P` is `C` until the rematch's first undecided publication.

The session disposes the predictor with the stream client: when the link closes (the frozen copy is drawn, as today) and on every new attach, which builds a new client with new sequences. The new predictor starts at the new client's first publication.

### 3.5 Lost updates

`P` keeps stepping on its own while it is within `PREDICT_MAX_TICKS` of the last confirmed tick. At a 150 ms lead that is about 350 ms, seven lost updates in a row, with the picture still moving. Past the cap `tick` returns false and the view holds, as it does today after one loss. An outage of this seat's own frames longer than 250 ms also makes the authority neutralize its held input; the first publication after it corrects `P` like any other miss. State deltas are already built against the last acknowledged image, so nothing needs resending.

### 3.6 What is drawn from which state

| On screen | From |
|---|---|
| Ships, torpedoes, rounds, rocks, this seat's own character, camera follow targets | `P`, blended between its last two local ticks, as Single player draws |
| Console read-outs: throttle, heading hold, weapon modes, charge, magazine, power, doors, the seat you occupy | `P` (your own command shows on the next tick) |
| Hull, shields, room levels, fire, oxygen, crew health | `P` |
| Other players' characters: position only | `C`, interpolated one gap behind, as today (Net-0 §3.4) |
| Round outcome, end card, round record, pause banner, phase | `C` and the publication |
| Beams, hit flashes, missile endings, contact sparks and their sounds | confirmed counters, as today (§3.7) |
| Continuous sounds from state (engine, vent hiss, the heartbeat) | `P` |
| One-shot sounds the audio derives by watching state (`duelStateSounds`: the outcome, a torpedo's launch and end; the crew's life cues; the music's mood) | `C` |
| Cues, pings, command results and refusals | the authority's stream, as today |

One timeline for the ship world: the Weapons player's view is the ship the Helm flies, so drawing "other players" late there would put the player's own ship in the past while the rocks ran ahead. The partner's steering is carried forward from `held` and corrected each publication (the 0.2 to 0.6 u of §2). Other players' characters are different: carrying a walk forward overshoots by up to half a tile every time they stop, they touch nothing physical, and Net-0 already says to interpolate them.

**The view source.** `DuelViewSource` gives the scene one `duel`, one `crewPrev` and one `alpha` today, and the interior view reads every character's position from that one state. It changes as follows:

- `duel` is `P`. `prev`, `missilePrev` and `crewPrev` are `P`'s bodies before its newest step (§3.3), and `alpha` is the time since the last local tick over one tick, as Single player computes it.
- A new optional member, `crewOverride?(): { at: readonly ({ x: number; y: number } | null)[]; prev: readonly ({ x: number; y: number } | null)[]; alpha: number }`. The online source returns, for every character but this seat's own, its position in `C` at the latest and the previous publication, with today's gap alpha; this seat's own slot is null. The interior view draws a character whose slot is not null at `prev` blended to `at` by that alpha, and every other at `duel`'s position with `crewPrev` and `alpha`. Everything else about a character (facing, pose, health, downed) is read from `duel`. Single player gives no override.
- A new member for what must come from the confirmed state, `confirmed(): DuelState` (Single player returns `duel`): the scene's end card and the audio's state watchers read it.

### 3.7 Effects stay on confirmed state

Beams, hits, missile endings and sparks keep coming from the confirmed counters (`gapEvents`), so an effect never shows for something that did not happen. `gapEvents` still compares two confirmed states; what changes is where each effect is drawn, or a beam would start behind the hull by the lead's travel:

| Effect | Drawn at |
|---|---|
| `laser`, a hit | from the firing ship's position in `P` to the target's position in `P` |
| `laser`, a miss | from the firing ship's position in `P`, to range along that ship's heading in `P` |
| `pewFire`, `contact` | the named ship's position in `P` |
| `gunHit`, `pewHit` | the target's position in `P` |
| `missileEnd` | the old missile's last confirmed position, as today (the missile is gone from `P` too) |

**Effect after cause, by the lead.** Hull, shields and rooms are read from `P`, and the beam or flash comes a lead later. So a hit you predicted lowers the target's shields 150 to 300 ms before its beam is drawn, and a shot the authority refuses shows its damage and then takes it back. A round or torpedo you fire is drawn flying from `P`, so there the eye sees the cause; the hit-scan laser is where the order shows. This is accepted for Net-4a. Net-4b's per-tick events, or early effects for your own shots, close it.

A rock can also break in `P` because of a hit the partner's last-moment input then averts (a late swerve away from a ram, a MANUAL torpedo steered off). The pieces show for at most the lead and the rock comes back. It never occurred in the measured runs.

Nothing that cannot be taken back is played from `P`: no one-shot sound, no flash, no end card (§3.6's table).

**Departures from Net-0 §3.4**, stated so later milestones know the record is amended:

1. Net-0 has the client replay its own unacknowledged inputs. Here the ship world also carries every other player's held input forward from the publication, because the crew shares one ship.
2. Net-0 has sounds and effects fire once per authoritative event, keyed by event ID. Here they stay on confirmed counters until Net-4b gives the client the sim's own per-tick events.

### 3.8 Corrections are not smoothed, yet

The measured corrections are under a unit at p95, below a pixel at the map's usual zoom, so a re-simulation simply replaces `P`. The playtest record measures the real figure (§3.10). If two humans produce visible pops, the fix is a per-body visual offset (shown position minus new position) that decays over 100 ms; it is not built until the measurement asks for it.

### 3.9 The hand-written predictions go

Once the predictor passes its gates, the session and the source read `P` and these are removed: `throttleSent`, `headingSent`, `laserModeSent`, `torpModeSent`, the `rampTicks(…, unackedFrames)` throttle ramp, the local `crewAxes` and vent, `unacked` and `UNACKED_MAX`. `P` holds every unacknowledged input already.

The scene's optional readers (`thrMille`, `helmVent`) fall back to the duel's own fields, which are now `P`'s. The tests that pin the removed pieces are rewritten against `P`: `tests/crewHelmOnline.test.ts`, `tests/duelOnlineView.test.ts` (the throttle base and unacknowledged-frame cases) and `tests/onlineDuelSession.test.ts` (`UNACKED_MAX` and the in-flight holds).

Kept: the always-send rule for shots (a press on a seemingly empty charge is sent anyway) and the authority's `unavailable` answer showing NO CHARGE. `P` is a better guess than the lagging replica, but the authority is still the judge.

### 3.10 Figures

- The session times each `confirm` and `tick` call with its own clock and keeps the recent samples; the counts and correction sizes come from `predictor.stats()`.
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
| G1 | Exact when inputs are known | (a) With every seat's input constant, at 0, 50, 150 and 300 ms round trip and 0, 2 and 5% loss: every cadence publication after the first verifies. (b) With this seat's input changing, a constant delay and no loss of held frames, on a rig where one frame reaches the authority per tick: the same. (c) With this seat's input changing under jitter and loss: once the input stops changing, publications verify again within one lead plus two publications; the verified share is reported, not required. |
| G2 | Restore, then step | From a snapshot at every third tick of a scripted duel, restore and 12 steps with the true inputs equals the straight run, on Node; the cross-engine run (`scripts/determinism/`) adds the same check on Chromium and Firefox. |
| G3 | Answers at once | A change in this seat's held input is in `P` on the next local tick at every round trip up to 400 ms (a lead under the cap). At 600 ms the input appears late by the lead's excess over the cap, and `P` never passes `T + PREDICT_MAX_TICKS`. |
| G4 | Small corrections | Scripted pair, 50 to 200 ms round trip: own-ship correction p95 at most 1 u and max at most 5 u; this seat's own character is corrected by at most half a tile (Net-0's gate). |
| G5 | Rides out loss | At 50 and 150 ms round trip, 10% loss of publications and one 300 ms outage of publications only (this seat's frames still arrive): `tick` never returns false, and the first publication after the outage corrects within G4's bound. A second case, both directions out for 200 ms (under the authority's 250 ms held expiry): the same. |
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
| A relative command (`shipPower`'s delta) applied twice | Commands leave the log by `commandHighWater`, which arrives in the same publication as the state that holds their effect: a command is never both in `C` and still in the log. |
| A between-ticks publication counts an input the authority has not run yet | §3.4: only the attach broadcast while running; `P` misses that input for one publication. |
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
