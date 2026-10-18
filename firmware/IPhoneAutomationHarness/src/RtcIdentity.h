#pragma once
#include <cstdint>
// Deliberately public, shared transport identity. This is NOT a device identity,
// user credential or authorization mechanism. Board/client/lease checks are separate.
namespace iah { namespace RtcIdentity {
static constexpr uint16_t port=18948;
static constexpr char fingerprint[]="33:70:01:9E:3E:6C:50:DC:4D:6D:85:53:16:86:F6:FD:9F:68:9B:0C:6A:EC:00:E8:D1:01:7F:E8:B7:F2:9D:9B";
static constexpr char certificate[]=R"IAHRTC(-----BEGIN CERTIFICATE-----
MIIBsDCCAVWgAwIBAgIUDgqdpKLpCD6mCBl1bbQvBxl2gJwwCgYIKoZIzj0EAwIw
LDEqMCgGA1UEAwwhaVBob25lIEFnZW50IHNoYXJlZCBSVEMgdHJhbnNwb3J0MCAX
DTI2MTAxODE5MjEwOVoYDzIxMjYwOTI0MTkyMTA5WjAsMSowKAYDVQQDDCFpUGhv
bmUgQWdlbnQgc2hhcmVkIFJUQyB0cmFuc3BvcnQwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAATRhlnx4nVLvUoXC/9YcxbXdOK6mgqZstG6OKjuQURPBT/oTFB2TMi0
Mw6EvGorGbVjPKWIWedxkn97xnHS0RRuo1MwUTAdBgNVHQ4EFgQUDJrQUfsBaFMz
IWks78McuSspKHMwHwYDVR0jBBgwFoAUDJrQUfsBaFMzIWks78McuSspKHMwDwYD
VR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNJADBGAiEA5OuIGcV4t+8aIGp/+fg3
7MajC0Bk1L+TDACBEQNd8kICIQDNdB6KeUnQre9ER3QYXdNwRj9+Vb3o4yAn1Rb3
A+xayw==
-----END CERTIFICATE-----
)IAHRTC";
static constexpr char privateKey[]=R"IAHRTC(-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIP7at5DvAqOdlSw0ngwUkLFhki2jwvxgIpsewIjJcinroAoGCCqGSM49
AwEHoUQDQgAE0YZZ8eJ1S71KFwv/WHMW13TiupoKmbLRujio7kFETwU/6ExQdkzI
tDMOhLxqKxm1YzyliFnncZJ/e8Zx0tEUbg==
-----END EC PRIVATE KEY-----
)IAHRTC";
}}
