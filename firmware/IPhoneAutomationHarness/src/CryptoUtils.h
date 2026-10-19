#pragma once
#include <Arduino.h>
#include <mbedtls/sha256.h>
#include <esp_random.h>
namespace iah {
inline String randomHex(size_t bytes){String out;out.reserve(bytes*2);for(size_t i=0;i<bytes;i++){uint8_t b;esp_fill_random(&b,1);char hex[3];snprintf(hex,3,"%02x",b);out+=hex;}return out;}
inline String sha256Hex(const String& text){uint8_t out[32];mbedtls_sha256((const uint8_t*)text.c_str(),text.length(),out,0);String value;for(uint8_t b:out){char h[3];snprintf(h,3,"%02x",b);value+=h;}return value;}
}
