# Claude session handoff, 2026-11-14

Written at the end of a Claude Code session that ran as a background job in `C:\Users\djuar\Documents\tsgame` and worked on the FTLite checkout (`C:\Users\djuar\FTLite`, branch `master`). Read this first in the next session, then the files it points to. Nothing below has been pushed.

## 1. Where the design stands

- **Gospel:** `docs/vision/napkin.md`. **Binding owner answers:** `docs/vision/thesis-grill.md`, now through **Q24**.
- **This session's grill answers (Q14 to Q24):** the demo is one duel around one planet, built to grow into a three-encounter run (Q14); exactly two players, Helm and Weapons, on two computers over the network (Q15, Q15b); the planet is gravity plus a damaging wall (Q16); the enemy is a blunt hunter under the same rules (Q17); the Helm is a direct stick (Q18); Weapons has a laser and hand-steered cruise missiles, and the laser cannot fire while a missile flies (Q19, Q19b); FTL shield layers, missiles bypass them (Q20); players leave their console to repair rooms (Q21); acceptance is a five-question checklist plus telemetry (Q22); the tactical view is a large zoomable map with a follow camera the player can pan and snap back, filled by one planet, an asteroid belt with gaps and loose clusters (Q23 to Q23c); until Net-3 the owner playtests alone, owning both seats and switching stations with Tab (Q24).
- **The spec:** `docs/superpowers/specs/2026-11-14-helm-demo-design.md`, one document (the separate tactical view spec was folded in and deleted). Sections: map (§3), physics and determinism (§4), ships and rooms (§5), Helm flight (§6), Weapons (§7), repair (§8), hunter (§9), tactical view and camera (§10), solo playtesting and network (§11a, §11b), architecture (§13), milestones H-0 to H-3 (§15), acceptance (§16), risks (§17), and 13 open defaults for the owner (§18). **Not yet reviewed.**
- **Roadmap:** item 36 in `docs/roadmap.md`; the direction spec has a 2026-11-14 amendment saying the Helm demo leads ahead of MG-0/MG-X/MG-1a.

### Next design steps (owner chooses)

1. A review of the Helm demo spec. Per `AGENTS.md`, any review must be appended to `REVIEW-EXCHANGE.md` (check which checkout holds it) with round numbers, `C-NNN` IDs and a verification section.
2. The H-0 implementation plan, starting with the map, physics, heading table and held-input flight (§15).

## 2. Networking facts relevant to the demo

- **Net-1a is merged** (`0390bda`, merge of `codex/net-1a`): the offline authority boundary. The `Link`/`Session` interfaces live in `src/renderer/src/net/contracts.ts`; the only `Link` today is in-process loopback. There is no socket, WebSocket or WebRTC code yet.
- `HeldInput { moveX, moveY, interactHeld }` already carries per-tick held axes; the spec rides the Helm's turn and thrust, and missile steering, on it.
- `authority/core.ts` is typed to the sector `SimState`; the duel needs the `sector`/`duel` mode switch in spec §13.
- **Codex is implementing Net-1b** on `codex/net-1b` in `C:/Users/djuar/.codex/worktrees/56fc/FTLite`. Do not touch that worktree. Net-1b is still offline (durability, per-viewer HUD, replay/checkpoint v2, cross-engine harness).
- **Two computers over the internet is Net-3** (WebRTC, Cloudflare signalling and TURN, join codes). The owner confirmed the demo should be Net-3-compatible; solo playtesting over loopback comes first (Q24). The spec asks for Net-3's messages to be mode-agnostic so the duel rides on it.

## 3. The Cloudflare setup task: NOT done

The task is `docs/superpowers/prompts/2026-11-14-claude-cloudflare-setup.md`. It needs **Claude in Chrome**.

**What happened this session:** the owner ran `/chrome` twice, but no `mcp__claude-in-chrome__*` tools (not even an enable tool) appeared in the session, most likely because it ran as a background job. **No Cloudflare page was opened, no account was inspected, nothing was created, Wrangler was not logged in, and the handoff report `docs/superpowers/research/2026-11-14-cloudflare-setup-handoff.md` does not exist.** The owner stopped a round of doc lookups partway, so treat the findings below as a starting point to re-verify, not as the report.

**How to run it next time:**
1. Chrome running with the Claude in Chrome extension installed, enabled and signed in to the same Claude account.
2. From a normal terminal, not a background job: `cd C:\Users\djuar\FTLite` then `claude --chrome`. Confirm the Chrome tools load (`tabs_context_mcp` should work) before starting.
3. Run the prompt file. The owner completes login, MFA and account selection in Chrome; never ask for passwords, recovery codes or secrets in chat.

**Local facts checked (read-only):**
- Wrangler is **not installed**, globally or in FTLite (`npx --no-install wrangler` failed; npm would fetch `wrangler@4.162.0`). Node is v24.18.0. Follow the prompt: check current Wrangler guidance before installing.
- `docs/superpowers/research/` does not exist yet in FTLite (the report's directory must be created).

**Official Cloudflare docs read this session (re-verify; product pages change):**
- **Durable Objects** (`https://developers.cloudflare.com/durable-objects/platform/pricing/`): available on Workers Free and Paid. **Free accounts can only use SQLite-backed Durable Objects** (the key-value backend is Paid only). Free limits, reset daily at 00:00 UTC: 100,000 requests, 13,000 GB-s duration, 5 million rows read, 100,000 rows written, 5 GB stored. Paid has a $5/month minimum. The migration syntax (`new_sqlite_classes`) was not confirmed; check `https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/`.
- **workers.dev** (`https://developers.cloudflare.com/workers/configuration/routing/workers-dev/`): dashboard **Workers & Pages → Change next to "Your subdomain"**. Worker URL pattern `<worker-name>.<account-subdomain>.workers.dev`; worker names at most 63 characters, letters, digits and dashes, not starting or ending with a dash. The prompt warns not to replace an existing account-wide subdomain casually.
- **TURN** (`https://developers.cloudflare.com/realtime/turn/`): `stun.cloudflare.com:3478/udp`; `turn.cloudflare.com` on 3478/udp (alt 443/udp), 3478/tcp (alt 80/tcp), 5349/tcp TLS (alt 443/tcp). Free when used with the Realtime SFU; otherwise **$0.05 per GB** outbound to the TURN client (the Net-0 record also cites 1 TB free; not confirmed on this page). Per-allocation limits about 5 to 10 kpps and 50 to 100 Mbps. The overview page does **not** describe TURN key creation or the short-lived credential endpoint; find them via `https://developers.cloudflare.com/realtime/llms.txt` (not yet read).

## 4. Housekeeping

- Uncommitted files in the FTLite checkout that are **not this session's** and must be preserved: `docs/superpowers/plans/2026-11-13-net-1a-boundary.md` (modified), `docs/superpowers/specs/2026-11-13-ftl-gap-audit.md`, `reports/2026-11-13-playtest-audit.json`, `research/*.diff` (untracked). Stage files by explicit path only; one commit this session accidentally swept in the gap audit and was amended to remove it.
- This session's commits on FTLite `master` are the grill entries Q14 to Q24, the Helm demo spec and its revisions, roadmap item 36 and the direction spec amendment, ending at `858ef6e` plus this handoff.
