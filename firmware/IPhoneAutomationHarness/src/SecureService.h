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
#include <cerrno>
#include <sys/time.h>
#include <lwip/sockets.h>
#include <lwip/inet.h>
#include "Admission.h"
#include "CryptoUtils.h"
#include "FirmwareVersion.h"
#include "SetupState.h"
#include "Wire.h"
#include "WifiSetupPage.h"
#include "BridgeSettings.h"
#include "BridgeSettingsPage.h"
#include "HttpHtmlResponse.h"
#include "ClipboardMailbox.h"
#include "ClipboardWire.h"
#include "RtcIdentity.h"
#include "RtcPeerOwnership.h"
#include "StrictJson.h"
namespace iah {
class CoreLock {SemaphoreHandle_t mutex_;public:explicit CoreLock(SemaphoreHandle_t m):mutex_(m){xSemaphoreTake(m,portMAX_DELAY);}~CoreLock(){xSemaphoreGive(mutex_);}};
class SecureService {
 Core& core_;Sink& sink_;Preferences& prefs_;SemaphoreHandle_t mutex_;String board_,boot_,host_,owner_,apPassword_,origin_;
 std::atomic<uint32_t>& wifiEpoch_;void (&loadSavedNetwork_)(String&,String&);WifiJoinState wifiJoin_;String candidateNetwork_,candidateSsid_,candidatePassword_,candidateOrigin_,previousNetwork_,previousSsid_,previousPassword_;bool startCandidate_=false,previousCredentialsOverride_=false;
 WebServer ap_{80};httpd_handle_t http_=nullptr;std::atomic_bool maintenance_{false},httpReady_{false};String identityFingerprint_;Admission auth_;bool apActive_=false,configComplete_=false,storageReady_=false;SetupDeadline setupDeadline_;SavedNetworkRetry savedRetry_;bool recoverySetup_=false;uint64_t httpRetryAt_=0;
 BridgeSettings bridgeSettings_;std::atomic<uint64_t> restartAt_{0};
 uint64_t challengeNext_=0;size_t challengeEvent_=0;uint16_t challengeHandle_=InvalidHandle;
 struct Request {
  httpd_req_t* http=nullptr; httpd_method_t method=HTTP_GET; String uri,body,authorization,requestOrigin,trustedPeerIp;
  size_t content_len=0; size_t rtcPeer=2; bool rtc=false; int responseStatus=500; String responseBody;
  explicit Request(httpd_req_t* source):http(source),method(static_cast<httpd_method_t>(source->method)),uri(source->uri),content_len(source->content_len){}
  Request()=default;
 };
 ClipboardMailbox clipboard_;String clipboardRequest_,clipboardClient_,clipboardTarget_,clipboardToken_,clipboardSource_;RtcPeerOwnership<2,MaxClients,MaxTargets> rtcOwners_;int rtcChallengePeer_=-1,clipboardPeer_=-1;
 void rememberRtcClient(size_t peer,const std::string& id){rtcOwners_.rememberClient(peer,id);}

 static uint64_t now(){return esp_timer_get_time()/1000;}
 static String httpHeader(httpd_req_t* r,const char* key){size_t size=httpd_req_get_hdr_value_len(r,key);if(!size||size>512)return "";std::vector<char> data(size+1);if(httpd_req_get_hdr_value_str(r,key,data.data(),data.size())!=ESP_OK)return "";return data.data();}
 static String header(Request* r,const char* key){if(r->http)return httpHeader(r->http,key);if(strcmp(key,"Origin")==0)return r->requestOrigin;if(strcmp(key,"Authorization")==0)return r->authorization;return "";}
 static String status(int code){switch(code){case 200:return "200 OK";case 202:return "202 Accepted";case 204:return "204 No Content";case 400:return "400 Bad Request";case 401:return "401 Unauthorized";case 403:return "403 Forbidden";case 404:return "404 Not Found";case 409:return "409 Conflict";case 410:return "410 Gone";case 413:return "413 Payload Too Large";case 429:return "429 Too Many Requests";default:return "503 Service Unavailable";}}
 esp_err_t send(Request* r,int code,JsonDocument& doc){
  if(r->rtc){String body;serializeJson(doc,body);r->responseStatus=code;r->responseBody=std::move(body);return ESP_OK;}
  auto h=r->http;String state=status(code);httpd_resp_set_status(h,state.c_str());httpd_resp_set_type(h,"application/json");httpd_resp_set_hdr(h,"Cache-Control","no-store");httpd_resp_set_hdr(h,"Connection","close");httpd_resp_set_hdr(h,"X-Content-Type-Options","nosniff");if(header(r,"Origin")==origin_){httpd_resp_set_hdr(h,"Access-Control-Allow-Origin",origin_.c_str());httpd_resp_set_hdr(h,"Vary","Origin");}
  auto sink=[h](const uint8_t* bytes,size_t length){return httpd_resp_send_chunk(h,reinterpret_cast<const char*>(bytes),length)==ESP_OK;};
  BufferedJsonWriter<decltype(sink)> writer(sink);serializeJson(doc,writer);if(!writer.finish())return ESP_FAIL;
  auto result=httpd_resp_send_chunk(h,nullptr,0);return result==ESP_OK?ESP_FAIL:result;
 }
 esp_err_t error(Request* r,int code,const char* value){JsonDocument d;d["error"]=value;d["boardId"]=board_;d["bootId"]=boot_;return send(r,code,d);}
 struct Reader {httpd_req_t* req;size_t left;uint8_t bytes[256];size_t at=0,size=0;int read(){if(at==size){if(!left)return -1;int count=httpd_req_recv(req,(char*)bytes,std::min(left,sizeof(bytes)));if(count<=0){left=0;return -1;}left-=count;at=0;size=count;}return bytes[at++];}size_t readBytes(char* output,size_t count){size_t n=0;for(;n<count;n++){int c=read();if(c<0)break;output[n]=(char)c;}return n;}};
 bool read(Request* r,JsonDocument& doc,size_t limit=2048){if(r->rtc){if(!r->body.length()||r->body.length()>limit)return false;return strictJsonObject(doc,r->body.c_str(),r->body.length());}if(r->content_len<=0||r->content_len>limit)return false;Reader reader{r->http,r->content_len};auto e=deserializeJson(doc,reader,DeserializationOption::NestingLimit(8));if(e||!doc.is<JsonObject>())return false;for(int c=reader.read();c>=0;c=reader.read())if(c!=32&&c!=9&&c!=10&&c!=13)return false;return reader.left==0;}
 Grant* authenticate(Request* r){String auth=header(r,"Authorization");if(auth.length()!=71||!auth.startsWith("Bearer "))return nullptr;String token=auth.substring(7);return auth_.authenticate(sha256Hex(token).c_str(),origin_.c_str());}
 bool saveGrantAt(size_t slot,const Grant& grant){
  if(slot>=MaxClients||!grant.active)return false;
  JsonDocument doc;doc["id"]=grant.clientId;doc["hash"]=grant.tokenHash;doc["origin"]=grant.origin;doc["target"]=grant.targetId;String text;const size_t bytes=measureJson(doc);if(doc.overflowed()||!bytes||bytes>1024||!text.reserve(bytes)||serializeJson(doc,text)!=bytes||text.length()!=bytes)return false;
  String key="grant"+String(slot),previous=prefs_.getString(key.c_str(),"");
  if(prefs_.putString(key.c_str(),text.c_str())==text.length()&&prefs_.getString(key.c_str(),"")==text)return true;
  // NVS commits one key atomically. Keep the previous durable record on refusal
  // or a failed read-back; callers leave the live Admission unchanged.
  if(prefs_.getString(key.c_str(),"")!=previous){if(previous.length())prefs_.putString(key.c_str(),previous.c_str());else prefs_.remove(key.c_str());}
  return false;
 }
 bool saveGrant(const Grant& grant){size_t i=MaxClients;for(size_t n=0;n<MaxClients;n++)if(auth_.grants()[n].active&&auth_.grants()[n].clientId==grant.clientId){i=n;break;}if(i==MaxClients)for(size_t n=0;n<MaxClients;n++)if(!auth_.grants()[n].active){i=n;break;}return i<MaxClients&&saveGrantAt(i,grant);}
 bool protectedEnrollmentClient(const Grant& grant){
  if(rtcOwners_.hasClient(grant.clientId))return true;
  if(!clipboardClient_.isEmpty()&&grant.clientId==clipboardClient_.c_str())return true;
  for(const auto& target:core_.targets())if(target.lease.clientId==grant.clientId&&(target.lease.expiresAt>now()||target.running))return true;
  return false;
 }
 void addSettings(JsonDocument& d){addIdentity(d);d["hostname"]=bridgeSettings_.hostname;d["newURL"]="http://"+String(bridgeSettings_.hostname.c_str())+".local";d["harnessURL"]=origin_+"/";addRtc(d);}
 void addRtc(JsonDocument& d){auto rtc=d["rtc"].to<JsonObject>();if(WiFi.status()==WL_CONNECTED)rtc["ip"]=WiFi.localIP().toString();rtc["port"]=18948;auto ports=rtc["ports"].to<JsonArray>();ports.add(18948);ports.add(18949);rtc["fingerprint"]=RtcIdentity::fingerprint;}
 void addIdentity(JsonDocument& d){d["boardId"]=board_;d["bootId"]=boot_;firmware::addIdentity(d);d["targetBinding"]="explicit-rebind-v1";}
 void addTargets(JsonDocument& d){auto list=d["targets"].to<JsonArray>();for(const auto& t:core_.targets())if(!t.id.empty()){auto row=list.add<JsonObject>();row["targetId"]=t.id;row["connected"]=t.connHandle!=InvalidHandle;row["encrypted"]=t.encrypted;row["hidSubscribed"]=t.subscribed;row["inputReleased"]=!t.releasePending;bool challenge=auth_.typing(now())&&auth_.target()==t.id;row["inputState"]=(!t.releasePending&&!t.running&&!challenge)?"released":"unknown";row["running"]=t.running||challenge;}}
 void receipt(JsonDocument& d,const Result& result){addIdentity(d);d["targetId"]=result.targetId;d["clientId"]=result.clientId;d["segmentId"]=result.segmentId;d["planId"]=result.planId;d["payloadHash"]=result.payloadHash;d["status"]=statusName(result.status);d["releaseSubmitted"]=result.releaseSubmitted;d["acceptedAtDeviceMs"]=result.acceptedAt;d["startedAtDeviceMs"]=result.startedAt;d["endedAtDeviceMs"]=result.endedAt;d["submitted"]=result.submitted;d["maxLatenessMs"]=result.maxLatenessMs;}
 void clearClipboard(){clipboard_.clear();clipboardRequest_="";clipboardClient_="";clipboardTarget_="";clipboardToken_="";clipboardSource_="";clipboardPeer_=-1;}
 static String peerIp(Request* r){if(r->rtc)return r->trustedPeerIp;if(!r->http)return "";sockaddr_in address{};socklen_t length=sizeof(address);if(getpeername(httpd_req_to_sockfd(r->http),reinterpret_cast<sockaddr*>(&address),&length)!=0||address.sin_family!=AF_INET)return "";return inet_ntoa(address.sin_addr);}
 static String jobToken(const String& uri){int at=uri.indexOf('?');if(at<0||uri.substring(at,at+7)!="?token=")return "";String token=uri.substring(at+7);if(token.length()!=64)return "";for(char c:token)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return "";return token;}
 void clipboardView(JsonDocument& d,const ClipboardMailbox::View& view){addIdentity(d);d["requestId"]=view.requestId;d["clientId"]=view.clientId;d["sessionId"]=view.sessionId;d["targetId"]=view.targetId;d["status"]=ClipboardMailbox::stateName(view.state);d["expiresAtDeviceMs"]=view.expiresAtDeviceMs;d["copiedAtDeviceMs"]=view.copiedAtDeviceMs;d["totalBytes"]=view.totalBytes;d["nextOffset"]=view.nextOffset;d["chunkBytes"]=ClipboardMailbox::ChunkBytes;d["chunkPending"]=view.chunkPending;}
 static int clipboardStatus(ClipboardMailbox::Result result){using R=ClipboardMailbox::Result;switch(result){case R::Ok:return 200;case R::Invalid:return 400;case R::Denied:return 403;case R::NotFound:return 404;case R::Expired:return 410;case R::Unavailable:return 503;default:return 409;}}
 esp_err_t emptyClipboard(Request* r){JsonDocument d;d["empty"]=true;d["text"]="";return send(r,200,d);}
 esp_err_t streamClipboard(Request* r,const String& requestId,const String& token,bool emptyIfUnavailable=false){
  using R=ClipboardMailbox::Result;ClipboardMailbox::View view;R started;
  {CoreLock lock(mutex_);started=clipboard_.beginStream(requestId.c_str(),token.c_str(),now(),view);}
  if(started!=R::Ok)return emptyIfUnavailable?emptyClipboard(r):error(r,clipboardStatus(started),"clipboard_job_unavailable");
  auto abort=[&](){CoreLock lock(mutex_);clipboard_.abortStream(requestId.c_str(),token.c_str(),now());return ESP_FAIL;};
  auto h=r->http;httpd_resp_set_status(h,"200 OK");httpd_resp_set_type(h,"application/json");httpd_resp_set_hdr(h,"Cache-Control","no-store");httpd_resp_set_hdr(h,"Connection","close");httpd_resp_set_hdr(h,"X-Content-Type-Options","nosniff");
  auto sink=[h](const uint8_t* data,size_t length){return httpd_resp_send_chunk(h,reinterpret_cast<const char*>(data),length)==ESP_OK;};
  BufferedJsonWriter<decltype(sink)> writer(sink);
  // The prefix contains metadata only. Text never enters an aggregate JSON doc.
  JsonDocument metadata;clipboardView(metadata,view);metadata["status"]="delivered";metadata["nextOffset"]=view.totalBytes;metadata["chunkPending"]=false;metadata.remove("expiresAtDeviceMs");metadata.remove("copiedAtDeviceMs");metadata["ackURL"]="http://"+host_+".local/v1/clipboard/jobs/"+requestId+"/ack?token="+token;String prefix;serializeJson(metadata,prefix);metadata.clear();
  if(prefix.length()<2||prefix[prefix.length()-1]!='}')return abort();prefix.remove(prefix.length()-1);prefix+=",\"text\":\"";
  if(writer.write(reinterpret_cast<const uint8_t*>(prefix.c_str()),prefix.length())!=prefix.length()||!writer.flush())return abort();prefix=static_cast<const char*>(nullptr);
  std::array<char,ClipboardMailbox::ChunkBytes> chunk{};
  for(;;){uint64_t offset=0;size_t length=0;R result;
   {CoreLock lock(mutex_);result=clipboard_.peek(requestId.c_str(),token.c_str(),now(),offset,chunk.data(),chunk.size(),length);}
   if(result==R::Complete)break;
   if(result==R::Waiting){
    char pending;int available=recv(httpd_req_to_sockfd(h),&pending,1,MSG_PEEK|MSG_DONTWAIT);
    if(available==0||(available<0&&errno!=EAGAIN&&errno!=EWOULDBLOCK))return abort();
    // No Core mutex held here: RTC can receive the next producer chunk.
    vTaskDelay(pdMS_TO_TICKS(10));continue;
   }
   if(result!=R::Ok)return abort();
   bool sent=writeClipboardJsonText(writer,reinterpret_cast<const uint8_t*>(chunk.data()),length)&&writer.flush();
   volatile char* wipe=chunk.data();for(size_t i=0;i<length;i++)wipe[i]=0;
   if(!sent)return abort();
   {CoreLock lock(mutex_);result=clipboard_.consume(requestId.c_str(),token.c_str(),offset,length,now());}
   if(result!=R::Ok)return abort();
  }
  const uint8_t ending[]={'"','}'};if(writer.write(ending,sizeof(ending))!=sizeof(ending)||!writer.finish()||httpd_resp_send_chunk(h,nullptr,0)!=ESP_OK)return abort();
  {CoreLock lock(mutex_);if(clipboard_.finishStream(requestId.c_str(),token.c_str(),now())!=R::Ok)return ESP_FAIL;}
  // This completes one entire JSON response, not one HTTP request per chunk.
  return ESP_FAIL;
 }
 static std::vector<String> path(String uri){int query=uri.indexOf('?');if(query>=0)uri=uri.substring(0,query);std::vector<String> parts;int at=1;while(at<(int)uri.length()){int end=uri.indexOf('/',at);if(end<0)end=uri.length();parts.push_back(uri.substring(at,end));at=end+1;}return parts;}
 static esp_err_t route(httpd_req_t* request){Request wrapped(request);return static_cast<SecureService*>(request->user_ctx)->handle(&wrapped);}
 struct Decision {int status;String error;};
 template<class Action> esp_err_t lockedReply(Request* request,Action action){
  JsonDocument doc;Decision decision;
  {CoreLock lock(mutex_);expireChallenge();decision=action(doc);}
  // No Core mutex is held during serialization or socket writes.
  return decision.error.length()?error(request,decision.status,decision.error.c_str()):send(request,decision.status,doc);
 }
 esp_err_t handle(Request* r){
  String browserOrigin=header(r,"Origin");
  // The local settings page sends same-origin HTTP requests; client tokens and
  // target leases use the same admission checks as the RTC path.
  String localName=host_+".local",localIp=WiFi.localIP().toString(),hostHeader=header(r,"Host");hostHeader.toLowerCase();
  bool localHost=hostHeader==localName||hostHeader==localName+":80"||hostHeader==localIp||hostHeader==localIp+":80";
  bool localOrigin=browserOrigin.isEmpty()||browserOrigin=="http://"+localName||browserOrigin=="http://"+localName+":80"||browserOrigin=="http://"+localIp||browserOrigin=="http://"+localIp+":80";
  if(header(r,"X-Harness-Window")=="1"&&localHost&&localOrigin)browserOrigin=origin_;
  String pagePath=r->uri;int pageQuery=pagePath.indexOf('?');if(pageQuery>=0)pagePath.remove(pageQuery);
  if(r->http&&r->method==HTTP_GET&&(pagePath=="/settings"||pagePath=="/")){
   JsonDocument information;addIdentity(information);information["hostname"]=host_+".local";information["harnessURL"]=origin_+"/";addRtc(information);
   const size_t informationBytes=measureJson(information);String encoded;
   if(information.overflowed()||informationBytes>1024||!encoded.reserve(informationBytes)||serializeJson(information,encoded)!=informationBytes||encoded.length()!=informationBytes)return error(r,503,"memory_unavailable");
   String injection;if(!buildBridgeInformationInjection(encoded,injection,[](String& value,size_t count){return value.reserve(count);}))return error(r,503,"memory_unavailable");
   const auto parts=bridgeSettingsPageParts();if(!parts.prefix||!parts.suffix)return error(r,503,"memory_unavailable");
   const HttpHtmlSegment segments[]={{parts.prefix,parts.prefixLength},{injection.c_str(),injection.length()},{parts.suffix,parts.suffixLength}};
   const auto sent=sendHttpHtmlSegments(segments,3,[&](const char* bytes,size_t count){errno=0;const int result=httpd_send(r->http,bytes,count);return HttpHtmlAttempt{result,errno};},[]{return static_cast<uint64_t>(esp_timer_get_time())/1000;},[]{vTaskDelay(1);},HTTPD_SOCK_ERR_TIMEOUT);
   if(!sent.complete)Serial.printf("{\"event\":\"http_html_send_failed\",\"stage\":\"%s\",\"headerBytes\":%u,\"bodyBytes\":%u,\"code\":%d,\"errno\":%d,\"durationMs\":%llu}\n",sent.stage,static_cast<unsigned>(sent.headerBytes),static_cast<unsigned>(sent.bodyBytes),sent.code,sent.errorNumber,static_cast<unsigned long long>(sent.durationMs));
   return ESP_FAIL;
  }
  if(browserOrigin.length()&&browserOrigin!=origin_)return error(r,403,"origin_not_allowed");
  if(r->http&&r->method==HTTP_OPTIONS){
   if(browserOrigin!=origin_)return error(r,403,"origin_required");
   httpd_resp_set_status(r->http,"204 No Content");httpd_resp_set_hdr(r->http,"Access-Control-Allow-Origin",origin_.c_str());
   httpd_resp_set_hdr(r->http,"Access-Control-Allow-Methods","GET,POST,OPTIONS");httpd_resp_set_hdr(r->http,"Access-Control-Allow-Headers","authorization,content-type,x-request-id");
   httpd_resp_set_hdr(r->http,"Access-Control-Allow-Private-Network","true");httpd_resp_set_hdr(r->http,"Vary","Origin");httpd_resp_set_hdr(r->http,"Connection","close");
   auto sent=httpd_resp_send(r->http,nullptr,0);return sent==ESP_OK?ESP_FAIL:sent;
  }
  auto parts=path(r->uri);if(parts.size()<2||parts[0]!="v1")return error(r,404,"not_found");
  // Shortcuts makes native HTTP requests: no browser CORS permission is used.
  // Explicit jobs require their short-lived token. The generic hotkey shortcut
  // can take the pending job only from the same LAN IP as the staging RTC peer.
  if(r->http&&parts[1]=="clipboard"&&(parts.size()==3&&parts[2]=="pending"||parts.size()>=4&&parts[2]=="jobs")){
   if(!localHost||!localOrigin)return error(r,403,"clipboard_local_request_required");
   const bool latest=parts.size()==3;String requestId,token;bool sourceMatches=true,noPending=false;{CoreLock lock(mutex_);noPending=latest&&r->method==HTTP_GET&&!clipboard_.hasPending(now());requestId=latest?clipboardRequest_:parts[3];token=latest?clipboardToken_:jobToken(r->uri);sourceMatches=!latest||(!clipboardSource_.isEmpty()&&peerIp(r)==clipboardSource_);}
   if(noPending)return emptyClipboard(r);
   if(!sourceMatches)return error(r,403,"clipboard_phone_mismatch");
   if(r->method==HTTP_GET&&(latest||parts.size()==4))return streamClipboard(r,requestId,token,latest);
   if(!latest&&parts.size()==5&&parts[4]=="ack"&&r->method==HTTP_POST){JsonDocument body;if(!read(r,body,512)||!fields(body.as<JsonObjectConst>(),{"requestId","sessionId","targetId","copied"})||body["copied"]!=true||body["requestId"].as<String>()!=requestId)return error(r,400,"invalid_clipboard_ack");
    return lockedReply(r,[&](JsonDocument& d)->Decision{ClipboardMailbox::View view;auto result=clipboard_.acknowledge(requestId.c_str(),token.c_str(),std::string(body["sessionId"]|""),std::string(body["targetId"]|""),now(),view);if(result!=ClipboardMailbox::Result::Ok)return {clipboardStatus(result),"clipboard_ack_rejected"};clipboardView(d,view);return {200,""};});
   }
   return error(r,404,"not_found");
  }
  if(r->method==HTTP_GET&&parts[1]=="identity"){
   JsonDocument d;addIdentity(d);d["protocolVersion"]=1;d["hostname"]=host_+".local";d["publicKeyFingerprint"]=identityFingerprint_;
   d["harnessURL"]=origin_+"/";addRtc(d);d["transport"]="webrtc-direct";d["pairingAvailable"]=true;d["pairingCodeRequired"]=false;return send(r,200,d);
  }
  if(r->method==HTTP_GET&&parts[1]=="clock"){JsonDocument d;addIdentity(d);d["deviceTimeMs"]=now();return send(r,200,d);}
  if(r->method==HTTP_GET&&parts[1]=="capabilities"){
   JsonDocument d;addIdentity(d);d["protocolVersion"]=1;d["executionEnabled"]=!maintenance_;d["pairingAvailable"]=true;
   d["maxTargets"]=MaxTargets;d["maxClients"]=MaxClients;d["maxEvents"]=WireMaxEvents;d["reportIntervalMs"]=40;d["pointerSettleMs"]=20;d["maxRequestBytes"]=WireMaxRequestBytes;d["maxSegmentMs"]=MaxSegmentMs;
   d["maxHoldMs"]=MaxHoldMs;d["maxLeaseMs"]=MaxLeaseMs;d["captureOnDevice"]=false;d["maxConcurrentRequests"]=2;d["maxRtcPeers"]=2;addRtc(d);d["clipboardChunkBytes"]=ClipboardMailbox::ChunkBytes;d["clipboardStreaming"]=true;
   d["freeHeapBytes"]=ESP.getFreeHeap();d["minFreeHeapBytes"]=ESP.getMinFreeHeap();d["transport"]="webrtc-direct";
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
    if(maintenance_||auth_.active(now()))return {409,"board_busy"};
    auto enrolled=auth_.enroll(client.c_str(),hash.c_str(),origin_.c_str(),now(),[this](const Grant& grant){return protectedEnrollmentClient(grant);},[this](size_t slot,const Grant& grant){return saveGrantAt(slot,grant);});
    if(enrolled==Admission::Enrollment::Capacity)return {409,"client_capacity"};
    if(enrolled==Admission::Enrollment::PersistenceFailed)return {503,"credential_persistence_failed"};
    if(enrolled!=Admission::Enrollment::Accepted)return {409,"board_busy"};
    if(r->rtc)rememberRtcClient(r->rtcPeer,client.c_str());
    addIdentity(d);d["clientId"]=client;d["token"]=token;d["hostname"]=host_+".local";d["publicKeyFingerprint"]=identityFingerprint_;return {200,""};
   });
  }
  Grant grant;bool authenticated=false;
  {CoreLock lock(mutex_);auto current=authenticate(r);if(current){grant=*current;authenticated=true;if(r->rtc)rememberRtcClient(r->rtcPeer,grant.clientId);}}
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
  if(parts.size()==4&&parts[3]=="bind"&&r->method==HTTP_POST){
   JsonDocument body;if(!read(r,body)||body.size()!=0)return error(r,400,"invalid_binding_request");
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    auto t=core_.target(target.c_str());
    if(maintenance_||!t||t->connHandle==InvalidHandle||!t->encrypted||!t->subscribed||t->releasePending)return {409,"target_not_ready"};
    if(grant.targetId!=target.c_str()&&clipboardClient_==grant.clientId.c_str()){
     ClipboardMailbox::View transfer;
     if(clipboard_.status(clipboardRequest_.c_str(),grant.clientId,clipboardTarget_.c_str(),now(),transfer)==ClipboardMailbox::Result::Ok&&
        (transfer.state==ClipboardMailbox::State::Pending||transfer.state==ClipboardMailbox::State::Streaming||transfer.state==ClipboardMailbox::State::Delivered))return {409,"target_busy"};
    }
    auto accepted=auth_.associate(core_,grant.clientId,target.c_str(),now(),[&](const Grant& updated){return saveGrant(updated);});
    if(accepted==Code::Busy)return {409,"target_busy"};
    if(accepted==Code::NotReady)return {409,"target_not_ready"};
    if(accepted==Code::PersistenceFailed)return {503,"binding_persistence_failed"};
    if(accepted!=Code::Accepted&&accepted!=Code::Duplicate)return {409,"binding_conflict"};
    addIdentity(d);d["clientId"]=grant.clientId;d["targetId"]=target;d["bindingVerified"]=true;d["inputTestVerified"]=false;return {200,""};
   });
  }
  if(parts.size()==5&&parts[3]=="challenge"&&r->method==HTTP_POST){
   JsonDocument body;if(!read(r,body))return error(r,400,"invalid_challenge_request");
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    if(parts[4]=="cancel"){
     if(body.size()!=0)return {400,"invalid_challenge_request"};
     if(auth_.active(now())&&!auth_.ownsChallenge(grant.clientId,target.c_str(),now()))return {403,"wrong_target_or_client"};
     if(auth_.ownsChallenge(grant.clientId,target.c_str(),now()))releaseChallenge();
     auth_.cancelChallenge(grant.clientId,target.c_str(),now());rtcChallengePeer_=-1;challengeHandle_=InvalidHandle;addIdentity(d);d["clientId"]=grant.clientId;d["targetId"]=target;d["status"]="cancelled";return {200,""};
    }
    auto t=core_.target(target.c_str());
    if(maintenance_||!t||t->connHandle==InvalidHandle||!t->encrypted||!t->subscribed||t->releasePending)return {409,"target_not_ready"};
    if(parts[4]=="start"){
     if(body.size()!=0||core_.busy()||t->lease.expiresAt>now())return {409,"target_busy"};
     String nonce;for(int i=0;i<8;i++)nonce+=char('0'+esp_random()%10);String challenge="challenge-"+randomHex(16);
     if(!auth_.begin(grant.clientId,target.c_str(),challenge.c_str(),nonce.c_str(),now()))return {429,"challenge_busy_or_rate_limited"};
     challengeEvent_=0;challengeNext_=now()+200;challengeHandle_=t->connHandle;rtcChallengePeer_=r->rtc?int(r->rtcPeer):-1;
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
    auth_=std::move(candidate);rtcChallengePeer_=-1;challengeHandle_=InvalidHandle;addIdentity(d);d["clientId"]=grant.clientId;d["targetId"]=target;d["bindingVerified"]=true;return {200,""};
   });
  }
  if(grant.targetId!=target.c_str())return error(r,403,"wrong_target");
  if(parts[3]=="clipboard"){
   if(parts.size()==4&&r->method==HTTP_POST){
    JsonDocument body;if(!read(r,body,1024)||!fields(body.as<JsonObjectConst>(),{"requestId","sessionId","totalBytes","ttlMs"})||!body["requestId"].is<const char*>()||!body["sessionId"].is<const char*>()||!body["totalBytes"].is<uint64_t>()||!body["totalBytes"].as<uint64_t>()||body["totalBytes"].as<uint64_t>()>ClipboardMailbox::MaxTotalBytes||!wireInteger(body["ttlMs"],1,ClipboardMailbox::MaxTtlMs))return error(r,400,"invalid_clipboard_request");
    String token=randomHex(32);
    return lockedReply(r,[&](JsonDocument& d)->Decision{auto t=core_.target(target.c_str());if(maintenance_||!t||t->connHandle==InvalidHandle||!t->encrypted||!t->subscribed||t->releasePending)return {409,"target_not_ready"};
     auto result=clipboard_.put(std::string(body["requestId"]|""),grant.clientId,std::string(body["sessionId"]|""),target.c_str(),body["totalBytes"].as<uint64_t>(),token.c_str(),now(),body["ttlMs"].as<uint32_t>());if(result!=ClipboardMailbox::Result::Ok)return {clipboardStatus(result),"clipboard_stage_rejected"};
     clipboardRequest_=body["requestId"].as<String>();clipboardClient_=grant.clientId.c_str();clipboardTarget_=target;clipboardToken_=token;clipboardSource_=peerIp(r);clipboardPeer_=r->rtc?int(r->rtcPeer):-1;ClipboardMailbox::View view;clipboard_.status(clipboardRequest_.c_str(),grant.clientId,target.c_str(),now(),view);clipboardView(d,view);d["jobToken"]=token;return {200,""};
    });
   }
   if(parts.size()==6&&parts[5]=="chunks"&&r->method==HTTP_POST){
    JsonDocument body;if(!read(r,body,2048)||!fields(body.as<JsonObjectConst>(),{"offset","textBase64"})||!body["offset"].is<uint64_t>()||body["offset"].as<uint64_t>()>ClipboardMailbox::MaxTotalBytes||!body["textBase64"].is<const char*>())return error(r,400,"invalid_clipboard_chunk");
    auto encoded=body["textBase64"].as<JsonString>();std::string text;if(!decodeClipboardTextBase64(encoded.c_str(),encoded.size(),text))return error(r,400,"invalid_clipboard_text");body.remove("textBase64");
    return lockedReply(r,[&](JsonDocument& d)->Decision{auto t=core_.target(target.c_str());if(maintenance_||!t||t->connHandle==InvalidHandle||!t->encrypted||!t->subscribed||t->releasePending)return {409,"target_not_ready"};ClipboardMailbox::View view;auto result=clipboard_.push(parts[4].c_str(),grant.clientId,target.c_str(),body["offset"].as<uint64_t>(),text,now(),view);if(result!=ClipboardMailbox::Result::Ok)return {clipboardStatus(result),result==ClipboardMailbox::Result::Conflict?"clipboard_chunk_conflict":"clipboard_chunk_rejected"};clipboardView(d,view);return {200,""};});
   }
   if(parts.size()==5&&r->method==HTTP_GET)return lockedReply(r,[&](JsonDocument& d)->Decision{ClipboardMailbox::View view;auto result=clipboard_.status(parts[4].c_str(),grant.clientId,target.c_str(),now(),view);if(result!=ClipboardMailbox::Result::Ok)return {clipboardStatus(result),"clipboard_job_unavailable"};clipboardView(d,view);return {200,""};});
   if(parts.size()==6&&parts[5]=="cancel"&&r->method==HTTP_POST)return lockedReply(r,[&](JsonDocument& d)->Decision{auto result=clipboard_.cancel(parts[4].c_str(),grant.clientId,target.c_str(),now());if(result!=ClipboardMailbox::Result::Ok)return {clipboardStatus(result),"clipboard_cancel_rejected"};ClipboardMailbox::View view;clipboard_.status(parts[4].c_str(),grant.clientId,target.c_str(),now(),view);clipboardView(d,view);return {200,""};});
   return error(r,404,"not_found");
  }
  if(parts.size()==5&&parts[3]=="leases"&&r->method==HTTP_POST){
   JsonDocument body;if(!read(r,body)||!fields(body.as<JsonObjectConst>(),{"leaseId","ttlMs"})||!body["leaseId"].is<const char*>()||!validId(body["leaseId"].as<const char*>())||!wireInteger(body["ttlMs"],1,MaxLeaseMs))return error(r,400,"invalid_lease");
   return lockedReply(r,[&](JsonDocument& d)->Decision{
    auto t=core_.target(target.c_str());if(maintenance_||!t||t->releasePending||auth_.active(now())||(parts[4]=="claim"&&t->running))return {409,"target_busy"};
    std::string lease=body["leaseId"].as<const char*>();
    if(parts[4]=="renew"&&(t->lease.id!=lease||t->lease.clientId!=grant.clientId||t->lease.expiresAt<=now()))return {409,"lease_expired"};
    if(parts[4]!="renew"&&parts[4]!="claim")return {404,"not_found"};
    if(core_.lease(target.c_str(),grant.clientId,lease,body["ttlMs"].as<int>(),now())!=Code::Accepted)return {409,"lease_conflict"};rtcOwners_.claim(r->rtc?r->rtcPeer:2,target.c_str(),lease);
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
 void releaseChallenge(){auto target=core_.target(auth_.target());if(target&&target->connHandle==challengeHandle_&&challengeHandle_!=InvalidHandle&&!target->running&&target->lease.expiresAt<=now()){target->releasePending=!sink_.release(challengeHandle_,target->input);if(!target->releasePending)target->releaseUncertain=false;}}
 void invalidateChallenge(){auth_.invalidate();rtcChallengePeer_=-1;challengeHandle_=InvalidHandle;challengeNext_=0;challengeEvent_=0;}
 void expireChallenge(){if(auth_.expiresAt()&&now()>=auth_.expiresAt()){releaseChallenge();invalidateChallenge();}}
 bool hasNetworkAddress()const{auto ip=WiFi.localIP();return WiFi.status()==WL_CONNECTED&&ip[0]>0&&ip[0]<224&&ip[0]!=127;}
 void restorePreviousNetwork(){
  String ssid=previousSsid_,password=previousPassword_;
  candidateNetwork_="";candidateSsid_="";candidatePassword_="";candidateOrigin_="";if(!previousCredentialsOverride_){previousNetwork_="";previousSsid_="";previousPassword_="";}
  wifiJoin_.restoredPrevious();
  WiFi.disconnect(false,false);if(ssid.length())WiFi.begin(ssid.c_str(),password.c_str());
 }
 void updateNetwork(){
  if(startCandidate_){startCandidate_=false;wifiJoin_.begin(now(),wifiEpoch_.load());WiFi.persistent(false);WiFi.disconnect(false,false);WiFi.begin(candidateSsid_.c_str(),candidatePassword_.c_str());}
  auto decision=wifiJoin_.poll(WiFi.status()==WL_CONNECTED,hasNetworkAddress(),WiFi.SSID()==candidateSsid_,wifiEpoch_.load(),now());
  if(decision==WifiJoinState::Decision::Commit){
   bool saved=prefs_.putString("network",candidateNetwork_)==candidateNetwork_.length()&&prefs_.getString("network","")==candidateNetwork_;
   if(saved){origin_=candidateOrigin_;configComplete_=true;candidateNetwork_="";candidateSsid_="";candidatePassword_="";candidateOrigin_="";previousNetwork_="";previousSsid_="";previousPassword_="";previousCredentialsOverride_=false;wifiJoin_.committed(true);}
   else {if(previousNetwork_.length())prefs_.putString("network",previousNetwork_);else prefs_.remove("network");previousCredentialsOverride_=prefs_.getString("network","")!=previousNetwork_;wifiJoin_.committed(false);restorePreviousNetwork();}
  }else if(decision==WifiJoinState::Decision::Fail)restorePreviousNetwork();
  bool stablePhase=wifiJoin_.phase()==WifiJoinState::Phase::Idle||wifiJoin_.phase()==WifiJoinState::Phase::Connected;
  if(savedRetry_.due(configComplete_&&stablePhase,hasNetworkAddress(),now())){
   String ssid,password;if(previousCredentialsOverride_){ssid=previousSsid_;password=previousPassword_;}else loadSavedNetwork_(ssid,password);if(ssid.length()){WiFi.disconnect(false,false);WiFi.begin(ssid.c_str(),password.c_str());}
  }
  if(wifiJoin_.recoveryDue(hasNetworkAddress(),apActive_,now())){openSetup();recoverySetup_=true;}
  if(recoverySetup_&&hasNetworkAddress()&&finishSetup())recoverySetup_=false;
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
  JsonDocument network;network["ssid"]=ssid;network["password"]=wifiPassword;network["origin"]=origin;String stored;serializeJson(network,stored);if(!previousCredentialsOverride_){previousNetwork_=prefs_.getString("network","");loadSavedNetwork_(previousSsid_,previousPassword_);}candidateNetwork_=stored;candidateSsid_=ssid;candidatePassword_=wifiPassword;candidateOrigin_=origin;startCandidate_=true;wifiJoin_.begin(now(),wifiEpoch_.load());return true;
 }
 public:
 String dispatchRtc(String encoded,const String& peerIp="",size_t peer=0){
  JsonDocument envelope;Request request;request.rtc=true;request.rtcPeer=peer;request.requestOrigin=origin_;request.trustedPeerIp=peerIp;
  auto failed=[&](const char* message){JsonDocument value;value["status"]=400;String body;JsonDocument e;e["error"]=message;serializeJson(e,body);value["body"]=body;String result;serializeJson(value,result);return result;};
  if(peer>=2||encoded.length()>12288||!strictJsonObject(envelope,encoded.c_str(),encoded.length(),5)||!fields(envelope.as<JsonObjectConst>(),{"method","path","headers","body"})||!plainJsonString(envelope["method"])||!plainJsonString(envelope["path"])||!plainJsonString(envelope["body"])||!envelope["headers"].is<JsonObject>())return failed("invalid_rpc");
  String method=envelope["method"]|"";request.uri=envelope["path"]|"";
  if((method!="GET"&&method!="POST")||!request.uri.startsWith("/v1/")||request.uri.indexOf('?')>=0||request.uri.indexOf('#')>=0||request.uri.indexOf("..")>=0)return failed("invalid_rpc_route");
  request.method=method=="GET"?HTTP_GET:HTTP_POST;request.body=envelope["body"]|"";request.content_len=request.body.length();
  auto headers=envelope["headers"].as<JsonObjectConst>();for(JsonPairConst item:headers){if(!plainJsonString(item.value()))return failed("invalid_rpc_header");String name=item.key().c_str();name.toLowerCase();if(name!="authorization"&&name!="content-type"&&name!="accept"&&name!="x-request-id")return failed("invalid_rpc_header");if(name=="authorization")request.authorization=item.value().as<String>();}
  if(request.authorization.length()>256)return failed("invalid_rpc_credential");
  envelope.clear();encoded=static_cast<const char*>(nullptr); // nullptr releases the pinned Arduino String allocation.
  // The response String owns this linked view through synchronous serialization.
  handle(&request);request.body=static_cast<const char*>(nullptr);JsonDocument response;response["status"]=request.responseStatus;response["body"]=JsonString(request.responseBody.c_str(),request.responseBody.length(),true);String result;serializeJson(response,result);return result;
 }
 void rtcDisconnected(size_t peer=0){
  if(peer>=2)return;CoreLock lock(mutex_);
  if(rtcChallengePeer_==int(peer)){releaseChallenge();invalidateChallenge();}
  for(const auto& target:core_.targets())if(rtcOwners_.owns(peer,target.id,target.lease.id)){auto client=target.lease.clientId;core_.cancel(target.id,client,now());}
  if(clipboardPeer_==int(peer))clearClipboard();rtcOwners_.clear(peer);
 }
 bool rtcCanReplace(size_t peer=0){
  if(peer>=2)return false;CoreLock lock(mutex_);if(maintenance_)return false;
  if(rtcChallengePeer_==int(peer)&&auth_.active(now()))return false;
  for(const auto& target:core_.targets())if(rtcOwners_.owns(peer,target.id,target.lease.id)&&(target.running||target.lease.expiresAt>now()))return false;
  return true;
 }
 // Caller holds Core's mutex and has durably removed this target's bond map.
 // Preserve owner/client credentials; only the phone proof is revoked.
 bool inputBusy()const{return auth_.typing(now());}
 void forgetTarget(const std::string& target){
  rtcOwners_.forgetTarget(target);
  if(clipboardTarget_==target.c_str())clearClipboard();
  std::array<bool,MaxClients> changed{};size_t i=0;
  for(const auto& grant:auth_.grants())changed[i++]=grant.active&&grant.targetId==target;
  if(auth_.target()==target){challengeHandle_=InvalidHandle;rtcChallengePeer_=-1;}auth_.forgetTarget(target);
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
 bool finishSetup(){return setupDeadline_.finish(apActive_,!startCandidate_&&wifiJoin_.canFinish(configComplete_,WiFi.status()==WL_CONNECTED,hasNetworkAddress()),now());}
 const String& publicFingerprint()const{return identityFingerprint_;}
 SecureService(Core& core,Sink& sink,Preferences& prefs,SemaphoreHandle_t mutex,const String& board,const String& boot,const String& host,std::atomic<uint32_t>& wifiEpoch,void (&networkLoader)(String&,String&)):core_(core),sink_(sink),prefs_(prefs),mutex_(mutex),board_(board),boot_(boot),host_(host),wifiEpoch_(wifiEpoch),loadSavedNetwork_(networkLoader){}
 void begin(bool needsWifi){
  bridgeSettings_=readBridgeSettings(prefs_.getString("bridgeSettings", "").c_str());
  owner_=prefs_.getString("owner","");apPassword_=prefs_.getString("apPass","");origin_=prefs_.getString("origin","https://igent.cc");JsonDocument network;if(!deserializeJson(network,prefs_.getString("network","")))origin_=network["origin"]|"https://igent.cc";configComplete_=!needsWifi;if(owner_.isEmpty()){owner_=randomHex(32);prefs_.putString("owner",owner_);}if(apPassword_.isEmpty()){apPassword_=randomHex(12);prefs_.putString("apPass",apPassword_);}storageReady_=prefs_.getString("owner","")==owner_&&prefs_.getString("apPass","")==apPassword_;if(!storageReady_){Serial.println("{\"error\":\"ownership_storage_not_ready\"}");return;}identityFingerprint_=sha256Hex(owner_); // Persistent identity label derived from the saved board secret.
  for(size_t i=0;i<MaxClients;i++){JsonDocument doc;auto text=prefs_.getString(("grant"+String(i)).c_str(),"");if(!deserializeJson(doc,text)){std::string id=doc["id"]|"",hash=doc["hash"]|"",origin=doc["origin"]|"",target=doc["target"]|"";if(!core_.target(target))target.clear();if(auth_.install(id,hash,origin,target)&&!target.empty())core_.bindClient(id,target);}}
  ap_.on("/",HTTP_GET,[this]{
   if(!apRequest()){ap_.send(403,"text/plain","Connect to this device's setup Wi-Fi first.");return;}
   ap_.sendHeader("Cache-Control","no-store");ap_.sendHeader("Content-Security-Policy","default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'");
   String page=renderWifiSetupPage(owner_);
   ap_.send(200,"text/html; charset=utf-8",page);
  });
  ap_.on("/configure",HTTP_POST,[this]{if(!apRequest()||ap_.header("Origin")!="http://192.168.4.1"){ap_.send(403,"application/json","{\"error\":\"protected_ap_origin_required\"}");return;}JsonDocument body;if(ap_.arg("plain").length()>2048||deserializeJson(body,ap_.arg("plain"))||!configure(body)){ap_.send(403,"application/json","{\"error\":\"configuration_rejected\"}");return;}JsonDocument reply;reply["accepted"]=true;reply["status"]="connecting";reply["httpUrl"]="http://"+host_+".local";reply["boardId"]=board_;reply["publicKeyFingerprint"]=identityFingerprint_;String out;serializeJson(reply,out);ap_.sendHeader("Cache-Control","no-store");ap_.send(202,"application/json",out);});
  ap_.on("/connection-status",HTTP_GET,[this]{if(!apRequest()){ap_.send(403,"application/json","{\"error\":\"setup_only\"}");return;}JsonDocument reply;bool connected=!startCandidate_&&wifiJoin_.canFinish(configComplete_,WiFi.status()==WL_CONNECTED,hasNetworkAddress());reply["status"]=wifiJoin_.candidateFailed()?"failed":connected?"connected":wifiJoin_.name();reply["configured"]=connected&&!wifiJoin_.candidateFailed();reply["harnessURL"]=origin_+"/";if(connected)addRtc(reply);reply["pairingCodeRequired"]=false;reply["httpUrl"]="http://"+host_+".local";reply["boardId"]=board_;String out;serializeJson(reply,out);ap_.sendHeader("Cache-Control","no-store");ap_.send(200,"application/json",out);});
  ap_.on("/finish",HTTP_POST,[this]{JsonDocument d;if(!apRequest()||ap_.header("Origin")!="http://192.168.4.1"||deserializeJson(d,ap_.arg("plain"))||!constantEqual(std::string(d["setupPassword"]|""),owner_.c_str())||!configComplete_){ap_.send(403,"text/plain","Owner proof required");return;}if(!finishSetup()){ap_.send(409,"application/json","{\"error\":\"wifi_not_connected\"}");return;}ap_.send(200,"application/json","{\"configured\":true}");});
  ap_.onNotFound([this]{ap_.send(403,"application/json","{\"error\":\"setup_only\"}");});const char* headers[]={"Origin"};ap_.collectHeaders(headers,1);if(needsWifi)openSetup();
 }
 void setupInfo(){JsonDocument info;info["format"]="iah-setup/1";info["storageReady"]=storageReady_;addIdentity(info);info["apSsid"]="iPhone-Harness-"+board_.substring(4);info["apPassword"]=apPassword_;info["pairingCodeRequired"]=false;info["hostname"]=host_+".local";info["httpUrl"]="http://"+host_+".local";info["transport"]="webrtc-direct";addRtc(info);info["apActive"]=apActive_;info["publicKeyFingerprint"]=identityFingerprint_;Serial.print("IAH_SETUP ");serializeJson(info,Serial);Serial.println();}
 void openSetup(){
  recoverySetup_=false;
  setupDeadline_.opened();maintenance_=true;
  httpReady_.store(false);
  if(http_){
   {CoreLock lock(mutex_);for(const auto& t:core_.targets())if(!t.lease.clientId.empty())core_.cancel(t.id,t.lease.clientId,now());releaseChallenge();invalidateChallenge();}
   httpd_stop(http_);http_=nullptr;
  }
  WiFi.mode(WIFI_AP_STA);apActive_=WiFi.softAP(("iPhone-Harness-"+board_.substring(4)).c_str(),apPassword_.c_str(),1,false,1);if(apActive_)ap_.begin();
  Serial.println("{\"event\":\"protected_setup_available\",\"secretsLogged\":false}");
 }
 bool networkConfigured()const{return configComplete_;}
 uint32_t networkRetryAttempts()const{return savedRetry_.attempts();}
 uint64_t networkRetryNextAtMs()const{return savedRetry_.nextAt();}
 uint64_t networkRetryIntervalMs()const{return savedRetry_.intervalMs();}
 bool networkCandidateFailed()const{return wifiJoin_.candidateFailed();}
 const char* configurationStatus()const{return wifiJoin_.name();}
 bool networkReady()const{return httpReady_.load();}
 void loop(){
  if(!storageReady_)return;
  if(restartAt_.load()&&now()>=restartAt_.load()){{CoreLock lock(mutex_);if(core_.configurationBusy(now())||auth_.active(now()))return;}ESP.restart();return;}
  if(!http_)ap_.handleClient();
  updateNetwork();
  if(setupDeadline_.due(apActive_,now())){ap_.stop();WiFi.softAPdisconnect(true);apActive_=false;setupDeadline_.closed();}
  if(!http_&&!apActive_&&WiFi.status()==WL_CONNECTED&&now()>=httpRetryAt_){httpRetryAt_=now()+10000;
   httpd_config_t cfg=HTTPD_DEFAULT_CONFIG();cfg.server_port=80;cfg.max_open_sockets=2;cfg.lru_purge_enable=true;cfg.max_uri_handlers=1;cfg.max_resp_headers=12;cfg.uri_match_fn=httpd_uri_match_wildcard;cfg.recv_wait_timeout=2;cfg.send_wait_timeout=2;cfg.stack_size=6144;cfg.task_priority=1;
   if(httpd_start(&http_,&cfg)==ESP_OK){httpd_uri_t routeConfig{};routeConfig.uri="/*";routeConfig.method=(httpd_method_t)HTTP_ANY;routeConfig.handler=route;routeConfig.user_ctx=this;if(httpd_register_uri_handler(http_,&routeConfig)!=ESP_OK){httpd_stop(http_);http_=nullptr;Serial.println("{\"event\":\"http_route_registration_failed\"}");return;}maintenance_=false;httpReady_.store(true);if(apActive_){WiFi.softAPdisconnect(true);apActive_=false;}Serial.println("{\"event\":\"http_ready\",\"privateCredentialsLogged\":false}");}else http_=nullptr;
  }
  CoreLock lock(mutex_);clipboard_.tick(now());if(auth_.expiresAt()&&now()>=auth_.expiresAt()){releaseChallenge();invalidateChallenge();}
  if(auth_.typing(now())){
   auto t=core_.target(auth_.target());if(!t||t->connHandle!=challengeHandle_||!t->encrypted||!t->subscribed){releaseChallenge();invalidateChallenge();return;}
   if(now()<challengeNext_)return;if(now()>challengeNext_+100){releaseChallenge();invalidateChallenge();return;}
   Event e;e.kind=Kind::Keyboard;if(challengeEvent_%2==0){char digit=auth_.digit(challengeEvent_/2);e.count=1;e.usages[0]=digit=='0'?39:29+(digit-'0');}
   t->releaseUncertain=true;if(!sink_.submit(challengeHandle_,e)){releaseChallenge();invalidateChallenge();return;}challengeEvent_++;challengeNext_=now()+30;
   if(challengeEvent_>=16){bool released=sink_.release(challengeHandle_,t->input);t->releasePending=!released;if(released){t->releaseUncertain=false;auth_.typed();}else invalidateChallenge();}
  }
 }
};
}
