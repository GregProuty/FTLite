// The web build's plan (web build spec §5.1): exactly one https service origin (loopback only in a --test build), the
// baked PageOnlineConfig (packaged and test-free in production, deviation W-1), test-only flags, the out directory, and
// the paid-art check.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkPaidArt, resolveWebBuildPlan, webVersionInfo } from '../build/webBuild';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

const root = process.cwd(), HTTPS = 'https://ftlite-signalling-dev.example.workers.dev';
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('resolveWebBuildPlan', () => {
  it('bakes a packaged, test-free TURN config for production and writes .vercel/output', () => {
    const plan = resolveWebBuildPlan(root, [], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS });
    expect(plan).toEqual({ test: false, allowMissingPaid: false, outDir: resolve(root, '.vercel/output'),
      pageConfig: { serviceOrigin: HTTPS, iceMode: 'turn', allowInsecureLocalhost: false, packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false } });
  });
  it('refuses anything but exactly one https origin in production', () => {
    for (const bad of [undefined, '', 'http://127.0.0.1:8787', 'http://example.com', `${HTTPS}/`, `${HTTPS}/v2`, `${HTTPS},https://b.example.com`, ` ${HTTPS}`, 'https://user@example.com'])
      expect(() => resolveWebBuildPlan(root, [], { FTLITE_WEB_SERVICE_ORIGIN: bad })).toThrow(/exactly one https origin/);
  });
  it('builds a loopback --test config with its test fields, under out/', () => {
    const plan = resolveWebBuildPlan(root, ['--test', '--service-origin=http://127.0.0.1:8787', '--duel-test-seed=351', '--test-probe', '--allow-missing-paid'], {});
    expect(plan).toEqual({ test: true, allowMissingPaid: true, outDir: resolve(root, 'out/web-test'),
      pageConfig: { serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true, packaged: false, sectorOnlineTest: false, duelTestSeed: 351, testProbe: true } });
    expect(resolveWebBuildPlan(root, ['--test'], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS }).pageConfig.iceMode).toBe('turn');
    const tmp = join(tmpdir(), 'ftlite-web-plan-out');
    expect(resolveWebBuildPlan(root, ['--test', `--out=${tmp}`], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS }).outDir).toBe(resolve(tmp));
  });
  it('refuses test-only flags without --test, unknown flags, bad seeds and test output outside out/ or the temp directory', () => {
    for (const flag of ['--test-probe', '--duel-test-seed=1', '--allow-missing-paid', '--out=out/x', '--service-origin=http://127.0.0.1:1'])
      expect(() => resolveWebBuildPlan(root, [flag], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS })).toThrow(/needs --test/);
    expect(() => resolveWebBuildPlan(root, ['--prod'], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS })).toThrow(/unknown argument/);
    for (const seed of ['-1', 'x', '4294967296', '12345678901']) expect(() => resolveWebBuildPlan(root, ['--test', `--duel-test-seed=${seed}`], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS })).toThrow(/duel-test-seed/);
    for (const out of ['.vercel/output', 'src/x', '..']) expect(() => resolveWebBuildPlan(root, ['--test', `--out=${out}`], { FTLITE_WEB_SERVICE_ORIGIN: HTTPS })).toThrow(/under out\//);
  });
});

describe('checkPaidArt and webVersionInfo', () => {
  it('fails without public/assets/paid unless --allow-missing-paid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ftlite-paid-')); dirs.push(dir);
    expect(() => checkPaidArt(dir, { allowMissingPaid: false })).toThrow(/public\/assets\/paid is missing or empty/);
    mkdirSync(join(dir, 'public/assets/paid'), { recursive: true });
    expect(() => checkPaidArt(dir, { allowMissingPaid: false })).toThrow(/missing or empty/);
    expect(checkPaidArt(dir, { allowMissingPaid: true })).toBe(false);
    writeFileSync(join(dir, 'public/assets/paid/x.png'), 'x');
    expect(checkPaidArt(dir, { allowMissingPaid: false })).toBe(true);
  });
  it('describes the build as { build, sim, digest }', () => {
    const v = webVersionInfo(root);
    expect(v.sim).toBe(SIM_VERSION); expect(v.build.sim).toBe(SIM_VERSION); expect(v.digest).toMatch(/^[0-9a-f]{64}$/); expect(typeof v.build.rev).toBe('string');
  });
});
