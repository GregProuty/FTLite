# Round 2 response (plan revised)

Claude Code Opus confirmed all ten round-1 findings resolved. One new P2 accepted and fixed; no rejected or deferred findings.

## R2-F1: old-host stale traffic

Confirmed. Input envelopes only cover guest-to-host direction; an old host emits state/publication traffic. The plan now allows one role-appropriate envelope in memory, records receiver-side rejection in each direction, and requires tests for both directions and already-closed bindings. No service auth frames, secret persistence, retargeting or generation relabelling is allowed. Closed-binding local retirement remains distinct from remote rejection, and missing required native evidence cannot pass Gate F.

## Verification

Re-read the probe control, event model and recovery gates with the spec's old-generation rejection requirement. Original binding identity and generated-versus-received observations remain required. Product code was neither edited nor executed. This final P2 wording fix was controller-verified; no independent confirmation is claimed for it. Per refine rules, P2-only changes do not prolong the loop. No full confirm pass ran.

## Files changed

- docs/superpowers/plans/2026-11-16-mac-1b-cross-platform-validation.md

<!-- end -->
