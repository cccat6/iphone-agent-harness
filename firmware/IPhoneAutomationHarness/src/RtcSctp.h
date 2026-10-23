#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <functional>

// Deliberately bounded SCTP subset: reliable ordered stream 0, whole text messages
// <=512 bytes, including bounded DATA-fragment reassembly. No partial reliability,
// additional streams or message interleaving.
namespace iah { namespace rtc {
class Sctp {
 public:
  static constexpr size_t MaxMessage=512, Window=8;
  using Send=std::function<bool(const uint8_t*,size_t)>;
  using Message=std::function<void(const uint8_t*,size_t)>;
  using Closed=std::function<void()>;
  enum class State {Idle,CookieWait,Established,Drain,Closing,Closed};
  enum class Failure {None,CookieTimeout,RetransmitTimeout,HeartbeatTimeout,PeerAbort,SendFailure,StreamSequence,Fragment,Shutdown,Protocol};
  void callbacks(Send send,Message message,Closed closed){send_=send;message_=message;closed_=closed;}
  void reset(uint32_t now,uint32_t tag,uint32_t tsn,const std::array<uint8_t,16>& cookie){
   state_=State::Idle;failure_=Failure::None;localTag_=tag?tag:1;nextTx_=tsn;lastTx_=tsn-1;cookie_=cookie;remoteTag_=0;rxCum_=0;rxSsn_=txSsn_=0;rxFragmenting_=false;rxMessageSize_=0;txWaiting_=false;duplicates_=0;peerWindow_=4096;lastActivity_=now;lastHeartbeat_=now;lastHeartbeatSend_=now;heartbeatPending_=false;for(auto& x:rx_)x.valid=false;
  }
  bool established()const{return state_==State::Established;}
  bool idleToSend()const{return established()&&!txWaiting_&&peerWindow_>0;}
  bool pending()const{return txWaiting_;}
  State state()const{return state_;}
  Failure failure()const{return failure_;}
  uint32_t cumulative()const{return rxCum_;}
  static uint16_t read16(const uint8_t* p){return uint16_t(p[0])<<8|p[1];}
  static uint32_t read32(const uint8_t* p){return uint32_t(p[0])<<24|uint32_t(p[1])<<16|uint32_t(p[2])<<8|p[3];}
  static void write16(uint8_t* p,uint16_t v){p[0]=v>>8;p[1]=v;}
  static void write32(uint8_t* p,uint32_t v){p[0]=v>>24;p[1]=v>>16;p[2]=v>>8;p[3]=v;}
  static uint32_t crc(const uint8_t* p,size_t n){uint32_t c=0xffffffff;for(size_t i=0;i<n;i++){c^=(i>=8&&i<12)?0:p[i];for(int j=0;j<8;j++)c=(c>>1)^((c&1)?0x82f63b78:0);}return ~c;}
  static void checksum(uint8_t* p,size_t n){uint32_t c=crc(p,n);for(int i=0;i<4;i++)p[8+i]=uint8_t(c>>(i*8));}
  static bool after(uint32_t a,uint32_t b){return int32_t(a-b)>0;}
  bool sendText(const uint8_t* data,size_t n,uint32_t now){
   if(!idleToSend()||!n||n>MaxMessage||peerWindow_<n)return false;
   txSize_=12+16+n;txSize_=(txSize_+3)&~size_t(3);tx_.fill(0);header(tx_.data(),remoteTag_);
   // B/E plus the SCTP I bit requests immediate SACKs. Stop-and-wait RPC
   // fragments must not each wait for the browser delayed-ACK timer.
   auto* c=tx_.data()+12;c[0]=0;c[1]=0x0b;write16(c+2,16+n);txTsn_=nextTx_++;lastTx_=txTsn_;write32(c+4,txTsn_);write16(c+8,0);write16(c+10,txSsn_++);write32(c+12,51);std::memcpy(c+16,data,n);checksum(tx_.data(),txSize_);
   txWaiting_=true;txRetries_=0;txRto_=300;txDeadline_=now+txRto_;if(!send_(tx_.data(),txSize_)){fail(Failure::SendFailure);return false;}return true;
  }
  void input(const uint8_t* p,size_t n,uint32_t now){
   if(state_==State::Closed||n<16||n>2048||read16(p)!=5000||read16(p+2)!=5000)return;
   uint32_t wire=uint32_t(p[8])|uint32_t(p[9])<<8|uint32_t(p[10])<<16|uint32_t(p[11])<<24;if(wire!=crc(p,n))return;
   // Validate all chunk boundaries before any application callback can run.
   size_t count=0;for(size_t at=12;at<n;){if(at+4>n||++count>16)return;uint16_t len=read16(p+at+2);if(len<4||at+len>n)return;
    if(p[at]!=0&&p[at]!=1&&p[at]!=3&&p[at]!=4&&p[at]!=5&&p[at]!=6&&p[at]!=7&&p[at]!=8&&p[at]!=10&&p[at]!=11&&p[at]!=14&&(p[at]&0xc0)<0x80)return;
    if(p[at]==0&&(len<=16||len>16+MaxMessage||(p[at+1]&4)!=0||read16(p+at+8)!=0||read32(p+at+12)!=51))return;
    if(p[at]==1&&(at!=12||len<20||((len+3)&~size_t(3))+12!=n))return;
    if(p[at]==3&&(len<16||size_t(16)+4*read16(p+at+12)+4*read16(p+at+14)!=len))return;
    if((p[at]==4||p[at]==5)&&(len<8||len>1172||read16(p+at+4)!=1||read16(p+at+6)!=len-4))return;
    if((p[at]==7&&len!=8)||((p[at]==8||p[at]==11||p[at]==14)&&len!=4)||(p[at]==10&&len!=20))return;
    at+=(len+3)&~size_t(3);if(at>n)return;
   }
   uint32_t tag=read32(p+4);if(p[12]==1){if(tag!=0)return;}else if(tag!=localTag_)return;
   bool sack=false;
   for(size_t at=12;at<n&&state_!=State::Closed;){auto* c=p+at;uint16_t len=read16(c+2);uint8_t type=c[0];
    if(type==1){
     uint32_t remote=read32(c+4),initial=read32(c+16);if(!remote||!read16(c+12)||!read16(c+14))return;
     if(state_==State::Idle){remoteTag_=remote;peerInitial_=initial;rxCum_=initial-1;peerWindow_=read32(c+8);state_=State::CookieWait;cookieDeadline_=now+30000;}
     if(state_==State::CookieWait&&remote==remoteTag_&&initial==peerInitial_)initAck();
    }else if(type==10){
     uint8_t diff=0;for(size_t i=0;i<16;i++)diff|=c[4+i]^cookie_[i];if(diff||state_==State::Idle)return;
     if(state_==State::CookieWait){if(expired(now,cookieDeadline_)){fail();return;}state_=State::Established;lastHeartbeat_=now;}
     if(state_==State::Established)emit(11,0,nullptr,0);
    }else if(type==0){
     if(state_!=State::Established)return;uint32_t tsn=read32(c+4);size_t size=len-16;
     if(!after(tsn,rxCum_)){duplicate(tsn);sack=true;}
     else if(uint32_t(tsn-rxCum_)<=Window){
      Slot* free=nullptr;bool exists=false;for(auto& slot:rx_){if(slot.valid&&slot.tsn==tsn)exists=true;if(!slot.valid&&!free)free=&slot;}
      if(exists)duplicate(tsn);else if(free){free->valid=true;free->tsn=tsn;free->ssn=read16(c+10);free->flags=c[1]&3;free->size=size;std::memcpy(free->data.data(),c+16,size);}sack=true;
      while(state_==State::Established){Slot* ready=nullptr;for(auto& slot:rx_)if(slot.valid&&slot.tsn==rxCum_+1){ready=&slot;break;}if(!ready)break;
       if(ready->ssn!=rxSsn_){abort(Failure::StreamSequence);return;}
       const bool begin=(ready->flags&2)!=0,end=(ready->flags&1)!=0;
       // Only the next contiguous TSN reaches reassembly. All fragments of an
       // ordered message share one SSN; duplicates never reach this branch.
       if(begin==rxFragmenting_||rxMessageSize_+ready->size>MaxMessage){abort(Failure::Fragment);return;}
       ++rxCum_;ready->valid=false;
       if(begin&&end){++rxSsn_;if(message_)message_(ready->data.data(),ready->size);}
       else{
        std::memcpy(rxMessage_.data()+rxMessageSize_,ready->data.data(),ready->size);rxMessageSize_+=ready->size;rxFragmenting_=!end;
        if(end){const size_t complete=rxMessageSize_;rxMessageSize_=0;++rxSsn_;if(message_)message_(rxMessage_.data(),complete);}
       }
      }
     }else sack=true;
    }else if(type==3){if(state_==State::Established||state_==State::Drain)ack(c,len);}
    else if(type==4){if(state_==State::Established)emit(5,0,c+4,len-4);}
    else if(type==5){if(len==16&&heartbeatPending_&&!std::memcmp(c+8,heartbeat_.data(),8)){heartbeatPending_=false;lastHeartbeat_=now;}}
    else if(type==6){fail(Failure::PeerAbort);return;}
    else if(type==7){if(state_==State::Established||state_==State::Drain||state_==State::Closing){ackCumulative(read32(c+4));state_=State::Drain;if(!txWaiting_)shutdownAck(now);}}
    else if(type==14){if(state_==State::Closing)fail();}
    else if(type==8||type==11){}
    else if((type&0xc0)<0x80)return; // Unsupported mandatory chunks are not interpreted.
    lastActivity_=now;if(state_==State::Established&&type!=5)heartbeatPending_=false;at+=(len+3)&~size_t(3);
   }
   if(sack&&state_==State::Established)sendSack();
  }
  void tick(uint32_t now){
   if(state_==State::CookieWait&&expired(now,cookieDeadline_)){fail(Failure::CookieTimeout);return;}
   if(txWaiting_&&expired(now,txDeadline_)){if(txRetries_++>=6){fail(Failure::RetransmitTimeout);return;}if(!send_(tx_.data(),txSize_)){fail(Failure::SendFailure);return;}txRto_=txRto_<2000?txRto_*2:2000;txDeadline_=now+txRto_;}
   if(state_==State::Drain&&!txWaiting_)shutdownAck(now);
   if(state_==State::Closing&&expired(now,closeDeadline_)){if(closeRetries_++>=5){fail();return;}emit(8,0,nullptr,0);closeDeadline_=now+1000;}
   // Any valid SCTP traffic from this authenticated DTLS peer proves liveness.
   // Send heartbeats only while idle; an unanswered probe cannot invalidate
   // a peer that has continued sending DATA, SACK or its own heartbeats.
   if(state_==State::Established&&now-lastActivity_>=15000){
    if(heartbeatPending_&&now-lastActivity_>=45000){fail(Failure::HeartbeatTimeout);return;}
    if(!heartbeatPending_){write32(heartbeat_.data(),now);write32(heartbeat_.data()+4,localTag_);heartbeatPending_=true;}
    if(now-lastHeartbeatSend_>=5000){uint8_t body[12];write16(body,1);write16(body+2,12);std::memcpy(body+4,heartbeat_.data(),8);emit(4,0,body,12);lastHeartbeatSend_=now;}
   }
  }
  void abort(Failure cause=Failure::Protocol){if(remoteTag_)emit(6,0,nullptr,0);fail(cause);}
 private:
  struct Slot{bool valid=false;uint32_t tsn=0;uint16_t ssn=0;uint8_t flags=0;size_t size=0;std::array<uint8_t,MaxMessage>data{};};
  static bool expired(uint32_t now,uint32_t due){return int32_t(now-due)>=0;}
  void header(uint8_t* p,uint32_t tag){write16(p,5000);write16(p+2,5000);write32(p+4,tag);std::memset(p+8,0,4);}
  bool emit(uint8_t type,uint8_t flags,const uint8_t* body,size_t size){if(size>1168)return false;std::array<uint8_t,1200> p{};header(p.data(),remoteTag_);p[12]=type;p[13]=flags;write16(p.data()+14,size+4);if(size)std::memcpy(p.data()+16,body,size);size_t n=(16+size+3)&~size_t(3);checksum(p.data(),n);if(!send_||!send_(p.data(),n)){fail(Failure::SendFailure);return false;}return true;}
  void initAck(){uint8_t body[36]{};write32(body,localTag_);write32(body+4,Window*MaxMessage);write16(body+8,1);write16(body+10,1);write32(body+12,nextTx_);write16(body+16,7);write16(body+18,20);std::memcpy(body+20,cookie_.data(),16);emit(2,0,body,sizeof(body));}
  void duplicate(uint32_t tsn){if(duplicates_<dups_.size())dups_[duplicates_++]=tsn;}
  void sendSack(){uint8_t body[12+Window*4+16]{};write32(body,rxCum_);size_t occupied=0;for(auto& slot:rx_)if(slot.valid)occupied+=slot.size;write32(body+4,Window*MaxMessage-occupied);
   uint16_t gaps=0;size_t at=12;for(uint16_t offset=1;offset<=Window;){bool found=false;for(auto& slot:rx_)if(slot.valid&&slot.tsn==rxCum_+offset)found=true;if(!found){++offset;continue;}uint16_t first=offset,last=offset;
    while(++offset<=Window){bool next=false;for(auto& slot:rx_)if(slot.valid&&slot.tsn==rxCum_+offset)next=true;if(!next)break;last=offset;}
    write16(body+at,first);write16(body+at+2,last);at+=4;++gaps;
   }write16(body+8,gaps);write16(body+10,duplicates_);for(size_t i=0;i<duplicates_;i++){write32(body+at,dups_[i]);at+=4;}emit(3,0,body,at);duplicates_=0;
  }
  void ackCumulative(uint32_t cumulative){if(after(cumulative,lastTx_))return;if(txWaiting_&&!after(txTsn_,cumulative))txWaiting_=false;}
  void ack(const uint8_t* c,size_t){uint32_t cumulative=read32(c+4);if(after(cumulative,lastTx_))return;
   uint16_t previous=0;for(uint16_t i=0;i<read16(c+12);i++){uint16_t first=read16(c+16+i*4),last=read16(c+18+i*4);if(!first||first>last||first<=previous||after(cumulative+last,lastTx_))return;previous=last;}
   peerWindow_=read32(c+8);ackCumulative(cumulative);
   for(uint16_t i=0;i<read16(c+12);i++){uint16_t first=read16(c+16+i*4),last=read16(c+18+i*4);if(txWaiting_&&uint32_t(txTsn_-cumulative)>=first&&uint32_t(txTsn_-cumulative)<=last)txWaiting_=false;}
  }
  void shutdownAck(uint32_t now){state_=State::Closing;closeRetries_=0;closeDeadline_=now+1000;emit(8,0,nullptr,0);}
  void fail(Failure cause=Failure::Shutdown){if(state_==State::Closed)return;failure_=cause;state_=State::Closed;txWaiting_=false;if(closed_)closed_();}
  Send send_;Message message_;Closed closed_;State state_=State::Idle;Failure failure_=Failure::None;
  uint32_t localTag_=1,remoteTag_=0,nextTx_=0,lastTx_=0,peerInitial_=0,rxCum_=0,peerWindow_=4096,cookieDeadline_=0,lastActivity_=0;
  uint16_t rxSsn_=0,txSsn_=0;bool rxFragmenting_=false;size_t rxMessageSize_=0;std::array<uint8_t,MaxMessage>rxMessage_{};std::array<uint8_t,16>cookie_{};std::array<Slot,Window>rx_{};std::array<uint32_t,4>dups_{};size_t duplicates_=0;
  std::array<uint8_t,12+16+MaxMessage>tx_{};size_t txSize_=0;bool txWaiting_=false;uint32_t txTsn_=0,txDeadline_=0,txRto_=300;unsigned txRetries_=0;
  std::array<uint8_t,8>heartbeat_{};bool heartbeatPending_=false;uint32_t lastHeartbeat_=0,lastHeartbeatSend_=0,closeDeadline_=0;unsigned closeRetries_=0;
};
}}
