import { describe, it, expect } from 'vitest';
import { installFeel } from '../src/renderer/src/app/feelBoot';
import type { FeelSetting } from '../src/renderer/src/render/feel';

const target = () => { let s: FeelSetting = 'full'; return { feel: () => s, setFeel: (v: FeelSetting) => { s = v; } }; };
const keys = () => { const cbs: ((e: { code: string }) => void)[] = []; return { cbs, addEventListener: (_t: 'keydown', cb: (e: { code: string }) => void) => { cbs.push(cb); }, press: (code: string) => { for (const cb of cbs) cb({ code }); } }; };
const store = (v: string | null) => { const m = new Map<string, string>(); if (v !== null) m.set('ftlite-feel', v); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => { m.set(k, x); } }; };

describe('the feel setting at boot (Art-i spec section 7)', () => {
  it('reads the stored setting once; a denied storage gives full', () => {
    const t = target(), s = store('reduced');
    installFeel(t, { storage: () => s, keys: keys(), dev: false });
    expect(t.feel()).toBe('reduced');
    const u = target(); u.setFeel('off');
    installFeel(u, { storage: () => { throw new Error('SecurityError'); }, keys: keys(), dev: false });
    expect(u.feel()).toBe('full');
  });
  it('F9 cycles and saves it in dev builds only', () => {
    const t = target(), s = store(null), k = keys(), log: string[] = [];
    installFeel(t, { storage: () => s, keys: k, dev: true, log: (m) => log.push(m) });
    k.press('F8'); expect(t.feel()).toBe('full');
    k.press('F9'); expect(t.feel()).toBe('reduced'); expect(s.m.get('ftlite-feel')).toBe('reduced');
    k.press('F9'); k.press('F9'); expect(t.feel()).toBe('full');
    expect(log).toEqual(['feel: reduced', 'feel: off', 'feel: full']);
    const p = target(), pk = keys();
    installFeel(p, { storage: () => store(null), keys: pk, dev: false });
    expect(pk.cbs).toHaveLength(0);
  });
});
