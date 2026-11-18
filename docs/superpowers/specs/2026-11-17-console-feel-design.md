# Console feel: "this just works, and it's awesome" (2026-11-17)

Owner, 2026-11-17: "I want the players to have the feeling of Oh this just works and this is fucking awesome when
they sit down to either helm or weapons. think deeply about how to achieve this with visual information, shortcuts,
quality of life ect. It should be easy to pilot the ship and blow shit up, but harder to master."

Builds on FTL targeting (SIM 49). Mostly presentation and input; the few sim touches are marked **(sim)**.

## 0. What the first playtest told us, and the principles

The two-PC test said weapons were "difficult and not intuitive". Looking at the consoles as a new player:

- **Nothing tells you what to do first.** You sit, see a big amber map, a contact 4000 units away, panels of words.
  There is no first verb.
- **The payoff is far away.** The enemy starts ~4000 away; the laser reaches 450 and needs it inside a ±60° arc
  only Helm controls. Weapons can't succeed alone and can't see why they're failing ("NO SHOT").
- **Success is quiet.** A hit is a thin beam and a number change in a side panel.
- **Hold-to-turn is fiddly.** Helm steers by holding A/D against a 150°/s turn and gravity; pointing at a moving
  enemy is a skill before it is fun.

Principles:
1. **One obvious verb per seat, lit up, the moment you sit.** Helm: "point at the enemy". Weapons: "click a
   weapon, click a room".
2. **Assist floor, skill ceiling.** Every hard thing gets an assist that gets you to "good". Mastery is doing better
   than the assist (gravity slingshots, holding the arc while dodging, room choice, frequency, burst timing).
3. **Every action answers within 100 ms, and every success is loud** (light, sound, shake, a word on screen).
4. **The two seats feed each other visibly.** Helm sees what Weapons needs; Weapons sees what Helm is doing for them.
5. **Never a dead click.** Anything you press either works or says why not, on the thing you pressed.

## 1. Sitting down (both seats)

- **Sit-down card**: for 4 s after sitting (or until the first action), a small card over the console names the
  seat's goal and its 3 keys, e.g. HELM: `POINT AT THE ENEMY · A/D TURN · W/S THROTTLE · SPACE: AUTO-FACE`.
  WEAPONS: `CLICK A WEAPON, THEN A ROOM · 1 LASER · 2 TORPEDO`. Shown the first 3 sits per session, then never.
- **The goal glows**: the one control that matters now pulses gently (Helm: the enemy edge arrow; Weapons: the LASER
  card while it has no target). It stops once used.
- **Auto-frame**: on sitting, the camera zooms to fit own ship and the enemy (clamped 0.25–1.0), so the enemy is on
  screen, not an arrow. The existing SNAP/C still toggles.
- **Readable at a glance**: the top line is one status sentence in plain words, chosen by priority:
  `ENEMY OUT OF RANGE: CLOSE TO 450` → `ENEMY OUT OF ARC: TURN RIGHT` → `FIRING SOLUTION` → `LASER CHARGING`.
  Both seats see the same sentence, so the crew talks in the same words.

## 2. Helm: easy to fly, hard to master

- **Auto-face (Space, hold)** **(sim)**: while held, the ship turns its nose toward the lead point on the enemy
  (the same aim the Hunter uses) at the normal turn rate; A/D overrides. Thrust stays manual. It is a new Helm axis
  value, admitted like turn, deterministic. This is the assist floor: hold Space and the laser gets its arc.
- **Click-to-heading**: right-click (or right-drag) on the Helm map sets a heading marker; the ship turns to it
  and holds it (same mechanism as auto-face, aimed at a bearing). A/D clears it.
- **Arc made visible**: the laser arc wedge brightens (`CRT.main`) when the enemy is inside it and laser is ready,
  and a big bracket closes around the enemy marker: `FIRING SOLUTION`. Helm sees the moment they made the shot
  possible, every time.
- **Torpedo ring guidance**: the 360 ring shows a gap-closing chevron toward the enemy when it is outside, so
  "get closer" is a direction, not a number.
- **Trajectory, already there, made honest**: the predicted path (sim/tactical/predict.ts) draws 4 s ahead, with a
  red-hot (`CRT.hot`) segment and an X where it would hit the planet or an asteroid, and a `COLLISION 2.1s` tag.
- **Mastery hooks, made legible**: a faint gravity contour around the planet (2 rings), and a `SLINGSHOT` word when
  the path passes close and fast. Dodge: incoming torpedo shows its own short predicted path and an `EVADE` arrow
  (perpendicular), so dodging is learnable.
- **Throttle**: keep W/S presets; add mouse wheel on the throttle panel; Shift+W is full burn.

## 3. Weapons: blow shit up

- **Pre-targeted first shot**: each round the laser starts targeted at SHIELDS (the FTL opener), so the very first
  firing solution fires with no setup. The card says `TGT SHLD`; one click changes it. The torpedo starts untargeted.
- **Firing solution feedback**: when Helm has the enemy in arc, the Weapons LASER card flashes `FIRING` and the
  burst fires (already auto). When not: the card says why, in words, `OUT OF ARC: HELM TURN RIGHT` or
  `OUT OF RANGE 612/450`.
- **Hits are loud**:
  - Beam: thicker, two distinct beams for the burst, a 60 ms white-hot core, impact flare at the enemy.
  - Shield hit: the enemy's shield bubble flashes and pops a pip, with `SHIELD DOWN` callout.
  - Room hit: the room blinks in the enemy window, a floating `-2` at the enemy on the map, small screen shake
    (2 px, 120 ms) on both seats, a crunchy hit sound.
  - Torpedo: lock tone (rising beep) while targeted and coming into range; launch whoosh; on impact a bigger shake
    (4 px) and `TORPEDO: WEAPONS HIT`.
  - Kill: a big explosion, 0.4 s slow-motion on screen only (render time, not sim), the enemy breaking apart,
    `TARGET DESTROYED`.
- **The enemy window is always useful**: below scan Level 1 it shows a "?" silhouette of three rooms that can still be
  targeted by position (SHLD / WEAP / ENG are the same three for every class today), and the scan fills them in.
- **Reading the enemy**: the enemy's laser charge ring (already drawn) plus a `INCOMING` alarm 1 s before it fires,
  so Weapons can call "brace" and Helm can dodge.

## 4. Quality of life

- **Keys on everything**: every button shows its key; every key is on a button. Hover tooltips with the one-line why.
- **Never a dead click**: a refused command flashes the control it came from with the reason
  (`NO TORPEDO IN FLIGHT SLOT`, `WEAPONS OFFLINE`), from the same `canLaunch`/`canCharge` checks the runtime uses.
- **Crew pings**: at either console, middle-click (or G) on the map drops a ping both seats see for 3 s, with a
  sound. Talking is optional.
- **Settings**: screen shake on/off and strength; hit-stop on/off; colour-blind-safe brightness ramp already on CRT.

## 5. Mastery (what stays hard)

Positioning in a gravity well; holding the arc while dodging torpedoes; burst timing against shield recharge; room
choice (Shields then Weapons, or Engines to stop it fleeing); weak frequency; torpedo from behind (≈40% vs a hard
turn); and, with the asteroid spike, using and breaking cover.

## 6. Build order (Feel-i, then Feel-ii)

**Feel-i** (biggest "it just works" per hour; presentation except auto-face):
1. Status sentence (§1) and why-not text on the Weapons cards (§3).
2. Auto-face on Space at Helm **(sim)**, and the FIRING SOLUTION bracket + bright arc (§2).
3. Laser pre-targeted at SHIELDS each round **(sim)**, the unscanned "?" room silhouette (§3).
4. Hit juice: beams, impact flare, `-2` floats, shield pop, shake, kill explosion + render slow-mo (§3), with the
   shake setting (§4).
5. Sit-down card, goal glow, auto-frame on sit (§1).

**Feel-ii**: click-to-heading, collision X and tag, torpedo lock tone, EVADE arrow, gravity contours, crew pings,
never-a-dead-click flashes.

Gates: the usual (tsc, full vitest, duel-app smoke); the bless procedure for the sim parts; CRT ramp on the maps;
screenshots of both seats at sit-down, mid-fight and the kill for the owner's look check.
