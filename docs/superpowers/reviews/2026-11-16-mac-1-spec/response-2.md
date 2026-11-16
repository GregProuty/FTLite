# Round 2 response (spec revised)

Claude Code Opus confirmed all nine round-1 findings resolved. One new P2 accepted and fixed; no rejected or deferred findings.

## R2-F1: sleep-boundary coverage

Confirmed the textual contradiction: the sleeping recorder cannot continuously report while the operating system suspends its process. The no-gaps rule now explicitly exempts a recorded sleep boundary, requires the awake peer/service to observe the asleep interval, and requires the Mac observer to resume before dispatching any old-authority work. Clock deltas are annotations; identity and causal ordering join the reports. This does not assume or require that a particular monotonic implementation advances across sleep.

## Verification

Re-read the recovery contract, scenario table and new exception together. Required observations remain mandatory: unexplained gaps cannot pass, actual sleep remains operator-attested, and internal fencing requires instrumented evidence. No product code was changed or Mac execution claimed. The one-shot gameplay capture bounds and the separate physical recovery recorder remain distinct.

## Also changed

No other changes. Per refine policy, this nonblocking P2 correction does not require another round. It is controller-verified and is not claimed independently confirmed by Claude. All P1 findings were confirmed resolved by round 2. No separate confirm pass ran.

## Files changed

- docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md

<!-- end -->
