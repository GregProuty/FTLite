// The update check (web build spec §5.4): version.json at start and every 5 minutes on the menu or in a lobby; a
// different build calls onUpdate once and stops; failures and malformed answers are ignored.
import { describe, expect, it, vi } from 'vitest';
import { parseVersion, versionDiffers, versionPollActive, VERSION_POLL_MS, watchVersion, type BuildVersion } from '../src/renderer/src/app/web/versionWatch';
import { INITIAL_MENU } from '../src/renderer/src/ui/menuState';
import { idle } from './helpers/uiStore';

const local: BuildVersion = { build: { version: '0.0.1', rev: 'abc1234', sim: 53 }, sim: 53, digest: 'a'.repeat(64) };
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function harness(answers: unknown[], active = () => true) {
  let tick: (() => void) | undefined; const clearInterval = vi.fn(), onUpdate = vi.fn();
  const fetch = vi.fn(async () => { const a = answers.shift(); if (a instanceof Error) throw a; return { ok: a !== 'not-ok', json: async () => a }; });
  const stop = watchVersion({ fetch, local, active, onUpdate, setInterval: (cb, ms) => { expect(ms).toBe(VERSION_POLL_MS); tick = cb; return 7; }, clearInterval });
  return { fetch, onUpdate, clearInterval, stop, tick: async () => { tick!(); await flush(); } };
}
describe('watchVersion', () => {
  it('fetches at start with no-store, then every 5 minutes while active', async () => {
    let on = true; const h = harness([local, local, local], () => on); await flush();
    expect(h.fetch).toHaveBeenCalledWith('./version.json', { cache: 'no-store', credentials: 'same-origin' });
    await h.tick(); expect(h.fetch).toHaveBeenCalledTimes(2);
    on = false; await h.tick(); expect(h.fetch).toHaveBeenCalledTimes(2);   // in a match: no poll
    on = true; await h.tick(); expect(h.fetch).toHaveBeenCalledTimes(3); expect(h.onUpdate).not.toHaveBeenCalled();
  });
  it('calls onUpdate once for another build and stops polling', async () => {
    const h = harness([local, { ...local, digest: 'b'.repeat(64) }, local]); await flush(); await h.tick();
    expect(h.onUpdate).toHaveBeenCalledOnce(); expect(h.clearInterval).toHaveBeenCalledWith(7);
  });
  it('ignores errors, non-OK answers and malformed JSON', async () => {
    const h = harness([Error('offline'), 'not-ok', { build: 'x' }, '<html>']); await flush(); await h.tick(); await h.tick(); await h.tick();
    expect(h.onUpdate).not.toHaveBeenCalled(); h.stop(); expect(h.clearInterval).toHaveBeenCalledOnce();
  });
});
describe('parseVersion, versionDiffers and versionPollActive', () => {
  it('accepts exactly { build, sim, digest } and compares every field', () => {
    expect(parseVersion(local)).toEqual(local);
    for (const bad of [null, {}, { ...local, extra: 1 }, { ...local, digest: 'x' }, { ...local, build: { version: '1', rev: 'r' } }, { ...local, sim: '53' }]) expect(parseVersion(bad)).toBeNull();
    expect(versionDiffers(local, local)).toBe(false);
    for (const other of [{ ...local, sim: 54 }, { ...local, digest: 'c'.repeat(64) }, { ...local, build: { ...local.build, rev: 'def5678' } }, { ...local, build: { ...local.build, version: '0.0.2' } }])
      expect(versionDiffers(other, local)).toBe(true);
  });
  it('is active on the menu and in a lobby, never in a match', () => {
    const lobby = { ...idle, phase: 'lobby' as const }, running = { ...idle, phase: 'running' as const };
    const at = (menu: Partial<typeof INITIAL_MENU>, status: typeof idle | null = null) => ({ menu: { ...INITIAL_MENU, ...menu }, online: { available: true, status, receivedAt: 0 } });
    expect(versionPollActive(at({}))).toBe(true);
    expect(versionPollActive(at({ page: 'session', hadView: false }, lobby))).toBe(true);
    expect(versionPollActive(at({ page: 'session', hadView: true }, lobby))).toBe(true);
    expect(versionPollActive(at({ page: 'session', hadView: true }, running))).toBe(false);
    expect(versionPollActive(at({ page: 'single' }))).toBe(false);
  });
});
