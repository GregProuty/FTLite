# Pew pew and manual weapons (W-1, W-2, W-3): design

Date: 2026-11-18. Owner, after good feedback on the Weapons role: "we need to build a new weapon and make it the primary. This is the pew pew weapon … a skill shot weapon that shoots a projectile in a straight line. It can fire 3 shots if you click rapidly, but it takes time to recharge … it can hit the enemy for damage and also hit missiles out of the air and asteroids. … we are keeping the beam weapons but giving those an auto mode off … and we are adding an auto mode off on the torpedos also, allowing you to turn off homing and fly it manually like a second ship but much faster. In manual fire mode for the pew pew and beam the weapons officer is aiming the weapon within the range cone."

The owner's decisions in brainstorming:
- Aiming is inside the weapon's cone.
- Pew pew is manual only.
- Rounds stop on rocks for now, because destructible asteroids come in the next demo.
- A manual torpedo flies like the Helm with the throttle fixed.
- The Hunter gets pew pew too, both to attack and to shoot down our torpedoes.

"Beam weapons" means today's laser (there is no beam weapon). "Missiles" means torpedoes (`Missile` in code).

Starting point: master at SIM_VERSION 53. The duel weapons live in `sim/tactical/` (`defs.ts`, `tuning.ts`, `weapons.ts`, `missiles.ts`, `gun.ts`, `hunter.ts`). Commands go through `net/contracts.ts` (`DuelCommand`), `net/codec.ts` (`duelWire`) and `authority/duelRules.ts`. They are admitted in `sim/duel/step.ts` (`DUEL_KINDS`, `WEAPON_ORDER`).

All numbers below are starting values, kept in `sim/tactical/tuning.ts` and tuned in playtest.

## 1. Pew pew (W-1)

**Who has it.** The crew Cutter and the enemy Hunter. The Valkyrn solo ships keep the minigun and get no pew pew; the Cutter's and Hunter's other weapons stay as they are.

**Aim.** The Weapons officer aims with the mouse on the Weapons map. The aim is an absolute world angle, clamped into a cone of ±60° (`PEW_ARC`) about the ship's heading at the moment of firing. The Weapons map draws the cone edges and the aim line in CRT amber, as `dim` and `mid` tones from the ramp.

**Charge.** The gun holds 3 shots (`PEW_SHOTS`). It stores charge in units of a third of the bar and refills at one third per 60 ticks (`PEW_RECHARGE_TICKS`), so a full refill takes 180 ticks (3 s).
- A fire command with at least one full third stored spends a third and fires one round.
- A fire command with less than a third stored is refused with "NO CHARGE", and nothing is queued.
- Several fire commands in one tick fire at most one round.
- Recharge continues while charge is below 3 thirds. The partial third is kept between shots.
- Recharge does not change with Weapons room damage (§6 decision 4).

**Rounds.**
- Rounds are pooled entities, `PEW_POOL` = 16 slots shared by both ships, with a deterministic slot pick and the oldest round reused when the pool is full.
- Each round flies straight at 900 u/s (`PEW_SPEED`) for 30 ticks (`PEW_LIFE`), giving a range of about 450.
- It leaves the muzzle at the ship's position plus its nose offset, and it does not inherit the ship's velocity, so its aim is exact and predictable. Gravity does not act on it.
- Each tick, its path is checked as a swept segment, reusing the minigun's segment test from `gun.ts` `stepRounds`. The first thing along the segment is hit, in this order: rock, planet, the other ship's torpedo, the other ship. A round never hits its own ship or its own ship's torpedo, so you can shoot while flying a manual torpedo.
- A round that hits anything ends.

**Damage.**
- A hit on a ship with at least one shield layer up strips one layer. It does no hull damage.
- A hit on a ship with no shield layers does 1 hull damage (`PEW_HULL`).
- Pew pew never raises a room's damage level. Rooms stay the laser's and torpedo's job.
- A hit on the other ship's torpedo destroys it, with a `missileEnd` event of cause `'shot'`.
- A round that hits a rock or the planet ends with no other effect. The next demo's destructible asteroids will make pew pew chip rocks; that is out of scope here.

**Hunter AI** (`hunter.ts`). The Hunter has a pew pew with the same numbers and decides each tick, with every random draw from the duel's seeded RNG:
- **Attack.**
  - **When it shoots:** the crew ship is within 450 and inside the Hunter's cone, and the Hunter has a third stored.
  - **How it aims:** at the crew ship's predicted position, solving lead for the round speed, plus a seeded aim error of ±`HUNTER_PEW_ERROR` (start at 4°).
  - **How often:** it fires in bursts of up to 3 rounds, `HUNTER_PEW_GAP` (start 12 ticks) apart. After a burst it waits until it has 3 thirds again, which keeps it from spamming.
- **Defence.**
  - **When:** an armed crew torpedo is within 300 and inside the Hunter's cone.
  - **Odds:** each tick it tries with chance `HUNTER_PD_CHANCE` per second (start 0.5), drawn once per tick from the seeded RNG.
  - **Aim:** lead on the torpedo, with the same error.
  - **Priority:** defence comes before attack in a tick where both apply.
- **Tuning.** `tests/duelGates.test.ts`-style gates must still show a scripted crew winning, and the numbers are tuned until that holds (§5).

**Console and feel.**
- **Weapon card.** A PEW card comes first on the Weapons station (`ui/duel/WeaponsStation.tsx`). It shows 3 charge pips, each filling as its third recharges.
- **Pick-up keys.** Pew pew is not one of the weapons the 1 and 2 keys pick up, because it has no target.
- **Sound.** The fire sound is a Kenney Sci-fi laser sample added as `sfx.pew` in `audio/soundBank.ts`, with the existing pitch variation. Hits use the existing hit sounds.
- **Refusal.** An empty click gives the "NO CHARGE" refusal through the Feel-ii refusal path.
- **Rounds on screen.** The tactical layer draws rounds as short streaks. On the console maps they are amber `hot`, as Feel and CRT do. In the interior view they appear only as hits.

## 2. Manual laser (W-2)

**The toggle.** Each ship slot has a laser mode, AUTO or MANUAL, which is sim state. It starts as AUTO, and the Hunter is always AUTO.
- Z toggles it, as does clicking the `AUTO` / `MAN` tag on the laser card.
- A `laserMode {manual: boolean}` command sets it.

**AUTO.** Unchanged from today: the crew picks a room in the enemy window, and the laser auto-fires when charged and eligible.

**MANUAL.**
- **No auto-fire.** The laser charges as today but never fires on its own, so the room lock no longer causes firing.
- **Firing.** Space sends `laserFire {aim}`, with the same aim and cone clamp as pew pew (±60°, the laser's existing arc). With a full charge, the laser fires its shot or burst along the aim. Without one, it is refused with "NO CHARGE", as the existing Space press is.
- **What the beam hits.** It is an instant hit to 450 along the aim line.
  - The first rock or the planet stops it, with no effect.
  - A torpedo in the path is not hit; the beam passes through.
  - Hitting the enemy ship applies today's `shoot` effects: it strips 1 shield layer, or 2 on the weak frequency. With no shields, it raises the level of the room under the hit point by one (capped at 2) and does 2 hull damage. The room is found the same way a torpedo's self-hit finds the room under its impact point.
- **Bursts.** For the Cutter's double laser, each shot of the burst uses the aim it was fired with, re-checked for what it hits at its own tick.
- **The laser waits during a torpedo flight.** The laser stays frozen while its own ship's torpedo is in flight (`laserFrozen`), in both modes.
- **Aim feedback.** In MANUAL, the Weapons map shows the laser's aim line when the laser is charged, as a dashed `main` line, so you can see where the beam will go.

## 3. Manual torpedo (W-3)

**The toggle.** Each ship slot has a torpedo mode, AUTO or MANUAL, which is sim state. It starts as AUTO, and the Hunter is always AUTO.
- X toggles it, as does clicking the tag on the torpedo card.
- A `torpMode {manual: boolean}` command sets it.
- The mode is copied onto the torpedo when it launches, so changing the toggle during a flight does not affect a torpedo already flying.

**AUTO.** Unchanged: launch rules, homing and the room lock all work as today.

**MANUAL.**
- **Launch.** F launches it when none is in flight, the magazine is above 0 and Weapons room damage is below 2. It needs no target lock, and the 360 launch range does not apply. A `torpLock` never auto-launches in MANUAL.
- **Flight.** It launches forward, as today. After launch it is flown like the Helm with the throttle fixed:
  - **Thrust:** full thrust (`MISSILE_THRUST`) every tick while fuel lasts, then it coasts. It has no drag, so it outruns any ship.
  - **Turning:** A and D turn it at the torpedo's turn rate.
  - **Hold heading:** a right click or drag on the Weapons map sets a heading for it to hold. It turns toward that heading at its turn rate, using the same hold logic as the Helm's `helmTurn`. A or D cancels the hold.
- **Input.** Both arrive in the Weapons seat's `HeldInput`, as the new fields `torpTurn` (-1, 0 or 1) and `torpHeading` (a heading index, or none).
- **Unchanged:** fuel, life, arming time, gravity and every collision rule (planet, rocks, map edge, ships, other torpedoes, pew pew rounds).
- **What it damages.** On a ship hit it raises the level of the room under the impact point by one and does 3 hull damage. It ignores any room lock.
- **The Weapons map.** It follows a manual torpedo while it flies (the camera's existing follow), and goes back to the previous view when the torpedo's flight ends.
- **Keys.** While a manual torpedo is flying, the Weapons seat's A and D steer it instead of walking. The Weapons officer is seated, so walking isn't affected.

## 4. Commands, state and determinism (all parts)

**New commands.**
- `pewFire {aim}` (W-1).
- `laserMode {manual}` and `laserFire {aim}` (W-2).
- `torpMode {manual}` (W-3).
- `aim` is a heading index 0..255 with a fractional part sent as an integer, `aimAcc`, like `headingAcc`. It is never a float angle.

**Wiring.**
- **Where every command is added:** `DuelCommand`, `duelWire` (zod), `authority/duelRules.ts`, `DUEL_KINDS`, and an explicit place in `WEAPON_ORDER`.
- **Held input:** the `HeldInput` fields (`torpTurn`, `torpHeading`) go into the held-input schema.
- **Inputs:** local inputs come from `app/duel/runtime.ts` and online ones from `app/duel/onlineDuel.ts`.

**State and hashing.**
- **Per slot:** pew charge, laser mode and torpedo mode.
- **Per torpedo:** a manual flag.
- **The pew round pool.**
- **Where the new state goes:** the tactical hash (`sim/tactical/hash.ts`), the duel snapshot and its validation (`sim/duel/snapshot.ts`, `sim/snapshotValidation.ts`).

**Determinism.**
- **Arithmetic:** the sim keeps to the existing rules: only + − × ÷ and sqrt, heading tables, and the seeded RNG for the Hunter.
- **Aim clamp:** done in heading-index space.
- **SIM_VERSION:** goes up once per merged part (53 → 54 → 55 → 56), or once in total if the parts merge together.
- **Re-recording:** the duel goldens (`tests/golden/duel-1.json`, `duel-rematch.json`) and the determinism fixture are re-recorded once per bump, with the trajectory-pinned tests updated.
- **What must hold:** `npm run test:determinism` passes on Node, Electron and Firefox.

## 5. Tests and checks

- **Pew charge:**
  - 3 rapid fires succeed and the fourth is refused.
  - After 60 ticks one shot is available, and after 180 ticks three are.
  - Mashing every tick fires exactly once per 60 ticks.
  - Several commands in one tick fire once.
- **Rounds:**
  - Rounds fly straight and are not bent by gravity.
  - A round ends at life 30.
  - It hits the first thing on its segment, in the stated order.
  - It never hits its own ship or its own torpedo.
  - A round fired at a torpedo destroys it, with cause `'shot'`.
  - A rock stops a round with no effect.
- **Damage:** a hit on shields strips one layer with no hull damage; with no shields it does 1 hull damage. No room level ever changes.
- **Cone:** an aim outside ±60° is clamped to the edge.
- **Hunter:**
  - It fires only in cone and range, and it bursts.
  - It sometimes shoots down a crew torpedo. A seeded scenario checks a known outcome, and the rate over many seeds is within a band.
  - The scripted crew still wins the existing duel gates (`tests/duelGates.test.ts`, `duelScripted`), with the numbers tuned until it does.
- **Manual laser:**
  - It never auto-fires in MANUAL.
  - Space fires along the aim.
  - It damages the room under the hit point.
  - Rocks block it and torpedoes don't.
  - AUTO behaviour is unchanged, checked by the existing laser tests.
- **Manual torpedo:**
  - It launches with no lock and out of range.
  - A and D turn it, the held heading converges, and thrust is always full until fuel runs out.
  - It damages the room under the impact point.
  - The mode is fixed at launch.
  - AUTO behaviour is unchanged: `tests/torpedoGuidance.test.ts` still passes.
- **Network:** the codec round-trips every new command and field, and the authority rejects malformed aims (out of 0..255) and wrong-seat senders as it does for the other weapon commands.
- **UI:**
  - The PEW card and its pips.
  - The `AUTO` / `MAN` tags toggle and show the state.
  - Z and X are in the Settings controls list.
- **Final checks:** `npm run typecheck`, `npm test`, `npm run test:determinism` and `npm run build`.
- **Screenshots for the owner gate:** the Weapons map showing the cone, aim line and rounds; the PEW card with its pips; a manual torpedo in flight.

## 6. Decisions and out of scope

1. Pew pew is manual only, with no auto mode.
2. Pew pew never damages rooms. Each weapon has its own role: pew pew works on shields and hull and defends against torpedoes, the laser takes out systems, and the torpedo is the heavy hit.
3. The laser does not hit torpedoes; only pew pew and other torpedoes do.
4. Pew recharge is not slowed by Weapons room damage in this pass. This is the first tuning knob if it proves too strong.
5. Rounds stop on rocks with no effect. Destructible asteroids are the next demo (`spike/asteroids-ii`), which will add pew pew damage to rocks.
6. Out of scope:
   - the Valkyrn ships;
   - the sector (non-duel) mode;
   - pew pew for any ship other than the Cutter and the Hunter;
   - changing modes during a torpedo flight.

## 7. Build order

Each part is planned, built, reviewed and merged before the next. Each ends with the owner's look and feel check.

1. **W-1, pew pew:** crew and Hunter, point defence, console, sound, and the cone and aim on the map.
2. **W-2, manual laser.**
3. **W-3, manual torpedo.**
