#include "../../../firmware/IPhoneAutomationHarness/src/RtcSctp.h"
#include "../../../firmware/IPhoneAutomationHarness/src/RtcRpc.h"
#include "../../../firmware/IPhoneAutomationHarness/src/RtcUdpSend.h"
#include <cassert>
#include <iostream>
#include <vector>
#include <algorithm>
using iah::rtc::Sctp;using iah::rtc::Rpc;using Bytes=std::vector<uint8_t>;
Bytes packet(uint8_t type,const Bytes& body={},uint8_t flags=0,uint32_t tag=777){Bytes p((16+body.size()+3)&~size_t(3));Sctp::write16(p.data(),5000);Sctp::write16(p.data()+2,5000);Sctp::write32(p.data()+4,tag);p[12]=type;p[13]=flags;Sctp::write16(p.data()+14,body.size()+4);std::copy(body.begin(),body.end(),p.begin()+16);Sctp::checksum(p.data(),p.size());return p;}
Bytes data(uint32_t tsn,uint16_t ssn,const std::string& text){Bytes body(12+text.size());Sctp::write32(body.data(),tsn);Sctp::write16(body.data()+6,ssn);Sctp::write32(body.data()+8,51);std::copy(text.begin(),text.end(),body.begin()+12);return packet(0,body,3);}
Bytes fragment(uint32_t tsn,uint16_t ssn,const std::string& text,uint8_t flags){auto p=data(tsn,ssn,text);p[13]=flags;Sctp::checksum(p.data(),p.size());return p;}
Bytes ack(uint32_t cumulative,uint16_t first=0,uint16_t last=0){Bytes body(first?16:12);Sctp::write32(body.data(),cumulative);Sctp::write32(body.data()+4,4096);if(first){Sctp::write16(body.data()+8,1);Sctp::write16(body.data()+12,first);Sctp::write16(body.data()+14,last);}return packet(3,body);}
struct Fixture{Sctp s;std::vector<Bytes> sent;std::vector<std::string> messages;unsigned closed=0;std::array<uint8_t,16>cookie{};
 Fixture(){for(size_t i=0;i<cookie.size();i++)cookie[i]=i+0xa0;s.callbacks([&](const uint8_t* p,size_t n){sent.emplace_back(p,p+n);return true;},[&](const uint8_t* p,size_t n){messages.emplace_back(reinterpret_cast<const char*>(p),n);},[&]{closed++;});s.reset(0,777,500,cookie);}
 void feed(const Bytes& p,uint32_t now=1){s.input(p.data(),p.size(),now);}
 void init(uint32_t initial=100){Bytes body(16);Sctp::write32(body.data(),42);Sctp::write32(body.data()+4,4096);Sctp::write16(body.data()+8,1);Sctp::write16(body.data()+10,1);Sctp::write32(body.data()+12,initial);feed(packet(1,body,0,0));assert(s.state()==Sctp::State::CookieWait);assert(sent.back()[12]==2);assert(sent.back().size()==52);Bytes c(cookie.begin(),cookie.end());feed(packet(10,c));assert(s.established());assert(sent.back()[12]==11);sent.clear();}
};
std::vector<std::string> frames(const std::string& request,uint32_t n=1,const std::string& id="12345678-1234-4234-8234-123456789abc"){std::vector<std::string> result;unsigned seq=0;for(size_t at=0;at<request.size();at+=256){size_t size=std::min<size_t>(256,request.size()-at);JsonDocument d;d["v"]=1;d["type"]="req";d["id"]=id;d["n"]=n;d["seq"]=seq++;d["end"]=at+size==request.size();d["data"]=Rpc::encode(reinterpret_cast<const uint8_t*>(request.data()+at),size);std::string f;serializeJson(d,f);assert(f.size()<=512);result.push_back(f);}return result;}
bool feedRpc(Rpc& rpc,const std::string& s){return rpc.input(reinterpret_cast<const uint8_t*>(s.data()),s.size(),10);}
std::string request(size_t bodySize=0){JsonDocument d;d["method"]="POST";d["path"]="/v1/test";d["headers"].to<JsonObject>();d["body"]=std::string(bodySize,'a');std::string s;serializeJson(d,s);return s;}
int main(){
 // Browser SCTP heartbeats carry opaque address/timing data exceeding 128B.
 // They may share a packet with DATA: rejecting the heartbeat must not make
 // an otherwise valid application message disappear on every retransmission.
 {Fixture f;f.init();Bytes heartbeat(256);Sctp::write16(heartbeat.data(),1);Sctp::write16(heartbeat.data()+2,heartbeat.size());for(size_t i=4;i<heartbeat.size();i++)heartbeat[i]=static_cast<uint8_t>(i);
  auto combined=packet(4,heartbeat),application=data(100,0,"application alongside heartbeat");combined.insert(combined.end(),application.begin()+12,application.end());Sctp::checksum(combined.data(),combined.size());
  f.feed(combined,20000);assert(f.s.established());assert(f.messages==std::vector<std::string>{"application alongside heartbeat"});
  const auto echoed=std::find_if(f.sent.begin(),f.sent.end(),[](const Bytes& p){return p[12]==5;});assert(echoed!=f.sent.end());assert(std::equal(heartbeat.begin(),heartbeat.end(),echoed->begin()+16));assert(f.sent.back()[12]==3);
 }

 // DATA, SACK and peer HEARTBEAT traffic establish liveness even when an
 // earlier outgoing heartbeat acknowledgement was lost or delayed.
 {Fixture f;f.init();f.s.tick(15001);assert(f.sent.back()[12]==4);
  f.feed(data(100,0,"still active"),20000);f.s.tick(45001);assert(f.s.established());
  f.feed(ack(499),50000);f.s.tick(70000);assert(f.s.established());
  Bytes heartbeat(12);Sctp::write16(heartbeat.data(),1);Sctp::write16(heartbeat.data()+2,12);
  f.feed(packet(4,heartbeat),80000);assert(f.sent.back()[12]==5);f.s.tick(110000);assert(f.s.established()&&f.closed==0);
 }
 {Fixture f;f.init();f.s.tick(15001);auto invalid=data(100,0,"invalid");invalid[8]^=1;f.feed(invalid,44000);f.s.tick(45001);assert(f.s.failure()==Sctp::Failure::HeartbeatTimeout&&f.closed==1);}

 // Nonblocking Wi-Fi buffer pressure is a lost datagram, not a lost SCTP
 // association. The first packet drops; retransmission preserves its TSN.
 for(const int cause:{EAGAIN,ENOMEM,ENOBUFS}){
  Fixture f;f.init();bool drop=true;unsigned attempts=0;
  f.s.callbacks([&](const uint8_t* p,size_t n){++attempts;if(drop){drop=false;return iah::rtc::udpSendResult(-1,n,cause)==static_cast<int>(n);}f.sent.emplace_back(p,p+n);return true;},[](const uint8_t*,size_t){},[&]{f.closed++;});
  assert(f.s.sendText(reinterpret_cast<const uint8_t*>("receipt"),7,10));assert(f.s.established()&&f.s.pending()&&f.sent.empty());
  f.s.tick(310);assert(attempts==2&&f.sent.size()==1&&f.s.established());assert(Sctp::read32(f.sent.back().data()+16)==500);
  f.feed(ack(500),311);assert(!f.s.pending()&&f.s.established()&&f.closed==0);
 }
 assert(iah::rtc::udpSendResult(-1,512,EBADF)==-1);

 // A single task scratch can be overwritten between peers: reordered SCTP
 // fragments and incomplete RPC requests must already own their bytes.
 {Fixture a,b;a.init(100);b.init(200);Rpc one,two;std::string gotA,gotB;
  one.dispatch([&](const std::string& text){gotA=text;return std::string("{\"status\":200,\"body\":\"{}\"}");});
  two.dispatch([&](const std::string& text){gotB=text;return std::string("{\"status\":200,\"body\":\"{}\"}");});
  a.s.callbacks([&](const uint8_t* p,size_t n){a.sent.emplace_back(p,p+n);return true;},[&](const uint8_t* p,size_t n){assert(one.input(p,n,10));},[]{});
  b.s.callbacks([&](const uint8_t* p,size_t n){b.sent.emplace_back(p,p+n);return true;},[&](const uint8_t* p,size_t n){assert(two.input(p,n,10));},[]{});
  const auto textA=request(600),textB=request(601);const auto framesA=frames(textA),framesB=frames(textB);
  std::array<uint8_t,2048> scratch{};
  const auto feed=[&](Sctp& peer,const Bytes& bytes){assert(bytes.size()<=scratch.size());std::copy(bytes.begin(),bytes.end(),scratch.begin());peer.input(scratch.data(),bytes.size(),10);scratch.fill(0xdd);};
  feed(a.s,data(101,1,framesA[1]));feed(b.s,data(201,1,framesB[1]));
  feed(a.s,data(100,0,framesA[0]));feed(b.s,data(200,0,framesB[0]));
  for(size_t i=2;i<framesA.size();i++){feed(a.s,data(100+i,i,framesA[i]));feed(b.s,data(200+i,i,framesB[i]));}
  assert(gotA==textA&&gotB==textB&&one.completed()==1&&two.completed()==1);
 }

 {uint8_t zeros[32]{};assert(Sctp::crc(zeros,32)==0x8a9136aa);}
 {Fixture f;f.init();f.feed(data(101,1,"second"));assert(f.messages.empty());auto sack=f.sent.back();assert(Sctp::read32(sack.data()+16)==99);assert(Sctp::read16(sack.data()+24)==1);assert(Sctp::read16(sack.data()+28)==2);f.feed(data(100,0,"first"));assert((f.messages==std::vector<std::string>{"first","second"}));assert(f.s.cumulative()==101);f.feed(data(100,0,"first"));assert(f.messages.size()==2);assert(Sctp::read16(f.sent.back().data()+26)==1);}
 {Fixture f;f.init();auto p=data(100,0,"once");p[8]^=1;f.feed(p);assert(f.messages.empty());p=data(100,0,"once");Sctp::write32(p.data()+4,778);Sctp::checksum(p.data(),p.size());f.feed(p);assert(f.messages.empty());f.feed(data(108,8,"far"));assert(f.messages.empty()&&f.s.cumulative()==99);}
 {Fixture f;Bytes body(16);Sctp::write32(body.data(),42);Sctp::write16(body.data()+8,1);Sctp::write16(body.data()+10,1);f.feed(packet(1,body,0,0));Bytes bad(16);f.feed(packet(10,bad));assert(!f.s.established());}
 {Fixture f;f.init();assert(f.s.sendText(reinterpret_cast<const uint8_t*>("hello"),5,10));Bytes original=f.sent.back();f.feed(ack(499,1,9));assert(f.s.pending());f.s.tick(310);assert(f.sent.back()==original&&f.s.pending());f.feed(ack(500),311);assert(!f.s.pending());assert(f.s.sendText(reinterpret_cast<const uint8_t*>("two"),3,312));f.feed(ack(500,1,1),313);assert(!f.s.pending());}
 {Fixture f;f.init();assert(f.s.sendText(reinterpret_cast<const uint8_t*>("lost"),4,0));for(uint32_t t=300;t<30000&&f.s.state()!=Sctp::State::Closed;t+=2400)f.s.tick(t);assert(f.s.state()==Sctp::State::Closed&&f.closed==1);}
 {Fixture f;f.init(0xffffffff);f.feed(data(0,1,"b"));f.feed(data(0xffffffff,0,"a"));assert((f.messages==std::vector<std::string>{"a","b"}));}
 {Fixture f;f.init();f.s.tick(15001);assert(f.sent.back()[12]==4);Bytes body(f.sent.back().begin()+16,f.sent.back().end());f.feed(packet(5,body),15002);f.s.tick(45000);assert(f.s.established());Bytes sd(4);Sctp::write32(sd.data(),499);f.feed(packet(7,sd),45001);assert(f.s.state()==Sctp::State::Closing&&f.sent.back()[12]==8);f.feed(packet(14),45002);assert(f.closed==1);}
 {Fixture f;f.init();f.feed(data(100,2,"wrong sequence"));assert(f.messages.empty()&&f.closed==1);}
 {Rpc rpc;unsigned called=0;rpc.dispatch([&](const std::string&){called++;return std::string("{\"status\":200,\"body\":\"{\\\"ok\\\":true}\"}");});auto pieces=frames(request(600));for(size_t i=0;i<pieces.size();i++){assert(feedRpc(rpc,pieces[i]));assert(called==(i+1==pieces.size()?1:0));}assert(rpc.completed()==1);assert(!feedRpc(rpc,pieces[0]));Fixture f;f.init();for(unsigned i=0;i<20&&rpc.busy();i++){assert(rpc.tick(f.s,20+i));if(f.s.pending()){auto p=f.sent.back();JsonDocument frame;assert(!deserializeJson(frame,reinterpret_cast<char*>(p.data()+28),Sctp::read16(p.data()+14)-16));assert(frame["n"]==1);f.feed(ack(Sctp::read32(p.data()+16)),20+i);}}assert(!rpc.busy());assert(!feedRpc(rpc,pieces[0])&&called==1);assert(!feedRpc(rpc,frames(request(),3)[0]));assert(feedRpc(rpc,frames(request(),2)[0])&&called==2);}
 {Rpc rpc;unsigned called=0;rpc.dispatch([&](const std::string&){called++;return std::string("{}");});auto pieces=frames(request(600));assert(feedRpc(rpc,pieces[0]));assert(!feedRpc(rpc,pieces[2]));assert(!called);}
 {std::array<uint8_t,256> out{};size_t n=0;assert(!Rpc::decode("AB==",4,out.data(),n));assert(!Rpc::decode("AA=A",4,out.data(),n));assert(!Rpc::decode("AAAA====",8,out.data(),n));std::string original(256,'x');auto encoded=Rpc::encode(reinterpret_cast<const uint8_t*>(original.data()),original.size());assert(Rpc::decode(encoded.data(),encoded.size(),out.data(),n)&&n==256);}
 {Rpc rpc;unsigned called=0;std::string received;JsonDocument response;response["status"]=200;response["body"]=std::string(15000,'z');std::string expected;serializeJson(response,expected);rpc.dispatch([&](const std::string& s){called++;received=s;return expected;});auto text=request(Rpc::RequestLimit-request().size());assert(text.size()==Rpc::RequestLimit);auto pieces=frames(text);assert(pieces.size()==48);for(auto& f:pieces)assert(feedRpc(rpc,f));assert(called==1&&received==text);Fixture f;f.init();std::string assembled;unsigned seq=0;for(unsigned loop=0;loop<100&&rpc.busy();loop++){assert(rpc.tick(f.s,100+loop));if(f.s.pending()){auto p=f.sent.back();size_t length=Sctp::read16(p.data()+14)-16;assert(length<=512);JsonDocument frame;assert(!deserializeJson(frame,p.data()+28,length));assert(frame["seq"].as<unsigned>()==seq++&&frame["n"]==1);std::array<uint8_t,256> bytes{};size_t decoded=0;auto encoded=frame["data"].as<JsonString>();assert(Rpc::decode(encoded.c_str(),encoded.size(),bytes.data(),decoded));assert(frame["end"].as<bool>()||decoded==256);assembled.append(reinterpret_cast<char*>(bytes.data()),decoded);f.feed(ack(Sctp::read32(p.data()+16)),100+loop);}}assert(!rpc.busy()&&assembled==expected&&seq>48);}
 {Rpc rpc;unsigned called=0;rpc.dispatch([&](const std::string&){called++;return std::string("{}");});assert(!feedRpc(rpc,frames(request(),0)[0]));assert(!feedRpc(rpc,frames(request(),2)[0]));auto pieces=frames(request(500));assert(feedRpc(rpc,pieces[0]));Fixture f;f.init();assert(!rpc.tick(f.s,30011));assert(!called);}
 {Rpc rpc;auto p=frames(request())[0];JsonDocument frame;assert(!deserializeJson(frame,p));frame["end"]=false;std::string shortPart;serializeJson(frame,shortPart);assert(!feedRpc(rpc,shortPart));}
 {Fixture f;f.init();auto p=data(100,0,"unordered");p[13]=7;Sctp::checksum(p.data(),p.size());f.feed(p);assert(f.messages.empty());f.feed(data(100,0,"ordered"));Bytes cookie(f.cookie.begin(),f.cookie.end());f.feed(packet(10,cookie));assert(f.s.cumulative()==100&&f.messages.size()==1&&f.sent.back()[12]==11);}
 {uint32_t seed=0x321c0de;for(unsigned i=0;i<800;i++){Fixture f;f.init();Bytes p=(i%2)?data(100,0,"boundary"):ack(500);for(unsigned j=0;j<4;j++){seed=seed*1664525+1013904223;p[seed%p.size()]^=uint8_t(seed>>24);}if(i%3)Sctp::checksum(p.data(),p.size());if(i%7==0)p.resize((seed>>8)%p.size());f.feed(p);}}
 {for(unsigned order=0;order<3;order++){
   Fixture f;f.init();Rpc rpc;unsigned calls=0;bool rejected=false;rpc.dispatch([&](const std::string&){calls++;return std::string("{\"status\":200,\"body\":\"{}\"}");});
   f.s.callbacks([&](const uint8_t* p,size_t n){f.sent.emplace_back(p,p+n);return true;},[&](const uint8_t* p,size_t n){if(!rpc.input(p,n,10))rejected=true;},[&]{f.closed++;});
   f.feed(data(100,0,frames(request(),1)[0]));assert(calls==1&&!rejected);assert(rpc.tick(f.s,10));assert(!rpc.busy()&&f.s.pending());Bytes tail=f.sent.back();
   Bytes next=data(101,1,frames(request(),2)[0]);Bytes sack=ack(500);
   if(order<2){Bytes combined=order==0?sack:next;const auto& second=order==0?next:sack;combined.insert(combined.end(),second.begin()+12,second.end());Sctp::checksum(combined.data(),combined.size());f.feed(combined,11);assert(!f.s.pending());}
   else {f.feed(next,11);assert(f.s.pending());auto count=f.sent.size();assert(rpc.tick(f.s,12));assert(f.sent.size()==count);f.s.tick(310);assert(f.sent.back()==tail);f.feed(sack,311);}
   assert(calls==2&&!rejected&&rpc.completed()==2&&f.closed==0);assert(rpc.tick(f.s,312));assert(f.s.pending());auto response=f.sent.back();JsonDocument frame;assert(!deserializeJson(frame,response.data()+28,Sctp::read16(response.data()+14)-16));assert(frame["n"]==2);
  }}
 // Receiving a datagram can exceed the sender's 1200-byte packet budget.
 {Fixture f;f.init();auto p=data(100,0,std::string(500,'a'));
  for(unsigned i=1;i<3;i++){auto next=data(100+i,i,std::string(500,char('a'+i)));p.insert(p.end(),next.begin()+12,next.end());}
  Sctp::checksum(p.data(),p.size());assert(p.size()>1200&&p.size()<=2048);f.feed(p);
  assert(f.messages==std::vector<std::string>({std::string(500,'a'),std::string(500,'b'),std::string(500,'c')}));
  assert(f.s.cumulative()==102&&f.closed==0);
 }
 {Fixture f;f.init();auto oversized=data(100,0,std::string(513,'x'));f.feed(oversized);assert(f.messages.empty());
  auto p=data(100,0,std::string(500,'x'));for(unsigned i=1;i<4;i++){auto next=data(100+i,i,std::string(500,'x'));p.insert(p.end(),next.begin()+12,next.end());}
  Sctp::checksum(p.data(),p.size());assert(p.size()>2048);f.feed(p);assert(f.messages.empty()&&f.s.cumulative()==99);
  f.feed(data(100,0,""));assert(f.messages.empty()&&f.s.cumulative()==99);
 }
 // Ordered fragments keep their SSN until E, including TSN wrap and reorder.
 {for(uint32_t first:{uint32_t(100),uint32_t(0xffffffff)}){
  Fixture f;f.init(first);auto a=fragment(first,0,std::string(200,'a'),2),b=fragment(first+1,0,std::string(200,'b'),0),c=fragment(first+2,0,std::string(112,'c'),1);
  f.feed(c);f.feed(c);f.feed(b);assert(f.messages.empty());f.feed(a);
  assert(f.messages==std::vector<std::string>({std::string(200,'a')+std::string(200,'b')+std::string(112,'c')}));
  f.feed(a);f.feed(b);f.feed(c);assert(f.messages.size()==1);
  f.feed(data(first+3,1,"next"));assert(f.messages.size()==2&&f.messages[1]=="next"&&f.closed==0);
 }}
 // Invalid reassembly never delivers a partial or oversized message.
 {for(unsigned invalid=0;invalid<6;invalid++){
  Fixture f;f.init();
  if(invalid<2)f.feed(fragment(100,0,"orphan",invalid)); // E-only or middle without B.
  else{f.feed(fragment(100,0,std::string(300,'a'),2));assert(f.messages.empty());
   if(invalid==2)f.feed(fragment(101,0,"second begin",2));
   if(invalid==3)f.feed(fragment(101,1,"wrong ssn",1));
   if(invalid==4)f.feed(fragment(101,0,std::string(213,'b'),1));
   if(invalid==5)f.feed(data(101,0,"whole message during fragment"));
  }
  assert(f.messages.empty()&&f.closed==1&&f.s.state()==Sctp::State::Closed);
  f.s.reset(0,777,500,f.cookie);f.init();f.feed(data(100,0,"reset"));assert(f.messages==std::vector<std::string>({"reset"}));
 }}
 // Application RPC frames may themselves be fragmented by SCTP.
 {Fixture f;f.init();Rpc rpc;unsigned calls=0;bool rejected=false;const auto text=frames(request())[0];
  rpc.dispatch([&](const std::string& received){assert(received==request());++calls;return std::string("{\"status\":200,\"body\":\"{}\"}");});
  f.s.callbacks([&](const uint8_t* p,size_t n){f.sent.emplace_back(p,p+n);return true;},[&](const uint8_t* p,size_t n){if(!rpc.input(p,n,10))rejected=true;},[&]{++f.closed;});
  f.feed(fragment(101,0,text.substr(80),1));f.feed(fragment(100,0,text.substr(0,80),2));
  assert(calls==1&&!rejected&&!f.closed);assert(rpc.tick(f.s,11)&&f.s.pending());
 }
 // A large RPC crosses several receive windows. Browser-style bundled DATA
 // must deliver all application frames; gaps and retransmissions cannot invoke
 // the handler early or twice.
 {for(unsigned mode=0;mode<3;++mode){
   Fixture f;f.init();Rpc rpc;unsigned calls=0;bool rejected=false;
   const auto encoded=request(7000);const auto pieces=frames(encoded);assert(pieces.size()>Sctp::Window);
   rpc.dispatch([&](const std::string& received){assert(received==encoded);++calls;return std::string("{\"status\":200,\"body\":\"{}\"}");});
   f.s.callbacks([&](const uint8_t* p,size_t n){f.sent.emplace_back(p,p+n);return true;},[&](const uint8_t* p,size_t n){if(!rpc.input(p,n,100))rejected=true;},[&]{++f.closed;});
   auto payload=[&](size_t i){return data(uint32_t(100+i),uint16_t(i),pieces[i]);};
   if(mode==0){ // Two ~480-byte messages in each SCTP datagram.
    for(size_t i=0;i<pieces.size();i+=2){auto p=payload(i);if(i+1<pieces.size()){auto next=payload(i+1);p.insert(p.end(),next.begin()+12,next.end());Sctp::checksum(p.data(),p.size());}assert(p.size()<=1200);f.feed(p,100);}
   }else if(mode==1){ // Fill the eight-slot window out of order, then fill gap.
    for(size_t i=0;i<pieces.size();i+=Sctp::Window){size_t end=std::min(pieces.size(),i+Sctp::Window);for(size_t j=end;j>i;--j)f.feed(payload(j-1),100);}
   }else{ // Lose first DATA; excess packets are retried after cumulative SACK.
    for(size_t i=1;i<pieces.size();++i)f.feed(payload(i),100);
    assert(!calls&&f.s.cumulative()==99);f.feed(payload(0),101);
    for(size_t i=1;i<pieces.size();++i)f.feed(payload(i),102);
   }
   assert(calls==1&&!rejected&&!f.closed&&rpc.completed()==1);
   assert(f.s.cumulative()==99+pieces.size());
   assert(rpc.tick(f.s,103)&&f.s.pending());
  }}
 // The UDP loop's timestamp can predate the message callback and dispatch.
 // Exercise the real SCTP DATA callback, not just a standalone elapsed check.
 {for(uint32_t outerNow:{uint32_t(1000),uint32_t(0xfffffffe)}){
   Fixture f;f.init();Rpc rpc;unsigned calls=0;bool rejected=false;uint32_t clock=outerNow;
   rpc.dispatch([&](const std::string& encoded){assert(encoded==request());++calls;++clock;return std::string("{\"status\":200,\"body\":\"{}\"}");});
   f.s.callbacks([&](const uint8_t* p,size_t n){f.sent.emplace_back(p,p+n);return true;},[&](const uint8_t* p,size_t n){++clock;if(!rpc.input(p,n,clock))rejected=true;},[&]{++f.closed;});
   f.feed(data(100,0,frames(request())[0]),outerNow);
   assert(calls==1&&!rejected&&rpc.completed()==1&&clock==uint32_t(outerNow+2));
   assert(rpc.tick(f.s,outerNow)); // Previously underflowed and closed the peer.
   assert(!rpc.busy()&&f.s.pending()&&f.closed==0);
   const auto response=f.sent.back();JsonDocument frame;
   assert(!deserializeJson(frame,response.data()+28,Sctp::read16(response.data()+14)-16));
   assert(frame["type"]=="res"&&frame["n"]==1&&frame["end"]==true);
   f.feed(ack(500),clock);assert(!f.s.pending());assert(rpc.tick(f.s,clock));
  }}
 // Incomplete requests still expire after a genuine 30-second interval,
 // including across millis() wrap. A slightly stale time is not an expiry.
 {for(uint32_t started:{uint32_t(1001),uint32_t(0xfffffff0)}){
   Fixture f;f.init();Rpc rpc;unsigned calls=0;
   rpc.dispatch([&](const std::string&){++calls;return std::string("{}");});
   const auto first=frames(request(600))[0];
   assert(rpc.input(reinterpret_cast<const uint8_t*>(first.data()),first.size(),started));
   assert(rpc.tick(f.s,uint32_t(started-1)));
   assert(rpc.tick(f.s,uint32_t(started+32)));
   assert(rpc.tick(f.s,uint32_t(started+30000)));
   assert(!rpc.tick(f.s,uint32_t(started+30001))&&calls==0);
  }}
 // Two live peers can reuse request numbers independently; resetting one leaves the other live.
 {Fixture first,second;first.init();second.init();Rpc a,b;unsigned calledA=0,calledB=0;
  a.dispatch([&](const std::string&){++calledA;return std::string("{\"status\":200,\"body\":\"first\"}");});
  b.dispatch([&](const std::string&){++calledB;return std::string("{\"status\":200,\"body\":\"second\"}");});
  const auto same=frames(request(),1)[0];assert(feedRpc(a,same));assert(feedRpc(b,same));assert(calledA==1&&calledB==1);
  assert(a.tick(first.s,20)&&b.tick(second.s,20));assert(first.s.pending()&&second.s.pending());
  first.feed(ack(500),21);assert(!first.s.pending()&&second.s.pending());
  a.reset();first.s.reset(22,888,600,first.cookie);assert(second.s.established()&&b.completed()==1);
  second.feed(ack(500),23);assert(feedRpc(b,frames(request(),2)[0]));assert(calledB==2&&calledA==1);
  assert(feedRpc(a,same));assert(calledA==2&&b.completed()==2);
 }
 std::cout<<"RTC protocol: loss/reorder/duplicate/CRC/vtag/cookie/heartbeat/close/monotonic RPC/clock rollover cases passed\n";
}
