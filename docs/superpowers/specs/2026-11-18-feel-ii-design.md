# Feel-ii: the second console feel pass (2026-11-18)

Parent: `2026-11-17-console-feel-design.md` (§6 Feel-ii, and the principles in §0). Builds on Feel-i (SIM 50).
Owner direction, 2026-11-17: easy to pilot and blow things up, harder to master. Decisions taken under the standing
order. Items marked **(sim)** change the sim (SIM 50 → 51, bless procedure); the rest is presentation and input.

## 1. Helm

1. **Click-to-heading (sim).** Right-click (or right-drag) on the Helm map sets a heading marker; the ship turns to
   that bearing and holds it, using the auto-face turn law aimed at a fixed bearing. A/D or Space (auto-face) clears it;
   right-click on the ship clears it. On the wire it is a Helm command `heading {h}` (−1 clears), admitted from the
   Helm only, held in ship state (hash, snapshots, validation). The marker draws as a small chevron on the bearing
   ring (`CRT.mid`) and a dashed line from the nose.
2. **Collision warning.** The existing predicted path (`sim/tactical/predict.ts`) stops at the first solid contact.
   When it does within its horizon, draw the last segment `CRT.hot`, an X at the contact point and a tag
   `COLLISION 2.1s` (time to contact). The status sentence gains top priority `COLLISION: TURN OR BRAKE` when the
   time to contact is under 2 s.
3. **Gravity contours.** Two faint rings around the planet (`CRT.dim`) at the radii where gravity equals 50% and 100%
   of ship thrust, labelled `G 0.5` and `G 1` at small font. A `SLINGSHOT` word flashes on the path when it passes
   inside the G 1 ring above 200 u/s without a collision.
4. **Throttle QoL.** Mouse wheel over the throttle block steps the presets; Shift+W is full burn (100).

## 2. Weapons and both seats

5. **Torpedo lock tone.** While the torpedo has a target (`torpLock ≥ 0`) and a torpedo is ready, a soft repeating
   beep whose rate rises as the enemy nears 360; a steady tone for 0.3 s when in range (just before auto-launch).
   Launch whoosh on launch. Audio only reads the frame it is given (no sim imports).
6. **Incoming torpedo: EVADE.** An enemy torpedo in flight draws its own short predicted path (the same fly code on a
   copy, 2 s) and, at the Helm, an `EVADE` arrow beside the own ship pointing perpendicular to the torpedo's approach
   (the side with more room). The status sentence's priority gains `TORPEDO INBOUND: EVADE` (below COLLISION).
   A warning chirp when it is launched.
7. **Crew pings.** Middle-click or G at either console drops a ping at the map point (or on the enemy when over it):
   an expanding ring and a short label (`HERE` or `TARGET`) for 3 s on every seat, with a soft ping sound. Online it is a
   cosmetic message on the existing channel (not a sim command), rate-limited to 1 per second per player.
8. **Never a dead click.** Any console control whose command the sim would refuse flashes (`CRT.hot`, 300 ms) and
   shows the reason under it for 1.5 s: `NO TORPEDOES`, `TORPEDO FLYING`, `OUT OF RANGE`, `WEAPONS OFFLINE`,
   `ENGINES OFFLINE`, `NO GUNNER`. The reasons come from the same checks the runtime already uses before sending.

## 3. Carried over from Feel-i

9. **Online notice overlap.** The sit-down card must not overlap the online `YOU: HELM`-style notice: when both show,
   the card moves below the notice.

## 4. Tests and gates

- Unit: heading command admission, hold and clear (A/D, Space, right-click on ship), hash/snapshot coverage; the
  collision tag time; the contours' radii; EVADE side choice; ping rate limit; dead-click reasons match the
  admission checks.
- Render: everything new on the maps stays on the CRT amber ramp.
- duelGates still 3–5 min; bless procedure 50 → 51; gates `tsc -b`, full vitest, `test:duel-app-runtime`.
- Screenshots to `C:\Users\djuar\FTLite-shots\feel-ii\`: heading marker, collision X, contours, EVADE, ping, a dead
  click.
