# Weapon Loot (Loop-iii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four loot weapons in two extra slots, found in shops and on kills, powered by Weapons levels, with cargo and swapping.

**Architecture:** A weapon table in `sim/weaponDefs.ts`; extra slots, charges and cargo in `state.weapons`; `fireWeapon` dispatches on the selected entry of a flat selector list; `rng.loot` draws at shops and kills. SIM_VERSION 26.

**Tech Stack:** TypeScript, vitest (node).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-12-weapon-loot-design.md` (binding values in its sections 1–3).
- Today's Pulse Laser (beam, F1–F3) and Torpedo Tube keep their exact behaviour and draws; existing weapon, science and debris tests must pass unchanged except where the selector list's length is asserted (update with the reason).
- Draw rules: each Burst shot is one `rng.combat` draw; Heavy, Ion and Missile one each; shop offers and kill drops use `rng.loot` only.
- `SIM_VERSION` 25 → 26; `npm run bless` exactly once, in Task 4.
- Gates re-recorded before (Task 1 step 1) and after (Task 4); no floor lowered; on a failure stop and report.
- Before each commit run `npm test`; the only allowed failure is the golden version mismatch before Task 4. Committed tests print nothing. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: The weapon table, slots and firing

**Files:** create `sim/weaponDefs.ts`; modify `sim/weapons.ts` (`chargeBeam` charges the extra slots by the power thresholds; the flat selector list; `fireWeapon` dispatch), `sim/enemy.ts` (`ionUntil`: a system with `ionUntil > tick` acts as down for shields, weapons and engines without losing health), `sim/state.ts`, `sim/flatten.ts`, `sim/tuning.ts`; Test: `tests/weapons.test.ts`, `tests/combat.test.ts`, `tests/torpedoes.test.ts`, `tests/snapshot.test.ts`

- [ ] **Step 1:** Record gate figures (survival, duo, boarding, cutter, jump, run, `npm run acceptance 5 1`) to `.superpowers/sdd/loop-iii-gates-before.md`.
- [ ] **Step 2: Failing tests:** each loot weapon's charge time, rolls, draws, damage and tuning; Burst's two shots opening a layer then hitting; Ion's strip and 10 s disable; Missile's stock use and shield bypass; debris rules; slot 0 charges at level ≥ 2 and slot 1 at ≥ 4; charge kept when power drops; the selector list; the Pulse Laser and Torpedo unchanged (existing tests); snapshot round trip.
- [ ] **Step 3–4:** FAIL, implement, PASS. Commit `feat: four loot weapons in two extra slots, powered by Weapons levels`.

### Task 2: Finding weapons

**Files:** `sim/shop.ts` (one offered weapon per shop, drawn on arrival; buying it), `sim/enemy.ts` (`leave` on a kill: the drop draws), `sim/weapons.ts` (`grantWeapon`: slot, cargo, or sell for half), `sim/run.ts` (the shop draw on arrival), `render/hudModel.ts` (notices); Test: `tests/events.test.ts` (shop rows), `tests/enemy.test.ts`, `tests/weapons.test.ts`, `tests/notice.test.ts`

- [ ] **Step 1: Failing tests:** the shop offer per seed and its price; buying fills a slot; the kill drop's two draws; slot, cargo and sale order; notices.
- [ ] **Step 2–3:** FAIL, implement, PASS. Commit `feat: weapons for sale in shops and dropped by kills`.

### Task 3: The Weapons card and the enemy window

**Files:** `sim/weapons.ts` (`SWAP` while cargo holds one and no enemy is present), `render/hudModel.ts` and `render/hud.ts` (the selector strip, per-weapon charge footer, the SWAP row), `render/enemyWindowModel.ts` and `render/enemyWindow.ts` (ion-disabled rooms in blue with seconds); Test: `tests/hud.test.ts`, `tests/weapons.test.ts`, `tests/enemyWindowModel.test.ts`

- [ ] **Step 1: Failing tests:** strip and footer strings within the card width; the SWAP row's presence and effect; the ion tint and seconds.
- [ ] **Step 2–3:** FAIL, implement, PASS. Commit `feat: the Weapons card shows every gun; swapping from cargo`.

### Task 4: Gates, bless, docs, visual check

- [ ] **Step 1:** Re-run every gate and acceptance; record before → after with causes; no floor lowered.
- [ ] **Step 2:** `npm run bless` once (cause: SIM_VERSION 26); `npm test`, `npm run typecheck`, `npm run build`.
- [ ] **Step 3: Visual check** (Playwright driver in the scratchpad `drive/` folder; `coop2.mjs` for the pattern; a temporary staging hook is fine if removed and rebuilt before committing): the strip with a loot weapon and its charge, a shop offer, the SWAP row, an ion-disabled room in the enemy window. Fix anything overlapping.
- [ ] **Step 4:** Spec amendments, `docs/gates.md`, roadmap item 24. Commit `docs: Loop-iii gate figures, amendments and visual check`.
