// The text-parity probe (UI-ii Task 5, `?mode=uiprobe`): Pixi BitmapText on the left half, <PixelText> on the right.
import { BitmapText, Graphics } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../shared/resolution';
import type { Renderer } from '../render/renderer';
import { AMBER, DIM, GOOD, TEXT } from '../render/theme';
import { CREW_SHIP } from '../render/tactical/shipColours';
import type { DuelUiView } from '../ui/views';
import type { ConsoleView } from '../render/duel/consoleModel';
import { NO_HELD_FLAGS } from './duel/input';
import { PROBE_SAMPLES } from '../ui/probe/samples';

/** A fixture duel view for `?mode=uiprobe&probe=duel`: readout rows, the end card and all three banners. */
function consoleFixture(which: 'helm' | 'weapons'): DuelUiView {
  const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: AMBER } };
  const base: ConsoleView = {
    station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
    helm: null, science: null, weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null },
    side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' }
  };
  const cv: ConsoleView = which === 'weapons' ? base : { ...base, station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
    weapons: null, helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 2 }, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } };
  const row = (label: string, value: string, extra: object = {}) => ({ label, value, labelTint: DIM, valueTint: TEXT, ...extra });
  return {
    readout: { rows: [
      { label: 'HOUND', value: '', labelTint: AMBER, valueTint: AMBER },
      row('HULL', '30/40'), row('SHIELD', '', { pips: { n: 1, max: 2, colour: CREW_SHIP } }),
      row('WEAPONS', '3/3'), row('SHIELDS', '2/2'), row('ENGINES', '2/2'),
      { label: 'HUNTER', value: '', labelTint: AMBER, valueTint: AMBER },
      row('HULL', '22/30'), row('SHIELD', '', { pips: { n: 2, max: 2, colour: CREW_SHIP } }),
      row('ROOMS', '5/6'), row('OTHER', '1')
    ], help: [] },
    end: null, banners: { interior: null, tactical: null, notice: null },
    overlay: { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: false }, crt: true, console: cv
  };
}

export function duelProbeFixture(console?: 'helm' | 'weapons'): DuelUiView {
  if (console) return consoleFixture(console);
  return {
    readout: { rows: [
      { label: 'WEAPONS', value: '', labelTint: AMBER, valueTint: AMBER },
      { label: 'HULL', value: '18/30', labelTint: DIM, valueTint: TEXT },
      { label: 'SHIELD', value: '', labelTint: DIM, valueTint: TEXT, pips: { n: 1, max: 2, colour: CREW_SHIP } },
      { label: 'LASER', value: 'READY — 98%', labelTint: DIM, valueTint: GOOD, bar: { fill: 0.6, colour: AMBER } }
    ], help: ['TAB: SWITCH', 'ENTER: REMATCH…'] },
    end: { title: 'VICTORY', tint: GOOD, length: 'DUEL LENGTH 1:23', prompt: 'ENTER: REMATCH   ESC: LEAVE' },
    banners: { interior: 'PAUSED', tactical: 'PAUSED TACTICAL', notice: 'YOU: HELM' },
    overlay: null,
    crt: false
  };
}

export function startUiProbe(renderer: Renderer, withText = true): void {
  for (const child of renderer.app.stage.children) child.visible = false;
  const bg = new Graphics().rect(0, 0, INTERNAL_W, INTERNAL_H).fill(0x05060a);
  renderer.app.stage.addChild(bg);
  if (!withText) return;
  for (const p of PROBE_SAMPLES) {
    const t = new BitmapText({ text: p.text, style: { fontFamily: renderer.assets.fontFamily, fontSize: p.size } });
    t.tint = p.tint; t.anchor.set(p.anchorX, p.anchorY); t.roundPixels = true; t.position.set(p.x, p.y);
    renderer.app.stage.addChild(t);
  }
}
