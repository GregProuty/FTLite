// Net-4a §3.2: every publication carries each player's held input as the authority latched it, the codec checks its
// length against the crew, and both modes' schema versions moved together (duel 3, sector 2).
import { describe, expect, it } from 'vitest';
import { duelPublicationSchema } from '../src/renderer/src/net/codec';
import { duelMode } from '../src/network/modes/duel';
import { sectorMode } from '../src/network/modes/sector';
import { DUEL_SCHEMA_VERSION, duelCompatibility } from '../src/network/online/onlineDuel';
import { sectorCompatibility } from '../src/network/online/onlineSector';
import { onlineDuel } from './helpers/onlineDuel';

describe('the publication carries held input (Net-4a §3.2)', () => {
  it('each seat\'s latched held input is in the next publication, optional fields included; the partner\'s stays neutral', () => {
    const w = onlineDuel(3), a = w.connect(0), b = w.connect(1);
    w.tick(2);
    a.client.held(0, { moveX: 1, moveY: 0, interactHeld: false, throttleHeld: 1, rcsX: -1 });
    w.tick(6);   // latched on the next tick, then out on the next cadence tick (every third)
    const p = b.client.publication()!;
    expect(p.held).toHaveLength(2);
    expect(p.held[0]).toEqual({ moveX: 1, moveY: 0, interactHeld: false, throttleHeld: 1, rcsX: -1 });
    expect(p.held[1]).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
  });
  it('a pause clears held input before the paused publication', () => {
    const w = onlineDuel(3), a = w.connect(0);
    w.connect(1);
    w.tick(2);
    a.client.held(0, { moveX: 1, moveY: 0, interactHeld: false });
    w.tick(6);
    a.client.command(0, { kind: 'setPaused', paused: true });
    w.tick(6);
    const p = a.client.publication()!;
    expect(p.phase).toBe('paused');
    expect(p.held[0]).toEqual({ moveX: 0, moveY: 0, interactHeld: false });
  });
  it('the codec refuses a held array that is not one per player', () => {
    const w = onlineDuel(3), a = w.connect(0);
    w.tick(3);
    const good = structuredClone(a.client.publication()!) as unknown as { held: unknown[] };
    expect(() => duelPublicationSchema.parse(good)).not.toThrow();
    expect(() => duelPublicationSchema.parse({ ...good, held: good.held.slice(0, 1) })).toThrow();
    expect(() => duelPublicationSchema.parse({ ...good, held: undefined })).toThrow();
  });
  it('schema versions moved in pairs: duel 3, sector 2', () => {
    expect([duelMode.schemaVersion, DUEL_SCHEMA_VERSION, duelCompatibility().schemaVersion]).toEqual([3, 3, 3]);
    expect([sectorMode.schemaVersion, sectorCompatibility(2).schemaVersion]).toEqual([2, 2]);
  });
});
