#pragma once
#include <ArduinoJson.h>
#include <algorithm>
#include <vector>
#include "Core.h"
#include "Canonical.h"
#include "Admission.h"
#include "CryptoUtils.h"
namespace iah {
constexpr size_t WireMaxEvents=MaxEvents<256?MaxEvents:256;
constexpr size_t WireMaxRequestBytes=8192;
inline bool fields(JsonObjectConst object,std::initializer_list<const char*> names){if(object.size()!=names.size())return false;for(auto name:names)if(object[name].isUnbound())return false;return true;}
inline bool wireInteger(JsonVariantConst value,int min,int max){return value.is<int>()&&value.as<int>()>=min&&value.as<int>()<=max;}
class CanonicalShaWriter {
 mbedtls_sha256_context context_;bool active_=false;
 public:
 CanonicalShaWriter(){mbedtls_sha256_init(&context_);active_=mbedtls_sha256_starts(&context_,0)==0;}
 ~CanonicalShaWriter(){mbedtls_sha256_free(&context_);}
 size_t write(uint8_t byte){return write(&byte,1);}
 size_t write(const uint8_t* bytes,size_t count){if(!active_)return 0;if(mbedtls_sha256_update(&context_,bytes,count)!=0){active_=false;return 0;}return count;}
 bool finish(uint8_t* output){bool ok=active_&&mbedtls_sha256_finish(&context_,output)==0;active_=false;return ok;}
};
inline String canonicalDigest(JsonVariantConst value){
 CanonicalShaWriter writer;uint8_t hash[32];if(!writeCanonicalValidated(value,writer)||!writer.finish(hash))return "";
 String out;if(!out.reserve(64))return "";for(uint8_t byte:hash){char hex[3];snprintf(hex,3,"%02x",byte);out+=hex;}return out;
}
inline bool parseSegment(JsonObjectConst json,Segment& s,String& error){
 auto bad=[&](const char* message){error=message;return false;};
 if(!fields(json,{"protocolVersion","boardId","bootId","targetId","clientId","leaseId","segmentId","planId","segmentIndex","ttlMs","payloadHash","events"}))return bad("invalid_segment_fields");
 if(!wireInteger(json["protocolVersion"],1,1)||!wireInteger(json["segmentIndex"],0,29)||!wireInteger(json["ttlMs"],100,15000))return bad("invalid_segment_limits");
 for(auto field:{"boardId","bootId","targetId","clientId","leaseId","segmentId","planId"})if(!json[field].is<const char*>()||!validId(json[field].as<const char*>()))return bad("invalid_identifier");
 String hash=json["payloadHash"]|"";if(hash.length()!=64)return bad("invalid_hash");for(char c:hash)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return bad("invalid_hash");
 auto events=json["events"].as<JsonArrayConst>();if(!json["events"].is<JsonArrayConst>()||events.size()<1||events.size()>WireMaxEvents)return bad("invalid_event_count");
 s.protocolVersion=1;s.boardId=json["boardId"].as<const char*>();s.bootId=json["bootId"].as<const char*>();s.targetId=json["targetId"].as<const char*>();s.clientId=json["clientId"].as<const char*>();s.leaseId=json["leaseId"].as<const char*>();s.segmentId=json["segmentId"].as<const char*>();s.planId=json["planId"].as<const char*>();s.payloadHash=hash.c_str();s.segmentIndex=json["segmentIndex"].as<int>();s.ttlMs=json["ttlMs"].as<int>();s.count=0;
 for(auto value:events){auto e=value.as<JsonObjectConst>();if(!value.is<JsonObjectConst>()||!wireInteger(e["atMs"],0,5000))return bad("invalid_event");Event report;report.atMs=e["atMs"].as<int>();String kind=e["kind"]|"";
  if(kind=="pointer"){if(!fields(e,{"atMs","kind","buttons","x","y"})||!wireInteger(e["buttons"],0,1)||!wireInteger(e["x"],0,10000)||!wireInteger(e["y"],0,10000))return bad("invalid_pointer");report.kind=Kind::Pointer;report.x=e["x"].as<int>();report.y=e["y"].as<int>();report.buttons=e["buttons"].as<int>();}
  else if(kind=="keyboard"){if(!fields(e,{"atMs","kind","modifiers","usages"})||!wireInteger(e["modifiers"],0,255)||!e["usages"].is<JsonArrayConst>()||e["usages"].size()>6)return bad("invalid_keyboard");report.kind=Kind::Keyboard;report.modifiers=e["modifiers"].as<int>();for(auto u:e["usages"].as<JsonArrayConst>()){if(!wireInteger(u,4,231))return bad("invalid_usage");report.usages[report.count++]=u.as<int>();}}
  else if(kind=="consumer"){if(!fields(e,{"atMs","kind","usage"})||!wireInteger(e["usage"],0,64)||(e["usage"].as<int>()!=0&&e["usage"].as<int>()!=64))return bad("invalid_consumer");report.kind=Kind::Consumer;report.usage=e["usage"].as<int>();}
  else return bad("unsupported_report");s.events[s.count++]=report;
 }
 if(!constantEqual(s.payloadHash,canonicalDigest(json).c_str()))return bad("payload_hash_mismatch");return true;
}
}
