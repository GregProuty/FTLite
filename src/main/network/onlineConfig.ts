export type OnlineConfig = { enabled: false } | { enabled: true; baseUrl: string; allowInsecureLocalhost: true };

/** Development slice only. Mirrors the service client's origin policy with HTTP loopback required. */
export function resolveOnlineConfig(options: { packaged: boolean; localServiceUrl?: string }): OnlineConfig {
  if (options.packaged || !options.localServiceUrl) return { enabled: false };
  try {
    const url = new URL(options.localServiceUrl);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || options.localServiceUrl.includes('?') || options.localServiceUrl.includes('#')) return { enabled: false };
    return { enabled: true, baseUrl: url.origin, allowInsecureLocalhost: true };
  } catch { return { enabled: false }; }
}
