# Codex review: Demo-ii implementation (2026-11-12)

1. **P2 — [tests/bot.test.ts:124](C:/Users/djuar/FTLite/tests/bot.test.ts:124)** — The trapped-fire fixture treats movement into *any* other room as success, including another burning room, so it can pass without exercising the trapped-fire fallback. Assert that the bot fights the fire when no fire-free exit exists, or that its escape route reaches a non-burning room.

2. Self-preservation precedence: none.
3. Run behaviour respecting the blocked set: none.
4. Cue detector edges and order: none.
5. Synth guards: none.