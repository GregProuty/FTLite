# Codex review: Run-ii implementation (2026-11-11)

1. **Low — `tests/events.test.ts:77-80`** — The medical freighter test proves Downed crew are untouched, but does not cover Dead crew, which section 11 requires alongside Conscious-only healing. Add a Dead crew member and assert their health and life state are unchanged after treatment.

2. **Low — `tests/events.test.ts:92-118`** — Shop tests do not assert that listing or buying leaves `rng.loot` unchanged, despite the spec requiring no shop draws. Capture the loot state before a buy and assert it is unchanged afterward.

**Other requested categories:** none. The node-type draw order and fallback, arrival and event draw behavior, navigation and invalid-jump handling, event/shop effects and caps, upgrade thresholds and output denominator, flatten/hash coverage, and HUD model styling and strings match the binding spec by inspection. No tests were run.