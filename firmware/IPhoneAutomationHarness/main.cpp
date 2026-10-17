#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <NimBLEDevice.h>
#include <NimBLEHIDDevice.h>
#include <esp_timer.h>
#include "src/Core.h"
#include "src/HidReportMap.h"
#if __has_include("config.local.h")
#include "config.local.h"
#endif
#include "config.example.h"

// This product scaffold exposes diagnostics only. Authenticated pairing, network
// mutations and capture barriers are not connected to the scheduler yet.
// No relay credentials, model traffic or screenshots are stored on the board.
namespace {
using namespace iah;
NimBLECharacteristic *mouseReport=nullptr,*keyboardReport=nullptr,*consumerReport=nullptr;
class BleSink:public Sink {
 public:
 bool submit(uint16_t handle,const Event& event)override {
  if(handle==InvalidHandle)return false;
  if(event.kind==Kind::Pointer){uint8_t data[]={event.buttons,(uint8_t)event.x,(uint8_t)(event.x>>8),(uint8_t)event.y,(uint8_t)(event.y>>8),0,0};return mouseReport->notify(data,sizeof(data),handle);}
  if(event.kind==Kind::Keyboard){uint8_t data[8]={event.modifiers,0,0,0,0,0,0,0};for(size_t i=0;i<event.count;i++)data[i+2]=event.usages[i];return keyboardReport->notify(data,sizeof(data),handle);}
  uint8_t data[]={(uint8_t)event.usage,(uint8_t)(event.usage>>8)};return consumerReport->notify(data,sizeof(data),handle);
 }
 bool release(uint16_t handle,const Input& previous)override {
  Event e;e.x=previous.x;e.y=previous.y;bool pointer=submit(handle,e);
  e.kind=Kind::Keyboard;bool keyboard=submit(handle,e);
  e.kind=Kind::Consumer;bool consumer=submit(handle,e);
  return pointer&&keyboard&&consumer;
 }
} sink;
Preferences preferences;
Core* core=nullptr;
WebServer http(IAH_HTTP_PORT);
String boardId,bootId,hostname;
bool mdnsStarted=false,httpStarted=false;
uint64_t nowMs(){return static_cast<uint64_t>(esp_timer_get_time())/1000;}

// NimBLE callbacks run outside loop(). They publish small fixed snapshots;
// NVS updates, client mapping and Core state mutations remain on loop().
struct Peer {uint16_t handle=InvalidHandle;bool encrypted=false,bonded=false;uint8_t reports=0;char identity[32]{};};
Peer peers[MaxTargets];portMUX_TYPE peersMux=portMUX_INITIALIZER_UNLOCKED;
void updatePeer(NimBLEConnInfo& info) {
 auto identity=info.getIdAddress();std::string stable;
 if(info.isBonded()&&(identity.isPublic()||identity.isStatic()))stable=std::to_string(identity.getType())+":"+identity.toString();
 portENTER_CRITICAL(&peersMux);
 Peer* slot=nullptr;for(auto& peer:peers)if(peer.handle==info.getConnHandle())slot=&peer;
 if(!slot)for(auto& peer:peers)if(peer.handle==InvalidHandle){slot=&peer;break;}
 if(slot){slot->handle=info.getConnHandle();slot->encrypted=info.isEncrypted();slot->bonded=info.isBonded();snprintf(slot->identity,sizeof(slot->identity),"%s",stable.c_str());}
 portEXIT_CRITICAL(&peersMux);
}
class ServerCallbacks:public NimBLEServerCallbacks {
 void onConnect(NimBLEServer* server,NimBLEConnInfo& info)override {
  if(server->getConnectedCount()>MaxTargets){server->disconnect(info.getConnHandle());return;}
  updatePeer(info);server->updateConnParams(info.getConnHandle(),12,24,0,400);
  // Continue advertising for another phone. Runtime limit is explicit.
  if(server->getConnectedCount()<MaxTargets)NimBLEDevice::getAdvertising()->start();
 }
 void onAuthenticationComplete(NimBLEConnInfo& info)override{updatePeer(info);}
 void onDisconnect(NimBLEServer*,NimBLEConnInfo& info,int)override{
  portENTER_CRITICAL(&peersMux);for(auto& peer:peers)if(peer.handle==info.getConnHandle())peer=Peer{};portEXIT_CRITICAL(&peersMux);
 }
};
class ReportCallbacks:public NimBLECharacteristicCallbacks {
 uint8_t bit_;
 public:explicit ReportCallbacks(uint8_t report):bit_(1u<<(report-1)){}
 void onSubscribe(NimBLECharacteristic*,NimBLEConnInfo& info,uint16_t value)override{
  updatePeer(info);portENTER_CRITICAL(&peersMux);
  for(auto& peer:peers)if(peer.handle==info.getConnHandle()){if(value&1)peer.reports|=bit_;else peer.reports&=~bit_;}
  portEXIT_CRITICAL(&peersMux);
 }
};
std::string findOrRegisterBond(const std::string& identity){
 for(const auto& target:core->targets())if(target.bondIdentity==identity)return target.id;
 for(size_t i=0;i<MaxTargets;i++){
  String identityKey="bond"+String(i),targetKey="target"+String(i);
  if(preferences.getString(identityKey.c_str(),"").isEmpty()){
   char target[32];snprintf(target,sizeof(target),"target-%08lx%08lx",(unsigned long)esp_random(),(unsigned long)esp_random());
   // Commit target first. A missing identity never enables control.
   if(preferences.putString(targetKey.c_str(),target)==0||preferences.putString(identityKey.c_str(),identity.c_str())==0)return "";
   if(core->registerBond(target,identity)!=Code::Accepted)return "";return target;
  }
 }
 return "";
}
void syncPeers(){
 Peer snapshot[MaxTargets];portENTER_CRITICAL(&peersMux);for(size_t i=0;i<MaxTargets;i++)snapshot[i]=peers[i];portEXIT_CRITICAL(&peersMux);
 for(const auto& target:core->targets())if(target.connHandle!=InvalidHandle){
  bool present=false;for(const auto& peer:snapshot)if(peer.handle==target.connHandle&&peer.encrypted&&peer.bonded&&peer.identity==target.bondIdentity)present=true;
  if(!present)core->disconnect(target.connHandle,nowMs());
 }
 for(const auto& peer:snapshot)if(peer.handle!=InvalidHandle&&peer.encrypted&&peer.bonded&&peer.identity[0]){
  auto target=findOrRegisterBond(peer.identity);if(!target.empty())core->connect(peer.identity,peer.handle,true,true,peer.reports==7);
 }
}
void startBle(){
 NimBLEDevice::init("iPhone Harness");NimBLEDevice::setSecurityAuth(true,false,true);NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);
 auto server=NimBLEDevice::createServer();server->setCallbacks(new ServerCallbacks());server->advertiseOnDisconnect(true);
 auto hid=new NimBLEHIDDevice(server);mouseReport=hid->getInputReport(1);keyboardReport=hid->getInputReport(2);consumerReport=hid->getInputReport(3);hid->getOutputReport(2);
 mouseReport->setCallbacks(new ReportCallbacks(1));keyboardReport->setCallbacks(new ReportCallbacks(2));consumerReport->setCallbacks(new ReportCallbacks(3));
 hid->setManufacturer("iPhone Automation Harness");hid->setPnp(2,0x303A,0x1001,0x0103);hid->setHidInfo(0,1);hid->setReportMap(iah::reportMap,sizeof(iah::reportMap));hid->setBatteryLevel(100);server->start();
 auto advertising=NimBLEDevice::getAdvertising();advertising->setAppearance(HID_MOUSE);advertising->addServiceUUID(hid->getHidService()->getUUID());advertising->setName("iPhone Harness");advertising->enableScanResponse(true);advertising->start();
}
void cors(){
 const String origin=http.header("Origin");
 if(String(IAH_ALLOWED_ORIGIN).length()&&origin==IAH_ALLOWED_ORIGIN){http.sendHeader("Access-Control-Allow-Origin",origin);http.sendHeader("Vary","Origin");}
 http.sendHeader("Cache-Control","no-store");http.sendHeader("X-Content-Type-Options","nosniff");
}
void json(int status,JsonDocument& doc){cors();String body;serializeJson(doc,body);http.send(status,"application/json",body);}
void startHttp(){
 const char* headers[]={"Origin"};http.collectHeaders(headers,1);
 http.on("/v1/identity",HTTP_GET,[]{JsonDocument d;d["protocolVersion"]=1;d["boardId"]=boardId;d["bootId"]=bootId;d["hostname"]=hostname+".local";d["firmwareVersion"]="0.1.0-scaffold";d["identityVerified"]=false;d["publicKeyFingerprint"]=nullptr;d["pairingAvailable"]=false;json(200,d);});
 http.on("/v1/clock",HTTP_GET,[]{JsonDocument d;d["bootId"]=bootId;d["deviceTimeMs"]=nowMs();json(200,d);});
 http.on("/v1/capabilities",HTTP_GET,[]{
  JsonDocument d;d["protocolVersion"]=1;d["executionEnabled"]=false;d["pairingAvailable"]=false;d["maxTargets"]=MaxTargets;d["maxClients"]=MaxClients;
  d["maxEvents"]=MaxEvents;d["maxSegmentMs"]=MaxSegmentMs;d["maxHoldMs"]=MaxHoldMs;d["maxLeaseMs"]=MaxLeaseMs;d["captureOnDevice"]=false;
  d["timingPrecisionVerified"]=false;d["multiPhoneVerified"]=false;d["requires"]="authenticated_transport_and_target_binding";
  auto targets=d["targets"].to<JsonArray>();for(const auto& target:core->targets())if(!target.id.empty()){auto t=targets.add<JsonObject>();t["targetId"]=target.id;t["connected"]=target.connHandle!=InvalidHandle;t["encrypted"]=target.encrypted;t["hidSubscribed"]=target.subscribed;t["inputReleased"]=!target.releasePending;}
  json(200,d);
 });
 http.onNotFound([]{JsonDocument d;if(http.method()==HTTP_GET){d["error"]="not_found";json(404,d);}else{d["error"]="transport_auth_not_implemented";d["executionEnabled"]=false;json(503,d);}});
 http.begin();httpStarted=true;
}
void configureSerial(){
 // USB config/status only. No segment, input, pairing or target-binding commands.
 static String line;
 while(Serial.available()){
  char c=Serial.read();if(c!='\n'){if(line.length()<1024)line+=c;else line="";continue;}
  JsonDocument d;auto error=deserializeJson(d,line);line="";if(error){Serial.println("{\"error\":\"invalid_json\"}");continue;}
  String op=d["op"]|"";
  if(op=="status"){JsonDocument out;out["boardId"]=boardId;out["bootId"]=bootId;out["wifiConfigured"]=preferences.getString("ssid","").length()>0;out["wifiConnected"]=WiFi.status()==WL_CONNECTED;out["executionEnabled"]=false;serializeJson(out,Serial);Serial.println();continue;}
  if(op!="configure-wifi"){Serial.println("{\"error\":\"unsupported_configuration_operation\"}");continue;}
  if(core->busy()){Serial.println("{\"error\":\"board_busy\"}");continue;}
  String ssid=d["ssid"]|"",password=d["password"]|"";
  if(ssid.isEmpty()||ssid.length()>32||password.length()>63){Serial.println("{\"error\":\"invalid_wifi_configuration\"}");continue;}
  preferences.putString("ssid",ssid);preferences.putString("password",password);
  bool saved=preferences.isKey("ssid")&&preferences.isKey("password")&&preferences.getString("ssid","")==ssid&&preferences.getString("password","")==password;
  if(!saved){Serial.println("{\"error\":\"nvs_write_failed\"}");continue;}
  WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);WiFi.begin(ssid.c_str(),password.c_str());Serial.println("{\"configured\":true,\"connectionPending\":true}");
 }
}
}
void setup(){
 Serial.begin(115200);preferences.begin("iah-product",false);
 char id[32];snprintf(id,sizeof(id),"iah-%012llx",(unsigned long long)ESP.getEfuseMac());boardId=id;
 snprintf(id,sizeof(id),"boot-%08lx%08lx",(unsigned long)esp_random(),(unsigned long)esp_random());bootId=id;hostname="harness-"+boardId.substring(4);
 core=new iah::Core(boardId.c_str(),bootId.c_str(),sink);
 for(size_t i=0;i<iah::MaxTargets;i++){String a="bond"+String(i),b="target"+String(i);auto identity=preferences.getString(a.c_str(),""),target=preferences.getString(b.c_str(),"");if(identity.length()&&target.length())core->registerBond(target.c_str(),identity.c_str());}
 String ssid=preferences.getString("ssid",IAH_WIFI_SSID),password=preferences.getString("password",IAH_WIFI_PASSWORD);
 if(ssid.length()){WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);WiFi.begin(ssid.c_str(),password.c_str());}
 startBle();Serial.println("{\"firmware\":\"iah-scaffold\",\"executionEnabled\":false,\"provisioningAP\":false}");
}
void loop(){
 syncPeers();core->tick(nowMs());configureSerial();
 if(WiFi.status()==WL_CONNECTED){
  if(!mdnsStarted){mdnsStarted=MDNS.begin(hostname.c_str());if(mdnsStarted){MDNS.addService("iah","tcp",IAH_HTTP_PORT);MDNS.addServiceTxt("iah","tcp","boardId",boardId.c_str());MDNS.addServiceTxt("iah","tcp","protocolVersion","1");}}
  if(!httpStarted)startHttp();if(httpStarted)http.handleClient();
 }
 // Network handlers must become nonblocking before authenticated control is enabled.
 delay(1);
}
