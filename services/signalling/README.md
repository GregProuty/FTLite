# Local signalling service

This service provides room admission, single-use socket tickets, ready/start coordination, RTC signalling, backend leases, opaque checkpoints and TURN credential admission. It does not run gameplay. Protocol 2, SIM_VERSION 35 and the existing gameplay snapshots remain unchanged.

From the repository root, with root dependencies installed:

```powershell
npm --prefix services/signalling ci
npm run test:signalling
npm run typecheck:signalling
npm run build:signalling
npm run test:room-service-runtime
```

The separate service lockfile pins Wrangler 4.156.0, workerd 1.20261023.1, Miniflare 5.20261023.3-beta, Workers types 5.20261029.1 and the Workers Vitest plugin 1.4.11. `build:signalling` is a Wrangler dry run, not deployment. `wrangler.jsonc` declares SQLite Durable Object classes Room and Directory with migration tag `v1`; their idempotent SQL schema initializer requires service schema version 1. Future schema changes require an explicit migration strategy.

The native gate builds production Electron entries, launches actual pinned local workerd on an ephemeral port bound to 127.0.0.1, and uses fresh SQLite storage and an Electron profile under one exact temporary directory. `scripts/local-runtime.ts` uses installed Miniflare's supported V4 option conversion and hibernation operation. Its wrapper adds only a synthetic platform IP and quota salt. The production Worker, Room, Directory, service client, native controllers, authority utility and sector remote client handle all actual operations. The gate reads no local secret configuration, uses empty ICE servers, and never calls a TURN provider. Existing service TURN tests intercept only external provider HTTP using synthetic credentials; they do not replace the Worker/native gate.

The gate requires initial host seat generation 2 and guest generation 1, guest generation 1 on both native identities, independently replaced guest and host sockets, old PC closure, a deliberately delayed first offer, rejected old routes/ticket replay, both native-ready results before service-ready/start commit, and authority creation/attachment after commit. The guest receives a real full/ACK, sends an owned command, and matches the authority publication. Service-generated runId must match authority init/checkpoint and guest publication. Backend lease renewal is explicit harness work; the utility is **not lease-gated**.

After a production build, these commands must exit nonzero:

```powershell
npx tsx scripts/network/room-service-smoke.ts --inject-page-failure
npx tsx scripts/network/room-service-smoke.ts --inject-worker-failure
npx tsx scripts/network/room-service-smoke.ts --inject-timeout
npx tsx scripts/network/room-service-smoke.ts --inject-missing-evidence
```

Normal runs accept `--report-path=PATH`. Completion requires actual native PC closure, utility exit, window/listener/port cleanup, actual Electron and workerd process exits, and removal of that invocation's SQLite/profile directory. Timeouts are 10 seconds for local Worker lifecycle operations, 35 seconds inside Electron and 45 seconds outside; the deliberate timeout uses 4 seconds. Fallback process termination targets only the exact owned child PID/tree. No global process kill is used.

Configured admission defaults are five creates/IP/minute, twenty joins/IP/minute, twenty socket upgrades/IP/minute, 100 charged active rooms, 1,000 stored rooms including retention, and 10,000 live HMAC-IP keys. IP buckets expire after two minutes. TURN admission permits one attempt/minute/reserved seat and 1,000 attempts/UTC day, including uncertain/failed outcomes; current and previous UTC day counters are retained. Accounting failures refuse admission.

Creation reservations expire after 60 seconds; lobby rooms after 30 minutes; active rooms after 24 hours. Lost/ended rooms retain reserved-token checkpoint access for seven days. Socket and RTC tickets and start proposals expire after 30 seconds. Backend host leases last 15 seconds, with renewal expected every five seconds. TURN credentials last 3,600 seconds. Room/Directory persisted deadlines and versioned accounting remain authoritative across alarm delays and hibernation.

Request caps include 8,192-byte small JSON, 98,304-byte WebSocket frames, 65,536 decoded init bytes, 262,144 checkpoint bytes and 4,096 encoded checkpoint metadata bytes. HTTP body work has a five-second deadline. Shared/client/service parsers and retained queues enforce their existing count/byte bounds; checkpoint body admission is two per Room. Service errors use fixed codes with redacted messages and private responses use `no-store`.

Deployment is **NOT RUN**. It requires a separately authorized Cloudflare account/project, appropriate Worker and SQLite DO bindings/migrations, allowed origins, quotas/budget review and server-only configuration. Variable names are `IP_HASH_SALT`, `ALLOWED_ORIGINS`, `TURN_KEY_ID`, and `TURN_KEY_API_TOKEN`. `.dev.vars.example` is intentionally ignored by the repository's `.dev.vars.*` rule and may contain only these names/comments; it is not a committed secret template. No provider credentials are needed for either local gate.

Internet/WAN, forced relay, two physical computers and live TURN remain **NOT RUN**. Net-3d/3e still own online UI, token storage, automatic retry/reconnect/rehost, live mirror orchestration and the utility's request-start-plus-12-second lease gate. This slice is not an online demo. Unchanged acceptance/engine fixtures are not rerun solely for this service gate; the inherited 30-second acceptance timing limitation remains recorded in the root validation documentation.
