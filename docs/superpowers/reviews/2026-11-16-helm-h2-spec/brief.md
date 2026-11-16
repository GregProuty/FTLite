## Role
<!-- reuse -->

The subject is the design spec for **H-2, the networked duel**, in FTLite. FTLite is the owner's deterministic TypeScript/Electron/Pixi co-op space game. H-2 runs the gravity-well duel with two machines and one player each, over Net-3. It is the Helm demo the owner then playtests with another person.

H-2 builds on merged work:
- Net-3: WebRTC, Cloudflare signalling and TURN, join codes, recovery and the online sector.
- The engine refactor R-0 to R-2: a generic authority; the duel as a registered Net-3 mode with its own codec, snapshot, checkpoint and replay; N-ship slots; SIM 38.

The spec proposes three milestones:
- **H-2a**, the online duel over loopback and LAN: client codec and validation, a publication cache, seats and swap, the online duel view, an away steward, rematch rounds (SIM 39), telemetry records, tests, and an Electron smoke gate.
- **H-2b**: internet, a telemetry report, and a latency overlay.
- **H-2c**: own-ship prediction, only if the latency criteria trip.

New owner direction from 2026-11-16 applies: no couch co-op, no gamepads (keyboard and mouse only), and a main menu of Single player / Multiplayer (Host, Join) / Settings. The menu is being built separately, before H-2. The spec is written to assume it. Review the spec on its merits.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` at commit `6ec187c`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The Helm demo spec it implements: `docs/superpowers/specs/2026-11-14-helm-demo-design.md`. Read §6-§11 (especially §11b), §13, §15 and §16 (the acceptance checklist and the live telemetry targets).
- The Net-3 specs it reuses: `docs/superpowers/specs/2026-11-15-net-3d-online-sector-design.md` (the template for going online) and `2026-11-15-net-3e-recovery-internet-design.md` (recovery).
- The engine refactor spec: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` (§6, the mode lifecycle).
- The code it cites:
  - `src/network/` and `src/network/modes/{duel,duelStream,encounterMode,streamBinding,sector,sectorStream}.ts`;
  - `src/main/network/`;
  - `src/renderer/src/clientControl/clientRun.ts`;
  - `src/renderer/src/net/{codec,contracts}.ts`;
  - `src/renderer/src/authority/{core,duelRules,duelCheckpoint}.ts`;
  - `src/renderer/src/sim/duel/{state,step,snapshot,summary,telemetry}.ts`;
  - `src/renderer/src/app/duel/`, `src/renderer/src/app/{onlineSession,sessionRouter}.ts`, `src/renderer/src/render/sessionMenu.ts`;
  - `src/utility/authorityModes.ts`.

  The spec cites them as `path:line`.
- The run dir: `docs/superpowers/reviews/2026-11-16-helm-h2-spec/`. It holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal consistency.** Does any section contradict another (goals vs non-goals, the architecture vs the tests, milestones vs scope)?
2. **Completeness.** Are there requirements a planner would need but that the spec leaves undefined (interfaces, data shapes, error behaviour, ordering)?
3. **Feasibility against the codebase.** Does the spec assume an API, schema or behaviour that does not exist, or contradict code it names? Check each cited `path:line`.
4. **Scope.** Is it one coherent deliverable, or should it be split?
5. (Claude) **Determinism and contracts.**
   - The spec adds rematch rounds (SIM 39), `DuelInit.helmPlayer`, a `rematch` command, `round` events, and duel mode `schemaVersion` 1→2. Are these designed consistently with the merged duel snapshot, checkpoint and codec, the replay format, and the bless guard? The guard now requires both trace baselines, recorded before a bump, and ties them to the stored goldens.
   - Does each change keep the sector and Net-3 unchanged?
6. (Claude) **The online client (gap a).** Is the design for passing the mode's codec and publication validator into `createClientRun` complete and backwards-compatible for the sector client? Check where the client is constructed today.
7. (Claude) **Recovery and presence.** Does the away steward, pause on guest loss, and reconnect via Net-3e actually fit how `encounterMode.ts` and the core handle attach, replace and lease? Is there any state a reconnecting duel client would miss?
8. (Claude) **Views without per-tick events.** Deriving laser and missile effects from snapshot counters instead of events: is it sound? Could the remote screen miss or double an effect when publications are skipped or deltas dropped?
9. (Claude) **Latency and acceptance.**
   - Is the latency measurement concrete and computable from what exists (`heldHighWater` / `commandHighWater`)?
   - Are the prediction thresholds measurable?
   - Does the acceptance map to Helm §16?
   - Is the owner-only boundary explicit: redeploy, LAN and internet playtests?
10. (Claude) **The new menu direction.** Is it applied consistently: keyboard and mouse only, Multiplayer → Host/Join starting the duel, no couch play?

## Reading manifest

- `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` (the whole file; 197 long lines)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md`: §11 (L245-L262), §15-§16 (L298-L321)
- `docs/superpowers/specs/2026-11-15-net-3d-online-sector-design.md`: skim the architecture and the client sections
- Every `path:line` the spec cites: verify each one

Read by range, not whole files, except the subject. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the only tools. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- One player per machine. PvP is out of scope. LAN first, then internet.
- The owner's two-human playtest is the gameplay gate and is owner-only, as are the redeploy and any credentials.
- No couch co-op, no gamepads (keyboard and mouse only). The main menu is Single player / Multiplayer (Host, Join) / Settings.
- The refactor plugs into Net-3's mode layer. The sector and Net-3 behaviour must be unchanged. Determinism rules apply to the guarded roots.

## Output format (strict)
<!-- reuse -->

Your final message is validated against a JSON Schema; it must be a single JSON object and nothing else:

```
{ "verdict":      "changes requested" | "ready with P2s" | "ready",
  "findings":     [ { "severity": "P0"|"P1"|"P2"|"P3", "title": "<one line>",
                      "claim": "<what is wrong>", "evidence": "<subject L<n>, file:L<n>>",
                      "why": "<why it matters>", "fix": "<concrete fix>" } ],
  "prior":        [ { "id": "R<N>-F<k>", "result": "resolved" | "withdrawn" | "still open",
                      "note": "<for still open: what is still wrong, with new evidence>" } ],
  "verified":     [ "<what you checked and found correct, with citations>" ],
  "not_verified": [ "<what you could not verify and why>" ] }
```

Findings ordered by severity then importance. Do not invent IDs; new findings have no ID (the responder assigns `R<N>-F<k>` in array order). `prior` lists exactly the awaited IDs given to you, once each, and nothing else. In round 1 `prior` is empty.

## Severities
<!-- reuse -->

- **P0**:
  - the design cannot work as written;
  - it would change sector or Net-3 behaviour;
  - it breaks determinism;
  - it violates a fixed decision.
- **P1**:
  - a planner would have to invent a missing interface or behaviour;
  - a cited fact about the code is wrong in a way that changes the design;
  - two sections contradict each other;
  - the acceptance does not test what the Helm spec requires.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
