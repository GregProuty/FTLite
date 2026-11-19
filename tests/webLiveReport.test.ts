// Web-iii live smoke report (web build spec §8 "The live check"): a PASS needs every header check, the live
// version.json, relay on both sides for the full 60 s (or a round that ended first) and no page errors; a FAIL names its
// failure; no report may hold the passcode or the cookie.
import { describe, expect, it } from 'vitest';
import { validateLiveReport, type LiveReport } from '../scripts/web/live/report';

const PASSCODE = 'correct horse battery staple';
function passing(): LiveReport {
  return { version: 1, url: 'https://ftlite-test.vercel.app', startedAt: '2026-11-18T20:00:00.000Z', elapsedMs: 95000,
    headers: { checks: [{ label: 'without the cookie: /', method: 'GET', path: '/', cookie: false, status: 401, cacheControl: 'no-store', problem: null }],
      version: { build: { version: '0.1.0', rev: 'abc1234', sim: 54 }, sim: 54, digest: 'a'.repeat(64) }, versionCompared: true, problems: [] },
    service: { origin: 'https://sig.example', status: 204, allowOrigin: 'https://ftlite-test.vercel.app', problem: null },
    duel: { hostBrowser: 'chromium', guestBrowser: 'firefox', playedMs: 60400, endedEarly: false, phases: { host: 'running', guest: 'running' },
      samples: { host: [], guest: [] }, relay: { host: null, guest: null }, pageErrors: [], problems: [] },
    failure: null, pass: true };
}
describe('validateLiveReport', () => {
  it('accepts a full pass and a pass whose round ended early', () => {
    expect(validateLiveReport(passing(), [PASSCODE])).toEqual([]);
    const ended = passing(); ended.duel!.playedMs = 41000; ended.duel!.endedEarly = true; ended.duel!.phases = { host: 'ended', guest: 'ended' };
    expect(validateLiveReport(ended, [PASSCODE])).toEqual([]);
  });
  it('refuses an early end that is one-sided or before the floor', () => {
    const oneSided = passing(); oneSided.duel!.playedMs = 41000; oneSided.duel!.endedEarly = true; oneSided.duel!.phases = { host: 'ended', guest: 'reconnecting' };
    expect(validateLiveReport(oneSided, [])).toContainEqual(expect.stringMatching(/both sides ended/));
    const quick = passing(); quick.duel!.playedMs = 12000; quick.duel!.endedEarly = true; quick.duel!.phases = { host: 'ended', guest: 'ended' };
    expect(validateLiveReport(quick, [])).toContainEqual(expect.stringMatching(/under 20000 ms/));
  });
  it('refuses a pass with a header problem, no version, a short duel, a relay finding or a failure', () => {
    const header = passing(); header.headers!.checks[0]!.problem = 'answered 200 without the cookie';
    expect(validateLiveReport(header, [])).toContainEqual(expect.stringMatching(/every header check/));
    const noVersion = passing(); noVersion.headers!.version = null;
    expect(validateLiveReport(noVersion, [])).toContainEqual(expect.stringMatching(/version\.json/));
    const short = passing(); short.duel!.playedMs = 30000;
    expect(validateLiveReport(short, [])).toContainEqual(expect.stringMatching(/under 60000 ms/));
    const relay = passing(); relay.duel!.relay.guest = 'the selected candidate pair is local host, not relay';
    expect(validateLiveReport(relay, [])).toContainEqual(expect.stringMatching(/relay on both sides/));
    const failed = passing(); failed.failure = 'x';
    expect(validateLiveReport(failed, [])).toContainEqual(expect.stringMatching(/has a failure/));
    const noDuel = passing(); noDuel.duel = null;
    expect(validateLiveReport(noDuel, [])).toContainEqual(expect.stringMatching(/needs the duel/));
  });
  it('needs a failing report to name its failure and refuses any report holding a secret', () => {
    const fail = passing(); fail.pass = false;
    expect(validateLiveReport(fail, [])).toContainEqual(expect.stringMatching(/name its failure/));
    fail.failure = `header checks: code ${encodeURIComponent(PASSCODE)} leaked`;
    expect(validateLiveReport(fail, [PASSCODE])).toEqual(['the report holds a secret']);
  });
});
