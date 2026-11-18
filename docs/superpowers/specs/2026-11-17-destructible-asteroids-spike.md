# Spike: destructible asteroids (2026-11-17)

Owner, 2026-11-17: "I want to do a spike on destroying the terrain. The asteroids in the gravity well map should be
destructible. this lends depth to the weapons role by allowing them to blow shit up."

A spike: a time-boxed playable prototype on its own branch (`spike/asteroids`) to answer the questions below. It is
not merged until the owner has played it and said yes; then it gets a proper spec and build.

## Questions the spike must answer

1. **Determinism and cost.** Today asteroids are static circles (`state.map.asteroids`) in a broad-phase grid built
   once, and the map is regenerated from the seed, not hashed or sent. Making them mutable means: asteroid state in
   the hash and in snapshots (size of the online snapshot?), the grid updated on change, and the oracle/golden
   procedure. Measure the snapshot growth and the per-tick cost.
2. **Feel.** Is shooting rocks fun, or a distraction from shooting the enemy? Does breaking cover add play?

## Prototype rules (start values, tune freely)

- Each asteroid gets HP by size: `hp = ceil(r / 10)` (so 2–6). Shown as cracks / a dimmer outline as it drops.
- **Laser:** a laser shot whose line is blocked by an asteroid (today it just misses for "no line of sight") hits the
  first asteroid on the line instead: −1 HP per shot, an impact flare. A laser can be fired at an asteroid on
  purpose: with no enemy in arc, a manual shot hits the first asteroid along the nose within range.
- **Torpedo:** a torpedo that touches an asteroid (today it ends with cause 'asteroid') does −4 HP and its blast
  ends it as now.
- **Breaking:** at 0 HP an asteroid breaks. Radius ≥ 30: it splits into 2 fragments of radius r·0.55, flung apart at
  40 u/s, which drift (gravity, no drag) and are destructible (hp by size). Radius < 30: it shatters into debris
  (visual only) and is gone.
- **Fragments as hazards:** moving fragments collide with ships and torpedoes like asteroids do (contact hull cost
  1). Fragments under radius 10 are removed.
- **Weapons-role depth:** blasting a rock between you and the Hunter opens a laser line; breaking a rock near the
  Hunter throws fragments into it; the Hunter hiding behind the belt can be dug out.

## Deliverables

- The prototype on `spike/asteroids` (SIM bumped on the branch only), playable in single player.
- A short report in `docs/superpowers/research/2026-11-17-asteroid-spike.md`: snapshot size before/after, tick cost,
  determinism (hash agreement over seeds, the duel-app smoke), what felt good, what didn't, and a recommendation
  (ship it as is / ship a simpler version / drop it).
- Screenshots: a rock being cracked, a split, fragments drifting.
