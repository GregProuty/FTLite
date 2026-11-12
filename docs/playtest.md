# Two-player playtest script (Demo-i)

Date:
Players: 2
Seed:
Build (commit):

Run `npm run dev` with two keyboard players. Tick each step as seen and write what went wrong under `Notes:`. Triage: a visual overlap, a wrong or missing string, a control that does not do what the card says, or a crash is fixed on the branch before merge; a balance observation is recorded with its figures; a design wish goes to the spec's follow-ups.

- [ ] Lobby: the banner, the controls card and the `Runs N  Best N` line show.
  See: the title banner; the six controls-card lines; a `Runs N  Best N` line, each within the screen width.
  Notes:
- [ ] Join: two keyboards join.
  See: pressing each keyboard's join key (`E` on keyboard 1, `Enter` on keyboard 2; the banner calls them Interact) lights a second block; two blocks are lit and both are named.
  Notes:
- [ ] Start: start the run; the panels fill.
  See: the clock, threats and power panels fill; the director line shows the ship's quirk.
  Notes:
- [ ] Sit: one player at Engineering, the other at Weapons or Science.
  See: Engineering shows its rows, the pool and coolant; the other console shows its own list; the seated players are marked at their consoles.
  Notes:
- [ ] Fire: a fire is put out.
  See: a fire shows in the threats panel and in its room; holding Interact in the room puts it out and the row clears.
  Notes:
- [ ] Debris: a debris warning and an enemy encounter.
  See: the enemy row with its shield bracket and weapon charge; strip a layer with an untuned beam, scan, pierce with a tuned beam; see the flee and the surrender notice; hold fire for the scrap once and kill once across the session; for debris, Science scans, Weapons shoots or Navigation evades. Do not jump while the enemy is present. The shield layer regrows in 6 s, so scan for the frequency (or fire a torpedo) to reach the hull.
  Notes:
- [ ] Jump: the drive is ready; take Navigation and jump.
  See: the notice `JUMP READY   someone take Navigation`; sit, pick `Node 2a` or `2b`, Confirm; the threats clear and the clock reads `node 2/8`.
  Notes:
- [ ] Event: an event node.
  See: both players see the event notice; the operator picks a choice and the effect lands (scrap, hull or a hazard).
  Notes:
- [ ] Shop: a shop node.
  See: the shop price line; buy hull from Navigation; `Scrap` drops in the footer.
  Notes:
- [ ] Boarding: boarders arrive.
  See: the boarding notice and a boarder in a room; fight it from inside that room until it dies.
  Notes:
- [ ] Game over: the run ends in defeat or victory.
  See: the summary lines (score, ship, best, unlocks) and the gains.
  Notes:
- [ ] Restart: Confirm restarts.
  See: the same seed starts again; the lobby shows the new `Runs` and `Best` values.
  Notes:
