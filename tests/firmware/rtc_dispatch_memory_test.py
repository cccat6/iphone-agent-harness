#!/usr/bin/env python3
"""Run production RTC dispatch/read against pinned ArduinoJson with counted heap."""
from pathlib import Path
import os, subprocess, tempfile, json, hashlib

ROOT=Path(__file__).resolve().parents[2]
source=(ROOT/'firmware/IPhoneAutomationHarness/src/SecureService.h').read_text()
def method(signature):
 start=source.index(signature);at=source.index('{',start);depth=1;end=at+1
 while depth:
  depth+=(source[end]=='{')-(source[end]=='}');end+=1
 return source[start:end]
dispatch=method('String dispatchRtc(')
read=method('bool read(Request* r,')
assert 'request.body=envelope["body"]|"";request.content_len=request.body.length();' in dispatch
assert dispatch.index('envelope.clear();')<dispatch.index('handle(&request);')
baseline=dispatch.replace('JsonString(request.responseBody.c_str(),request.responseBody.length(),true)','request.responseBody')
baseline_read=read
wire=(ROOT/'firmware/IPhoneAutomationHarness/src/Wire.h').read_text()
def wire_method(signature):
 start=wire.index(signature);at=wire.index('{',start);depth=1;end=at+1
 while depth:
  depth+=(wire[end]=='{')-(wire[end]=='}');end+=1
 return wire[start:end]
parse_segment=wire_method('inline bool parseSegment(')
receipt=method('void receipt(')
program=r'''
#include <ArduinoJson.h>
#include <algorithm>
#include <cassert>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <memory>
#define IAH_MAX_EVENTS 128
#include "CORE_HEADER"
#include "ADMISSION_HEADER"
#include "CANONICAL_HEADER"
#include "STRICT_HEADER"
using namespace iah;
struct Stats{size_t strings=0,json=0,peak=0;void update(){peak=std::max(peak,strings+json);}void reset(){assert(strings==0&&json==0);peak=0;}} stats;
struct CountingAllocator:ArduinoJson::Allocator{
 std::map<void*,size_t> blocks;
 void* allocate(size_t n)override{void* p=std::malloc(n);if(p){blocks[p]=n;stats.json+=n;stats.update();}return p;}
 void deallocate(void* p)override{if(!p)return;auto found=blocks.find(p);assert(found!=blocks.end());stats.json-=found->second;blocks.erase(found);std::free(p);}
 void* reallocate(void* p,size_t n)override{size_t old=p?blocks.at(p):0;void* q=std::realloc(p,n);if(q){if(p)blocks.erase(p);blocks[q]=n;stats.json=stats.json-old+n;stats.update();}return q;}
 bool owns(const char* p,size_t n)const{for(const auto& block:blocks){auto at=reinterpret_cast<uintptr_t>(p),first=reinterpret_cast<uintptr_t>(block.first);if(at>=first&&at+n<=first+block.second)return true;}return false;}
} allocator;
struct String{
 std::string value;size_t held=0;
 void update(){stats.strings-=held;held=value.capacity()>std::string().capacity()?value.capacity()+1:0;stats.strings+=held;stats.update();}
 String(){update();}String(const char* p):value(p?p:""){update();}String(const std::string& p):value(p){update();}String(const String& p):value(p.value){update();}String(String&& p)noexcept:value(std::move(p.value)){p.update();update();}
 ~String(){stats.strings-=held;}
 String& operator=(const char* p){if(p)value=p;else std::string().swap(value);update();return *this;}
 String& operator=(const std::string& p){value=p;update();return *this;}String& operator=(const String& p){value=p.value;update();return *this;}String& operator=(String&& p)noexcept{value=std::move(p.value);p.update();update();return *this;}
 const char* c_str()const{return value.c_str();}const char* data()const{return value.data();}size_t length()const{return value.size();}size_t size()const{return value.size();}
 bool startsWith(const char* p)const{return value.rfind(p,0)==0;}int indexOf(char c)const{auto at=value.find(c);return at==std::string::npos?-1:int(at);}int indexOf(const char* p)const{auto at=value.find(p);return at==std::string::npos?-1:int(at);}
 void toLowerCase(){for(auto& c:value)c=std::tolower(static_cast<unsigned char>(c));}
 auto begin()const{return value.begin();}auto end()const{return value.end();}
 void clear(){value.clear();update();}void push_back(char c){value.push_back(c);update();}String& append(const char* p){value.append(p);update();return *this;}String& append(const char* p,size_t n){value.append(p,n);update();return *this;}
 bool operator==(const char* p)const{return value==p;}bool operator!=(const char* p)const{return value!=p;}
};
void convertFromJson(JsonVariantConst from,String& to){to=from.as<std::string>();}
struct Request{bool rtc=false;size_t rtcPeer=2,content_len=0;int method=0,responseStatus=500;void* http=nullptr;String uri,body,authorization,requestOrigin,trustedPeerIp,responseBody;const char* bodyData=nullptr;};
constexpr int HTTP_GET=1,HTTP_POST=2;
bool fields(JsonObjectConst object,std::initializer_list<const char*> names){if(object.size()!=names.size())return false;for(auto name:names)if(object[name].isUnbound())return false;return true;}
struct Reader{void* http;size_t left;int read(){return -1;}};

constexpr size_t WireMaxEvents=MaxEvents;
void addIdentity(JsonDocument& d){d["boardId"]="board";d["bootId"]="boot";}
bool wireInteger(JsonVariantConst v,int a,int b){return v.is<int>()&&v.as<int>()>=a&&v.as<int>()<=b;}
String canonicalDigest(JsonVariantConst value){struct Writer{std::string value;size_t write(uint8_t c){value.push_back(char(c));return 1;}size_t write(const uint8_t* p,size_t n){value.append(reinterpret_cast<const char*>(p),n);return n;}}writer;assert(writeCanonicalValidated(value,writer));assert(writer.value==R"CANON(CANONICAL_VECTOR)CANON");return "HASH_VECTOR";}
PARSE_SEGMENT
RECEIPT
struct FakeSink:Sink{bool submit(uint16_t,const Event&)override{return true;}bool release(uint16_t,const Input&)override{return true;}};
void processSegment(JsonDocument& body,Request* r,std::string& retained){
 auto segment=std::unique_ptr<Segment>(new Segment);stats.strings+=sizeof(Segment);stats.update();String why;assert(parseSegment(body.as<JsonObjectConst>(),*segment,why));assert(segment->count==126);retained=segment->payloadHash;
 FakeSink sink;Core core{"board","boot",sink};assert(core.registerBond("phone","bond")==Code::Accepted);assert(core.connect("bond",1,true,true,true)==Code::Accepted);assert(core.bindClient("client","phone")==Code::Accepted);assert(core.lease("phone","client","lease",15000,1)==Code::Accepted);assert(core.accept(*segment,2)==Code::Accepted);const auto* result=core.result("client","segment");assert(result);JsonDocument reply(&allocator);receipt(reply,*result);r->responseStatus=202;serializeJson(reply,r->responseBody);assert(r->responseBody.length()<1024);stats.strings-=sizeof(Segment);
}
class Baseline{public:String origin_="https://igent.cc";bool handled=false;std::string retained;
 BASELINE_READ
 void handle(Request* r){handled=true;JsonDocument document(&allocator);assert(read(r,document,8192));if(document["text"].is<const char*>())retained=document["text"].as<std::string>();else{processSegment(document,r,retained);return;}r->responseStatus=200;r->responseBody=r->body;}
 BASELINE_DISPATCH
};
class Optimized{public:String origin_="https://igent.cc";bool handled=false;std::string retained;
 OPTIMIZED_READ
 void handle(Request* r){handled=true;JsonDocument document(&allocator);assert(read(r,document,8192));if(document["text"].is<const char*>())retained=document["text"].as<std::string>();else{processSegment(document,r,retained);return;}r->responseStatus=200;r->responseBody=r->body;}
 OPTIMIZED_DISPATCH
};
template<class Service>std::pair<size_t,std::string> probe(const std::string& request,const std::string& expected){stats.reset();std::string result;{Service service;String reply=service.dispatchRtc(String(request),"192.0.2.1",0);assert(service.handled);assert(service.retained==expected);result=reply.value;assert(stats.peak>0);}assert(stats.strings==0&&stats.json==0);return {stats.peak,result};}
std::string envelope(const std::string& body){JsonDocument document;document["method"]="POST";document["path"]="/v1/targets/phone/segments";document["headers"]["authorization"]="Bearer fixture";document["body"]=body;std::string result;serializeJson(document,result);return result;}
int main(){
 for(size_t count:{size_t{64},size_t{7900}}){std::string text(count,'a');text+=" 中文 😀 ";JsonDocument document;document["text"]=text;std::string body;serializeJson(document,body);assert(body.size()<8192);const auto wire=envelope(body);assert(wire.size()<12288);auto before=probe<Baseline>(wire,text),after=probe<Optimized>(wire,text);assert(before.second==after.second);assert(after.first<=before.first);if(count>1000){assert(after.first<before.first);assert(before.first-after.first>=7900);}std::printf("Production RTC dispatch counted JSON/String host peak baseline / linked-response: %zu / %zu bytes; decoded JSON body %zu bytes; strict wire/response equal\n",before.first,after.first,body.size());}
 {const std::string body=R"VECTOR(SEGMENT_VECTOR)VECTOR";assert(body.size()>=8000&&body.size()<=8192);const auto wire=envelope(body);assert(wire.size()<=12288);auto before=probe<Baseline>(wire,"HASH_VECTOR"),after=probe<Optimized>(wire,"HASH_VECTOR");assert(before.second==after.second);assert(after.first<=before.first);std::printf("Production parseSegment/Core.accept/small-receipt counted host peak baseline / linked-response: %zu / %zu bytes; legal segment body %zu bytes\n",before.first,after.first,body.size());}
 // Existing strict parsing, route/header/type/NUL and size checks remain intact.
 for(const auto& malformed:std::initializer_list<std::string>{"{}","[]",envelope("{}")+"trailing",envelope("{}")+"{}","{\"method\":\"GET\",\"path\":\"/v1/x\\u0000other\",\"headers\":{},\"body\":\"{}\"}","{\"method\":\"GET\",\"path\":\"/v1/x\",\"headers\":{\"unknown\":\"x\"},\"body\":\"{}\"}","{\"method\":\"GET\",\"path\":\"/v1/x\",\"headers\":{},\"body\":[]}",envelope("{}")+std::string(12288,' ')} ){
  {Optimized service;auto reply=service.dispatchRtc(String(malformed));assert(!service.handled);JsonDocument parsed;assert(!deserializeJson(parsed,reply.c_str()));assert(parsed["status"]==400);}
  assert(stats.strings==0&&stats.json==0);
 }
 // The borrowed body is not read after dispatch, including repeated reuse.
 for(unsigned i=0;i<20;i++){auto result=probe<Optimized>(envelope("{\"text\":\"你好\\n\\\"\\\\😀\"}"),"你好\n\"\\😀");assert(!result.second.empty());}
 std::puts("Production owned-request, linked-response lifetime and strict rejection scenarios passed");
}
'''
segment={'protocolVersion':1,'boardId':'board','bootId':'boot','targetId':'phone','clientId':'client','leaseId':'lease','segmentId':'segment','planId':'plan','segmentIndex':0,'ttlMs':15000,'events':[{'atMs':i*39,'kind':'pointer','buttons':0,'x':10000,'y':10000} for i in range(126)]}
canonical=json.dumps(segment,sort_keys=True,separators=(',',':'))
segment['payloadHash']=hashlib.sha256(canonical.encode()).hexdigest()
program=program.replace('SEGMENT_VECTOR',json.dumps(segment,separators=(',',':'))).replace('CANONICAL_VECTOR',canonical).replace('HASH_VECTOR',segment['payloadHash']).replace('PARSE_SEGMENT',parse_segment).replace('RECEIPT',receipt)
for key,name in [('CORE_HEADER','Core.h'),('ADMISSION_HEADER','Admission.h'),('CANONICAL_HEADER','Canonical.h')]:program=program.replace(key,str(ROOT/'firmware/IPhoneAutomationHarness/src'/name))
program=program.replace('STRICT_HEADER',str(ROOT/'firmware/IPhoneAutomationHarness/src/StrictJson.h'))
for marker,code in [('BASELINE_READ',baseline_read),('OPTIMIZED_READ',read),('BASELINE_DISPATCH',baseline),('OPTIMIZED_DISPATCH',dispatch)]:program=program.replace(marker,code.replace('JsonDocument ', 'JsonDocument ').replace('JsonDocument envelope;','JsonDocument envelope(&allocator);').replace('JsonDocument response;','JsonDocument response(&allocator);'))
with tempfile.TemporaryDirectory(prefix='iah-dispatch-memory-') as temp:
 folder=Path(temp);cpp=folder/'test.cpp';binary=folder/'test';cpp.write_text(program)
 compiler=os.environ.get('CXX');command=[compiler] if compiler else ['/Library/Developer/CommandLineTools/usr/bin/clang++','-isysroot','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk','-nostdinc++','-isystem','/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1']
 flags=['-std=c++17','-Wall','-Wextra','-Werror','-pedantic'];flags+=['-fsanitize=address,undefined','-fno-omit-frame-pointer'] if os.environ.get('RTC_SANITIZE')=='1' else []
 include=os.environ.get('ARDUINOJSON_INCLUDE',str(Path.home()/'Documents/Arduino/libraries/ArduinoJson/src'))
 subprocess.run([*command,*flags,'-I',include,str(cpp),'-o',str(binary)],check=True);subprocess.run([str(binary)],check=True)
