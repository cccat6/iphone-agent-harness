#!/usr/bin/env python3
"""Exercise actual shared TLS ownership against allocation-counted SDK doubles."""
from pathlib import Path
import subprocess,tempfile,os
root=Path(__file__).resolve().parents[3]
stub=r'''
#pragma once
#include <cstddef>
#include <cstring>
inline int initialized=0,freed=0,configured=0,fail=0;
#define CONTEXT(name) struct name{}; inline void name##_init(name*){++initialized;} inline void name##_free(name*){++freed;}
struct mbedtls_ssl_config{};inline void mbedtls_ssl_config_init(mbedtls_ssl_config*){++initialized;}inline void mbedtls_ssl_config_free(mbedtls_ssl_config*){++freed;}
CONTEXT(mbedtls_entropy_context)
CONTEXT(mbedtls_ctr_drbg_context)
CONTEXT(mbedtls_x509_crt)
CONTEXT(mbedtls_pk_context)
struct mbedtls_ssl_cookie_ctx{};inline void mbedtls_ssl_cookie_init(mbedtls_ssl_cookie_ctx*){++initialized;}inline void mbedtls_ssl_cookie_free(mbedtls_ssl_cookie_ctx*){++freed;}
#define mbedtls_entropy_init mbedtls_entropy_context_init
#define mbedtls_entropy_free mbedtls_entropy_context_free
#define mbedtls_ctr_drbg_init mbedtls_ctr_drbg_context_init
#define mbedtls_ctr_drbg_free mbedtls_ctr_drbg_context_free
#define mbedtls_pk_init mbedtls_pk_context_init
#define mbedtls_pk_free mbedtls_pk_context_free
inline int mbedtls_entropy_func(void*,unsigned char*,size_t){return 0;}
inline int mbedtls_ctr_drbg_random(void*,unsigned char* p,size_t n){std::memset(p,0,n);return 0;}
inline int mbedtls_ssl_cookie_write(){return 0;}inline int mbedtls_ssl_cookie_check(){return 0;}
#define ZERO(name) template<class... T> inline int name(T...){return 0;}
ZERO(mbedtls_ctr_drbg_seed) ZERO(mbedtls_x509_crt_parse) ZERO(mbedtls_pk_parse_key) ZERO(mbedtls_ssl_conf_own_cert) ZERO(mbedtls_ssl_cookie_setup)
template<class... T> inline int mbedtls_ssl_config_defaults(T...){++configured;return fail;}
#define VOID(name) template<class... T> inline void name(T...){}
VOID(mbedtls_ssl_conf_rng) VOID(mbedtls_ssl_conf_authmode) VOID(mbedtls_ssl_conf_min_tls_version) VOID(mbedtls_ssl_conf_max_tls_version) VOID(mbedtls_ssl_conf_dtls_cookies) VOID(mbedtls_ssl_conf_handshake_timeout)
#define MBEDTLS_SSL_IS_SERVER 1
#define MBEDTLS_SSL_TRANSPORT_DATAGRAM 1
#define MBEDTLS_SSL_PRESET_DEFAULT 1
#define MBEDTLS_SSL_VERIFY_NONE 0
#define MBEDTLS_SSL_VERSION_TLS1_2 1
'''
program=r'''
#include <cassert>
#include <cstdio>
#include "RtcTlsServer.h"
int main(){
 int a=0,b=0;
 {iah::RtcTlsServer shared;assert(shared.begin()==0);auto* config=shared.config();assert(shared.begin()==0&&shared.config()==config&&configured==1&&initialized==6);
 assert(shared.claimHandshake(&a));assert(shared.claimHandshake(&a));assert(!shared.claimHandshake(&b));shared.releaseHandshake(&b);assert(!shared.claimHandshake(&b));shared.releaseHandshake(&a);assert(shared.claimHandshake(&b));shared.releaseHandshake(&b);
 unsigned char bytes[8];assert(shared.random(bytes,sizeof(bytes))==0);assert(freed==0);}
 assert(freed==initialized);
 {iah::RtcTlsServer shared;fail=-3;assert(shared.begin()==-3);assert(freed==initialized);fail=0;assert(shared.begin()==0);assert(shared.claimHandshake(&a));}
 assert(freed==initialized);std::puts("Shared TLS: one immutable configuration, exclusive handshake owner, failure cleanup and reusable setup");
}
'''
with tempfile.TemporaryDirectory(prefix='iah-shared-tls-') as temp:
 p=Path(temp);(p/'mbedtls').mkdir();(p/'mbedtls/stub.h').write_text(stub)
 for name in ['ssl.h','ssl_cookie.h','ctr_drbg.h','entropy.h','x509_crt.h','pk.h']:(p/'mbedtls'/name).write_text('#include "stub.h"\n')
 (p/'main.cpp').write_text(program)
 compiler=[os.environ['CXX']] if 'CXX' in os.environ else ['/Library/Developer/CommandLineTools/usr/bin/clang++','-isysroot','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-nostdinc++','-isystem','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1']
 subprocess.run(compiler+['-std=c++17','-Wall','-Wextra','-Werror','-I'+str(p),'-I'+str(root/'firmware/IPhoneAutomationHarness/src'),str(p/'main.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
