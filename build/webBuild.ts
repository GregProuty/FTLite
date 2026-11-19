// The web build's plan (web build spec §5.1, deviation W-1): which service origin is baked in, whether this is a local
// --test build, where the Build Output goes, and the checks that refuse a wrong build before Vite runs.
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { resolveOnlineConfig, validatePageOnlineConfig, type PageOnlineConfig } from '../src/shared/onlineConfig';
import { computeBuildInfo, readSimVersion } from './buildInfo';
import { computeContentDigest } from './contentDigest';

export const PRODUCTION_OUT = '.vercel/output', TEST_OUT = 'out/web-test';
export interface WebBuildPlan { test: boolean; allowMissingPaid: boolean; outDir: string; pageConfig: PageOnlineConfig }
export interface WebVersion { build: { version: string; rev: string; sim: number }; sim: number; digest: string }
const KNOWN = new Set(['test', 'allow-missing-paid', 'out', 'service-origin', 'duel-test-seed', 'test-probe']);
const TEST_ONLY = ['allow-missing-paid', 'out', 'service-origin', 'duel-test-seed', 'test-probe'];

export function resolveWebBuildPlan(root: string, argv: readonly string[], env: Readonly<Record<string, string | undefined>>): WebBuildPlan {
  const flags = new Map<string, string | true>();
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(arg);
    if (!m || !KNOWN.has(m[1]!)) throw Error(`build:web: unknown argument ${JSON.stringify(arg)}`);
    flags.set(m[1]!, m[2] ?? true);
  }
  const test = flags.has('test');
  for (const name of TEST_ONLY) if (flags.has(name) && !test) throw Error(`build:web: --${name} needs --test (a production build refuses test-only settings)`);
  const text = (name: string): string | undefined => { const v = flags.get(name); return typeof v === 'string' ? v : undefined; };
  const origin = text('service-origin') ?? env.FTLITE_WEB_SERVICE_ORIGIN ?? '';
  const loopback = test && /^http:\/\//i.test(origin);
  const resolved = resolveOnlineConfig(loopback ? { packaged: false, localServiceUrl: origin } : { packaged: false, serviceUrl: origin });
  if (!resolved.enabled || resolved.baseUrl !== origin)
    throw Error(`build:web: FTLITE_WEB_SERVICE_ORIGIN must be exactly one https origin${test ? ' (or a loopback http origin in a --test build)' : ''}; got ${JSON.stringify(origin)}`);
  const seedText = text('duel-test-seed');
  if (seedText !== undefined && !(/^\d{1,10}$/.test(seedText) && Number(seedText) <= 0xffffffff)) throw Error(`build:web: --duel-test-seed must be 0..4294967295; got ${JSON.stringify(seedText)}`);
  const pageConfig: PageOnlineConfig = test
    ? { serviceOrigin: resolved.baseUrl, iceMode: resolved.iceMode, allowInsecureLocalhost: resolved.allowInsecureLocalhost, packaged: false,
        sectorOnlineTest: false, duelTestSeed: seedText === undefined ? null : Number(seedText), testProbe: flags.has('test-probe') }
    : { serviceOrigin: resolved.baseUrl, iceMode: 'turn', allowInsecureLocalhost: false, packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false };
  if (!validatePageOnlineConfig(pageConfig)) throw Error('build:web: the page online config is invalid');
  const outDir = resolve(root, test ? text('out') ?? TEST_OUT : PRODUCTION_OUT);
  if (test && !outDir.startsWith(resolve(root, 'out') + sep) && !outDir.startsWith(resolve(tmpdir()) + sep))
    throw Error(`build:web: a --test build writes under out/ or the temp directory only; got ${outDir}`);
  return { test, allowMissingPaid: flags.has('allow-missing-paid'), outDir, pageConfig };
}

/** Spec §5.1: the gitignored paid art must ship, so a deploy cannot go out without it by mistake. */
export function checkPaidArt(root: string, plan: Pick<WebBuildPlan, 'allowMissingPaid'>): boolean {
  const dir = join(root, 'public/assets/paid'), present = existsSync(dir) && readdirSync(dir).length > 0;
  if (!present && !plan.allowMissingPaid)
    throw Error('build:web: public/assets/paid is missing or empty; the paid art ships with the site (build from the main checkout, or use --test --allow-missing-paid for a local test build)');
  return present;
}

/** Spec §5.4: version.json. */
export function webVersionInfo(root: string): WebVersion {
  return { build: computeBuildInfo(root), sim: readSimVersion(root), digest: computeContentDigest(root) };
}
