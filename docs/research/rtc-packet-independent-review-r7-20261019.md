# WebRTC packet compatibility independent review R7

Date: 2026-10-19. Scope: read-only review of the final SCTP packet-size and DATA-fragment changes, RPC dispatch ordering, and fresh-clock handling. No serial port, browser, board control, deployment, or production implementation changes were performed by this reviewer.

## Result

No new confirmed defect was found within this scope. Host tests and the additional independent cases passed under AddressSanitizer and UndefinedBehaviorSanitizer. This is **host/source evidence only**. It does not establish that the earlier 7000-byte request timeout on the physical C3 has been fixed; that requires the root agent's fresh board/browser test after flashing the current firmware.

## Source identity

SHA-256 at review:

| File | SHA-256 |
| --- | --- |
| `RtcSctp.h` | `6b6dccd703c4dc8063144df2de9641bb74d7a866fcb6141b1a5e92057c082fc8` |
| `RtcRpc.h` | `956ac12af461584748336c929aa630d2f49fc138ce3a9e2ac7a60b4d3e1366f2` |
| `RtcBridge.h` | `96db240ae06539fd45d300a8c15977e8e2c40b0cfdbde7e774170773ceaffa58` |

All three are under `firmware/IPhoneAutomationHarness/src/`.

## Checked behavior

- Receive datagrams are bounded at 2048 bytes; sending retains the smaller packet budget. The 512-byte application-message cap is unchanged.
- Chunk boundaries, padding, CRC, verification tag, stream ID, PPID, and chunk-specific minimum lengths are checked before any application callback. An invalid trailing chunk prevents the valid prefix from being dispatched.
- Only contiguous TSNs enter reassembly. Reordered chunks occupy the bounded eight-slot window; duplicates below the cumulative TSN or already in a slot are not delivered again. Out-of-window chunks are not acknowledged as received and can be retransmitted.
- Fragment SSNs are held until E. Orphan middle/end fragments, a second B during an unfinished message, wrong SSN, and a combined payload above 512 bytes abort without partial delivery. Reassembly state resets on association reset.
- A packet containing a completed fragmented message followed by the next whole message delivers both in order. TSN wrap and duplicate retransmissions preserve exactly one delivery per message.
- RPC request numbers are consumed before dispatch. A final response frame has its own SCTP retransmission copy before RPC becomes idle; the following response cannot overwrite the pending tail. Existing tests cover next request before/with/after that tail's SACK.
- `RtcBridge::loop` calls both ticks with fresh `millis()`. `Rpc::tick` uses signed elapsed comparison, preserving normal 30-second expiry across wrap while not treating a slightly earlier timestamp as a huge elapsed interval. The idle-peer check also samples fresh time. Diagnostic DATA flags and receive-size counters have bounded reads and do not alter protocol acceptance.

## Executed checks

1. `RTC_SANITIZE=1 sh tests/firmware/rtc/run.sh` — exit 0, no sanitizer finding. Includes the repository's large multi-window RPC, loss/reorder/duplicate, CRC/vtag/cookie, heartbeat/close, malformed-packet corpus, fragmentation, and clock rollover cases.
2. An independent local harness at `build/rtc-r7-independent.cpp`, compiled with `-fsanitize=address,undefined -fno-omit-frame-pointer`, executed 50 additional cases — exit 0, no sanitizer finding:
   - All 24 permutations of four 128-byte fragments, each fragment duplicated on arrival and replayed after completion, at both normal TSN and TSN wrap (48 cases).
   - Bundled B/E plus next whole message, replaying the complete packet (1 case).
   - Valid DATA prefix followed by a malformed trailing chunk, confirming zero dispatch (1 case).

The additional harness is local review evidence in the ignored build directory; it did not change the production code or the shared protocol test file.
