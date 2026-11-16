import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateInternetAppReport, validateInternetRun } from '../../../../scripts/network/internet-app-report';

const directory = 'docs/superpowers/reviews/2026-11-15-net-3e-evidence';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const reference = (path: string) => ({ path, sha256: sha(path) });
const candidate = read('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence/candidate.json');
const report = read('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence/readiness.json');
const deployment = read(`${directory}/deployment.json`);
const normal = read(`${directory}/internet-normal.json`);
const relay = read(`${directory}/internet-relay.json`);
validateInternetRun(normal);
validateInternetRun(relay);
if (sha('dist/net-3e-worker/index.js') !== deployment.bundleSha256 ||
    sha('dist/net-3e-worker/wrangler.jsonc') !== deployment.configSha256 ||
    sha(candidate.packagePath) !== candidate.identity.packageSha256 ||
    deployment.serviceOrigin !== candidate.identity.serviceOrigin ||
    deployment.pendingSecretNames.length !== 0) throw Error('deployment-identity-mismatch');
report.deployedService = { status: 'PASS', evidence: [reference(`${directory}/internet-normal.json`), reference(`${directory}/deployment.json`)], report: normal,
  deployment: { workerName: deployment.workerName, serviceOrigin: deployment.serviceOrigin, versionId: deployment.versionId,
    bundleSha256: deployment.bundleSha256, configSha256: deployment.configSha256, operatorConfirmedArtifact: true } };
report.forcedRelayGameplay = { status: 'PASS', evidence: [reference(`${directory}/internet-relay.json`)], report: relay };
report.internetReady = false;
validateInternetAppReport(report);
writeFileSync(`${directory}/readiness.json`, JSON.stringify(report, null, 2) + '\n');
console.log('PASS: deployed-service gameplay and selected forced-relay gameplay; exact candidate/Worker identity. Two-machine and OS-suspend NOT_RUN; internetReady=false.');
