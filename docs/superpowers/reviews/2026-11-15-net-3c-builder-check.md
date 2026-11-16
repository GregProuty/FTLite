# Net-3c builder check

Reviewed the slice design against parent sections 4/9/10/12/13 and the current shared RTC, native peer, main transport owner, host-process owner and native smoke composition. Read-only inspection; no implementation, runtime tests, cloud actions or git mutation. The following are controller-resolvable contracts to settle before dividing the implementation. No new product decision or user approval is needed.

## 1. High: what is the cross-DO lifecycle protocol for start, expiry and rehost admission?

**Question:** Which durable transition prevents Directory from expiring/releasing a mapping while Room commits start, and which Directory reservation must a retained room acquire before Room grants a rehost lease?

The slice's lines 33–37 make Directory the capacity/mapping authority, exclude retained rooms from active capacity, and require versioned expiry checks. Lines 45 and 55 separately commit start/rehost in Room. The missing contract matters in two concrete executions:

- Room commits start just before the lobby deadline; its Directory phase update is delayed or lost. Directory still has the old lobby version/deadline, so checking only its own version cannot distinguish the started room from an expired lobby. Expiring that row can remove the only public route to a live Room and release its charge.
- Lost room A releases active capacity, other rooms fill all 100 slots, then A grants a rehost lease. Without new admission before that grant, the cap is exceeded. Conversely, a delayed loss update must not release the charge for A's newer rehost generation.

Specify a durable reservation/transition nonce and acknowledgement order for these transitions, including crash recovery and expiry arbitration. Directory must not free a potentially live charge based solely on stale replicated phase. Rehost needs a charge before a usable grant and a stated retryable outcome when full. Cover delayed/lost phase updates, start racing lobby expiry, rehost racing the last available slot, and an old loss update arriving after rehost. Creation's existing reservation protocol does not itself resolve these later transitions.

## 2. High: what does the single native `seatGeneration` mean for a host/guest pair?

**Question:** Will both endpoints use the guest seat's generation as the pair stamp, with the host generation/connection separately fenced by Room, or will the shared RTC identity change to represent both endpoint seat generations?

The slice's lines 43 and 49 independently advance and persist host/guest seat generations. However, `src/shared/rtcSession.ts:2` has one `seatGeneration`; `src/network/rtc/peer.ts:83` emits it in both directions, line 122 constructs the expected remote identity by swapping only connection IDs, and line 161 requires received signals to carry the same value as the local peer. Assigning each endpoint its own authenticated seat generation works for the initial equal-generation fixture but fails as soon as only one seat rejoins. Forwarding the original signal, as required by slice line 51, cannot repair that mismatch.

Document the chosen mapping in the provider-to-native contract before implementing link issuance. Keeping the existing wire is feasible if the field deliberately identifies the guest generation on both ends and Room validates the sender's own generation through its current socket and persisted pair metadata. If both endpoint generations enter the wire instead, update peer authentication and signal validation together. Require native proof with unequal endpoint generations, then independently replace host and guest connections and reject the obsolete pair.

## Remaining scope

Controller resolutions (2026-11-15): both questions are resolved in the slice design and mapped into the implementation plan. Directory uses an epoch-bound reserve/commit/ack protocol; Room fences expiry before Directory may release capacity, and no usable lease escapes before acknowledgement. Both RTC endpoints use the guest seat generation, while Room independently validates both current sockets. Tasks 3/4/7 explicitly test these contracts. This records the controller's response, not a second reviewer verdict.

No additional significant unanswered question found in hibernating attachment authority, single-use socket tickets, persisted credit accounting, checkpoint fencing, or the backend-versus-utility lease boundary. The design explicitly leaves the utility gate/mirroring and product recovery orchestration to later slices. The required first runtime spike is the appropriate gate for verifying rollback and actual hibernation with the pinned packages; this inspection does not claim those APIs or runtime proofs have been exercised.
