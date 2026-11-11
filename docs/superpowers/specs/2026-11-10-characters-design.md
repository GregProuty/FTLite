# Characters: Assets, Complications and Head Starts (Increment 3-ii) — Design

Status: approved 2026-11-10 under the autonomous feature loop (`docs/roadmap.md` item 2); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §1 (design inspirations: traits with a cost), §5 (Crew: Assets, Complications, four pre-made characters), §7 (session flow: game-over shows per-crew skill gains), §11 item 3. Builds on `2026-11-10-skills-and-xp-design.md` (3-i, merged). With it the foundation's Increment 3 closes.

## 1. Goal

Make the four crew members different people. Each player slot has a fixed, pre-made **character** with a name, one **Asset** (a strength), one **Complication** (a drawback) and a **skill head start**. Assets and Complications are small multipliers on formulas that already exist (repair speed, movement speed, fire and suffocation damage, XP rate, cooling per unit, bleed-out time), so a character's difference is felt from the first minute without new mechanics. The lobby shows who each slot plays; the player panel carries the name; the game-over screen lists each crew member's skill gains over the run.

**Out of scope:** character selection or creation (slot `pid` always plays character `pid`; a selector is a later feature), portraits or new art (the existing per-player tint stays), perks (sub-project 4), any Combat-skill effect (boarders).

## 2. Decisions taken (recommended options)

| Question | Decision |
|---|---|
| Who plays whom | Fixed by slot: player 1 is character 0, and so on. No state is needed; `characterOf(pid)`. |
| Trait mechanics | One Asset and one Complication per character, each a named effect implemented as a multiplier read by an existing formula. No trait touches RNG, hit chances or the HUD threat list. |
| Names | Four original surnames, no reference to any franchise: **Okoro, Lindqvist, Reyes, Dubois**. |
| Head starts | Set at `createSimState` as XP equal to a level threshold, so the HUD and formulas see them as ordinary levels; game-over gains are measured from them. |
| Version | `SIM_VERSION = 7`: the state shape is unchanged but replay semantics are (head starts and traits change every formula), so old snapshots must not load. |
| HUD | Lobby: the slot's panel shows the character's name and traits once joined. In a run: the skills line becomes `Okoro  N3 E0 W0 S0 C0 R3`. Game over: four lines under the banner, one per crew member, listing skills that gained at least one level. |

## 3. The four characters (tuning data)

| Slot | Name | Asset | Complication | Head start |
|---|---|---|---|---|
| 0 | Okoro | **Quick Hands**: repair speed × 1.25 | **Heavy Boots**: movement speed × 0.85 | Repair 3 |
| 1 | Lindqvist | **Cool Head**: +1 cooling per coolant unit while seated at Engineering | **Flammable**: fire damage taken × 1.5 | Engineering 3 |
| 2 | Reyes | **Iron Lungs**: suffocation damage taken × 0.5 | **Slow Learner**: XP gained × 0.75 | Science 2, Navigation 1 |
| 3 | Dubois | **Sprinter**: movement speed × 1.2 | **Frail**: bleed-out time × 0.6 | Weapons 3 |

Each character's Asset and Complication are different mechanics, so no character cancels itself out. Every multiplier is a constant in `tuning.ts`.

## 4. Architecture

| Module | Responsibility |
|---|---|
| `sim/characters.ts` (new) | `Asset`, `Complication` constants; `CHARACTERS: readonly Character[]` (`{ name, asset, complication, headStart: { skill, level }[] }`); `characterOf(pid)` (`CHARACTERS[pid % CHARACTERS.length]`); the trait readers `repairTraitMult(pid)`, `speedMult(pid)`, `fireDamageMult(pid)`, `o2DamageMult(pid)`, `xpMult(pid)`, `coolingTraitBonus(pid)`, `bleedoutMult(pid)`, each a pure function of the character (1 or 0 when the trait is absent); `applyHeadStarts(state)`. |
| `sim/state.ts` | `createSimState` calls `applyHeadStarts` after the crew spawn. |
| `sim/skills.ts` | `addXp` multiplies `amount` by `xpMult(pid)` (the one place all XP flows through). |
| `sim/interact.ts` | repair progress multiplied by `repairTraitMult(pid)` as well as `repairMult(level)`. |
| `sim/movement.ts` | per-player speed `CREW_SPEED × speedMult(pid)`. |
| `sim/crew.ts` | `FIRE_DAMAGE × fireDamageMult(pid)`, `O2_DAMAGE × o2DamageMult(pid)`; `downCrew` sets `bleed = BLEEDOUT_TIME × bleedoutMult(pid)`. |
| `sim/heat.ts` | `coolingPerUnit` adds `coolingTraitBonus(occupant)` when an Engineering operator is seated. |
| `sim/tuning.ts` | `SIM_VERSION = 7`; the seven trait constants. |
| `render/hudModel.ts`, `hud.ts` | `HudPlayer.character { name, asset, complication }`; lobby lines; skills line with the name; `HudModel.summary: string[] | null` for the game-over screen. |

No new authoritative state: traits and head starts are functions of `pid`, which is already part of the state (crew order), and head-start XP lives in `skills.xp`. Nothing new to flatten. `SIM_VERSION` 7 rejects version-6 snapshots.

## 5. Trait semantics

- **Quick Hands** (repair × 1.25): the repair increment per tick becomes `DT × repairMult(level) × repairTraitMult(pid) / REPAIR_TIME_X` for fire, breach and power alike. Revive is unchanged. Okoro starts at Repair 3, so from the first tick her combined multiplier is `1.25 × 1.18 = 1.475` (a fire in about 4.07 s instead of 6 s).
- **Heavy Boots / Sprinter** (speed × 0.85 / × 1.2): `movementSystem` moves `moveX × CREW_SPEED × speedMult(pid) × DT`; collision and door rules unchanged.
- **Cool Head** (+1 cooling per unit): `coolingPerUnit = HEAT_COOL_UNIT + floor(HEAT_COOL_SKILL × level) + coolingTraitBonus(occupant)` while a Conscious operator sits at an online Engineering; baseline (no skill term, no trait) otherwise.
- **Flammable** (fire damage × 1.5) and **Iron Lungs** (suffocation × 0.5): applied to the per-tick environmental damage in `crewSystem`; debris impact damage is unaffected.
- **Slow Learner** (XP × 0.75): inside `addXp`, so continuous, lump, Life Support and Repair XP are all scaled; head starts are set directly in `xp` and are not scaled.
- **Frail** (bleed-out × 0.6): `downCrew` starts the timer at `BLEEDOUT_TIME × 0.6 = 18 s`; the fire/low-oxygen bleed multiplier still applies on top.
- **Head starts**: `applyHeadStarts` writes `state.skills.xp[xpIndex(pid, skill)] = XP_THRESHOLDS[level]` for each entry of each spawned crew member (Science 2 and Navigation 1 for Reyes), once, at creation. Everything else starts at 0.
- **Lookup guards**: every trait reader takes a crew `pid` (a non-negative integer); callers that may hold `-1` (an empty seat) guard first, so `coolingPerUnit` keeps its existing online check and adds `occ >= 0 ? coolingTraitBonus(occ) : 0`.

Every reader takes `pid` so a future selector only has to change `characterOf`.

## 6. Tuning

```ts
SIM_VERSION = 7
TRAIT_REPAIR_MULT = 1.25        // Quick Hands
TRAIT_SLOW_SPEED = 0.85         // Heavy Boots
TRAIT_FAST_SPEED = 1.2          // Sprinter
TRAIT_COOLING_BONUS = 1         // Cool Head, per coolant unit
TRAIT_FIRE_DAMAGE = 1.5         // Flammable
TRAIT_O2_DAMAGE = 0.5           // Iron Lungs
TRAIT_XP_MULT = 0.75            // Slow Learner
TRAIT_BLEEDOUT = 0.6            // Frail
```

## 7. HUD

- **Model:** `HudPlayer.character: { name: string; asset: string; complication: string }` (display names such as `Quick Hands`), present for every slot including unjoined ones (the slot's character is fixed) and when there is no state. `HudModel.summary: string[] | null`: in the `gameover` phase, one line per crew member `Okoro: Repair 3 -> 4, Science 0 -> 1` listing only skills whose level rose above the head start (a crew member with no gain reads `Okoro: no skill gains`), else `null`. Levels are compared as `levelFor(xp)` now versus the head-start level (0 where none).
- **Pixi:** lobby panels for an empty slot keep `P1: press Interact to join`; a joined slot in the lobby shows line 2 `Okoro` and line 3 `Quick Hands / Heavy Boots`. In a run, line 4 becomes `Okoro  N0 E0 W0 S0 C0 R3`. Game over: up to four `DIM` text rows under the banner glyphs (at `y = 88 + k × LINE`, centred like the banner) showing `summary`, hidden in every other phase.

## 8. Testing

All under node, no pixi. New: `tests/characters.test.ts`. Extended: `tests/skills.test.ts`, `tests/interact.test.ts`, `tests/movement.test.ts`, `tests/crew.test.ts`, `tests/heat.test.ts`, `tests/snapshot.test.ts`, `tests/hud.test.ts`.

- **Data:** four characters with distinct names, an Asset and a Complication each, no character whose Asset and Complication touch the same mechanic; `characterOf(4)` wraps to character 0; every trait reader returns the neutral value for characters without that trait.
- **Head starts:** the complete fresh XP matrix of a four-player state equals exactly `XP_THRESHOLDS[3]` for Okoro's Repair, Lindqvist's Engineering and Dubois's Weapons, `XP_THRESHOLDS[2]` for Reyes's Science and `XP_THRESHOLDS[1]` for Reyes's Navigation (unscaled by Slow Learner), and 0 in every other entry; the HUD skills show the levels; `stationOutput` for Dubois seated at Weapons uses level 3.
- **Effects:** Okoro (Quick Hands and Repair 3, combined multiplier `1.25 × repairMult(3) = 1.475`) completes a fire or power repair in `6 / 1.475 ≈ 4.07 s` and a breach in `8 / 1.475 ≈ 5.42 s`, each asserted incomplete two ticks before the computed completion tick and complete two ticks after; two Okoros cannot exist, so the cooperative case pairs Okoro with Lindqvist (Repair 0, no trait) and asserts the sum of their rates; revive time is unchanged for Okoro; Okoro's speed is 0.85 × and Dubois's 1.2 × of `CREW_SPEED` over a one-second straight run on open floor, and the existing `movement.test.ts` expectations for player 0 are updated to Okoro's 0.85 (or use a neutral character); Lindqvist seated at Engineering gives `coolingPerUnit = HEAT_COOL_UNIT + 1 + floor(0.2 × 3)` and Okoro gives `HEAT_COOL_UNIT + 0`; Lindqvist in a burning room loses `FIRE_DAMAGE × 1.5 × DT` per tick and Okoro `FIRE_DAMAGE × DT`; Reyes in a suffocating room loses `O2_DAMAGE × 0.5 × DT`; Slow Learner scales every XP path: Reyes gains `0.75 × XP_RATE × DT` per productive Navigation tick, `0.75 × XP_PER_EVADE_ROLL` per roll, `0.75 × XP_PER_SHOT` per shot when seated at Weapons, `0.75 × XP_RATE × HAZARD_DT` per Life Support delivery and `0.75 × XP_RATE × DT` per repair tick, while Okoro gains the full amounts, and `addXp(state, 2, skill, 100)` adds 75 against 100 for `pid 0`; Dubois downed through `downCrew` starts at `0.6 × BLEEDOUT_TIME = 18 s` and, with a Conscious teammate present, dies after 18 s on clean floor and after 9 s in fire or low oxygen, while Okoro starts at `BLEEDOUT_TIME`; a debris impact hurts Lindqvist by exactly `DEBRIS_CREW_DAMAGE` (Flammable does not apply).
- **Existing tests touched by the characters:** `movement.test.ts` (player 0 speed is now Okoro's 0.85 ×), `hud.test.ts` (Lindqvist's skills vector starts `[0, 3, 0, 0, 0, 0]`, so the mixed-levels expectation becomes `[0, 3, 10, 0, 0, 0]`), and any interact or crew test that assumed a level-0, trait-free player 0 or 1; each is updated to the character's values rather than weakened.
- **Snapshot:** version-6 snapshots rejected; round trip unchanged in shape; same-seed determinism with the four characters.
- **HUD model:** `character` fields for slots 0 to 3 with and without state; the game-over `summary` lists gained skills with head-start baselines (`Reyes: Science 2 -> 3` after XP, `Okoro: no skill gains`); with the same completed state passed under the `lobby`, `paused` and `running` phases (the session keeps the finished state when it returns to the lobby) the summary is `null`, and under `gameover` it is the exact list.
- **Survival gate:** seeds 1 to 3 pass; the bot crew now has Okoro and Lindqvist (two players), so repair and movement speeds differ per crew member.
- **Golden replay:** re-blessed once (version 7, head starts, traits) with the cause recorded.

## 9. Gate

Added to `docs/gates.md` as "Increment 3-ii" (closing the foundation's Increment 3):

- The characters, skills, interact, movement, crew, heat, snapshot and HUD tests pass; typecheck and build pass; survival gate seeds 1 to 3 pass.
- Manual, two players: the lobby shows `Okoro / Quick Hands / Heavy Boots` and `Lindqvist / Cool Head / Flammable` once joined; in the run Okoro's panel reads `Okoro  N0 E0 W0 S0 C0 R3` and Okoro visibly walks slower than Lindqvist; a game over lists each crew member's skill gains.

## 10. Open questions deferred

- A character selector in the lobby (any slot picks any character): later, once there are more than four characters or players ask.
- Portraits: the art budget is unchanged; the per-player tint remains the identifier.
