// Sci-1 (spec 2026-11-17-science-scans §7.1, §7.2, §7.3, §7.4): the hostility line, the hover readout, the SCAN button
// state, the Weapons frequency row and the Science panel in the console model, and the layout (UI round §2.2: the consoles' readout row is gone).
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { sensorRange } from '../src/renderer/src/sim/tactical/science';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { CONTACT, STATION, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
import { FREQ_NAMES, hostilityLine, hoverReadout, LOOT_NAMES, scanButton } from '../src/renderer/src/render/duel/scienceModel';

const CUTTER = parseShip(cutter);
const OVERLAY = { zoomText: 'ZOOM 0.50', scaleBar: { px: 50, units: 100 }, snapHint: false };

describe('the hostility line (spec §7.1)', () => {
  it('INCOMING SCAN (blinking) before Level 1; HOSTILE IN n s after; HOSTILE for 3 s once hostile; then nothing', () => {
    const t = createTacticalState(5);   // holding from rt 0
    expect(hostilityLine(t)).toEqual({ text: 'INCOMING SCAN', alert: true });
    t.known[0] = 1; expect(hostilityLine(t)?.text).toBe('HOSTILE IN 30 s');   // the 30 s hold (owner decision 2026-11-17)
    t.tick = 600;
    expect(hostilityLine(t)).toEqual({ text: 'HOSTILE IN 20 s', alert: false });   // ceil((1800 - 600) / 60)
    t.tick = 1799;
    expect(hostilityLine(t)).toEqual({ text: 'HOSTILE IN 1 s', alert: false });
    t.hostileAt = 300; t.tick = 300;
    expect(hostilityLine(t)).toEqual({ text: 'HOSTILE', alert: true });
    t.tick = 479; expect(hostilityLine(t)?.text).toBe('HOSTILE');
    t.tick = 480; expect(hostilityLine(t)).toBeNull();
  });
});

describe('the hover readout (spec §7.3)', () => {
  it('bearing in whole degrees clockwise from map up, range rounded to 10, from the crew ship to the cursor', () => {
    const cam = createCamera(0, 0, 1), vp = { w: 1280, h: 720 };
    expect(hoverReadout(cam, vp, { x: 0, y: 0 }, { x: 740, y: 360 })).toBe('BRG 090 RNG 100');
    expect(hoverReadout(createCamera(0, 0, 0.12), vp, { x: 0, y: 0 }, { x: 640, y: 360 - 174 })).toBe('BRG 000 RNG 1450');
    expect(hoverReadout(cam, vp, { x: 0, y: 0 }, { x: 640 - 3, y: 360 + 3 })).toBe('BRG 225 RNG 0');
    expect(hoverReadout(cam, vp, { x: 0, y: 0 }, null)).toBeNull();
  });
});

describe('the SCAN button (spec §7.2)', () => {
  it('names the next level, (SLOW) off Science, SCANNED when fully known; the progress while the scanner is on it', () => {
    const t = createTacticalState(5);
    expect(scanButton(t, 0, 'science')).toEqual({ label: 'SCAN 1', enabled: true, progress: null });
    expect(scanButton(t, 0, 'helm')).toEqual({ label: 'SCAN 1 (SLOW)', enabled: true, progress: null });
    t.known[0] = 1; t.scan = { contact: 0, level: 2, progress: 900, rate: 5, by: 3 };
    expect(scanButton(t, 0, 'weapons')).toEqual({ label: 'SCAN 2 (SLOW)', enabled: true, progress: 0.5 });
    expect(scanButton(t, 1, 'science')).toEqual({ label: 'SCAN 1', enabled: true, progress: null });
    t.known = [2, 1];
    expect(scanButton(t, 0, 'science')).toEqual({ label: 'SCANNED', enabled: false, progress: null });
    expect(scanButton(t, 1, 'helm')).toEqual({ label: 'SCANNED', enabled: false, progress: null });
    expect([FREQ_NAMES, LOOT_NAMES]).toEqual([['A', 'B', 'C'], ['HULL', 'TORPEDOES', 'SHIELD']]);
  });
});

describe('the console model (spec §7.3, §7.4)', () => {
  it('Weapons gets the tuned frequency and, after enemy Level 2 only, the weak one; Science gets its hover line', () => {
    const d = createDuel(CUTTER, 5);
    try {
      sitDown(d.interior, 0, d.weapons);
      d.tactical.systems[0].freq = 2;
      const model = (hover?: string | null) => consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY, ...(hover === undefined ? {} : { hover }) })!;
      expect(model().weapons).toMatchObject({ freq: 2, weakFreq: null });
      d.tactical.known[0] = 1; expect(model().weapons!.weakFreq).toBeNull();
      d.tactical.known[0] = 2; expect(model().weapons!.weakFreq).toBe(d.tactical.weakFreq);
      expect(model().science).toBeNull();
      const sci = createDuel(CUTTER, 5);
      try {
        sitDown(sci.interior, 0, sci.science);
        const m = consoleModel({ duel: sci, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY, hover: 'BRG 090 RNG 100' })!;
        const range = sensorRange(sci.tactical.systems[0]!);   // UI round §2.4: the range the power strip showed rides the Science panel
        expect([m.station, m.science, m.weapons, m.helm]).toEqual(['science', { hover: 'BRG 090 RNG 100', range }, null, null]);
        expect(consoleModel({ duel: sci, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!.science).toEqual({ hover: null, range });
        expect(range).toBe(1800);   // Engineering spike §10.4: the start sensor range, doubled (owner 2026-11-20; was 900)
      } finally { disposeDuel(sci); }
    } finally { disposeDuel(d); }
  });
});

describe('the layout (spec §7.3, §7.4)', () => {
  it('the Weapons block is 268 high (the frequency row where the steer row was; W-1: the PEW row on top; the Engineering spike: the bar pips, merge kind a, was 244), the contact window 420, the Science block 96', () => {
    expect([STATION.h.weapons, stationTop('weapons'), CONTACT.h, STATION.h.science, stationTop('science')]).toEqual([268, 440, 420, 96, 612]);
  });
});
