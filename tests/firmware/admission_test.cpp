#include "../../firmware/IPhoneAutomationHarness/src/Admission.h"
#include <cassert>
#include <iostream>
#include <map>
using namespace iah;
struct BindingSink:Sink {
 size_t sent=0,releases=0;bool healthy=true;
 bool submit(uint16_t,const Event&)override{sent++;return healthy;}
 bool release(uint16_t,const Input&)override{releases++;return healthy;}
};
struct BindingFixture {
 BindingSink sink;Core core{"board","boot",sink};Admission auth;
 std::map<std::string,Grant> saved;size_t writes=0;bool durable=true;
 BindingFixture(){
  for(const auto& suffix:{std::string("a"),std::string("b")}){
   assert(core.registerBond("phone-"+suffix,"bond-"+suffix)==Code::Accepted);
   assert(core.connect("bond-"+suffix,suffix=="a"?11:22,true,true,true)==Code::Accepted);
   assert(core.bindClient("owner-"+suffix,"phone-"+suffix)==Code::Accepted);
   assert(auth.install("owner-"+suffix,std::string(64,suffix[0]),"https://igent.cc","phone-"+suffix));
   saved["owner-"+suffix]=*auth.client("owner-"+suffix);
  }
 }
 Code bind(const std::string& owner,const std::string& target,uint64_t now=100){
  return auth.associate(core,owner,target,now,[&](const Grant& updated){writes++;if(!durable)return false;saved[updated.clientId]=updated;return true;});
 }
};
int main(){size_t cases=0;
 {Admission a;assert(a.install("client",std::string(64,'a'),"https://igent.cc"));assert(a.authenticate(std::string(64,'a'),"https://igent.cc"));assert(!a.authenticate(std::string(64,'b'),"https://igent.cc"));assert(!a.authenticate(std::string(64,'a'),"https://evil.example"));cases++;}
 {Admission a;a.install("client",std::string(64,'a'),"https://igent.cc");assert(a.begin("client","phone-a","challenge-a","12345678",100));assert(!a.confirm("client","phone-a","challenge-a","12345678",110));a.typed();assert(!a.confirm("client","phone-b","challenge-a","12345678",120));assert(!a.confirm("client","phone-a","different","12345678",120));assert(a.confirm("client","phone-a","challenge-a","12345678",120));assert(a.client("client")->targetId=="phone-a");assert(!a.confirm("client","phone-a","challenge-a","12345678",121));cases++;}
 {Admission a;a.install("client",std::string(64,'a'),"https://igent.cc");assert(a.begin("client","phone-a","challenge-a","87654321",100));a.typed();assert(!a.confirm("client","phone-a","challenge-a","00000000",120));assert(!a.confirm("client","phone-a","challenge-a","00000000",121));assert(!a.confirm("client","phone-a","challenge-a","00000000",122));assert(!a.active(123));assert(!a.confirm("client","phone-a","challenge-a","87654321",123));cases++;}
 {Admission a;a.install("client",std::string(64,'a'),"https://igent.cc");assert(a.begin("client","phone-a","challenge-a","11111111",100));a.typed();assert(!a.confirm("client","phone-a","challenge-a","11111111",30101));assert(!a.begin("client","phone-b","challenge-b","11111111",200));assert(a.begin("client","phone-b","challenge-b","22222222",30200));cases++;}
 {Admission a;a.install("client-a",std::string(64,'a'),"https://igent.cc");a.install("client-b",std::string(64,'b'),"https://igent.cc");assert(a.begin("client-a","phone-a","challenge-a","12345678",100));a.typed();assert(!a.confirm("client-b","phone-a","challenge-a","12345678",120));assert(a.confirm("client-a","phone-a","challenge-a","12345678",120));assert(!a.begin("client-a","phone-b","challenge-b","12345678",40000));cases++;}
 {Admission a;for(int i=0;i<8;i++)assert(a.install("client-"+std::to_string(i),std::string(64,'a'+i),"https://igent.cc"));assert(!a.install("ninth",std::string(64,'z'),"https://igent.cc"));assert(a.install("client-0",std::string(64,'f'),"https://igent.cc"));assert(!a.authenticate(std::string(64,'a'),"https://igent.cc"));cases++;}
 {assert(constantEqual("secret","secret"));assert(!constantEqual("secret","secreu"));assert(!constantEqual("secret","secret-long"));assert(!constantEqual("","x"));cases++;}
 {Admission a;a.install("owner",std::string(64,'a'),"https://igent.cc","old-phone");a.install("other",std::string(64,'b'),"https://igent.cc","other-phone");assert(a.begin("owner","old-phone","challenge","12345678",100));a.typed();a.forgetTarget("old-phone");assert(!a.active(101));assert(!a.confirm("owner","old-phone","challenge","12345678",102));assert(a.authenticate(std::string(64,'a'),"https://igent.cc"));assert(a.client("owner")->targetId.empty());assert(a.client("other")->targetId=="other-phone");assert(a.begin("owner","new-phone","new-challenge","87654321",103));cases++;}

 // Reclaim only an idle, unbound registration, at exactly its durable slot.
 {Admission a;for(size_t i=0;i<MaxClients;i++)assert(a.install("client-"+std::to_string(i),std::string(64,'a'+i),"https://igent.cc"));
  const auto before=a.grants();auto durable=before;size_t writes=0,writtenSlot=MaxClients;
  auto result=a.enroll("new-browser",std::string(64,'z'),"https://igent.cc",100,[](const Grant&){return false;},[&](size_t slot,const Grant& grant){writes++;writtenSlot=slot;durable[slot]=grant;return true;});
  assert(result==Admission::Enrollment::Accepted&&writes==1&&writtenSlot==0);assert(!a.client("client-0"));assert(!a.authenticate(std::string(64,'a'),"https://igent.cc"));assert(a.authenticate(std::string(64,'z'),"https://igent.cc"));
  for(size_t i=1;i<MaxClients;i++){assert(a.grants()[i].clientId==before[i].clientId);assert(a.grants()[i].tokenHash==before[i].tokenHash);assert(durable[i].clientId==before[i].clientId);}
  Admission reboot;for(const auto& grant:durable)if(grant.active)assert(reboot.install(grant.clientId,grant.tokenHash,grant.origin,grant.targetId));assert(reboot.authenticate(std::string(64,'z'),"https://igent.cc"));assert(!reboot.client("client-0"));cases++;}
 // Bound identities and active RTC/lease/clipboard owners are never displaced.
 {Admission a;for(size_t i=0;i<MaxClients;i++)assert(a.install("client-"+std::to_string(i),std::string(64,'a'+i),"https://igent.cc",i==0||i==2?"phone-a":""));const auto before=a.grants();size_t written=MaxClients;
  auto protectedClient=[](const Grant& grant){return grant.clientId=="client-1"||grant.clientId=="client-3"||grant.clientId=="client-4";};
  assert(a.enroll("new-browser",std::string(64,'z'),"https://igent.cc",100,protectedClient,[&](size_t slot,const Grant&){written=slot;return true;})==Admission::Enrollment::Accepted);assert(written==5);
  for(size_t i=0;i<MaxClients;i++)if(i!=5){assert(a.grants()[i].clientId==before[i].clientId);assert(a.grants()[i].targetId==before[i].targetId);assert(a.grants()[i].tokenHash==before[i].tokenHash);}cases++;}
 {Admission a;for(size_t i=0;i<MaxClients;i++)assert(a.install("bound-"+std::to_string(i),std::string(64,'a'+i),"https://igent.cc","phone-a"));size_t writes=0;assert(a.enroll("new-browser",std::string(64,'z'),"https://igent.cc",100,[](const Grant&){return false;},[&](size_t,const Grant&){writes++;return true;})==Admission::Enrollment::Capacity);assert(writes==0);for(size_t i=0;i<MaxClients;i++)assert(a.client("bound-"+std::to_string(i))->targetId=="phone-a");cases++;}
 {Admission a;for(size_t i=0;i<MaxClients;i++)assert(a.install("protected-"+std::to_string(i),std::string(64,'a'+i),"https://igent.cc"));size_t writes=0;assert(a.enroll("new-browser",std::string(64,'z'),"https://igent.cc",100,[](const Grant&){return true;},[&](size_t,const Grant&){writes++;return true;})==Admission::Enrollment::Capacity);assert(writes==0);cases++;}
 // A current input challenge blocks enrollment, including the challenging client.
 {Admission a;assert(a.install("challenge-owner",std::string(64,'a'),"https://igent.cc"));assert(a.begin("challenge-owner","phone-a","challenge","12345678",100));size_t writes=0;auto persist=[&](size_t,const Grant&){writes++;return true;};assert(a.enroll("new-browser",std::string(64,'z'),"https://igent.cc",101,[](const Grant&){return false;},persist)==Admission::Enrollment::Busy);assert(a.enroll("challenge-owner",std::string(64,'z'),"https://igent.cc",101,[](const Grant&){return false;},persist)==Admission::Enrollment::Busy);assert(writes==0);a.typed();assert(a.confirm("challenge-owner","phone-a","challenge","12345678",102));cases++;}
 // A refused durable replacement does not change live or saved credentials.
 {Admission a;for(size_t i=0;i<MaxClients;i++)assert(a.install("client-"+std::to_string(i),std::string(64,'a'+i),"https://igent.cc"));const auto before=a.grants();size_t writes=0;assert(a.enroll("new-browser",std::string(64,'z'),"https://igent.cc",100,[](const Grant&){return false;},[&](size_t slot,const Grant& grant){writes++;assert(slot==0&&grant.clientId=="new-browser");return false;})==Admission::Enrollment::PersistenceFailed);assert(writes==1&&!a.client("new-browser"));for(size_t i=0;i<MaxClients;i++){assert(a.grants()[i].clientId==before[i].clientId);assert(a.grants()[i].tokenHash==before[i].tokenHash);}cases++;}
 // Existing bound browsers renew their own slot and preserve phone ownership.
 {Admission a;assert(a.install("owner",std::string(64,'a'),"https://igent.cc","phone-a"));size_t written=MaxClients;assert(a.enroll("owner",std::string(64,'b'),"https://igent.cc",100,[](const Grant&){return true;},[&](size_t slot,const Grant& grant){written=slot;assert(grant.targetId=="phone-a");return true;})==Admission::Enrollment::Accepted);assert(written==0&&a.client("owner")->targetId=="phone-a");assert(!a.authenticate(std::string(64,'a'),"https://igent.cc"));assert(a.authenticate(std::string(64,'b'),"https://igent.cc"));cases++;}
 // A chosen target changes the browser mapping without replacing its credential.
 {BindingFixture f;auto other=f.saved.at("owner-b");assert(f.bind("owner-a","phone-b")==Code::Accepted);assert(f.auth.client("owner-a")->targetId=="phone-b");assert(f.saved.at("owner-a").targetId=="phone-b");assert(f.auth.authenticate(std::string(64,'a'),"https://igent.cc")->clientId=="owner-a");assert(f.auth.client("owner-b")->targetId==other.targetId);assert(f.saved.at("owner-b").tokenHash==other.tokenHash);assert(f.core.lease("phone-a","owner-a","old-route",1000,101)==Code::Unauthorized);assert(f.core.lease("phone-b","owner-a","new-route",1000,101)==Code::Accepted);assert(f.sink.sent==0&&f.sink.releases==2);cases++;}
 // Failed persistence changes neither live registry nor its saved mapping.
 {BindingFixture f;f.durable=false;assert(f.bind("owner-a","phone-b")==Code::PersistenceFailed);assert(f.auth.client("owner-a")->targetId=="phone-a");assert(f.saved.at("owner-a").targetId=="phone-a");assert(f.core.lease("phone-b","owner-a","wrong-route",1000,101)==Code::Unauthorized);assert(f.core.lease("phone-a","owner-a","retained-route",1000,101)==Code::Accepted);assert(f.auth.authenticate(std::string(64,'a'),"https://igent.cc"));assert(f.sink.sent==0);cases++;}
 // Both the old writer and another browser's live target lease block the change.
 {BindingFixture f;assert(f.core.lease("phone-a","owner-a","old-lease",1000,10)==Code::Accepted);assert(f.bind("owner-a","phone-b")==Code::Busy);assert(f.writes==0&&f.auth.client("owner-a")->targetId=="phone-a");cases++;}
 {BindingFixture f;assert(f.core.lease("phone-b","owner-b","other-lease",1000,10)==Code::Accepted);assert(f.bind("owner-a","phone-b")==Code::Busy);assert(f.writes==0&&f.auth.client("owner-a")->targetId=="phone-a");assert(f.core.target("phone-b")->lease.clientId=="owner-b");cases++;}
 {BindingFixture f;assert(f.auth.begin("owner-a","phone-a","input-test","12345678",10));assert(f.bind("owner-a","phone-b")==Code::Busy);assert(f.writes==0);cases++;}
 {BindingFixture f;f.core.target("phone-a")->input.buttons=1;assert(f.bind("owner-a","phone-b")==Code::Busy);assert(f.writes==0);cases++;}
 {BindingFixture f;f.core.target("phone-b")->running=true;assert(f.bind("owner-a","phone-b")==Code::Busy);assert(f.writes==0);cases++;}
 {BindingFixture f;f.core.target("phone-b")->releasePending=true;assert(f.bind("owner-a","phone-b")==Code::NotReady);assert(f.writes==0);cases++;}
 {BindingFixture f;assert(f.bind("missing","phone-a")==Code::Invalid);assert(f.bind("owner-a","invalid target")==Code::Invalid);assert(f.bind("owner-a","phone-c")==Code::NotReady);assert(f.writes==0);assert(f.bind("owner-a","phone-a")==Code::Duplicate);assert(f.auth.client("owner-a")->targetId=="phone-a");cases++;}
 {BindingFixture f;assert(f.auth.install("new-browser",std::string(64,'c'),"https://igent.cc"));assert(f.bind("new-browser","phone-a")==Code::Accepted);assert(f.core.lease("phone-a","new-browser","new-browser-lease",1000,101)==Code::Accepted);assert(f.auth.client("owner-a")->targetId=="phone-a");cases++;}
 {BindingFixture f;f.core.disconnect(11,10);assert(f.bind("owner-a","phone-b")==Code::Accepted);assert(f.auth.client("owner-a")->targetId=="phone-b");assert(f.core.lease("phone-a","owner-a","offline-old-route",1000,101)==Code::Unauthorized);cases++;}
 {Admission a;assert(a.install("owner",std::string(64,'a'),"https://igent.cc"));assert(a.install("other",std::string(64,'b'),"https://igent.cc"));assert(a.begin("owner","phone-a","test","12345678",100));assert(!a.cancelChallenge("other","phone-a",101));assert(!a.cancelChallenge("owner","phone-b",101));assert(a.ownsChallenge("owner","phone-a",101));assert(a.cancelChallenge("owner","phone-a",102));assert(!a.active(102));assert(a.cancelChallenge("owner","phone-a",103));cases++;}
 // A missing initial neutral report never fences an idle browser onto that
 // unavailable phone; changing targets does not make the old phone ready.
 {BindingFixture f;f.core.disconnect(11,10);assert(f.core.connect("bond-a",11,true,true,false,2)==Code::NotReady);auto previous=f.core.target("phone-a");assert(previous->releasePending&&!previous->releaseUncertain&&!previous->input.held());assert(f.bind("owner-a","phone-b")==Code::Accepted);assert(previous->releasePending&&!previous->subscribed);assert(f.auth.client("owner-a")->targetId=="phone-b");cases++;}
 // Any attempted real input, including a failed submission, retains an unknown
 // release fence even after the input cache is cleared by failure cleanup.
 {BindingFixture f;assert(f.core.lease("phone-a","owner-a","input-lease",1000,100)==Code::Accepted);Segment segment;segment.boardId="board";segment.bootId="boot";segment.targetId="phone-a";segment.clientId="owner-a";segment.leaseId="input-lease";segment.segmentId="failed-input";segment.planId="plan";segment.payloadHash=std::string(64,'a');segment.ttlMs=500;segment.count=2;segment.events[0].kind=segment.events[1].kind=Kind::Keyboard;segment.events[0].count=1;segment.events[0].usages[0]=4;segment.events[1].atMs=1;assert(f.core.accept(segment,100)==Code::Accepted);f.sink.healthy=false;f.core.tick(100);auto old=f.core.target("phone-a");assert(old->releasePending&&old->releaseUncertain&&!old->input.held());f.core.cancel("phone-a","owner-a",101);assert(old->lease.id.empty()&&old->releaseUncertain);assert(f.bind("owner-a","phone-b",102)==Code::Busy);f.sink.healthy=true;assert(f.core.connect("bond-a",11,true,true,true)==Code::Accepted);assert(!old->releasePending&&!old->releaseUncertain);assert(f.bind("owner-a","phone-b",104)==Code::Accepted);cases++;}
 {BindingFixture f;auto old=f.core.target("phone-a");old->releasePending=true;old->releaseUncertain=true;assert(f.bind("owner-a","phone-b")==Code::Busy);f.core.disconnect(11,101);assert(f.bind("owner-a","phone-b",102)==Code::Busy);cases++;}
 std::cout<<cases<<" admission scenarios passed\n";
}
