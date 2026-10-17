#pragma once
#include <ArduinoJson.h>
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
namespace iah {
// Hash only a fully schema-validated wire object: <=12 ASCII property names,
// bounded strings and integer values. No full canonical string is allocated.
template<class Writer> bool writeCanonicalValidated(JsonVariantConst value,Writer& writer){
 auto byte=[&](char c){return writer.write(static_cast<uint8_t>(c))==1;};
 if(value.is<JsonObjectConst>()){
  auto object=value.as<JsonObjectConst>();if(object.size()>12)return false;
  std::array<const char*,12> keys{};size_t count=0;
  for(auto item:object){const char* key=item.key().c_str();if(std::strcmp(key,"payloadHash")==0)continue;
   for(const unsigned char* p=reinterpret_cast<const unsigned char*>(key);*p;p++)if(!((*p>='a'&&*p<='z')||(*p>='A'&&*p<='Z')||(*p>='0'&&*p<='9')||*p=='_'))return false;
   keys[count++]=key;
  }
  std::sort(keys.begin(),keys.begin()+count,[](const char* a,const char* b){return std::strcmp(a,b)<0;});
  if(!byte('{'))return false;
  for(size_t i=0;i<count;i++){
   if(i&&!byte(','))return false;
   size_t length=std::strlen(keys[i]);
   if(!byte('"')||writer.write(reinterpret_cast<const uint8_t*>(keys[i]),length)!=length||!byte('"')||!byte(':')||!writeCanonicalValidated(object[keys[i]],writer))return false;
  }
  return byte('}');
 }
 if(value.is<JsonArrayConst>()){
  if(!byte('['))return false;
  bool comma=false;
  for(auto item:value.as<JsonArrayConst>()){if(comma&&!byte(','))return false;comma=true;if(!writeCanonicalValidated(item,writer))return false;}
  return byte(']');
 }
 return serializeJson(value,writer)>0;
}
}
