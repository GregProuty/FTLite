# Codex review exchange: artemis-spec

Subject: `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 90a57d1, effort high, 439 s, 3236886 in / 3111856 cached / 35548 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Held console buttons can stick when their button unmounts (pause, X stand, view change)
Spec §3 releases a hold only on pointerup, pointercancel, lostpointercapture or window blur, and §6 runs DuelUiInput.clear() only where the keyboard's clear runs (Tab, restart, blur). But the station buttons stop being drawn when the console goes null (pause, end card) or when the view changes (X stand, a seat change). The pointerup then has no element to land on, and the hold stays set in DuelUiInput. · spec L92-93 (release events), L147-148 (station buttons only on their view), L175 (console null while paused), L183-184 (clear only on Tab, restart, blur), L194-196. runtime.ts:L317 and L300 are the only clearKeys calls (Tab, newRound). runtime.ts:L325: X (stand) does not clear keys. runtime.ts:L377: while paused, play() is skipped but the held flags still feed activeHeld at L379. runtime.ts:L321-323: when standing, moveX walks. · Ordinary play breaks. Hold STEER ◄ with the mouse and press X, and the character keeps walking left in the interior. Hold PORT and press Esc, and on resume the ship turns forever. A held FIRE stays charged with no way to let go. · Add a rule that DuelUiInput drops every hold, with no stray release, whenever the console view model becomes null or its station changes (stand, sit, Tab, pause of any reason, end card, round change). Also add a rule that a Button releases its hold on unmount. List these cases in the §8 DuelUiInput tests.

### [P1] R1-F2 "Press counts add, held flags OR" does not produce today's fire edges or movement axes
The runtime and the online duel charge and fire only on the fireDown/fireUp press edges, not on fireHeld. KeySample carries moveX and moveY as normalised numbers, not left/right/up/down flags. So hold('fire'|'left'|…) merged by 'OR of held flags' either never charges, or it needs edge synthesis that the spec does not define. Mixing keyboard and mouse is also undefined: if the click is released while Space is still held, a fireUp goes out and the laser fires early. · spec L113-114 ('press = fireDown, release = fireUp') against spec L181-182 ('press counts add, held flags OR'). runtime.ts:L336-339 acts on the edges only; L339 only releases. onlineDuel.ts:L179-181 does the same. input.ts:L18-23: KeySample has moveX/moveY numbers, and L65-67 normalises them. · Two implementers would build different merges. One leaves FIRE dead; the other double-fires or cuts a keyboard charge short. The fixed decision 'every keyboard control keeps working' is at risk once keys and mouse are mixed. · Define DuelUiInput.sample() exactly. hold('fire', true) adds one fireDown and hold('fire', false) adds one fireUp, each only when the merged Space+button state changes (the fire edge is the OR of both sources). Direction holds are combined per axis: moveX = sign((kbRight||uiRight) − (kbLeft||uiLeft)), with the keyboard exposing its raw flags, or as sign(kb.moveX + ui) clamped. State which one, and test both with the keyboard and the mouse held.

### [P1] R1-F3 Online tab rules use 'own seat' and 'partner's seat', but either player may sit at either console
Online, consoleInReach offers whichever role console is free, and the sim admits a sit at nav or weapons from either player. So a guest can take the empty Helm, and 'our own seat' and 'the partner's seat' have no definition. 'The partner's seat tab is always locked' also contradicts 'open only when consoleInReach is that console' when we stand by the partner's empty console. Separately, E sits only when no repair is in reach, so an 'open' tab whose click is E can do nothing. Single player marks a console in reach as locked while online marks it open. · spec L187-190. controls.ts:L29-39 (both consoles checked for any pid). step.ts:L137 (a sit at nav or weapons is allowed for any player). onlineDuel.ts:L165 and runtime.ts:L322 (E sits only if repairInReach < 0). · The consoleModel tab tests (spec L200-201) cannot be written one way. A clickable tab that does nothing is hit in ordinary play. · Define tabs by occupancy, not role. The console we sit at is current. A console is open when consoleInReach(d, me) is that console and repairInReach(d, me) < 0 (click = E); online it is locked otherwise. In single player, also open a console that the undriven character sits at (click = Tab). SHIP is current while standing and open while seated (click = X). Apply the same rules in both modes, or state the difference on purpose.

### [P1] R1-F4 Artemis-ii's SIM_VERSION bump cannot be blessed as written: the duel oracle requires per-tick identical runs
bless-golden refuses a bump unless the duel migration oracle shows every scripted run unchanged per tick: values, command results, events and telemetry. Artemis-ii makes the scripted Helm send throttle commands. That adds results and shifts the Helm player's command sequences, and it drops held moveY, which telemetry reads. The oracle also fails on a new field that is not declared added in MIGRATIONS[40], which the spec never mentions. · spec L20-22, L167-171 ('SIM_VERSION goes up by one; the goldens are re-blessed with scripts/bless-golden.ts'). scripts/bless-golden.ts:L5-10. scripts/golden/blessGuard.ts:L17-20 ('A same-version bless … a deliberate gameplay change'). scripts/golden/duelOracle.ts:L10-13, L86-107 (MIGRATIONS keyed by the baseline version), L175. · The plan's bless step fails at execution, and a fresh subagent would have no way around it except weakening the guard. · Split Artemis-ii into two commits. (1) Record the oracle baseline at 40. Then bump to 41, add the throttle field (always 0) and admit the command kind, with scripted input and held thrust unchanged. Add MIGRATIONS[40] = { change: 'Artemis-ii: throttle', added: [/^<module>\.throttle$/] } and bless; the oracle passes. (2) Make the gameplay change (scripted throttle, held W/S ignored, quarter physics) as a same-version deliberate bless at 41.

### [P1] R1-F5 Drawn predicted path, thrust flame, telemetry and the scripted pair's prediction still read held W/S after the throttle
The Helm's predicted path and thrust flame are drawn from source.axes(). That is helmAxes(held), built from held moveY, in both the runtime and the online source. Telemetry's manoeuvre detection and the scripted pair's hazard prediction also use held thrust. Spec §5 removes held thrust from the sim but does not redefine any of these. · spec L162-166. runtime.ts:L275 (sentAxes = helmAxes(held[helm])). onlineSource.ts:L132. tacticalModel.ts:L267 (predictPath(state, 0, input.axes, …)) and L273 (flame from axes.thrust). telemetry.ts:L127-128 (manoeuvre = held moveX||moveY). scripted.ts:L74-76, L92 (hazardAway predicts with pair.axes). · After Artemis-ii the Helm would see a path that bends with a meaningless held W while the ship flies at its throttle. The 'exact prediction' contract of flyShip/predictPath breaks, and telemetry baits change silently. · Specify axes() = { turn: held turn, thrust: throttle level / 4 (−1 for reverse) } while the Helm is crewed, NO_AXES otherwise, in both runtime and onlineSource. For the online source, say whether the level comes from the replica or a local prediction. Restate the telemetry manoeuvre rule (for example turn held or throttle ≠ 0) and have scripted hazardAway predict with the throttle.

### [P1] R1-F6 Scripted pair's 'whenever its wanted thrust changes' has no reference value, and the kept throttle makes it diverge
The scripted Helm stands up to repair, and pair.axes is reset to 0 while it is up. But §5 keeps d.throttle across standing. If 'changes' compares against pair.axes, a Helm that re-sits wanting thrust 0 sends nothing, and the ship flies on at the kept throttle (for example 4). Comparing against d.throttle sends a correction. The two readings give different goldens. · spec L162-163 (level kept for whoever sits next), L167-168. scripted.ts:L241 (stands for repair), L252-255, L260 (pair.axes reset when not at nav). · Two implementers produce different scripted behaviour and different goldens. One of them flies at full throttle while the script wants to coast. · State: 'each tick the scripted Helm is seated, it sends throttle {level} when its wanted level (4, 0 or −1) differs from d.throttle'.

### [P1] R1-F7 Online W/S 'from the latest queued level' has no queue to read
The online duel sends commands straight away against a replica that lags by the round-trip time; there is no pending queue. Two quick W presses would both compute replica.throttle + 1 and move only one notch. If a local 'last sent' level is used instead, the spec does not say when it resets (rejection, attach, new round, stand). · spec L164-165. onlineDuel.ts:L104-108 (send is immediate), L162-185 (play reads only the replica d), L230-231 (attach resets sequences). runtime.ts:L289-292, L329 (only the local runtime has a pending queue). · Throttle nudges online would be lossy and differ from Single player, which breaks 'clicks/keys behave the same' in the online duel. · Define an online rule. Keep throttleSent = { level, sequence }. Base = throttleSent.level until a result for that sequence arrives (applied: adopt the replica; rejected or noop: drop it). Reset it on attach, new round, stand and sit. Test two presses inside one RTT.

### [P2] R1-F8 Throttle admission and state placement are underspecified against the duel module contract
The spec does not say which module owns DuelState.throttle and the 'throttle' command (DUEL_MODULES order fixes the canonical layout, and the module test requires every DuelState member to be a field or an exclusion). It does not say that 'throttle' joins DUEL_KINDS (without it a decided round answers 'not-in-duel', not 'duel-decided'), that the stale-tick check applies, or that 'seated at the Helm' means the present attendant. The running-tick result helper emits only applied or rejected, so 'noop' needs a new path. Snapshot validation is by fixed offsets, so the range check's place must be named. · spec L152-157. step.ts:L26 (DUEL_KINDS), L110 and L169, L128-130 (result helper), L156 and L161-162 (attendant, stale-tick). modules.ts:L1-4, L77-84. tactical/hash.ts:L118-119 (the ship module's commands and reasons). snapshot.ts:L140-151. · Two implementers would place the field and the reasons differently, giving different goldens and result streams. · Name the module (for example a new 'helm' module after 'round', or a field on the round module) and its reasons list. Add 'throttle' to DUEL_KINDS. Order the checks: stale-tick, then not crewed by sender → invalid-seat (attendant semantics), then malformed, then noop. Add the 'noop' status to the running result helper. Validate 'Number.isInteger(v) && −1 ≤ v ≤ 4' in snapshot.ts beside presence and repair.

### [P2] R1-F9 Station block content does not fit 248 px at FONT_SIZE; button text size and glyphs are unspecified
At the default text scale 2, the Weapons LOCK row needs 'LOCK' 48 + gap + WEAP 52 + SHLD 48 + ENG 36, plus button padding (~16 each) and gaps, which is about 268 px before 'E/Q', inside a 248-px block with 8-px panel padding. The Helm header needs 'THROTTLE' 96 + 'HEADING 055' 130 + padding and a divider, also more than 248. The spec gives no label size for <Button>. The glyphs ◄ ► ▕ ▏ █ ░ ■ appear nowhere in the codebase, and m5x7 coverage of them is unconfirmed. · spec L53 (w 248), L101-109, L123-131, L76 (Button = Box + PixelText, no size). theme.ts:L22 (FONT_SIZE = 16×2), L28 (PAD 8), L31-42 (advances: W 8, others 6, space 5). grep for ◄►▕█ in src: no matches. · The plan cannot pick a size without breaking the region table, and the probe look check would show clipped rows. · Fix the label size (for example FONT_NATIVE for button labels and key hints, FONT_SIZE for values) or widen STATION/STATUS to about 300. Draw the arrows, throttle column and pips as Boxes, or use ASCII ('<' and '>'), instead of the Unicode glyphs.

### [P2] R1-F10 Map reserve and interior overlap not addressed when the readout moves left
The tactical model still reserves the right 220 px (reserveRight: READOUT_COLUMN), and the Weapons banner is centred on (1280−220)/2. The spec moves the readout to the left (x 12–260) and puts a 132-px column on the right, but does not say whether reserveRight changes or becomes a left reserve. Off-screen arrows and the follow centre ignore the new left panels. In the interior, the tab strip (x 12–332, y 8–34) does not overlap the readout column (x ≥ 1068), so the 'moves down to y 42' rule does nothing. Meanwhile it does overlap INTERIOR_BAND, where the ship is fitted. · spec L52-55, L65-66 ('keeps its centre position'), L71-72. scene.ts:L95 (reserveRight: READOUT_COLUMN). weaponsModel.ts:L88 (info x = (vp.w − reserveRight)/2). interiorModel.ts:L10-12 (INTERIOR_BAND x 0..1060, y 0..720). ReadoutPanel.tsx:L19 (X = 1280 − 204 − 8). · Implementers would differ on the camera framing, and the interior ship can be drawn under the tab strip. · State reserveRight (keep 220 so the banner and framing are unchanged, or switch to explicit left/right reserves) and how off-screen arrows avoid STATUS and STATION. For the interior, either start INTERIOR_BAND at y 42 or accept the overlap, and drop or correct the y 42 rule for the readout.

### [P2] R1-F11 Click wiring and view-model inputs name interfaces the app does not have
createUiActions is built once in main.ts, before any mode exists (and separately for ?mode=duel with no duel hooks). duelMode and onlineDuel receive only a DuelSink, so 'wired by duelMode.ts and onlineDuel.ts to their DuelUiInput' needs a registration API the spec does not define. consoleModel needs 'the local seat … the runtime's held/sent state', the UI hold lit state, and 'charge held from the keyboard'. DuelViewSource exposes none of these, and the online source has no pending queue. 'Null while paused' does not say which pause reasons count (blur, hidden, suspend) or which online phases. · spec L175-185, L113-114. main.ts:L84, L92, L105, L170-179. duelMode.ts:L16-29 (deps: ui only). scene.ts:L27-46 (DuelViewSource members), L102-107 (the only frame() call). runtime.ts:L393-396. · A fresh subagent has to invent the plumbing, and the two modes will diverge. · Specify a store- or actions-level slot, for example actions.console delegating to a `DuelUiInput | null` that the mode sets on start and clears on dispose (a no-op when null). Add named DuelViewSource members (for example seat(), uiHeld(), throttleShown()) implemented by both runtime and onlineSource. Define 'paused' as runtime.paused() (any reason) or online phase !== 'running'.

### [P3] R1-F12 Button focus and pointer rules are partly self-defeating
tabIndex={-1} makes a div focusable by mouse click, which is the opposite of 'never takes focus'; with no tabIndex it is not focusable at all. Keys still reach the window listener either way. Right and middle presses on a button are never seen by the canvas listeners that call preventDefault on contextmenu and button 1/2, so the native context menu and middle-click autoscroll are not suppressed over buttons. · spec L87-91. input.ts:L116 (preventDefault only for button 1/2 on the canvas), L124 (contextmenu only on the canvas). duelMode.ts:L37 and onlineDuel.ts:L70 (the pointer source target is the canvas). · This is a minor leak of the browser's defaults and focus side effects. It does not break keyboard play, because the keyboard listens on window. · Omit tabIndex, call preventDefault on pointerdown and mousedown for every button (any button), and add contextmenu and auxclick preventDefault on the button element.

## Verified
- Today's KeySample consumption: press edges per KeyAction (input.ts:L6-11, L48-53). fireUp only when Space was held (input.ts:L56). Tab drops weapons commands, flips presence, calls clearKeys and returns IDLE_KEYS (runtime.ts:L305-318). Pause skips play() but keeps the held axes (runtime.ts:L377-379).
- Online: Tab does nothing (onlineDuel.ts header L4, play L162-185 has no switch). A charge release is re-sent from the replica's fireHeld (onlineDuel.ts:L178-182).
- Status table height: helm and weapons rows after the spec's removals = 12 rows (readoutModel.ts:L55-78) → 2×PAD + 12×LINE = 304 ≤ 390 (theme.ts:L26-28). STATUS ends ≤ y 432, above the Weapons STATION top 488 and the Helm top 512.
- The Weapons banner text ('ENEMY BRG 055  RNG 1234  NO SHOT') is about 372 px at scale 2, centred at x 530 (weaponsModel.ts:L88 with reserveRight 220), so it starts near x 344 and clears the tab strip's end at x 332.
- The hunter sends only thrust −1, 0 and 1 (hunter.ts:L69, L75, L79), so the quarter quantisation leaves its flight unchanged. The flight view's helmAxes gives ±1 (input.ts:L31-33).
- 'invalid-seat' and 'malformed' exist in COMMAND_REASONS (contracts.ts:L85-89). DuelCommand has no throttle kind today (contracts.ts:L70-79).
- startRound rebuilds through createDuel (step.ts:L76-85), so a throttle field defaulting to 0 resets at each round start.
- SIM_VERSION is 40 on the working tree (sim/tuning.ts:L7), and duel-fire code is present, so 41 for Artemis-ii is consistent.
- LAUNCH disabled = !canLaunch matches the runtime's and the online duel's launch tests (runtime.ts:L256, onlineDuel.ts:L183).

## Not verified
- Whether m5x7 contains ◄ ► ▕ ▏ █ ░ ■ (I did not read the TTF).
- Chromium/Electron behaviour: whether preventDefault on pointerdown alone stops focus, and whether Electron shows a default context menu or middle-click autoscroll over a div.
- The working tree changed while I was reviewing (duel-fire references appeared in step.ts, state.ts, readoutModel.ts, controls.ts and telemetry.ts), so some line numbers may have drifted from commit 3357847.
- onlineSource.ts beyond L132/L152, predict.ts, tacticalModel.ts beyond the axes uses, and sim/duel/snapshot.ts beyond the grep hits were not read in full. I read scripts/golden/duelOracle.ts, blessGuard.ts and bless-golden.ts and grepped main.ts and telemetry.ts outside the manifest for findings 4, 5 and 11.
- ledger.md in the run dir (round 1, no prior findings), and the React UI layer spec (I skimmed none of it beyond what the code shows).

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `90a57d1`. 12 accepted, 0 rejected, 0 deferred. Duel-fire has now merged at SIM_VERSION 40 (master 90a57d1), so Artemis-ii takes 40 → 41.

## R1-F1 [P1]: Held console buttons can stick when their button unmounts

Confirmed. runtime.ts calls clearKeys only on Tab and newRound (L300, L317), and X does not clear it (L325). §3 now releases a hold on unmount. §6.2 clear() also runs on any change of the drawn console's station and when it becomes null. §7 restates this.

## R1-F2 [P1]: Press counts add, held flags OR does not produce today's fire edges

Confirmed. runtime.ts L336-339 acts on edges only. §6.2 now makes the keyboard the single merge point. It has two held sets; fireDown and fireUp come from transitions of the merged Space state; the axes come from the merged codes. §8 tests the interleavings.

## R1-F3 [P1]: Online tab rules use own and partner seat

Confirmed. controls.ts L29-39 checks both consoles for any pid. §6.3 now defines tabs by occupancy, with the same rules in both modes. A tab is open only with consoleInReach and repairInReach < 0. In single player there is also the Tab-to-other-character case.

## R1-F4 [P1]: SIM_VERSION bump cannot be blessed as written

Confirmed. blessGuard.ts L17-20 and duelOracle.ts MIGRATIONS (keyed by the baseline version). §5.6 now has the two-step bless with MIGRATIONS[40], the same pattern as duel-fire (e123424, then efa0a5b).

## R1-F5 [P1]: Predicted path, flame, telemetry and scripted prediction read held W/S

Confirmed. runtime.ts L275, onlineSource.ts L132, tacticalModel.ts L267/L273. §5.3 defines axes() from throttleThrust(d.throttle) in both sources and restates the telemetry rule. §5.5 makes hazardAway predict with the throttle.

## R1-F6 [P1]: Scripted pair's reference value

Confirmed. §5.5 now compares against d.throttle on each seated tick.

## R1-F7 [P1]: Online latest queued level

Confirmed. onlineDuel.ts sends straight away (L104-108). §5.4 defines throttleSent with its clearing rules, and §8 tests two presses in one round trip.

## R1-F8 [P2]: Admission and module placement

Confirmed. §5.1 adds helmModule after round, with its reasons. §5.2 adds the DUEL_KINDS membership, the check order and the noop status in the result helper. The snapshot carries the field through the module flatten.

## R1-F9 [P2]: Station block does not fit at FONT_SIZE

Confirmed. theme.ts L22/L28. §2 now fixes the text sizes (FONT_NATIVE for labels), makes the station 300 wide, and draws only ASCII, with boxes for the bars and the throttle column.

## R1-F10 [P2]: Map reserve and interior overlap

Confirmed. scene.ts L95 and weaponsModel.ts L88. §2 replaces reserveRight with reserve {left 228, right 156} for the arrows and the notice centre, and leaves the flight view unchanged. INTERIOR_BAND's top moves to 42 and the no-op y-42 readout rule is dropped.

## R1-F11 [P2]: Click wiring names missing interfaces

Confirmed. main.ts builds the actions before the modes exist. §6.2 adds actions.console with a setConsole slot that the modes fill. §6.1 adds DuelViewSource seat/uiHeld/throttle and defines paused.

## R1-F12 [P3]: Button focus rules

Confirmed. §3 now has no tabIndex, and calls preventDefault on pointerdown, mousedown, contextmenu and auxclick for any button.

## Also changed

- §2 status table width set to READOUT_W (204); a layout test asserts the status table ends above the station block.

## Files changed

- docs/superpowers/specs/2026-11-17-artemis-consoles-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 7e3e683, effort medium, 205 s, 1034900 in / 954262 cached / 18037 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 The revision dropped the wire step: the duel codec would reject every online throttle command
Round 1's §5 had a 'Wire' bullet saying the command codec admits the new kind. The rewrite removed it, and no section of the current spec names the codec. `duelWire.commands` is a closed list of strict zod objects, so a `{ kind: 'throttle', level }` sent by the online duel fails validation before the authority sees it. · Spec L20-21 (Artemis-ii scope lists the module, command, physics, scripted pair and prediction, but not the wire). Spec L171 (joins `DuelCommand` and `DUEL_KINDS` only). The old bullet 'Wire. The command codec admits the new kind…' is removed in the diff. src/renderer/src/net/codec.ts:L110-121 (duelWire.commands: sit, stand, presence, laserLock, laserCharge, missileLaunch, rematch, setPaused, each `.strict()`). src/renderer/src/net/contracts.ts:L74-76 (the wire DuelCommand union). · A plan built from §5 would leave the codec alone. Online throttle presses and notch clicks would then be refused on the wire, which breaks the online duel's Helm. §8's online test uses the two-presses-in-one-round-trip path and could pass against a fake client without catching it. · Restore it in §5.2. 'throttle' joins the wire DuelCommand in net/contracts.ts and duelWire.commands in net/codec.ts as `z.object({ kind: z.literal('throttle'), level: z.number().int().min(-1).max(4) }).strict()`, or as any finite number so that the sim answers `malformed`. State which one. Keep the note that the signalling service needs no redeploy. Add a codec round-trip test to §8. It lands in step 1 of §5.6.

### [P2] R2-F2 clear() on every console change now empties the physical keyboard too, and the new Space-transition rule makes an auto-repeat count a fireDown
§6.2 says clear() 'empties both sets' and runs on stand, sit, any pause, the end card and a new round. Today stand and sit leave held keys alone. Clearing the physical set also means OS auto-repeat (keydown with repeat=true still adds the code to `held`) re-adds Space. Under the new rule ('fireDown is counted when the merged Space state goes from released to held, whichever source caused it'), that re-add is a fresh press edge. That contradicts 'auto-repeat does not count'. · Spec L269-272 (clear empties both sets; runs on stand, sit, pause, end card, new round). Spec L263-265 (fireDown counted on any merged transition). src/renderer/src/app/duel/input.ts:L48-53 (`held.add` runs on repeat keydowns; presses only when `!e.repeat`), L22 comment ('auto-repeat does not count'). src/renderer/src/app/duel/runtime.ts:L325 (stand does not clear keys today), L321-323 (a standing character walks from held keys). · Holding D at the Helm and pressing X stops the walk until auto-repeat starts. Holding Space through an Esc pause and its resume can start a new charge from a repeat event. Both change today's keyboard play, which a fixed decision protects. They also make the edge rule depend on the OS repeat rate. · Split the clear. On a console change or null, clear only the `ui` set and the requests (`clearUi()`). The physical set stays cleared only where it is today (Tab, restart, blur). State that a repeat keydown never counts a fireDown, even when it re-adds Space to the merged state. Add both cases to §8's keyboard-merge tests.

### [P3] R2-F3 `HeldFlags` is named as a type but does not exist and is not defined
§6.1 gives `uiHeld(): HeldFlags` as a new DuelViewSource member. No `HeldFlags` type exists in the codebase, and the spec neither defines it nor marks it new. ConsoleView uses two different inline `held` shapes. · Spec L243 (`uiHeld(): HeldFlags`), L234-235 (inline `held` shapes). grep 'HeldFlags' in src/renderer/src: no matches. src/renderer/src/app/duel/scene.ts:L27 (DuelViewSource). · A fresh subagent has to invent the shape, which is minor. · Define it inline in §6.1, for example `interface HeldFlags { fire: boolean; left: boolean; right: boolean; up: boolean; down: boolean }` (new, in app/duel/input.ts). Say that the runtime fills it from its last merged KeySample.

## Prior findings
- R1-F1: resolved — §3 releases a hold exactly once on unmount (L101-103). §6.2 clears the keyboard on any station change or null console (L269-272). §7 restates this. The side effect of also clearing the physical set is raised as a new P2.
- R1-F2: resolved — §6.2 makes the keyboard the merge point, with two sets, edges on merged Space transitions and axes from merged codes (L249-265). This matches input.ts sample() (L64-67). The auto-repeat interaction is raised separately.
- R1-F3: resolved — §6.3 defines tabs by occupancy and uses the same rules in both modes (L281-287). The E click requires consoleInReach and repairInReach < 0, as runtime.ts L322 and onlineDuel.ts L165 do. The single-player Tab case is explicit.
- R1-F4: resolved — The MIGRATIONS[40] shape matches the existing entry at scripts/golden/duelOracle.ts:L106 ({change, rename, derived, added}). The oracle's `<module id>.<field>` naming (L109-110) makes `helm.throttle` the right pattern. The two-step bless is at spec L214-220.
- R1-F5: still open — runtime/online axes() and telemetry are fixed (L189-192). §5.5 (L209-210) is not: it says hazardAway predicts with `throttleThrust(wanted)`, but hazardAway is what decides the wanted thrust (scripted.ts:L92-93 call it first, with last tick's `pair.axes`). So 'wanted' is circular. Two readings remain, the previous wanted level or `d.throttle`. They differ after a re-sit, because `pair.axes` is reset to 0 while standing (scripted.ts:L260) and d.throttle is kept. That gives different goldens. Fix: predict with `{ turn: pair.axes.turn, thrust: throttleThrust(d.throttle) }`, the thrust the ship actually flies at this tick before any new command.
- R1-F6: resolved — Spec L208-209 compares the wanted level against d.throttle on each seated tick, so a re-sit corrects a kept throttle.
- R1-F7: resolved — Spec L199-202 defines throttleSent {level, sequence}, its clearing on result, attach, round, stand and sit, and the fallback to d.throttle. Results carry id.sequence for our seat (onlineDuel.ts:L153), so the rule is buildable. §8 tests two presses in one round trip.
- R1-F8: still open — The module, DUEL_KINDS, check order and the noop status in the running helper are now specified (L164-179), and they match step.ts:L27, L44 and L137-139. The snapshot part is not. Spec L166 says only 'carried by the snapshot', and the round-1 'validated as an integer in range' was removed. validateDuelSnapshot uses fixed offsets (snapshot.ts:L128 `interiorAt = roundAt + 4`, L129 length check, L145 round slice). A helm module after round shifts the interior by one, and nothing range-checks a throttle of 7 or 0.5. Fix: in §5.1, say snapshot.ts gains `helmAt = roundAt + 4; interiorAt = helmAt + 1` and rejects any throttle that is not an integer in −1..4, and add that case to §8's snapshot test.
- R1-F9: resolved — Labels use FONT_NATIVE (16, theme.ts:L22), values use FONT_SIZE, the station is 300 wide, and only ASCII is drawn (spec L56-57). The rows fit: the LOCK row at 6 px per glyph is about 170 px. The status table check holds: 14 × LINE 24 = 336 from y 42 ends at 378, above the Weapons station top at 492.
- R1-F10: resolved — The reserve {left 228, right 156} replaces reserveRight. That matches the uses at tacticalModel.ts:L80, L187-188, L202-203, weaponsModel.ts:L88 and scene.ts:L95. FLIGHT_RESERVE_RIGHT exists (flightMode.ts:L26). The notice centre (228+1124)/2 = 676 is correct. The interior readout starts at x 1068 (ReadoutPanel.tsx:L19), so moving INTERIOR_BAND's top to 42 (interiorModel.ts:L13) is the right fix.
- R1-F11: resolved — The actions.console slot with setConsole is buildable. The main.ts single/online closures can reference `actions` at call time (main.ts:L84-93, L105). Paused is defined (runtime.ts:L395 paused(); online phase). The undefined HeldFlags type is a new P3.
- R1-F12: resolved — No tabIndex, and preventDefault on pointerdown, mousedown, contextmenu and auxclick for any button (spec L95-99). This covers the gap left by the canvas-only listeners in input.ts:L116, L124.

## Verified
- step.ts:L44 `attendant(d, station)` matches spec L175 `attendant(d, d.nav)`; DUEL_KINDS at step.ts:L27 gives duel-decided via stepDecided L119
- Running result helper step.ts:L137-139 emits only applied/rejected, so the spec's 'gains a noop status' (L178-179) is a needed and correctly named change; stepDecided already has the status parameter (L101-102)
- 'invalid-seat' and 'stale-tick' are existing duel reasons (modules.ts:L65), so helmModule's reasons list (spec L167) uses known values
- DUEL_MODULES order (modules.ts:L77-84) lets a helm module sit between round and interior as spec L164 says
- MIGRATIONS entry shape and field naming (duelOracle.ts:L77-82, L106, L109-110) match spec L216-217
- Keyboard: KeySample (input.ts:L18-24) and sample() (L64-69) can be rebuilt from a merged set as §6.2 says; runtime fire handling (runtime.ts:L334-339) works unchanged on merged edges
- Layout arithmetic: tabs 3×96+2×4 from x 12 end at 308; STATION tops 492/508; status 14×24 rows end at 378
- Scripted wanted thrust values are −1/0/1 (scripted.ts:L107-111), so the 1→4, 0→0, −1→−1 mapping in spec L208 is complete
- Telemetry manoeuvre (telemetry.ts:L128) can be restated as turn held or throttle ≠ 0 as spec L192 says

## Not verified
- Whether the online authority in src/main/network/onlineDuel.ts also validates command kinds separately from net/codec.ts. I did not read it, and it may need the throttle kind too.
- Whether the online publication delivers a command's result in the same frame as the replica state that reflects it, which the 'applied: the replica has the level' clearing rule in §5.4 assumes
- Whether createDuel (used by startRound, step.ts:L86) is where the throttle's 0 initial value must live. The spec says startRound sets it, but startRound builds a fresh duel through createDuel.
- Banners.tsx:L11 PLAY_CX still centres the other duel banners on (1280−220)/2. I did not check whether those banners overlap the new left panels.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `7e3e683`. 3 new accepted, 2 reopened fixed again, 0 rejected. R1-F1–F4, F6, F7 and F9–F12 confirmed resolved.

## R1-F5 [P1]: Predicted path, flame, telemetry and scripted prediction read held W/S

Confirmed: 'wanted' was circular. scripted.ts L92-93 calls hazardAway before it decides. §5.5 now predicts with `{ turn: pair.axes.turn, thrust: throttleThrust(d.throttle) }`.

## R1-F8 [P2]: Admission and module placement

Confirmed. snapshot.ts L128-145 uses fixed offsets. §5.1 now names `helmAt = roundAt + 4; interiorAt = helmAt + 1` and the integer range check. §8 adds the rejection cases.

## R2-F1 [P1]: The wire step was dropped

Confirmed. codec.ts L110-121 is a closed strict list. §5.2 restores a Wire paragraph: contracts plus codec with `z.number().finite()`, so a bad level is answered `malformed` by the sim. It lands in step 1. §8 adds a codec round trip.

## R2-F2 [P2]: clear() empties the physical keyboard; auto-repeat counts as fireDown

Confirmed. input.ts L48-53 adds repeats to held. §6.2 splits `clear()` (Tab, restart and blur, as today) from `clearUi()` (console change). A repeat keydown never counts a fireDown. §7 and §8 are updated.

## R2-F3 [P3]: HeldFlags undefined

Confirmed. §6.1 defines it inline as new in app/duel/input.ts.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-artemis-consoles-design.md

<!-- end -->

---

