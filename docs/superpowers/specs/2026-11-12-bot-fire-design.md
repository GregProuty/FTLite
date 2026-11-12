# Bot Fire Handling (Demo-v) Design

Status: 2026-11-12, the user chose "ship the door fix, bot work next". Parent: Demo-ii spec section 10 (bot self-preservation).

## Problem (evidence from per-second logs of `gate-duo` seed 3 after door corner sliding, 2026-11-12)

1. **Doorway blind spot.** `retreatIntent` asks `roomAt` which room the bot is in; a door tile has none, but fire damage (`conditionRoomAt`) counts a doorway as the worse neighbouring room. A hurt bot standing in a burning doorway therefore takes fire damage while its retreat rule thinks it is safe, and stands still (seed 3: 32 to 0 health at (9.5, 7.0) beside the burning corridor).
2. **Idle while the ship burns.** With every route blocked by fire and the Medbay unusable, a hurt bot's ordinary duty search (which avoids burning rooms) finds nothing and the bot idles while fires spread until both crew die.
3. **Dithering.** Patching (1) and (2) independently made a hurt bot flip every tick at a doorway: in the doorway the escape rule sends it out; one step out, the duty fallback sends it back toward the fire.

Four ad-hoc patches were tried and reverted; this spec replaces them with one consistent policy.

## Requirements

- One policy, no flip-flop: for a fixed state a bot's choice must not alternate tick to tick between two neighbouring tiles. A new test drives a hurt bot at a burning doorway with no safe Medbay for 600 ticks and asserts it either leaves the area for good or holds Interact on the fire, and never reverses its movement direction more than twice.
- Doorways count as the room whose conditions hurt there (`conditionRoomAt`) for every "am I in fire" decision; the Medbay-presence decision keeps `roomAt` (healing applies only inside the room).
- A hurt bot never idles indefinitely while a fire burns that it could reach: if no safe Medbay route exists, it does hazard duty (fights fires), choosing deterministically.
- The existing bot tests (a)-(g) in `tests/bot.test.ts` keep their meaning; if one conflicts with the new policy, the conflict is stated and resolved in this spec's amendments with the reason (do not silently weaken a test).
- `gate-duo` seed 3 floor back to 25 (remove the `seed === 3 ? 0 : 25` exception and its comment); every other gate passes; the golden replay unchanged (the bot is not in the sim path).

## Amendments

(Filled during implementation.)
