#pragma once
#include <string>
#include <ArduinoJson.h>
#ifndef IAH_HOSTNAME
#define IAH_HOSTNAME "igent"
#endif
namespace iah {
inline bool validBridgeHostname(const std::string& name){
 if(name.empty()||name.size()>63||name.front()=='-'||name.back()=='-')return false;
 for(char c:name)if(!((c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'))return false;
 return true;
}
struct BridgeSettings {
 std::string hostname=validBridgeHostname(IAH_HOSTNAME)?IAH_HOSTNAME:"igent";
};
// Enrollment accepts the legacy setupPassword field without using it.
inline bool validBridgeEnrollment(JsonObjectConst doc){
 for(JsonPairConst pair:doc)if(std::string(pair.key().c_str())!="clientId"&&std::string(pair.key().c_str())!="setupPassword")return false;
 return doc["clientId"].is<const char*>();
}
// Old settings may include pairingCodeRequired. It is deliberately ignored.
inline bool validBridgeSettingsUpdate(JsonObjectConst doc){
 for(JsonPairConst pair:doc)if(std::string(pair.key().c_str())!="hostname"&&std::string(pair.key().c_str())!="pairingCodeRequired")return false;
 return doc["hostname"].is<const char*>()&&validBridgeHostname(doc["hostname"].as<const char*>());
}
inline BridgeSettings readBridgeSettings(const std::string& text){
 BridgeSettings settings;JsonDocument doc;
 if(!deserializeJson(doc,text)&&doc["hostname"].is<const char*>()){
  std::string hostname=doc["hostname"].as<const char*>();
  if(validBridgeHostname(hostname)){settings.hostname=hostname;}
 }
 return settings;
}
}
