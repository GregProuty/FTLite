import { describe, it, expect } from 'vitest';
import { createDeviceManager, type SourceSample } from '../src/renderer/src/input/deviceManager';

const s = (key: string, o: Partial<SourceSample> = {}): SourceSample => ({ key, moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, ...o });

describe('DeviceManager', () => {
  it('joins on an interact press in the lobby, in order', () => {
    const dm = createDeviceManager(4);
    let r = dm.update([s('kb:0'), s('gp:0')], true);
    expect(r.joinedCount).toBe(0);
    r = dm.update([s('kb:0'), s('gp:0', { interact: true })], true);
    expect(r.slots[0]).toEqual({ status: 'active', key: 'gp:0' });
    expect(r.frames[0]!.interactPresses).toBe(1);   // the joining press is also delivered
    r = dm.update([s('kb:0', { interact: true }), s('gp:0', { interact: true })], true);
    expect(r.slots[1]).toEqual({ status: 'active', key: 'kb:0' });
    expect(r.frames[0]!.interactPresses).toBe(0);   // held, not a new edge
    expect(r.joinedCount).toBe(2);
  });
  it('does not join during a run', () => {
    const dm = createDeviceManager(4);
    const r = dm.update([s('gp:0', { interact: true })], false);
    expect(r.joinedCount).toBe(0);
  });
  it('routes held values and press edges to the right player', () => {
    const dm = createDeviceManager(2);
    dm.update([s('a', { interact: true })], true);
    dm.update([s('a'), s('b', { interact: true })], true);
    const r = dm.update([s('a', { moveX: 0.5 }), s('b', { confirm: true, cancel: true })], false);
    expect(r.frames[0]!.moveX).toBe(0.5);
    expect(r.frames[1]!.confirmPresses).toBe(1); expect(r.frames[1]!.cancelPresses).toBe(1);
  });
  it('a disconnected device leaves its slot in reconnect with a neutral frame, and any press on a free device reclaims it', () => {
    const dm = createDeviceManager(2);
    dm.update([s('a', { interact: true })], true);
    dm.update([s('a'), s('b', { interact: true })], true);
    let r = dm.update([s('b', { moveX: 1 })], false);         // 'a' vanished
    expect(r.slots[0]).toEqual({ status: 'reconnect', key: null });
    expect(r.frames[0]!.moveX).toBe(0);
    r = dm.update([s('b'), s('c', { confirm: true })], false); // new pad reclaims slot 0 even mid-run
    expect(r.slots[0]).toEqual({ status: 'active', key: 'c' });
    expect(r.frames[0]!.confirmPresses).toBe(1);
  });
  it('a device that reconnects while holding a button emits a fresh edge', () => {
    const dm = createDeviceManager(1);
    dm.update([s('a', { interact: true })], true);
    dm.update([], false);
    const r = dm.update([s('a', { interact: true })], false);
    expect(r.slots[0]!.status).toBe('active');
    expect(r.frames[0]!.interactPresses).toBe(1);
  });
  it('uses counted presses from a device that reports them, without faking held state', () => {
    const dm = createDeviceManager(1);
    dm.update([s('kb:0', { presses: { interact: 1, confirm: 0, cancel: 0 } })], true);   // tap between polls joins
    let r = dm.update([s('kb:0', { interact: true, presses: { interact: 2, confirm: 0, cancel: 0 } })], false);
    expect(r.frames[0]!.interactPresses).toBe(2);   // release-and-repress between polls is not lost
    expect(r.frames[0]!.interactHeld).toBe(true);
    r = dm.update([s('kb:0', { presses: { interact: 1, confirm: 0, cancel: 0 } })], false);
    expect(r.frames[0]!.interactPresses).toBe(1); expect(r.frames[0]!.interactHeld).toBe(false);   // a tap: pressed, not held
  });
});
