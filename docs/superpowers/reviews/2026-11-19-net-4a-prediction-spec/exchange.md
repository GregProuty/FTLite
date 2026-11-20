# Codex review exchange: net-4a-prediction-spec

Subject: `docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing aa412784, effort high, 618 s, 5007542 in / 4823429 cached / 48508 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 G1 cannot pass at 2 or 5% loss, because this seat's own input reaches the authority's ticks only approximately
G1 asks that, with only the partner's input held constant, every confirmed tick hashes equal to P at 2% and 5% loss. The authority does not apply held frames by tick. It latches the newest frame that has arrived. A lost unreliable held frame, or two authority ticks run in one pump, means the authority runs a tick with a different own input from the one §3.4 step 2 assigns to tick T + j. Whenever this seat's own input changes at that frame, the hash differs. Step 2 is never called an estimate. §2's 'wrong only when the partner changed an input' came from a method that placed the seat's own inputs exactly, so it does not carry over to a real link. · spec L163 (G1), L87 (step 2), L17 and L34 (§2 method: 'its own inputs on every tick'), L159 (the rig drops unreliable packets); core.ts:L314-L316 (acceptHeld latches the newest sequence, no tick mapping), core.ts:L446 (a tick uses the latched `held`), tickDriver.ts:L30 and L37 (an 8.3 ms idle reschedule, and up to 120 ticks in one pump on debt), receivePolicy.ts:L6 (receive-time accepts any frame tick at or before the current tick) · A gate that cannot pass as written ends in one of two ways: implementers weaken the test until it means nothing, or the task stalls. The spec's accuracy figures will also overstate what a real link achieves. · State in §3.4 step 2 that the j-th-entry mapping is an estimate, and list what breaks it: a lost held frame, a frame arriving between pumps, several authority ticks in one pump, and commands arriving apart from their held frame. Rewrite G1 as two checks. (a) With both seats' inputs constant, or 0% held-frame loss and constant delay, every confirmed tick verifies. (b) With loss and jitter, every mismatch is corrected at the next publication, and the verified share is reported, not required to be 100%. Add a note to §2 that own-input placement was exact in the measurement.

### [P1] R1-F2 G3 at 500 ms round trip contradicts PREDICT_MAX_TICKS = 30
At a 500 ms round trip the lead N is 30 ticks plus up to 3 ticks of publication wait. That is at or above the cap, so `tick` returns false and P does not step. Step 4 then re-simulates only to T + 30 using the first 30 entries, so the newest input is not in P. 'A change in this seat's held input is in P on the next local tick at every round trip up to 500 ms' therefore fails at the top of its own range. · spec L165 (G3: 'every round trip up to 500 ms'), L91 (`PREDICT_MAX_TICKS = 30` (500 ms), 'never more than that many ticks past'), L89 (step to T + min(N, 30)), L55 and L102 (false at the cap; the view holds) · The gate contradicts a fixed starting constant, so one of them has to give way during implementation. · Limit G3 to round trips whose lead stays under the cap (for example up to 400 ms). Alternatively, state that above the cap the input appears only after the lead falls below 30, and test that instead.

### [P1] R1-F3 The watermark rules in §3.2 and §3.4 hold only for publications made right after a tick; attach and control publications break them
Two claims are false for publications made between ticks. Claim 1: 'entries with heldSequence <= h are in the confirmed state', and 'commands with sequence <= c have their effect or refusal in the confirmed state'. Claim 2: `held` 'is what its last tick used'. Here is why. The pump drains ingress before the driver runs ticks. That drain latches new held frames, advances `heldSequences`, and admits commands. The ledger moves the command high water at admission, not at execution. The driver often runs zero ticks in a pump. An attach publication, which goes to every binding when any seat attaches or reconnects, made after such a pump carries frames and commands that no tick has executed yet. Its phase is `running` and its controlRevision is unchanged, so §3.4's reset does not catch it. The client trims those commands and that frame, and P drops them until the next tick publication. A pause publication also clears `held` before it publishes, so its `held` is not what the last tick used. (The pause publication is reset by §3.4, so only the wording is wrong there.) · spec L65, L86, L181; core.ts:L483 then L489 (drain, then driver.pump), ledger.ts:L78 (water = sequence at admit), core.ts:L564 with L289 (attach publishes to every binding), core.ts:L436-L437 (held cleared, then published), tickDriver.ts:L30 (idle pumps run no tick), core.ts:L446-L468 (a tick publication: copy held, step, publish, no drain between, so the claims do hold there) · The partner reconnecting is ordinary online play. Each time it happens, the other seat's own command or frame disappears from P for one publication, and the spec states as fact something the source does not do. · Limit the §3.2 and §3.4 claims to publications made right after `executeTick` (every cadence publication is one). Add the case that fails: a reliable publication made between ticks, of which the attach broadcast is the running example, may count admitted but unexecuted commands and frames. Then define the predictor's response. Option 1: treat a running publication whose tick is off the cadence as a re-simulation that keeps commands with sequence <= c whose results have not arrived. Option 2: accept a one-publication error and state it. Correct §3.2's 'what its last tick used' for control publications.

### [P1] R1-F4 The local tick and P are undefined whenever the session is not producing input: focus loss, blocked input, the leave prompt, before sync, and waiting-state
Today's pump returns before sending a held frame when the window is unfocused or blocked, the session is not synced, or the phase is not running. The leave prompt sends a neutral frame. `stopInput` sends `neutralize`: a reliable held frame with a new sequence that no log entry carries. `client.held` returns null in waiting-state. §3.3 says only that each local tick samples, sends, appends and steps. It does not say whether local ticks, and so P, keep running in these states, what `heldSequence` an entry has when `held` returns null, or what the own slot uses when trimming by the neutralize sequence empties the log (N = 0). If P stops, an unfocused window's world freezes: today it keeps drawing C. If P steps without entries, each publication re-simulates P to T + 0, so it jumps back to C, then runs ahead again, a sawtooth. · spec L75-L78, L87 ('past the last entry' assumes one exists); onlineDuel.ts:L367 (early return when not focused, blocked or synced), L379 (leave prompt), L380 (not running), L171-L177 (stopInput, neutralize); streamClient.ts:L196-L205 (neutralize allocates a held sequence); duelClient.ts:L72 (held is null in waiting-state) · Focus loss happens all the time on a two-PC desk, and on the host's own window when the host alt-tabs. Two implementers would build different behaviour, and one of the two obvious choices freezes the world. · Add a rule: local ticks and P keep running whenever a running publication exists. When the seat is not producing, each tick appends an entry with neutral held input, the last sent sequence and no commands. Treat a `neutralize` frame as an entry. When the log is empty, the own slot uses `publication.held[seat]`. Also state that the leave prompt's neutral frame goes through the same path.

### [P1] R1-F5 DuelViewSource cannot draw other players' characters from C while the world comes from P; the interface change is unnamed
The scene takes one `duel`, one `crewPrev` and one `alpha` from the source. The interior view reads every character's position as `Position.x[eid]` from that one state's crew entities, blended with that one alpha. §3.6 draws this seat's character from P, blended over local ticks, and the others from C, interpolated one gap behind. That needs a second state's entity ids, or per-character positions, plus a second alpha, and the spec names no new member on `DuelViewSource` or the interior view. It also does not say what `prev` and `crewPrev` are after a re-simulation: P's state before the correction, or P's state one tick before the end of the re-simulation. · spec L108, L111, L117; scene.ts:L61-L66 (one duel, crewPrev, alpha), scene.ts:L241 and L404 (interior.draw(d, source.crewPrev, alpha, …)); interiorView.ts:L118, L180 (positions from d's eids, one alpha); onlineSource.ts:L130, L152 (crewPrev from the confirmed replica); runtime.ts:L294-L298 (Single player captures prev before each tick) · This is an interface the spec relies on that does not exist. Two implementers would solve it differently, for example a second source, an overridden crew position, or drawing everyone from P. · Name the interface. For example, add `others(): { positions: readonly {x,y}[]; prev: readonly {x,y}[]; alpha: number }` to DuelViewSource for characters other than `active()`, and have interiorView take per-character positions. State that `prev`, `missilePrev` and the own character's `crewPrev` are captured before every P step, including the last step of a re-simulation.

### [P2] R1-F6 The reset rules contradict each other on a decided round and leave the reconnect undefined
The reset preamble says 'no stepping until a running publication'. A decided duel round keeps publishing with phase `running`, because the duel's `terminal` is always false. So the next publication would restart stepping, against bullet 3's 'P is C until the rematch'. A re-attach creates a new stream client and sequences, but the list does not say the predictor is disposed and rebuilt; it covers only 'the link closed'. · spec L93-L98; duelRules.ts:L47 (terminal never ends, so phase stays running), onlineDuel.ts:L421-L438 (attach builds a new client and source), step.ts:L272 (a decided state takes stepDecided) · The end card and reconnects come up in every session, and as written each can be built two ways. · Say that stepping resumes at the first running publication whose round is undecided (outcome Running), and that P is not stepped while C is decided. Add 'a new attach: dispose the predictor and build it at the new client's first publication'.

### [P2] R1-F7 The predictor's timing figures need a clock that the determinism guard forbids in clientControl
`duelPredictor.ts` lives in `clientControl`, which is a root of the deterministic module graph. There `performance` and `Date` are rejected. §3.10 and G6 need the re-simulation time (p99) from `stats()`, but the interface takes no clock. One implementer will put `performance.now()` in the predictor and fail the boundary test; another will time it in the session. · spec L46, L57, L137-L138, L168; tests/boundary.test.ts:L12 (clientControl is a guarded root), tests/helpers/determinismGuard.ts:L33 (platform globals rejected) · This is an unstated assumption about the codebase, and it produces a guaranteed test failure or a split design. · Inject a clock, `createDuelPredictor({ now(): number, … })`, or state that the session times `confirm` and `tick` and that `PredictionStats` holds only counts and correction sizes.

### [P2] R1-F8 The wire change does not name the four schema-version constants, or the host identity check that compares them
§3.2 says the duel goes 2 to 3 and the sector 1 to 2. The versions live in four places: the mode definitions, and the online compatibility records (`DUEL_SCHEMA_VERSION`, and a literal in onlineSector). `createHostRuntime` refuses to start when the identity's schemaVersion differs from the definition's. Bumping one of a pair and not the other breaks hosting rather than refusing mixed builds. §3.1 also says 'nothing about accepting, checking … publications changes', while §3.2 changes the strict publication schema and its watermark-length refine. · spec L45, L67-L69; src/network/modes/duel.ts:L19, src/network/online/onlineDuel.ts:L19, src/network/modes/sector.ts:L20, src/network/online/onlineSector.ts:L31, src/network/hostRuntime.ts:L10-L11; codec.ts:L201-L206 (strict state schema; the refine checks only the three watermarks) · A missed constant fails at the handshake or at host start, which only shows up in a real two-machine run. · List the four constants. Add `held: z.array(held)` to the shared publication schema and check that its length equals playerCount in the refine. Reword §3.1 to 'the acceptance logic is unchanged; the schema gains `held`'.

### [P2] R1-F9 Your own shot's damage shows from P before its beam shows from C, and 'drawn at the ship's predicted position' is not defined for each effect kind
Hull, shields and room levels are read from P, but beams and hit flashes come from C's counters a lead later. A predicted own `laserFire`, `pewFire` or `missileLaunch` that hits therefore lowers the target's shields and hull about 150 to 300 ms before its beam is drawn. If the authority refuses the shot, the damage shows and then reverts. The §3.7 rule also does not settle each `gapEvents` kind. A laser miss ends at range along the firing ship's heading: P's heading or C's? A `missileEnd` is placed at the old missile's confirmed position, not at a ship. `gunHit` and `pewHit` are placed at the target. · spec L110, L113, L121-L123; onlineSource.ts:L77-L78 (laser x1/y1 from the ship, x2/y2 from the target or the heading), L82-L85 (missileEnd at the previous missile body), L89-L95 (gun, pew and contact positions at the ship or target) · Effect follows cause by the lead on the seat that matters most (Weapons), and two implementers would place the effects differently. · Choose one. (a) Draw your own ship's offensive outcomes, meaning the target's shields, hull and rooms, from C until Net-4b. (b) Accept the effect-before-cause gap explicitly in §3.7. Then give a per-kind table: laser endpoints from P's firing ship and P's target or P's heading; missileEnd at C's missile position moved by the target's P minus C offset (or left at C); gun, pew and contact at the P position of the named ship.

### [P2] R1-F10 The departures from the Net-0 decision record are not stated as departures
Net-0 §3.4 says the client 'replays its own unacknowledged inputs' and that 'sounds and effects fire once per authoritative event, keyed by event ID'. The subject also carries the partner's ship forward from published held input, and keeps effects on confirmed counters (`gapEvents`) instead of event IDs. It argues for both choices but never says it is departing from the record. · spec L117, L121, L152; docs/superpowers/specs/2026-11-13-networking-decision.md:L39 · The brief requires departures to be stated, so that later milestones know the record has been amended. · Add a short 'Departures from Net-0' paragraph to §3.6 or §8. (1) The ship world predicts the partner from carried held input, not only this seat's inputs. (2) Effects stay on confirmed counters until Net-4b moves them to per-tick events.

### [P2] R1-F11 G5 does not state its round trip, and does not account for the authority's 250 ms held expiry during a 300 ms outage
Whether P 'never stops while within the cap' through a 300 ms outage depends on the lead: 9 ticks at 150 ms plus 18 is under 30, but 18 at 300 ms plus 18 is over it. G5 names no round trip. An upstream outage longer than `REMOTE_HELD_TIMEOUT_MS` also makes the authority neutralize this seat's held input without a new sequence. The first publication after the outage then holds neutral ticks that P predicted as held, and G5 still expects the correction to stay within G4's bound. · spec L167, L102 (the 150 ms worked example); receivePolicy.ts:L4; core.ts:L324-L332 (expiry neutralizes without a held sequence) · As written the gate is ambiguous, and whether it passes depends on parameters it does not name. · Give G5 a round trip (for example 50 to 200 ms), say which direction the outage covers, and state that an outage over 250 ms neutralizes this seat at the authority, so the correction bound covers the neutral ticks. Alternatively, test an outage under 250 ms.

### [P3] R1-F12 §3.9's removals have readers in tests that the spec does not name
Removing `unacked`, `thrMille`, `helmVent`, `throttleBase` and `UNACKED_MAX` from the source and the session breaks existing tests the spec does not list. The scene's readers are optional and fall back to the duel's own values, so those are safe. · spec L131; tests/crewHelmOnline.test.ts:L38-L54, tests/duelOnlineView.test.ts:L199-L201, tests/onlineDuelSession.test.ts:L57, L614-L617; scene.ts:L90, L92 (optional thrMille, helmVent) · These are planning inputs. A subagent will meet them as unexplained failures. · List these tests in §3.9 as being rewritten against P, and note that the scene's optional readers fall back to P's own fields.

## Verified
- For a tick publication, the held input the tick used equals `held` at that publication, and `heldHighWater` equals the latched sequence: executeTick copies `held`, steps and publishes with no drain in between (core.ts:L446-L468). Ticks within one pump drain only in beforeTick, and no new ingress arrives during a synchronous pump (core.ts:L502-L506).
- For a tick publication, every command with sequence <= commandHighWater has been executed or refused. The high water moves at admission (ledger.ts:L73, L78), and executeTick freezes and runs all pending commands (core.ts:L445-L450). A command can never be both in C and still in the log, so the 'applied twice' risk row (spec L181) holds.
- The authority restamps receive-time commands with its own tick (core.ts:L450), and stepDuelTick rejects most kinds whose requestedTick differs from the tick (step.ts:L295, L313, L364, L376, L421, L438), so §3.3's restamping in P is needed and correct. Clients stamp commands and held frames with the confirmed tick (duelClient.ts:L66, L76), which receive-time accepts (receivePolicy.ts:L6).
- The online duel client, the host's own window included, is always receive-time with remote streaming (duelStream.ts:L66-L67), so the host's window follows the same rules as a guest. The strict policy is not used online.
- The publication hash equals hashF64(flattenDuel(state)): duelRules.snapshot is saveDuelSnapshot, which uses Array.from(flattenDuel(d)) (duelRules.ts:L66, snapshot.ts:L114-L117), and the core hashes snapshot.values (core.ts:L280-L282).
- Two live DuelStates can coexist and be disposed independently: every world shares one entity index, so entity ids never collide in the module-level component arrays (sim/state.ts:L72-L76, L106-L108), and disposeDuel releases only its own world (state.ts:L138). The seed and layout caches in snapshot.ts are read-only validation memos (snapshot.ts:L60-L95). restoreDuelSnapshot clears per-tick events and helmVent (snapshot.ts:L226). Telemetry lives outside DuelState (duelRules.ts:L21, L42).
- In-place restore requires the same seed and layout (snapshot.ts:L223-L224), so a new round needs a reload. That matches the subject's 'replica replaced' reset (L95) and the stream client's matches/load (duelClient.ts:L42-L43).
- Asteroids-iii's rail memo and per-step table are keyed by the pool array, check every input, and are live only inside one synchronous step (rocks.ts:L66-L72, L84-L101, L108-L131), so stepping P and C alternately and restoring in place is safe, as §4.1 says. Rail slots do not change while on the rail (rocks.ts:L3-L5), which supports §2.1 and §4.3.
- Publications reach the client at cadence ticks (tick % 3 === 0) or as reliable immediates (sender.ts:L13-L16, L50-L52; perf-i L25-L27). P's tick and the authority's share one numbering (the snapshot header tick is the interior tick, core.ts:L52), so 'every third tick' lines up. Off-cadence full images fall under step 4's 'no hash recorded'. No rule forbids clientControl importing network/state, and the boundary test follows the import into its graph (boundary.test.ts:L15-L20); imageCodec uses only Math.imul.
- The checkpoint already holds `held` and `heldHighWater` (core.ts:L182). Both modes' publication schemas come from one messageSchemaFor (codec.ts:L201-L206, L254, L257), so one schema edit covers both. The image metadata limit of 16 KB (imageCodec.ts:L9) easily holds four held inputs.
- §4.3 and §5 state nothing about Asteroids-iv as existing fact: they set requirements for future rock work. That fits Asteroids-iii's out-of-scope list (asteroids-iii spec L412-L419: rock effects for guests, quantised deltas).

## Not verified
- Whether a cross-engine (Chromium and Firefox) restore-then-step harness exists that G2 can extend. Not searched; outside the manifest.
- Whether the sector's local strict JSON publication sits close to MAX_MESSAGE_BYTES (65,536) with up to MAX_PLAYERS held entries added (codec.ts:L10). Sector publication sizes were not measured.
- Whether delta state packets really resend the full metadata JSON in every packet, as §3.2 says; imageCodec's encodeDelta was not read.
- The §2 numbers (accuracy, timings, packet sizes): they are estimates from a scripted run and were not reproduced. Per the fixed decisions they are taken as given.
- Whether duelAudio derives any one-shot sound from state (for example a hull alarm or a fire start), which would play from P against §3.7's 'nothing irreversible from P'. The scene's audio paths were not read.
- The runtime.ts ranges beyond L285-L324 (Single player's alpha accumulator and event gathering) were only partly read. 'Blended between its last two local ticks, as Single player draws' was checked against capture() only.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `8e975767`. 12 accepted, 0 rejected, 0 deferred. No prior IDs.

## R1-F1 [P1]: G1 cannot pass at 2 or 5% loss, because this seat's own input reaches the authority's ticks only approximately

Confirmed. `acceptHeld` latches the newest frame with no tick mapping (`core.ts:L314-L316`) and a tick uses the latched array (`core.ts:L446`); my measuring script (§2) fed the seat's own inputs on the true ticks, so its figures do not cover this. §3.4 now has a paragraph "Step 2 is an estimate" naming the five ways the mapping slips. G1 is split: (a) every seat's input constant, across the delay and loss matrix; (b) own input changing on a rig where one frame reaches the authority per tick; (c) jitter and loss, where publications must verify again once the input stops changing and the verified share is reported, not required. §2's Limits now says the "exactly right" shares are an upper bound for that reason.

## R1-F2 [P1]: G3 at 500 ms round trip contradicts PREDICT_MAX_TICKS = 30

Confirmed: 500 ms is 30 ticks before the publication wait, at the cap. G3 now covers round trips up to 400 ms, and adds the 600 ms case as its own check (input late by the excess, `P` never past `T + 30`). §3.4's Constants paragraph states the over-cap rule.

## R1-F3 [P1]: The watermark rules in §3.2 and §3.4 hold only for publications made right after a tick

Confirmed. The pump drains ingress (`core.ts:L483`) before the driver runs ticks (`L489`), the ledger's high water moves at admission, and the attach path publishes reliably to every binding (`core.ts:L564`, read again for this response). §3.2 now limits "what that tick used" to publications made right after a tick and notes the pause clears `held` first. §3.4 adds "The watermarks are exact only after a tick": a pause or resume resets anyway, and the attach broadcast while running is accepted with its effect stated (this seat's just-admitted frame or command is missing from `P` for one publication). A risk row was added. I took the reviewer's second option: keeping commands whose results have not arrived would bring back the double application of a relative command on ordinary publications, where the result can trail the state.

## R1-F4 [P1]: The local tick and P are undefined whenever the session is not producing input

Confirmed against `onlineDuel.ts:L367-L380` and `streamClient.ts:L196-L205`. §3.3 now says local ticks and `P` run whenever the confirmed round is running and undecided, and defines the entry for a tick that is not producing (neutral, no commands, null sequence), with `neutralize` and the leave prompt's frame logged as sent neutral entries. The lead no longer depends on a count of unacknowledged frames: §3.4 step 1 anchors the newest acknowledged entry's local tick to `T` and keeps the last offset when nothing new is acknowledged, so an idle window holds its lead and does not sawtooth. An empty log uses `publication.held` as it stands. `LocalInput.heldSequence` is now `number | null`.

## R1-F5 [P1]: DuelViewSource cannot draw other players' characters from C while the world comes from P

Confirmed: the scene takes one `duel`, `crewPrev` and `alpha` (`scene.ts:L61-L74`). §3.6 gains "The view source": `duel` is `P`; `prev`, `missilePrev` and `crewPrev` are captured before every `P` step, the last step of a re-simulation included (§3.3); a new optional `crewOverride()` gives other characters' confirmed positions (latest, previous, gap alpha) with this seat's slot null; a new `confirmed()` gives the scene's end card and the audio's state watchers `C`.

## R1-F6 [P2]: The reset rules contradict each other on a decided round and leave the reconnect undefined

Confirmed (`duelRules.ts:L47`: terminal never ends, so a decided round publishes as running). §3.4's Reset now says every publication of a decided round is a reset, prediction restarts from a running undecided publication (the causing one included), and the session disposes the predictor with the stream client on close and on every attach.

## R1-F7 [P2]: The predictor's timing figures need a clock that the determinism guard forbids in clientControl

Confirmed: `clientControl` is a root in `tests/boundary.test.ts:L12`. §3.1 says the predictor measures no time and `stats()` holds counts and sizes; §3.10 says the session times `confirm` and `tick`.

## R1-F8 [P2]: The wire change does not name the four schema-version constants, or the host identity check

Confirmed. §3.2 now names both sites of each version and the `createHostRuntime` comparison, the one schema function both codecs share, and the length refine. §3.1's "nothing changes" is reworded to the acceptance logic being unchanged.

## R1-F9 [P2]: Your own shot's damage shows from P before its beam shows from C; "drawn at the ship's predicted position" is not defined per kind

Confirmed. §3.7 has a table of where each `gapEvents` kind is drawn, and a paragraph "Effect after cause, by the lead" that accepts the order for Net-4a and says what closes it. I took option (b): reading the target's hull and shields from `C` would split one console between two clocks.

## R1-F10 [P2]: The departures from the Net-0 decision record are not stated as departures

Confirmed. §3.7 ends with "Departures from Net-0 §3.4", listing both.

## R1-F11 [P2]: G5 does not state its round trip, and does not account for the 250 ms held expiry

Confirmed (`receivePolicy.ts:L4`). G5 now names 50 and 150 ms round trip, a 300 ms outage of publications only, and a second case with both directions out for 200 ms. §3.5 states what a longer outage of this seat's frames does.

## R1-F12 [P3]: §3.9's removals have readers in tests that the spec does not name

Confirmed. §3.9 lists the three test files and notes the scene's optional readers fall back to `P`'s fields.

## Also changed

- From the reviewer's `not_verified` list: `duelAudio.ts` derives one-shot sounds by watching state (`duelStateSounds`, the crew's life cues, the mood; L39-L66). §3.6's table now reads those from `C` and the continuous sounds from `P`.
- G2 names `scripts/determinism/` as the cross-engine run it extends.
- §3.4's reset wording: the offset after a reset maps the newest local tick to `T`.

## Files changed

- docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 0ef87a6c, effort medium, 152 s, 530948 in / 464123 cached / 14584 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 G5 at a 150 ms round trip has no margin under the cap, so with 10% loss as well 'tick never returns false' fails for some seeds
G5 now requires `tick` never to return false. At 150 ms round trip the lead when a publication arrives is about 9 ticks, plus a tick of pump granularity. The first publication after a 300 ms outage of publications arrives up to one cadence (50 ms, 3 ticks) after the outage ends. So P reaches 9 + 18 + 3 = 30 ticks past the last confirmed tick, which is PREDICT_MAX_TICKS. §3.5's own figure ('At a 150 ms lead that is about 350 ms') is exactly 300 ms of outage plus one cadence. G5 also runs 10% publication loss in the same case. If the publication just before or just after the outage is lost, the gap grows by another 50 ms, past the cap, and `tick` returns false. The fix for R1-F11 turned the old, tautological 'never stops while within the cap' into this stronger check, and that is what produced the problem. · spec L213 (G5: 50 and 150 ms, 10% loss plus a 300 ms outage, 'tick never returns false'); spec L121 (§3.5: 150 ms lead ⇒ about 350 ms before the cap); spec L109 (cap 30, false at the cap); spec L99 (measured target = T plus the local ticks since the anchor); src/network/state/sender.ts:L13 (STATE_CADENCE_TICKS = 3) · Whether the gate passes depends on the seed and on pump timing. Implementers will either fish for a passing seed or weaken the check, which is the failure mode R1-F1 and R1-F2 were raised to stop. · Keep the cap and change the case. Either run the 300 ms outage only at 50 ms round trip, or use 150 ms with a 250 ms outage. In either case, apply no random loss to the publication before and the publication after the outage window. Alternatively, state the bound: past the cap, `tick` returns false for at most the gap's excess over (30 − lead) ticks.

### [P1] R2-F2 G1(a) cannot pass at 50 ms round trip or more: the first anchored publication after every reset must re-simulate
After a reset, the log is cleared and the offset maps the newest local tick to T, so the lead is 0 (§3.4 step 1, Reset). Frames sent after the reset are acknowledged only a round trip later. The first publication that holds an anchor then moves the measured target by the whole lead: about 3 ticks at 50 ms, 9 at 150 ms and 18 at 300 ms. That is more than the 2-tick allowance, so step 4 fails and step 5 re-simulates. G1(a) requires 'every cadence publication after the first' to verify, so it fails once per round start at every non-zero round trip in its matrix. At 5% loss, three held frames lost in a row also move the anchor by 3 and force a re-simulation, even though the inputs are constant. · spec L97 (after a reset the offset maps the newest local tick to T; no lead until the first anchor); spec L99 (target from the anchor; 2-tick allowance); spec L100-L101 (outside the allowance ⇒ re-simulated); spec L111 (reset clears the log); spec L209 (G1(a): 'every cadence publication after the first verifies' at 50/150/300 ms) · The gate cannot pass as written. That re-simulation is the designed way the lead is built, so it is not a bug the implementer can fix. · Reword G1(a) to 'every cadence publication after the first anchored one verifies, except one re-simulation per anchor shift of more than 2 ticks, and every re-simulation leaves P's state unchanged (equal hash before and after)'. Alternatively, require 'P's state at every confirmed tick hashes equal to the publication', which is the property G1 names, and report the verified/resimulated split.

### [P2] R2-F3 Step 1 drops commands that have not run yet when their entry is at or before the anchor
Step 1 drops every entry at or before the anchor's local tick, and removes only the commands with sequence <= c from the entries that remain. A command whose entry falls at or before the anchor but whose sequence is above c is still waiting at the authority, and it is dropped with its entry. This happens when the reliable command reaches the authority after a later held frame. Held frames go on 'unreliable-latest'. Commands go on 'reliable-ordered', and in receive-time mode they wait in a per-player outbox that flushes only when allowed and on ACK. P then lacks that command until C shows its result. The command shows on the next tick, vanishes, then comes back. That is a toggle flicker for something like laserMode, not the tick-or-two error the 'Step 2 is an estimate' paragraph describes. · spec L97 ('Entries at or before the anchor's local tick are dropped. Commands with sequence <= c are removed from the entries that hold them'); spec L105 (the only stated effect of a command arriving apart from its frame is 'off by a tick or two'); src/renderer/src/clientControl/streamClient.ts:L208 (held on unreliable-latest), L209-L214 (commands to the outbox when receiveTime, flushed separately) · This is visible on the Weapons and Helm consoles under loss, in ordinary online play. Two implementers could reasonably build it either way, and the spec's description of the error understates it. · In step 1, carry the remaining commands (sequence > c) from dropped entries onto the first entry after the anchor. If none exists, carry them onto tick T + 1. Keep the risk row's guarantee: a command leaves the log only by c. State this in the estimate paragraph.

### [P3] R2-F4 The log and the per-tick records are never trimmed while this seat is not producing
Step 1 drops entries only up to an anchor. Not-producing entries have a null sequence and never become anchors. While the window is unfocused, the log, the per-tick input records and the hashes therefore grow by 60 a second for as long as focus is away. Step 2 reads only the entries from local tick T + 1 − offset onward, so everything older is dead weight. · spec L86 (not-producing entries: null sequence); spec L97 (no anchor ⇒ offset kept, nothing dropped); spec L89 (per-tick records) · It is a slow leak on an alt-tabbed window, and an implementer has to invent the trim rule. · Add to step 1: whether or not an anchor is found, drop entries and records at local ticks at or before T − offset, and records at ticks before T.

## Prior findings
- R1-F1: resolved — §3.4 L105 now calls step 2 an estimate and names the ways it breaks. G1 is split into (a), (b) and (c), and §2's Limits (L41) says the shares are an upper bound. A separate wording defect in G1(a) is raised as a new finding.
- R1-F2: resolved — G3 (L211) covers up to 400 ms, and the 600 ms over-cap case is consistent with the Constants paragraph (L109).
- R1-F3: resolved — §3.2 (L72) limits the claim to publications made right after a tick and corrects the pause wording. §3.4 (L107) accepts the attach broadcast's one-publication error, and a risk row is added (L228).
- R1-F4: resolved — §3.3 (L83-L86) defines local ticks while not producing, null sequences, and logging for the neutralize and leave-prompt frames. Step 1 keeps the offset when there is no anchor, and an empty log uses publication.held. This matches onlineDuel.ts:L367 and L379 and streamClient.ts:L196-L205.
- R1-F5: resolved — §3.6 (L139-L143) names crewOverride and confirmed() and when the blend bodies are captured. Indexing follows crewPrev's per-player convention (interiorView.ts:L118, L180).
- R1-F6: resolved — Reset (L111-L117): every decided-round publication is a reset, prediction restarts from a running undecided one, and the predictor is disposed on close and on every attach.
- R1-F7: resolved — §3.1 (L53) says the predictor has no clock, and §3.10 (L182) has the session do the timing.
- R1-F8: resolved — §3.2 (L74, L76) names the shared schema function with its length refine and the four version sites compared by createHostRuntime. §3.1 (L50) is reworded.
- R1-F9: resolved — §3.7 (L149-L157) has a per-kind table and accepts the effect-after-cause order explicitly.
- R1-F10: resolved — §3.7 (L163-L166) lists both departures from Net-0 §3.4.
- R1-F11: resolved — G5 names the round trips and the outage directions, and §3.5 states the 250 ms expiry (core.ts:L327, receivePolicy.ts:L4). The stronger 'never returns false' wording has no margin at 150 ms; that is raised as a new finding.
- R1-F12: resolved — §3.9 (L176) lists the three test files and the scene's fallback readers.

## Verified
- The leave prompt sends a neutral held frame every pump while it is open, and stopInput sends neutralize. Both are logged as neutral entries with sequences as §3.3 L86 says (onlineDuel.ts:L171-L177, L379; streamClient.ts:L196-L205).
- Cadence publications fall on tick % 3 === 0, as §3.3 L89 states (src/network/state/sender.ts:L13, L16).
- acceptHeld latches the newest sequence with no tick mapping, and expiry neutralizes after 250 ms with no new sequence, matching §3.4 L105 and §3.5 L121 (core.ts:L314-L332).
- The interior view indexes crewPrev by player id, so crewOverride's per-slot arrays with this seat's slot null fit the existing shape (interiorView.ts:L47, L118, L127, L180).
- Commands in receive-time mode go through a per-player outbox, apart from the unreliable held frame (streamClient.ts:L206-L215). This underlies the new step 1 finding.

## Not verified
- I did not re-read codec.ts to confirm that both codecs build their publication schema from a single function (§3.2 L74). R1-F8's evidence cited codec.ts:L201-L206 and I relied on that.
- I did not re-check that createHostRuntime compares exactly the four named version sites. I accepted round 1's evidence (hostRuntime.ts:L10-L11).
- Whether the audio's duelStateSounds and the end card can be moved to confirmed() without other readers of source.duel. Not traced in scene.ts or duelAudio.ts this round.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `24d3c28e`. 4 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F12 resolved.

## R2-F1 [P1]: G5 at a 150 ms round trip has no margin under the cap

Confirmed by the arithmetic: 9 ticks of lead, 18 of outage and up to 3 of cadence is 30, the cap, before any random loss beside the outage. §3.5's "seven lost updates" was also wrong: 21 ticks is 350 ms, which is six lost updates and the seventh arriving. G5 is now four cases. (a) 50 ms round trip with a 300 ms outage of publications, (b) 150 ms with 200 ms, (c) 50 ms with both directions out for 200 ms: in each `tick` never returns false, and the publications just before and just after the outage are delivered so the seed cannot push it over. (d) 150 ms with a 500 ms outage checks the over-cap behaviour directly: `tick` is false only while `P` stands at the cap, and stepping resumes at the next publication. §3.5 states the bound.

## R2-F2 [P1]: G1(a) cannot pass at 50 ms round trip or more

Confirmed: after a reset the lead is 0 and the first anchored publication moves the target by the whole lead, past the 2-tick allowance, so step 5 runs by design. G1(a) now requires the property itself (the hash recorded for `P` at every confirmed tick equals the publication's) and allows a re-simulation only when the measured target moved more than 2 ticks from where `P` stood; the verified and re-simulated counts are reported.

## R2-F3 [P2]: Step 1 drops commands that have not run yet when their entry is at or before the anchor

Confirmed against `streamClient.ts:L208-L214`: held frames go out on `unreliable-latest`, commands through the receive-time outbox on `reliable-ordered`, so a held frame can be acknowledged before the command sent beside it has run. Step 1 now removes commands only by `c`: those above `c` on entries about to be dropped move to the first entry after the anchor, or are kept for tick `T + 1`, and step 2 runs them there. The estimate paragraph says a pending command stays in `P`, so a toggle does not flicker.

## R2-F4 [P3]: The log and the per-tick records are never trimmed while this seat is not producing

Confirmed. Step 1's trim now runs whether or not an anchor was found: entries at or before local tick `T - offset` are dropped, with the records of ticks before `T`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md

<!-- end -->

---

# Round 3 (delta, reviewing 4912030e, effort medium, 85 s, 89093 in / 59464 cached / 8193 out)

Verdict: ready with P2s

## Findings

### [P2] R3-F1 Commands 'kept for tick T + 1' are lost when P already stands at T, because the live tick runs only its own entry's commands
Step 1 now keeps a pending command (sequence > c) 'for tick T + 1' when no entry follows local tick T - offset, and step 2 says those commands 'run there'. But no entry following the anchor means the measured target is T: the newest local tick minus (T - offset) is 0. If P stands at T, the re-simulation (or the verify) runs no tick after T, so the kept commands are never applied. The next local tick then steps P to T + 1 through `tick`, which per §3.3 uses 'this entry's commands' only, and the new entry does not hold the kept ones. P therefore lacks the pending command until the next publication carries it forward again. With a near-zero lead (the anchor is the newest entry, for example at the 0 ms row of G1, or right after local ticks stalled), that repeats on every publication. The result is the toggle flicker that the new sentence 'a toggle does not flicker' rules out. When P stands at T + 1 or T + 2, the input comparison in step 4 fails and step 5 does apply them, so only the P-at-T case breaks. · spec L97 ('or kept for tick `T + 1` when there is none'); spec L98 ('Commands step 1 kept for tick `T + 1` run there'); spec L99 (target = T + newest local tick − (T − offset), so it is T when no entry follows the anchor; P within 2 keeps its own tick); spec L87 (`tick` steps with 'this entry's commands'); spec L105 ('A command the authority has not run yet stays in `P` throughout (step 1), so a toggle does not flicker'); src/renderer/src/clientControl/streamClient.ts:L209-L214 (commands wait in the receive-time outbox, so a command can still be pending after its held frame is acknowledged) · Two implementers would differ on where the kept commands live and who consumes them. A literal build reintroduces the flicker that R2-F3 was fixed to remove, in the case with no entry after the anchor. · Hold the kept commands in a pending list on the predictor. Prepend them to the commands of the next log entry, whether that entry is one step 2 replays or the next one `tick` appends (§3.3). State in §3.3 that `tick` runs any pending kept commands with this entry's own. Optionally, when P stands at T, have step 5 apply them by stepping P to T + 1.

### [P3] R3-F2 G5 says 'Three cases' but lists four, and whether (d) has the 10% loss is unclear
The G5 cell opens with 'Three cases, each with 10% loss of publications except…' and then lists (a), (b), (c) and (d). Case (d), the 500 ms over-cap case, comes after the 'In each…' sentence. So it is unclear whether the 10% loss and the delivered publications beside the outage apply to it. · spec L213 · This is a small ambiguity in a gate the implementer has to script. · Write 'Four cases'. Either say that (d) also has the 10% loss with the publications beside the outage delivered, or say that (d) has no random loss.

## Prior findings
- R2-F1: resolved — G5 now fits under the cap with margin. (a) 50 ms: about 3 ticks of lead + 18 of outage + 3 of cadence + 1 of pump ≈ 25. (b) 150 ms: 9 + 12 + 3 + 1 ≈ 25. (c) 50 ms, both directions out 200 ms: ≈ 19. All are under 30, and the publications beside the outage are delivered, so the seed cannot push a case over. Case (d) states the over-cap bound consistently with L109. §3.5's arithmetic (21 ticks, 350 ms, six lost updates) is now right. The only leftover is the three/four case count, raised as a new P3.
- R2-F2: resolved — G1(a) now requires the property itself: the hash recorded at every confirmed tick equals the publication's. It allows a re-simulation only on a target shift of more than 2 ticks, which covers the lead being built after a reset and held frames lost in a row, and it reports the counts. This matches step 3 and step 5 (L99-L101) and the reset rule (L97, L111).
- R2-F3: resolved — Step 1 now removes commands only by c and carries the pending ones forward. The estimate paragraph (L105) states the command-channel split, which matches streamClient.ts:L208-L214. The risk row at L227 stays consistent: commands still leave the log by c. One gap remains in the 'kept for T + 1' branch when no entry follows the anchor, raised as a new P2. It does not affect the main case, where an entry after the anchor exists.
- R2-F4: resolved — L97: 'the log is trimmed, whether or not an anchor was found'. Entries at or before local tick T - offset and records of ticks before T are dropped. Step 2 reads from T + 1 - offset onward, so nothing it needs is trimmed.

## Verified
- Step 1's trim threshold, local tick T - offset, equals the anchor's local tick when an anchor is found (offset = T − anchor local tick, L97). The 'first entry after it' therefore maps to tick T + 1 under step 2's mapping (L98), so a moved command runs at T + 1 in the ordinary case.
- The moved commands cannot double-apply a relative command: they leave the log only by c, and c arrives with the state that holds their effect (L97, L227).
- When a command moves to T + 1, P's recorded inputs differ from step 2's, so step 4 fails and step 5 re-simulates from C, which lacks the command, then applies it at T + 1. The behaviour is correct and the cost is bounded (L100-L101).
- §3.5's lead and cap arithmetic (L121) agrees with PREDICT_MAX_TICKS = 30 (L109) and STATE_CADENCE_TICKS = 3.
- The wording of G5(d) agrees with L109: tick returns false only at T + PREDICT_MAX_TICKS.
- The G1(a) rewording is consistent with step 3's 2-tick allowance and with the reset rule that the lead starts at 0 (L97, L99, L111).
- The estimate paragraph's channel description matches streamClient.ts:L208 (held frames on unreliable-latest) and L209-L214 (commands through the receive-time outbox).

## Not verified
- Whether G1(a) at 0 ms round trip can hit 'no hash recorded for T' with P one tick below T, because of pump ordering in the rig. Step 3 (L99, unchanged) lets P's tick be the target even when that is below T. I did not trace the rig's ordering, so this is not raised.
- Whether a seeded 10% loss run in G5 can, away from the outage, lose six or seven publications in a row at 150 ms and reach the cap. The probability is negligible per position, but it depends on the length of the run, which the spec does not state.

---

# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `4912030e`. 2 accepted, 0 rejected, 0 deferred. The reviewer confirmed R2-F1 to R2-F4 resolved; verdict "ready with P2s".

## R3-F1 [P2]: Commands "kept for tick T + 1" are lost when P already stands at T

Confirmed: with no entry after the anchor the target is `T`, no tick after `T` runs in step 5, and `tick` ran only its own entry's commands, so the kept commands had no consumer. Step 1 now moves pending commands to the front of the first entry after the anchor and, when there is none, leaves them waiting on the predictor for the next entry `tick` appends. §3.3's `tick` runs any waiting commands before the entry's own. Step 2's extra sentence is removed, since the commands now always sit on an entry.

## R3-F2 [P3]: G5 says "Three cases" but lists four

Confirmed. G5 now says four cases, each a 20 s run under the same loss rule, which also applies to (d).

## Also changed

- From the reviewer's `not_verified` list: step 3 now says the target is at least `T`, so `P` is never left behind the confirmed tick; and G5's loss rule caps random losses at three in a row, so a long run cannot reach the cap by chance.

## Files changed

- docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md

<!-- end -->

---

