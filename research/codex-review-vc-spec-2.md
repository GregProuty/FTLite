# Codex review: Demo-ii spec sections 5 and 7 (2026-11-12)

1. **High — §5, line 33:** The detector names `boardings`, `encounters`, `impacts`, `shots`, `hits`, `shieldHits`, `jumps`, `ended`, `endReason`, and `jumpCharge`, but this spec section does not establish that those fields exist on `state.telemetry` or `state.run`. The requested session and main files do not define them either. Specify each field’s source and type, including how `spawns` is summed, before implementing `cueCounters`.

2. **High — §5, line 35:** The placement is sound only if cue detection runs after the tick loop even when its end check breaks early. State that the post-loop detection runs once in the running branch, including after a tick sets `ended`; otherwise a mid-frame ending can skip the terminal cue. The session currently enters `gameover` inside the loop at [session.ts:114–120](/C:/Users/djuar/FTLite/src/renderer/src/app/session.ts:114).

3. **Medium — §5, line 35:** “No cues in … game over” is ambiguous for the frame that transitions to game over. Clarify that this frame may emit the single victory/defeat edge, then later game-over frames emit nothing. Resetting counters at `start()` and advancing `prevCounters` after detection supports exactly-once behavior.

4. **Medium — §5, line 37:** `playCue` is proposed as an optional session dependency, but the current `SessionDeps` has no such member ([session.ts:20–35](/C:/Users/djuar/FTLite/src/renderer/src/app/session.ts:20)). The collecting harness is feasible once added; make the spec explicit that tests inject it without Electron or `AudioContext`. The described first-input unlock and Electron autoplay setting are concrete, but the spec should clarify that `resume()` failures are caught and do not escape the input/focus handlers.

5. **Medium — §7, line 48:** “Each cue alone” and “several at once” do not specify transition values or assertions, so tests could pass without checking the named counter edges or cue order. Require explicit before/after pairs for every cue, each alarm source, both hit sources, and simultaneous cues with the exact expected array.

6. **Medium — §7, line 49:** Session cases omit victory and do not explicitly assert no cues while paused. Add a victory-ending run and paused-frame assertion; also specify that the ending frame emits exactly one terminal cue and subsequent game-over frames emit none.