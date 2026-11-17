# Helm H-2b-ii: The Internet Candidate for SIM 39 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ] `) syntax for tracking.

**Goal:** Prepare the Net-3e internet candidate for SIM 39, so the owner can redeploy and play the duel across two networks. This plan does six things:
- the candidate's identity reads `sim: 39`;
- the package holds only the build;
- the internet smoke's sector pair runs through the test-only sector entry, because the menu now offers only the duel;
- a new duel pair runs through the real menu and leaves playtest records that the H-2b-i report reads;
- the two-machine path (`--role=host|guest`) runs the same duel and sector parts, one machine each;
- the candidate is built, packaged and audited, and the smoke passes against local workerd.

Everything that touches the deployed service or TURN is the owner's, after the redeploy.

**Architecture:**
- `scripts/network/internet-app-report.ts` and `candidate-manifest.ts` take `sim` from `SIM_VERSION`. The report admits and checks the duel evidence of a local pair (`duel`) and of each two-machine device (`deviceDuel`).
- `electron-builder.yml` and the manifest pack and hash only `out/main`, `out/preload` and `out/renderer`.
- `scripts/network/online-observer-build.ts` gains the duel's observer build, which `internet-observer-worker.ts` runs with a `duel` argument.
- `scripts/network/internet-app-smoke.ts` runs the duel pair first, in its own directory, with the forced-end test seed, then the sector pair through `host-sector` and `join-sector` with `FTLITE_SECTOR_ONLINE_TEST=1`. With `--role`, it runs one machine's half of each, the guest reading room codes from `--join-code-file`.
- `docs/gates.md` gains the candidate's subsection; the Net-3e two-machine prompt gains the new procedure.

**Tech Stack:** TypeScript 5.8, Vitest 3.2, tsx, zod 3, Electron 37.10.3, electron-builder, Wrangler 4.156.0 (dry run only). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §10 ("The sector app and internet smokes survive": the manifest keeps its sector run through the test-only entry and adds a duel run through the real menu) and the H-2b row of §11. Follows `2026-11-16-helm-h2b-i-telemetry-report.md`. Net-3e: `docs/superpowers/reviews/2026-11-15-net-3e-release-candidate.md`.

## Scope

- **Prerequisite: H-2b-i merged.** Task 1 Step 0 checks it.
- **Task 1:** the report's SIM 39 identity and duel evidence; packaging only the build.
- **Task 2:** the internet smoke: the duel pair and the sector pair on the test-only entry, for the local pair and for two machines.
- **Task 3:** the candidate, its manifest and the local verification run; the gates subsection and the two-machine procedure.
- **Task 4:** the gates.
- **Owner-only (not run by this plan):** the redeploy; the deployed and forced-relay runs; the two-machine runs; the LAN and internet checklists; the §16 sessions. See "After H-2b-ii".

## Global Constraints

- **Prerequisite: H-2b-i is merged.** Do not start this plan on a checkout without it.
- **Never deploy, push, read or print secrets.** No step contacts the deployed service or TURN. `npm run build:signalling` is a Wrangler dry run. Do not read `.env*` or `.dev.vars*`, and do not put credentials on a command line. The candidate's packaged origin, `https://ftlite-signalling-dev.gprout009.workers.dev`, is the Net-3e intended origin and is not a secret.
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean` in the main checkout. Build the candidate in a worktree or a checkout whose tracked files are clean. The internet smoke compares every `src/`, `scripts/` and `build/` file with the manifest's source hashes, and refuses a candidate whose source revision is not an ancestor of `HEAD`. `dist/` and `out/` are git-ignored.
- **A git worktree needs both junctions** (`node_modules` and `services\signalling\node_modules`).
- **Commands.** `Run:` lines need no shell features. Task 3 sets an environment variable and zips a folder in **PowerShell**; those blocks are marked as PowerShell. Commit with explicit paths only, and end every commit message with your session's Co-Authored-By trailer. Use LF line endings.
- **The code is exact.** Each `replace:` block occurs exactly once in its file at that point of the plan: replace it with the `with:` block, in the order given. A file shown in full is written as shown. The plan was re-extracted step by step into a fresh worktree (master `ca06a62` plus H-2b-i) and reproduces the prototype byte for byte. **Exception:** the review-round-1 changes (the X/E stand-up in the duel run, the latency-sample check, the two-machine duel and sector path with `--join-code-file`, and their tests) were written against the source but not re-run in the prototype; if one of their tests or the typecheck fails, fix the new code, not the expectation.
- **Order matters in Task 3:** the candidate's `out/` must come from the origin-embedded build. The internet smoke checks the compiled origin in `out/main/index.js` and every manifest artifact hash. Run no other `npm run build` between packaging and the internet smoke.

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order. The owner can overturn any of them.

1. **`sim` comes from `SIM_VERSION`** in the manifest and in the report's identity schema (it was the literal 35). Both now follow the build's constant, so a later bump cannot make a candidate that its own report refuses. The validator still requires equality.
2. **The package holds only the build** **(rec.)**. `electron-builder.yml` packs `out/main`, `out/preload` and `out/renderer` instead of `out/**/*`, and the manifest hashes the same three folders. Smoke evidence under `out/` would otherwise enter the candidate, and the manifest would fail to find those files in the package.
3. **The internet smoke runs a duel pair first, then the sector pair** (spec §10):
   - **The duel pair.**
     - It runs in its own directory with its own passive observer (`buildDuelObservers`, through the observer worker's `duel` argument), as owned kinds `duel-host` and `duel-guest`, so the sector peers' cleanup lookup is unchanged.
     - It uses the test seed `FTLITE_DUEL_TEST_SEED=2277`, honoured only by the unpackaged driver build, as in the duel smoke. Round 1 is the forced end: each player only stands up and sits down again (X, then E, after the stand-up's applied result), as in the duel smoke, so both round-1 records carry command samples; nobody flies or fires. Enter starts round 2. Then the host, at the Helm because seats are not swapped, holds W, and the guest at Weapons fires.
     - It checks that the speed and the shots rise on both screens and that a common publication hash agrees. Both machines' round-1 records, which must carry latency samples, are copied to `<report>-duel-records/{host,guest}/`. Both apps then shut down, with their cleanup recorded.
   - **The sector pair** uses `host-sector` and `join-sector` with `FTLITE_SECTOR_ONLINE_TEST=1`. The rest of its run is unchanged.
   - **Two machines (`--role=host|guest`)** **(rec.)**, because the menu's Host now makes only a duel room: each machine runs its half of the same duel through the real menu (the harness drives it; the humans keep off the keyboard), then its half of the sector through `host-sector`/`join-sector`, where the humans play as before. The host's lobby shows each room code on screen; the guest's operator saves it in the file named by `--join-code-file` (required for the guest, refused for the host, and it must not exist at start), which the guest reads and deletes. The code is never on the command line, printed, logged or reported. `--capture-after-ms` (30 to 180 s) now counts from the sector run's start, and the manual budget is 600 s (the schema maximum). So `twoMachineGameplay`, and with it `internetReady`, stay achievable.
   - **The local pair's budget rises from 90 s to 180 s.** The local rehearsal takes about 55 s; the deployed service is slower.
4. **The report checks the duel evidence** **(rec.)**. A local-pair run must carry `duel` and not `deviceDuel`; a single-device run must carry `deviceDuel` (its own seat's record, and a thrust peak and a beam on its own screen) and not `duel`, and the two-machine pair's duel seeds must match. Every duel record must carry latency samples (`held + command > 0`). The host's record reads `loopback`. The guest's has an RTT and reads `lan` or `internet`, and **must read `internet` under `--force-relay`**, which is the end-to-end proof of the H-2b-i route label over TURN. The speed and shots must rise on both screens. Every duel app's cleanup must balance, as the sector peers' does, and their process ids must be distinct from every other.
5. **What is proven before the redeploy, and what is the owner's:**
   - **Proven here:** the Wrangler dry-run bundle; the origin-embedded build; the unsigned package, its zip and its manifest audit; the smoke's `--local-verification` run against local workerd; the playtest report on that run's duel records.
   - **Not run here:** `--local-verification` cannot be combined with `--force-relay`, and local workerd issues no TURN. The deployed service is SIM 35 and refuses a SIM 39 room. Deploying is the owner's.
6. **The candidate's packaged origin is the Net-3e worker's.** The redeploy target is the same worker (`ftlite-signalling-dev`). If the owner deploys elsewhere, rebuild the candidate for that origin.

## File structure

| File | Responsibility |
|---|---|
| `scripts/network/internet-app-report.ts`, `scripts/network/candidate-manifest.ts`, `electron-builder.yml` | **Modify:** `sim` from `SIM_VERSION`; the duel evidence; only the build is packaged |
| `scripts/network/online-observer-build.ts`, `scripts/network/internet-observer-worker.ts` | **Modify:** the duel observer |
| `scripts/network/internet-app-smoke.ts` | **Modify:** the duel pair; the sector pair on the test-only entry; the two-machine path |
| `tests/internetAppReport.test.ts`, `tests/internetAppSmoke.test.ts` | **Modify:** SIM 39 identity, the duel evidence; the join-code-file arguments |
| `docs/gates.md`, `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md` | **Modify:** the candidate's subsection; the two-machine procedure |

---

### Task 1: The report's SIM 39 identity and duel evidence; only the build is packaged

**Files:**
- Modify: `scripts/network/internet-app-report.ts`, `scripts/network/candidate-manifest.ts`, `electron-builder.yml`, `tests/internetAppReport.test.ts`

- [ ] **Step 0: Check the prerequisite (H-2b-i merged)**

Run: `npx vitest run tests/duelPlaytestReport.test.ts`
Expected: PASS, 7 tests. **If the file is missing, stop: H-2b-i is not merged.**

- [ ] **Step 1: Write the failing tests**

In `tests/internetAppReport.test.ts`, replace:

````ts
import { validateInternetAppReport, validateInternetRun, validateLocalInternetDriverRun, INTERNET_ARTIFACTS } from '../scripts/network/internet-app-report';
const sha = 'a'.repeat(64), runId = 'b'.repeat(32);
const recovery = JSON.parse(readFileSync('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-7-evidence/recovery-skiff.json','utf8'));
const identity = () => ({ serviceOrigin:'https://service.example', revision:'c'.repeat(40), digest:recovery.source.digest, packageSha256:sha,workerBundleSha256:sha,workerConfigSha256:sha, artifacts:Object.fromEntries(Object.entries(recovery.source.artifactHashes).filter(([k])=>k.startsWith('out/'))), versions:{electron:'37.10.3',wrangler:'4.156.0',workerd:'1.20261023.1',protocol:2,sim:35,checkpoint:2,replay:[2,3,4]} });
const ref = () => ({path:'evidence/run.json',sha256:sha});
````

with:

````ts
import { validateInternetAppReport, validateInternetRun, validateLocalInternetDriverRun, INTERNET_ARTIFACTS } from '../scripts/network/internet-app-report';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
const sha = 'a'.repeat(64), runId = 'b'.repeat(32);
const recovery = JSON.parse(readFileSync('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-7-evidence/recovery-skiff.json','utf8'));
const identity = () => ({ serviceOrigin:'https://service.example', revision:'c'.repeat(40), digest:recovery.source.digest, packageSha256:sha,workerBundleSha256:sha,workerConfigSha256:sha, artifacts:Object.fromEntries(Object.entries(recovery.source.artifactHashes).filter(([k])=>k.startsWith('out/'))), versions:{electron:'37.10.3',wrangler:'4.156.0',workerd:'1.20261023.1',protocol:2,sim:SIM_VERSION,checkpoint:2,replay:[2,3,4]} });
const ref = () => ({path:'evidence/run.json',sha256:sha});
````

In `tests/internetAppReport.test.ts`, replace:

````ts
  cleanup:{pid:100+seat,exited:true,exitCode:0,utilities:seat?0:1,utilityExits:seat?0:1,utilityPids:seat?[]:[150],windows:0,ports:0,listeners:0,peers:0,nativeWindows:1,nativeWindowExits:1,nativePeersObserved:1,nativePeerCloses:1,nativePeersEndedWithWindow:0,observedMainPorts:4}});
const run = (role?:number):any => ({version:1,identity:identity(),serviceOrigin:'https://service.example',forceRelay:true,mode:role===undefined?'local-pair':'single-device',machineLabel:role===undefined?'local':`device-${role}`,networkLabel:role===undefined?'local':`network-${role}`,failure:null,cleanupFailed:false,temporaryRemoved:true,directoryCleanupAttempted:true,elapsedMs:1000,budgetMs:90000,processes:[{pid:10,exited:true,exitCode:0,kind:'preparation'}],peers:role===undefined?[peer(0),peer(1)]:[peer(role)]});
const fixture = ():any => ({version:1,identity:identity(),internetReady:true,localRecovery:{status:'PASS',evidence:[ref()],report:structuredClone(recovery),runtimeProvenance:{reportRevision:recovery.source.revision,candidateRevision:'c'.repeat(40),executableArtifacts:identity().artifacts}},deployedService:{status:'PASS',evidence:[ref()],report:run(),deployment:{workerName:'ftlite-signalling-dev',serviceOrigin:'https://service.example',versionId:'deployment-1',bundleSha256:sha,configSha256:sha,operatorConfirmedArtifact:true}},forcedRelayGameplay:{status:'PASS',evidence:[ref()],report:run()},twoMachineGameplay:{status:'PASS',evidence:[ref(),ref()],reports:[run(0),run(1)],attestation:{physicallySeparate:true,differentNetworks:true,operatorLabels:['operator-a','operator-b']}},actualOsSuspend:{status:'NOT_RUN',evidence:[]}});
````

with:

````ts
  cleanup:{pid:100+seat,exited:true,exitCode:0,utilities:seat?0:1,utilityExits:seat?0:1,utilityPids:seat?[]:[150],windows:0,ports:0,listeners:0,peers:0,nativeWindows:1,nativeWindowExits:1,nativePeersObserved:1,nativePeerCloses:1,nativePeersEndedWithWindow:0,observedMainPorts:4}});
const duelCleanup = (pid:number,host:boolean) => ({pid,exited:true,exitCode:0,utilities:host?1:0,utilityExits:host?1:0,utilityPids:host?[pid+50]:[],windows:0,ports:0,listeners:0,peers:0,nativeWindows:1,nativeWindowExits:1,nativePeersObserved:1,nativePeerCloses:1,nativePeersEndedWithWindow:0,observedMainPorts:3});
const duel = () => ({seed:2277,decidedTick:1471,thrust:{before:0,host:12.5,guest:12.5},beam:{before:0,host:1,guest:1},agreement:{tick:1800,sequence:600,hash:'abcdef01'},
  records:[{role:'host',round:0,transport:'loopback',rttMs:1,held:2,command:2},{role:'guest',round:0,transport:'internet',rttMs:38,held:2,command:2}],cleanup:[duelCleanup(200,true),duelCleanup(201,false)]});
const deviceDuel = (seat:number) => ({seed:2277,decidedTick:1471,thrust:{before:0,peak:12.5},beam:{before:0,after:1},
  record:seat?{role:'guest',round:0,transport:'internet',rttMs:38,held:2,command:2}:{role:'host',round:0,transport:'loopback',rttMs:1,held:2,command:2},cleanup:duelCleanup(300+seat,!seat)});
const run = (role?:number):any => ({version:1,identity:identity(),serviceOrigin:'https://service.example',forceRelay:true,mode:role===undefined?'local-pair':'single-device',machineLabel:role===undefined?'local':`device-${role}`,networkLabel:role===undefined?'local':`network-${role}`,failure:null,cleanupFailed:false,temporaryRemoved:true,directoryCleanupAttempted:true,elapsedMs:1000,budgetMs:90000,processes:[{pid:10,exited:true,exitCode:0,kind:'preparation'}],peers:role===undefined?[peer(0),peer(1)]:[peer(role)],...(role===undefined?{duel:duel()}:{deviceDuel:deviceDuel(role)})});
const fixture = ():any => ({version:1,identity:identity(),internetReady:true,localRecovery:{status:'PASS',evidence:[ref()],report:structuredClone(recovery),runtimeProvenance:{reportRevision:recovery.source.revision,candidateRevision:'c'.repeat(40),executableArtifacts:identity().artifacts}},deployedService:{status:'PASS',evidence:[ref()],report:run(),deployment:{workerName:'ftlite-signalling-dev',serviceOrigin:'https://service.example',versionId:'deployment-1',bundleSha256:sha,configSha256:sha,operatorConfirmedArtifact:true}},forcedRelayGameplay:{status:'PASS',evidence:[ref()],report:run()},twoMachineGameplay:{status:'PASS',evidence:[ref(),ref()],reports:[run(0),run(1)],attestation:{physicallySeparate:true,differentNetworks:true,operatorLabels:['operator-a','operator-b']}},actualOsSuspend:{status:'NOT_RUN',evidence:[]}});
````

In `tests/internetAppReport.test.ts`, replace:

````ts
  ['raw diagnostic',(r:any)=>r.forcedRelayGameplay.report.peers[0].routes[0].address='192.0.2.1'],
])('rejects %s',(_name,mutate)=>{const r=fixture();mutate(r);expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it('admits a single device only as an independent local result',()=>expect(()=>validateInternetRun(run(1))).not.toThrow());
it('keeps a loopback rehearsal out of every internet gate',()=>{const r=run();r.serviceOrigin='http://127.0.0.1:12345';r.forceRelay=false;expect(()=>validateLocalInternetDriverRun(r)).not.toThrow();expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');});
````

with:

````ts
  ['raw diagnostic',(r:any)=>r.forcedRelayGameplay.report.peers[0].routes[0].address='192.0.2.1'],
  ['no duel run in a local pair',(r:any)=>delete r.forcedRelayGameplay.report.duel],
  ['a direct duel guest under forced relay',(r:any)=>r.forcedRelayGameplay.report.duel.records[1].transport='lan'],
  ['a duel guest record without an RTT',(r:any)=>r.deployedService.report.duel.records[1].rttMs=null],
  ['a duel host record off loopback',(r:any)=>r.deployedService.report.duel.records[0].transport='lan'],
  ['no beam in the duel',(r:any)=>r.deployedService.report.duel.beam.guest=0],
  ['unbalanced duel cleanup',(r:any)=>r.deployedService.report.duel.cleanup[0].utilityExits=0],
  ['a duel pid reused',(r:any)=>r.deployedService.report.duel.cleanup[1].pid=100],
  ['a duel run on a single device',(r:any)=>r.twoMachineGameplay.reports[0].duel=duel()],
  ['a duel candidate field',(r:any)=>r.deployedService.report.duel.records[1].candidate='host'],
  ['no latency samples',(r:any)=>{const x=r.deployedService.report.duel.records[1];x.held=0;x.command=0;}],
  ['no duel run on a single device',(r:any)=>delete r.twoMachineGameplay.reports[1].deviceDuel],
  ['a device duel record from the other seat',(r:any)=>{ r.twoMachineGameplay.reports[0].deviceDuel.record={role:'guest',round:0,transport:'internet',rttMs:38,held:2,command:2}; }],
  ['a direct device duel guest under forced relay',(r:any)=>r.twoMachineGameplay.reports[1].deviceDuel.record.transport='lan'],
  ['two-machine duel seeds differ',(r:any)=>r.twoMachineGameplay.reports[1].deviceDuel.seed=1],
])('rejects %s',(_name,mutate)=>{const r=fixture();mutate(r);expect(()=>validateInternetAppReport(r)).toThrow('internet-evidence-invalid');});
it('admits a single device only as an independent local result',()=>expect(()=>validateInternetRun(run(1))).not.toThrow());
it('admits a direct LAN duel guest only without forced relay',()=>{const r=run();r.duel.records[1].transport='lan';expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');r.forceRelay=false;for(const p of r.peers)p.routes[0]={...p.routes[0],localType:'host',remoteType:'host',policy:'all'};expect(()=>validateInternetRun(r)).not.toThrow();});
it('keeps a loopback rehearsal out of every internet gate',()=>{const r=run();r.serviceOrigin='http://127.0.0.1:12345';r.forceRelay=false;expect(()=>validateLocalInternetDriverRun(r)).not.toThrow();expect(()=>validateInternetRun(r)).toThrow('internet-evidence-invalid');});
````

Run: `npx vitest run tests/internetAppReport.test.ts`
Expected: FAIL (the identity's `sim` is 35, and a local pair's `duel` field is refused).

- [ ] **Step 2: The report and the manifest**

In `scripts/network/internet-app-report.ts`, replace:

````ts
import { isCanonicalServiceOrigin } from './internet-app-manifest';
export const INTERNET_ARTIFACTS = ['out/main/index.js','out/main/authorityHost.js','out/main/hostProcess.js','out/main/transportWindow.js','out/main/rtcTransport.js','out/preload/index.js','out/preload/networkTransport.js','out/renderer/index.html','out/renderer/networkTransport.html'];
````

with:

````ts
import { isCanonicalServiceOrigin } from './internet-app-manifest';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
export const INTERNET_ARTIFACTS = ['out/main/index.js','out/main/authorityHost.js','out/main/hostProcess.js','out/main/transportWindow.js','out/main/rtcTransport.js','out/preload/index.js','out/preload/networkTransport.js','out/renderer/index.html','out/renderer/networkTransport.html'];
````

In `scripts/network/internet-app-report.ts`, replace:

````ts
const label=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const identity=z.object({serviceOrigin:z.string().max(200).refine(isCanonicalServiceOrigin),revision:z.string().regex(/^[a-f0-9]{40}$/),digest:sha,packageSha256:sha,workerBundleSha256:sha,workerConfigSha256:sha,artifacts:z.record(sha),versions:z.object({electron:z.literal('37.10.3'),wrangler:z.literal('4.156.0'),workerd:z.literal('1.20261023.1'),protocol:z.literal(2),sim:z.literal(35),checkpoint:z.literal(2),replay:z.tuple([z.literal(2),z.literal(3),z.literal(4)])}).strict()}).strict();
const runId=z.string().regex(/^[a-f0-9]{32}$/);
````

with:

````ts
const label=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const identity=z.object({serviceOrigin:z.string().max(200).refine(isCanonicalServiceOrigin),revision:z.string().regex(/^[a-f0-9]{40}$/),digest:sha,packageSha256:sha,workerBundleSha256:sha,workerConfigSha256:sha,artifacts:z.record(sha),versions:z.object({electron:z.literal('37.10.3'),wrangler:z.literal('4.156.0'),workerd:z.literal('1.20261023.1'),protocol:z.literal(2),sim:z.literal(SIM_VERSION),checkpoint:z.literal(2),replay:z.tuple([z.literal(2),z.literal(3),z.literal(4)])}).strict()}).strict();
const runId=z.string().regex(/^[a-f0-9]{32}$/);
````

In `scripts/network/internet-app-report.ts`, replace:

````ts
  publications:z.array(publication).min(1).max(256),routes:z.array(z.object({state:z.literal('connected'),selected:z.literal(true),localType:z.enum(['host','srflx','prflx','relay']),remoteType:z.enum(['host','srflx','prflx','relay']),policy:z.enum(['all','relay']),sent:pos,received:pos}).strict()).min(1).max(3),cleanup}).strict();
const run=z.object({version:z.literal(1),identity,serviceOrigin:z.string().max(200),forceRelay:z.boolean(),mode:z.enum(['local-pair','single-device']),machineLabel:label,networkLabel:label,failure:z.null(),cleanupFailed:z.literal(false),temporaryRemoved:z.literal(true),directoryCleanupAttempted:z.literal(true),elapsedMs:pos,budgetMs:pos.max(600000),processes:z.array(z.object({pid:pos,exited:z.literal(true),exitCode:z.literal(0),kind:z.literal('preparation')}).strict()).min(1).max(8),peers:z.array(peer).min(1).max(2)}).strict();
const evidence=z.array(z.object({path:z.string().regex(/^[A-Za-z0-9_./-]+$/).max(300),sha256:sha}).strict()).max(32);
````

with:

````ts
  publications:z.array(publication).min(1).max(256),routes:z.array(z.object({state:z.literal('connected'),selected:z.literal(true),localType:z.enum(['host','srflx','prflx','relay']),remoteType:z.enum(['host','srflx','prflx','relay']),policy:z.enum(['all','relay']),sent:pos,received:pos}).strict()).min(1).max(3),cleanup}).strict();
// The duel run (H-2b): the forced round end and round 2's thrust, beam and hash agreement, each machine's round-1
// playtest record (route label and RTT only) and both apps' exact cleanup.
const duelRecord=z.object({role:z.enum(['host','guest']),round:z.literal(0),transport:z.enum(['loopback','lan','internet']).nullable(),rttMs:z.number().finite().nonnegative().nullable(),held:nat,command:nat}).strict();
const duel=z.object({seed:nat,decidedTick:pos,thrust:z.object({before:z.number().finite(),host:z.number().finite(),guest:z.number().finite()}).strict(),
  beam:z.object({before:nat,host:pos,guest:pos}).strict(),agreement:z.object({tick:pos,sequence:pos,hash:z.string().regex(/^[a-f0-9]{8}$/)}).strict(),
  records:z.tuple([duelRecord,duelRecord]),cleanup:z.tuple([cleanup,cleanup])}).strict();
// One machine of a two-machine duel: its own screen's thrust peak and beam, its round-1 record and its app's cleanup.
const deviceDuel=z.object({seed:nat,decidedTick:pos,thrust:z.object({before:z.number().finite(),peak:z.number().finite()}).strict(),beam:z.object({before:nat,after:pos}).strict(),record:duelRecord,cleanup}).strict();
const run=z.object({version:z.literal(1),identity,serviceOrigin:z.string().max(200),forceRelay:z.boolean(),mode:z.enum(['local-pair','single-device']),machineLabel:label,networkLabel:label,failure:z.null(),cleanupFailed:z.literal(false),temporaryRemoved:z.literal(true),directoryCleanupAttempted:z.literal(true),elapsedMs:pos,budgetMs:pos.max(600000),processes:z.array(z.object({pid:pos,exited:z.literal(true),exitCode:z.literal(0),kind:z.literal('preparation')}).strict()).min(1).max(8),peers:z.array(peer).min(1).max(2),duel:duel.optional(),deviceDuel:deviceDuel.optional()}).strict();
const evidence=z.array(z.object({path:z.string().regex(/^[A-Za-z0-9_./-]+$/).max(300),sha256:sha}).strict()).max(32);
````

In `scripts/network/internet-app-report.ts`, replace:

````ts
}
function parseRun(value:unknown,localOnly=false) {
  const r=run.parse(value);checkIdentity(r.identity);if(!localOnly&&r.serviceOrigin!==r.identity.serviceOrigin)fail();
  if(!resolveOnlineConfig(localOnly?{packaged:false,localServiceUrl:r.serviceOrigin}:{packaged:false,serviceUrl:r.serviceOrigin}).enabled || localOnly&&r.forceRelay || r.elapsedMs>r.budgetMs || r.peers.length!==(r.mode==='local-pair'?2:1))fail();
  if(new Set([...r.processes.map(p=>p.pid),...r.peers.map(p=>p.cleanup.pid)]).size!==r.processes.length+r.peers.length)fail();
  for(const p of r.peers) {
````

with:

````ts
}
function checkCleanup(c:z.infer<typeof cleanup>) {
  if(c.utilities!==c.utilityExits || c.utilityPids.length!==c.utilities || new Set(c.utilityPids).size!==c.utilities
    || c.nativeWindows!==c.nativeWindowExits || c.nativePeersObserved!==c.nativePeerCloses+c.nativePeersEndedWithWindow)fail();
}
/** A duel record carries latency samples; the host's reads loopback; the guest's carries an RTT and its route ('internet' under forced relay). */
function checkRecord(x:z.infer<typeof duelRecord>,forceRelay:boolean) {
  if(x.held+x.command<=0 || (x.role==='host'?x.transport!=='loopback':x.rttMs===null||(forceRelay?x.transport!=='internet':x.transport!=='lan'&&x.transport!=='internet')))fail();
}
/** A local pair also runs the duel (H-2b), seen on both screens. */
function checkDuel(r:z.infer<typeof run>) {
  const d=r.duel;if(!d||r.deviceDuel)fail();
  const [h,g]=d!.records;
  if(h.role!=='host'||g.role!=='guest'
    || d!.thrust.host<=d!.thrust.before+1 || d!.thrust.guest<=d!.thrust.before+1 || d!.beam.host<=d!.beam.before || d!.beam.guest<=d!.beam.before)fail();
  checkRecord(h,r.forceRelay);checkRecord(g,r.forceRelay);
  for(const c of d!.cleanup)checkCleanup(c);
}
/** A single device runs its half of a two-machine duel: its own seat's record, and thrust and a beam on its own screen. */
function checkDeviceDuel(r:z.infer<typeof run>) {
  const d=r.deviceDuel;if(!d||r.duel)fail();
  if(d!.record.role!==r.peers[0]!.role || d!.thrust.peak<=d!.thrust.before+1 || d!.beam.after<=d!.beam.before)fail();
  checkRecord(d!.record,r.forceRelay);checkCleanup(d!.cleanup);
}
function parseRun(value:unknown,localOnly=false) {
  const r=run.parse(value);checkIdentity(r.identity);if(!localOnly&&r.serviceOrigin!==r.identity.serviceOrigin)fail();
  if(!resolveOnlineConfig(localOnly?{packaged:false,localServiceUrl:r.serviceOrigin}:{packaged:false,serviceUrl:r.serviceOrigin}).enabled || localOnly&&r.forceRelay || r.elapsedMs>r.budgetMs || r.peers.length!==(r.mode==='local-pair'?2:1))fail();
  const duelPids=[...(r.duel?.cleanup.map(c=>c.pid)??[]),...(r.deviceDuel?[r.deviceDuel.cleanup.pid]:[])];
  if(new Set([...r.processes.map(p=>p.pid),...r.peers.map(p=>p.cleanup.pid),...duelPids]).size!==r.processes.length+r.peers.length+duelPids.length)fail();
  for(const p of r.peers) {
````

In `scripts/network/internet-app-report.ts`, replace:

````ts
      || r.forceRelay && p.routes.some(t=>t.policy!=='relay'||t.localType!=='relay'||t.remoteType!=='relay'))fail();
    const c=p.cleanup;
    if(c.utilities!==c.utilityExits || c.utilityPids.length!==c.utilities || new Set(c.utilityPids).size!==c.utilities
      || c.nativeWindows!==c.nativeWindowExits || c.nativePeersObserved!==c.nativePeerCloses+c.nativePeersEndedWithWindow)fail();
  }
  if(r.mode==='local-pair')checkAgreement(r.peers);
  return r;
````

with:

````ts
      || r.forceRelay && p.routes.some(t=>t.policy!=='relay'||t.localType!=='relay'||t.remoteType!=='relay'))fail();
    checkCleanup(p.cleanup);
  }
  if(r.mode==='local-pair'){checkAgreement(r.peers);checkDuel(r);}
  else checkDeviceDuel(r);
  return r;
````

In `scripts/network/internet-app-report.ts`, replace:

````ts
          || !same(a.identity,base.identity)||!same(b.identity,base.identity)||a.serviceOrigin!==b.serviceOrigin||!a.forceRelay||!b.forceRelay)fail();
````

with:

````ts
          || !same(a.identity,base.identity)||!same(b.identity,base.identity)||a.serviceOrigin!==b.serviceOrigin||!a.forceRelay||!b.forceRelay
          || a.deviceDuel?.seed!==b.deviceDuel?.seed)fail();
````

In `scripts/network/candidate-manifest.ts`, replace:

````ts
import { assertCandidateServiceOrigin } from './internet-app-manifest';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
````

with:

````ts
import { assertCandidateServiceOrigin } from './internet-app-manifest';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
````

In `scripts/network/candidate-manifest.ts`, replace:

````ts
const files=(root:string)=>readdirSync(root,{recursive:true,withFileTypes:true}).filter(d=>d.isFile()).map(d=>(d.parentPath+'/'+d.name).replaceAll('\\','/'));
const artifacts=Object.fromEntries(files('out').filter(p=>!p.endsWith('/.gitkeep')).sort().map(p=>{const bytes=asar.extractFile(asarPath,normalize(p));if(sha(bytes)!==hash(p))throw Error('package-build-mismatch');return [p,sha(bytes)];}));
if(Object.keys(artifacts).filter(p=>/^out\/(preload|renderer)\//.test(p)&&/\.(js|html)$/.test(p)).some(p=>readFileSync(p,'utf8').includes(serviceOrigin)))throw Error('renderer-origin-invalid');
````

with:

````ts
const files=(root:string)=>readdirSync(root,{recursive:true,withFileTypes:true}).filter(d=>d.isFile()).map(d=>(d.parentPath+'/'+d.name).replaceAll('\\','/'));
// The packaged build only (electron-builder.yml packs out/main, out/preload and out/renderer); smoke evidence under out/ is not part of it.
const artifacts=Object.fromEntries(['out/main','out/preload','out/renderer'].flatMap(files).filter(p=>!p.endsWith('/.gitkeep')).sort().map(p=>{const bytes=asar.extractFile(asarPath,normalize(p));if(sha(bytes)!==hash(p))throw Error('package-build-mismatch');return [p,sha(bytes)];}));
if(Object.keys(artifacts).filter(p=>/^out\/(preload|renderer)\//.test(p)&&/\.(js|html)$/.test(p)).some(p=>readFileSync(p,'utf8').includes(serviceOrigin)))throw Error('renderer-origin-invalid');
````

In `scripts/network/candidate-manifest.ts`, replace:

````ts
const versions=(lock:any,names:string[])=>Object.fromEntries(names.map(name=>[name,lock.packages['node_modules/'+name].version]));
const manifest={version:1,serviceOrigin,packagePath,identity:{serviceOrigin,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim(),digest:computeContentDigest(process.cwd()),packageSha256:hash(packagePath),workerBundleSha256:hash('services/signalling/dist/index.js'),workerConfigSha256:hash('services/signalling/wrangler.jsonc'),artifacts,versions:{electron:'37.10.3',wrangler:'4.156.0',workerd:'1.20261023.1',protocol:2,sim:35,checkpoint:2,replay:[2,3,4]}},sourceFiles,
  package:{asarSha256:hash(asarPath),executableSha256:hash(appDirectory+'/FTLite.exe'),entryCount:entries.length,entries},
````

with:

````ts
const versions=(lock:any,names:string[])=>Object.fromEntries(names.map(name=>[name,lock.packages['node_modules/'+name].version]));
const manifest={version:1,serviceOrigin,packagePath,identity:{serviceOrigin,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim(),digest:computeContentDigest(process.cwd()),packageSha256:hash(packagePath),workerBundleSha256:hash('services/signalling/dist/index.js'),workerConfigSha256:hash('services/signalling/wrangler.jsonc'),artifacts,versions:{electron:'37.10.3',wrangler:'4.156.0',workerd:'1.20261023.1',protocol:2,sim:SIM_VERSION,checkpoint:2,replay:[2,3,4]}},sourceFiles,
  package:{asarSha256:hash(asarPath),executableSha256:hash(appDirectory+'/FTLite.exe'),entryCount:entries.length,entries},
````

In `electron-builder.yml`, replace:

````
files:
  - out/**/*
  - '!**/.env*'
````

with:

````
files:
  # Only the build's three entry folders: evidence written under out/ by the smokes is never packaged (H-2b).
  - out/main/**/*
  - out/preload/**/*
  - out/renderer/**/*
  - '!**/.env*'
````

- [ ] **Step 3: Run the tests and the typecheck**

Run: `npx vitest run tests/internetAppReport.test.ts tests/internetAppSmoke.test.ts tests/internetAppManifest.test.ts`
Expected: PASS, 95 tests in 3 files (`internetAppReport` 78, `internetAppSmoke` 5, `internetAppManifest` 12).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```
git add scripts/network/internet-app-report.ts scripts/network/candidate-manifest.ts electron-builder.yml tests/internetAppReport.test.ts
git commit -m "H-2b-ii task 1: the internet report's SIM 39 identity and duel evidence; only the build is packaged"
```

---

### Task 2: The internet smoke: the duel pair, and the sector pair on the test-only entry (local pair and two machines)

**Files:**
- Modify: `scripts/network/online-observer-build.ts`, `scripts/network/internet-observer-worker.ts`, `scripts/network/internet-app-smoke.ts`, `tests/internetAppSmoke.test.ts`

- [ ] **Step 1: The duel observer**

In `scripts/network/online-observer-build.ts`, replace:

````ts
import { build } from 'vite';
import { join, resolve } from 'node:path';
````

with:

````ts
import { build } from 'vite';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
````

In `scripts/network/online-observer-build.ts`, replace (the file's last two lines):

````ts
    build:{outDir:join(directory,'observer'),emptyOutDir:false,target:'node22',lib:{entry:resolve('scripts/network/online-recovery-utility.ts'),formats:['cjs'],fileName:()=>'utility.cjs'},rollupOptions:{external:['node:fs']}}});
}
````

with:

````ts
    build:{outDir:join(directory,'observer'),emptyOutDir:false,target:'node22',lib:{entry:resolve('scripts/network/online-recovery-utility.ts'),formats:['cjs'],fileName:()=>'utility.cjs'},rollupOptions:{external:['node:fs']}}});
}
/** The duel's passive observer (H-2 spec §10) and a no-op utility proof: a duel checkpoint has no sector card memory. */
export async function buildDuelObservers(directory:string,digest:string) {
  await build({configFile:false,envDir:false,logLevel:'warn',define:{__GAMEPLAY_CONTENT_DIGEST__:JSON.stringify(digest)},
    build:{outDir:join(directory,'observer'),emptyOutDir:false,lib:{entry:resolve('scripts/network/duel-app-observer.ts'),name:'DuelObserver',formats:['iife'],fileName:()=>'observer.js'}}});
  writeFileSync(join(directory,'observer','utility.cjs'),'module.exports = { reconciledMemory: () => null };\n');
}
````

Replace the whole of `scripts/network/internet-observer-worker.ts` with:

````ts
import { buildDuelObservers, buildOnlineObservers } from './online-observer-build';
const [directory,digest,kind]=process.argv.slice(2);
if(!directory||!digest||(kind!==undefined&&kind!=='duel'))throw Error('observer-arguments-invalid');
(kind==='duel'?buildDuelObservers:buildOnlineObservers)(directory,digest).then(()=>process.exit(0),()=>process.exit(1));
````

- [ ] **Step 2: The smoke**

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
import { createHash } from 'node:crypto';
import { existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
````

with:

````ts
import { createHash } from 'node:crypto';
import { copyFileSync,existsSync,mkdtempSync,mkdirSync,readdirSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
const pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
type Owned={child:ChildProcess,pid:number,exited:boolean,exitCode:number|null,done:Promise<void>,kind:'preparation'|'host'|'guest',request?:(command:string,data?:object)=>Promise<any>,cleanup?:any};
async function main() {
````

with:

````ts
const pause=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
/** The duel smoke's forced-end test seed (duel-app-smoke.ts DUEL_TEST_SEED; importing that file would run it). */
const DUEL_TEST_SEED=2277;
/** Two machines: how long one machine waits for the other (a room code in the guest's file, the guest in the host's lobby). */
const CODE_WAIT_MS=90000;
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
type Owned={child:ChildProcess,pid:number,exited:boolean,exitCode:number|null,done:Promise<void>,kind:'preparation'|'host'|'guest'|'duel-host'|'duel-guest',request?:(command:string,data?:object)=>Promise<any>,cleanup?:any};
async function main() {
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
  const allowed=['--service-origin','--force-relay','--report-path','--candidate-manifest','--role','--machine-label','--network-label','--capture-after-ms','--local-verification','--local-delayed-shutdown','--inject-preparation-read-failure','--inject-preparation-timeout','--inject-cleanup-stop-failure'];
````

with:

````ts
  const allowed=['--service-origin','--force-relay','--report-path','--candidate-manifest','--role','--machine-label','--network-label','--capture-after-ms','--join-code-file','--local-verification','--local-delayed-shutdown','--inject-preparation-read-failure','--inject-preparation-timeout','--inject-cleanup-stop-failure'];
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
  if(role&&!['host','guest'].includes(role)||![machineLabel,networkLabel].every(s=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s))||manual&&(!args.has('--machine-label')||!args.has('--network-label')))throw Error('arguments-invalid');
  const captureAfter=Number(args.get('--capture-after-ms')??180000);
  if(!Number.isSafeInteger(captureAfter)||captureAfter<30000||captureAfter>540000)throw Error('arguments-invalid');
````

with:

````ts
  if(role&&!['host','guest'].includes(role)||![machineLabel,networkLabel].every(s=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s))||manual&&(!args.has('--machine-label')||!args.has('--network-label')))throw Error('arguments-invalid');
  // A two-machine guest reads each room code from a file its operator creates, never from the command line or a log.
  const codeFile=args.has('--join-code-file')?resolve(args.get('--join-code-file')!):'';
  if((role==='guest')!==!!codeFile||codeFile&&existsSync(codeFile))throw Error('arguments-invalid');
  // Two machines: the sector run is captured this long after it starts (the duel run comes first).
  const captureAfter=Number(args.get('--capture-after-ms')??180000);
  if(!Number.isSafeInteger(captureAfter)||captureAfter<30000||captureAfter>180000)throw Error('arguments-invalid');
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
  const local=args.has('--local-verification');if(args.has('--local-delayed-shutdown')&&!local)throw Error('arguments-invalid');if(local&&(manual||args.has('--force-relay')))throw Error('arguments-invalid');
  const began=performance.now(),budgetMs=injected?20000:manual?captureAfter+30000:90000,deadline=createLauncherDeadline(began+budgetMs);
  const reportPath=resolve(args.get('--report-path')!);mkdirSync(dirname(reportPath),{recursive:true});
````

with:

````ts
  const local=args.has('--local-verification');if(args.has('--local-delayed-shutdown')&&!local)throw Error('arguments-invalid');if(local&&(manual||args.has('--force-relay')))throw Error('arguments-invalid');
  const began=performance.now(),budgetMs=injected?20000:manual?600000:180000,deadline=createLauncherDeadline(began+budgetMs);
  const reportPath=resolve(args.get('--report-path')!);mkdirSync(dirname(reportPath),{recursive:true});
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
  }
  async function until(read:()=>Promise<any>,accept:(value:any)=>boolean) {
    const end=Math.min(performance.now()+15000,began+budgetMs-10000);
    while(performance.now()<end){const result=await read();if(accept(result))return result;await pause(60);}throw Error('driver-timeout');
  }
  async function launch(kind:'host'|'guest') {
    if(typeof electron!=='string')throw Error('native-failed');
    const env={...process.env,FTLITE_SERVICE_URL:config.enabled?config.baseUrl:'',NODE_PATH:resolve('node_modules')};
    for(const key of ['FTLITE_LOCAL_SERVICE_URL','FTLITE_PACKAGED_SERVICE_ORIGIN','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','CHROME_CRASHPAD_PIPE_NAME'])delete (env as NodeJS.ProcessEnv)[key];
    if(local){delete (env as NodeJS.ProcessEnv).FTLITE_SERVICE_URL;(env as NodeJS.ProcessEnv).FTLITE_LOCAL_SERVICE_URL=runtime!.baseUrl;}
    const p=own(electron,[resolve('scripts/network/online-app-smoke.cjs'),`--online-app-dir=${directory}`,`--online-app-role=${kind}`,`--user-data-dir=${join(directory,kind)}`,...(args.has('--force-relay')?['--internet-force-relay']:[])],kind,env);p.child.stdout?.resume();
    let id=0;const pending=new Map<number,{resolve:(v:any)=>void,reject:(e:Error)=>void}>();
````

with:

````ts
  }
  async function until(read:()=>Promise<any>,accept:(value:any)=>boolean,ms=15000) {
    const end=Math.min(performance.now()+ms,began+budgetMs-10000);
    while(performance.now()<end){const result=await read();if(accept(result))return result;await pause(60);}throw Error('driver-timeout');
  }
  // The sector run uses the test-only sector entry (H-2 spec §10); the duel run the real menu with the forced-end test seed.
  async function launch(kind:'host'|'guest'|'duel-host'|'duel-guest',dir=directory) {
    if(typeof electron!=='string')throw Error('native-failed');
    const role=kind.replace('duel-',''),duel=kind!==role;
    const env={...process.env,FTLITE_SERVICE_URL:config.enabled?config.baseUrl:'',NODE_PATH:resolve('node_modules'),...(duel?{FTLITE_DUEL_TEST_SEED:String(DUEL_TEST_SEED)}:{FTLITE_SECTOR_ONLINE_TEST:'1'})};
    for(const key of ['FTLITE_LOCAL_SERVICE_URL','FTLITE_PACKAGED_SERVICE_ORIGIN','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','CHROME_CRASHPAD_PIPE_NAME',duel?'FTLITE_SECTOR_ONLINE_TEST':'FTLITE_DUEL_TEST_SEED'])delete (env as NodeJS.ProcessEnv)[key];
    if(local){delete (env as NodeJS.ProcessEnv).FTLITE_SERVICE_URL;(env as NodeJS.ProcessEnv).FTLITE_LOCAL_SERVICE_URL=runtime!.baseUrl;}
    const p=own(electron,[resolve('scripts/network/online-app-smoke.cjs'),`--online-app-dir=${dir}`,`--online-app-role=${role}`,`--user-data-dir=${join(dir,role)}`,...(args.has('--force-relay')?['--internet-force-relay']:[])],kind,env);p.child.stdout?.resume();
    let id=0;const pending=new Map<number,{resolve:(v:any)=>void,reject:(e:Error)=>void}>();
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
  }
  try {
````

with:

````ts
  }
  /** The duel run (H-2 spec §10, H-2b): through the real menu, round 1 is the test seed's forced end (each player only
   *  stands up and sits down again, X then E, so both records carry command samples; nobody flies or fires), and Enter
   *  starts round 2 on both; the Helm (the host) thrusts and the speed rises on both; Weapons (the guest) fires and a
   *  beam shows on both; both agree on a hash; both machines write round 1's playtest record, copied beside the report;
   *  then both apps shut down. Returns the duel evidence the report validates. */
  const latest=(v:any)=>v.observations.at(-1)?.publications.at(-1);
  const hold=async(p:Owned,key:string,ms:number)=>{await p.request!('key',{key,down:true});await pause(ms);await p.request!('key',{key,down:false});};
  const standUp=async(p:Owned,seat:number)=>{await hold(p,'X',120);
    await until(()=>p.request!('status'),v=>v.observations.at(-1)?.results.some((x:any)=>x.status==='applied'&&x.id.player===seat&&x.id.sequence>1));await hold(p,'E',120);};
  const duelFiles=(dir:string,role:string)=>{const from=join(dir,role,'playtest');return existsSync(from)?readdirSync(from).filter(f=>/^duel-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).map(f=>join(from,f)):[];};
  const duelLines=(dir:string,role:string)=>duelFiles(dir,role).flatMap(f=>readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
  const sampled=(r:any)=>r.round===0&&r.latency.held.count+r.latency.command.count>0;
  const record=(r:any)=>({role:r.role,round:r.round,transport:r.transport,rttMs:r.latency.rttMs,held:r.latency.held.count,command:r.latency.command.count});
  const copies=join(dirname(reportPath),`${basename(reportPath,'.json')}-duel-records`);
  async function duelRun() {
    const dir=join(directory,'duel');mkdirSync(dir);
    await preparation(process.execPath,['--import','tsx',resolve('scripts/network/internet-observer-worker.ts'),dir,identity.digest,'duel']);
    const host=await launch('duel-host',dir),guest=await launch('duel-guest',dir);
    const both=async()=>[latest(await host.request!('status')),latest(await guest.request!('status'))];
    await host.request!('open-multiplayer');await click(host,'host');await click(host,'create-room');const lobby=await phase(host,'lobby');
    await guest.request!('open-multiplayer');await click(guest,'join');await guest.request!('type',{id:'join-code',text:lobby.status.snapshot.joinCode});await click(guest,'join-room');await phase(guest,'lobby');
    await click(host,'ready');await click(guest,'ready');await until(()=>host.request!('status'),v=>v.status.actions.includes('start'));await click(host,'start');
    await phase(host,'running');await phase(guest,'running');
    await standUp(host,0);await standUp(guest,1);
    const decided=await until(both,([a,b])=>a?.outcome>0&&b?.outcome>0,45000);
    await hold(host,'Return',120);
    await until(both,([a,b])=>a?.round===1&&b?.round===1&&a.outcome===0);
    const before=latest(await host.request!('status')).speed;
    await hold(host,'W',2000);
    const fast=await until(both,([a,b])=>a.speed>before+1&&b.speed>before+1);
    const shots=latest(await host.request!('status')).shots;
    await hold(guest,'Space',4500);   // a full charge takes 4 s
    const fired=await until(both,([a,b])=>a.shots>shots&&b.shots>shots);
    const agreement=await until(async()=>{const [a,b]=[await host.request!('status'),await guest.request!('status')];const hp=a.observations.at(-1).publications;
      return b.observations.at(-1).publications.findLast((p:any)=>hp.some((q:any)=>q.sequence===p.sequence&&q.hash===p.hash&&q.tick===p.tick));},v=>!!v);
    const records=await until(async()=>[duelLines(dir,'host'),duelLines(dir,'guest')],([h,g])=>h.some(sampled)&&g.some(sampled));
    rmSync(copies,{recursive:true,force:true});
    for(const role of ['host','guest']){mkdirSync(join(copies,role),{recursive:true});for(const f of duelFiles(dir,role))copyFileSync(f,join(copies,role,basename(f)));}
    await Promise.all([host,guest].map(async p=>{p.cleanup=await p.request!('shutdown');await deadline.wait(p.done,'cleanup-timeout',7000);}));
    return {seed:decided[0].seed,decidedTick:decided[0].tick,thrust:{before,host:fast[0].speed,guest:fast[1].speed},beam:{before:shots,host:fired[0].shots,guest:fired[1].shots},
      agreement:{tick:agreement.tick,sequence:agreement.sequence,hash:agreement.hash},records:[record(records[0].find(sampled)),record(records[1].find(sampled))],
      cleanup:[host,guest].map(p=>({pid:p.pid,exited:p.exited,exitCode:p.exitCode,...p.cleanup}))};
  }
  /** A two-machine guest's room code: from the operator's file (accepting `ROOM ` and lower case), which is then deleted
   *  so the next code can go in it. The code stays in memory: it is never printed, logged or written to the report. */
  async function readCode():Promise<string> {
    const code=await until(async()=>{try{return readFileSync(codeFile,'utf8').trim().toUpperCase().replace(/^ROOM\s+/,'');}catch{return '';}},c=>/^[0-9A-Z]{8}$/.test(c),CODE_WAIT_MS);
    rmSync(codeFile,{force:true});return code;
  }
  /** One machine of the two-machine duel, the same steps as duelRun on this machine only: the host's lobby shows the
   *  room code on screen, and the guest joins with the code from its file. Round 1 is the forced end (X, then E); the
   *  host presses Enter; in round 2 the host (the Helm) thrusts and the guest (Weapons) fires, and each screen shows
   *  both. This machine's round-1 record is copied beside the report, then the app shuts down. */
  async function deviceDuelRun(kind:'host'|'guest') {
    const dir=join(directory,'duel'),seat=kind==='host'?0:1;mkdirSync(dir);
    await preparation(process.execPath,['--import','tsx',resolve('scripts/network/internet-observer-worker.ts'),dir,identity.digest,'duel']);
    const app=await launch(kind==='host'?'duel-host':'duel-guest',dir),now=async()=>latest(await app.request!('status'));
    await app.request!('open-multiplayer');
    if(kind==='host'){await click(app,'host');await click(app,'create-room');await phase(app,'lobby');console.log('Duel lobby open: give the guest operator the ROOM code shown in this app. Keep off the keyboard until the sector run starts.');}
    else {console.log(`Save the host's duel ROOM code in ${codeFile}. Keep off the keyboard until the sector run starts.`);await click(app,'join');await app.request!('type',{id:'join-code',text:await readCode()});await click(app,'join-room');await phase(app,'lobby');}
    await click(app,'ready');
    if(kind==='host'){await until(()=>app.request!('status'),v=>v.status.actions.includes('start'),CODE_WAIT_MS);await click(app,'start');}
    await until(()=>app.request!('status'),v=>v.status.phase==='running',30000);
    await standUp(app,seat);
    const decided=await until(now,p=>p?.outcome>0,60000);
    if(kind==='host')await hold(app,'Return',120);
    await until(now,p=>p?.round===1&&p.outcome===0,30000);
    const start=await now(),before=start.speed,shots=start.shots;
    if(kind==='host'){await pause(1500);await hold(app,'W',2000);}else await hold(app,'Space',4500);   // a full charge takes 4 s
    const seen=await until(()=>app.request!('status'),v=>{const ps=v.observations.at(-1).publications.filter((p:any)=>p.round===1);return ps.some((p:any)=>p.speed>before+1)&&ps.at(-1)?.shots>shots;},20000);
    const round2=seen.observations.at(-1).publications.filter((p:any)=>p.round===1);
    const records=await until(async()=>duelLines(dir,kind),list=>list.some(sampled));
    rmSync(copies,{recursive:true,force:true});mkdirSync(join(copies,kind),{recursive:true});for(const f of duelFiles(dir,kind))copyFileSync(f,join(copies,kind,basename(f)));
    app.cleanup=await app.request!('shutdown');await deadline.wait(app.done,'cleanup-timeout',7000);
    return {seed:decided.seed,decidedTick:decided.tick,thrust:{before,peak:Math.max(...round2.map((p:any)=>p.speed))},beam:{before:shots,after:round2.at(-1).shots},
      record:record(records.find(sampled)),cleanup:{pid:app.pid,exited:app.exited,exitCode:app.exitCode,...app.cleanup}};
  }
  let duel:Awaited<ReturnType<typeof duelRun>>|undefined,deviceDuel:Awaited<ReturnType<typeof deviceDuelRun>>|undefined;
  try {
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
    if(manual) {
      const app=await launch(role as 'host'|'guest');console.log('Use ordinary Host/Join/Ready/Start; both players issue gameplay commands, then leave the game paused for capture.');
      await deadline.wait(pause(Math.max(0,began+captureAfter-performance.now())),'driver-timeout',10000);
      await phase(app,'paused');peers.push(await capture(app));
````

with:

````ts
    if(manual) {
      // Two machines: this machine's half of the duel through the real menu, then the sector through the test-only entry.
      const kind=role as 'host'|'guest';deviceDuel=await deviceDuelRun(kind);
      const app=await launch(kind);
      if(kind==='host'){await app.request!('host-sector',{capacity:2});await phase(app,'lobby');console.log('Sector lobby open: give the guest operator the new ROOM code shown in this app.');}
      else {console.log(`Save the host's new sector ROOM code in ${codeFile}.`);await app.request!('join-sector',{code:await readCode()});await phase(app,'lobby');}
      await click(app,'ready');
      if(kind==='host'){await until(()=>app.request!('status'),v=>v.status.actions.includes('start'),CODE_WAIT_MS);await click(app,'start');}
      await until(()=>app.request!('status'),v=>v.status.phase==='running',30000);
      console.log('Sector run started: both players issue gameplay commands, pause and resume once, then leave the game paused for capture.');
      await deadline.wait(pause(captureAfter),'driver-timeout',10000);
      await phase(app,'paused');peers.push(await capture(app));
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
    } else {
      const host=await launch('host'),guest=await launch('guest');await host.request!('open-multiplayer');await click(host,'host');await click(host,'create-room');const lobby=await phase(host,'lobby');
      await guest.request!('open-multiplayer');await click(guest,'join');await guest.request!('type',{id:'join-code',text:lobby.status.snapshot.joinCode});await click(guest,'join-room');await phase(guest,'lobby');
      await click(host,'ready');await click(guest,'ready');await until(()=>host.request!('status'),v=>v.status.actions.includes('start'));await click(host,'start');await phase(guest,'running');
````

with:

````ts
    } else {
      duel=await duelRun();
      const host=await launch('host'),guest=await launch('guest');await host.request!('host-sector',{capacity:2});const lobby=await phase(host,'lobby');
      await guest.request!('join-sector',{code:lobby.status.snapshot.joinCode});await phase(guest,'lobby');
      await click(host,'ready');await click(guest,'ready');await until(()=>host.request!('status'),v=>v.status.actions.includes('start'));await click(host,'start');await phase(guest,'running');
````

In `scripts/network/internet-app-smoke.ts`, replace:

````ts
  if(cleanupFailed)failure??='cleanup-failed';
  const report={version:1,identity,serviceOrigin:local?runtime?.baseUrl??'http://127.0.0.1:1':config.baseUrl,forceRelay:args.has('--force-relay'),mode:manual?'single-device':'local-pair',machineLabel,networkLabel,failure,cleanupFailed,temporaryRemoved:!existsSync(directory),directoryCleanupAttempted,elapsedMs:Math.round(performance.now()-began),budgetMs,processes:owned.filter(p=>p.kind==='preparation').map(p=>({pid:p.pid,exited:p.exited,exitCode:p.exitCode,kind:p.kind})),peers};
  if(!failure)try{if(local){validateLocalInternetDriverRun(report);if(!runtime?.exited()||!runtime.observation().exited||runtime.observation().exitCode!==0)throw Error('runtime-cleanup-failed');}else validateInternetRun(report);}catch{report.failure='internet-evidence-invalid';}
````

with:

````ts
  if(cleanupFailed)failure??='cleanup-failed';
  const report={version:1,identity,serviceOrigin:local?runtime?.baseUrl??'http://127.0.0.1:1':config.baseUrl,forceRelay:args.has('--force-relay'),mode:manual?'single-device':'local-pair',machineLabel,networkLabel,failure,cleanupFailed,temporaryRemoved:!existsSync(directory),directoryCleanupAttempted,elapsedMs:Math.round(performance.now()-began),budgetMs,processes:owned.filter(p=>p.kind==='preparation').map(p=>({pid:p.pid,exited:p.exited,exitCode:p.exitCode,kind:p.kind})),peers,...(duel?{duel}:{}),...(deviceDuel?{deviceDuel}:{})};
  if(!failure)try{if(local){validateLocalInternetDriverRun(report);if(!runtime?.exited()||!runtime.observation().exited||runtime.observation().exitCode!==0)throw Error('runtime-cleanup-failed');}else validateInternetRun(report);}catch{report.failure='internet-evidence-invalid';}
````

- [ ] **Step 3: Run the smoke's own tests and the typecheck**

In `tests/internetAppSmoke.test.ts`, replace (the file's last line):

````ts
},12000);
````

with:

````ts
},12000);
it.each([['a two-machine guest without a join-code file',['--role=guest']],['a join-code file off the guest',['--role=host','--join-code-file=join-code.txt']]])('refuses %s before any work or report',async(_name,extra)=>{
  const directory=mkdtempSync(join(tmpdir(),'ftlite-internet-test-')),report=join(directory,'report.json');const deadline=createLauncherDeadline(performance.now()+10000);
  const child=spawn(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),'scripts/network/internet-app-smoke.ts','--service-origin=https://service.example','--machine-label=device-a','--network-label=network-a',...extra,`--report-path=${report}`],{windowsHide:true,stdio:'ignore'});
  try{expect(await deadline.wait(new Promise(done=>child.once('exit',done)),'test-timeout',3000)).toBe(1);expect(existsSync(report)).toBe(false);
  }finally{await stopOwnedProcess(child,deadline);const target=resolve(directory);if(!target.startsWith(resolve(tmpdir())+sep)||!target.includes('ftlite-internet-test-'))throw Error('test-cleanup-invalid');rmSync(target,{recursive:true,force:true});}
},12000);
````

Run: `npx vitest run tests/internetAppSmoke.test.ts`
Expected: PASS, 7 tests (the bounded preparation faults and the origin mismatch still fail before any native launch; a guest without a join-code file, and a join-code file on the host, are refused before any work).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```
git add scripts/network/online-observer-build.ts scripts/network/internet-observer-worker.ts scripts/network/internet-app-smoke.ts tests/internetAppSmoke.test.ts
git commit -m "H-2b-ii task 2: the internet smoke's duel through the real menu and its sector on the test-only entry, for the local pair and two machines"
```

---

### Task 3: The candidate, its manifest and the local verification

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md`
- Build output (git-ignored): `services/signalling/dist/`, `out/`, `dist/h2b-candidate/`, `dist/h2b-candidate.zip`, `dist/h2b-candidate/candidate.json`

- [ ] **Step 1: The gates subsection, committed first** (the candidate's source revision must contain every file the smoke checks)

Append the subsection at the end of `docs/gates.md` (the replaced block is the "Helm demo" table's last line):

In `docs/gates.md`, replace:

````md
| none yet | | | | | | | |
````

with:

````md
| none yet | | | | | | | |

### The internet candidate for SIM 39 (H-2b-ii)

- **The candidate.** Build `out/` with the packaged origin `https://ftlite-signalling-dev.gprout009.workers.dev`, package `dist/h2b-candidate/win-unpacked`, zip it to `dist/h2b-candidate.zip`, then write `dist/h2b-candidate/candidate.json` with `scripts/network/candidate-manifest.ts`. Its identity reads `sim: 39`, from `SIM_VERSION`. Only `out/main`, `out/preload` and `out/renderer` are packaged, so smoke evidence under `out/` never enters a candidate. The worker bundle is `npm run build:signalling` (a Wrangler dry run, no deploy).
- **The internet smoke** (`npm run test:internet-app-runtime`) first runs a duel pair through the real menu:
  - the test seed's forced round end (each player stands up and sits down, X then E), then Enter;
  - the Helm's thrust and Weapons' beam seen on both, and hash agreement;
  - each machine's round-1 record, with latency samples, copied to `<report>-duel-records/`.

  It then runs its sector pair through the test-only sector entry (`host-sector`, `join-sector` and `FTLITE_SECTOR_ONLINE_TEST=1`). A local pair's report must carry the duel evidence. The host's record reads loopback; the guest's carries an RTT and reads `lan` or `internet`, and must read `internet` under `--force-relay`.
- **Two machines** (`--role=host|guest`) run the same two parts, one machine each: the duel through the real menu, then the sector through the test-only entry, captured `--capture-after-ms` (at most 180 s) after the sector run starts. The host's lobby shows each room code on screen; the guest's operator saves it in the file named by `--join-code-file`, which the guest reads and deletes. No room code is printed, logged or reported. Each single-device report carries its machine's `deviceDuel`, and the pair's duel seeds must match.
- **Proven before the redeploy:** `--local-verification` against local workerd, with the candidate manifest, and the playtest report on its duel records.
- **Owner-only, after the redeploy** of exactly the manifest's worker bundle:
  - the same command without `--local-verification` against the deployed service, then again with `--force-relay` (TURN);
  - the two-machine single-device runs;
  - the LAN and internet checklists and the §16 sessions above.
````

In `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md`, replace:

````md
--capture-after-ms=180000 --candidate-manifest=PATH/manifest.json --report-path=PATH/device-b.json
````

with:

````md
--capture-after-ms=180000 --join-code-file=PATH/join-code.txt --candidate-manifest=PATH/manifest.json --report-path=PATH/device-b.json
````

In `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md`, replace:

````md
Coordinate starts. Use ordinary Host/Create, Join/code, Ready and Start. Both humans move and issue a gameplay command; both pause and explicitly resume at least once.
````

with:

````md
Coordinate starts. Since H-2b-ii each machine runs two parts, and `PATH/join-code.txt` must not exist when the guest starts. First the duel, through the ordinary menu, driven by the harness: keep off the keyboard. The host's lobby shows `ROOM` and a code; its operator passes the code to the guest's operator, who saves it in `PATH/join-code.txt` (the guest reads the file and deletes it; no code is printed, logged or reported). The harness readies both, starts, plays the test seed's forced first round and a second round (the host thrusts, the guest fires), and closes the app. Then the sector, through the test-only sector entry: the host's new lobby shows a new code, saved the same way. Once the sector run starts, both humans move and issue a gameplay command; both pause and explicitly resume at least once.
````

The rest of that paragraph stays as it is ("End paused before the three-minute capture" now counts from the start of the sector run, since `--capture-after-ms` does, at most 180 s).

```
git add docs/gates.md docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md
git commit -m "H-2b-ii task 3: the internet candidate's gates subsection and the two-machine procedure"
```

- [ ] **Step 2: The worker bundle (a Wrangler dry run; nothing is deployed)**

Run: `npm run build:signalling`
Expected: exit 0, ending `--dry-run: exiting now.`; `services/signalling/dist/index.js` exists.

- [ ] **Step 3: The origin-embedded build and the unsigned package (PowerShell)**

```powershell
$env:FTLITE_PACKAGED_SERVICE_ORIGIN='https://ftlite-signalling-dev.gprout009.workers.dev'
npm run build
Remove-Item Env:FTLITE_PACKAGED_SERVICE_ORIGIN
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win --dir --publish never -c.win.signAndEditExecutable=false -c.directories.output=dist/h2b-candidate
Remove-Item Env:CSC_IDENTITY_AUTO_DISCOVERY
Compress-Archive -Path dist\h2b-candidate\win-unpacked\* -DestinationPath dist\h2b-candidate.zip -Force
```

Expected: each command exits 0. `out/main/index.js` contains the origin once. `dist/h2b-candidate/win-unpacked/FTLite.exe` exists, and `dist/h2b-candidate.zip` is about 145 MB.

- [ ] **Step 4: The candidate manifest (a local, read-only audit)**

Run: `npx tsx scripts/network/candidate-manifest.ts --package-path=dist/h2b-candidate.zip --app-directory=dist/h2b-candidate/win-unpacked --output=dist/h2b-candidate/candidate.json`
Expected: `Candidate package audit PASS: exact out bytes, no env, test profiles or evidence.`, exit 0. The manifest's `identity.versions` reads `sim: 39`, with 47 artifacts under `out/main`, `out/preload` and `out/renderer`.

- [ ] **Step 5: The internet smoke against local workerd (proven before the redeploy)**

Run: `npm run test:internet-app-runtime -- --service-origin=https://ftlite-signalling-dev.gprout009.workers.dev --candidate-manifest=dist/h2b-candidate/candidate.json --report-path=out/h2b-internet/local.json --local-verification`
Expected: `Actual-app evidence PASS; this invocation does not assert internet readiness or physical separation.`, exit 0, in about 55 s.
- `out/h2b-internet/local.json` has `failure: null`.
- Its `duel.records` read `loopback` for the host and `lan` for the guest, each with an `rttMs`.
- `out/h2b-internet/local-duel-records/host/` and `guest/` each hold one `duel-YYYY-MM-DD.jsonl`.

Run: `npx tsx scripts/duel-playtest-report.ts out/h2b-internet/local-duel-records/host out/h2b-internet/local-duel-records/guest`
Expected: exit 0, with `2 file(s), 2 valid record(s), 0 invalid line(s) skipped.` and the room `| seed-2277 | lan | 0 | 1 | 1 |`. The host is at the Helm in this run: `host | Helm | loopback`, `guest | Weapons | lan`.

---

### Task 4: The gates

**Files:** none (evidence under `out/`).

- [ ] **Step 1: The full suite and the typecheck**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test`
Expected: PASS, 265 test files, 3,878 tests (known load flakes: rerun alone).

- [ ] **Step 2: The native gates (on the Task 3 build)**

Run: `npm run test:host-runtime`
Expected: `ACTUAL host runtime PASS: Electron 37.10.3; 15 checks; 8/8 utility exits; ...`, exit 0. This command rebuilds `out/` without the origin, so run it after Task 3 Step 5. If the candidate smoke must run again, repeat Task 3 Step 3's build first.

Run: `npm run test:online-app-runtime -- --report-path=out/h2b-online-app/online-app.json`
Expected: `ACTUAL TWO-PROCESS ONLINE APPLICATION PASS`, exit 0.

Run: `npm run test:duel-app-runtime -- --report-path=out/h2b-duel-app/duel-app.json`
Expected: `ACTUAL TWO-PROCESS DUEL APPLICATION PASS (<ms> ms)`, exit 0.

Run: `npm run test:determinism -- --output-dir=out/h2b-determinism`
Expected: three PASS lines (Node, Electron, Firefox), exit 0.

## After H-2b-ii (owner-only)

1. **Redeploy** the worker bundle the manifest names (`services/signalling/dist/index.js` and `wrangler.jsonc`; their hashes are `identity.workerBundleSha256` and `workerConfigSha256`), following the Net-3e release document's deployment section. Record the deployed version id.
2. **The deployed runs.** Run Task 3 Step 5's command without `--local-verification` (the deployed service), then with `--force-relay` in place of `--local-verification` (TURN; the guest's duel records must read `internet`). Use new `--report-path` values.
3. **The two-machine runs:** `--role=host` or `--role=guest` with `--machine-label` and `--network-label` on each PC (and `--join-code-file` on the guest), per `docs/superpowers/prompts/2026-11-15-net-3e-two-machine-playtest.md` as Task 3 Step 1 updates it. Each machine's duel records are copied to `<report>-duel-records/<role>/`.
4. **The checklists and sessions.** Install `dist/h2b-candidate.zip` on both PCs. Run the LAN and internet checklists (H-2 spec §10), each with a guest-Helm round, then the §16 sessions. Afterwards, run `scripts/duel-playtest-report.ts` on both PCs' `userData/playtest/` folders with a filled `checklist.json`, and paste the output into `docs/gates.md` "Helm demo" and a report under `reports/`.
5. If §9's fallback checks trip, H-2c starts.
