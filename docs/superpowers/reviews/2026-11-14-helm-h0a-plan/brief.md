## Role
<!-- reuse -->

The subject is an implementation plan for H-0a of FTLite's Helm demo: a headless, deterministic flight simulation (seeded map, softened gravity, a generated heading table, held-axis flight with stabilise and drag, ship contacts, a predicted path, a state hash) in a new `src/renderer/src/sim/tactical/` subtree. Fresh subagents will execute it task by task, verbatim, with no other context, so anything left to "check at execution" is a defect: every interface consumed must exist with the assumed shape, every code block must compile under the repo's strict TypeScript settings and pass the determinism guard, every test must pass against the code given, and the plan must faithfully implement the parts of the refined spec it claims to cover.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-14-helm-h0a-flight-sim.md` at commit `3fc7999`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (refined; §3 map, §4 physics and determinism, §5 ships, §6 flight, §10b predicted path, §15 milestones). The plan claims only the H-0a half of H-0; check that the split is coherent and that nothing H-0a claims is missing.
- The codebase it builds on: `src/shared/rng.ts`, `src/shared/hash.ts`, `src/renderer/src/sim/tuning.ts`, the determinism guard (`tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`), `package.json`, `tsconfig.web.json`, `vitest.config.ts`.
- The run dir `docs/superpowers/reviews/2026-11-14-helm-h0a-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Per-task compile state.** The code was prototyped as a whole and the plan was cut into tasks afterwards. Check that each task, applied in order on its own, compiles and its tests pass: in particular Task 3's `physics.ts` without contacts, and Task 4's edit to it.
6. (Claude) **Determinism.** Any operation in the sim code that the guard rejects, any iteration order that is not fixed, any `-0` or NaN path (zero-length vectors in `contacts.ts`, `dirBetween`, `edgeAccel`), and whether `flattenTactical` captures every field that affects future ticks.
7. (Claude) **Physics against the spec.** Order of operations in `flyShip` versus spec §4 and §6 (forces, velocity, stabilise, drag, position), the edge spring, restitution and grace semantics versus the §4 collision matrix, and the spawn orbit direction.
8. (Claude) **The generated heading table.** Is exact symmetry really guaranteed by the generator, and are the expected literals in Step 5 right?
9. (Claude) **Weak tests.** Tests whose thresholds would pass even with a wrong implementation (for example the stabilise and edge tests), and important behaviour with no test (for example `queryGrid` near the map corners, a ship exactly at the planet centre).

## Reading manifest

- `docs/superpowers/plans/2026-11-14-helm-h0a-flight-sim.md:L1-L1116` the subject (Scope L13, Global Constraints L22, Decisions L36, File structure L44, Task 1 L63, Task 2 L285, Task 3 L540, Task 4 L780, Task 5 L952)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L51-L135` spec §3 to §6 (map, physics, collision matrix, ships, flight)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L215-L240` spec §10b (predicted path)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L290-L310` spec §15 milestones
- `src/shared/rng.ts:L1-L25` `createRng`, `nextU32`, `nextFloat`, `nextInt`, `RngState`
- `src/shared/hash.ts:L1-L12` `hashF64`
- `src/renderer/src/sim/tuning.ts:L1-L5` `TICK_HZ`, `DT`
- `src/renderer/src/sim/hash.ts:L1-L7` the sector sim's hash, for comparison
- `tests/boundary.test.ts:L1-L30` the module-graph determinism test
- `tests/helpers/determinismGuard.ts` whole file: the allowed and banned constructs
- `package.json:L1-L20` the scripts block
- `tsconfig.web.json:L1-L12` strict settings and includes
- `vitest.config.ts:L1-L8` test include pattern

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `node -e` for arithmetic checks, and `npx tsc --noEmit` on scratch copies outside the repo are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined spec `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (converged at `06f472c`) is the authority; its *(start)* numbers are the values to use.
- H-0 is split into H-0a (this plan: flight) and H-0b (combat, interior, hunter, authority mode, golden, SIM_VERSION bump).
- Determinism rules from Net-1: Float64 with + − × ÷ and sqrt only in the sim; the existing AST guard is the enforcement.
- Commits by explicit path only; the owner keeps unrelated uncommitted files in the checkout.

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

- **P0**: the plan is unexecutable as a whole, or produces a nondeterministic sim.
- **P1**: a task will fail at execution (tsc error, missing interface, wrong signature, a test that cannot pass as written), a spec requirement H-0a claims is missing or contradicted, or a determinism or physics rule is implemented differently from the spec without saying so.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
