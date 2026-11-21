import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUNTER_FRAME } from '../src/renderer/src/render/duel/hunterArt';

describe('the Hunter art frame', () => {
  it('equals tools/ship-render/hunter.json', () => {
    expect(HUNTER_FRAME).toEqual(JSON.parse(readFileSync('tools/ship-render/hunter.json', 'utf8')).frame);
  });
});
