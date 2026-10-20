#pragma once
#include <array>
#include <cstdint>
#include <string>
#include <algorithm>
#include <utility>

namespace iah {
#ifndef IAH_MAX_EVENTS
#define IAH_MAX_EVENTS 512
#endif
#ifndef IAH_SEEN_BYTES
#define IAH_SEEN_BYTES 8192
#endif
constexpr size_t SeenBytes=IAH_SEEN_BYTES;
static_assert(SeenBytes>=4096&&SeenBytes<=8192,"bounded tombstone storage");
constexpr size_t MaxTargets=2, MaxClients=8, MaxEvents=IAH_MAX_EVENTS, MaxResults=16;
static_assert(MaxEvents>=2&&MaxEvents<=512,"bounded event storage");
constexpr uint32_t MaxSegmentMs=5000, MaxHoldMs=3000, MaxLeaseMs=15000, MaxLatenessMs=40;
constexpr uint16_t InvalidHandle=0xffff;
inline bool validId(const std::string& s) {
  if(s.empty()||s.size()>80)return false;
  auto alpha=[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9');};
  if(!alpha(s[0]))return false;
  for(unsigned char c:s)if(!alpha(c)&&c!='.'&&c!='_'&&c!=':'&&c!='-')return false;
  return true;
}
enum class Kind:uint8_t {Pointer,Keyboard,Consumer};
struct Event {
  uint16_t atMs=0; Kind kind=Kind::Pointer; uint16_t x=5000,y=5000;
  uint8_t buttons=0,modifiers=0,count=0; std::array<uint8_t,6> usages{}; uint16_t usage=0;
};
struct Segment {
  uint8_t protocolVersion=1,segmentIndex=0;
  std::string boardId,bootId,targetId,clientId,leaseId,segmentId,planId,payloadHash;
  uint32_t ttlMs=0; size_t count=0; std::array<Event,MaxEvents> events{};
};
struct Input {
  uint16_t x=5000,y=5000,consumer=0; uint8_t buttons=0,modifiers=0,count=0;
  std::array<uint8_t,6> usages{};
  bool held()const{return buttons||modifiers||count||consumer;}
};
enum class Code {Accepted,Duplicate,Conflict,ReplayUnknown,Invalid,Unauthorized,Busy,Expired,StaleBoot,NotReady,Missing,PersistenceFailed};
enum class Status {Running,Completed,Cancelled,Disconnected,LeaseExpired,TimedOut,TransportFailed,TimingMiss};
inline const char* statusName(Status s){switch(s){
 case Status::Running:return "running"; case Status::Completed:return "hid_submitted";
 case Status::Cancelled:return "cancelled";case Status::Disconnected:return "disconnected";
 case Status::LeaseExpired:return "lease_expired";case Status::TimedOut:return "timed_out";
 case Status::TransportFailed:return "transport_failed";case Status::TimingMiss:return "timing_miss";}return "unknown";}
struct Result {
  std::string targetId,clientId,segmentId,planId,payloadHash;
  Status status=Status::Running; uint64_t acceptedAt=0,startedAt=0,endedAt=0,lastSubmittedAt=0;
  size_t submitted=0; uint32_t maxLatenessMs=0; bool releaseSubmitted=false;
};
struct Client {std::string id,targetId; bool active=false;};
struct Lease {std::string clientId,id; uint64_t expiresAt=0;};
struct Target {
  // bondIdentity is BLE stack-resolved identity address + type, never peer OTA/RPA.
  std::string id,bondIdentity; uint16_t connHandle=InvalidHandle;
  // Initial neutral-report setup can be pending without any input having been
  // attempted. Actual input remains fenced until a release is confirmed.
  uint32_t connEpoch=0;bool encrypted=false,bonded=false,subscribed=false,releasePending=true,releaseUncertain=false;
  Lease lease; Input input; bool running=false; Segment segment; Result result;
  size_t cursor=0; uint64_t deadline=0;
};
class Sink {
 public: virtual ~Sink()=default;
 virtual bool submit(uint16_t conn,const Event& event)=0;
 virtual bool submitTimed(uint16_t conn,const Event& event,uint64_t){return submit(conn,event);}
 virtual uint64_t submissionTime(uint64_t fallback)const{return fallback;}
 virtual uint64_t currentTime(uint64_t fallback)const{return fallback;}
 virtual bool bindConnection(uint16_t,const std::string&,uint32_t){return true;}
 virtual void unbindConnection(uint16_t,uint32_t){}
 virtual bool release(uint16_t conn,const Input& previous)=0;
};
class Core {
 std::string board_,boot_; Sink& sink_;
 std::array<Target,MaxTargets> targets_{};std::array<Client,MaxClients> clients_{};
 std::array<Result,MaxResults> results_{};size_t resultAt_=0;
 // Boot-local Bloom tombstones: bounded cache eviction may reject a new colliding ID,
 // but must never cause an old ID to execute again. Reset only with a new bootId.
#ifdef IAH_EXTERNAL_SEEN
 uint8_t* seen_;
#else
 std::array<uint8_t,SeenBytes> seen_{};
#endif
 static uint32_t hash(const std::string& s,uint32_t seed){for(unsigned char c:s)seed=(seed^c)*16777619u;return seed;}
 bool seen(const std::string& s)const{auto a=hash(s,2166136261u),step=hash(s,0x9e3779b9u)|1u;for(uint32_t i=0;i<16;i++){auto bit=(a+i*step)%(SeenBytes*8);if(!(seen_[bit/8]&(1u<<(bit%8))))return false;}return true;}
 void mark(const std::string& s){auto a=hash(s,2166136261u),step=hash(s,0x9e3779b9u)|1u;for(uint32_t i=0;i<16;i++){auto bit=(a+i*step)%(SeenBytes*8);seen_[bit/8]|=1u<<(bit%8);}}
 static std::string key(const Segment& s){return s.clientId+"/"+s.segmentId;}
 Client* client(const std::string& id){for(auto& c:clients_)if(c.active&&c.id==id)return &c;return nullptr;}
 bool authorized(const std::string& c,const std::string& t){auto p=client(c);return p&&p->targetId==t;}
 bool ready(const Target& t)const{return t.connHandle!=InvalidHandle&&t.encrypted&&t.bonded&&t.subscribed&&!t.releasePending;}
 void finish(Target& t,Status status,uint64_t now){
   t.result.status=status;
   t.releaseUncertain=t.releaseUncertain||t.input.held();t.result.releaseSubmitted=t.connHandle!=InvalidHandle&&sink_.release(t.connHandle,t.input);
   if(t.result.releaseSubmitted)t.releaseUncertain=false;
   t.result.endedAt=std::max(now,sink_.currentTime(now));t.releasePending=!t.result.releaseSubmitted;auto x=t.input.x,y=t.input.y;t.input=Input{};t.input.x=x;t.input.y=y;t.running=false;
   results_[resultAt_++%MaxResults]=t.result;
 }
 static bool validEvents(const Segment& s){
  if(!s.count||s.count>MaxEvents||s.segmentIndex>29||s.protocolVersion!=1||s.ttlMs<100||s.ttlMs>15000)return false;
  if(s.payloadHash.size()!=64)return false;
  for(char c:s.payloadHash)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;
  Input in; uint32_t previous=0;std::array<int32_t,3> heldSince{{-1,-1,-1}};
  for(size_t i=0;i<s.count;i++){
   const auto& e=s.events[i];if(e.atMs<previous||e.atMs>MaxSegmentMs||e.atMs>=s.ttlMs)return false;
   for(auto since:heldSince)if(since>=0&&e.atMs-static_cast<uint32_t>(since)>MaxHoldMs)return false;
   previous=e.atMs;int channel;
   if(e.kind==Kind::Pointer){if(e.x>10000||e.y>10000||e.buttons>1)return false;in.buttons=e.buttons;channel=0;}
   else if(e.kind==Kind::Keyboard){if(e.count>6)return false;for(size_t j=0;j<e.count;j++){if(e.usages[j]<4||e.usages[j]>231)return false;for(size_t k=0;k<j;k++)if(e.usages[j]==e.usages[k])return false;}in.modifiers=e.modifiers;in.count=e.count;channel=1;}
   else if(e.kind==Kind::Consumer){if(e.usage!=0&&e.usage!=64)return false;in.consumer=e.usage;channel=2;}
   else return false;
   bool held=channel==0?in.buttons:(channel==1?(in.modifiers||in.count):in.consumer);
   if(held&&heldSince[channel]<0)heldSince[channel]=e.atMs;
   if(!held)heldSince[channel]=-1;
  }
  return !in.held();
 }
 public:
 Core(std::string board,std::string boot,Sink& sink
#ifdef IAH_EXTERNAL_SEEN
 ,uint8_t* seenStorage
#endif
 ):board_(board),boot_(boot),sink_(sink)
#ifdef IAH_EXTERNAL_SEEN
 ,seen_(seenStorage)
#endif
 {
#ifdef IAH_EXTERNAL_SEEN
 std::fill_n(seen_,SeenBytes,0);
#endif
 }
 Target* target(const std::string& id){for(auto& t:targets_)if(t.id==id&&!id.empty())return &t;return nullptr;}
 const std::array<Target,MaxTargets>& targets()const{return targets_;}
 Code registerBond(const std::string& id,const std::string& identity){
  if(!validId(id)||identity.empty()||identity.size()>80)return Code::Invalid;
  for(auto& t:targets_)if(!t.id.empty()&&(t.id==id||t.bondIdentity==identity))return t.id==id&&t.bondIdentity==identity?Code::Duplicate:Code::Conflict;
  for(auto& t:targets_)if(t.id.empty()){t.id=id;t.bondIdentity=identity;return Code::Accepted;}
  return Code::Busy;
 }
 // Retire only an offline, stopped phone. No radio notification is emitted.
 Code forgetBond(const std::string& id){
  auto t=target(id);if(!t)return Code::Missing;
  if(t->connHandle!=InvalidHandle||t->running)return Code::Busy;
  for(auto& c:clients_)if(c.active&&c.targetId==id)c=Client{};
  *t=Target{};return Code::Accepted;
 }
 // Called only after transport authenticates client and proves target binding.
 Code bindClient(const std::string& id,const std::string& targetId){
  if(!validId(id)||!target(targetId))return Code::Invalid;
  if(auto c=client(id))return c->targetId==targetId?Code::Duplicate:Code::Conflict;
  for(auto& c:clients_)if(!c.active){c={id,targetId,true};return Code::Accepted;}
  return Code::Busy;
 }
 // Explicit user-selected association. The caller holds the Core mutex while
 // persisting the corresponding grant. Idle historical registrations remain;
 // an active writer on either phone always blocks reassignment.
 template<class Persist> Code rebindClient(const std::string& id,const std::string& targetId,uint64_t now,Persist persist){
  if(!validId(id)||!validId(targetId))return Code::Invalid;
  auto destination=target(targetId);if(!destination||!ready(*destination))return Code::NotReady;
  auto slot=client(id);auto previous=slot?target(slot->targetId):nullptr;
  auto occupied=[now](const Target* t){return t&&(t->running||t->lease.expiresAt>now||t->releaseUncertain||t->input.held());};
  if(occupied(destination)||occupied(previous))return Code::Busy;
  bool duplicate=slot&&slot->targetId==targetId;
  if(!slot)for(auto& entry:clients_)if(!entry.active){slot=&entry;break;}
  if(!slot)return Code::Busy;
  Client replacement{id,targetId,true};
  if(!persist())return Code::PersistenceFailed;
  *slot=std::move(replacement);
  return duplicate?Code::Duplicate:Code::Accepted;
 }
 void forgetClient(const std::string& id,uint64_t now){auto c=client(id);if(!c)return;for(auto& t:targets_)if(t.lease.clientId==id){if(t.running)finish(t,Status::Cancelled,now);t.lease=Lease{};}*c=Client{};}
 Code connect(const std::string& identity,uint16_t handle,bool encrypted,bool bonded,bool subscribed,uint32_t epoch=0){
  for(auto& t:targets_)if(t.bondIdentity==identity&&!t.id.empty()){
   if(t.connHandle!=InvalidHandle&&(t.connHandle!=handle||t.connEpoch!=epoch))return Code::Busy;
   for(const auto& other:targets_)if(other.id!=t.id&&other.connHandle==handle)return Code::Busy;
   t.connHandle=handle;t.connEpoch=epoch;t.encrypted=encrypted;t.bonded=bonded;t.subscribed=subscribed;
   if(!sink_.bindConnection(handle,t.bondIdentity,epoch)){t.releasePending=true;return Code::NotReady;}
   if(encrypted&&bonded&&subscribed&&t.releasePending){t.releaseUncertain=t.releaseUncertain||t.input.held();t.releasePending=!sink_.release(handle,t.input);if(!t.releasePending)t.releaseUncertain=false;t.input=Input{};}
   return ready(t)?Code::Accepted:Code::NotReady;
  }
  return Code::Missing;
 }
 void disconnect(uint16_t handle,uint64_t now){for(auto& t:targets_)if(t.connHandle==handle){
  // Link is already gone: do not mislabel a release as delivered.
  t.connHandle=InvalidHandle;if(t.running)finish(t,Status::Disconnected,now);
  sink_.unbindConnection(handle,t.connEpoch);t.connEpoch=0;
  t.encrypted=t.bonded=t.subscribed=false;t.releasePending=true;t.lease=Lease{};
 }}
 Code lease(const std::string& targetId,const std::string& clientId,const std::string& id,uint32_t ttl,uint64_t now){
  auto t=target(targetId);if(!t||!validId(id)||!ttl||ttl>MaxLeaseMs)return Code::Invalid;
  if(!authorized(clientId,targetId))return Code::Unauthorized;
  if(t->lease.expiresAt>now&&(t->lease.clientId!=clientId||t->lease.id!=id))return Code::Busy;
  if(t->running&&t->lease.expiresAt<=now)return Code::Busy;
  bool renewal=t->lease.expiresAt>now&&t->lease.clientId==clientId&&t->lease.id==id;
  auto leaseKey=std::string("lease:")+targetId+"/"+clientId+"/"+id;
  if(!renewal&&seen(leaseKey))return Code::Expired;
  if(!renewal)mark(leaseKey);
  t->lease={clientId,id,now+ttl};return Code::Accepted;
 }
 const Result* result(const std::string& clientId,const std::string& segmentId)const{
  for(const auto& t:targets_)if(t.running&&t.result.clientId==clientId&&t.result.segmentId==segmentId)return &t.result;
  for(const auto& r:results_)if(r.clientId==clientId&&r.segmentId==segmentId&&!r.segmentId.empty())return &r;
  return nullptr;
 }
 Code accept(const Segment& s,uint64_t now){
  if(s.boardId!=board_||s.bootId!=boot_)return Code::StaleBoot;
  for(const auto* id:{&s.targetId,&s.clientId,&s.leaseId,&s.segmentId,&s.planId})if(!validId(*id))return Code::Invalid;
  if(!authorized(s.clientId,s.targetId))return Code::Unauthorized;
  if(const auto* r=result(s.clientId,s.segmentId))return r->payloadHash==s.payloadHash?Code::Duplicate:Code::Conflict;
  if(seen(key(s)))return Code::ReplayUnknown;
  if(!validEvents(s))return Code::Invalid;
  auto t=target(s.targetId);if(!t)return Code::Missing;
  if(t->lease.clientId!=s.clientId||t->lease.id!=s.leaseId)return Code::Unauthorized;
  if(t->lease.expiresAt<=now)return Code::Expired;
  if(!ready(*t))return Code::NotReady;
  if(t->running)return Code::Busy;
  // Finish before lease expiry; prevents accepting a segment that cannot complete.
  if(now+s.events[s.count-1].atMs>=t->lease.expiresAt)return Code::Expired;
  t->segment=s;t->cursor=0;t->running=true;t->deadline=now+s.ttlMs;
  t->result=Result{};t->result.targetId=s.targetId;t->result.clientId=s.clientId;
  t->result.segmentId=s.segmentId;t->result.planId=s.planId;t->result.payloadHash=s.payloadHash;
  t->result.acceptedAt=t->result.startedAt=now;mark(key(s));return Code::Accepted;
 }
 void tick(uint64_t now){for(auto& t:targets_)if(t.running){
  if(t.lease.expiresAt<=now){finish(t,Status::LeaseExpired,now);continue;}
  if(t.deadline<=now){finish(t,Status::TimedOut,now);continue;}
  if(!ready(t)){finish(t,Status::Disconnected,now);continue;}
  while(t.cursor<t.segment.count){const auto& e=t.segment.events[t.cursor];auto due=t.result.startedAt+e.atMs;if(now<due)break;
   auto late=static_cast<uint32_t>(now-due);t.result.maxLatenessMs=std::max(t.result.maxLatenessMs,late);
   if(late>MaxLatenessMs){finish(t,Status::TimingMiss,now);break;}
   t.releaseUncertain=true;
   if(!sink_.submitTimed(t.connHandle,e,std::min({due+MaxLatenessMs,t.deadline-1,t.lease.expiresAt-1}))){finish(t,Status::TransportFailed,sink_.currentTime(now));break;}
   auto submittedAt=sink_.submissionTime(now);t.result.maxLatenessMs=std::max(t.result.maxLatenessMs,static_cast<uint32_t>(submittedAt>due?submittedAt-due:0));
   if(e.kind==Kind::Pointer){t.input.x=e.x;t.input.y=e.y;t.input.buttons=e.buttons;}
   else if(e.kind==Kind::Keyboard){t.input.modifiers=e.modifiers;t.input.count=e.count;t.input.usages=e.usages;}
   else t.input.consumer=e.usage;
   t.result.submitted++;t.result.lastSubmittedAt=submittedAt;t.cursor++;
  }
  if(t.running&&t.cursor==t.segment.count)finish(t,Status::Completed,now);
 }}
 Code cancel(const std::string& targetId,const std::string& clientId,uint64_t now){
  auto t=target(targetId);if(!t)return Code::Missing;if(!authorized(clientId,targetId))return Code::Unauthorized;
  if(t->lease.clientId!=clientId)return Code::Unauthorized;
  if(t->running)finish(*t,Status::Cancelled,now);
  else{t->releaseUncertain=t->releaseUncertain||t->input.held();t->releasePending=!(t->connHandle!=InvalidHandle&&sink_.release(t->connHandle,t->input));if(!t->releasePending)t->releaseUncertain=false;auto x=t->input.x,y=t->input.y;t->input=Input{};t->input.x=x;t->input.y=y;}
  t->lease=Lease{};return Code::Accepted;
 }
 bool busy()const{for(const auto& t:targets_)if(t.running)return true;return false;}
 // Initial neutral reports do not imply pending user input. Real attempted or
 // held input stays fenced, including while its phone is temporarily offline.
 bool configurationBusy(uint64_t now)const{for(const auto& t:targets_)if(!t.id.empty()&&(t.running||t.lease.expiresAt>now||t.releaseUncertain||t.input.held()))return true;return false;}
};
}
