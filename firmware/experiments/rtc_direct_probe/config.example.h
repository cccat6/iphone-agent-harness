#pragma once
// Generate a test-only ECDSA key/certificate with prepare.py. Never commit config.local.h.
// The browser synthetic remote SDP must use that certificate's SHA-256 fingerprint.
static const char RTC_CERT[] = "REPLACE WITH TEST CERTIFICATE PEM";
static const char RTC_KEY[] = "REPLACE WITH MATCHING TEST PRIVATE KEY PEM";
