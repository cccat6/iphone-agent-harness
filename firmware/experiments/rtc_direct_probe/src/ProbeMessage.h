#pragma once
#include <ArduinoJson.h>
#include <cstring>
namespace rtc_probe {
inline size_t makeReply(const char* text,size_t n,char* output,size_t capacity){
 if(!text||!n||n>512||!output||!capacity)return 0;
 JsonDocument request;
 if(deserializeJson(request,text,n)||!request.is<JsonObject>()||request.size()!=2||!request["probe"].is<bool>()||!request["probe"].as<bool>()||!request["nonce"].is<const char*>())return 0;
 JsonString nonce=request["nonce"].as<JsonString>();size_t length=nonce.size();if(!length||length>128)return 0;
 for(size_t i=0;i<length;i++){char c=nonce.c_str()[i];if(!((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'||c=='_'))return 0;}
 JsonDocument response;response["probe"]=true;response["nonce"]=nonce;response["phoneInputSent"]=false;
 if(measureJson(response)>=capacity)return 0;
 return serializeJson(response,output,capacity);
}
}
