# Round 1 response (spec revised to rev after d4ef7118)

Reviewed `round-1.json` against the subject at `d4ef7118`. 12 accepted, 0 rejected, 0 deferred. Round 1 has no prior IDs. The spec was rewritten in one pass.

## R1-F1 [P1]: The continuous throttle is quantised to quarters, and any reverse becomes full reverse

Confirmed: physics.ts L32 rounds the thrust to quarters, and L53 makes any reverse full reverse. §3 now says `flyShip` rounds the axis to thousandths and clamps it to [−1, 1], and reverse is proportional to |q|. It defines `crewThrust`, and notes that whole axes and the Valkyrn's levels fly exactly as today. The sentence "the flight code is unchanged" is gone.

## R1-F2 [P1]: The spec never says which of §2-§5 apply to the Valkyrn

Confirmed: defs.ts L100-L101 has the Valkyrn classes in the crew slot, and step.ts L284-L286 has `helmHoldsUnattended`. The new §1 adds a `newtonianHelm` class flag, true only for the Cutter. The Valkyrn keeps `DEFAULT_FLIGHT`, the `throttle` command and its notches, A/D turning, aim-to-heading and its scripted pilot. The `throttle` command now stays and is `unavailable` for `newtonianHelm` classes.

## R1-F3 [P1]: 'Steering clears the held heading' reverses today's aim rule

Confirmed: step.ts L283 turns a held aim into the held heading. §4a keeps today's rule for every class, so on release the nose settles on the last aim, and there's no class gate. A test pins the Valkyrn's behaviour.

## R1-F4 [P1]: The code has no per-slot flight tuning

Confirmed: duel.ts L24 and L32, and predict.ts's defaults. §2 adds `flightFor(state, i)`, used by `stepDuel`/`flySlot` and as the default tuning for `predictPath` and `predictFlight`. The three callers are listed. `stepDuel`'s `tuning` argument stays as a test override.

## R1-F5 [P1]: The top speed cap's rule is not exact

Confirmed. §2 now gives the algorithm the reviewer proposed: thrust is capped at max(400, s0), then gravity and the edge are added uncapped. It runs only on the drag-0 path. The test now reads "never exceeds max(400, the speed before thrust)".

## R1-F6 [P1]: The boosted turn's dead band leaves out auto-face, and the boost rule depends on itself

Confirmed: hunter.ts L41-L48 and tuning.ts L125-L127. The rule changed instead of the bands: a tick is boosted only when the target is far, meaning |d| > 4 indices for an aim or held heading, or outside sin 5° for auto-face. That's decided before the step by one pure function, `helmBoost`. Inside the band, today's 1× bands finish the turn, so the boosted step never reaches them. The Hunter's turn functions are untouched. `defs.ts` asserts 2 × step < 4.

## R1-F7 [P1]: The authority's held-input lists and checkpoint schemas don't know the new fields

Confirmed: core.ts L329 and L435, and checkpoint.ts L40. §7 adds the fields to all three schemas, to the expiry check and to the pause clear. It states the 250 ms lost-release bound (105 per mille, 120 gas), and §8 tests it.

## R1-F8 [P1]: Removing the `throttle` command and A/D turning breaks consumers the spec doesn't list

Confirmed: onlineSource.ts L141-L155 and scene.ts L238, among others. §3, §4a, §6 and §7 now cover:
- the throttle base and prediction, online and local;
- `sitThrottle`;
- telemetry;
- the key actions and Shift+W;
- the controls list;
- the turn buttons, which become thruster buttons;
- the turn refusal;
- the predicted path;
- the UI probe.

The puffs now read an unhashed `d.helmVent` scratch, written by the sim each tick.

## R1-F9 [P2]: The stand-in budget of 4 doesn't match Engineering's start of 3

Confirmed: engineering spec L365. The §5 merge note now:
- marks the start split as an owner call at merge, recommending that Engines start at 4;
- says the engine factor reads the Engines bars and only the cap reads ENGINE;
- says SIM_VERSION goes to the spike that merges second, which covers pew pew too.

The losing-bars rule is now exact.

## R1-F10 [P2]: Gas rules contradict each other

Confirmed. §4 now:
- uses `rcsGas ≥ 8`;
- gives the exact accumulator steps;
- resets `rcsAcc` at a full tank;
- runs the compressor every running tick.

§7 lists the snapshot bounds.

## R1-F11 [P2]: Some acceptance tests can't be reached with the stand-in budget

Confirmed. `HELM_BARS` is now a `createDuel` option, and §8 states each test's setup: compressor 0 for the 1000 test, the start cap of 750, and HELM_BARS 3 with compressor 3 for ENGINE 0.

## R1-F12 [P2]: The scripted crew still turns with moveX

Confirmed: scripted.ts L321. §4a makes ignoring `moveX` turning for `newtonianHelm` classes an authority rule, and moves the scripted crew to `aim` or `face`.

## Also changed

- §3 renames the crew throttle to a new field `thrMille`, because the `throttle` level field stays for the Valkyrn.
- §7 gives the full step order, including the `helmVent` write.

## Files changed

- docs/superpowers/specs/2026-11-18-playtest2feedback-design.md

<!-- end -->
