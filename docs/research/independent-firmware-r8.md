# Independent final firmware delta review — R8

Date: 2026-10-18. Product implementation was read only. This reviewer added only two independent host/header checks and this report. No Arduino firmware build, commit, deployment, site publication, serial/USB operation, live API, browser, BLE radio or phone action was performed. The separate four-chip build remains owned by the coordinator and implementation reviewer.

**Result: no new reproducible issue in this reviewed delta. R7-F1 is closed for the tested software scheduling boundary; R6-F1's identity/epoch fence remains intact. This is finite host and source evidence, not physical phone acceptance or an exhaustive concurrency proof.**

## Reviewed source identity

Independently hashed the 13 files in `tools/build_firmware.py:SOURCE_FILES`, using the same sorted path-to-SHA-256 JSON representation as the build tool. Aggregate: **`4b4ebc2e65b3a7b1ebac4b4463c67ae2cb805f3ef85c1eece9e23bb1b435f8f0`**. This matches the coordinator's freeze.

- `main.cpp`: `a4d6ff36635ae11868f3e044be734598ec0ec245b05c96d4d7abb92129b602fd`.
- `ResourceLimits.h`: `28abf59b2e419885a3d81d6dcbc7b156a11709aa491d8c4a0a16e902b6f3831a`.
- `src/Core.h`: `bc6594e2749f9ee2a61c56193fdcdf530f802e8a6038af417438c1b22abce64d`.
- `src/SecureService.h`: `ef99867861633e6bb43232bff472b0ec0e4dde3ac329f4316df05d5615ccb39b`.
- `src/Pki.h`: `7e43c08dc5b9e1c23f2a71b19cc6625c0377521f8b0d0cb670351c2e6c41681d`.

The historical R6 report/reproducer and updated R7 report/reproducer were read and preserved. Their defective-source findings are not presented as defects in this freeze.

## R7-F1 closure and new interleavings

The Core-owned `Route` now contains handle, connection epoch and identity only (`main.cpp:50`). The host-owned Peer stores the last pointer position accepted by `notify`; `rememberPeerPointer()` runs only after a true pointer notification return (`main.cpp:42–46,58`). Neither enqueue nor a false notification return publishes a candidate position. A new connection resets the remembered state (`main.cpp:135`), while a same-epoch authentication/subscription update preserves it.

Both host safety cleanup and ordinary pointer release resolve the remembered position for the exact handle/identity/epoch (`main.cpp:63–64,76`). Thus cancellation before Sending uses the last previously accepted position, while a notification that succeeds after caller timeout updates that position before the host's safety release. A later Core release cannot roll back to its older `Input`. False returns and caller uncertainty still cause Core's transport failure and release-pending gate; cleanup success does not retroactively claim segment completion.

Reran the preserved actual-Core counterexample:

```sh
IAH_R7_CANCEL_POSITION_REPRO=1 python3 tests/firmware/independent_router_r7.py
```

It exits 0: the original **9/9** independent scheduling cases pass, and its extra cancellation-position case now asserts the all-up at x=5000 after the queued x=9999 move was never notified. The old output describing the reproduction remains in the R7 report as historical evidence.

Added [independent_router_r8.py](../../tests/firmware/independent_router_r8.py). It retains the R7 finite scheduler adapter, extracts the actual current Peer helpers and BleSink without rewriting them, includes the actual Core header, and authors **11 new cases**:

1. A false move notification preserves the last accepted x/y; a later release ignores stale caller coordinates.
2. A false release notification preserves x/y and remains false until a successful retry.
3. Actual Core cancellation while the move is Queued releases at the prior successful position and retains an unconfirmed receipt until the normal recovery gate.
4. The same assertions after identity validation but before the Sending CAS.
5. A pointer move already in Sending succeeds after caller timeout; host cleanup and subsequent Core recovery release use its new x/y.
6. The same interleaving with false notify preserves and releases at the earlier successful x/y.
7. Done published before its delayed semaphore signal remains unknown to Core; after reclamation its recovery release uses the actual accepted position.
8. Pointer subscription loss before cancelled cleanup suppresses that channel; restoring the same epoch uses the preserved previous coordinates.
9. A replacement connection with the same identity and new epoch receives no old cleanup or old position.
10. A replacement with a different identity and new epoch has the same isolation.
11. Two connected targets retain separate accepted pointer coordinates and receive their own recovery all-up reports.

**11/11 passed.** The cases check both axes, pressed/all-up values, recipients, reported transport failure, submitted counts, recovery readiness and slot reclamation where applicable. The adapter distinguishes notification attempts from true transport returns. It does not claim that a true NimBLE return proves controller delivery or observed iOS behavior. The R7 suite additionally retains deadline expiry, wrong-recipient, subscription and unfinished-job overwrite cases.

## Resource header delta

Added [independent_resource_r8.py](../../tests/firmware/independent_resource_r8.py). It preprocesses `ResourceLimits.h` followed by the actual local pinned NimBLE 2.5.1 `syscfg.h` → `esp_nimble_cfg.h` chain with `ESP_PLATFORM`, once for each actual 3.3.11 `dio_qspi` SDK header. These are C header checks only, without compiling an Arduino image.

All **4/4** targets confirm two host connections, two bonds, ATT MTU 23, MSYS1 8, and disabled central/observer/GATT client settings. C3/S3/C6 confirm MSYS2 8; classic ESP32 confirms MSYS2 0. The classic SDK omits its second-pool block size. `ResourceLimits.h:31–37` preserves its disabled pool, and the pinned `os_msys_init.c:66,163,185,210` guards allocations/initialization behind a positive pool count, so the absent size is not evaluated for an enabled allocation. No undefined-size pool was established.

`main.cpp:15–18,28–29` independently selects the product's 128-event storage and 7168-byte external replay filter; the normal loop remains 8192 bytes. The current documentation distinguishes C3/S3/C6 8/8 from classic ESP32 8/0 and qualifies older C3 heap/TLS observations as predating this final source. No new measured heap, TLS or throughput result is inferred from the header check.

## Other regression scope and executed checks

Retraced the unchanged setup fixes: a fresh open or owner-validated configuration cancels the old finish deadline (`SecureService.h:169,203`); active repeated finish delegates to the preserved deadline helper, and loop closure clears it (`188,216`). The PKI job receives the authenticated setup time (`173–176`); `Pki.h:57` checks both CA and leaf validity before reuse, and `62–67` repairs/reloads/commits or clears failed RAM credentials. These source paths and hashes remain the reviewed R6/R7 fixes. This round does not execute mbedTLS provisioning or NVS interruption.

Commands executed successfully:

```sh
IAH_R7_CANCEL_POSITION_REPRO=1 python3 tests/firmware/independent_router_r7.py
python3 tests/firmware/independent_router_r8.py
python3 tests/firmware/independent_resource_r8.py
sh tests/firmware/run.sh
sh tests/firmware/run_canonical.sh build/test-headers
python3 tools/build_firmware_test.py
```

Outcomes: **9 original independent R7 cases plus its coordinate regression; 11 new R8 cases; 4 actual resource-header profiles; 67 Core/Admission/capacity/external-storage/setup-time scenarios plus 12 implementation router cases; 6 actual pinned ArduinoJson canonical cases; 6 offline artifact-validator fixture cases.** All acceptance commands listed above exited 0. The R8 host executable used installed CLT Clang with C++17, `-Wall -Wextra -Werror -pedantic`. Native GNU14 was not available at `/opt/homebrew/bin/g++-14`; its attempted syntax check could not start. No successful local native-GNU/Linux result is claimed. An exploratory Arduino RISC-V GCC14 syntax pass was interrupted after emitting `-Werror=misleading-indentation` for the historical R7 adapter line `for(const auto& p:packets)assert(...);checks++;`; it did not reach R8. This is independent-test formatting, not a new firmware finding, and its portability correction plus GNU/Linux CI execution remain separate coordinator-owned gates. Artifact fixtures do not inspect or certify the concurrent build owner's binaries.

## Limits

This review constructs finite thread/event schedules under the pinned NimBLE host queue serialization premise traced in R7. It is not exhaustive model checking, a hardware stress run or final-image correspondence verification. No final C3 TLS/heap/stack measurement, NVS power interruption, actual BLE reconnect/RPA/handle reuse, notification over the air, iOS trust, Safari background capture, visible input or two-phone throughput was established. A successful software all-up return remains stack-submission evidence; unknown/failed returns remain unconfirmed. No user memory file was used as acceptance evidence.
