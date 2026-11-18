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

## 5. As built (2026-11-18, SIM_VERSION 51)

1. **Click-to-heading (sim).** The helm module holds `holdHeading` (−1 none, else a heading index 0..255) after the
   throttle; it is in the hash, the snapshot (bounds-checked: `held heading … is invalid`) and the module field list. The
   `heading {heading}` command is admitted like the throttle: stale-tick, the Helm attendant (invalid-seat), the value
   (malformed), noop, applied; a decided round answers duel-decided and a new round starts at −1. `helmTurn`
   (sim/duel/step.ts) is the one rule: A/D, else auto-face, else the held heading's `headingTurn` (auto-face's dead band and
   pursuit turn, `faceTurn` in hunter.ts, toward the fixed bearing), else none; A/D or `face` held at the Helm clears it
   after the tick's axes are taken. The runtime's `heldTurn` (the predicted path) delegates to it. Input: the right button
   on the Helm map (a press and a release each ask for the bearing from the ship's drawn marker; on the ship clears; while
   held a preview marker follows the pointer) goes through `mapRequests.ts` to the runtime or the online session, which
   send it from the Helm only. The Helm's camera no longer pans by the right button (`rightX/rightY` in the pointer
   sample); the middle button still pans there, and both still pan the other consoles. The marker: a chevron on the bearing
   ring's radius (`CRT.mid`) and a dashed line from the nose; the Helm block reads `HDG 136 TO 056` and `R-CLICK MAP:
   HEADING`. Same-version bless: tick counts and outcomes unchanged, hashes moved. The request is deduped against a base:
   Single player's latest queued heading, else the sim's; online the heading in flight until its result (as the
   throttle's), else the replica's. A/D or auto-face held at the Helm makes the base −1 (the sim clears the hold), online
   until the replica shows −1. A Tab or a rematch zeroes the frame's right drag with the rest, so the Helm camera never
   pans by it.
2. **Collision warning.** `predictFlight` (predictPath plus the first contact's point and tick) drives the Helm path; on a
   contact within its horizon the last segment draws `CRT.hot`, an X at the point and `COLLISION 1.8s`. The status sentence
   leads with `COLLISION: TURN OR BRAKE` (hot) when the 2 s prediction (fixed, whatever the zoom) meets a solid. Every seat
   computes it from the Helm's axes as that screen knows them: Single player's flown axes; online, the Helm seat's own and
   other seats' `stateAxes` (the throttle and the held heading from the replica; a partner's held A/D or Space is not on the
   wire, so they can lag that seat by its turn).
3. **Gravity rings.** `G 0.5` and `G 1` rings (dotted, `CRT.dim`; labels `CRT.mid` for legibility) at the radii where the
   pull is half and all of the crew class's thrust (120 u/s²: radii 203 and 142), Helm only. `SLINGSHOT` blinks (3 Hz) at
   the path's fastest point inside G 1 above 200 u/s, only with no contact on the path.
4. **Throttle QoL.** A wheel strip over the throttle notches steps a preset per 100 px of wheel (up is more), clamped to
   REV..100; Shift+W asks for 100 (and is no notch press). The wheel's wrapper holds the notch buttons, so it works over them.
5. **Lock tone.** `lockTone` (audio/duelSounds.ts) from the scene's `torpedoTone` frame data (a target and all of canLaunch's
   checks but range): a short `console` beep every 0.9 s three ranges out down to 0.12 s at the range, then the steady
   tone (`jumpCharge`, 0.3 s) once on reaching range, or on the launch itself when auto-launch fired the tick it came in
   range. The steady tone re-arms only when the lock is lost, the target room changes, or the enemy goes more than 40 u
   (`LOCK_REARM_U`) beyond the range, silent in that band; a frozen or paused frame keeps the watch, so resuming does not
   replay it. The launch whoosh is the existing `thruster` on any torpedo going active.
6. **Incoming torpedo.** `predictMissile` (flyMissile on a copy of the pool, 2 s) draws the enemy torpedo's path dashed hot on
   every console. `evadeDir`: perpendicular to the torpedo's approach relative to the ship, toward the side whose first
   solid (sampled every 50 u to 600 u) is further; a tie goes to the approach's right. The Helm draws an EVADE arrow 70 px
   out. The sentence: `TORPEDO INBOUND: EVADE` below COLLISION. An enemy launch adds the `callout` chirp.
7. **Pings.** G (taken through the keyboard intercept) at the pointer, or a middle click that moved ≤ 6 px, on any console
   map: on the enemy when it is under the pointer (TARGET, riding its drawn marker) else the point (HERE); two rings and the
   label for 3 s, one per player at a time, at most six; the `ready` tone softly. Single player shows it at once (one a
   second). Online it is a `ping` aux message on its own reliable stream beside the callout (sharing the auxiliary
   sequence), never journalled; the authority relays it as a `ping` event to every seat at most once a second a player
   (its clock, live only), and the client limits itself the same way. The authority emits the relayed pings after the
   batch's admission frame completes, so a ping's event sequence is never counted in a journalled frame.
8. **Never a dead click.** `refusal` (situationModel) is the sim's own order: FIRE: NO GUNNER, TORPEDO FLYING (canCharge),
   WEAPONS OFFLINE (admitted but inert); LAUNCH: NO GUNNER then canLaunch's checks (TORPEDO FLYING, NO TORPEDOES, WEAPONS
   OFFLINE, OUT OF RANGE); the Helm's turn, auto-face, throttle and heading: ENGINES OFFLINE (the commands still go and
   apply once repaired). The runtime and the online session name a refusal on the key or button press; the button's outline
   flashes hot for 0.3 s and the reason takes the line under it for 1.5 s (`LAUNCH: OUT OF RANGE` on the row under the
   cards; `ENGINES OFFLINE` on the Helm hint line). LAUNCH is no longer disabled: it looks unready but takes the press.
9. **Notice overlap.** A top sit-down card moves to y 164 while the online notice shows; a bottom card stays.

Also: the off-screen arrows keep 44 px clear of a console's top (`STATUS_RESERVE`), so an edge arrow no longer sits on the
status sentence (seen in the visual check). Single player exposes `window.__ftliteDuel` only when the page set
`__FTLITE_STAGE__` before the duel started (the visual check's staging hook). The controls list gains Shift+W, the ping,
the right click and the middle drag. duelGates: median 221.8 s, 8 wins and 2 losses (unchanged).
