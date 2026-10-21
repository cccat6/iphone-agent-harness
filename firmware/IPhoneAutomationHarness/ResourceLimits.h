#pragma once
// Included for every C/C++ library unit by Arduino build_opt.h, after SDK defaults.
// The bundled NimBLE host is rebuilt with these values; SDK binaries are not patched.
#include "sdkconfig.h"
#undef CONFIG_BT_NIMBLE_MAX_CONNECTIONS
#define CONFIG_BT_NIMBLE_MAX_CONNECTIONS 2
#undef CONFIG_NIMBLE_MAX_CONNECTIONS
#define CONFIG_NIMBLE_MAX_CONNECTIONS 2
#undef CONFIG_BT_NIMBLE_MAX_BONDS
#define CONFIG_BT_NIMBLE_MAX_BONDS 2
#undef CONFIG_NIMBLE_MAX_BONDS
#define CONFIG_NIMBLE_MAX_BONDS 2
// Each phone can retain three HID reports, battery notifications and Service
// Changed indications. Keep two spare descriptors without evicting either bond.
#undef CONFIG_BT_NIMBLE_MAX_CCCDS
#define CONFIG_BT_NIMBLE_MAX_CCCDS 12
#undef CONFIG_NIMBLE_MAX_CCCDS
#define CONFIG_NIMBLE_MAX_CCCDS 12
#undef CONFIG_NIMBLE_ROLE_CENTRAL
#undef CONFIG_BT_NIMBLE_ROLE_CENTRAL
#define CONFIG_BT_NIMBLE_ROLE_CENTRAL 0
#undef CONFIG_NIMBLE_ROLE_OBSERVER
#undef CONFIG_BT_NIMBLE_ROLE_OBSERVER
#define CONFIG_BT_NIMBLE_ROLE_OBSERVER 0
#undef CONFIG_BT_NIMBLE_GATT_CLIENT
#define CONFIG_BT_NIMBLE_GATT_CLIENT 0
#define IAH_MAX_EVENTS 256
// HID reports fit a 23-byte ATT MTU; report-map reads remain ATT long reads.
#undef CONFIG_BT_NIMBLE_ATT_PREFERRED_MTU
#define CONFIG_BT_NIMBLE_ATT_PREFERRED_MTU 23
#undef CONFIG_NIMBLE_ATT_PREFERRED_MTU
#define CONFIG_NIMBLE_ATT_PREFERRED_MTU 23
#undef CONFIG_BT_NIMBLE_MSYS_1_BLOCK_COUNT
#define CONFIG_BT_NIMBLE_MSYS_1_BLOCK_COUNT 8
#undef CONFIG_BT_NIMBLE_MSYS1_BLOCK_COUNT
#define CONFIG_BT_NIMBLE_MSYS1_BLOCK_COUNT 8
#undef CONFIG_BT_NIMBLE_MSYS_2_BLOCK_COUNT
#ifdef CONFIG_BT_NIMBLE_MSYS_2_BLOCK_SIZE
#define CONFIG_BT_NIMBLE_MSYS_2_BLOCK_COUNT 8
#else
// Classic ESP32 SDK disables this pool and omits its block-size macro.
#define CONFIG_BT_NIMBLE_MSYS_2_BLOCK_COUNT 0
#endif
