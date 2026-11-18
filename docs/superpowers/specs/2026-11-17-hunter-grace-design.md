# Hunter grace (2026-11-17)

Owner, 2026-11-17: "give the calm 30 seconds. the battle track is always tied to the enemy being hostile". Asked how the
Hunter spends those seconds, the owner chose: it stays put, and the crew can provoke it early.

## Rule (sim, SIM_VERSION 44 → 45)

- Each round opens with a grace of `HUNTER_GRACE_TICKS` = 1800 ticks (30 s at 60 Hz), counted from the round's
  `baseTick`. During it the Hunter holds:
  - no thrust and no turn, so it keeps only its spawn drift, which slows;
  - no laser charge and no missile launch.
  
  It still records the crew's trail and runs its repair timers, as before.
- The Hunter turns hostile, for the rest of the round, when the grace runs out, or as soon as the crew has fired this
  round: a laser release (`systems[0].shots > 0`) or a missile launch (`systems[0].missilesLaunched > 0`). Both counters
  start at 0 each round, because the rematch builds a fresh tactical state.
- `hunterHostile(d)` in `sim/duel/hostility.ts` is the one predicate. `stepDuelTick` reads it before the Hunter thinks
  and passes `!hostile` to `stepDuel` as `hunterHold`, which `hunterThink` honours. No new state: it is derived from the
  tick, `baseTick` and the crew's counters, so the hash, snapshot and wire are unchanged in shape.
- Bless: baselines at 44, the version-only bless at 45, then this change and a same-version bless.

## Music

The battle track follows `hunterHostile` exactly. The scene passes it into the audio frame as `hostile`, because audio
imports nothing from sim at runtime. The music is calm through the grace and crossfades to battle on the tick the Hunter
turns hostile. After the round, the music state machine's usual calm-down applies. This replaces the distance latch in
duel polish i §F.

## Tests

- `tests/hunterGrace.test.ts`:
  - no charge, launch, thrust or turn through 1800 ticks, then hostile and charging;
  - a crew missile launch provokes it at once;
  - each round counts its grace from its own `baseTick`.
- Tests pinned to scripted-duel moments are re-pinned:
  - the checkpoint and snapshot split moves from seed 7 tick 5156 to seed 4 tick 5193;
  - the scripted command-kinds test moves from seed 4 to seed 5;
  - the Cutter scripted length is now 10320;
  - the oracle alias check's first tick is now 81.
