#include <Arduino.h>
#include <cstring>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <NimBLEDevice.h>
#include <NimBLEHIDDevice.h>
#include "nimble/nimble/host/services/gap/include/services/gap/ble_svc_gap.h"
#include "nimble/porting/nimble/include/nimble/nimble_port.h"
#include "nimble/nimble/include/nimble/nimble_npl.h"
#include <esp_timer.h>
#include <esp_heap_caps.h>
// Board-only storage choices do not rebuild the independent NimBLE library.
#undef IAH_MAX_EVENTS
#define IAH_MAX_EVENTS 128
#define IAH_SEEN_BYTES 7168
#define IAH_EXTERNAL_SEEN 1
#include "src/Core.h"
#include "src/HidReportMap.h"
#include "src/SecureService.h"
#if __has_include("config.local.h")
#include "config.local.h"
#endif
#include "config.example.h"

SET_LOOP_TASK_STACK_SIZE(8192);
static_assert(CONFIG_BT_NIMBLE_MAX_CONNECTIONS==2&&CONFIG_BT_NIMBLE_MAX_BONDS==2,"Arduino build_opt.h must configure the actual NimBLE host");
static_assert(iah::MaxEvents==128,"board report storage must match LAN limit");

// Phone capture and model traffic stay in Web. LAN input requires a
// client grant, observed HID binding proof and a per-target writer lease.
// No relay credentials, model traffic or screenshots are stored on the board.
namespace {
using namespace iah;
NimBLECharacteristic *mouseReport=nullptr,*keyboardReport=nullptr,*consumerReport=nullptr;
struct Peer {uint16_t handle=InvalidHandle;uint32_t epoch=0;bool encrypted=false,bonded=false;uint8_t reports=0;char identity[32]{};uint16_t pointerX=5000,pointerY=5000;bool pointerKnown=false;};
Peer peers[MaxTargets];portMUX_TYPE peersMux=portMUX_INITIALIZER_UNLOCKED;uint32_t nextPeerEpoch=0;std::atomic_bool bondStateDirty{true};
// Diagnostics contain transient connection handles and flags only: never peer
// addresses, bonding material, or credentials. Callbacks write this fixed ring;
// JSON allocation and USB output happen exclusively in loop().
enum class BleEventKind:uint8_t {Connect,Authentication,Identity,Disconnect,Subscription};
struct BleDiagnosticEvent {uint32_t sequence=0,atMs=0;uint16_t handle=InvalidHandle,value=0;int reason=0;BleEventKind kind=BleEventKind::Connect;bool encrypted=false,bonded=false,authenticated=false;uint8_t keySize=0,reportBit=0;};
constexpr size_t BleDiagnosticCapacity=16;
BleDiagnosticEvent bleEvents[BleDiagnosticCapacity];size_t bleEventNext=0,bleEventCount=0;uint32_t bleEventSequence=0;
void recordBleEvent(BleEventKind kind,const NimBLEConnInfo& info,int reason=0,uint8_t reportBit=0,uint16_t value=0){
 BleDiagnosticEvent event;event.atMs=millis();event.handle=info.getConnHandle();event.kind=kind;event.reason=reason;event.reportBit=reportBit;event.value=value;
 event.encrypted=info.isEncrypted();event.bonded=info.isBonded();event.authenticated=info.isAuthenticated();event.keySize=info.getSecKeySize();
 portENTER_CRITICAL(&peersMux);event.sequence=++bleEventSequence;bleEvents[bleEventNext]=event;bleEventNext=(bleEventNext+1)%BleDiagnosticCapacity;if(bleEventCount<BleDiagnosticCapacity)++bleEventCount;portEXIT_CRITICAL(&peersMux);
}
bool peerRouteMatches(uint16_t handle,uint32_t epoch,const char* identity,uint8_t requiredReports){
 bool matches=false;portENTER_CRITICAL(&peersMux);for(const auto& p:peers)if(p.handle==handle&&p.epoch==epoch&&p.encrypted&&p.bonded&&(p.reports&requiredReports)==requiredReports&&std::strcmp(p.identity,identity)==0)matches=true;portEXIT_CRITICAL(&peersMux);return matches;
}
bool peerPointerPosition(uint16_t handle,uint32_t epoch,const char* identity,uint16_t& x,uint16_t& y){
 bool known=false;portENTER_CRITICAL(&peersMux);for(const auto& p:peers)if(p.handle==handle&&p.epoch==epoch&&std::strcmp(p.identity,identity)==0&&p.pointerKnown){x=p.pointerX;y=p.pointerY;known=true;}portEXIT_CRITICAL(&peersMux);return known;
}
void rememberPeerPointer(uint16_t handle,uint32_t epoch,const char* identity,uint16_t x,uint16_t y){
 portENTER_CRITICAL(&peersMux);for(auto& p:peers)if(p.handle==handle&&p.epoch==epoch&&std::strcmp(p.identity,identity)==0){p.pointerX=x;p.pointerY=y;p.pointerKnown=true;}portEXIT_CRITICAL(&peersMux);
}
class BleSink:public Sink {
 enum class Stage:uint8_t {Idle,Preparing,Queued,Running,Sending,Abandoned,Cancelled,Done};
 struct Route {uint16_t handle=InvalidHandle;uint32_t epoch=0;char identity[32]{};};
 Route routes_[MaxTargets];
 struct Job {ble_npl_event event{};uint16_t handle=InvalidHandle;uint32_t epoch=0;char identity[32]{};Event report;uint64_t deadline=0,submitted=0;bool ok=false,releaseOnly=false;};
 Job job_;std::atomic<Stage> stage_{Stage::Idle};SemaphoreHandle_t done_=nullptr;uint64_t lastSubmitted_=0;
 static uint64_t clock(){return static_cast<uint64_t>(esp_timer_get_time())/1000;}
 static void dispatch(ble_npl_event* event){static_cast<BleSink*>(ble_npl_event_get_arg(event))->run();}
 bool notify(){
  auto& e=job_.report;auto h=job_.handle;
  if(e.kind==Kind::Pointer){uint8_t d[]={e.buttons,(uint8_t)e.x,(uint8_t)(e.x>>8),(uint8_t)e.y,(uint8_t)(e.y>>8),0,0};bool ok=mouseReport->notify(d,sizeof(d),h);if(ok)rememberPeerPointer(h,job_.epoch,job_.identity,e.x,e.y);return ok;}
  if(e.kind==Kind::Keyboard){uint8_t d[8]={e.modifiers,0,0,0,0,0,0,0};for(size_t i=0;i<e.count;i++)d[i+2]=e.usages[i];return keyboardReport->notify(d,sizeof(d),h);}
  uint8_t d[]={(uint8_t)e.usage,(uint8_t)(e.usage>>8)};return consumerReport->notify(d,sizeof(d),h);
 }
 void safetyRelease(){
  auto saved=job_.report;Event released;peerPointerPosition(job_.handle,job_.epoch,job_.identity,released.x,released.y);
  for(auto kind:{Kind::Pointer,Kind::Keyboard,Kind::Consumer}){released.kind=kind;job_.report=released;if(peerRouteMatches(job_.handle,job_.epoch,job_.identity,static_cast<uint8_t>(1u<<static_cast<uint8_t>(kind))))notify();}
  job_.report=saved;
 }
 void run(){
  Stage expected=Stage::Queued;
  if(!stage_.compare_exchange_strong(expected,Stage::Running)){if(expected==Stage::Cancelled){safetyRelease();stage_=Stage::Idle;}return;}
  // This job and all Peer writers run on the same NimBLE host queue. No
  // disconnect/connect/subscribe callback can interleave this validation and
  // notify. The short snapshot lock is released before the BLE API call.
  job_.ok=false;Stage owned=Stage::Running;
  bool allowed=clock()<=job_.deadline&&peerRouteMatches(job_.handle,job_.epoch,job_.identity,job_.releaseOnly?static_cast<uint8_t>(1u<<static_cast<uint8_t>(job_.report.kind)):7);
  if(allowed){
   if(job_.releaseOnly&&job_.report.kind==Kind::Pointer)peerPointerPosition(job_.handle,job_.epoch,job_.identity,job_.report.x,job_.report.y);
   expected=Stage::Running;if(!stage_.compare_exchange_strong(expected,Stage::Sending)){if(expected==Stage::Abandoned){safetyRelease();stage_=Stage::Idle;}return;}
   owned=Stage::Sending;job_.ok=notify();
  }
  job_.submitted=clock();if(job_.submitted>job_.deadline)job_.ok=false;
  expected=owned;if(stage_.compare_exchange_strong(expected,Stage::Done))xSemaphoreGive(done_);else if(expected==Stage::Abandoned){safetyRelease();stage_=Stage::Idle;}
 }
 bool send(uint16_t handle,const Event& report,uint64_t deadline,bool releaseOnly=false){
  if(!done_||handle==InvalidHandle)return false;
  if(stage_==Stage::Done&&xSemaphoreTake(done_,0)==pdTRUE)stage_=Stage::Idle;
  Stage expected=Stage::Idle;if(!stage_.compare_exchange_strong(expected,Stage::Preparing))return false;
  Route* route=nullptr;for(auto& r:routes_)if(r.handle==handle)route=&r;
  auto now=clock();if(!route||!route->epoch||now>=deadline){stage_=Stage::Idle;return false;}
  job_.handle=handle;job_.epoch=route->epoch;snprintf(job_.identity,sizeof(job_.identity),"%s",route->identity);job_.report=report;job_.deadline=deadline;job_.ok=false;job_.releaseOnly=releaseOnly;
  stage_.store(Stage::Queued,std::memory_order_release);ble_npl_eventq_put(nimble_port_get_dflt_eventq(),&job_.event);
  auto remaining=std::min<uint64_t>(deadline-now,MaxLatenessMs);
  if(xSemaphoreTake(done_,pdMS_TO_TICKS(remaining)+1)==pdTRUE&&stage_==Stage::Done){bool ok=job_.ok;lastSubmitted_=job_.submitted;stage_=Stage::Idle;return ok;}
  expected=Stage::Queued;if(stage_.compare_exchange_strong(expected,Stage::Cancelled))return false;
  expected=Stage::Running;if(stage_.compare_exchange_strong(expected,Stage::Abandoned))return false;
  expected=Stage::Sending;if(stage_.compare_exchange_strong(expected,Stage::Abandoned))return false;
  if(stage_==Stage::Done&&xSemaphoreTake(done_,0)==pdTRUE){lastSubmitted_=job_.submitted;stage_=Stage::Idle;}return false;
 }
 public:
 void beginRouting(){done_=xSemaphoreCreateBinary();ble_npl_event_init(&job_.event,dispatch,this);}
 bool bindConnection(uint16_t handle,const std::string& identity,uint32_t epoch)override{
  if(!epoch||identity.size()>=sizeof(Route::identity))return false;
  Route* route=nullptr;
  for(auto& r:routes_)if(r.handle==handle)route=&r;
  for(auto& r:routes_)if(!route&&r.handle==InvalidHandle)route=&r;
  if(!route)return false;
  route->handle=handle;route->epoch=epoch;snprintf(route->identity,sizeof(route->identity),"%s",identity.c_str());return true;
 }
 void unbindConnection(uint16_t handle,uint32_t epoch)override{for(auto& r:routes_)if(r.handle==handle&&r.epoch==epoch)r=Route{};}
 bool submit(uint16_t handle,const Event& e)override{return send(handle,e,clock()+MaxLatenessMs);}
 bool submitTimed(uint16_t handle,const Event& e,uint64_t deadline)override{return send(handle,e,deadline);}
 uint64_t submissionTime(uint64_t)const override{return lastSubmitted_;}
 uint64_t currentTime(uint64_t)const override{return clock();}
 bool release(uint16_t handle,const Input& previous)override{
  Event e;e.x=previous.x;e.y=previous.y;bool pointer=send(handle,e,clock()+MaxLatenessMs,true);e.kind=Kind::Keyboard;bool keyboard=send(handle,e,clock()+MaxLatenessMs,true);e.kind=Kind::Consumer;bool consumer=send(handle,e,clock()+MaxLatenessMs,true);return pointer&&keyboard&&consumer;
 }
} sink;
RTC_NOINIT_ATTR uint8_t replayStorage[iah::SeenBytes];
Preferences preferences;
Core* core=nullptr;
SemaphoreHandle_t coreMutex=nullptr;
iah::SecureService* secureService=nullptr;
String boardId,bootId,hostname;
bool mdnsStarted=false,httpStarted=false;
uint64_t nowMs(){return static_cast<uint64_t>(esp_timer_get_time())/1000;}

// NimBLE callbacks run outside loop(). They publish small fixed snapshots;
// NVS updates, client mapping and Core state mutations remain on loop().
void updatePeer(NimBLEConnInfo& info,bool newConnection=false) {
 auto identity=info.getIdAddress();std::string stable;
 if(info.isBonded()&&(identity.isPublic()||identity.isStatic()))stable=std::to_string(identity.getType())+":"+identity.toString();
 portENTER_CRITICAL(&peersMux);
 Peer* slot=nullptr;for(auto& peer:peers)if(peer.handle==info.getConnHandle())slot=&peer;
 if(!slot)for(auto& peer:peers)if(peer.handle==InvalidHandle){slot=&peer;break;}
 if(slot){if(newConnection||slot->handle==InvalidHandle){slot->epoch=++nextPeerEpoch;if(!slot->epoch)slot->epoch=++nextPeerEpoch;slot->reports=0;slot->pointerKnown=false;slot->pointerX=slot->pointerY=5000;}slot->handle=info.getConnHandle();slot->encrypted=info.isEncrypted();slot->bonded=info.isBonded();snprintf(slot->identity,sizeof(slot->identity),"%s",stable.c_str());}
 portEXIT_CRITICAL(&peersMux);
}
class ServerCallbacks:public NimBLEServerCallbacks {
 void onConnect(NimBLEServer* server,NimBLEConnInfo& info)override {
  recordBleEvent(BleEventKind::Connect,info);
  // System Bluetooth pairing must work before the browser is connected and
  // after a restart. A target identity may only resolve during SMP, so never
  // reject this initial connection using the application target table.
  // Input still requires an encrypted bond, browser proof and a writer lease.
  if(server->getConnectedCount()>MaxTargets){server->disconnect(info.getConnHandle());return;}
  updatePeer(info,true);server->updateConnParams(info.getConnHandle(),12,24,0,400);
  // Continue advertising for another phone. Runtime limit is explicit.
  if(server->getConnectedCount()<MaxTargets)NimBLEDevice::getAdvertising()->start();
 }
 void onAuthenticationComplete(NimBLEConnInfo& info)override{
  recordBleEvent(BleEventKind::Authentication,info);
  updatePeer(info);bondStateDirty=true;
  if(!info.isEncrypted())NimBLEDevice::getServer()->disconnect(info.getConnHandle());
 }
 void onIdentity(NimBLEConnInfo& info)override{recordBleEvent(BleEventKind::Identity,info);updatePeer(info);bondStateDirty=true;}
 void onDisconnect(NimBLEServer*,NimBLEConnInfo& info,int reason)override{
  recordBleEvent(BleEventKind::Disconnect,info,reason);
  portENTER_CRITICAL(&peersMux);for(auto& peer:peers)if(peer.handle==info.getConnHandle())peer=Peer{};portEXIT_CRITICAL(&peersMux);bondStateDirty=true;
 }
};
class DeviceCallbacks:public NimBLEDeviceCallbacks {
 int onStoreStatus(ble_store_status_event* event,void*)override{
  if(event->event_code==BLE_STORE_EVENT_FULL)return 0;
  if(event->event_code!=BLE_STORE_EVENT_OVERFLOW||!event->overflow.value)return BLE_HS_EUNKNOWN;
  const auto& value=*event->overflow.value;NimBLEAddress incoming;
  switch(event->overflow.obj_type){
   case BLE_STORE_OBJ_TYPE_OUR_SEC:case BLE_STORE_OBJ_TYPE_PEER_SEC:incoming=NimBLEAddress(value.sec.peer_addr);break;
   case BLE_STORE_OBJ_TYPE_PEER_ADDR:incoming=NimBLEAddress(value.rpa_rec.peer_addr);break;
   case BLE_STORE_OBJ_TYPE_CCCD:incoming=NimBLEAddress(value.cccd.peer_addr);break;
   case BLE_STORE_OBJ_TYPE_CSFC:incoming=NimBLEAddress(value.csfc.peer_addr);break;
   default:return BLE_HS_EUNKNOWN;
  }
  // Runs on the host queue: a connected peer cannot disappear/reappear between
  // this scan and deletion. Never delegate to NimBLE's unpair-oldest policy,
  // which can disconnect the other phone while it is being controlled.
  auto server=NimBLEDevice::getServer();auto connected=server->getPeerDevices();
  for(int i=0;i<NimBLEDevice::getNumBonds();i++){
   auto candidate=NimBLEDevice::getBondedAddress(i);if(candidate==incoming)continue;
   bool online=false;for(auto handle:connected){auto peer=server->getPeerInfoByHandle(handle);if(candidate==peer.getIdAddress()||candidate==peer.getAddress())online=true;}
   if(online)continue;
   if(!NimBLEDevice::deleteBond(candidate))return BLE_HS_ESTORE_FAIL;
   bondStateDirty=true;return 0;
  }
  return BLE_HS_ESTORE_CAP;
 }
};
class ReportCallbacks:public NimBLECharacteristicCallbacks {
 uint8_t bit_;
 public:explicit ReportCallbacks(uint8_t report):bit_(1u<<(report-1)){}
 void onSubscribe(NimBLECharacteristic*,NimBLEConnInfo& info,uint16_t value)override{
  recordBleEvent(BleEventKind::Subscription,info,0,bit_,value);
  updatePeer(info);portENTER_CRITICAL(&peersMux);
  for(auto& peer:peers)if(peer.handle==info.getConnHandle()){if(value&1)peer.reports|=bit_;else peer.reports&=~bit_;}
  portEXIT_CRITICAL(&peersMux);
 }
};
std::string findOrRegisterBond(const std::string& identity){
 for(const auto& target:core->targets())if(target.bondIdentity==identity)return target.id;
 if(core->busy())return "";
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
// Called under Core's mutex, after disconnected peers have been reconciled.
void retireMissingBonds(){
 // Flash writes must not interrupt another phone's timed input or test typing.
 if(core->busy()||(secureService&&secureService->inputBusy()))return;
 if(!bondStateDirty.exchange(false))return;
 ble_addr_t bonds[MaxTargets];int count=0;
 if(ble_store_util_bonded_peers(bonds,&count,MaxTargets)!=0){bondStateDirty=true;return;}
 for(const auto& entry:core->targets()){
  if(entry.id.empty()||entry.connHandle!=InvalidHandle||entry.running)continue;
  bool bonded=false;for(int i=0;i<count;i++){NimBLEAddress addr(bonds[i]);if(entry.bondIdentity==std::to_string(addr.getType())+":"+addr.toString())bonded=true;}
  if(bonded)continue;
  const auto target=entry.id,identity=entry.bondIdentity;
  bool durable=false;
  for(size_t i=0;i<MaxTargets;i++){
   String key="bond"+String(i);
   if(preferences.getString(key.c_str(),"")==identity.c_str()){
    // Atomic NVS delete is the revocation barrier. Keep the Core slot occupied
    // if it fails, so neither runtime nor a reboot can reuse this old proof.
    if(!preferences.remove(key.c_str())||!preferences.getString(key.c_str(),"").isEmpty()){bondStateDirty=true;break;}
    durable=true;break;
   }
  }
  if(!durable){bondStateDirty=true;continue;}
  if(secureService)secureService->forgetTarget(target);
  core->forgetBond(target);
 }
}
void syncPeers(){
 CoreLock lock(coreMutex);
 Peer snapshot[MaxTargets];portENTER_CRITICAL(&peersMux);for(size_t i=0;i<MaxTargets;i++)snapshot[i]=peers[i];portEXIT_CRITICAL(&peersMux);
 for(const auto& target:core->targets())if(target.connHandle!=InvalidHandle){
  bool present=false;for(const auto& peer:snapshot)if(peer.handle==target.connHandle&&peer.epoch==target.connEpoch&&peer.encrypted&&peer.bonded&&peer.identity==target.bondIdentity)present=true;
  if(!present)core->disconnect(target.connHandle,nowMs());
 }
 retireMissingBonds();
 for(const auto& peer:snapshot)if(peer.handle!=InvalidHandle&&peer.encrypted&&peer.bonded&&peer.identity[0]){
  auto target=findOrRegisterBond(peer.identity);if(!target.empty())core->connect(peer.identity,peer.handle,true,true,peer.reports==7,peer.epoch);
 }
}
void startBle(){
 NimBLEDevice::init("iPhone Agent Bridge");NimBLEDevice::setDeviceCallbacks(new DeviceCallbacks());NimBLEDevice::setSecurityAuth(true,false,true);NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);
 auto server=NimBLEDevice::createServer();server->setCallbacks(new ServerCallbacks());server->advertiseOnDisconnect(true);
 auto hid=new NimBLEHIDDevice(server);mouseReport=hid->getInputReport(1);keyboardReport=hid->getInputReport(2);consumerReport=hid->getInputReport(3);hid->getOutputReport(2);
 mouseReport->setCallbacks(new ReportCallbacks(1));keyboardReport->setCallbacks(new ReportCallbacks(2));consumerReport->setCallbacks(new ReportCallbacks(3));
 hid->setManufacturer("iPhone Agent Harness");hid->setPnp(2,0x303A,0x1001,0x0103);hid->setHidInfo(0,1);hid->setReportMap(iah::reportMap,sizeof(iah::reportMap));hid->setBatteryLevel(100);server->start();
 auto advertising=NimBLEDevice::getAdvertising();advertising->setAppearance(HID_MOUSE);advertising->addServiceUUID(hid->getHidService()->getUUID());advertising->enableScanResponse(true);advertising->setName("iPhone Agent Bridge");advertising->start();
}
// Wi-Fi callbacks publish counters only; no credentials, NVS or Core mutex.
std::atomic<uint32_t> wifiDisconnects{0},wifiConnections{0},wifiGotIps{0},wifiLastReason{0},wifiLastEvent{0},wifiLastEventMs{0};
void wifiEvent(arduino_event_id_t event,arduino_event_info_t info){
 wifiLastEvent.store(event);wifiLastEventMs.store(millis());
 if(event==ARDUINO_EVENT_WIFI_STA_DISCONNECTED){wifiLastReason.store(info.wifi_sta_disconnected.reason);wifiDisconnects.fetch_add(1);}
 if(event==ARDUINO_EVENT_WIFI_STA_CONNECTED)wifiConnections.fetch_add(1);
 if(event==ARDUINO_EVENT_WIFI_STA_GOT_IP)wifiGotIps.fetch_add(1);
}
void savedNetwork(String& ssid,String& password){
 ssid=preferences.getString("ssid",IAH_WIFI_SSID);password=preferences.getString("password",IAH_WIFI_PASSWORD);
 JsonDocument network;if(!deserializeJson(network,preferences.getString("network",""))){ssid=network["ssid"]|"";password=network["password"]|"";}
}
bool applySavedPower(){int value=preferences.getInt("rfPower",-1);return value<0||WiFi.setTxPower(static_cast<wifi_power_t>(value));}
void bleDiagnostic(){
 Peer peerSnapshot[MaxTargets];BleDiagnosticEvent events[BleDiagnosticCapacity];size_t count;uint32_t total;
 portENTER_CRITICAL(&peersMux);
 for(size_t i=0;i<MaxTargets;i++)peerSnapshot[i]=peers[i];count=bleEventCount;total=bleEventSequence;
 for(size_t i=0;i<count;i++)events[i]=bleEvents[(bleEventNext+BleDiagnosticCapacity-count+i)%BleDiagnosticCapacity];
 portEXIT_CRITICAL(&peersMux);
 JsonDocument out;out["format"]="iah-ble-diagnostic/1";out["bootId"]=bootId;out["atMs"]=millis();out["initialized"]=NimBLEDevice::isInitialized();
 const char* gapName=ble_svc_gap_device_name();out["gapName"]=gapName?gapName:"";
 auto server=NimBLEDevice::getServer();auto advertising=NimBLEDevice::getAdvertising();
 out["advertising"]=advertising&&advertising->isAdvertising();out["connectedCount"]=server?server->getConnectedCount():0;out["numBonds"]=NimBLEDevice::getNumBonds();
 auto reportHandles=out["reportHandles"].to<JsonObject>();
 if(mouseReport)reportHandles["pointer"]=mouseReport->getHandle();if(keyboardReport)reportHandles["keyboard"]=keyboardReport->getHandle();if(consumerReport)reportHandles["consumer"]=consumerReport->getHandle();
 auto peerRows=out["peers"].to<JsonArray>();for(const auto& peer:peerSnapshot){if(peer.handle==InvalidHandle)continue;auto row=peerRows.add<JsonObject>();row["handle"]=peer.handle;row["epoch"]=peer.epoch;row["encrypted"]=peer.encrypted;row["bonded"]=peer.bonded;row["identityResolved"]=peer.identity[0]!=0;row["reports"]=peer.reports;}
 out["freeHeap"]=ESP.getFreeHeap();out["minFreeHeap"]=ESP.getMinFreeHeap();out["largestFreeBlock"]=heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT);
 out["eventTotal"]=total;auto eventRows=out["events"].to<JsonArray>();
 for(size_t i=0;i<count;i++){const auto& event=events[i];auto row=eventRows.add<JsonObject>();row["sequence"]=event.sequence;row["atMs"]=event.atMs;row["handle"]=event.handle;
  const char* kind="connect";switch(event.kind){case BleEventKind::Connect:break;case BleEventKind::Authentication:kind="authentication";break;case BleEventKind::Identity:kind="identity";break;case BleEventKind::Disconnect:kind="disconnect";break;case BleEventKind::Subscription:kind="subscription";break;}
  row["kind"]=kind;row["encrypted"]=event.encrypted;row["bonded"]=event.bonded;row["authenticated"]=event.authenticated;row["keySize"]=event.keySize;
  if(event.kind==BleEventKind::Disconnect)row["reason"]=event.reason;
  if(event.kind==BleEventKind::Subscription){row["reportBit"]=event.reportBit;row["value"]=event.value;}
 }
 Serial.print("IAH_BLE ");serializeJson(out,Serial);Serial.println();
}
void wifiDiagnostic(){
 String ssid,password;savedNetwork(ssid,password);JsonDocument out;out["format"]="iah-wifi-diagnostic/1";out["wifiConfigured"]=!ssid.isEmpty();out["wifiConnected"]=WiFi.status()==WL_CONNECTED;out["wifiStatus"]=(int)WiFi.status();out["wifiMode"]=(int)WiFi.getMode();out["configuredSsidBytes"]=ssid.length();out["configuredPasswordBytes"]=password.length();out["attemptedSsidMatchesStored"]=WiFi.SSID()==ssid;out["lastDisconnectReason"]=wifiLastReason.load();out["disconnectCount"]=wifiDisconnects.load();out["connectionCount"]=wifiConnections.load();out["gotIpCount"]=wifiGotIps.load();out["lastEvent"]=wifiLastEvent.load();out["lastEventAtMs"]=wifiLastEventMs.load();out["txPowerQuarterDbm"]=(int)WiFi.getTxPower();out["savedTxPowerQuarterDbm"]=preferences.getInt("rfPower",-1);out["freeHeap"]=ESP.getFreeHeap();out["largestFreeBlock"]=heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT);out["loopStackHighWaterBytes"]=uxTaskGetStackHighWaterMark(nullptr);out["nimbleHostMaxConnections"]=CONFIG_BT_NIMBLE_MAX_CONNECTIONS;out["nimbleHostMaxBonds"]=CONFIG_BT_NIMBLE_MAX_BONDS;out["coreMaxEvents"]=MaxEvents;out["replayTombstoneBytes"]=SeenBytes;out["replayStorage"]="rtc";out["nimblePreferredMtu"]=CONFIG_BT_NIMBLE_ATT_PREFERRED_MTU;out["nimbleMsys1Blocks"]=CONFIG_BT_NIMBLE_MSYS_1_BLOCK_COUNT;out["nimbleMsys2Blocks"]=CONFIG_BT_NIMBLE_MSYS_2_BLOCK_COUNT;out["maxRequestBytes"]=WireMaxRequestBytes;out["httpReady"]=secureService->networkReady();if(WiFi.status()==WL_CONNECTED){out["rssi"]=WiFi.RSSI();out["localIp"]=WiFi.localIP().toString();}Serial.print("IAH_WIFI ");serializeJson(out,Serial);Serial.println();
}
bool radioMaintenanceAllowed(){CoreLock lock(coreMutex);return !core->busy()&&!secureService->networkReady();}
void wifiPower(JsonDocument& d){
 JsonDocument out;bool ok=false;int quarter=-1;
 if(d.size()==2&&d["dBm"].is<double>()){double dbm=d["dBm"].as<double>();for(int candidate:{34,44,52,60,68,78})if(dbm==candidate/4.0)quarter=candidate;}
 if(quarter>=0&&radioMaintenanceAllowed()){
  auto previous=WiFi.getTxPower();if(WiFi.setTxPower(static_cast<wifi_power_t>(quarter))){ok=preferences.putInt("rfPower",quarter)==sizeof(int)&&preferences.getInt("rfPower",-1)==quarter;if(!ok)WiFi.setTxPower(previous);}
 }
 out["wifiPowerConfigured"]=ok;out["txPowerQuarterDbm"]=(int)WiFi.getTxPower();if(!ok)out["error"]="requires_idle_radio_and_supported_power";serializeJson(out,Serial);Serial.println();
}
void wifiReconnect(){
 String ssid,password;savedNetwork(ssid,password);bool ok=!ssid.isEmpty()&&radioMaintenanceAllowed();if(ok){WiFi.disconnect(false,false);WiFi.setAutoReconnect(true);ok=applySavedPower();if(ok)WiFi.begin(ssid.c_str(),password.c_str());}Serial.printf("{\"wifiReconnectStarted\":%s}\n",ok?"true":"false");
}
void configureSerial(){
 // USB config/status only. No segment, input, pairing or target-binding commands.
 static String line;static bool dropping=false;
 size_t consumed=0;while(Serial.available()&&consumed++<256){
  char c=Serial.read();if(c!='\n'){if(!dropping&&line.length()<1024)line+=c;else{line="";dropping=true;}continue;}if(dropping){dropping=false;line="";Serial.println("{\"error\":\"configuration_line_too_large\"}");continue;}
  JsonDocument d;auto error=deserializeJson(d,line);line="";if(error){Serial.println("{\"error\":\"invalid_json\"}");continue;}
  String op=d["op"]|"";
  if(op=="ble-diagnostic"){bleDiagnostic();continue;}
  if(op=="wifi-diagnostic"){wifiDiagnostic();continue;}
  if(op=="wifi-power"){wifiPower(d);continue;}
  if(op=="wifi-reconnect"){wifiReconnect();continue;}
  if(op=="setup-info"){secureService->setupInfo();continue;}
  if(op=="setup-profile"){secureService->profileInfo();continue;}
  if(op=="setup-finish"){bool ok=secureService->finishSetup();Serial.printf("{\"setupFinishing\":%s}\n",ok?"true":"false");continue;}
  if(op=="setup-window"){secureService->openSetup();continue;}
  if(op=="setup-config"){bool ok=secureService->configureFromSerial(d);JsonDocument reply;reply["configurationAccepted"]=ok;reply["secureConfigured"]=false;reply["status"]=secureService->configurationStatus();if(ok){reply["publicKeyFingerprint"]=secureService->publicFingerprint();reply["trustProfileChanged"]=secureService->trustProfileChanged();reply["manualTrustRequired"]=false;}serializeJson(reply,Serial);Serial.println();continue;}
  if(op=="status"){JsonDocument out;out["boardId"]=boardId;out["bootId"]=bootId;out["wifiConfigured"]=secureService->networkConfigured();out["configurationStatus"]=secureService->configurationStatus();out["wifiConnected"]=WiFi.status()==WL_CONNECTED;out["executionEnabled"]=secureService->networkReady();serializeJson(out,Serial);Serial.println();continue;}
  Serial.println("{\"error\":\"unsupported_configuration_operation\"}");
 }
}
}
void setup(){
 Serial.begin(115200);preferences.begin("iah-product",false);coreMutex=xSemaphoreCreateMutex();
 char id[32];snprintf(id,sizeof(id),"iah-%012llx",(unsigned long long)ESP.getEfuseMac());boardId=id;
 snprintf(id,sizeof(id),"boot-%08lx%08lx",(unsigned long)esp_random(),(unsigned long)esp_random());bootId=id;hostname="harness-"+boardId.substring(4);
 core=new iah::Core(boardId.c_str(),bootId.c_str(),sink,replayStorage);
 for(size_t i=0;i<iah::MaxTargets;i++){String a="bond"+String(i),b="target"+String(i);auto identity=preferences.getString(a.c_str(),""),target=preferences.getString(b.c_str(),"");if(identity.length()&&target.length())core->registerBond(target.c_str(),identity.c_str());}
 WiFi.onEvent(wifiEvent);
 String ssid,password;savedNetwork(ssid,password);
 if(ssid.length()){WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);applySavedPower();WiFi.begin(ssid.c_str(),password.c_str());}
 startBle();sink.beginRouting();
 secureService=new SecureService(*core,sink,preferences,coreMutex,boardId,bootId,hostname,wifiGotIps);secureService->begin(ssid.isEmpty());
Serial.println("{\"firmware\":\"0.3.0-lan-http\",\"physicalValidation\":false}");
}
void loop(){
 syncPeers();{CoreLock lock(coreMutex);core->tick(nowMs());}configureSerial();secureService->loop();
 if(WiFi.status()==WL_CONNECTED){
  if(!mdnsStarted){mdnsStarted=MDNS.begin(hostname.c_str());if(mdnsStarted){MDNS.addService("iah","tcp",80);MDNS.addServiceTxt("iah","tcp","transport","http");MDNS.addServiceTxt("iah","tcp","boardId",boardId.c_str());MDNS.addServiceTxt("iah","tcp","protocolVersion","1");}}

 }
 // HTTP receives and parses on its own task; only admission/result access takes
 // the same mutex as loop-owned tick and per-target HID challenge scheduling.
 delay(1);
}
