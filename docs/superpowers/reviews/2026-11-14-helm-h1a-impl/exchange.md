# Codex review exchange: helm-h1a-impl

Subject: `package.json scripts/dev-mode.ts src/main/index.ts src/renderer/src/app/duel/flightMode.ts src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/mode.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/main.ts src/renderer/src/render/tactical/camera.ts src/renderer/src/render/tactical/feelModel.ts src/renderer/src/render/tactical/feelPanel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/physics.ts tests/duelInput.test.ts tests/flightRuntime.test.ts tests/tacticalCamera.test.ts tests/tacticalLayer.test.ts tests/tacticalModel.test.ts tests/tacticalSoloFlight.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 3a291a9, effort high, 164 s, 668467 in / 571264 cached / 8219 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Escape can advance due ticks before pausing
A frame that receives Escape pumps due simulation ticks before it sets the user pause reason. After a delayed frame, the ship can advance many ticks even though the player has pressed pause. · spec L45-L46; src/renderer/src/app/duel/runtime.ts:L68-L73; src/renderer/src/authority/tickDriver.ts:L31-L41 · The driver can process up to 120 due ticks in that pump, making pause visibly late after a stall. The pause test does not cover an Escape edge with ticks due at frame entry. · Apply the Escape edges and sync the pause state before `driver.pump()`, then compute alpha after the pump. Add a headless test with due ticks queued when Escape is sampled.

### [P2] R1-F2 Wheel remainder survives an idle gap without render frames
When the next sampled frame contains wheel input, the runtime updates `lastWheelAt` before checking the idle interval, so an old fractional delta can combine with a new scroll after more than 200 ms without rendered frames. · plan L73-L77; src/renderer/src/app/duel/runtime.ts:L77-L80; tests/flightRuntime.test.ts:L136-L146 · A resumed view can zoom an extra notch. The existing test covers an idle interval with an intervening render frame, which clears the remainder. · Check elapsed time and clear `wheelAcc` before recording the new wheel timestamp. Test the first wheel sample after a gap with no intervening `frame()` call.

## Verified
- The no-mode sector startup body matches master; the mode branch enters flight only for `?mode=flight`. src/renderer/src/main.ts:L30-L78; src/renderer/src/app/duel/mode.ts:L6-L8
- Dev and packaged Electron load paths append `mode` only when `FTLITE_MODE` is set. src/main/index.ts:L30-L38
- `stepSoloFlight` advances ship 0 through the existing static-contact pass, then increments the tick; the diff leaves `stepFlight` unchanged. src/renderer/src/sim/tactical/physics.ts:L57-L70; src/renderer/src/sim/tactical/contacts.ts:L38-L43
- The camera follows the interpolated ship, and `flightMode` uses one frame alpha for camera update and drawing. src/renderer/src/app/duel/runtime.ts:L70-L81; src/renderer/src/app/duel/flightMode.ts:L54-L60
- Blur, hidden, and suspend each have a separate pause reason; a long interval while paused does not accrue new tick debt. src/renderer/src/app/duel/flightMode.ts:L46-L52; src/renderer/src/authority/tickDriver.ts:L12-L25, L47-L54
- The model implements fixed 500-unit grid names, contour and asteroid culling, zoom-based path horizon, bearing ring, and off-screen arrows. src/renderer/src/render/tactical/tacticalModel.ts:L123-L167, L191-L255
- The Pixi layer creates display objects at construction and reuses them on draw; its test checks object counts over 60 frames. src/renderer/src/render/tactical/tacticalLayer.ts:L24-L37, L82-L148; tests/tacticalLayer.test.ts:L14-L35
- `git diff master...HEAD --check` passed.

## Not verified
- The flight view was not launched or visually inspected, and no test suite or build was run under the read-only review constraints.
- The review run directory and ledger are absent from this checkout, so prior review responses could not be checked.
- I read `render/renderer.ts` and `render/letterbox.ts` beyond the manifest to check the pointer coordinate mapping against renderer resize; no further files were explored.

---

# Round 1 response (code fixed)

Reviewed `round-1.json` against the branch. 2 accepted (1 P1, 1 P2), 0 rejected, 0 deferred. Both were confirmed in `runtime.ts`.

## R1-F1 [P1]: Escape can advance due ticks before pausing

Confirmed: `frame()` called `driver.pump()` before applying the Escape edges, so a late frame ran every due tick before pausing. `frame()` now applies the pause presses and calls `sync()` first, then `driver.pump()`, which does nothing while paused, then computes alpha. New test: with 30 ticks due and an Escape in the same frame, the runtime is paused and the tick stays at 0.

## R1-F2 [P2]: Wheel remainder survives an idle gap without render frames

Confirmed: `lastWheelAt` was updated before the idle check, so a frame with wheel input after a gap never cleared the old remainder. The idle gap is now checked, and the accumulator cleared, before the new timestamp is recorded. New test: 60 px, then 300 ms with no frames, then 60 px: no notch.

## Also changed

- Verified with `npm run typecheck` (clean) and `npm test` (1,877 passed).

## Files changed

- src/renderer/src/app/duel/runtime.ts
- tests/flightRuntime.test.ts

<!-- end -->

---

