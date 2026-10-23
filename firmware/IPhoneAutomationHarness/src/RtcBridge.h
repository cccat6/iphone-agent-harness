#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <atomic>
#include <array>
#include <functional>
#include <lwip/sockets.h>
#include <fcntl.h>
#include <cerrno>
#include <mbedtls/ssl.h>
#include <mbedtls/ssl_cookie.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/pk.h>
#include <mbedtls/md.h>
#include "RtcIdentity.h"
#include "RtcSctp.h"
#include "RtcRpc.h"
#include "RtcUdpSend.h"

namespace iah {
// Own this object and call begin/loop/stop on one network task. Dispatch runs on
// that task; the application owns locking and board/client/writer authorization.
class RtcBridge {
 public:
  using Dispatch=std::function<String(String)>;
  using Disconnect=std::function<void()>;
  using CanReplace=std::function<bool()>;
  using WireBuffer=std::array<uint8_t,2048>;
  explicit RtcBridge(WireBuffer& wire,uint16_t localPort=RtcIdentity::port):localPort_(localPort),wire_(wire){}
  RtcBridge(const RtcBridge&)=delete;RtcBridge& operator=(const RtcBridge&)=delete;
  static const char* fingerprint(){return RtcIdentity::fingerprint;}
  static uint16_t port(){return RtcIdentity::port;}
  uint16_t listeningPort()const{return localPort_;}
  bool ready()const{return ready_.load();}
  int lastError()const{return lastError_.load();}
  bool dtlsConnected()const{return dtlsReady_.load();}
  int lastSctpChunk()const{return lastChunk_.load();}
  unsigned maxSctpBytes()const{return maxSctpBytes_.load();}
  unsigned dataFlagsSeen()const{return dataFlagsSeen_.load();}
  int lastAbortCause()const{return lastAbort_.load();}
  unsigned completedRequests()const{return completedRequests_.load();}
  bool connected()const{return connected_.load();}
  unsigned droppedDatagrams()const{return droppedDatagrams_.load();}
  int lastDatagramError()const{return lastDatagramError_.load();}
  unsigned closeCount()const{return closeCount_.load();}
  uint32_t lastCloseAt()const{return lastCloseAt_.load();}
  int lastCloseError()const{return lastCloseError_.load();}
  int lastSctpFailure()const{return lastSctpFailure_.load();}
  unsigned maxHeartbeatBytes()const{return maxHeartbeatBytes_.load();}
  String peerAddress()const{if(!peerKnown_)return String();char ip[INET_ADDRSTRLEN]{};return inet_ntop(AF_INET,&peer_.sin_addr,ip,sizeof(ip))?String(ip):String();}
  bool begin(Dispatch dispatch,Disconnect disconnected,CanReplace canReplace={}){
   if(ready_)return true;if(WiFi.status()!=WL_CONNECTED)return false;
   dispatch_=dispatch;disconnected_=disconnected;canReplace_=canReplace;
   udp_=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);if(udp_<0){lastError_=-errno;return false;}
   sockaddr_in local{};local.sin_family=AF_INET;local.sin_port=htons(localPort_);local.sin_addr.s_addr=INADDR_ANY;
   if(bind(udp_,reinterpret_cast<sockaddr*>(&local),sizeof(local))<0||fcntl(udp_,F_SETFL,O_NONBLOCK)<0){lastError_=-errno;close(udp_);udp_=-1;return false;}
   mbedtls_ssl_init(&ssl_);mbedtls_ssl_config_init(&conf_);mbedtls_ssl_cookie_init(&cookie_);mbedtls_entropy_init(&entropy_);mbedtls_ctr_drbg_init(&rng_);mbedtls_x509_crt_init(&cert_);mbedtls_pk_init(&key_);initialized_=true;
   const unsigned char personalization[]="iah-direct-v2";
   int r=mbedtls_ctr_drbg_seed(&rng_,mbedtls_entropy_func,&entropy_,personalization,sizeof(personalization)-1);
   if(!r)r=mbedtls_x509_crt_parse(&cert_,reinterpret_cast<const unsigned char*>(RtcIdentity::certificate),sizeof(RtcIdentity::certificate));
   if(!r)r=mbedtls_pk_parse_key(&key_,reinterpret_cast<const unsigned char*>(RtcIdentity::privateKey),sizeof(RtcIdentity::privateKey),nullptr,0,mbedtls_ctr_drbg_random,&rng_);
   if(!r)r=mbedtls_ssl_config_defaults(&conf_,MBEDTLS_SSL_IS_SERVER,MBEDTLS_SSL_TRANSPORT_DATAGRAM,MBEDTLS_SSL_PRESET_DEFAULT);
   if(r){lastError_=r;stop();return false;}
   mbedtls_ssl_conf_rng(&conf_,mbedtls_ctr_drbg_random,&rng_);mbedtls_ssl_conf_authmode(&conf_,MBEDTLS_SSL_VERIFY_NONE);
   mbedtls_ssl_conf_min_tls_version(&conf_,MBEDTLS_SSL_VERSION_TLS1_2);mbedtls_ssl_conf_max_tls_version(&conf_,MBEDTLS_SSL_VERSION_TLS1_2);
   if((r=mbedtls_ssl_conf_own_cert(&conf_,&cert_,&key_))||(r=mbedtls_ssl_cookie_setup(&cookie_,mbedtls_ctr_drbg_random,&rng_))){lastError_=r;stop();return false;}
   mbedtls_ssl_conf_dtls_cookies(&conf_,mbedtls_ssl_cookie_write,mbedtls_ssl_cookie_check,&cookie_);mbedtls_ssl_conf_handshake_timeout(&conf_,1000,8000);
   if((r=mbedtls_ssl_setup(&ssl_,&conf_))){lastError_=r;stop();return false;}tlsConfigured_=true;
   mbedtls_ssl_set_bio(&ssl_,this,sendUdp,receiveUdp,nullptr);mbedtls_ssl_set_timer_cb(&ssl_,this,setTimer,getTimer);mbedtls_ssl_set_mtu(&ssl_,1200);
   sctp_.callbacks([this](const uint8_t* p,size_t n){if(!dtlsReady_)return false;int result=mbedtls_ssl_write(&ssl_,p,n);if(result!=int(n)){lastError_=result;closePending_=true;return false;}return true;},
    [this](const uint8_t* p,size_t n){if(closePending_)return;if(!rpc_.input(p,n,millis())){lastError_=-100001;closePending_=true;}completedRequests_=rpc_.completed();},[this]{if(lastError_==0)lastError_=-100002;closePending_=true;});
   rpc_.dispatch([this](std::string request){if(!dispatch_)return std::string("{\"status\":503,\"body\":\"{}\"}");String input(request.c_str());std::string().swap(request);String result=dispatch_(std::move(input));return std::string(result.c_str(),result.length());});
   lastError_=0;ready_=true;return true;
  }
  void loop(){
   if(!ready_)return;uint32_t now=millis();if(WiFi.status()!=WL_CONNECTED){if(peerKnown_)clearPeer();return;}
   if(!peerKnown_){sockaddr_in from{};socklen_t length=sizeof(from);int n=recvfrom(udp_,wire_.data(),wire_.size(),0,reinterpret_cast<sockaddr*>(&from),&length);if(n>0)stun(wire_.data(),n,from,now);if(replacementPending_)applyReplacement();return;}
   if(!dtlsReady_){
    if(now-handshakeStarted_>20000){clearPeer();return;}
    int result=mbedtls_ssl_handshake(&ssl_);if(replacementPending_){applyReplacement();return;}
    if(result==0){dtlsReady_=true;dtlsStarted_=lastPeerActivity_=now;}
    else if(result==MBEDTLS_ERR_SSL_HELLO_VERIFY_REQUIRED){if(mbedtls_ssl_session_reset(&ssl_)||mbedtls_ssl_set_client_transport_id(&ssl_,reinterpret_cast<const uint8_t*>(&peer_),sizeof(peer_)))closePending_=true;}
    else if(result!=MBEDTLS_ERR_SSL_WANT_READ&&result!=MBEDTLS_ERR_SSL_WANT_WRITE){lastError_=result;closePending_=true;}
   }else{
    int n=mbedtls_ssl_read(&ssl_,wire_.data(),wire_.size());if(replacementPending_){applyReplacement();return;}
    if(n>0){lastPeerActivity_=now;if(unsigned(n)>maxSctpBytes_)maxSctpBytes_=n;for(size_t at=12;at+4<=size_t(n);){auto length=rtc::Sctp::read16(wire_.data()+at+2);if(length<4||at+length>size_t(n))break;if((wire_[at]==4||wire_[at]==5)&&length>maxHeartbeatBytes_)maxHeartbeatBytes_=length;if(wire_[at]==0)dataFlagsSeen_.fetch_or(1u<<(wire_[at+1]&15));at+=(length+3)&~size_t(3);}if(n>=16){lastChunk_=wire_[12];if(wire_[12]==6&&n>=20)lastAbort_=rtc::Sctp::read16(wire_.data()+16);}sctp_.input(wire_.data(),n,now);}
    else if(n==0||(n!=MBEDTLS_ERR_SSL_WANT_READ&&n!=MBEDTLS_ERR_SSL_WANT_WRITE)){lastError_=n?n:-100004;closePending_=true;}
    connected_=sctp_.established();if(!closePending_){sctp_.tick(millis());if(!rpc_.tick(sctp_,millis())){lastError_=-100003;closePending_=true;}}
    if(!sctp_.established()&&now-dtlsStarted_>20000)closePending_=true;
   }
   // SCTP owns liveness for an established peer. Its heartbeat is emitted
   // every 15 seconds and closes the association after missed acknowledgements.
   // Do not use application traffic as a second idle timeout: Safari may spend
   // minutes waiting for a model response while the RTC/SCTP heartbeat keeps
   // the connection healthy. The old 60-second check closed exactly those
   // otherwise healthy browser sessions.
   if(closePending_)clearPeer();
  }
  void stop(){
   if(initialized_){if(tlsConfigured_)clearPeer();mbedtls_ssl_free(&ssl_);mbedtls_ssl_config_free(&conf_);mbedtls_ssl_cookie_free(&cookie_);mbedtls_x509_crt_free(&cert_);mbedtls_pk_free(&key_);mbedtls_ctr_drbg_free(&rng_);mbedtls_entropy_free(&entropy_);initialized_=false;tlsConfigured_=false;}
   if(udp_>=0){close(udp_);udp_=-1;}ready_=false;
  }
 private:
  static int sendUdp(void* ctx,const unsigned char* p,size_t n){auto* self=static_cast<RtcBridge*>(ctx);if(!self->peerKnown_)return MBEDTLS_ERR_SSL_WANT_WRITE;int sent=sendto(self->udp_,p,n,0,reinterpret_cast<sockaddr*>(&self->peer_),sizeof(self->peer_));const int code=sent<0?errno:0;if(sent<0){self->lastDatagramError_=code;if(rtc::udpBackpressure(code))self->droppedDatagrams_++;}const int result=rtc::udpSendResult(sent,n,code);return result<0?MBEDTLS_ERR_SSL_INTERNAL_ERROR:result;}
  static int receiveUdp(void* ctx,unsigned char* p,size_t n){auto* self=static_cast<RtcBridge*>(ctx);sockaddr_in from{};socklen_t length=sizeof(from);int got=recvfrom(self->udp_,p,n,0,reinterpret_cast<sockaddr*>(&from),&length);if(got<=0)return MBEDTLS_ERR_SSL_WANT_READ;
   if(p[0]<4){self->stun(p,got,from,millis());return MBEDTLS_ERR_SSL_WANT_READ;}if(!self->samePeer(from))return MBEDTLS_ERR_SSL_WANT_READ;return got;
  }
  static void setTimer(void* ctx,uint32_t intermediate,uint32_t finalMs){auto* s=static_cast<RtcBridge*>(ctx);s->timerStart_=millis();s->timerIntermediate_=intermediate;s->timerFinal_=finalMs;}
  static int getTimer(void* ctx){auto* s=static_cast<RtcBridge*>(ctx);if(!s->timerFinal_)return -1;uint32_t elapsed=millis()-s->timerStart_;return elapsed>=s->timerFinal_?2:elapsed>=s->timerIntermediate_?1:0;}
  bool samePeer(const sockaddr_in& p)const{return peerKnown_&&p.sin_addr.s_addr==peer_.sin_addr.s_addr&&p.sin_port==peer_.sin_port;}
  static bool iceChars(const char* s,size_t n,size_t minimum){if(n<minimum||n>256)return false;for(size_t i=0;i<n;i++){char c=s[i];if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='+'||c=='/'))return false;}return true;}
  static uint32_t crc32(const uint8_t* b,size_t n){uint32_t crc=0xffffffff;for(size_t i=0;i<n;i++){crc^=b[i];for(int j=0;j<8;j++)crc=(crc>>1)^((crc&1)?0xedb88320:0);}return ~crc;}
  bool stun(uint8_t* b,size_t n,const sockaddr_in& from,uint32_t now){
   using S=rtc::Sctp;if(n<20||S::read16(b)!=1||S::read16(b+2)!=n-20||std::memcmp(b+4,"\x21\x12\xa4\x42",4))return false;
   char username[514]{};size_t size=0,mi=0;bool nomination=false;
   for(size_t at=20;at+4<=n;){uint16_t type=S::read16(b+at),length=S::read16(b+at+2);if(at+4+length>n)return false;
    if(type==6){if(size||length>=sizeof(username))return false;std::memcpy(username,b+at+4,length);size=length;}
    if(type==8){if(mi||length!=20)return false;mi=at;break;}if(type==0x25&&length==0)nomination=true;at+=(4+length+3)&~size_t(3);
   }
   if(!size||!mi)return false;char* colon=static_cast<char*>(std::memchr(username,':',size));if(!colon)return false;
   size_t serverLength=colon-username,clientLength=size-serverLength-1;static const char prefix[]="libp2p+webrtc+v2/";
   if(!iceChars(username,serverLength,4)||!iceChars(colon+1,clientLength,4)||serverLength<sizeof(prefix)-1||std::memcmp(username,prefix,sizeof(prefix)-1)||!iceChars(username+sizeof(prefix)-1,serverLength-(sizeof(prefix)-1),22))return false;
   uint8_t expected[20];uint16_t original=S::read16(b+2);S::write16(b+2,mi+4);int result=mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA1),reinterpret_cast<uint8_t*>(username),serverLength,b,mi,expected);S::write16(b+2,original);
   uint8_t diff=0;for(int i=0;i<20;i++)diff|=expected[i]^b[mi+4+i];if(result||diff)return false;
   bool current=samePeer(from)&&std::strlen(password_)==serverLength&&!std::memcmp(password_,username,serverLength);
   bool replacing=nomination&&!current;
   // A new unauthenticated ICE request cannot evict a live writer/connection.
   if(replacing&&((peerKnown_&&now-lastPeerActivity_<45000)||rpc_.busy()||(canReplace_&&!canReplace_())))return false;
   if(current)lastPeerActivity_=now;
   uint8_t reply[64]{};S::write16(reply,0x101);std::memcpy(reply+4,b+4,16);S::write16(reply+20,0x20);S::write16(reply+22,8);reply[25]=1;S::write16(reply+26,ntohs(from.sin_port)^0x2112);S::write32(reply+28,ntohl(from.sin_addr.s_addr)^0x2112a442);
   S::write16(reply+32,8);S::write16(reply+34,20);S::write16(reply+2,36);mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA1),reinterpret_cast<uint8_t*>(username),serverLength,reply,32,reply+36);
   S::write16(reply+56,0x8028);S::write16(reply+58,4);S::write16(reply+2,44);S::write32(reply+60,crc32(reply,56)^0x5354554e);sendto(udp_,reply,sizeof(reply),0,reinterpret_cast<const sockaddr*>(&from),sizeof(from));
   if(replacing){nextPeer_=from;std::memcpy(nextPassword_,username,serverLength);nextPassword_[serverLength]=0;replacementPending_=true;}return true;
  }
  void clearPeer(){
   bool notify=connected_.load()||rpc_.completed()>0;
   if(peerKnown_){closeCount_++;lastCloseAt_=millis();lastCloseError_=lastError_.load();lastSctpFailure_=static_cast<int>(sctp_.failure());}
   if(dtlsReady_)mbedtls_ssl_close_notify(&ssl_);mbedtls_ssl_session_reset(&ssl_);
   peerKnown_=dtlsReady_=replacementPending_=closePending_=false;connected_=false;timerFinal_=0;password_[0]=0;rpc_.reset();
   std::array<uint8_t,16> cookie{};mbedtls_ctr_drbg_random(&rng_,cookie.data(),cookie.size());sctp_.reset(millis(),esp_random(),esp_random(),cookie);
   if(notify&&disconnected_)disconnected_();
  }
  void applyReplacement(){
   if(rpc_.busy()||(canReplace_&&!canReplace_())){replacementPending_=false;return;}
   sockaddr_in selected=nextPeer_;char password[257];std::memcpy(password,nextPassword_,sizeof(password));clearPeer();
   lastError_=0;lastAbort_=0;lastChunk_=-1;
   peer_=selected;std::memcpy(password_,password,sizeof(password_));peerKnown_=true;lastPeerActivity_=handshakeStarted_=millis();
   if(mbedtls_ssl_set_client_transport_id(&ssl_,reinterpret_cast<const uint8_t*>(&peer_),sizeof(peer_)))clearPeer();
  }
  const uint16_t localPort_;
  Dispatch dispatch_;Disconnect disconnected_;CanReplace canReplace_;std::atomic<bool>ready_{false},connected_{false};std::atomic<bool>dtlsReady_{false};bool initialized_=false,tlsConfigured_=false,peerKnown_=false,replacementPending_=false,closePending_=false;
  std::atomic<int>lastError_{0},lastChunk_{-1},lastAbort_{0};std::atomic<unsigned>completedRequests_{0},maxSctpBytes_{0},dataFlagsSeen_{0};int udp_=-1;sockaddr_in peer_{},nextPeer_{};char password_[257]{},nextPassword_[257]{};uint32_t lastPeerActivity_=0,handshakeStarted_=0,dtlsStarted_=0,timerStart_=0,timerIntermediate_=0,timerFinal_=0;
  std::atomic<unsigned>droppedDatagrams_{0},closeCount_{0},maxHeartbeatBytes_{0};std::atomic<int>lastDatagramError_{0},lastCloseError_{0},lastSctpFailure_{0};std::atomic<uint32_t>lastCloseAt_{0};
  mbedtls_ssl_context ssl_{};mbedtls_ssl_config conf_{};mbedtls_ssl_cookie_ctx cookie_{};mbedtls_entropy_context entropy_{};mbedtls_ctr_drbg_context rng_{};mbedtls_x509_crt cert_{};mbedtls_pk_context key_{};
  // Both slots are serviced serially by the same task. Input callbacks copy
  // complete frames into their own SCTP/RPC state before the next loop call.
  WireBuffer& wire_;rtc::Sctp sctp_;rtc::Rpc rpc_;
};
}
