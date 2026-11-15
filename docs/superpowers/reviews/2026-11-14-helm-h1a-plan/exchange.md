# Codex review exchange: helm-h1a-plan

Subject: `docs/superpowers/plans/2026-11-15-helm-h1a-flight-view.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 7e54824, effort high, 306 s, 1504245 in / 1386368 cached / 15437 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The star field does not provide the required parallax
The plan fixes stars in screen space, so they never move when the camera pans. It does not justify this departure from the parent spec. · Plan L63 and L1558–1565; parent spec L232; H-1 spec L3 and L103. · Parallax is part of the H-1a Helm background, and the refined spec says the parent wins where they disagree. · Keep the seeded stars, but derive their screen positions from camera movement at a reduced rate. Add a camera-pan assertion.

### [P2] R1-F2 Dragging and wheeling in one frame loses cursor-anchored zoom
The runtime applies wheel zoom before pan; pan then clears the zoom anchor. A simultaneous drag and wheel therefore zooms about the centre even after the camera becomes free. · Plan L640–653 and L1973–1976; H-1 spec L93–94. · This is a normal combined pointer gesture, and the result contradicts the plan’s free-camera wheel behavior. · Apply the drag before wheel zoom, then test a frame containing both inputs.

### [P2] R1-F3 The browser-default test omits key release
The input test asserts preventDefault only on keydown, although the plan requires it on keydown and keyup. · Plan L77, L529–535 and L743–753. · A regression that lets Tab, Space, arrows, or Backspace act on release would pass this test. · Dispatch keyup for each protected key and assert preventDefault.

## Verified
- The named baseline files in the checkout match commit 6dea2ab; the proposed startSector body at plan L2127–2158 matches main.ts:L29–60 exactly.
- The consumed tick-driver callback, setPaused, and dispose APIs match tickDriver.ts:L6–58; Scheduler matches contracts.ts:L104–105.
- The tactical state, clone, axes, map, tuning, and predictor interfaces used by Tasks 1–3 match state.ts:L11–115, map.ts:L11–23, tuning.ts:L5–63, and predict.ts:L21–31.
- The proposed sim edit exports the existing static-contact pass and adds a ship-0-only step without changing stepFlight or resolveContacts: plan L228–245 and L307–320 versus contacts.ts:L38–53 and physics.ts:L57–62. Its added arithmetic is permitted by determinismGuard.ts:L3–42.
- The renderer, letterbox, asset, theme, and panel interfaces used by the boot and layers match renderer.ts:L25–60, letterbox.ts:L1–4, assets.ts:L8–15, theme.ts:L21–42, and panel.ts:L4–11.
- The proposed Electron main and package replacements preserve the existing default launch, dev, build, and dist paths: plan L2176–2221 and L2236–2274 versus src/main/index.ts:L1–38 and package.json:L1–35.
- The plan’s camera, pause-reason, interpolation, grid-label, path-horizon, bearing-ring, and single-ship decisions are stated at plan L48–77 and implemented in Tasks 1–5.

## Not verified
- No tests, build, screenshot check, or strict TypeScript compilation were run in this read-only review; the Jest suite was expressly prohibited.
- The named review ledger was absent from the checkout, so no exchange history was reviewed. No prior finding IDs were supplied for this round.
- I read src/preload/index.ts:L1–6 beyond the manifest solely to verify the suspend/resume callbacks consumed by the plan; no broader files were explored.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at the brief commit. 3 accepted (1 P1, 2 P2), 0 rejected, 0 deferred. All three were confirmed in the plan's code.

## R1-F1 [P1]: The star field does not provide the required parallax

Confirmed: the stars were baked into the static background (plan L1558-1565), so they never moved, against parent §10b layer 1. The 220 seeded stars now sit in their own `Graphics`, drawn once as a 2×2 tile. Each frame only sets its position to `starOffset(centre) − (w, h)`, where `starOffset` is −centre × `STAR_PARALLAX` (0.02 screen px per world unit, the same at every zoom), wrapped to one screen. A model test covers the rate, the wrap and zoom-independence, and a layer test covers the tile position after a pan. The allocation test still passes. Decision 8 is updated.

## R1-F2 [P2]: Dragging and wheeling in one frame loses cursor-anchored zoom

Confirmed: `pan()` clears the anchor that the earlier `zoomBy` set. The runtime's `frame()` now pans before the wheel zoom. A new runtime test sends both in one frame and checks the camera ends free with the zoom anchored at the cursor.

## R1-F3 [P2]: The browser-default test omits key release

Confirmed. The input test now fires keyup for Tab, Space, the arrows and Backspace and asserts `preventDefault`, and also asserts that other keys don't call it.

## Also changed

- Decisions 2 and 8, the Task 3 and 4 interfaces, and the test counts. Re-verified by extracting the plan task by task into a fresh worktree at master `7e54824`: tasks 1 to 5 run 5, 19, 20, 2 and 9 tests, and every task typechecks and passes in order. Full suite: 1,872 passed.

## Files changed

- docs/superpowers/plans/2026-11-15-helm-h1a-flight-view.md

<!-- end -->

---

# Round 2 (delta, reviewing a2cca5e, effort medium, 49 s, 235377 in / 188672 cached / 2256 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — The model computes a camera-dependent parallax offset, the layer applies it to a tiled star field, and tests cover pan, wrap, and zoom independence (plan L1035–1049, L1187–1190, L1540–1548, L1603–1611, L1644–1648).
- R1-F2: resolved — The runtime pans before wheel zoom, preserving the cursor anchor for a combined gesture; the new test checks the free camera and anchor (plan L1922–1930, L2030–2034).
- R1-F3: resolved — The test now checks preventDefault on both keydown and keyup for every protected key, matching the handlers (plan L529–538, L747–756).

## Verified
- The parallax change satisfies the parent background requirement (parent spec L232; plan L1187–1190, L1603–1611, L1644–1648).
- The three fixes are consistent with the camera and input code in the current plan (plan L644–657, L673–695, L747–756, L2025–2034).

## Not verified
- I did not execute the plan’s tests or typecheck; this was a read-only review of the plan at a2cca5e.

---

# Round 2 response (no subject change)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1 to R1-F3 resolved. Verdict: ready.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

