#pragma once
#include <ArduinoJson.h>
#include <cstring>
namespace iah {
struct StrictJsonReader {
 const char* data;size_t size,offset=0;
 int read(){return offset<size?static_cast<unsigned char>(data[offset++]):-1;}
 size_t readBytes(char* target,size_t count){size_t available=size-offset;if(count>available)count=available;std::memcpy(target,data+offset,count);offset+=count;return count;}
};
inline bool strictJsonObject(JsonDocument& doc,const char* data,size_t size,unsigned depth=8,bool* memoryError=nullptr){
 StrictJsonReader reader{data,size};auto result=deserializeJson(doc,reader,DeserializationOption::NestingLimit(depth));if(memoryError)*memoryError=result==DeserializationError::NoMemory;if(result||!doc.is<JsonObject>())return false;
 for(int c=reader.read();c>=0;c=reader.read())if(c!=32&&c!=9&&c!=10&&c!=13)return false;return reader.offset==size;
}
inline bool plainJsonString(JsonVariantConst value){if(!value.is<const char*>())return false;auto text=value.as<JsonString>();return text.size()==strlen(text.c_str());}
}
