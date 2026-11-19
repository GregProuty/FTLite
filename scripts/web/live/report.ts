// Web-iii live smoke report (web build spec §8 "The live check"): its shape and the rules a PASS must meet.
import { secretVariants, type HeaderCheck, type LiveVersion, type ServiceCheck } from './headers';
import { LIVE_PLAY_MS, MIN_EARLY_END_MS, type LiveDuelReport } from './relay';

export interface LiveReport {
  version: 1; url: string; startedAt: string; elapsedMs: number;
  /** versionCompared: the live version.json was compared with .vercel/output's (plan L-5); false when that file was absent. */
  headers: { checks: HeaderCheck[]; version: LiveVersion | null; versionCompared: boolean; problems: string[] } | null;
  service: ServiceCheck | null; duel: LiveDuelReport | null; failure: string | null; pass: boolean;
}

export function validateLiveReport(report: LiveReport, secrets: readonly string[]): string[] {
  const problems: string[] = [];
  if (report.version !== 1) problems.push('version is not 1');
  if (!/^https:\/\//.test(report.url)) problems.push('url is not https');
  if (!Number.isFinite(report.elapsedMs) || report.elapsedMs < 0) problems.push('elapsedMs is not a duration');
  if (Number.isNaN(Date.parse(report.startedAt))) problems.push('startedAt is not a date');
  if (report.pass) {
    if (report.failure !== null) problems.push('a passing report has a failure');
    const h = report.headers;
    if (!h || h.checks.length === 0 || h.problems.length > 0 || h.checks.some(c => c.problem !== null)) problems.push('a passing report needs every header check to pass');
    if (!h?.version) problems.push('a passing report needs the live version.json');
    if (report.service?.problem) problems.push('a passing report has a service problem');
    const d = report.duel;
    if (!d) problems.push('a passing report needs the duel');
    else {
      if (d.problems.length > 0 || d.relay.host !== null || d.relay.guest !== null) problems.push('a passing report needs relay on both sides and no page errors');
      if (!d.endedEarly && d.playedMs < LIVE_PLAY_MS) problems.push(`a passing duel played under ${LIVE_PLAY_MS} ms`);
      if (d.endedEarly && (d.phases.host !== 'ended' || d.phases.guest !== 'ended')) problems.push('an early end needs both sides ended');
      if (d.endedEarly && d.playedMs < MIN_EARLY_END_MS) problems.push(`an early end played under ${MIN_EARLY_END_MS} ms`);
    }
  } else if (typeof report.failure !== 'string' || report.failure.length === 0) problems.push('a failing report must name its failure');
  const text = JSON.stringify(report);
  if (secretVariants(secrets).some(s => text.includes(s))) problems.push('the report holds a secret');
  return problems;
}
