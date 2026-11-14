# Prompt for Codex: review the Outlaw Crew direction spec

How to run (from the repo root `C:\Users\djuar\FTLite`):

```
codex exec -s workspace-write -C . "Read docs/superpowers/prompts/2026-11-13-codex-outlaw-crew-review-prompt.md and do exactly what it says."
```

## Your task

Review `docs/superpowers/specs/2026-11-13-outlaw-crew-direction.md`, the owner's new direction for FTLite. Write your review to `docs/superpowers/specs/2026-11-13-outlaw-crew-review.md`. Change nothing else: no code, tests, other docs, no commit, no `npm install`. Read-only commands are fine.

Context to read first: `docs/roadmap.md`, `docs/superpowers/specs/2026-11-13-networking-decision.md`, `docs/superpowers/specs/2026-11-13-net-1-foundations-design.md` (amendments included), and whatever code you need (`src/renderer/src/sim/` for the current combat, events, director and bots).

The owner's direction is fixed: an Among Us-style task loop around the ship map, FTL's two-ship systems combat kept whole, FTL/Stardew dialogue events with blue options from crew skills and abilities, a Pirates!-style open world, outlaw careers, 1 to 16 players online. Do not argue against the direction. Review how well the spec turns it into a buildable game.

Check and report, citing sections and `file:line` where the code is involved:
1. **Contradictions or gaps** in the spec (for example between the task loop and the combat, or between "Net-1a unchanged" and what mini games really need from the command contract: does `fire`/`repair` with a quality value fit the Net-1 command table, and what must change?).
2. **Fit with the existing code:** which current systems carry over as the spec claims, which do not, and any claim that is wrong.
3. **The milestone order** (section 9): is MG-0 the right first test, is anything missing (for example a task-list data model, or what replaces the three-sector run while OW-1 is unbuilt), and is each milestone playable on its own?
4. **Risks the spec misses**, especially couch play with per-player mini games, bots playing mini games, determinism (mini games run on the client; only results enter the sim), and scope.
5. **Originality:** anything that copies the inspirations' names, maps, tasks or look.
6. **The open questions** (section 11): agree or disagree with each recommendation, briefly.

Rank findings High / Medium / Low, each with a concrete proposed fix. Keep it under about 1,500 words. Print a short summary at the end.
