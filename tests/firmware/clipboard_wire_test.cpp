// Only the host-side consumer assembles >100KB, like Shortcuts. Production
// firmware parses at most one 1KiB chunk and keeps its default string limits.
#define ARDUINOJSON_STRING_LENGTH_SIZE 4
#include "../../firmware/IPhoneAutomationHarness/src/ClipboardWire.h"
#include <ArduinoJson.h>
#include <algorithm>
#include <cassert>
#include <iostream>
#include <string>
static std::string encode(const std::string& text){const char* abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";std::string out;for(size_t i=0;i<text.size();i+=3){uint32_t n=uint8_t(text[i])<<16;if(i+1<text.size())n|=uint8_t(text[i+1])<<8;if(i+2<text.size())n|=uint8_t(text[i+2]);out+=abc[n>>18];out+=abc[n>>12&63];out+=i+1<text.size()?abc[n>>6&63]:'=';out+=i+2<text.size()?abc[n&63]:'=';}return out;}
int main(){
 std::string text;auto decode=[&](const std::string& encoded){return iah::decodeClipboardTextBase64(encoded.data(),encoded.size(),text);};
 assert(decode("YQ==")&&text=="a");assert(decode("YWI=")&&text=="ab");assert(decode("YWJj")&&text=="abc");assert(decode("AA==")&&text==std::string(1,'\0'));
 assert(decode("5L2g5aW9")&&text==u8"你好");assert(decode("8J+YgA==")&&text==u8"😀");
 for(const auto& bad:{"","YQ","YQ=","YQ===","YR==","YWJ=","YQ==AAAA","YQ=A","====","YQ==\n","-w==","_w==","wK8=","7aCA","9JCAgA==","gA==","4oI=","4iih"}){text="erase";assert(!decode(bad)&&text.empty());}
 assert(!decode(std::string("YQ\0=",4)));assert(decode(encode(std::string(1024,'\1')))&&text.size()==1024);assert(!decode(encode(std::string(1025,'x'))));
 assert(!iah::decodeClipboardTextBase64(nullptr,4,text)&&text.empty());
 // The production string-stream writer handles a total far larger than its
 // 1KiB producer slot or its 512-byte output scratch, including embedded NUL.
 using Box=iah::ClipboardMailbox;using R=Box::Result;Box box;Box::View view;std::string token(64,'a');
 const std::string unit=std::string(u8"你好😀")+std::string("\0\x01\\\"\n",5);std::string chunk;for(unsigned i=0;i<64;i++)chunk+=unit;assert(chunk.size()<=1024);
 const uint64_t total=chunk.size()*128;assert(total>100000);assert(box.put("r","c","s","t",total,token,0,10)==R::Ok);assert(box.beginStream("r",token,1,view)==R::Ok);
 std::string collected,expected;size_t maxChunk=0,partCount=0;auto sink=[&](const uint8_t* p,size_t n){maxChunk=std::max(maxChunk,n);++partCount;collected.append(reinterpret_cast<const char*>(p),n);return true;};iah::BufferedJsonWriter<decltype(sink)> writer(sink);
 const std::string prefix="{\"requestId\":\"r\",\"text\":\"";writer.write(reinterpret_cast<const uint8_t*>(prefix.data()),prefix.size());
 char copy[1024];for(unsigned i=0;i<128;i++){uint64_t now=2+i*3,offset=0;size_t n=0;assert(decode(encode(chunk))&&text==chunk);assert(box.push("r","c","t",expected.size(),text,now,view)==R::Ok&&view.chunkPending);assert(box.peek("r",token,now,offset,copy,sizeof(copy),n)==R::Ok);assert(iah::writeClipboardJsonText(writer,reinterpret_cast<const uint8_t*>(copy),n)&&writer.flush());assert(box.consume("r",token,offset,n,now+1)==R::Ok);expected+=chunk;}
 const uint8_t ending[]={'"','}'};writer.write(ending,2);assert(writer.finish());assert(box.finishStream("r",token,386)==R::Ok);assert(maxChunk==512&&partCount>128&&collected.size()>total);
 JsonDocument parsed;assert(!deserializeJson(parsed,collected));auto value=parsed["text"].as<JsonString>();assert(value.size()==expected.size()&&std::string(value.c_str(),value.size())==expected);
 assert(box.acknowledge("r",token,"s","t",387,view)==R::Ok&&view.nextOffset==total);
 // A transport loss leaves an incomplete JSON string and cannot produce ACK.
 Box stopped;assert(stopped.put("lost","c","s","t",1024,token,0)==R::Ok);assert(stopped.beginStream("lost",token,1,view)==R::Ok);assert(stopped.push("lost","c","t",0,std::string(1024,'\1'),2,view)==R::Ok);uint64_t offset=0;size_t n=0;assert(stopped.peek("lost",token,3,offset,copy,sizeof(copy),n)==R::Ok);
 size_t writes=0;std::string partial;auto failSink=[&](const uint8_t* p,size_t size){if(++writes==2)return false;partial.append(reinterpret_cast<const char*>(p),size);return true;};iah::BufferedJsonWriter<decltype(failSink)> broken(failSink);broken.write(reinterpret_cast<const uint8_t*>(prefix.data()),prefix.size());assert(!iah::writeClipboardJsonText(broken,reinterpret_cast<const uint8_t*>(copy),n)||!broken.finish());assert(!broken.finish());assert(stopped.abortStream("lost",token,4)==R::Ok);assert(stopped.acknowledge("lost",token,"s","t",5,view)!=R::Ok);assert(deserializeJson(parsed,partial));
 std::cout<<"Clipboard stream wire: canonical base64, <=1024B UTF-8 chunks, >100KB mixed Unicode/C0/NUL exact JSON and interrupted stream passed\n";
}
