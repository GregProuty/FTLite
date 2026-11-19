// The read-only controls list on the Settings page (main menu spec, 2026-11-16). Built from the input code's own tables
// (the duel's PRESS_CODES and held keys, the sector's one keyboard cluster), so the list cannot drift from the bindings.
import { FIRE_HELD, FREQ_CODES, INTERACT_HELD, MOVE_CODES, PING_CODE, PRESS_CODES, WEAPON_CODES, type KeyAction } from './duel/input';
import { SECTOR_KEYS } from '../input/sources';
import { FULLSCREEN_KEY } from '../../../shared/onlineSession';

export interface ControlRow { keys: string; action: string }
export interface ControlSection { title: string; rows: ControlRow[] }

const NAMED: Readonly<Record<string, string>> = {
  Space: 'Space', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Num Enter', Equal: '=', Minus: '-', NumpadAdd: 'Num +', NumpadSubtract: 'Num -'
};
/** A KeyboardEvent.code as the key cap reads: KeyE → E, Equal → =, NumpadAdd → Num +. */
export function keyLabel(code: string): string {
  return NAMED[code] ?? (code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code);
}

/** What each single-player press action does. `fireUp` is the Space release, listed with the held Space. */
const DUEL_ACTION: Readonly<Record<Exclude<KeyAction, 'fireUp'>, string>> = {
  interact: 'Sit at a console; at Weapons, lock the next target',
  prevLock: 'At Weapons, lock the previous target',
  fireDown: 'At Weapons, fire a full laser; at the Helm, hold to turn the nose onto the enemy (auto-face)',
  launch: 'At Weapons, launch a torpedo',
  stand: 'Stand up from a console',
  switch: 'Switch between the Helm and Weapons characters',
  pause: 'Pause and resume',
  camera: 'Snap the camera back (at Weapons, change camera; in the ship, follow your character)',
  zoomIn: 'Zoom in (the maps and the ship)',
  zoomOut: 'Zoom out (the maps and the ship)',
  confirm: 'Start a new duel (end screen)',
  menu: 'Return to the main menu (paused or end screen)',
  throttleUp: 'At the Helm, throttle up a notch (it stays set)',
  throttleDown: 'At the Helm, throttle down a notch (to stop, then reverse)'
};

/** The codes bound to one press action, in table order. */
function codesFor(action: KeyAction): string[] {
  return Object.entries(PRESS_CODES).filter(([, a]) => a === action).map(([code]) => code);
}

export function controlSections(): ControlSection[] {
  const move = [MOVE_CODES.up, MOVE_CODES.left, MOVE_CODES.down, MOVE_CODES.right].map(keyLabel).join(' ');
  // The mouse rows are written here by hand (createPointerSource in duel/input.ts: wheel zooms, right or middle drag pans).
  const duel: ControlRow[] = [{ keys: move, action: 'Walk; at the Helm, A/D turn' }];
  for (const action of Object.keys(DUEL_ACTION) as (keyof typeof DUEL_ACTION)[]) {
    const keys = codesFor(action).map(keyLabel).join(' / ');
    duel.push({ keys, action: DUEL_ACTION[action] });
    if (action === 'interact') duel.push({ keys: `Hold ${keyLabel(INTERACT_HELD)}`, action: 'Repair the damaged system you stand at' });
  }
  duel.find((r) => r.keys === keyLabel(FIRE_HELD))!.keys = `Hold ${keyLabel(FIRE_HELD)}`;
  // Feel-ii: Shift+W, the ping (G or a middle click), the Helm's right-click heading and the wheel over the throttle; W-1: the Weapons map's left click (the pew).
  duel.push({ keys: `Shift+${keyLabel(MOVE_CODES.up)}`, action: 'At the Helm, full throttle' }, { keys: `${keyLabel(PING_CODE)} / Middle click`, action: 'Ping the map point (or the enemy) for the crew' });
  duel.push({ keys: 'Mouse wheel', action: 'Zoom (the maps and the ship); over the Helm throttle, step it' },
    { keys: 'Left click', action: 'At Weapons, fire the pew at the map point (3 shots, then it recharges; inside a 60° cone of the nose)' },
    { keys: 'Right click or drag', action: 'At the Helm, set a heading to hold (on your ship: clear); elsewhere pan' },
    { keys: 'Middle drag', action: 'Pan the camera (in the ship, when zoomed in)' });
  const k = SECTOR_KEYS;
  const sector: ControlRow[] = [
    { keys: [k.up, k.left, k.down, k.right].map(keyLabel).join(' '), action: 'Walk' },
    { keys: keyLabel(k.interact), action: 'Interact; hold to work a station' },
    { keys: keyLabel(k.confirm), action: 'Confirm' },
    { keys: keyLabel(k.cancel), action: 'Cancel' },
    { keys: keyLabel(k.callout), action: 'Call out to the crew' }
  ];
  // Valkyrn spec §5.1: the Flight seat (Helm and Weapons in one), written from the same tables where a key is bound there.
  const torpKey = Object.entries(WEAPON_CODES).find(([, w]) => w === 'torpedo')![0], laserKey = Object.entries(WEAPON_CODES).find(([, w]) => w === 'laser')![0];
  const flight: ControlRow[] = [
    { keys: 'Mouse', action: 'At the Flight seat, the nose turns toward the pointer' },
    { keys: 'Hold left mouse', action: 'Fire the minigun (with the laser fit: nothing, the laser fires at its target)' },
    { keys: 'Right mouse', action: 'Launch a torpedo' },
    { keys: `Hold ${keyLabel(FIRE_HELD)}`, action: 'Auto-face: turn the nose onto the enemy' },
    { keys: `${keyLabel(MOVE_CODES.up)} / ${keyLabel(MOVE_CODES.down)}, Shift+${keyLabel(MOVE_CODES.up)}, wheel over the throttle`, action: 'Throttle (it stays set)' },
    { keys: `${codesFor('prevLock').map(keyLabel).join('')} / ${codesFor('interact').map(keyLabel).join('')}`, action: "Step the torpedo's target room" },
    { keys: keyLabel(torpKey), action: 'Pick up the torpedo, then click a room in the enemy window' },
    { keys: `${keyLabel(laserKey)} / ${Object.keys(FREQ_CODES).map(keyLabel).join(' ')}`, action: 'With the laser fit only: pick up the laser; tune its frequency' },
    { keys: `${keyLabel(PING_CODE)} / Middle click`, action: 'Ping the map point (or the enemy)' },
    { keys: 'Middle drag', action: 'Pan the camera' },
    { keys: keyLabel('Tab'), action: 'Switch between the Flight console and the ship view' }
  ];
  return [{ title: 'Single player', rows: duel }, { title: 'Single player: Valkyrn', rows: flight }, { title: 'Multiplayer', rows: sector }, { title: 'Anywhere', rows: [{ keys: FULLSCREEN_KEY, action: 'Toggle fullscreen' }] }];
}
