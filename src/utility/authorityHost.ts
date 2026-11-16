import { performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';
import { createUtilityHost } from '../network/utilityHost';
import { createModeRegistry } from '../network/modes/registry';
import { sectorMode } from '../network/modes/sector';
import { emitterPortEndpoint } from '../network/platformPort';

declare const __GAMEPLAY_CONTENT_DIGEST__: string;
const parent = process.parentPort;
if (!parent) throw Error('authority utility requires parent port');
const owner = createUtilityHost(createModeRegistry([sectorMode]), {
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, clock: { nowMs: () => performance.now() },
  leaseClock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, nonce: () => randomBytes(16).toString('hex'),
  scheduler: { schedule(delayMs, callback) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } },
  onCrash() { /* generic controller owns bounded crash forwarding and disposal */ }
}, message => parent.postMessage(message));
parent.on('message', event => owner.receive(event.data,
  event.ports.map(port => emitterPortEndpoint(port, 'electron'))));
(parent as NodeJS.EventEmitter).on('close', () => { owner.dispose(); process.exit(0); });
process.on('exit', () => owner.dispose());
