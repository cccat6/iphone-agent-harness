#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <WiFi.h>
#include <Preferences.h>
#include <esp_http_server.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <memory>
#include <atomic>
#include <sys/time.h>
#include "Admission.h"
#include "Pki.h"
#include "Wire.h"
#include "LanBridgePage.h"
#include "WifiSetupPage.h"
#include "BridgeSettings.h"
#include "BridgeSettingsPage.h"
namespace iah {
class CoreLock {SemaphoreHandle_t mutex_;public:explicit CoreLock(SemaphoreHandle_t m):mutex_(m){xSemaphoreTake(m,portMAX_DELAY);}~CoreLock(){xSemaphoreGive(mutex_);}};
class SecureService {
 Core& core_;Sink& sink_;Preferences& prefs_;SemaphoreHandle_t mutex_;String board_,boot_,host_,owner_,apPassword_,origin_;
 std::atomic<uint32_t>& wifiEpoch_;WifiJoinState wifiJoin_;String candidateNetwork_,candidateSsid_,candidatePassword_,candidateOrigin_,previousNetwork_;bool startCandidate_=false;
 WebServer ap_{80};httpd_handle_t http_=nullptr;std::atomic_bool maintenance_{false};Pki pki_;Admission auth_;bool apActive_=false,configComplete_=false,storageReady_=false;SetupDeadline setupDeadline_;uint64_t httpRetryAt_=0;
 BridgeSettings bridgeSettings_;std::atomic<uint64_t> restartAt_{0};
 uint64_t challengeNext_=0;size_t challengeEvent_=0;uint16_t challengeHandle_=InvalidHandle;
 static uint64_t now(){return esp_timer_get_time()/1000;}
 static String header(httpd_req_t* r,const char* key){size_t size=httpd_req_get_hdr_value_len(r,key);if(!size||size>512)return "";std::vector<char> data(size+1);if(httpd_req_get_hdr_value_str(r,key,data.data(),data.size())!=ESP_OK)return "";return data.data();}
 static String status(int code){switch(code){case 200:return "200 OK";case 202:return "202 Accepted";case 204:return "204 No Content";case 400:return "400 Bad Request";case 401:return "401 Unauthorized";case 403:return "403 Forbidden";case 404:return "404 Not Found";case 409:return "409 Conflict";case 413:return "413 Payload Too Large";case 429:return "429 Too Many Requests";default:return "503 Service Unavailable";}}
 esp_err_t send(httpd_req_t* r,int code,JsonDocument& doc){String body;serializeJson(doc,body);String state=status(code);httpd_resp_set_status(r,state.c_str());httpd_resp_set_type(r,"application/json");httpd_resp_set_hdr(r,"Cache-Control","no-store");httpd_resp_set_hdr(r,"Connection","close");httpd_resp_set_hdr(r,"X-Content-Type-Options","nosniff");if(header(r,"Origin")==origin_){httpd_resp_set_hdr(r,"Access-Control-Allow-Origin",origin_.c_str());httpd_resp_set_hdr(r,"Vary","Origin");}// URI-handler ESP_FAIL intentionally closes this completed REST session,
 // preventing a keep-alive client from monopolizing the single TLS slot.
 auto result=httpd_resp_send(r,body.c_str(),body.length());return result==ESP_OK?ESP_FAIL:result;}
 esp_err_t error(httpd_req_t* r,int code,const char* value){JsonDocument d;d["error"]=value;d["boardId"]=board_;d["bootId"]=boot_;return send(r,code,d);}
 struct Reader {httpd_req_t* req;size_t left;uint8_t bytes[256];size_t at=0,size=0;int read(){if(at==size){if(!left)return -1;int count=httpd_req_recv(req,(char*)bytes,std::min(left,sizeof(bytes)));if(count<=0){left=0;return -1;}left-=count;at=0;size=count;}return bytes[at++];}size_t readBytes(char* output,size_t count){size_t n=0;for(;n<count;n++){int c=read();if(c<0)break;output[n]=(char)c;}return n;}};
 bool read(httpd_req_t* r,JsonDocument& doc,size_t limit=2048){if(r->content_len<=0||r->content_len>limit)return false;Reader reader{r,r->content_len};auto e=deserializeJson(doc,reader,DeserializationOption::NestingLimit(8));if(e||!doc.is<JsonObject>())return false;for(int c=reader.read();c>=0;c=reader.read())if(c!=32&&c!=9&&c!=10&&c!=13)return false;return reader.left==0;}
 Grant* authenticate(httpd_req_t* r){String auth=header(r,"Authorization");if(auth.length()!=71||!auth.startsWith("Bearer "))return nullptr;String token=auth.substring(7);return auth_.authenticate(sha256Hex(token).c_str(),origin_.c_str());}
 bool saveGrant(const Grant& grant){size_t i=MaxClients;for(size_t n=0;n<MaxClients;n++)if(auth_.grants()[n].active&&auth_.grants()[n].clientId==grant.clientId){i=n;break;}if(i==MaxClients)for(size_t n=0;n<MaxClients;n++)if(!auth_.grants()[n].active){i=n;break;}if(i==MaxClients)return false;JsonDocument doc;doc["id"]=grant.clientId;doc["hash"]=grant.tokenHash;doc["origin"]=grant.origin;doc["target"]=grant.targetId;String text;serializeJson(doc,text);String key="grant"+String(i);return prefs_.putString(key.c_str(),text)==text.length()&&prefs_.getString(key.c_str(),"")==text;}
 void addSettings(JsonDocument& d){addIdentity(d);d["hostname"]=bridgeSettings_.hostname;d["newURL"]="http://"+String(bridgeSettings_.hostname.c_str())+".local";}
 void addIdentity(JsonDocument& d){d["boardId"]=board_;d["bootId"]=boot_;}
 void addTargets(JsonDocument& d){auto list=d["targets"].to<JsonArray>();for(const auto& t:core_.targets())if(!t.id.empty()){auto row=list.add<JsonObject>();row["targetId"]=t.id;row["connected"]=t.connHandle!=InvalidHandle;row["encrypted"]=t.encrypted;row["hidSubscribed"]=t.subscribed;row["inputReleased"]=!t.releasePending;bool challenge=auth_.typing(now())&&auth_.target()==t.id;row["inputState"]=(!t.releasePending&&!t.running&&!challenge)?"released":"unknown";row["running"]=t.running||challenge;}}
 void receipt(JsonDocument& d,const Result& result){addIdentity(d);d["targetId"]=result.targetId;d["clientId"]=result.clientId;d["segmentId"]=result.segmentId;d["planId"]=result.planId;d["payloadHash"]=result.payloadHash;d["status"]=statusName(result.status);d["releaseSubmitted"]=result.releaseSubmitted;d["acceptedAtDeviceMs"]=result.acceptedAt;d["startedAtDeviceMs"]=result.startedAt;d["endedAtDeviceMs"]=result.endedAt;d["submitted"]=result.submitted;d["maxLatenessMs"]=result.maxLatenessMs;}
 static std::vector<String> path(String uri){int query=uri.indexOf('?');if(query>=0)uri=uri.substring(0,query);std::vector<String> parts;int at=1;while(at<(int)uri.length()){int end=uri.indexOf('/',at);if(end<0)end=uri.length();parts.push_back(uri.substring(at,end));at=end+1;}return parts;}
 static esp_err_t route(httpd_req_t* request){return static_cast<SecureService*>(request->user_ctx)->handle(request);}
 struct Decision {int status;String error;};
 template<class Action> esp_err_t lockedReply(httpd_req_t* request,Action action){
  JsonDocument doc;Decision decision;
  {CoreLock lock(mutex_);decision=action(doc);}
  // No Core mutex is held during serialization or socket writes.
  return decision.error.length()?error(request,decision.status,decision.error.c_str()):send(request,decision.status,doc);
 }
 esp_err_t handle(httpd_req_t* r){
  String browserOrigin=header(r,"Origin");
  // The local bridge page sends same-origin HTTP requests. Its own script verifies
  // the Harness window/origin/nonce before forwarding; bearer and Core fences remain mandatory.
  String localName=host_+".local",localIp=WiFi.localIP().toString(),hostHeader=header(r,"Host");hostHeader.toLowerCase();
  bool localHost=hostHeader==localName||hostHeader==localName+":80"||hostHeader==localIp||hostHeader==localIp+":80";
  bool localOrigin=browserOrigin.isEmpty()||browserOrigin=="http://"+localName||browserOrigin=="http://"+localName+":80"||browserOrigin=="http://"+localIp||browserOrigin=="http://"+localIp+":80";
  if(header(r,"X-Harness-Window")=="1"&&localHost&&localOrigin)browserOrigin=origin_;
  if(r->method==HTTP_GET&&(String(r->uri)=="/harness-link"||String(r->uri)=="/settings"||String(r->uri)=="/")){
   String page=String(r->uri)=="/harness-link"?renderLanBridgePage(origin_):String(renderBridgeSettingsPage());
   httpd_resp_set_type(r,"text/html; charset=utf-8");httpd_resp_set_hdr(r,"Cache-Control","no-store");httpd_resp_set_hdr(r,"Referrer-Policy","no-referrer");httpd_resp_set_hdr(r,"X-Frame-Options","DENY");httpd_resp_set_hdr(r,"Content-Security-Policy","default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");httpd_resp_set_hdr(r,"Connection","close");auto sent=httpd_resp_send(r,page.c_str(),page.length());return sent==ESP_OK?ESP_FAIL:sent;
  }
  if(browserOrigin.length()&&browserOrigin!=origin_)return error(r,403,"origin_not_allowed");
  if(r->method==HTTP_OPTIONS){
   if(browserOrigin!=origin_)return error(r,403,"origin_required");
   httpd_resp_set_status(r,"204 No Content");httpd_resp_set_hdr(r,"Access-Control-Allow-Origin",origin_.c_str());
   httpd_resp_set_hdr(r,"Access-Control-Allow-Methods","GET,POST,OPTIONS");httpd_resp_set_hdr(r,"Access-Control-Allow-Headers","authorization,content-type,x-request-id");
   httpd_resp_set_hdr(r,"Access-Control-Allow-Private-Network","true");httpd_resp_set_hdr(r,"Vary","Origin");httpd_resp_set_hdr(r,"Connection","close");
   auto sent=httpd_resp_send(r,nullptr,0);return sent==ESP_OK?ESP_FAIL:sent;
  }
  auto parts=path(r->uri);if(parts.size()<2||parts[0]!="v1")return error(r,404,"not_found");
  if(r->method==HTTP_GET&&parts[1]=="identity"){
   JsonDocument d;addIdentity(d);d["protocolVersion"]=1;d["hostname"]=host_+".local";d["publicKeyFingerprint"]=pki_.caFingerprint;
   d["firmwareVersion"]="0.3.0-lan-http";d["transport"]="http";d["tls"]=false;d["requiresManualTrust"]=false;d["pairingAvailable"]=true;d["pairingCodeRequired"]=false;return send(r,200,d);
  }
  if(r->method==HTTP_GET&&parts[1]=="clock"){JsonDocument d;addIdentity(d);d["deviceTimeMs"]=now();return send(r,200,d);}
  if(r->method==HTTP_GET&&parts[1]=="capabilities"){
   JsonDocument d;addIdentity(d);d["protocolVersion"]=1;d["executionEnabled"]=!maintenance_;d["pairingAvailable"]=true;
   d["maxTargets"]=MaxTargets;d["maxClients"]=MaxClients;d["maxEvents"]=WireMaxEvents;d["reportIntervalMs"]=40;d["pointerSettleMs"]=20;d["maxRequestBytes"]=WireMaxRequestBytes;d["maxSegmentMs"]=MaxSegmentMs;
   d["maxHoldMs"]=MaxHoldMs;d["maxLeaseMs"]=MaxLeaseMs;d["captureOnDevice"]=false;d["physicalValidation"]=false;d["maxConcurrentRequests"]=2;
   d["freeHeapBytes"]=ESP.getFreeHeap();d["minFreeHeapBytes"]=ESP.getMinFreeHeap();d["transport"]="http";
   auto operations=d["operations"].to<JsonArray>();for(auto op:{"tap","drag","swipe","pointer_sequence","key","home","wait","capture","observe"})operations.add(op);
   return send(r,200,d);
  }
  if(browserOrigin!=origin_)return error(r,403,"origin_required");
  if(r->method==HTTP_POST&&parts.size()==2&&parts[1]=="probe"){
   JsonDocument body;if(!read(r,body,1024)||!fields(body.as<JsonObjectConst>(),{"probe","nonce"})||body["probe"]!=true||!body["nonce"].is<const char*>()||strlen(body["nonce"].as<const char*>())>80)return error(r,400,"invalid_probe");
   JsonDocument d;addIdentity(d);d["probe"]=true;d["nonce"]=body["nonce"];d["phoneInputSent"]=false;return send(r,200,d);
  }
  if(r->method==HTTP_POST&&parts.size()==2&&parts[1]=="pair"){
   JsonDocument body;if(!read(r,body)||!validBridgeEnrollment(body.as<JsonObjectConst>()))return error(r,400,"invalid_pair_request");
   // setupPassword remains accepted for older clients, but is never required.
   String client=body["clientId"]|"";
   if(!validId(client.c_str()))return error(r,400,"invalid_client_id");
   String token=randomHex(32),hash=sha256Hex(token);
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    if(maintenance_||core_.busy()||auth_.active(now()))return {409,"board_busy"};
    Admission candidate=auth_;
    if(!candidate.install(client.c_str(),hash.c_str(),origin_.c_str()))return {409,"client_capacity"};
    if(!saveGrant(*candidate.client(client.c_str())))return {503,"credential_persistence_failed"};
    auth_=std::move(candidate);
    addIdentity(d);d["clientId"]=client;d["token"]=token;d["hostname"]=host_+".local";d["publicKeyFingerprint"]=pki_.caFingerprint;return {200,""};
   });
  }
  Grant grant;bool authenticated=false;
  {CoreLock lock(mutex_);auto current=authenticate(r);if(current){grant=*current;authenticated=true;}}
  if(!authenticated)return error(r,401,"invalid_client_credential");
  if(parts.size()==2&&parts[1]=="settings"){
   if(r->method==HTTP_GET)return lockedReply(r,[&](JsonDocument& d)->Decision{addSettings(d);return {200,""};});
   if(r->method!=HTTP_POST)return error(r,404,"not_found");
   JsonDocument body;if(!read(r,body,512)||!validBridgeSettingsUpdate(body.as<JsonObjectConst>()))return error(r,400,"invalid_bridge_settings");
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    if(maintenance_||core_.configurationBusy(now())||auth_.active(now()))return {409,"board_busy"};
    // Only persist the supported setting; legacy code flags cannot re-enable a removed feature.
    JsonDocument settings;settings["hostname"]=body["hostname"];String encoded;serializeJson(settings,encoded);String previous=prefs_.getString("bridgeSettings","");
    if(prefs_.putString("bridgeSettings",encoded)!=encoded.length()||prefs_.getString("bridgeSettings","")!=encoded){if(previous.length())prefs_.putString("bridgeSettings",previous);else prefs_.remove("bridgeSettings");return {503,"settings_persistence_failed"};}
    bridgeSettings_=readBridgeSettings(encoded.c_str());bool restart=host_!=bridgeSettings_.hostname.c_str();
    addSettings(d);d["restartRequired"]=restart;if(restart){maintenance_=true;restartAt_=now()+2000;}return {200,""};
   });
  }
  if(r->method==HTTP_GET&&parts.size()==2&&parts[1]=="binding"){
   return lockedReply(r,[&](JsonDocument& d)->Decision{addIdentity(d);d["clientId"]=grant.clientId;
    if(grant.targetId.empty())d["targetId"]=nullptr;else d["targetId"]=grant.targetId;
    d["bindingVerified"]=!grant.targetId.empty();addTargets(d);return {200,""};});
  }
  if(parts.size()<4||parts[1]!="targets"||!validId(parts[2].c_str()))return error(r,404,"not_found");
  String target=parts[2];
  if(parts.size()==5&&parts[3]=="challenge"&&r->method==HTTP_POST){
   JsonDocument body;if(!read(r,body))return error(r,400,"invalid_challenge_request");
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    auto t=core_.target(target.c_str());
    if(maintenance_||!t||t->connHandle==InvalidHandle||!t->encrypted||!t->subscribed||t->releasePending)return {409,"target_not_ready"};
    if(parts[4]=="start"){
     if(body.size()!=0||core_.busy()||t->lease.expiresAt>now())return {409,"target_busy"};
     String nonce;for(int i=0;i<8;i++)nonce+=char('0'+esp_random()%10);String challenge="challenge-"+randomHex(16);
     if(!auth_.begin(grant.clientId,target.c_str(),challenge.c_str(),nonce.c_str(),now()))return {429,"challenge_busy_or_rate_limited"};
     challengeEvent_=0;challengeNext_=now()+200;challengeHandle_=t->connHandle;
     addIdentity(d);d["targetId"]=target;d["challengeId"]=challenge;d["length"]=8;d["status"]="typing";
     d["expiresInMs"]=30000;d["expiresAtDeviceMs"]=auth_.expiresAt();return {202,""};
    }
    if(parts[4]!="confirm")return {404,"not_found"};
    if(!fields(body.as<JsonObjectConst>(),{"challengeId","observedNonce"}))return {400,"invalid_challenge_confirmation"};
    Admission candidate=auth_;
    if(!candidate.confirm(grant.clientId,target.c_str(),std::string(body["challengeId"]|""),std::string(body["observedNonce"]|""),now())){
     auth_=std::move(candidate);return {403,"challenge_not_verified"};
    }
    auto accepted=core_.bindClient(grant.clientId,target.c_str());
    if(accepted!=Code::Accepted&&accepted!=Code::Duplicate)return {409,"binding_conflict"};
    if(!saveGrant(*candidate.client(grant.clientId))){if(accepted==Code::Accepted)core_.forgetClient(grant.clientId,now());return {503,"binding_persistence_failed"};}
    auth_=std::move(candidate);addIdentity(d);d["clientId"]=grant.clientId;d["targetId"]=target;d["bindingVerified"]=true;return {200,""};
   });
  }
  if(grant.targetId!=target.c_str())return error(r,403,"wrong_target");
  if(parts.size()==5&&parts[3]=="leases"&&r->method==HTTP_POST){
   JsonDocument body;if(!read(r,body)||!fields(body.as<JsonObjectConst>(),{"leaseId","ttlMs"})||!body["leaseId"].is<const char*>()||!validId(body["leaseId"].as<const char*>())||!wireInteger(body["ttlMs"],1,MaxLeaseMs))return error(r,400,"invalid_lease");
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    auto t=core_.target(target.c_str());if(maintenance_||!t||t->releasePending||auth_.active(now())||(parts[4]=="claim"&&t->running))return {409,"target_busy"};
    std::string lease=body["leaseId"].as<const char*>();
    if(parts[4]=="renew"&&(t->lease.id!=lease||t->lease.clientId!=grant.clientId||t->lease.expiresAt<=now()))return {409,"lease_expired"};
    if(parts[4]!="renew"&&parts[4]!="claim")return {404,"not_found"};
    if(core_.lease(target.c_str(),grant.clientId,lease,body["ttlMs"].as<int>(),now())!=Code::Accepted)return {409,"lease_conflict"};
    addIdentity(d);d["targetId"]=target;d["clientId"]=grant.clientId;d["leaseId"]=lease;d["expiresAtDeviceMs"]=t->lease.expiresAt;d["inputState"]=t->running?"unknown":"released";return {200,""};
   });
  }
  if(parts.size()==4&&parts[3]=="segments"&&r->method==HTTP_POST){
   if(r->content_len>WireMaxRequestBytes)return error(r,413,"segment_request_too_large");
   JsonDocument body;if(!read(r,body,WireMaxRequestBytes))return error(r,400,"invalid_segment_json");
   auto segment=std::unique_ptr<Segment>(new(std::nothrow)Segment);String why;
   if(!segment||!parseSegment(body.as<JsonObjectConst>(),*segment,why))return error(r,400,segment?why.c_str():"memory_unavailable");
   if(segment->targetId!=target.c_str()||segment->clientId!=grant.clientId)return error(r,403,"wrong_target_or_client");
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    if(maintenance_||auth_.active(now()))return {409,"binding_in_progress"};auto accepted=core_.accept(*segment,now());
    if(accepted!=Code::Accepted&&accepted!=Code::Duplicate)return {accepted==Code::Invalid?400:409,accepted==Code::StaleBoot?"stale_boot":accepted==Code::ReplayUnknown?"result_unknown":"segment_rejected"};
    auto value=core_.result(grant.clientId,segment->segmentId);if(!value)return {503,"result_unknown"};receipt(d,*value);return {202,""};
   });
  }
  if(parts.size()==5&&parts[3]=="results"&&r->method==HTTP_GET){
   return lockedReply(r,[&](JsonDocument& d)->Decision{auto value=core_.result(grant.clientId,parts[4].c_str());
    if(!value||value->targetId!=target.c_str())return {404,"result_unknown"};receipt(d,*value);return {200,""};});
  }
  if(parts.size()==4&&(parts[3]=="release"||parts[3]=="cancel")&&r->method==HTTP_POST){
   JsonDocument body;if(!read(r,body)||!fields(body.as<JsonObjectConst>(),{"leaseId","cancelPending","invalidateLease"})||!body["cancelPending"].is<bool>()||!body["invalidateLease"].is<bool>()||body["cancelPending"]!=true||body["invalidateLease"]!=true)return error(r,400,"release_requires_lease_fence");
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    auto t=core_.target(target.c_str());if(!t||t->lease.clientId!=grant.clientId||t->lease.id!=std::string(body["leaseId"]|""))return {409,"lease_conflict"};
    auto accepted=core_.cancel(target.c_str(),grant.clientId,now());bool released=accepted==Code::Accepted&&!t->releasePending;
    addIdentity(d);d["targetId"]=target;d["status"]=released?"released":"unknown";d["leaseInvalidated"]=accepted==Code::Accepted;d["releaseSubmitted"]=released;return {released?200:503,""};
   });
  }
  return error(r,404,"not_found");
 }
 void releaseChallenge(){auto target=core_.target(auth_.target());if(target&&target->connHandle==challengeHandle_&&challengeHandle_!=InvalidHandle)target->releasePending=!sink_.release(challengeHandle_,target->input);}
 bool hasNetworkAddress()const{auto ip=WiFi.localIP();return WiFi.status()==WL_CONNECTED&&ip[0]>0&&ip[0]<224&&ip[0]!=127;}
 void restorePreviousNetwork(){
  JsonDocument previous;String ssid,password;
  if(!deserializeJson(previous,previousNetwork_)){ssid=previous["ssid"]|"";password=previous["password"]|"";}
  else {ssid=prefs_.getString("ssid","");password=prefs_.getString("password","");}
  candidateNetwork_="";candidateSsid_="";candidatePassword_="";candidateOrigin_="";
  WiFi.disconnect(false,false);if(ssid.length())WiFi.begin(ssid.c_str(),password.c_str());
 }
 void updateNetwork(){
  if(startCandidate_){startCandidate_=false;wifiJoin_.begin(now(),wifiEpoch_.load());WiFi.persistent(false);WiFi.disconnect(false,false);WiFi.begin(candidateSsid_.c_str(),candidatePassword_.c_str());}
  auto decision=wifiJoin_.poll(WiFi.status()==WL_CONNECTED,hasNetworkAddress(),WiFi.SSID()==candidateSsid_,wifiEpoch_.load(),now());
  if(decision==WifiJoinState::Decision::Commit){
   bool saved=prefs_.putString("network",candidateNetwork_)==candidateNetwork_.length()&&prefs_.getString("network","")==candidateNetwork_;
   if(saved){origin_=candidateOrigin_;configComplete_=true;candidateNetwork_="";candidateSsid_="";candidatePassword_="";candidateOrigin_="";previousNetwork_="";wifiJoin_.committed(true);}
   else {if(previousNetwork_.length())prefs_.putString("network",previousNetwork_);else prefs_.remove("network");wifiJoin_.committed(false);restorePreviousNetwork();}
  }else if(decision==WifiJoinState::Decision::Fail)restorePreviousNetwork();
  if(wifiJoin_.recoveryDue(hasNetworkAddress(),apActive_,now()))openSetup();
 }
 bool apRequest(){return apActive_&&ap_.client().localIP()==WiFi.softAPIP();}
 bool configure(JsonDocument& body){
  if(!storageReady_)return false;
  if(!fields(body.as<JsonObjectConst>(),{"setupPassword","ssid","password","origin","unixTime"}))return false;
  for(auto key:{"setupPassword","ssid","password","origin"})if(!body[key].is<const char*>())return false;
  if(!body["unixTime"].is<int64_t>())return false;
  String password=body["setupPassword"]|"",ssid=body["ssid"]|"",wifiPassword=body["password"]|"",origin=body["origin"]|"https://igent.cc";int64_t unixTime=body["unixTime"]|0LL;
  for(size_t i=8;i<origin.length();i++){char c=origin[i];if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='.'||c=='-'||c==':'||c=='['||c==']'))return false;}
  if(!constantEqual(password.c_str(),owner_.c_str())||ssid.isEmpty()||ssid.length()>32||wifiPassword.length()>63||!origin.startsWith("https://")||origin.length()>180||origin.indexOf('/',8)>=0||origin.indexOf('@')>=0||unixTime<1704067200||unixTime>4102444800LL)return false;
  {CoreLock lock(mutex_);if(core_.busy()||http_)return false;}
  setupDeadline_.opened(); // A new owner-validated configuration cancels an earlier finish timer.
  timeval tv{(time_t)unixTime,0};settimeofday(&tv,nullptr);
  // LAN HTTP needs no generated CA or certificate installation.
  JsonDocument network;network["ssid"]=ssid;network["password"]=wifiPassword;network["origin"]=origin;String stored;serializeJson(network,stored);previousNetwork_=prefs_.getString("network","");candidateNetwork_=stored;candidateSsid_=ssid;candidatePassword_=wifiPassword;candidateOrigin_=origin;startCandidate_=true;wifiJoin_.begin(now(),wifiEpoch_.load());return true;
 }
 public:
 // Caller holds Core's mutex and has durably removed this target's bond map.
 // Preserve owner/client credentials; only the phone proof is revoked.
 bool inputBusy()const{return auth_.typing(now());}
 void forgetTarget(const std::string& target){
  std::array<bool,MaxClients> changed{};size_t i=0;
  for(const auto& grant:auth_.grants())changed[i++]=grant.active&&grant.targetId==target;
  if(auth_.target()==target)challengeHandle_=InvalidHandle;auth_.forgetTarget(target);
  i=0;for(const auto& grant:auth_.grants())if(changed[i++])saveGrant(grant);
  // A failed grant write cannot resurrect proof after reboot: begin() rejects
  // any target missing from the durable bond map, which was removed first.
 }
 bool configureFromSerial(JsonDocument& input){
  if(!fields(input.as<JsonObjectConst>(),{"op","ssid","password","origin","unixTime"}))return false;
  if(!apActive_)openSetup();
  JsonDocument config;for(auto key:{"ssid","password","origin","unixTime"})config[key]=input[key];config["setupPassword"]=owner_;
  return configure(config);
 }
 void profileInfo(){JsonDocument doc;doc["format"]="iah-profile/1";doc["publicKeyFingerprint"]=pki_.caFingerprint;if(pki_.certPem.length())doc["mobileconfig"]=pki_.mobileconfig(board_);else doc["mobileconfig"]=nullptr;Serial.print("IAH_PROFILE ");serializeJson(doc,Serial);Serial.println();}
 bool finishSetup(){return setupDeadline_.finish(apActive_,!startCandidate_&&wifiJoin_.canFinish(configComplete_,WiFi.status()==WL_CONNECTED,hasNetworkAddress()),now());}
 bool trustProfileChanged()const{return pki_.trustProfileChanged;}
 const String& publicFingerprint()const{return pki_.caFingerprint;}
 SecureService(Core& core,Sink& sink,Preferences& prefs,SemaphoreHandle_t mutex,const String& board,const String& boot,const String& host,std::atomic<uint32_t>& wifiEpoch):core_(core),sink_(sink),prefs_(prefs),mutex_(mutex),board_(board),boot_(boot),host_(host),wifiEpoch_(wifiEpoch){}
 void begin(bool needsWifi){
  bridgeSettings_=readBridgeSettings(prefs_.getString("bridgeSettings", "").c_str());
  owner_=prefs_.getString("owner","");apPassword_=prefs_.getString("apPass","");origin_=prefs_.getString("origin","https://igent.cc");JsonDocument network;if(!deserializeJson(network,prefs_.getString("network","")))origin_=network["origin"]|"https://igent.cc";configComplete_=!needsWifi;if(owner_.isEmpty()){owner_=randomHex(32);prefs_.putString("owner",owner_);}if(apPassword_.isEmpty()){apPassword_=randomHex(12);prefs_.putString("apPass",apPassword_);}storageReady_=prefs_.getString("owner","")==owner_&&prefs_.getString("apPass","")==apPassword_;if(!storageReady_){Serial.println("{\"error\":\"ownership_storage_not_ready\"}");return;}pki_.caFingerprint=sha256Hex(owner_); // Stable board identity label, not a TLS certificate proof.
  for(size_t i=0;i<MaxClients;i++){JsonDocument doc;auto text=prefs_.getString(("grant"+String(i)).c_str(),"");if(!deserializeJson(doc,text)){std::string id=doc["id"]|"",hash=doc["hash"]|"",origin=doc["origin"]|"",target=doc["target"]|"";if(!core_.target(target))target.clear();if(auth_.install(id,hash,origin,target)&&!target.empty())core_.bindClient(id,target);}}
  ap_.on("/",HTTP_GET,[this]{
   if(!apRequest()){ap_.send(403,"text/plain","Connect to this device's setup Wi-Fi first.");return;}
   ap_.sendHeader("Cache-Control","no-store");ap_.sendHeader("Content-Security-Policy","default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
   String page=renderWifiSetupPage(owner_);
   ap_.send(200,"text/html; charset=utf-8",page);
  });
  ap_.on("/configure",HTTP_POST,[this]{if(!apRequest()||ap_.header("Origin")!="http://192.168.4.1"){ap_.send(403,"application/json","{\"error\":\"protected_ap_origin_required\"}");return;}JsonDocument body;if(ap_.arg("plain").length()>2048||deserializeJson(body,ap_.arg("plain"))||!configure(body)){ap_.send(403,"application/json","{\"error\":\"configuration_rejected\"}");return;}JsonDocument reply;reply["accepted"]=true;reply["status"]="connecting";reply["httpUrl"]="http://"+host_+".local";reply["boardId"]=board_;reply["publicKeyFingerprint"]=pki_.caFingerprint;reply["manualTrustRequired"]=false;String out;serializeJson(reply,out);ap_.sendHeader("Cache-Control","no-store");ap_.send(202,"application/json",out);});
  ap_.on("/connection-status",HTTP_GET,[this]{if(!apRequest()){ap_.send(403,"application/json","{\"error\":\"setup_only\"}");return;}JsonDocument reply;bool connected=!startCandidate_&&wifiJoin_.canFinish(configComplete_,WiFi.status()==WL_CONNECTED,hasNetworkAddress());reply["status"]=connected?"connected":wifiJoin_.name();reply["configured"]=connected;reply["pairingCodeRequired"]=false;reply["httpUrl"]="http://"+host_+".local";reply["boardId"]=board_;String out;serializeJson(reply,out);ap_.sendHeader("Cache-Control","no-store");ap_.send(200,"application/json",out);});
  ap_.on("/finish",HTTP_POST,[this]{JsonDocument d;if(!apRequest()||ap_.header("Origin")!="http://192.168.4.1"||deserializeJson(d,ap_.arg("plain"))||!constantEqual(std::string(d["setupPassword"]|""),owner_.c_str())||!configComplete_){ap_.send(403,"text/plain","Owner proof required");return;}if(!finishSetup()){ap_.send(409,"application/json","{\"error\":\"wifi_not_connected\"}");return;}ap_.send(200,"application/json","{\"configured\":true}");});
  ap_.on("/ca.mobileconfig",HTTP_GET,[this]{if(!apRequest()||pki_.certPem.isEmpty()){ap_.send(403,"text/plain","Use the protected setup AP after configuration.");return;}auto profile=pki_.mobileconfig(board_);ap_.sendHeader("Cache-Control","no-store");ap_.sendHeader("Content-Disposition","attachment; filename=igent-device-ca.mobileconfig");ap_.send(200,"application/x-apple-aspen-config",profile);});
  ap_.onNotFound([this]{ap_.send(403,"application/json","{\"error\":\"setup_only\"}");});const char* headers[]={"Origin"};ap_.collectHeaders(headers,1);if(needsWifi)openSetup();
 }
 void setupInfo(){JsonDocument info;info["format"]="iah-setup/1";info["storageReady"]=storageReady_;info["boardId"]=board_;info["bootId"]=boot_;info["apSsid"]="iPhone-Harness-"+board_.substring(4);info["apPassword"]=apPassword_;info["setupPassword"]="";info["pairingCodeRequired"]=false;info["hostname"]=host_+".local";info["httpUrl"]="http://"+host_+".local";info["httpsUrl"]=nullptr;info["transport"]="http";info["manualTrustRequired"]=false;info["caReady"]=false;info["apActive"]=apActive_;if(pki_.caFingerprint.length())info["publicKeyFingerprint"]=pki_.caFingerprint;else info["publicKeyFingerprint"]=nullptr;if(apActive_&&!pki_.certPem.isEmpty())info["caProfileUrl"]="http://192.168.4.1/ca.mobileconfig";else info["caProfileUrl"]=nullptr;Serial.print("IAH_SETUP ");serializeJson(info,Serial);Serial.println();}
 void openSetup(){
  setupDeadline_.opened();maintenance_=true;
  if(http_){
   {CoreLock lock(mutex_);for(const auto& t:core_.targets())if(!t.lease.clientId.empty())core_.cancel(t.id,t.lease.clientId,now());releaseChallenge();auth_.invalidate();}
   httpd_stop(http_);http_=nullptr;
  }
  WiFi.mode(WIFI_AP_STA);apActive_=WiFi.softAP(("iPhone-Harness-"+board_.substring(4)).c_str(),apPassword_.c_str(),1,false,1);if(apActive_)ap_.begin();
  Serial.println("{\"event\":\"protected_setup_available\",\"secretsLogged\":false}");
 }
 bool networkConfigured()const{return configComplete_;}
 const char* configurationStatus()const{return wifiJoin_.name();}
 bool networkReady()const{return http_!=nullptr;}
 void loop(){
  if(!storageReady_)return;
  if(restartAt_.load()&&now()>=restartAt_.load()){{CoreLock lock(mutex_);if(core_.configurationBusy(now())||auth_.active(now()))return;}ESP.restart();return;}
  if(!http_)ap_.handleClient();
  updateNetwork();
  if(setupDeadline_.due(apActive_,now())){ap_.stop();WiFi.softAPdisconnect(true);apActive_=false;setupDeadline_.closed();}
  if(!http_&&!apActive_&&WiFi.status()==WL_CONNECTED&&now()>=httpRetryAt_){httpRetryAt_=now()+10000;
   httpd_config_t cfg=HTTPD_DEFAULT_CONFIG();cfg.server_port=80;cfg.max_open_sockets=2;cfg.max_uri_handlers=1;cfg.max_resp_headers=12;cfg.uri_match_fn=httpd_uri_match_wildcard;cfg.recv_wait_timeout=2;cfg.send_wait_timeout=2;cfg.stack_size=8192;cfg.task_priority=1;
   if(httpd_start(&http_,&cfg)==ESP_OK){httpd_uri_t routeConfig{};routeConfig.uri="/*";routeConfig.method=(httpd_method_t)HTTP_ANY;routeConfig.handler=route;routeConfig.user_ctx=this;if(httpd_register_uri_handler(http_,&routeConfig)!=ESP_OK){httpd_stop(http_);http_=nullptr;Serial.println("{\"event\":\"http_route_registration_failed\"}");return;}maintenance_=false;if(apActive_){WiFi.softAPdisconnect(true);apActive_=false;}Serial.println("{\"event\":\"http_ready\",\"privateCredentialsLogged\":false}");}else http_=nullptr;
  }
  CoreLock lock(mutex_);if(auth_.expiresAt()&&now()>=auth_.expiresAt()){releaseChallenge();auth_.invalidate();}
  if(auth_.typing(now())){
   auto t=core_.target(auth_.target());if(!t||t->connHandle!=challengeHandle_||!t->encrypted||!t->subscribed){releaseChallenge();auth_.invalidate();return;}
   if(now()<challengeNext_)return;if(now()>challengeNext_+100){releaseChallenge();auth_.invalidate();return;}
   Event e;e.kind=Kind::Keyboard;if(challengeEvent_%2==0){char digit=auth_.digit(challengeEvent_/2);e.count=1;e.usages[0]=digit=='0'?39:29+(digit-'0');}
   if(!sink_.submit(challengeHandle_,e)){releaseChallenge();auth_.invalidate();return;}challengeEvent_++;challengeNext_=now()+30;
   if(challengeEvent_>=16){bool released=sink_.release(challengeHandle_,t->input);t->releasePending=!released;if(released)auth_.typed();else auth_.invalidate();}
  }
 }
};
}
