import { describe, expect, it } from 'vitest';
import { DISABLED_PAGE_ONLINE_CONFIG, resolveOnlineConfig, sessionConfigOf, toPageOnlineConfig, validatePageOnlineConfig } from '../src/shared/onlineConfig';

describe('development online configuration', () => {
  it.each(['http://localhost:8787', 'http://127.0.0.1:8787/', 'http://[::1]:8787'])('enables explicitly configured HTTP loopback %s', localServiceUrl => {
    expect(resolveOnlineConfig({packaged:false,localServiceUrl})).toEqual({enabled:true,baseUrl:localServiceUrl.replace(/\/$/,''),allowInsecureLocalhost:true,iceMode:'loopback'});
  });
  it('keeps packaged mode disabled even with a configured origin', () => {
    expect(resolveOnlineConfig({packaged:true,localServiceUrl:'http://localhost:8787'})).toEqual({enabled:false});
  });
  it.each([undefined, '', 'garbage', 'https://localhost:8787', 'http://example.com', 'http://127.0.0.2:8787', 'http://localhost.example.com', 'http://user:secret@localhost:8787', 'http://localhost:8787/api', 'http://localhost:8787/?', 'http://localhost:8787/#', 'file:///localhost'])('disables invalid or non-loopback configuration %s', localServiceUrl => {
    expect(resolveOnlineConfig({packaged:false,localServiceUrl})).toEqual({enabled:false});
  });
});

it('requires explicit HTTPS configuration and preserves the production variant', () => {
  expect(resolveOnlineConfig({ packaged: false })).toEqual({ enabled: false });
  expect(resolveOnlineConfig({ packaged: true })).toEqual({ enabled: false });
  for (const options of [{ packaged: false, serviceUrl: 'https://service.example/' }, { packaged: true, packagedServiceOrigin: 'https://service.example/' }])
    expect(resolveOnlineConfig(options)).toEqual({ enabled: true, baseUrl: 'https://service.example', allowInsecureLocalhost: false, iceMode: 'turn' });
});
it.each(['http://service.example', 'https://u:p@service.example', 'https://service.example/path', 'https://service.example/api/..', 'https://service.example\\', 'https://service.example/?', 'https://service.example/#'])('rejects unsafe HTTPS source %s', serviceUrl => {
  expect(resolveOnlineConfig({ packaged: false, serviceUrl })).toEqual({ enabled: false });
});
it('does not infer configuration from ambient development environment variables', () => {
  const previous = process.env.FTLITE_SERVICE_URL;
  try { process.env.FTLITE_SERVICE_URL = 'https://service.example'; expect(resolveOnlineConfig({ packaged: false })).toEqual({ enabled: false }); }
  finally { if (previous === undefined) delete process.env.FTLITE_SERVICE_URL; else process.env.FTLITE_SERVICE_URL = previous; }
});
it('rejects conflicting sources and development overrides of packaged configuration', () => {
  expect(resolveOnlineConfig({ packaged: false, serviceUrl: 'https://service.example', localServiceUrl: 'http://localhost:8787' })).toEqual({ enabled: false });
  expect(resolveOnlineConfig({ packaged: true, serviceUrl: 'https://service.example' })).toEqual({ enabled: false });
  expect(resolveOnlineConfig({ packaged: true, packagedServiceOrigin: 'https://service.example', localServiceUrl: 'http://localhost:8787' })).toEqual({ enabled: false });
});

describe('page online config (web build spec §3.3)', () => {
  const loopback = resolveOnlineConfig({ packaged: false, localServiceUrl: 'http://127.0.0.1:8787' });
  it('carries the resolved origin and honours test-only fields only when unpackaged', () => {
    expect(toPageOnlineConfig(loopback, { packaged: false, sectorOnlineTest: '1', duelTestSeed: '42', testProbe: '1' })).toEqual({
      serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true, packaged: false, sectorOnlineTest: true, duelTestSeed: 42, testProbe: true });
    const turn = resolveOnlineConfig({ packaged: true, packagedServiceOrigin: 'https://service.example' });
    expect(toPageOnlineConfig(turn, { packaged: true, sectorOnlineTest: '1', duelTestSeed: '42', testProbe: '1' })).toEqual({
      serviceOrigin: 'https://service.example', iceMode: 'turn', allowInsecureLocalhost: false, packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false });
  });
  it('parses the duel test seed exactly as main did and disables a disabled config', () => {
    for (const seed of ['', 'x', '-1', '4294967296', '12345678901']) expect(toPageOnlineConfig(loopback, { packaged: false, duelTestSeed: seed }).duelTestSeed).toBeNull();
    expect(toPageOnlineConfig(loopback, { packaged: false, duelTestSeed: '4294967295' }).duelTestSeed).toBe(4294967295);
    expect(toPageOnlineConfig({ enabled: false }, { packaged: false })).toEqual(DISABLED_PAGE_ONLINE_CONFIG);
  });
  it('validates by the same origin rules and maps back to the session config', () => {
    const page = toPageOnlineConfig(loopback, { packaged: false });
    expect(validatePageOnlineConfig(page)).toBe(true); expect(sessionConfigOf(page)).toEqual(loopback);
    expect(validatePageOnlineConfig(DISABLED_PAGE_ONLINE_CONFIG)).toBe(true); expect(sessionConfigOf(DISABLED_PAGE_ONLINE_CONFIG)).toEqual({ enabled: false });
    for (const bad of [{ ...page, serviceOrigin: 'http://evil.example' }, { ...page, iceMode: 'turn' }, { ...page, allowInsecureLocalhost: false },
      { ...page, packaged: true, sectorOnlineTest: true }, { ...page, packaged: true, testProbe: true }, { ...page, duelTestSeed: 1.5 }, { ...page, extra: 1 }, null, 'x'])
      expect(validatePageOnlineConfig(bad)).toBe(false);
  });
});
