export type OnlineConfig = { enabled: false } | { enabled: true; baseUrl: string; allowInsecureLocalhost: boolean; iceMode: 'loopback' | 'turn' };

/** Explicit nonsecret main configuration only; never reads environment files. */
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
