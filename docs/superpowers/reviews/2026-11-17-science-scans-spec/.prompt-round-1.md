## Role
<!-- reuse -->

A design spec for a deterministic-sim feature in FTLite (Electron + PixiJS 8 + React/zustand UI overlay + TypeScript, vitest; a lockstep/rollback networked co-op duel): Sci-1, an Artemis-style Science job. The enemy starts unidentified and turns hostile after 20 s (or when ambushed); a derelict contact with loot can be salvaged by flying close and slow; a single ship scanner runs two-level scans started from the Science, Helm or Weapons console (Science faster); Weapons tunes a laser frequency A/B/C against a scanned weak frequency. It changes the sim (SIM_VERSION 43 -> 44). It will become an implementation plan executed by fresh subagents, so every interface it names must exist or be explicitly new, every rule must be unambiguous, deterministic and testable.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-17-science-scans-design.md` at commit `f0b422de`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The enemy ship window spec `docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md` (the contact window this grows), the Artemis consoles spec `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md` (console layout, commands, the SIM_VERSION/golden two-step in its section 5.6), and the Helm demo spec `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (duel rules, hunter, seats).
- `src/renderer/src/sim/tactical/` (state, hunter, weapons, duel step, hash modules, map, tuning), `src/renderer/src/sim/duel/` (state, step, modules, scripted), `src/renderer/src/net/` (contracts, codec), `src/renderer/src/app/duel/` (controls, contactController, input, scene), `src/renderer/src/render/duel/` and `src/renderer/src/render/tactical/` (view models), `src/renderer/src/ui/duel/`, and `tests/` (duelGolden, duelRematchGolden, duelGates).
- The run dir `docs/superpowers/reviews/2026-11-17-science-scans-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. Determinism: every new field must be in a hashed/flattened sim module (tactical hash.ts or duel modules.ts) and reset per round; check the spec says where each lives and that new rng draws in createTacticalState have a fixed order. Is the derelict's closed-form orbit (circularSpeed, angle = phase + omega*tick) computable deterministically with the existing math helpers (no Math.sin drift across machines? check how direction.ts / map.ts avoid it)?
8. Hostility: is 'a crew laser hit or missile landing on the enemy this tick' observable at the spec's step position (events or counters)? Does Patrol (no charge, no launch, shields held) map onto ShipInput (helm/weapons flags) and tickWeapons as they exist? Shields 'start one layer below full and do not recharge' in Patrol: check weapons.ts tickWeapons recharge path.
9. Scan admission: the spec's rejection reason strings ('not-seated', 'invalid-seat', 'not-at-weapons', 'unavailable', 'malformed', 'noop') - which exist in COMMAND_REASONS today? Does the duel step's DUEL_KINDS / codec admit new kinds by listing? Does the sit rule (step.ts allowedSits) and the Hound's console group (science shares a tile with engineering and doors) let a character sit at Science as written?
10. 'designate' as a sim command carrying no rule effect: is that consistent, and is the 'Science only' seat rule right given the solo character switch?
11. The view sections: does T cycling enemy -> derelict -> closed conflict with the enemy window spec's T rules; does 'pickShip extended to the derelict' fit pickShip's signature; is the Science console layout (full-width map, panel always open) consistent with consoleLayout and the contact controller's shown rule (station helm or weapons only today)?
12. Gates: tests/duelGates.test.ts bands (duel length) with up to 20 s of Patrol at the start; the scripted pair (sim/duel/scripted.ts) behaviour unchanged - is the spec clear enough on how the gates are re-baselined?
13. Loot 'Shield' (+1 above class max): check weapons.ts recharge (`if s.shields >= layers`) and any view or invariant that assumes shields <= class layers (snapshot validation, views).

## Reading manifest

- docs/superpowers/specs/2026-11-17-science-scans-design.md:L1-L162 (the subject)
- src/renderer/src/sim/tactical/state.ts:L1-L181; hunter.ts:L1-L99; weapons.ts:L1-L110; duel.ts:L1-L40; hash.ts:L1-L220; map.ts:L1-L132; tuning.ts:L1-L107; direction.ts (grep hx/hy, circularSpeed in map.ts)
- src/renderer/src/sim/duel/state.ts:L1-L93; step.ts:L1-L208; modules.ts:L1-L109; scripted.ts (grep sit, science)
- src/renderer/src/net/contracts.ts:L1-L150 (DuelCommand, COMMAND_REASONS); codec.ts:L1-L256
- src/renderer/src/app/duel/controls.ts:L1-L45; contactController.ts:L1-L78
- src/renderer/src/render/duel/consoleModel.ts:L1-L70; contactModel.ts:L1-L103; consoleLayout.ts:L1-L23; src/renderer/src/render/tactical/tacticalModel.ts (grep pickShip, pickRadius)
- src/renderer/src/sim/ship/hound.json (stations, consoleGroups)
- docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md (sections 3, 6.1); docs/superpowers/specs/2026-11-17-artemis-consoles-design.md:L160-L230 (throttle as the precedent for a new duel command and the golden two-step)
- tests/duelGates.test.ts (grep the duel-length bands)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The enemy starts unidentified and turns hostile about 20 s in; firing first (a hit) turns it hostile at once (ambush).
- Science chooses which contact and how deep; two-level scans for the enemy (Artemis), one level for the derelict.
- Enemy Level 2 reveals rooms, weapon state and the weak shield frequency; no scan delays hostility.
- Weapons tunes the laser A/B/C; a match strips 2 layers instead of 1.
- Science is a third console; Helm and Weapons can run the same scans, 2.5x slower.
- The derelict has loot for this round; salvage = Helm flies close and slow for about 5 s; Science's scan reveals loot and trap.
- CRT amber presentation; Sci-1 keeps two players, Sci-2 adds the third online seat.

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

- **P0**: the spec would break determinism or the online replica, or cannot be built as a whole.
- **P1**: an interface the spec relies on does not exist and is not declared new, a rule two implementers would build differently, a rule that contradicts the existing sim or another section, a missing reset or hash for new state, or an untestable acceptance criterion.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
