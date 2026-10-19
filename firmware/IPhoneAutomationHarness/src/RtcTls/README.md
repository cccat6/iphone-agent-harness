# Bounded TLS record buffers

This directory rebuilds the **complete TLS translation-unit family** corresponding to the Arduino ESP32 3.3.11 SDK. The hardware-accelerated crypto and X.509 libraries remain the SDK versions.

Sources are from official repositories:

- Espressif Mbed TLS commit `9d669eadb1955d348986b9280156710aaaadf79f`, the submodule selected by ESP-IDF **v5.5.5**.
- ESP-IDF commit `b774170ff46c393eeb5e495ea37936038d3f4f4f` for its `port/net_sockets.c`, `port/mbedtls_debug.c` and `port/esp_platform_time.c`.

The 20 C units match `libmbedtls_2.a` in that SDK: 17 upstream TLS files, including MPS and the generated debug helper, plus the three IDF port files. Upstream `net_sockets.c` is replaced by the IDF port, exactly as its CMake file specifies. All 64 upstream private library headers are retained. `ORIGIN.json` records original and local SHA-256 hashes for every imported file. The only C-file patch is the first-line include of `RtcTlsConfig.h`; private headers are unchanged.

`RtcTlsConfig.h` first loads the SDK feature configuration, then sets both incoming and outgoing record content limits to **2048 bytes**. Cipher features, crypto drivers, variable-buffer options and all other feature macros remain unchanged. All TLS C units are rebuilt with this configuration.

On the installed C3 SDK, the unchanged public/private layout checks give SSL context/config/session/transform/handshake sizes of 552/196/144/220/944 bytes in both configurations. The record allocation lengths change from 16,717 to 2,381 bytes per direction, saving **28,672 bytes** of record-buffer allocation. These figures describe the record buffers.

The product uses 512-byte data-channel messages and a 1200-byte DTLS MTU. The 2048-byte setting also limits handshake message reassembly and is used for the bridge’s data-channel transport.

Mbed TLS offers Apache-2.0 OR GPL-2.0-or-later; this project uses the Apache-2.0 option. IDF port files are Apache-2.0. Original notices and the full upstream license are preserved in `LICENSE`, with a copy in the downloadable firmware licenses.

`tools/verify_rtc_tls_link.py` checks the compiler objects and linker map: all TLS units and live setup/read/write/handshake code come from this directory and use the same configuration. `tools/build_firmware.py` runs the guard before collecting each profile and records the proof in its build report. The guard is included in the release recipe fingerprint, and its unit tests run in the existing manual-only workflow.
