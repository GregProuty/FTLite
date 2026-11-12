# Boarders Suffer Vacuum and Fire; Scrap Scales by Column (Demo-ix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boarders take vacuum and fire damage like the crew, so venting or letting a room burn kills them; every scrap reward grows with the column.

**Architecture:** One hazard pass at the start of `boarderSystem` with its own death path; column-based reward helpers in `tuning.ts`, used both by the code that pays and the text that quotes. SIM_VERSION 21.

**Tech Stack:** TypeScript, vitest (node).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-12-boarders-and-scrap-design.md`; its section 5 Amendments (B5–B9) override earlier text.
- `SIM_VERSION` 20 → 21; version-20 snapshots rejected; `npm run bless` exactly once, in Task 3.
- Values: `BOARDER_O2_DPS = O2_DAMAGE` (6), `BOARDER_FIRE_DPS = FIRE_DAMAGE` (3), threshold `SUFFOCATE_FRAC` (0.1). Scrap: per jump `10 + 4c`, enemy destroyed `20 + 6c`, surrender `15 + 4c`, boarder `8 + 2c`, field cleared `15 + 5c`, with `c = run.column` when paid.
- Gates re-recorded before (Task 1 step 1) and after (Task 3); no floor lowered; on a failure stop and report.
- Committed tests print nothing. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Boarders feel vacuum and fire

**Files:** `sim/boarders.ts`, `sim/tuning.ts`, `sim/state.ts` and `sim/flatten.ts` (`telemetry.boardersVented` after `encountersWon`, both put and get lists), `sim/telemetry.ts` (record: `boarders.vented`); Test: `tests/boarders.test.ts`, `tests/snapshot.test.ts`, `tests/telemetry.test.ts`

**Interfaces — Produces:** `killBoarderByHazard(state, slot): void`.

- [ ] **Step 1:** Record the gate figures (survival, duo, boarding, cutter, jump, run, `npm run acceptance 5 1`) to `.superpowers/sdd/demo-ix-gates-before.md`.
- [ ] **Step 2: Failing tests:** a boarder in a room below 10% oxygen loses 6 per second; in a burning room 3 per second; both add to 9; at 0 it is removed with scrap, `boardersKilled + 1`, `boardersVented + 1` and no XP for anyone; a boarder in a normal room loses nothing; a slot killed by hazard is not processed further that tick (no melee, no sabotage, no move); **when the hazard kills the last active boarder, the party cooldown is re-armed with the same single `rng.director` draw as a melee kill** (damageBoarder lines 99–102 today: without it the next party never comes); the cutter integration: boarders in the Engines, the Engines airlock opened through the Doors console, all dead within 10 s; snapshot round trip with `boardersVented`; the telemetry record shows it.
- [ ] **Step 3:** Run, expect FAIL.
- [ ] **Step 4: Implement** the hazard pass first in `boarderSystem`, over active slots in ascending order, reading `b.room[k]` (amendment B7); factor the shared kill bookkeeping (deactivate, scrap, killed count, cooldown re-arm) into one helper used by both deaths, with XP only on the melee path.
- [ ] **Step 5:** Run boarders, snapshot, telemetry, cutter tests: PASS (golden fails on version only until Task 3). Commit `feat: boarders suffocate and burn: venting or a fire kills them for the usual scrap`.

### Task 2: Scrap by column

**Files:** `sim/tuning.ts` (`scrapPerJump(c)`, `scrapEnemy(c)`, `scrapSurrender(c)`, `scrapBoarder(c)`, `scrapField(c)`; remove the flat constants once unused), `sim/run.ts` (arrival line 70, field clear line 145), `sim/enemy.ts` (lines 78, 80), `sim/boarders.ts` (the shared kill helper), `render/hudModel.ts` (lines 182 and 186: quote the same helpers with `state.run.column`); Test: `tests/run.test.ts`, `tests/enemy.test.ts`, `tests/boarders.test.ts`, `tests/notice.test.ts`, `tests/scrap.test.ts` if present

- [ ] **Step 1: Failing tests:** each helper at columns 0, 3 and 7; arrival pays `scrapPerJump` of the new column (after the jump advanced it, amendment B8); kill, surrender, boarder and field payouts at a set column; the surrender notice and the field-cleared notice print the same numbers they pay.
- [ ] **Step 2–4:** FAIL, implement, PASS. Commit `feat: scrap rewards grow with each column, and the notices quote what they pay`.

### Task 3: Gates, bless, docs

- [ ] **Step 1:** Re-run every gate and `npm run acceptance 5 1`; record before → after with causes in the spec amendments and `docs/gates.md` (expect boarding to change most); no floor lowered.
- [ ] **Step 2:** `npm run bless` once (cause: SIM_VERSION 21); `npm test`, `npm run typecheck`, `npm run build`.
- [ ] **Step 3:** Roadmap item 19. Commit `docs: Demo-ix gate figures and amendments`.
