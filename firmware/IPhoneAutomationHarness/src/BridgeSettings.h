#pragma once
#include <string>
#include <ArduinoJson.h>
#ifndef IAH_HOSTNAME
#define IAH_HOSTNAME "igent"
#endif
#ifndef IAH_PAIRING_CODE_REQUIRED
#define IAH_PAIRING_CODE_REQUIRED false
#endif
namespace iah {
inline bool validBridgeHostname(const std::string& name){
 if(name.empty()||name.size()>63||name.front()=='-'||name.back()=='-')return false;
 for(char c:name)if(!((c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'))return false;
 return true;
}
struct BridgeSettings {
 std::string hostname=validBridgeHostname(IAH_HOSTNAME)?IAH_HOSTNAME:"igent";
 bool pairingCodeRequired=IAH_PAIRING_CODE_REQUIRED;
};
inline BridgeSettings readBridgeSettings(const std::string& text){
 BridgeSettings settings;JsonDocument doc;
 if(!deserializeJson(doc,text)&&doc["hostname"].is<const char*>()&&doc["pairingCodeRequired"].is<bool>()){
  std::string hostname=doc["hostname"].as<const char*>();
  if(validBridgeHostname(hostname)){settings.hostname=hostname;settings.pairingCodeRequired=doc["pairingCodeRequired"].as<bool>();}
 }
 return settings;
}
}
