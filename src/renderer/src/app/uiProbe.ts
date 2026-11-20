// The text-parity probe (UI-ii Task 5, `?mode=uiprobe`): Pixi BitmapText on the left half, <PixelText> on the right.
import { BitmapText, Graphics } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../shared/resolution';
import type { Renderer } from '../render/renderer';
import { AMBER, GOOD, TEXT } from '../render/theme';
import type { DuelUiView } from '../ui/views';
import type { ConsoleView } from '../render/duel/consoleModel';
import { NO_HELD_FLAGS } from './duel/input';
import { PROBE_SAMPLES } from '../ui/probe/samples';

/** A fixture duel view for `?mode=uiprobe&probe=duel`: readout rows, the end card and all three banners. */
function consoleFixture(which: 'helm' | 'weapons'): DuelUiView {
  const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: AMBER } };
  const base: ConsoleView = {
    station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
    helm: null, science: null, weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: 1, torpTarget: -1, burst: 2 },
    side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' }
  };
  const cv: ConsoleView = which === 'weapons' ? base : { ...base, station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
    // playtest2feedback §6: the crew Helm
    weapons: null, helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 0, crew: { thrMille: 500, cap: 750, floor: -500, bars: 3, gas: 720, gasMax: 720, gasLow: false, venting: false } }, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } };
  return {
    end: null, banners: { interior: null, tactical: null, notice: null },
    overlay: { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: false }, crt: true, console: cv
  };
}

export function duelProbeFixture(console?: 'helm' | 'weapons'): DuelUiView {
  if (console) return consoleFixture(console);
  return {
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
