// Sci-1 (spec 2026-11-17-science-scans §7.1, §7.2, §7.3, §7.4): the hostility line, the hover readout, the SCAN button
// state, the Weapons frequency row and the Science panel in the console model, the consoles' readout row, and the layout.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { CONTACT, STATION, stationTop, STATUS } from '../src/renderer/src/render/duel/consoleLayout';
import { readoutRows } from '../src/renderer/src/render/duel/readoutModel';
import { FREQ_NAMES, hostilityLine, hoverReadout, LOOT_NAMES, scanButton } from '../src/renderer/src/render/duel/scienceModel';
import { LINE, PAD } from '../src/renderer/src/render/theme';

const CUTTER = parseShip(cutter);
const OVERLAY = { zoomText: 'ZOOM 0.50', scaleBar: { px: 50, units: 100 }, snapHint: false };

describe('the hostility line (spec §7.1)', () => {
  it('INCOMING SCAN (blinking) before Level 1; HOSTILE IN n s after; HOSTILE for 3 s once hostile; then nothing', () => {
    const t = createTacticalState(5);   // Patrol from rt 0
    expect(hostilityLine(t)).toEqual({ text: 'INCOMING SCAN', alert: true });
    t.known[0] = 1; t.tick = 600;
    expect(hostilityLine(t)).toEqual({ text: 'HOSTILE IN 10 s', alert: false });
    t.tick = 1199;
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
    expect([FREQ_NAMES, LOOT_NAMES]).toEqual([['A', 'B', 'C'], ['HULL', 'MISSILES', 'SHIELD']]);
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
        expect([m.station, m.science, m.weapons, m.helm]).toEqual(['science', { hover: 'BRG 090 RNG 100' }, null, null]);
        expect(consoleModel({ duel: sci, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!.science).toEqual({ hover: null });
      } finally { disposeDuel(sci); }
    } finally { disposeDuel(d); }
  });
  it('the consoles\' readout carries the hostility line right after the HUNTER heading; the plain readout does not', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const labels = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING', console: true }).map((r) => r.label);
      expect(labels[labels.indexOf('HUNTER') + 1]).toBe('INCOMING SCAN');
      expect(readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING' }).map((r) => r.label)).not.toContain('INCOMING SCAN');
      const row = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING', console: true }).find((r) => r.label === 'INCOMING SCAN')!;
      expect(row.emphasis).toBe('alert');
      d.tactical.systems[0].shields = 3;   // the Shield loot's extra layer shows as a third pip
      expect(readoutRows({ duel: d, mode: 'helm', active: 0, other: 'WALKING', console: true }).find((r) => r.label === 'SHIELD')!.pips).toMatchObject({ n: 3, max: 3 });
    } finally { disposeDuel(d); }
  });
});

describe('the layout (spec §7.3, §7.4)', () => {
  it('the Weapons block is 248 high, the contact window 420, the Science block 96; the status table still ends above the Weapons block', () => {
    expect([STATION.h.weapons, stationTop('weapons'), CONTACT.h, STATION.h.science, stationTop('science')]).toEqual([248, 460, 420, 96, 612]);
    const d = createDuel(CUTTER, 5);
    try {
      d.tactical.systems[0].rooms = [2, 1, 1];
      const rows = readoutRows({ duel: d, mode: 'weapons', active: 0, other: 'AT HELM', console: true });
      expect(STATUS.y + PAD + LINE * rows.length + PAD).toBeLessThanOrEqual(stationTop('weapons'));
    } finally { disposeDuel(d); }
  });
});
