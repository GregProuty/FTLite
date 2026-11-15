# Net-3a validation

Source: `6d93ea3`, branch `codex/net-3`, based on merged Net-1b/Helm source `3047027`. Windows x64, 2026-11-14. All task reviews and the [whole-branch review](2026-11-14-net-3a-final-review.md) approved the foundation with the performance limitation below; no source fix wave was needed.

## Results

| Check | Result |
|---|---|
| Full suite | 1877 tests / 146 files pass; 57.68s Vitest, 58.523s wall |
| Typecheck | Pass |
| Production build | Pass, included in native gate |
| Native host gate | 15 checks, 8/8 observed utility exits; 7.699s including build |
| Negative native probes | Page exception, child failure, fixed timeout, missing evidence all exit 1; own profiles removed |
| Default acceptance | All 9 original data rows exactly equal; 37.6866s wall |
| Same-machine prior-source acceptance (`03e7954`) | Pass, 39.0599s wall |
| Node 24.18.0 | 1800 samples / 404 result-event boundaries exact; 24.04s |
| Electron 37.10.3 / Chromium 138.0.7204.251 | Same samples/boundaries exact; 23.21s |
| Firefox 160.0 | Same samples/boundaries exact; 24.56s |

Acceptance exceeds the unchanged 30s target and earlier 29.2584s measurement. The prior source also exceeds it under current conditions and takes longer than the new source; this comparison does not establish a code regression. No timing ceiling, expected result, fixture, strategy, gameplay floor or simulation version was changed. SIM_VERSION remains 35 and golden final hash b87a0284.

The actual visible producer stalls for 500.3ms while utility ticks advance 4 -> 24 -> 29. Main captures checkpoints during that stall: held movement has stopped at both roughly 300ms and 390ms, before renderer callbacks resume. Precise 249/250ms watchdog behavior is covered by deterministic tests. Original delayed vote ID2 requested at tick4 executes at tick34; restored fresh producer ID3 executes and held sequence progresses. Actual utility/transport deaths, early cancellation, unsupported mode/content, checkpoint restart and successive-host teardown are checked. Suspend is an injected trusted callback, not an actual OS suspend.

No WebRTC, Cloudflare service, online lobby or two-computer internet session is implemented by this slice. Ordinary couch startup stays unchanged. Net-3b state streaming/WebRTC is next; service deployment and lease fencing remain later slices.

## Implementation decisions and their costs

1. Continue under the existing approved architecture and execution authorization without another approach approval. Cost if wrong: isolated branch rework.
2. Preserve original command bytes for admission/dedup/replay; create a separate effective-tick execution copy for receive-time inputs. Cost: replay v3 must retain the relationship; strict/offline v2 stays unchanged.
3. Use mode-owned latest-stream keys and bounded in-flight ACK accounting; generic transport cannot decode sector input. Cost: every later mode must supply an appropriate key for multi-seat latest streams.
4. Split unstamped HostCommandInput from stamped HostCommand; main owns IDs/generation. Cost: callers must use the input union rather than forwarding arbitrary wire envelopes.
5. Invalid request IDs receive a narrow null-ID protocol error with trusted generation. Cost: main must treat it as protocol failure, never correlate it.
6. Add an optional opaque bounded crash callback. Cost: diagnostics beyond the traversal/size cap become null; full crash data is not a generic renderer API.
7. Place only the transport HTML/import shim inside Vite's renderer root; generic bridge stays under network. Cost: fixed build/dev entry paths must remain synchronized. Actual built and dev smoke cover both.

The task reviews caught and fixed premature optimistic-vote retirement after delayed admission and a native utility leak when Electron kill returned false before spawn. Scoped re-reviews approved both fixes.

8. Accept foundation readiness with an explicitly unmet 30s acceptance timing ceiling: current prior-source measurement is also slower than 30s and no new regression is established. Cost: the timing target remains unresolved; this is not an all-gates-green claim.
9. Accept every declined-to-judge boundary in the final review: later transport/service/UI/lease/Helm slices and unrun hardware/platform/installer checks are not delivered here. Cost: this foundation does not establish internet-demo or installer readiness.
10. Preserve the new branch/worktree for subsequent Net-3 work; the earlier authorized Net-1b merge is already complete and master has advanced independently with Helm. Cost: Net-3a is not yet integrated into current master.

## Evidence and retained work

Raw reports/logs are under `.superpowers/sdd/2026-11-14-net-3a-host-runtime/`, including task-5-logs and final-validation. The cross-engine runner's historical output was copied there; its tracked Net-1b evidence file was restored so old evidence is not silently overwritten.

The isolated benchmark checkout `.worktrees/net3a-perf-baseline` remains at `03e7954` with a dependency junction. Automatic approval review blocked the verified junction removal with no detailed reason; no alternate deletion was attempted. The owner checkout and its concurrent Helm work were not modified by this slice.
