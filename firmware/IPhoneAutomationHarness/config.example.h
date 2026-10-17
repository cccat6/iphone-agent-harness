#pragma once
// Optional development Wi-Fi only. Copy to config.local.h, which is ignored.
// Production onboarding will use protected AP + physical pairing window.
#ifndef IAH_WIFI_SSID
#define IAH_WIFI_SSID ""
#endif
#ifndef IAH_WIFI_PASSWORD
#define IAH_WIFI_PASSWORD ""
#endif
// CORS is opt-in and exact-origin, without trailing slash. Empty disables cross-origin reads.
#ifndef IAH_ALLOWED_ORIGIN
#define IAH_ALLOWED_ORIGIN ""
#endif
#ifndef IAH_HTTP_PORT
#define IAH_HTTP_PORT 80
#endif
