#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>
#include <utility>
#include "ClipboardMailbox.h"

namespace iah {
inline bool clipboardUtf8(const std::string& text){
 for(size_t i=0;i<text.size();){uint8_t first=static_cast<uint8_t>(text[i++]);if(first<0x80)continue;
  uint32_t code=0,minimum=0;size_t rest=0;
  if(first>=0xc2&&first<=0xdf){code=first&31;minimum=0x80;rest=1;}
  else if(first>=0xe0&&first<=0xef){code=first&15;minimum=0x800;rest=2;}
  else if(first>=0xf0&&first<=0xf4){code=first&7;minimum=0x10000;rest=3;}
  else return false;
  if(rest>text.size()-i)return false;
  while(rest--){uint8_t next=static_cast<uint8_t>(text[i++]);if((next&0xc0)!=0x80)return false;code=(code<<6)|(next&63);}
  if(code<minimum||code>0x10ffff||(code>=0xd800&&code<=0xdfff))return false;
 }return true;
}
inline void wipeClipboardText(std::string& text){volatile char* p=text.empty()?nullptr:&text[0];for(size_t i=0;i<text.size();i++)p[i]=0;text.clear();}
// RFC 4648 standard alphabet, required canonical padding and zero pad bits.
inline bool decodeClipboardTextBase64(const char* encoded,size_t length,std::string& text){
 wipeClipboardText(text);constexpr size_t limit=ClipboardMailbox::ChunkBytes;
 if(!encoded||!length||length%4||length>((limit+2)/3)*4)return false;
 auto value=[](char c)->int{if(c>='A'&&c<='Z')return c-'A';if(c>='a'&&c<='z')return c-'a'+26;if(c>='0'&&c<='9')return c-'0'+52;if(c=='+')return 62;if(c=='/')return 63;return -1;};
 text.reserve((length/4)*3>limit?limit:(length/4)*3);
 for(size_t i=0;i<length;i+=4){int a=value(encoded[i]),b=value(encoded[i+1]),c=encoded[i+2]=='='?-2:value(encoded[i+2]),d=encoded[i+3]=='='?-2:value(encoded[i+3]);bool last=i+4==length;
  if(a<0||b<0||c==-1||d==-1||(!last&&(c<0||d<0))||(c==-2&&d!=-2)||(c==-2&&(b&15))||(d==-2&&c>=0&&(c&3))){wipeClipboardText(text);return false;}
  unsigned n=c<0?1:d<0?2:3;if(text.size()+n>limit){wipeClipboardText(text);return false;}
  uint32_t bits=uint32_t(a)<<18|uint32_t(b)<<12|uint32_t(c<0?0:c)<<6|uint32_t(d<0?0:d);
  text.push_back(static_cast<char>(bits>>16));if(n>1)text.push_back(static_cast<char>(bits>>8));if(n>2)text.push_back(static_cast<char>(bits));
 }
 if(!clipboardUtf8(text)){wipeClipboardText(text);return false;}return !text.empty();
}

// ArduinoJson writer: bounded scratch regardless of JSON escaping expansion.
// A failed sink stays failed; finish() must succeed before sending the HTTP end.
template<class Sink,size_t Capacity=512> class BufferedJsonWriter {
 static_assert(Capacity>0,"nonempty output buffer");
 Sink sink_;std::array<uint8_t,Capacity> bytes_{};size_t used_=0;bool failed_=false,inString_=false,escaped_=false;
 bool append(const uint8_t* data,size_t length){
  size_t accepted=0;while(accepted<length){size_t n=length-accepted;if(n>Capacity-used_)n=Capacity-used_;std::memcpy(bytes_.data()+used_,data+accepted,n);used_+=n;accepted+=n;if(used_==Capacity&&!flush())return false;}return true;
 }
 public:
 explicit BufferedJsonWriter(Sink sink):sink_(std::move(sink)){}
 size_t write(uint8_t byte){return write(&byte,1);}
 size_t write(const uint8_t* data,size_t length){
  if(failed_)return 0;
  for(size_t i=0;i<length;i++){
   uint8_t byte=data[i];
   // ArduinoJson 7.4.3 escapes the named controls but emits other C0 bytes
   // literally. Complete JSON escaping here without building a larger String.
   if(inString_&&byte<0x20){static const char hex[]="0123456789abcdef";uint8_t escape[6]={'\\','u','0','0',uint8_t(hex[byte>>4]),uint8_t(hex[byte&15])};if(!append(escape,6))return i;escaped_=false;continue;}
   if(!append(&byte,1))return i;
   if(inString_){if(escaped_)escaped_=false;else if(byte=='\\')escaped_=true;else if(byte=='"')inString_=false;}
   else if(byte=='"')inString_=true;
  }return length;
 }
 bool flush(){if(failed_)return false;if(used_&&!sink_(bytes_.data(),used_)){failed_=true;return false;}used_=0;return true;}
 bool finish(){return flush();}
};
// Append raw UTF-8 inside an open JSON string. NUL is data, never a terminator.
template<class Writer> bool writeClipboardJsonText(Writer& writer,const uint8_t* bytes,size_t size){
 static const char hex[]="0123456789abcdef";
 for(size_t i=0;i<size;i++){uint8_t c=bytes[i];if(c<0x20){uint8_t escaped[6]={'\\','u','0','0',uint8_t(hex[c>>4]),uint8_t(hex[c&15])};if(writer.write(escaped,6)!=6)return false;}
  else if(c=='"'||c=='\\'){uint8_t escaped[2]={'\\',c};if(writer.write(escaped,2)!=2)return false;}
  else if(writer.write(c)!=1)return false;
 }return true;
}
}
