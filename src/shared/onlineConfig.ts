import { rtcKeys, rtcRecord } from './rtcSession';

export type OnlineConfig = { enabled: false } | { enabled: true; baseUrl: string; allowInsecureLocalhost: boolean; iceMode: 'loopback' | 'turn' };

/** Explicit nonsecret configuration only; never reads environment files. */
export function resolveOnlineConfig(options: { packaged: boolean; localServiceUrl?: string; serviceUrl?: string; packagedServiceOrigin?: string }): OnlineConfig {
  const sources = [options.localServiceUrl, options.serviceUrl, options.packagedServiceOrigin].filter(value => value !== undefined && value !== '');
  if (sources.length !== 1 || (options.packaged ? !options.packagedServiceOrigin : !!options.packagedServiceOrigin)) return { enabled: false };
  const source = sources[0]!, loopback = !!options.localServiceUrl;
  // Check raw origin syntax before URL normalization can erase a path or backslash.
  if (!/^https?:\/\/[^/\\\s@?#]+\/?$/i.test(source)) return { enabled: false };
  try {
    const url = new URL(source);
    if ((loopback ? url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) : url.protocol !== 'https:')
      || url.username || url.password || url.pathname !== '/' || source.includes('?') || source.includes('#')) return { enabled: false };
    return { enabled: true, baseUrl: url.origin, allowInsecureLocalhost: loopback, iceMode: loopback ? 'loopback' : 'turn' };
  } catch { return { enabled: false }; }
}

/** The page's online configuration (web build spec §3.3). `serviceOrigin: null` is online disabled. The last three
 *  fields are test-only and are honoured only by an unpackaged build; `testProbe` is deviation D-1 of the Web-i plan. */
export interface PageOnlineConfig {
  serviceOrigin: string | null; iceMode: 'loopback' | 'turn'; allowInsecureLocalhost: boolean; packaged: boolean;
  sectorOnlineTest: boolean; duelTestSeed: number | null; testProbe: boolean;
}
export const DISABLED_PAGE_ONLINE_CONFIG: PageOnlineConfig = Object.freeze({ serviceOrigin: null, iceMode: 'turn', allowInsecureLocalhost: false,
  packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false });
const KEYS = ['serviceOrigin', 'iceMode', 'allowInsecureLocalhost', 'packaged', 'sectorOnlineTest', 'duelTestSeed', 'testProbe'];
/** Electron main: the resolved service plus the unpackaged-only test entries, from their environment strings. */
export function toPageOnlineConfig(config: OnlineConfig, env: { packaged: boolean; sectorOnlineTest?: string; duelTestSeed?: string; testProbe?: string }): PageOnlineConfig {
  if (!config.enabled) return { ...DISABLED_PAGE_ONLINE_CONFIG };
  const seed = env.packaged ? undefined : env.duelTestSeed;
  return { serviceOrigin: config.baseUrl, iceMode: config.iceMode, allowInsecureLocalhost: config.allowInsecureLocalhost, packaged: env.packaged,
    sectorOnlineTest: !env.packaged && env.sectorOnlineTest === '1',
    duelTestSeed: seed !== undefined && /^\d{1,10}$/.test(seed) && Number(seed) <= 0xffffffff ? Number(seed) : null,
    testProbe: !env.packaged && env.testProbe === '1' };
}
export function sessionConfigOf(page: PageOnlineConfig): OnlineConfig {
  if (page.serviceOrigin === null) return { enabled: false };
  return resolveOnlineConfig(page.iceMode === 'loopback' ? { packaged: false, localServiceUrl: page.serviceOrigin } : { packaged: false, serviceUrl: page.serviceOrigin });
}
export function validatePageOnlineConfig(value: unknown): value is PageOnlineConfig {
  if (!rtcRecord(value) || !rtcKeys(value, KEYS)) return false;
  const v = value as unknown as PageOnlineConfig;
  if ((v.iceMode !== 'loopback' && v.iceMode !== 'turn') || typeof v.allowInsecureLocalhost !== 'boolean' || typeof v.packaged !== 'boolean'
    || typeof v.sectorOnlineTest !== 'boolean' || typeof v.testProbe !== 'boolean'
    || !(v.duelTestSeed === null || Number.isSafeInteger(v.duelTestSeed) && v.duelTestSeed >= 0 && v.duelTestSeed <= 0xffffffff)) return false;
  if (v.packaged && (v.sectorOnlineTest || v.testProbe || v.duelTestSeed !== null)) return false;
  if (v.serviceOrigin === null) return true;
  if (typeof v.serviceOrigin !== 'string') return false;
  const resolved = sessionConfigOf(v);
  return resolved.enabled && resolved.baseUrl === v.serviceOrigin && resolved.iceMode === v.iceMode && resolved.allowInsecureLocalhost === v.allowInsecureLocalhost;
}
