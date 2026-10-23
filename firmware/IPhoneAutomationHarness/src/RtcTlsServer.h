#pragma once
#include <mbedtls/ssl.h>
#include <mbedtls/ssl_cookie.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/pk.h>
#include "RtcIdentity.h"
namespace iah {
// Configuration and identity stay immutable. RNG/cookie state is shared by
// the single RTC owner task; each peer retains private packet/session buffers.
class RtcTlsServer {
 public:
  RtcTlsServer()=default;
  RtcTlsServer(const RtcTlsServer&)=delete;RtcTlsServer& operator=(const RtcTlsServer&)=delete;
  ~RtcTlsServer(){stop();}
  int begin(){
   if(ready_)return 0;
   mbedtls_ssl_config_init(&conf_);mbedtls_ssl_cookie_init(&cookie_);mbedtls_entropy_init(&entropy_);mbedtls_ctr_drbg_init(&rng_);mbedtls_x509_crt_init(&cert_);mbedtls_pk_init(&key_);initialized_=true;
   const unsigned char personalization[]="iah-direct-v2";
   int r=mbedtls_ctr_drbg_seed(&rng_,mbedtls_entropy_func,&entropy_,personalization,sizeof(personalization)-1);
   if(!r)r=mbedtls_x509_crt_parse(&cert_,reinterpret_cast<const unsigned char*>(RtcIdentity::certificate),sizeof(RtcIdentity::certificate));
   if(!r)r=mbedtls_pk_parse_key(&key_,reinterpret_cast<const unsigned char*>(RtcIdentity::privateKey),sizeof(RtcIdentity::privateKey),nullptr,0,mbedtls_ctr_drbg_random,&rng_);
   if(!r)r=mbedtls_ssl_config_defaults(&conf_,MBEDTLS_SSL_IS_SERVER,MBEDTLS_SSL_TRANSPORT_DATAGRAM,MBEDTLS_SSL_PRESET_DEFAULT);
   if(r){stop();return r;}
   mbedtls_ssl_conf_rng(&conf_,mbedtls_ctr_drbg_random,&rng_);mbedtls_ssl_conf_authmode(&conf_,MBEDTLS_SSL_VERIFY_NONE);
   mbedtls_ssl_conf_min_tls_version(&conf_,MBEDTLS_SSL_VERSION_TLS1_2);mbedtls_ssl_conf_max_tls_version(&conf_,MBEDTLS_SSL_VERSION_TLS1_2);
   if((r=mbedtls_ssl_conf_own_cert(&conf_,&cert_,&key_))||(r=mbedtls_ssl_cookie_setup(&cookie_,mbedtls_ctr_drbg_random,&rng_))){stop();return r;}
   mbedtls_ssl_conf_dtls_cookies(&conf_,mbedtls_ssl_cookie_write,mbedtls_ssl_cookie_check,&cookie_);mbedtls_ssl_conf_handshake_timeout(&conf_,1000,8000);
   ready_=true;return 0;
  }
  const mbedtls_ssl_config* config()const{return &conf_;}
  int random(unsigned char* bytes,size_t length){return mbedtls_ctr_drbg_random(&rng_,bytes,length);}
  bool claimHandshake(const void* peer){if(handshakeOwner_&&handshakeOwner_!=peer)return false;handshakeOwner_=peer;return true;}
  void releaseHandshake(const void* peer){if(handshakeOwner_==peer)handshakeOwner_=nullptr;}
 private:
  void stop(){if(!initialized_)return;mbedtls_ssl_config_free(&conf_);mbedtls_ssl_cookie_free(&cookie_);mbedtls_x509_crt_free(&cert_);mbedtls_pk_free(&key_);mbedtls_ctr_drbg_free(&rng_);mbedtls_entropy_free(&entropy_);initialized_=ready_=false;handshakeOwner_=nullptr;}
  bool initialized_=false,ready_=false;const void* handshakeOwner_=nullptr;
  mbedtls_ssl_config conf_{};mbedtls_ssl_cookie_ctx cookie_{};mbedtls_entropy_context entropy_{};mbedtls_ctr_drbg_context rng_{};mbedtls_x509_crt cert_{};mbedtls_pk_context key_{};
};
}
