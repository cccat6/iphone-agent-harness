#!/usr/bin/env python3
"""Count frame-parser allocations at dispatch using production Rpc input code."""
from pathlib import Path
import os,subprocess,tempfile
root=Path(__file__).resolve().parents[3]
source=(root/'firmware/IPhoneAutomationHarness/src/RtcRpc.h').read_text()
assert source.count('frame.clear();')==1
json_include=os.environ.get('ARDUINOJSON_INCLUDE',str(Path.home()/'Documents/Arduino/libraries/ArduinoJson/src'))
program=r'''
#include <ArduinoJson.h>
#include <cassert>
#include <cstdlib>
#include <map>
#include <cstdio>
#include <string>
struct CountingAllocator:ArduinoJson::Allocator {
 std::map<void*,size_t> blocks;size_t active=0,peak=0;
 void* allocate(size_t n)override{void* p=std::malloc(n);if(p){blocks[p]=n;active+=n;peak=std::max(peak,active);}return p;}
 void deallocate(void* p)override{if(!p)return;auto it=blocks.find(p);assert(it!=blocks.end());active-=it->second;blocks.erase(it);std::free(p);}
 void* reallocate(void* p,size_t n)override{size_t old=p?blocks.at(p):0;void* q=std::realloc(p,n);if(q){if(p)blocks.erase(p);blocks[q]=n;active=active-old+n;peak=std::max(peak,active);}return q;}
} baselineAllocator,optimizedAllocator;
#include "baseline.h"
#include "optimized.h"
template<class Rpc> size_t probe(CountingAllocator& allocator,size_t requestSize){
 Rpc rpc;size_t atDispatch=0,calls=0;
 std::string request="{\"method\":\"GET\",\"path\":\"/v1/identity\",\"headers\":{},\"body\":\"\"}";
 if(requestSize>request.size())request.insert(request.size()-2,requestSize-request.size(),'a');
 rpc.dispatch([&](iah::rtc::RequestMessage packet){std::string value;serializeJson(packet.envelope,value);calls++;assert(value==request);atDispatch=allocator.active;return std::string("{\"status\":200,\"body\":\"{}\"}");});
 JsonDocument frame;frame["v"]=1;frame["type"]="req";frame["id"]="12345678-1234-4234-8234-123456789abc";frame["n"]=1;frame["seq"]=0;frame["end"]=true;frame["data"]=Rpc::encode(reinterpret_cast<const uint8_t*>(request.data()),request.size());std::string text;serializeJson(frame,text);
 assert(rpc.input(reinterpret_cast<const uint8_t*>(text.data()),text.size(),10));assert(calls==1&&allocator.active==0);return atDispatch;
}
int main(){for(size_t bytes:{size_t{0},size_t{256}}){const auto before=probe<baseline::Rpc>(baselineAllocator,bytes),after=probe<optimized::Rpc>(optimizedAllocator,bytes);assert(before>0&&after==0);std::printf("RPC frame allocations during dispatch: %zu -> %zu bytes (host ABI, request size %zu)\n",before,after,bytes);}}

'''
with tempfile.TemporaryDirectory(prefix='iah-rpc-allocation-') as temp:
 folder=Path(temp)
 for namespace in ['baseline','optimized']:
  code=source.replace('namespace iah { namespace rtc {','namespace '+namespace+' { using iah::rtc::Sctp;using iah::rtc::Request;using iah::rtc::RequestMessage;using iah::plainJsonString;').replace('\n}}','\n}')
  code=code.replace('JsonDocument frame;','JsonDocument frame(&'+namespace+'Allocator);',1)
  if namespace=='baseline':code=code.replace('   frame.clear();','',1)
  (folder/(namespace+'.h')).write_text(code)
 cpp=folder/'test.cpp';cpp.write_text(program);binary=folder/'test'
 compiler=os.environ.get('CXX');command=[compiler] if compiler else ['/Library/Developer/CommandLineTools/usr/bin/clang++','-isysroot','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-nostdinc++','-isystem','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1'] if Path('/Library/Developer/CommandLineTools/usr/bin/clang++').exists() else ['c++']
 subprocess.run([*command,'-std=c++17','-Wall','-Wextra','-Werror','-pedantic','-I',json_include,'-I',str(root/'firmware/IPhoneAutomationHarness/src'),str(cpp),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
