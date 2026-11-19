// `npm run test:web-live` (web build spec §8 "The live check", §9 Web-iii): run by the owner after a deploy, against
// the live site. First the passcode and cache headers without and with the cookie (a failure says to roll back and
// skips the duel), then the optional service preflight, then a Chromium host and a Firefox guest forced through TURN
// host, join by code, play 60 s and leave. Writes a JSON report and one PASS/FAIL line; exits 1 on failure. The
// passcode (FTLITE_LIVE_PASSCODE) and the minted cookie are never printed or written.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runLiveDuel } from './live/duel';
import { checkServiceOrigin, clip, compareDeployedVersion, firstPaidPath, parseLiveArgs, redact, runHeaderChecks, type FetchLike, type LiveArgs } from './live/headers';
import { validateLiveReport, type LiveReport } from './live/report';

/** Redact, then cut (review R1-F2): the error text never carries a secret fragment. */
const message = (error: unknown, secrets: readonly string[]): string => clip(String((error as Error)?.message ?? error), secrets, 700);
/** Plan L-8: the first deploy has nothing to roll back to, so it is deleted; later deploys roll back. */
const TAKE_DOWN = 'Take the deploy down now: on the first deploy delete it (npx vercel rm <deployment URL printed by deploy:web> --yes, or Dashboard -> Deployments -> Delete); '
  + 'on a later deploy run npx vercel rollback. Fix it before redeploying.';
const liveFetch: FetchLike = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) });

async function main(): Promise<void> {
  const began = performance.now(), startedAt = new Date().toISOString();
  let args: LiveArgs;
  try { args = parseLiveArgs(process.argv.slice(2), process.env); }
  catch (error) { console.error(`LIVE SMOKE FAIL: ${message(error, [process.env.FTLITE_LIVE_PASSCODE ?? ''])}`); process.exitCode = 1; return; }
  // HeaderResult.secrets carries only the cookie variants, so the passcode goes in first.
  const secrets: string[] = [args.passcode];
  const report: LiveReport = { version: 1, url: args.url, startedAt, elapsedMs: 0, headers: null, service: null, duel: null, failure: null, pass: false };
  let step = 'header checks', aborted = false;
  const watchdog = setTimeout(() => { aborted = true; }, 600000);
  try {
    const paidPath = args.paidPath ?? firstPaidPath(process.cwd());
    if (!paidPath) throw Error('no paid file to check: run from the main checkout (it has public/assets/paid) or pass --paid-path=/assets/paid/<file>');
    console.log(`[web-live] ${step} against ${args.url}`);
    const live = await runHeaderChecks({ url: args.url, passcode: args.passcode, paidPath, fetch: liveFetch });
    secrets.push(...live.secrets);
    report.headers = { checks: live.checks, version: live.version, versionCompared: false, problems: live.problems };
    if (live.problems.length) throw Error(`${live.problems.join('; ')}. ${TAKE_DOWN}`);
    // Plan L-5: when deploy:web's output is here, the live version.json must be exactly that build.
    const deployed = compareDeployedVersion(live.version, resolve('.vercel/output/static/version.json'));
    report.headers.versionCompared = deployed.versionCompared;
    if (deployed.problem) { report.headers.problems.push(deployed.problem); throw Error(`${deployed.problem} (an older production deployment is being served, or deploy:web did not finish)`); }
    if (args.serviceOrigin) {
      step = 'service preflight'; console.log(`[web-live] ${step}`);
      report.service = await checkServiceOrigin({ serviceOrigin: args.serviceOrigin, pageOrigin: args.url, fetch: liveFetch });
      if (report.service.problem) throw Error(report.service.problem);
    }
    step = 'duel';
    report.duel = await runLiveDuel({ url: args.url, passcode: args.passcode, aborted: () => aborted,
      step: label => { step = `duel: ${label}`; console.log(`[web-live] ${step}`); } });
    if (report.duel.problems.length) throw Error(report.duel.problems.join('; '));
  } catch (error) { report.failure = `${step}: ${message(error, secrets)}`; }
  finally { clearTimeout(watchdog); }
  report.elapsedMs = Math.ceil(performance.now() - began);
  report.pass = report.failure === null;
  if (report.failure !== null) report.failure = redact(report.failure, secrets);
  const problems = validateLiveReport(report, secrets);
  if (problems.length) { report.pass = false; report.failure = redact(`report: ${problems.join('; ')}${report.failure ? ` (after ${report.failure})` : ''}`, secrets); }
  const reportPath = resolve(args.reportPath);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, redact(JSON.stringify(report, null, 2), secrets) + '\n');
  if (!report.pass) { console.error(`LIVE SMOKE FAIL: ${report.failure} (report ${reportPath})`); process.exitCode = 1; return; }
  const d = report.duel!;
  console.log(`LIVE SMOKE PASS (${report.elapsedMs} ms; ${d.hostBrowser} host, ${d.guestBrowser} guest, relay on both sides, ${d.playedMs} ms played${d.endedEarly ? ', round ended early' : ''}; report ${reportPath})`);
}
void main();
