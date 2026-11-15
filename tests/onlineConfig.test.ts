import { describe, expect, it } from 'vitest';
import { resolveOnlineConfig } from '../src/main/network/onlineConfig';

describe('development online configuration', () => {
  it.each(['http://localhost:8787', 'http://127.0.0.1:8787/', 'http://[::1]:8787'])('enables explicitly configured HTTP loopback %s', localServiceUrl => {
    expect(resolveOnlineConfig({packaged:false,localServiceUrl})).toEqual({enabled:true,baseUrl:localServiceUrl.replace(/\/$/,''),allowInsecureLocalhost:true});
  });
  it('keeps packaged mode disabled even with a configured origin', () => {
    expect(resolveOnlineConfig({packaged:true,localServiceUrl:'http://localhost:8787'})).toEqual({enabled:false});
  });
  it.each([undefined, '', 'garbage', 'https://localhost:8787', 'http://example.com', 'http://127.0.0.2:8787', 'http://localhost.example.com', 'http://user:secret@localhost:8787', 'http://localhost:8787/api', 'http://localhost:8787/?', 'http://localhost:8787/#', 'file:///localhost'])('disables invalid or non-loopback configuration %s', localServiceUrl => {
    expect(resolveOnlineConfig({packaged:false,localServiceUrl})).toEqual({enabled:false});
  });
});
