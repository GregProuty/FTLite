# Audio-i: the first real sound pass (design)

Date: 2026-11-17. The owner approved the design brief (research report `reports/Free game sound and piano score.md`, code audit `research_notes/Free game sound and piano score/integration.md`). Tier: presentation only (spec, plan, build, reviews, owner ear check). Screens cannot verify sound, so the owner's ear check is the final gate.

## Goal

FTLite gets real sound: Kenney sample effects for combat, doors, consoles, fire, the engines and the jump; two Scott Buckley tracks (calm and battle) that crossfade with the fight; and Master, Music and Effects volumes in Settings. The Single player duel, silent today, gets sound too.

## Where the code stands (verified on master 23beb82)

- `app/audio.ts` is the only file that touches `AudioContext`. It synthesises ten cues with oscillators (`CUES`, `MASTER_GAIN = 0.25`) and has `play`, `unlock` and `setVolume`. With no `AudioContext` (tests) every call is a no-op.
- `events/audioCues.ts` holds the `Cue` union and `CUE_ORDER`. The authority emits `cue` events. The online sector session (`app/onlineSession.ts:55,105`) and the online duel (`app/duel/onlineDuel.ts:157`) play them.
- **The bug:** `main.ts:84` builds the Single player duel with `startDuelMode({...})` and no audio at all, so solo play is silent.
- The duel scene (`app/duel/scene.ts:85-86`) drains each frame's `ViewEvent`s (lasers with endpoints and hit and stripped flags, missile ends with cause and position, contacts) into `pushEvents` (`render/tactical/fxModel.ts:42`). Both the local runtime and the online duel source supply them.
- `render/assets.ts:63-64` loads every manifest entry that is not a `font.` as a texture. `render/manifest.ts` binds one name per entry. `tests/assets.test.ts` requires every bound name to be listed in `render/assetNames.ts` and every file under `raw/` to be manifested.
- `app/settingsStore.ts` stores `{ version: 1, volume }` under `ftlite-settings`, with `VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1]`. `ui/menu/Settings.tsx` shows one `volume` select.
- The duel has a thrust concept: the held axes (`DuelViewSource.axes()`, the Helm's `thrust`) and the crew ship's velocity (`tactical.ships[0].vx/vy`). Online, only the Helm seat sees its axes; every seat sees the velocity. The sector has no thrust. It has `run.jumpCharge` (0 to 1, and 1 means ready).
- Fire is `rooms.fire[r] > 0` on any `SimState`: the sector state and the duel's `interior`. Doors are `doors.state[edge]` (Open 1 and HeldOpen 3 pass crew). The duel holds every door open. Console use is `stations.occupant[s]`, which is -1 when the station is empty.
- `render/impactModel.ts:14` has `HIT_FRESH_TICKS = 10`, which stops a snapshot load or a long pause from replaying old impacts.

## 1. Sources and licences

All files were downloaded and unzipped to the session scratchpad (`.../scratchpad/audio-dl/`). There is no ffmpeg on this machine, so files ship as they are: OGG Vorbis effects and MP3 music. Chromium in Electron 37 decodes both. A plan step checks that `decodeAudioData` succeeds in the built app.

| Pack | Licence | Repo folder | Manifest |
|---|---|---|---|
| Kenney "Sci-fi Sounds" (`https://kenney.nl/assets/sci-fi-sounds`, archived `https://web.archive.org/web/20261115051605/https://kenney.nl/assets/sci-fi-sounds`) | CC0-1.0 | `public/assets/raw/kenney-sci-fi-sounds/` | credit `"Sci-fi Sounds" by Kenney (www.kenney.nl), CC0` |
| Kenney "Interface Sounds" (`https://kenney.nl/assets/interface-sounds`, archived `https://web.archive.org/web/20261109194509/https://kenney.nl/assets/interface-sounds`) | CC0-1.0 | `public/assets/raw/kenney-interface-sounds/` | credit `"Interface Sounds" by Kenney (www.kenney.nl), CC0` |
| Scott Buckley "Cobalt" (`https://www.scottbuckley.com.au/library/cobalt/`, archived `https://web.archive.org/web/20261026145225/https://www.scottbuckley.com.au/library/cobalt/`) | CC-BY-4.0 | `public/assets/raw/scott-buckley/cobalt.mp3` | credit `'Cobalt' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au` |
| Scott Buckley "Time and Space" (`https://www.scottbuckley.com.au/library/time-and-space/`, archived `https://web.archive.org/web/20251205061037/https://www.scottbuckley.com.au/library/time-and-space/`) | CC-BY-4.0 | `public/assets/raw/scott-buckley/time-and-space.mp3` | credit `'Time and Space' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au` |

The Wayback availability API returned all four snapshots on 2026-11-17. Both packs' `License.txt` files are copied too (text files need no manifest entry). The files are committed, because CC0 and CC-BY allow it. `npm run credits` regenerates `public/THIRD_PARTY_NOTICES.txt` and `render/credits.generated.ts`.

**The curated subset.** 50 effect files are copied, plus the two tracks. Each sound key has one or more variants:

| Key | Files | Used for |
|---|---|---|
| `laserSmall` | sci `laserSmall_000`-`004` | the crew's laser (duel) |
| `laserLarge` | sci `laserLarge_000`-`004` | the enemy's laser (duel); the crew's shot (sector cue `shot`) |
| `impactMetal` | sci `impactMetal_000`-`004` | laser hits, contacts, the sector cue `hit` |
| `explosionCrunch` | sci `explosionCrunch_000`-`004` | missile ends, the sector cue `impact` |
| `lowBoom` | sci `lowFrequency_explosion_000`-`001` | the low layer under any hit on the crew ship; the jump arrival |
| `forceField` | sci `forceField_000`-`002` | a stripped shield layer; the jump arrival shimmer |
| `doorOpen` / `doorClose` | sci `doorOpen_000`-`002` / `doorClose_000`-`002` | interior doors |
| `thruster` | sci `thrusterFire_000`-`002` | missile launch, the jump whoosh, a fire igniting |
| `engineHum` | sci `spaceEngineLow_000` | the engine hum loop |
| `jumpCharge` | sci `spaceEngineSmall_000` | the jump's charge sweep |
| `alarm` | ui `error_004`, `error_005` | the cue `alarm` (two tones) |
| `ready` | ui `confirmation_001`-`003` | the cue `ready` |
| `upgrade` | ui `maximize_006`-`008` | the cue `upgrade` |
| `callout` | ui `question_001`-`003` | the cue `callout` |
| `console` | ui `select_001`-`003` | sitting down at a console |

The table lives in code as `SFX` in `src/renderer/src/audio/soundBank.ts`. A test checks that the table, the files on disk and the manifest agree.

## 2. Manifest and loader

- **Names.** An effect file binds `sfx.<key>.<n>`, where n counts from 0 in the table's order (so `error_005` is `sfx.alarm.1`). The music binds `music.calm` (Cobalt) and `music.battle` (Time and Space). `isAudioName(n)` means the name starts with `sfx.` or `music.`. Every audio name is listed as `optional` in `assetNames.ts`, generated from the table.
- **Manifest rules** (`manifest.ts`). An audio name must be bound by an `.ogg` or `.mp3` file, and an `.ogg` or `.mp3` file must bind an audio name. Audio entries must say `required: false`: a missing effect falls back to the synth tone, and missing music is silence.
- **Loader branch.** `assetKind(entry)` is a pure function that returns `'font' | 'audio' | 'image'`. In `loadAssets`, audio entries are not fetched. They are listed in `GameAssets.sounds: { name, url }[]`, which is an optional field so existing test fixtures still compile. Boot does not wait on about 20 MB of audio. `assets.missing` excludes audio names.
- **Bytes.** `loadBytes(url)` in `assets.ts` tries `fetch` and falls back to `XMLHttpRequest` with `responseType = 'arraybuffer'` (the packaged app's file:// origin refuses `fetch`), the same pattern as `loadJson`. `audio.load(sources, loadBytes)` decodes in the background. Effects load first and are published together. Then the music loads, and calm starts as soon as it is decoded. It logs `[audio] decoded <ok>/<total> files` once.

## 3. The engine (`app/audio.ts`)

It is plain Web Audio with no library, and it is still the only file that touches `AudioContext`. The context can be injected, so tests use a fake.

- **Buses:** voice → panner → effects bus → master → destination, and music sources → their crossfade gains → music mix (pause and duck) → music bus → master. The bus gains are `master`, `music × MUSIC_LEVEL (0.45)` and `effects × EFFECTS_LEVEL (0.9)`. The synth fallback plays into the effects bus at `SYNTH_GAIN = 0.25`, which is the old `MASTER_GAIN`, so the old tones keep their loudness.
- **A sound request** (`SoundRequest`, pure data) has a key, a start offset `at`, a gain, a pan, an optional cut `dur` with a 30 ms fade, a playback `rate` with an optional ramp to `rateTo`, an optional lowpass or bandpass filter sweep, an optional pinned `variant`, and `detune` (on by default).
- **Per play:**
  - variant rotation: a random pick that never repeats the key's last variant;
  - random detune within ±`PITCH_SPREAD_CENTS = 50` cents, using `Math.random` (injectable), never the sim RNG;
  - a `StereoPannerNode` per voice;
  - a voice cap of `VOICE_CAP = 4` per key. When the cap is full, the oldest voice of that key is stopped, so the newest shot always sounds.
  
  The variant pick, detune, pan maths and voice bookkeeping are pure, in `audio/voices.ts`.
- **Pan from screen position.** On the duel's map views, pan is the event's screen x through the view's camera: `(sx / width) × 2 − 1`, times `PAN_WIDTH = 0.8`. On the interior view, which draws no world map, pan is the event's world x relative to the crew ship over `PAN_WORLD_UNITS = 600`. Interior doors and consoles pan by their tile column across the ship. Fire and the sector cues are centred.
- **Cues keep their names.** `play(cue)` plays the cue's recipe (`audio/cueRecipes.ts`). If the recipe is null, or any of its keys has no decoded buffer, it plays today's synth tones instead. Victory and defeat keep their synth stingers (recipe null), because neither pack has a fitting sting. No new `Cue` names are added, so `net/codec.ts`, `net/contracts.ts` and the replay format do not change.

## 4. Triggers

**(a) Duel combat**, both modes, from the frame's `ViewEvent`s (pure `audio/duelSounds.ts`, beside `pushEvents`, not inside it):

| Event | Sound |
|---|---|
| laser, crew | `laserSmall` at the beam's start |
| laser, enemy | `laserLarge` at the beam's start |
| laser `stripped` | + `forceField` at the beam's end, 40 ms later |
| laser `hit` (not stripped) | + `impactMetal` at the end, 40 ms later |
| missileEnd `ship` | `explosionCrunch`, full gain |
| missileEnd `planet` / `asteroid` / `missile` | `explosionCrunch` at 0.6 gain |
| missileEnd `edge` / `expired` | nothing |
| contact | `impactMetal` at rate 0.8 (0.6 gain for the crew ship, 0.3 for others) |
| any `hitsCrew(e)` | + `lowBoom`, and the music ducks |

Two things come from tactical state diffs (`duelStateSounds`), not from events:
- **Missile launch.** A missile slot going from inactive to active plays `thruster`, cut to 0.7 s.
- **Round end.** `outcome` leaving Running plays the cue `victory` (CrewWins) or `defeat` (EnemyWins or Draw).

The diff re-baselines silently on a new round, when the tick goes backwards, or when the tick jumps more than `HIT_FRESH_TICKS`. Because victory and defeat now come from local state, **the online duel no longer plays the replicated cues**: `main.ts` stops passing `playCue` to it, and its `shot`, `hit` and `impact` would otherwise sound twice.

**(b) The bug fix.** `startDuelMode` and `createOnlineDuelSession` take `audio?: AudioOut`. `createDuelScene` takes the same option and feeds a `createDuelAudio` adapter (`app/duel/duelAudio.ts`) each frame. `main.ts` passes `audio` to both.

**(c) Ship interior**, sector and duel interior alike, from render-side state diffs (pure `audio/interiorSounds.ts`), with the same stale-replay guard (a missing baseline, a tick backwards, a jump of more than `HIT_FRESH_TICKS`, or a changed array length all re-baseline silently):
- a door's open flag flips: `doorOpen` or `doorClose`, panned by the door's tile column;
- a station goes from empty to occupied: `console` (sitting down);
- a room goes from not burning to burning: `thruster` through a 1200 Hz lowpass, cut to 0.5 s (the ignite whoosh);
- the number of burning rooms drives the fire crackle loop.

The alarm is the existing `alarm` cue (spawns, boardings, encounters), now played from the `alarm` samples.

**The fire crackle is synthesised** (`crackleSamples` in `audio/loops.ts`): a 2 s noise buffer with sparse random pops (40 a second, 4 ms decay) over a quiet bed, both ends faded so the loop never clicks. It is played on loop through a 2200 Hz bandpass. Its gain is 0 with no fire, 0.15 for one room, plus 0.08 for each further room, up to 0.4. It is smoothed over 0.6 s. Decision: slime and forceField were rejected, because processed they read as goo and shields, not as fire.

**(d) Movement.** The `engineHum` loop runs from boot at gain 0. Its level is `max(0.6 × thrust + 0.4 × min(1, speed / 400), charge)`:
- `thrust` is 1 while the Helm holds thrust (the local or Helm seat's axes);
- `speed` is the crew ship's velocity;
- `charge` is the sector jump swell: `jumpCharge` while it is below 1, and 0 once the drive is ready.

The gain runs from 0.1 to 0.35 and the playback rate from 0.85 to 1.35, smoothed over 0.25 s. In the online duel, a non-Helm seat hears only the speed part. In the sector the hum idles and swells while the drive charges. When the drive is ready, the swell drops back to idle and the `ready` chime plays.

**The jump** is the sector cue `jump`, played as a layered recipe:
1. a charge sweep: `jumpCharge` at rate 0.6 to 1.8 through a lowpass opening from 500 to 5000 Hz, over 0.7 s;
2. a whoosh at 0.55 s: `thruster` through a bandpass sweeping 4000 to 400 Hz, over 0.8 s;
3. the arrival at 1.1 s: `lowBoom`, then `forceField` at rate 0.7.

The sim's jump is instant, so the charge sweep is a short pre-roll inside the recipe. The long charge is the hum swell.

## 5. Music

- `music.calm` loops the whole track (`CALM_LOOP_START_S = 0`). It starts as soon as it is decoded and plays in the menus too.
- **Engaged** has a rule per mode:
  - in the duel, engaged means `tactical.outcome === Running`;
  - in the sector, engaged means `enemy.present === 1`, or any boarder active, or a `shot`, `hit` or `impact` cue this frame.
  
  Each frame's report carries the flag. A report older than `REPORT_STALE_S = 0.5` s (no session, so the menu) counts as not engaged and not paused.
- **Battle in.** Engaged moves the music to battle at once. The crossfade position x runs 0 to 1 over `CROSSFADE_S = 2`, and the gains are calm = cos(xπ/2) and battle = sin(xπ/2) (equal power).
- **Back to calm.** After `CALM_AFTER_S = 8` s with no engagement, the music goes back to calm. The 8 s count does not advance while paused.
- **The battle source.** Time and Space starts at `BATTLE_START_S = 125` (the orchestral turn at about 2:05) each time battle begins. It loops between `BATTLE_LOOP_START_S = 125` and `BATTLE_LOOP_END_S = null` (the track's end). All three are constants for the owner to tune by ear, and none were measured. The source stops once the fade back to calm completes. Calm keeps running underneath at gain 0, so it resumes where it was.
- **Pause and duck.** While the game is paused, the music mix fades to 0 over `PAUSE_FADE_S = 0.4` and the hum and fire loops fade out. Decision: a duck, not `suspend()`, because the menu over a paused game still runs. A hidden window suspends the `AudioContext`, and showing it resumes the context. Any hit on the crew ship (and the sector `impact` cue) ducks the music to `DUCK_LEVEL = 0.5` for `DUCK_S = 0.6` s.
- The state machine is pure and takes the time as an input (`audio/musicState.ts`). `audio.tick(now)` runs it once per rendered frame from the Pixi ticker in `main.ts`.
- **Memory.** Both tracks decode to about 90 MB of PCM each (231 s, stereo, 48 kHz float). That is accepted on desktop Electron: `loopStart` and `loopEnd` need a decoded buffer. If memory becomes an issue, calm can move to a `MediaElementAudioSourceNode` later.

## 6. Settings

- `Settings` becomes `{ version: 2, master, music, effects }`. Each value is one of `VOLUME_STEPS`, and the default is 1 for all three.
- **Migration.** A version 1 record maps its `volume` to `master` (an invalid value falls back to 1), with music and effects at 1. A version 2 record is validated field by field. Anything else gives the default.
- The UI slice holds `master`, `music` and `effects`, and `actions.setVolume(channel, value)` updates one of them. `Settings.tsx` shows three selects, "Master volume", "Music" and "Effects" (`data-testid` `volume-master`, `volume-music`, `volume-effects`), each with Off, 25%, 50%, 75% and 100%. `main.ts` applies the values with `audio.setVolumes` and saves them.

## 7. Determinism

- Audio reads only events and state that already exist.
- The new pure modules live in `src/renderer/src/audio/`, outside the deterministic roots that `tests/boundary.test.ts` walks. Their direct imports from `sim/` are type-only, which a new test enforces. They reuse two render helpers, `hitsCrew` and `HIT_FRESH_TICKS`. They copy two sim constants (Outcome Running 0 and CrewWins 1, and the open door states 1 and 3), and tests pin those copies against the sim.
- Randomness is `Math.random`, injectable for tests, and never the sim RNG.
- `SIM_VERSION` (40) and `tests/fixtures/determinism-v2.json` are unchanged. `npm run test:determinism` must pass unchanged. No sim, authority, net or codec file changes.

## 8. Tests and checks

- **Unit tests:**
  - the event-to-sound mapping, the duel state diffs and their guard;
  - the interior diffs and their guard, and the sector engaged rule;
  - the music state machine (crossfade curve, 8 s hold, pause freeze and fade, duck, staleness);
  - the hum and fire levels and the crackle buffer;
  - the voice cap, variant rotation, detune and pan;
  - the cue recipes and the synth fallback (through a fake `AudioContext`);
  - the settings migration;
  - manifest acceptance and rejection of audio entries, and the table, disk and manifest agreeing;
  - the `assetKind` loader branch;
  - `startDuelMode` passing audio to the scene;
  - the import guard.
- **Commands:** `npm run typecheck`, `npm test`, `npm run test:determinism`, `npm run build`, and `npm run credits` (its outputs committed).
- **Built-app decode check.** Launch the built app with playwright-core from the scratchpad and read the console line `[audio] decoded 52/52 files`.
- **The owner's ear check** (the final gate, recorded in `docs/gates.md`). Listen for:
  1. calm music in the menu;
  2. a Single player duel that is no longer silent;
  3. the two lasers sounding different, with hits landing about 40 ms after the shot;
  4. explosions panning left and right with the screen;
  5. a heavy low thump and a music dip when we are hit;
  6. no wall of sound when firing fast (the voice cap);
  7. the hum rising while thrusting and fading while paused;
  8. battle music crossfading in at the duel start, at the orchestral turn, and back to calm about 8 s after the round ends;
  9. the music fading out on pause and back on resume;
  10. in a sector run: door whooshes, the console blip, the fire crackle growing with more rooms, the alarm, the jump (charge, whoosh, arrival), and the hum swelling while the drive charges;
  11. each of the three volume controls working and remembered after a restart (an old single volume carries over as Master);
  12. the battle loop seam and the hum loop seam (the loop points are constants to tune).

## Decisions the owner may want to revisit

1. The duel's replicated `cue` events are no longer played in the online duel. All duel sound comes from local events and state, so the two modes sound the same.
2. Victory and defeat keep the synth stingers.
3. The fire crackle is synthesised noise, not a sample.
4. Battle music starts at 2:05 every time a battle begins and loops 2:05 to the end. Calm resumes where it left off.
5. Pause ducks the music to silence rather than suspending the context. Hiding the window suspends it.
6. The voice cap steals the oldest voice rather than dropping the new one.
7. Online, a non-Helm seat's hum follows the ship's speed only, because thrust input is not replicated.
8. Both tracks are fully decoded (about 180 MB in total).
9. The sector hum swells while the drive charges and drops to idle when it is ready.
10. The dev views `?mode=duel` and `?mode=flight` stay silent, as today.
11. The alarm uses Kenney Interface `error_004` and `error_005` as two tones. Like every sample choice above, it was picked by name, not by ear, and the owner may swap any file in the `SFX` table.
