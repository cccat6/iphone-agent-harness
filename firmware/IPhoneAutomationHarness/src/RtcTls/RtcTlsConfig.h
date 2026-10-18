#pragma once
// Load the unchanged Arduino SDK feature configuration FIRST. Only record sizes
// differ. Every TLS translation unit includes this before any TLS structure or
// private header; crypto and X.509 remain the SDK versions with the same ABI.
#include "mbedtls/build_info.h"
#undef MBEDTLS_SSL_MAX_CONTENT_LEN
#undef MBEDTLS_SSL_IN_CONTENT_LEN
#undef MBEDTLS_SSL_OUT_CONTENT_LEN
#define MBEDTLS_SSL_IN_CONTENT_LEN 2048
#define MBEDTLS_SSL_OUT_CONTENT_LEN 2048
