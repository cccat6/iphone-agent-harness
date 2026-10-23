#!/usr/bin/env python3
"""Count allocations in the real RPC outgoing tick, with a fixed SCTP sink."""
from pathlib import Path
import os,re,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[3]
source=(ROOT/'firmware/IPhoneAutomationHarness/src/RtcRpc.h').read_text()
source=re.sub(r'JsonDocument (\w+);',r'JsonDocument \1(&allocator);',source).replace(' private:', ' public:')
program=r'''
#include <ArduinoJson.h>
#include <array>
#include <cassert>
#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <new>
#include <functional>
#include <string>
#include <vector>
bool counting=false;size_t newCalls=0,jsonCalls=0;
void* operator new(size_t n){if(counting)++newCalls;void* p=std::malloc(n);if(!p)throw std::bad_alloc();return p;}
void* operator new[](size_t n){return ::operator new(n);}void operator delete(void* p)noexcept{std::free(p);}void operator delete[](void* p)noexcept{std::free(p);}
struct Counter:ArduinoJson::Allocator{void* allocate(size_t n)override{if(counting)++jsonCalls;return std::malloc(n);}void deallocate(void* p)override{std::free(p);}void* reallocate(void* p,size_t n)override{if(counting)++jsonCalls;return std::realloc(p,n);}}allocator;
#include "optimized.h"
using iah::rtc::Rpc;using iah::rtc::Sctp;using Bytes=std::vector<uint8_t>;
Bytes packet(uint8_t type,const Bytes& body={},uint32_t tag=777){Bytes p((16+body.size()+3)&~size_t(3));Sctp::write16(p.data(),5000);Sctp::write16(p.data()+2,5000);Sctp::write32(p.data()+4,tag);p[12]=type;Sctp::write16(p.data()+14,body.size()+4);std::copy(body.begin(),body.end(),p.begin()+16);Sctp::checksum(p.data(),p.size());return p;}
struct Sink{Sctp s;std::array<uint8_t,1200> sent{};size_t size=0;std::array<uint8_t,16>cookie{};
 Sink(){s.callbacks([this](const uint8_t* p,size_t n){assert(n<=sent.size());std::memcpy(sent.data(),p,n);size=n;return true;},[](const uint8_t*,size_t){assert(false);},[]{assert(false);});s.reset(0,777,500,cookie);Bytes init(16);Sctp::write32(init.data(),42);Sctp::write32(init.data()+4,4096);Sctp::write16(init.data()+8,1);Sctp::write16(init.data()+10,1);Sctp::write32(init.data()+12,100);auto p=packet(1,init,0);s.input(p.data(),p.size(),1);p=packet(10,Bytes(cookie.begin(),cookie.end()));s.input(p.data(),p.size(),1);assert(s.established());}
 void ack(){Bytes body(12);Sctp::write32(body.data(),Sctp::read32(sent.data()+16));Sctp::write32(body.data()+4,4096);auto p=packet(3,body);s.input(p.data(),p.size(),10);}
};
int main(){
 // The previous serializer allocated both an encoded string and JSON storage.
 {std::string body(256,'x');counting=true;std::string encoded=Rpc::encode(reinterpret_cast<const uint8_t*>(body.data()),body.size());JsonDocument frame(&allocator);frame["v"]=1;frame["type"]="res";frame["id"]=std::string("12345678-1234-4234-8234-123456789abc");frame["n"]=1;frame["seq"]=0;frame["end"]=false;frame["data"]=encoded;char bytes[513];assert(serializeJson(frame,bytes,sizeof(bytes))<=512);counting=false;assert(newCalls>0&&jsonCalls>0);std::printf("Previous RPC outgoing serializer: %zu string/object and %zu JSON heap allocations per 256-byte frame (host ABI)\n",newCalls,jsonCalls);}
 for(size_t count:{size_t{1},size_t{255},size_t{256},size_t{257},size_t{15950},size_t{16360}}){
  Rpc rpc;rpc.lastCompleted_=0x7ffffffe;std::string reply;JsonDocument response;response["status"]=200;response["body"]=std::string(count,'x');serializeJson(response,reply);assert(reply.size()<=Rpc::ResponseLimit);rpc.dispatch([&](iah::rtc::RequestMessage){return reply;});
  JsonDocument frame;frame["v"]=1;frame["type"]="req";frame["id"]="12345678-1234-4234-8234-123456789abc";frame["n"]=0x7fffffff;frame["seq"]=0;frame["end"]=true;const std::string request="{\"method\":\"GET\",\"path\":\"/v1/identity\",\"headers\":{},\"body\":\"\"}";frame["data"]=Rpc::encode(reinterpret_cast<const uint8_t*>(request.data()),request.size());std::string input;serializeJson(frame,input);assert(rpc.input(reinterpret_cast<const uint8_t*>(input.data()),input.size(),1));
  Sink sink;std::string received;unsigned sequence=0;size_t maximumFrame=0;
  while(rpc.busy()){newCalls=jsonCalls=0;counting=true;assert(rpc.tick(sink.s,10));counting=false;assert(newCalls==0&&jsonCalls==0);assert(sink.s.pending());const size_t size=Sctp::read16(sink.sent.data()+14)-16;maximumFrame=std::max(maximumFrame,size);assert(size<=512);JsonDocument chunk;assert(!deserializeJson(chunk,sink.sent.data()+28,size));assert(chunk.size()==7&&chunk["v"]==1&&chunk["type"]=="res"&&chunk["n"]==0x7fffffff&&chunk["seq"]==sequence++);auto encoded=chunk["data"].as<JsonString>();std::array<uint8_t,Rpc::Chunk> bytes{};size_t decoded=0;assert(Rpc::decode(encoded.c_str(),encoded.size(),bytes.data(),decoded));received.append(reinterpret_cast<const char*>(bytes.data()),decoded);assert(chunk["end"].as<bool>()==(received.size()==reply.size()));sink.ack();}
  assert(received==reply);std::printf("Production RPC outgoing tick: 0 heap allocations, %u frames, max wire frame %zuB, reply %zuB\n",sequence,maximumFrame,reply.size());
 }
}
'''
with tempfile.TemporaryDirectory(prefix='iah-rpc-send-allocation-') as temp:
 folder=Path(temp);(folder/'optimized.h').write_text(source);cpp=folder/'test.cpp';cpp.write_text(program);binary=folder/'test'
 compiler=os.environ.get('CXX');command=[compiler] if compiler else ['/Library/Developer/CommandLineTools/usr/bin/clang++','-isysroot','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-nostdinc++','-isystem','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1']
 flags=['-std=c++17','-Wall','-Wextra','-Werror','-pedantic'];flags+=['-fsanitize=address,undefined','-fno-omit-frame-pointer'] if os.environ.get('RTC_SANITIZE')=='1' else []
 include=os.environ.get('ARDUINOJSON_INCLUDE',str(Path.home()/'Documents/Arduino/libraries/ArduinoJson/src'))
 subprocess.run([*command,*flags,'-I',include,'-I',str(ROOT/'firmware/IPhoneAutomationHarness/src'),str(cpp),'-o',str(binary)],check=True);subprocess.run([str(binary)],check=True)
