#pragma once
#include <cstddef>
#include <cstdlib>
#include <cstring>
#include <utility>
#include <ArduinoJson.h>
#include "StrictJson.h"
namespace iah { namespace rtc {
// A request owns its bytes across dispatch. Exact bounded growth avoids
// std::string's doubling/throwing allocation path on small embedded heaps.
class Request {
 public:
  static constexpr size_t Limit=12288;
  using Resize=void*(*)(void*,size_t);using Free=void(*)(void*);
  explicit Request(Resize resize=std::realloc,Free release=std::free):resize_(resize),free_(release){}
  Request(const Request&)=delete;Request& operator=(const Request&)=delete;
  Request(Request&& other)noexcept:data_(other.data_),size_(other.size_),capacity_(other.capacity_),resize_(other.resize_),free_(other.free_){other.data_=nullptr;other.size_=other.capacity_=0;}
  Request& operator=(Request&& other)noexcept{if(this!=&other){clear();data_=other.data_;size_=other.size_;capacity_=other.capacity_;resize_=other.resize_;free_=other.free_;other.data_=nullptr;other.size_=other.capacity_=0;}return *this;}
  ~Request(){clear();}
  bool append(const uint8_t* data,size_t size){
   if(size>Limit-size_)return false;const size_t needed=size_+size;
   if(needed>capacity_){const size_t capacity=(needed+255)/256*256;auto* value=static_cast<char*>(resize_(data_,capacity+1));if(!value)return false;data_=value;capacity_=capacity;}
   if(size)std::memcpy(data_+size_,data,size);size_=needed;if(data_)data_[size_]=0;return true;
  }
  char* data(){return data_;}const char* data()const{return data_;}size_t size()const{return size_;}bool empty()const{return size_==0;}
  void clear(){if(data_)free_(data_);data_=nullptr;size_=capacity_=0;}
 private:
  char* data_=nullptr;size_t size_=0,capacity_=0;Resize resize_;Free free_;
};
// Decode the envelope body in its owned receive buffer. ArduinoJson 7 copies
// parsed strings, so a filtered reader substitutes an empty string while the
// library validates the surrounding object. The explicit linked body remains
// valid until the document is destroyed, before its receive buffer.
inline int hexDigit(char c){if(c>='0'&&c<='9')return c-'0';if(c>='a'&&c<='f')return c-'a'+10;if(c>='A'&&c<='F')return c-'A'+10;return -1;}
inline bool decodeString(char* begin,char* end,size_t& written){
 char* out=begin;const char* in=begin;
 auto unit=[&](unsigned& value){if(end-in<4)return false;value=0;for(unsigned i=0;i<4;i++){const int digit=hexDigit(*in++);if(digit<0)return false;value=value*16+unsigned(digit);}return true;};
 while(in<end){unsigned c=static_cast<unsigned char>(*in++);if(c<32||c=='"')return false;
  if(c=='\\'){if(in==end)return false;c=static_cast<unsigned char>(*in++);switch(c){
   case '"':case '\\':case '/':break;case 'b':c=8;break;case 'f':c=12;break;case 'n':c=10;break;case 'r':c=13;break;case 't':c=9;break;
   case 'u':{if(!unit(c)||!c)return false;if(c>=0xd800&&c<=0xdbff){if(end-in<6||in[0]!='\\'||in[1]!='u')return false;in+=2;unsigned low;if(!unit(low)||low<0xdc00||low>0xdfff)return false;c=0x10000+((c-0xd800)<<10)+(low-0xdc00);}else if(c>=0xdc00&&c<=0xdfff)return false;
    if(c>0xffff){*out++=char(0xf0|(c>>18));*out++=char(0x80|((c>>12)&63));*out++=char(0x80|((c>>6)&63));c=0x80|(c&63);}else if(c>0x7ff){*out++=char(0xe0|(c>>12));*out++=char(0x80|((c>>6)&63));c=0x80|(c&63);}else if(c>0x7f){*out++=char(0xc0|(c>>6));c=0x80|(c&63);}break;}
   default:return false;
  }}*out++=char(c);
 }written=static_cast<size_t>(out-begin);*out=0;return true;
}
inline bool bodyKey(const char* begin,const char* end){
 const char* expected="body";size_t at=0;
 while(begin<end){unsigned c=static_cast<unsigned char>(*begin++);if(c=='\\'){if(begin==end)return false;c=static_cast<unsigned char>(*begin++);if(c!='u'||end-begin<4)return false;c=0;for(unsigned i=0;i<4;i++){int h=hexDigit(*begin++);if(h<0)return false;c=c*16+unsigned(h);}}
  if(at==4||c!=static_cast<unsigned>(expected[at++]))return false;
 }return at==4;
}
struct EnvelopeReader {
 const char* bytes;size_t size,start,end,offset=0;unsigned substitute=0;
 int read(){if(offset==start){if(substitute++<2)return '"';offset=end;}return offset<size?static_cast<unsigned char>(bytes[offset++]):-1;}
};
inline bool parseEnvelope(JsonDocument& doc,Request& request,bool* memoryError=nullptr){
 char* bytes=request.data();const size_t size=request.size();size_t bodyStart=size,bodyEnd=size;int depth=0;
 // Only locate a top-level string-valued body. ArduinoJson subsequently checks
 // the entire object, including unknown fields, trailing input and nesting.
 for(size_t i=0;i<size;i++){
  const char c=bytes[i];if(c=='{'||c=='['){++depth;continue;}if(c=='}'||c==']'){--depth;continue;}if(c!='"')continue;
  const size_t first=i++;for(;i<size;i++){if(bytes[i]=='\\'){if(++i==size)return false;continue;}if(bytes[i]=='"')break;}if(i==size)return false;
  const size_t last=i;size_t next=i+1;while(next<size&&(bytes[next]==' '||bytes[next]=='\n'||bytes[next]=='\r'||bytes[next]=='\t'))++next;
  if(depth!=1||next==size||bytes[next]!=':'||!bodyKey(bytes+first+1,bytes+last))continue;
  if(bodyStart!=size)return false;next++;while(next<size&&(bytes[next]==' '||bytes[next]=='\n'||bytes[next]=='\r'||bytes[next]=='\t'))++next;
  if(next==size||bytes[next]!='"')return false;bodyStart=next;
  for(i=next+1;i<size;i++){if(bytes[i]=='\\'){if(++i==size)return false;continue;}if(bytes[i]=='"')break;}if(i==size)return false;bodyEnd=i+1;
 }
 if(bodyStart==size)return false;
 EnvelopeReader reader{bytes,size,bodyStart,bodyEnd};auto result=deserializeJson(doc,reader,DeserializationOption::NestingLimit(5));if(memoryError)*memoryError=result==DeserializationError::NoMemory;if(result||!doc.is<JsonObject>())return false;
 for(int c=reader.read();c>=0;c=reader.read())if(c!=32&&c!=9&&c!=10&&c!=13)return false;
 size_t length=0;if(!decodeString(bytes+bodyStart+1,bytes+bodyEnd-1,length))return false;
 doc["body"]=JsonString(bytes+bodyStart+1,length,true);if(memoryError)*memoryError=doc.overflowed();return !doc.overflowed();
}
struct RequestMessage {
 Request bytes;JsonDocument envelope;
 RequestMessage(Request&& value,JsonDocument&& document):bytes(std::move(value)),envelope(std::move(document)){}
};
}}
