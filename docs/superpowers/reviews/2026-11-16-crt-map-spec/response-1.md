# Round 1 response (spec rewritten)

Reviewed `round-1.json` against `91ed9cb`. 12 accepted, 0 rejected, 0 deferred. Each finding was confirmed against the cited code and fixed as follows.

## R1-F1 [P1]: React has no view value

Confirmed (views.ts:L9-L10, scene.ts:L97-L101). Section 1: DuelUiView and FlightUiView gain crt, set in scene.ts and flightMode.ts, plus a CrtContext; theme.ts is unchanged.

## R1-F2 [P1]: The readout encodes meaning only in hue

Confirmed (readoutModel.ts:L24-L82). ReadoutRow gains emphasis, with the rules per kind, used only when crt is true; the plan lists every row.

## R1-F3 [P1]: Own-ship damage contradicts itself

Confirmed (tacticalLayer.ts:L84-L95). Damage is now defined per base (own hot: glass hatch, then glass cut-out blinking at 2 Hz; enemy hollow: main hatch, then blinking hot), with the hatch geometry. Chevrons show no damage. Screenshot case added.

## R1-F4 [P1]: Missiles and arcs lose friend vs foe

Confirmed (tacticalLayer.ts:L143-L187). Section 2 adds roles for crew and enemy missiles, trails, own and enemy arcs, and shields.

## R1-F5 [P1]: The bezel covers labels

Confirmed (readoutModel.ts:L20, MapOverlay.tsx:L11-L22). The bezel is now 6 internal px on the letterbox rectangle, inside the 8 px margin, with a containment test.

## R1-F6 [P2]: Unmapped constants; test method

Confirmed. Every listed constant and literal is mapped, and the colour test walks Graphics context.instructions and BitmapText tints over a full frame.

## R1-F7 [P2]: Overlay z-order

Confirmed (Stage.tsx, DuelUi.tsx:L16-L20). The overlay is a Stage child after Banners and before EndCard and LatencyOverlay, on the letterbox rectangle.

## R1-F8 [P2]: text-shadow on a canvas

Confirmed (PixelText.tsx:L1-L38). It is now one wrapper drop-shadow filter, scaled by glow.

## R1-F9 [P2]: Performance measure

Confirmed (perf.ts). The check now uses ticker deltaMS median and p95 over 10 s at three strengths, with a pass bar.

## R1-F10 [P2]: Setting plumbing

Confirmed (feelBoot.ts, main.ts). Adds crt.ts and crtBoot.ts mirroring feel, a store slice and the filter strength. F10 is free.

## R1-F11 [P2]: Blink clock

Confirmed (tacticalLayer.ts:L118, ReadoutPanel.tsx:L17). The tactical layer's draw takes a presentation time and React uses a useNow tick. Blinks run at every setting and while paused.

## R1-F12 [P3]: Selected target vs lock

Confirmed (tacticalLayer.ts:L195-L202). Dropped the selected target. The enemy marker is a blinking dashed ring, and the lock keeps its corner brackets.

## Also changed

- The latency overlay and the sector views are added to the non-goals.

## Files changed

- docs/superpowers/specs/2026-11-17-crt-map-design.md

<!-- end -->
