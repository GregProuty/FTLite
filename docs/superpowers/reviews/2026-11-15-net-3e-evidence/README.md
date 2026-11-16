# Net-3e external verification

User authorized deployment and verification with “ok lets deploy and verify”. The reviewed Worker was deployed on 2026-11-16 UTC (2026-11-15 local time) using pinned Wrangler 4.156.0 and the exact prepared entry/config with `--no-bundle`.

## Observed results

- OAuth account ID matches the approved account. No existing Worker or deployment was present (API code 10007); no prior cloud rollback version exists.
- Intended URL confirmed: `https://ftlite-signalling-dev.gprout009.workers.dev`.
- Exact bundle SHA-256: `fda351cb27f57961b61616324012f1d33969226b5356d51d8ad2749dc657eb33`.
- Exact config SHA-256: `b9faa6b032720827399ddac179f1fe4021f33a6ee9c0a21d5420cac93a3212bc`.
- Initial deployed version: `c0a47252-9465-4325-9397-e1adb99713b5`.
- Provisioned `IP_HASH_SALT` from 32 cryptographically random bytes and `ALLOWED_ORIGINS` as `null`, directly through Wrangler secret bulk stdin. Values were never printed or retained. Absent/null Origin handling and bearer authorization remain unchanged.
- Current version after all four secrets: `2e51684e-42d4-4ba2-9897-08577653135f`; current deployment ID is retained in `deployment.json`. Secret provisioning creates a new version; it does not change the reviewed bundle.
- Real HTTP create/join/socket-ticket requests returned 200. Host and guest received distinct seats; private responses used `no-store`. An unauthenticated checkpoint read returned 401 `unauthorized`. Tokens, ticket values, room identifiers and join codes were kept in process memory only. The unused test lobby follows existing expiration rules.

See `deployment.json`, `deploy.log` and `http-admission.json`. No billing, DNS, plan or quota changes, merge, push, or gameplay build changes occurred.

## Native gameplay results

The user explicitly authorized a local script to transfer only `TURN_TOKEN_ID` and `API_TOKEN` from the owner's root `.env` directly to Cloudflare as `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`, without printing or copying values. That narrowly scoped transfer succeeded through Wrangler secret bulk stdin. No secret file was created, no values entered chat/evidence or the app package, and all four required Worker secret names are provisioned.

Both commands used the reviewed candidate manifest and unchanged production app bytes:

```powershell
npx tsx scripts/network/internet-app-smoke.ts --service-origin=https://ftlite-signalling-dev.gprout009.workers.dev --candidate-manifest=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence/candidate.json --report-path=docs/superpowers/reviews/2026-11-15-net-3e-evidence/internet-normal.json
npx tsx scripts/network/internet-app-smoke.ts --service-origin=https://ftlite-signalling-dev.gprout009.workers.dev --force-relay --candidate-manifest=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence/candidate.json --report-path=docs/superpowers/reviews/2026-11-15-net-3e-evidence/internet-relay.json
npx tsx docs/superpowers/reviews/2026-11-15-net-3e-evidence/verify.ts
```

- Ordinary routing: **PASS**, 15,746ms. Two actual Electron apps used the deployed HTTPS service, selected host-to-host routes, exchanged gameplay commands, paused/resumed, and agreed on canonical state and checkpoint sequence 6 at tick 409.
- Forced relay: **PASS**, 15,676ms. Both native connections selected `relay` local and remote candidates under `relay` policy, exchanged data in both directions, applied gameplay commands, and agreed on checkpoint sequence 6 at tick 414. This is actual selected-route gameplay proof, not merely TURN HTTP success.
- Both runs observed full-state ACK before input and exact owned-process/window/port/listener/utility/native-peer cleanup; temporary directories were removed. Reports and screenshots are retained alongside command output.
- Strict aggregate validation: **PASS**. `readiness.json` binds the candidate runtime/source, Worker hashes, service origin, current deployment version and exact report hashes. Local recovery, deployedService and forcedRelayGameplay are PASS. TwoMachineGameplay and actualOsSuspend remain NOT_RUN; `internetReady` is false.

## Remaining limits and playtest package

Both automated runs used two app processes on one physical computer. The owner confirmed no second computer is available now and requested the available automated checks plus the test package. No physical-network attestation is fabricated. Deployed host-death/re-host, prolonged credential refresh/expiry, service interruption/network shaping, two physical computers, actual OS sleep, and manual installed-package play remain **NOT_RUN**; local recovery evidence is separate from deployed recovery. The existing bounded internet driver does not implement those longer/operator scenarios. No opportunistic runtime changes were made to extend it during deployment.

Use `dist/net-3e-final-candidate.zip` (SHA-256 `882476a79956a4525aab1d15f115722fab940ebcacc48f7869b4c7aa76e0e5d4`) and [the short playtest guide](../../prompts/2026-11-15-net-3e-player-quickstart.md). The detailed instrumented [two-machine procedure](../../prompts/2026-11-15-net-3e-two-machine-playtest.md) remains the path to admitting that final gate. No further deployment approval is needed merely to resume this already authorized verification.

The first deployment cannot be rolled back to a nonexistent prior Worker. The reviewed default-disabled application archive remains the application fallback; do not remove Durable Object storage or reverse migrations.
