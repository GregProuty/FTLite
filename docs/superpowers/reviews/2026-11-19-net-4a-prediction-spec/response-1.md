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
