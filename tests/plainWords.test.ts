import { describe, it, expect } from 'vitest';
import { targetRowText, scienceFooter, skillsLine, type DebrisTarget, type SciencePanel } from '../src/renderer/src/render/hudModel';
import { textPx } from '../src/renderer/src/render/theme';
import { CARD_INNER_W, BLOCK_INNER_W } from '../src/renderer/src/render/hudLayout';

/** Plain words (spec Demo-xii section 3). */
const base: DebrisTarget = { stableId: 1, kind: 'debris', room: 'Engine', eta: 7, frequency: null, hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null };
const enemy: DebrisTarget = { ...base, kind: 'enemy', room: 'Enemy ship', eta: 117, hull: 1, shieldsUp: true, layers: 1, layersMax: 1, weaponCharge: 0, fleeSeconds: 0 };

describe('R3: plain words', () => {
  it('the Science footer says what the lead is: how early hazards are warned', () => {
    expect(scienceFooter({ leadSeconds: 18, scanning: false, lock: '' } as unknown as SciencePanel)).toBe('Warning 18s');
    expect(scienceFooter({ leadSeconds: 18, scanning: true, lock: 'LOCKED 6s' } as unknown as SciencePanel)).toBe('Warning 18s   Scanning   LOCKED 6s');
  });
  it('the enemy hull row: freq ?, freq 2, shields down; the eta reads leaves; the layer bracket kept', () => {
    expect(targetRowText(enemy)).toBe('Enemy 100% leaves 117s freq ? [#]');
    expect(targetRowText({ ...enemy, frequency: 2 })).toBe('Enemy 100% leaves 117s freq 2 [#]');
    expect(targetRowText({ ...enemy, shieldsUp: false })).toBe('Enemy 100% leaves 117s shields down');
  });
  it('the fit rule: too wide for the card drops the bracket first, then leaves becomes out, then the scan figure goes; the font never shrinks', () => {
    const wide = { ...enemy, eta: 999, layers: 4, layersMax: 4 };
    expect(targetRowText(wide, 0.99)).toBe('Enemy 100% leaves 999s freq ? 99%');
    expect(targetRowText({ ...wide, shieldsUp: false }, 0.99)).toBe('Enemy 100% out 999s shields down');
    expect(targetRowText({ ...wide, shieldsUp: false, fleeSeconds: 99 }, 0.99)).toBe('Enemy 100% FLEE 99s shields down');
    for (const t of [targetRowText(wide, 0.99), targetRowText({ ...wide, shieldsUp: false }, 0.99)]) expect(textPx(t)).toBeLessThanOrEqual(CARD_INNER_W);
    expect(targetRowText({ ...enemy, layers: 4, layersMax: 4 })).toBe('Enemy 100% leaves 117s freq ? [####]');   // fits: kept whole
  });
  it('shot, rock and debris rows: freq ? and freq 2', () => {
    expect(targetRowText({ ...base, kind: 'shot', room: 'Corridor', eta: 5 })).toBe('Shot Corridor 5s freq ?');
    expect(targetRowText({ ...base, kind: 'rock', room: 'Corridor', eta: 5, frequency: 2 })).toBe('Rock Corridor 5s freq 2');
    expect(targetRowText({ ...base, eta: 5 }, 0.4)).toBe('Engine 5s freq ? 40%');
  });
  it('the skills line: only skills above 0, three-letter names, highest first; No skills yet at all zeros; as many as fit the block', () => {
    expect(skillsLine([0, 0, 0, 0, 0, 0])).toBe('No skills yet');
    expect(skillsLine([0, 0, 0, 0, 0, 4])).toBe('Rep 4');
    expect(skillsLine([0, 3, 0, 0, 0, 4])).toBe('Rep 4 Eng 3');
    expect(skillsLine([1, 1, 1, 1, 1, 1])).toBe('Nav 1 Eng 1 Wpn 1 Sci 1');
    expect(skillsLine([10, 10, 10, 10, 10, 10])).toBe('Nav 10 Eng 10 Wpn 10');
    for (const s of [[1, 1, 1, 1, 1, 1], [10, 10, 10, 10, 10, 10], [9, 9, 9, 9, 9, 9]]) expect(textPx(skillsLine(s))).toBeLessThanOrEqual(BLOCK_INNER_W);
  });
});
