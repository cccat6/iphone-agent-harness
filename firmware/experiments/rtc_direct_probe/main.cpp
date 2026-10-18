#include <Arduino.h>
#include <WiFi.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <lwip/sockets.h>
#include <fcntl.h>
#include <mbedtls/ssl.h>
#include <mbedtls/ssl_cookie.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/pk.h>
#include <mbedtls/md.h>
#include "config.local.h"
#include "src/ProbeMessage.h"
extern "C" {
#include "src/sctp.h"
}
// Data-only experimental server. No HID, BLE, GPIO, external signaling or NVS writes.
static constexpr uint16_t PORT=18948;
static int udp=-1;
static sockaddr_in peer{};
static bool peerKnown=false,dtlsReady=false,failed=false;
static DtlsSrtp tls{};
static mbedtls_ssl_config conf;
static mbedtls_ssl_cookie_ctx cookie;
static mbedtls_entropy_context entropy;
static mbedtls_ctr_drbg_context rng;
static mbedtls_x509_crt cert;
static mbedtls_pk_context key;
static Sctp sctp{};
static uint32_t rtcTimerStart=0,timerIntermediate=0,timerFinal=0;
static uint8_t plain[1300],pending[512];
static size_t pendingLength=0;
static uint16_t pendingSid=0;
static char localPassword[257]{};
static bool resetPending=false;
static sockaddr_in nextPeer{};
static char nextPassword[257]{};
static uint32_t lastPeerChange=0;
static uint32_t stunCount=0,dtlsPackets=0,echoCount=0;
static uint16_t get16(const uint8_t* p){return (uint16_t(p[0])<<8)|p[1];}
static void put16(uint8_t* p,uint16_t v){p[0]=v>>8;p[1]=v;}
static bool samePeer(const sockaddr_in& p){return peerKnown&&p.sin_addr.s_addr==peer.sin_addr.s_addr&&p.sin_port==peer.sin_port;}
static bool iceChars(const char* s,size_t n,size_t minimum){if(n<minimum||n>256)return false;for(size_t i=0;i<n;i++){char c=s[i];if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='+'||c=='/'))return false;}return true;}
static uint32_t crc32(const uint8_t* b,size_t n){uint32_t crc=0xffffffff;for(size_t i=0;i<n;i++){crc^=b[i];for(int j=0;j<8;j++)crc=(crc>>1)^((crc&1)?0xedb88320:0);}return ~crc;}
static bool processStun(uint8_t* b,size_t n,const sockaddr_in& from){
 if(n<20||get16(b)!=1||get16(b+2)!=n-20||memcmp(b+4,"\x21\x12\xa4\x42",4))return false;
 char username[514]{};size_t un=0,mi=0;bool nomination=false;
 for(size_t at=20;at+4<=n;){uint16_t type=get16(b+at),length=get16(b+at+2);if(at+4+length>n)return false;
  if(type==6){if(un||length>=sizeof(username))return false;memcpy(username,b+at+4,length);un=length;}
  if(type==8){if(mi||length!=20)return false;mi=at;break;} // authenticated attrs stop at MESSAGE-INTEGRITY
  if(type==0x25&&length==0)nomination=true;
  at+=(4+length+3)&~size_t(3);
 }
 if(!un||!mi)return false;
 char* colon=static_cast<char*>(memchr(username,':',un));if(!colon)return false;
 size_t serverLength=colon-username,clientLength=un-serverLength-1;
 static const char prefix[]="libp2p+webrtc+v2/";
 if(!iceChars(username,serverLength,4)||!iceChars(colon+1,clientLength,4)||serverLength<sizeof(prefix)-1||memcmp(username,prefix,sizeof(prefix)-1)||!iceChars(username+sizeof(prefix)-1,serverLength-(sizeof(prefix)-1),22))return false;
 uint8_t expected[20];uint16_t original=get16(b+2);put16(b+2,mi+24-20);
 int rc=mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA1),reinterpret_cast<uint8_t*>(username),serverLength,b,mi,expected);put16(b+2,original);
 uint8_t difference=0;for(int i=0;i<20;i++)difference|=expected[i]^b[mi+4+i];if(rc||difference)return false;
 bool replacing=nomination&&(!peerKnown||!samePeer(from)||strlen(localPassword)!=serverLength||memcmp(localPassword,username,serverLength));
 if(replacing&&peerKnown&&millis()-lastPeerChange<1000)return false;
 uint8_t reply[64]{};put16(reply,0x101);memcpy(reply+4,b+4,16);
 put16(reply+20,0x20);put16(reply+22,8);reply[25]=1;put16(reply+26,ntohs(from.sin_port)^0x2112);
 uint32_t ip=ntohl(from.sin_addr.s_addr)^0x2112a442;reply[28]=ip>>24;reply[29]=ip>>16;reply[30]=ip>>8;reply[31]=ip;
 put16(reply+32,8);put16(reply+34,20);put16(reply+2,36);
 mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA1),reinterpret_cast<uint8_t*>(username),serverLength,reply,32,reply+36);
 put16(reply+56,0x8028);put16(reply+58,4);put16(reply+2,44);uint32_t fp=crc32(reply,56)^0x5354554e;reply[60]=fp>>24;reply[61]=fp>>16;reply[62]=fp>>8;reply[63]=fp;
 sendto(udp,reply,sizeof(reply),0,reinterpret_cast<const sockaddr*>(&from),sizeof(from));stunCount++;
 if(replacing){nextPeer=from;memcpy(nextPassword,username,serverLength);nextPassword[serverLength]=0;resetPending=true;}
 // Reset is deferred: this function can run inside mbedTLS's receive callback. Never free/reset TLS there.
 return true;
}
static int udpSend(void*,const unsigned char* b,size_t n){if(!peerKnown)return MBEDTLS_ERR_SSL_WANT_WRITE;int sent=sendto(udp,b,n,0,reinterpret_cast<sockaddr*>(&peer),sizeof(peer));return sent<0?MBEDTLS_ERR_SSL_WANT_WRITE:sent;}
static int udpReceive(void*,unsigned char* b,size_t n){sockaddr_in from{};socklen_t length=sizeof(from);int got=recvfrom(udp,b,n,0,reinterpret_cast<sockaddr*>(&from),&length);if(got<=0)return MBEDTLS_ERR_SSL_WANT_READ;
 if(b[0]<4){processStun(b,got,from);return MBEDTLS_ERR_SSL_WANT_READ;}if(!samePeer(from))return MBEDTLS_ERR_SSL_WANT_READ;dtlsPackets++;return got;}
static void setTimer(void*,uint32_t intermediate,uint32_t finalMs){rtcTimerStart=millis();timerIntermediate=intermediate;timerFinal=finalMs;}
static int getTimer(void*){if(!timerFinal)return -1;uint32_t elapsed=millis()-rtcTimerStart;return elapsed>=timerFinal?2:elapsed>=timerIntermediate?1:0;}
extern "C" int dtls_srtp_write(DtlsSrtp* t,const uint8_t* b,size_t n){return mbedtls_ssl_write(&t->ssl,b,n);}
static void queueEcho(char* text,size_t n,void*,uint16_t sid){
 if(pendingLength)return;
 pendingLength=rtc_probe::makeReply(text,n,reinterpret_cast<char*>(pending),sizeof(pending));if(pendingLength)pendingSid=sid;
}
static void resetSctp(){memset(&sctp,0,sizeof(sctp));sctp.dtls_srtp=&tls;sctp.local_port=5000;sctp.remote_port=5000;sctp.tsn=1234;sctp.onmessage=queueEcho;pendingLength=0;}
static void clearPeer(){if(mbedtls_ssl_session_reset(&tls.ssl)){failed=true;return;}peerKnown=false;dtlsReady=false;timerFinal=0;resetPending=false;localPassword[0]=0;resetSctp();}
static void applyPendingPeer(){
 sockaddr_in selected=nextPeer;char password[257];memcpy(password,nextPassword,sizeof(password));
 clearPeer();if(failed)return;peer=selected;memcpy(localPassword,password,sizeof(localPassword));peerKnown=true;lastPeerChange=millis();
 if(mbedtls_ssl_set_client_transport_id(&tls.ssl,reinterpret_cast<const uint8_t*>(&peer),sizeof(peer))){clearPeer();return;}
 Serial.printf("RTC nominated peer=%s:%u heap=%u\n",inet_ntoa(peer.sin_addr),ntohs(peer.sin_port),ESP.getFreeHeap());
}
static bool safeSctp(uint8_t* b,size_t n){
 if(n<16||n>1200||get16(b)!=5000||get16(b+2)!=5000)return false;
 unsigned chunks=0;for(size_t p=12;p<n;){if(p+4>n||++chunks>8)return false;size_t size=get16(b+p+2);if(size<4||p+size>n)return false;
  uint8_t type=b[p];if(type==2)return false; // client INIT_ACK parsing is unused and incomplete upstream
  if(type==0&&(size<16||size>528||(b[p+1]&3)!=3))return false; // reject fragments, max512 bytes
  if(type==4&&size>512)return false;
  p+=(size+3)&~size_t(3);if(p>n)return false;
 }return true;
}
static bool initTls(){
 mbedtls_ssl_init(&tls.ssl);mbedtls_ssl_config_init(&conf);mbedtls_ssl_cookie_init(&cookie);mbedtls_entropy_init(&entropy);mbedtls_ctr_drbg_init(&rng);mbedtls_x509_crt_init(&cert);mbedtls_pk_init(&key);
 int r=mbedtls_ctr_drbg_seed(&rng,mbedtls_entropy_func,&entropy,reinterpret_cast<const unsigned char*>("iah-rtc-probe"),13);if(r)return false;
 if(mbedtls_x509_crt_parse(&cert,reinterpret_cast<const unsigned char*>(RTC_CERT),sizeof(RTC_CERT)))return false;
 if(mbedtls_pk_parse_key(&key,reinterpret_cast<const unsigned char*>(RTC_KEY),sizeof(RTC_KEY),nullptr,0,mbedtls_ctr_drbg_random,&rng))return false;
 if(mbedtls_ssl_config_defaults(&conf,MBEDTLS_SSL_IS_SERVER,MBEDTLS_SSL_TRANSPORT_DATAGRAM,MBEDTLS_SSL_PRESET_DEFAULT))return false;
 mbedtls_ssl_conf_rng(&conf,mbedtls_ctr_drbg_random,&rng);mbedtls_ssl_conf_authmode(&conf,MBEDTLS_SSL_VERIFY_NONE);
 mbedtls_ssl_conf_min_tls_version(&conf,MBEDTLS_SSL_VERSION_TLS1_2);mbedtls_ssl_conf_max_tls_version(&conf,MBEDTLS_SSL_VERSION_TLS1_2);
 if(mbedtls_ssl_conf_own_cert(&conf,&cert,&key))return false;
 if(mbedtls_ssl_cookie_setup(&cookie,mbedtls_ctr_drbg_random,&rng))return false;
 mbedtls_ssl_conf_dtls_cookies(&conf,mbedtls_ssl_cookie_write,mbedtls_ssl_cookie_check,&cookie);mbedtls_ssl_conf_handshake_timeout(&conf,1000,8000);
 if(mbedtls_ssl_setup(&tls.ssl,&conf))return false;mbedtls_ssl_set_bio(&tls.ssl,nullptr,udpSend,udpReceive,nullptr);mbedtls_ssl_set_timer_cb(&tls.ssl,nullptr,setTimer,getTimer);mbedtls_ssl_set_mtu(&tls.ssl,1200);
 resetSctp();
 return true;
}
void setup(){Serial.begin(115200);delay(250);Serial.printf("RTC probe starting heap=%u\n",ESP.getFreeHeap());
 Preferences prefs;if(!prefs.begin("iah-product",true)){Serial.println("RTC no saved network");failed=true;return;}String saved=prefs.getString("network","");int savedPower=prefs.getInt("rfPower",-1);prefs.end();JsonDocument doc;if(deserializeJson(doc,saved)||!doc["ssid"].is<const char*>()){Serial.println("RTC no network config");failed=true;return;}
 WiFi.persistent(false);WiFi.mode(WIFI_STA);WiFi.setSleep(false);if(savedPower>=0&&!WiFi.setTxPower(static_cast<wifi_power_t>(savedPower))){Serial.println("RTC RF power restore failed");failed=true;return;}WiFi.begin(doc["ssid"].as<const char*>(),doc["password"]|"");uint32_t start=millis();while(WiFi.status()!=WL_CONNECTED&&millis()-start<30000)delay(50);saved="";doc.clear();if(WiFi.status()!=WL_CONNECTED){Serial.println("RTC Wi-Fi failed");failed=true;return;}
 udp=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);sockaddr_in bindAddr{};bindAddr.sin_family=AF_INET;bindAddr.sin_port=htons(PORT);bindAddr.sin_addr.s_addr=INADDR_ANY;
 if(udp<0||bind(udp,reinterpret_cast<sockaddr*>(&bindAddr),sizeof(bindAddr))<0){Serial.println("RTC bind failed");failed=true;return;}fcntl(udp,F_SETFL,O_NONBLOCK);
 if(!initTls()){Serial.println("RTC TLS setup failed");failed=true;return;}
 Serial.printf("RTC listen ip=%s port=%u heap=%u minHeap=%u\n",WiFi.localIP().toString().c_str(),PORT,ESP.getFreeHeap(),ESP.getMinFreeHeap());
}
void loop(){
 if(failed){delay(1000);return;}
 if(!peerKnown){sockaddr_in from{};socklen_t length=sizeof(from);int n=recvfrom(udp,plain,sizeof(plain),0,reinterpret_cast<sockaddr*>(&from),&length);if(n>0)processStun(plain,n,from);if(resetPending)applyPendingPeer();delay(1);return;}
 if(!dtlsReady){
  int rc=mbedtls_ssl_handshake(&tls.ssl);
  if(resetPending){applyPendingPeer();delay(1);return;}
  if(rc==0){dtlsReady=true;Serial.printf("RTC DTLS ready heap=%u minHeap=%u\n",ESP.getFreeHeap(),ESP.getMinFreeHeap());}
  else if(rc==MBEDTLS_ERR_SSL_HELLO_VERIFY_REQUIRED){mbedtls_ssl_session_reset(&tls.ssl);mbedtls_ssl_set_client_transport_id(&tls.ssl,reinterpret_cast<const uint8_t*>(&peer),sizeof(peer));}
  else if(rc!=MBEDTLS_ERR_SSL_WANT_READ&&rc!=MBEDTLS_ERR_SSL_WANT_WRITE){Serial.printf("RTC DTLS reset code=-0x%04x\n",-rc);clearPeer();}
 }else{
  int n=mbedtls_ssl_read(&tls.ssl,plain,sizeof(plain));
  if(resetPending){applyPendingPeer();delay(1);return;}
  if(n>0&&safeSctp(plain,n))sctp_incoming_data(&sctp,reinterpret_cast<char*>(plain),n);
  if(n==0||(n<0&&n!=MBEDTLS_ERR_SSL_WANT_READ&&n!=MBEDTLS_ERR_SSL_WANT_WRITE)){Serial.printf("RTC DTLS closed code=%d\n",n);clearPeer();}
  if(pendingLength){int r=sctp_outgoing_data(&sctp,reinterpret_cast<char*>(pending),pendingLength,PPID_STRING,pendingSid);Serial.printf("RTC echo bytes=%u result=%d count=%u heap=%u\n",unsigned(pendingLength),r,++echoCount,ESP.getFreeHeap());pendingLength=0;}
 }
 delay(1);
}
