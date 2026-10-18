#pragma once
#include <stdint.h>
#include <stddef.h>
#include <lwip/inet.h>
#include <mbedtls/ssl.h>
typedef struct DtlsSrtp {mbedtls_ssl_context ssl;} DtlsSrtp;
#ifdef __cplusplus
extern "C" {
#endif
int dtls_srtp_write(DtlsSrtp*, const uint8_t*, size_t);
#ifdef __cplusplus
}
#endif
