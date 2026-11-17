# Duel fire (one-page spec)

Owner, 2026-11-17: "we need fires to start and persist until put out." The duel (Single player and the online duel) has
no fire today; the sector game does (sim/hazards/fire.ts). Tier: content (owner's tiered process, grill Q31): no new
command, snapshot field or wire format. Fire lives in the interior SimState's existing `rooms.fire` and
`rooms.fireRepair`, which the duel hash (the interior's canonical flatten) and the duel snapshot already carry and
validate. One-page spec, build, one review, owner playtest. Decisions marked (rec.) were taken without asking.

## 1. Rules

1. **Ignition.** Only the crew ship (tactical ship 0) burns: it is the only ship with an interior. A hit lands in a
   tactical Room r (Weapons, Shields, Engines). A laser hit (`laser` event with `hit: true` fired by ship 1) rolls
   `DUEL_FIRE_CHANCE_LASER = 0.3` (rec.). A missile hit (`missileEnd` with `cause: 'ship'`, `target: 0`) rolls
   `DUEL_FIRE_CHANCE_MISSILE = 0.6` (rec.). On success, the interior room of r's repair point ignites at `FIRE_START`,
   unless it is already burning. A burning room makes no new roll. Rolls come from `interior.rng.hazards`, which is
   hashed, one draw per qualifying hit, in tactical event order, after stepDuel.
2. **Persistence.** A duel fire never goes out by itself (rec.): no oxygen, no shrink, no spread. Its intensity grows by
   `DUEL_FIRE_GROW = 1/60` per tick (1 per second) up to `FIRE_CAP` (16), so a neglected fire visibly fills the room.
3. **Damage.** Every `DUEL_FIRE_DAMAGE_TICKS = 900` ticks (15 s), counted on `(tick - baseTick) % 900 === 899`, each
   burning room raises its tactical Room's level by one, up to 2 (rec.). The damage uses the same cap as a weapon hit.
   Crew take no fire damage in the duel (rec.): the duel has no medbay or death loop.
4. **Putting it out.** A standing, present, conscious player holds Interact at a burning room's repair point (the same
   reach rule as repair). That player extinguishes instead of repairing. Work is tracked as whole units in
   `fireRepair`, stored as `units / DUEL_EXTINGUISH_UNITS` so the snapshot's [0, 1] rule holds:
   `DUEL_EXTINGUISH_UNITS = 720`, solo 4 per tick (3 s), each of two or more workers 5 per tick (72 ticks). Reaching
   720 calls `extinguishRoom`. While a room burns, its repair progress does not advance.
5. **Events** (derived, unhashed, appended to `d.events`): `fireStart {room}` (tactical Room), `fireWork {player, room}`
   and `fireOut {room, players}`.
6. **Rounds.** A new round is a fresh interior, so no fire carries over. The end card (stepDecided) runs no fire.
7. **SIM_VERSION** 39 → 40, and the goldens are re-blessed through scripts/bless-golden.ts. The duel goldens change;
   the basic golden changes only through SIM_VERSION.

## 2. Views

- **Interior.** The flames already draw from `rooms.fire`: the sector effects and the painted fire layer in the interior
  feel. Check that they draw in the duel interior and fix them if not. The repair marker of a burning room says
  `FIRE - HOLD E` and shows the extinguish progress in place of repair progress.
- **Readout.** A burning room's system row reads `FIRE` (in the damage red) in place of `OK`/`DMG n`, on the interior
  and on both console readouts.
- **Help.** The help line `HOLD E REPAIR` becomes `HOLD E REPAIR/EXTINGUISH`.

## 3. Tests

- **Ignition, deterministic.** For a fixed seed, a forced laser hit on ship 0's Room r ignites r's point room exactly
  when the hazards draw is below 0.3, and no burning room rolls again.
- **Persistence.** A burning room with no workers is still burning after 10 000 ticks, at `FIRE_CAP`.
- **Damage cadence.** Levels rise by one at each 900-tick boundary, and stop at 2.
- **Extinguish.** Solo takes exactly 180 ticks and two workers 72; a burning room's repair progress stays put; after
  `fireOut`, repair resumes.
- **Interaction.** Repair and fire events come in a stable order, and a round change clears fire.
- **Snapshot.** A duel snapshot taken mid-fire restores and continues identically (the existing snapshot test pattern).
- **Determinism.** The duel oracle and goldens pass after the bless.
