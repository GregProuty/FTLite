// The browser network gate's pure parts (web build spec §8): argument parsing, the newest publication, the common
// publication the authority and the guest agree on, and the Electron driver's key names.
import { describe, expect, it } from 'vitest';
import { commonPublication, latestPublication, parseWebNetArgs, PAIRINGS } from '../scripts/web/net/scenario';
import { electronKey } from '../scripts/web/net/players';

const view = (pubs: object[]) => ({ status: {} as never, text: '', observations: [{ publications: pubs }] });
describe('the browser network gate', () => {
  it('parses its arguments', () => {
    expect(parseWebNetArgs([])).toEqual({ pairings: PAIRINGS, inject: null, reportPath: 'out/web-ii-net/web-net.json' });
    expect(parseWebNetArgs(['--pairing=firefox-chromium', '--inject=origin-refused', '--report-path=out/x.json'])).toEqual({ pairings: ['firefox-chromium'], inject: 'origin-refused', reportPath: 'out/x.json' });
    expect(() => parseWebNetArgs(['--pairing=safari-chromium'])).toThrow(/unknown pairing/); expect(() => parseWebNetArgs(['--inject=other'])).toThrow(/unknown injection/);
    expect(PAIRINGS).toEqual(['chromium-firefox', 'firefox-chromium', 'chromium-electron']);
  });
  it('takes the highest sequence as the newest publication', () => {
    expect(latestPublication(view([{ sequence: 3 }, { sequence: 9 }, { sequence: 5 }]))).toEqual({ sequence: 9 });
    expect(latestPublication({ status: {} as never, text: '', observations: [] })).toBeUndefined();
  });
  it('finds the newest publication both sides hold with the same run, sequence, tick and hash', () => {
    const host = view([{ runId: 'r', sequence: 1, tick: 3, hash: 'a' }, { runId: 'r', sequence: 2, tick: 6, hash: 'b' }]);
    expect(commonPublication(host, view([{ runId: 'r', sequence: 1, tick: 3, hash: 'a' }, { runId: 'r', sequence: 2, tick: 6, hash: 'x' }]))).toEqual({ runId: 'r', sequence: 1, tick: 3, hash: 'a' });
    expect(commonPublication(host, view([{ runId: 'q', sequence: 2, tick: 6, hash: 'b' }]))).toBeUndefined();
  });
  it('names keys the Electron driver way', () => {
    expect((['KeyD', 'KeyW', 'KeyA', 'KeyE', 'Space', 'Escape'] as const).map(electronKey)).toEqual(['D', 'W', 'A', 'E', 'Space', 'Escape']);
  });
});
