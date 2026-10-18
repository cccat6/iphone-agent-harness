# R4 independent review: streamed clipboard and connection recovery

Date: 2026-10-19. Scope: the current WebRTC Direct integration, the new one-slot streamed clipboard, recovery changes, and transient-memory handling. This review did not access a serial port, operate a phone/browser, flash firmware, or deploy assets.

## Finding and repair

**Found and repaired: assigning an empty Arduino String did not release its buffer.**

The installed ESP32 Arduino 3.3.11 `WString.cpp` uses an existing destination buffer when move-assigning a shorter string. Consequently, `encoded = String()`, `request.body = String()` and `prefix = String()` cleared their lengths while retaining their allocations until their scopes ended. In the RPC dispatcher, the original envelope allocation could overlap parsing, dispatch and response allocations. This matters for the C3 memory budget.

The primary agent replaced the three assignments in `SecureService.h` with `static_cast<const char*>(nullptr)`. The actual SDK's `operator=(const char*)` calls `copy()`, whose null-input path calls `invalidate()` and releases the allocation.

Independent regression: `tests/firmware/arduino_string_release_independent_test.py` compiles the **actual installed SDK String source** with ASan and UBSan. Only unused hardware logging and numeric-conversion entry points are stubbed. It confirms that an empty move assignment retains 12,303 bytes for a 12,288-byte string, while null assignment releases its capacity before the surrounding scope ends. It also checks scoped move construction as an alternative. The test passed after the repair.

## Contract checks

- The browser retains the complete UTF-8 text. The C3 mailbox owns one dynamically allocated chunk of at most 1,024 bytes; HTTP has a separate bounded copy and 512-byte writer scratch. The complete text never accumulates in a firmware JSON document.
- One Shortcut HTTP GET returns one complete JSON response via chunked transfer. It does not return independent JSON objects per uploaded chunk.
- The mailbox's `nextOffset` advances only after that chunk's HTTP writer flush succeeds. A full producer slot does not accept conflicting replacement content. The web producer waits for consumption before advancing.
- Valid Unicode is not split across chunk boundaries. NUL and all C0 characters are JSON-escaped; they are not interpreted as C-string termination. Canonical base64 and UTF-8 validation match between the web client and firmware decoder.
- The former 8 KiB/20,000-character application caps are absent on this path. The representable total remains a JavaScript safe integer, and real browser/Shortcut memory and request lifetime remain physical limits; this is not a claim of mathematically infinite text capacity.
- Expiry is based on idle progress, not total transfer duration. Status polling alone does not extend a stalled transfer. Successful transfer progress refreshes the lifetime.
- Failed HTTP writes or disconnect detection cancel the stream. The final JSON closing bytes and HTTP terminator must succeed before `Delivered`; only a matching native Shortcut ACK changes it to `Copied`. Partial delivery cannot authorize paste.
- Web receipts bind request, session, target, client, board and boot IDs. Changing the target/boot or cancelling an in-flight chunk stops subsequent uploads and rejects late responses.
- The transport tolerates a transient ICE `disconnected` state for up to eight seconds (bounded by its configured request timeout); failed/closed states still stop the connection. Recovered state clears that timer. No automatic replay of uncertain mutations was introduced.
- Loss of the saved network stops/frees the RTC instance; network and HTTP readiness permit a fresh `begin()`. Saved-network association retries are bounded and do not interrupt an explicit candidate configuration. A recovery AP schedules its closure after the saved network returns; a manual configuration's separate completion behavior remains intact.

## Tests executed independently

- Seven related Web test files: **37/37 passed**. This includes real `DeviceClient` and RTC frame encoding through a simulated single-slot HTTP consumer with more than 100 KB of text; occupied-slot backpressure; target/boot/cancel fences; idle expiry; and transient ICE recovery.
- `sh tests/firmware/run.sh`: passed. It exercises actual Core/Admission, mailbox allocation failure and wiping, committed offsets, stream completion and ACK fences, more than 100 KB of mixed Unicode/C0/NUL JSON, interrupted HTTP sink, saved-network retry/recovery, BLE callback/router/bond lifecycle, and strict JSON code.
- Actual SDK String capacity regression with ASan/UBSan: passed.
- Logs: `build/rtc-stream-r4-web.log`, `build/rtc-stream-r4-host.log` (local build evidence).

No additional blocking issue was found in these reviewed paths after the String repair. The complete same-version TLS source family and its uniform 2,048-byte record configuration have been inspected. Final link-map selection and real-board Chrome/Safari handshake, BLE coexistence, and native Shortcut execution remain separate acceptance gates; they are not implied by host tests.
