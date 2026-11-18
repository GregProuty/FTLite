// The contact window's state (enemy ship window spec §3, §5, §6.1; Sci-1 spec §7.2, §7.3): which map contact the window
// shows (a contact id: 0 the enemy, 1 the derelict) and whether the laser aim is armed, and the requests Science's
// clicks and keys and the SCAN button make (designate, scan). Pure and local to one player's screen: the duel modes
// turn the requests into commands. One controller per duel mode, beside the keyboard; the scene drives `click` and
// `sync` each frame, the UI actions drive the rest, and `intercept` is the keyboard's hook for Esc, T and S, reading
// what the last `sync` recorded.
import type { ConsoleStation } from '../../render/duel/consoleModel';

export type ContactId = 0 | 1;
export interface ContactState { contact: ContactId; aim: boolean }
/** One frame's facts for the closing rules: `shown` is the console shown on a map view (Helm, Weapons or Science);
 *  `station` the console's station, null while it is hidden; `target` the enemy's ship slot (the crew laser's target);
 *  `active` whether a slot's ship is active; `epoch` the round; `enemyKnown` the enemy's scan level (absent: 2). */
export interface ContactSync { shown: boolean; station: ConsoleStation | null; target: number; active: (slot: number) => boolean; epoch: number; enemyKnown?: number }
/** What the clicks and keys asked the duel mode to send since the last take: a designation (−1, 0 or 1) and a scan. */
export interface ContactRequests { designate: number | null; scan: ContactId | null }
export interface ContactController {
  state(): ContactState | null;
  /** A map click: on Helm or Weapons open on the contact, switch to it (disarmed), or close when it is the shown one; on
   *  Science select it and request designate. null does nothing. */
  click(contact: ContactId | null): void;
  /** T: Helm and Weapons cycle enemy, derelict, closed; Science cycles enemy, derelict, none and requests designate. */
  toggle(): void;
  /** The window's X: closes it (on Science deselects and requests designate −1). */
  close(): void;
  /** LASER: toggles the aim while the enemy is shown at Level 1 or more, never on Science; a no-op on the derelict. */
  arm(): void;
  cancelAim(): void;
  /** Esc: disarms if armed, else closes (on Science deselects); true when it took something, false when nothing is open. */
  escape(): boolean;
  /** SCAN (the window's button; S on Science): request a scan of the shown contact. */
  scan(): void;
  /** The closing rules, once per frame: clears when not shown, on a new epoch, and the enemy contact when its slot is
   *  inactive; disarms on a station change and when the enemy is below Level 1. Records the frame for `intercept`.
   *  Returns whether the window is shown (always on Science while shown, even with nothing selected). */
  sync(s: ContactSync): boolean;
  /** A room click while armed: `lock(room)` (the console lock path), then disarm; the window stays open. */
  pick(room: number, lock: (room: number) => void): void;
  /** The keyboard's intercept: true takes the key. Escape while shown with a contact; KeyT while shown on Helm, Weapons
   *  or Science; KeyS while shown on Science; everything else false. */
  intercept(code: string): boolean;
  /** The requests since the last take, then cleared. */
  takeRequests(): ContactRequests;
}
/** What the UI's actions forward to (ui/actions.ts setContact). */
export type ContactActions = Pick<ContactController, 'close' | 'arm' | 'cancelAim' | 'pick' | 'scan'>;

export function createContactController(): ContactController {
  let st: ContactState | null = null, designate: number | null = null, scanned: ContactId | null = null;
  // What the last sync recorded (the last drawn frame).
  let allowed = false, station: ConsoleStation | null = null, epoch: number | null = null, enemyKnown = 2;
  const science = (): boolean => station === 'science';
  const select = (next: ContactId | null): void => { st = next === null ? null : { contact: next, aim: false }; designate = next ?? -1; };
  const c: ContactController = {
    state: () => st,
    click(contact) {
      if (contact === null) return;
      if (science()) { select(contact); return; }
      st = st && st.contact === contact ? null : { contact, aim: false };
    },
    toggle() {
      const next: ContactId | null = st === null ? 0 : st.contact === 0 ? 1 : null;
      if (science()) select(next); else st = next === null ? null : { contact: next, aim: false };
    },
    close() { if (science()) select(null); else st = null; },
    arm() { if (st && st.contact === 0 && enemyKnown >= 1 && !science()) st = { ...st, aim: !st.aim }; },
    cancelAim() { if (st?.aim) st = { ...st, aim: false }; },
    escape() {
      if (!st) return false;
      if (st.aim) st = { ...st, aim: false };
      else if (science()) select(null);
      else st = null;
      return true;
    },
    scan() { if (st) scanned = st.contact; },
    sync(s) {
      if (epoch !== null && s.epoch !== epoch) st = null;                        // a new round
      enemyKnown = s.enemyKnown ?? 2;
      if (st && (!s.shown || (st.contact === 0 && !s.active(s.target)))) st = null;   // hidden, SHIP, paused, decided, or the enemy is gone
      if (st?.aim && station !== null && s.station !== station) st = { ...st, aim: false };   // a station change disarms
      if (st?.aim && enemyKnown < 1) st = { ...st, aim: false };
      allowed = s.shown; station = s.station; epoch = s.epoch;
      return allowed && (st !== null || station === 'science');
    },
    pick(room, lock) {
      if (!st?.aim) return;
      lock(room);
      st = { ...st, aim: false };
    },
    intercept(code) {
      if (code === 'Escape') return allowed && st !== null ? c.escape() : false;
      if (!allowed) return false;
      if (code === 'KeyT' && (station === 'helm' || station === 'weapons' || station === 'science')) { c.toggle(); return true; }
      if (code === 'KeyS' && science()) { c.scan(); return true; }
      return false;
    },
    takeRequests() { const out = { designate, scan: scanned }; designate = null; scanned = null; return out; }
  };
  return c;
}
