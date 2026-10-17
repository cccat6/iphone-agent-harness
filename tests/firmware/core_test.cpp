#include "../../firmware/IPhoneAutomationHarness/src/Core.h"
#include <cassert>
#include <iostream>
#include <vector>
using namespace iah;
struct Fake:Sink {
 struct Send {uint16_t conn;Event event;};std::vector<Send> sent;std::vector<uint16_t> releases;bool healthy=true;
 bool submit(uint16_t c,const Event& e)override{if(healthy)sent.push_back({c,e});return healthy;}
 bool release(uint16_t c,const Input&)override{releases.push_back(c);return healthy;}
};
struct Fixture {
 Fake sink;Core core{"board","boot",sink};
 Fixture(){assert(core.registerBond("target-a","id-public-a")==Code::Accepted);assert(core.registerBond("target-b","id-static-b")==Code::Accepted);
  assert(core.bindClient("client-a","target-a")==Code::Accepted);assert(core.bindClient("client-b","target-b")==Code::Accepted);
  assert(core.connect("id-public-a",11,true,true,true)==Code::Accepted);assert(core.connect("id-static-b",22,true,true,true)==Code::Accepted);
  assert(core.lease("target-a","client-a","lease-a",15000,0)==Code::Accepted);assert(core.lease("target-b","client-b","lease-b",15000,0)==Code::Accepted);sink.releases.clear();}
 Segment plan(std::string id="segment-1",bool b=false){Segment s;s.boardId="board";s.bootId="boot";s.targetId=b?"target-b":"target-a";s.clientId=b?"client-b":"client-a";s.leaseId=b?"lease-b":"lease-a";s.segmentId=id;s.planId="plan";s.payloadHash=std::string(64,'a');s.ttlMs=1000;s.count=3;
  s.events[0].buttons=1;s.events[1].atMs=100;s.events[1].x=7000;s.events[1].buttons=1;s.events[2].atMs=100;s.events[2].x=7000;return s;}
};
int main(){size_t cases=0;
 {Fixture f;auto a=f.plan(),b=f.plan("segment-b",true);assert(f.core.accept(a,0)==Code::Accepted);assert(f.core.accept(b,0)==Code::Accepted);f.core.tick(0);assert(f.sink.sent.size()==2);assert(f.sink.sent[0].conn==11&&f.sink.sent[1].conn==22);f.core.tick(100);assert(f.sink.sent.size()==6);assert(f.sink.sent[2].event.buttons==1&&f.sink.sent[3].event.buttons==0);assert(f.core.result("client-a",a.segmentId)->status==Status::Completed);cases++;}
 {Fixture f;auto s=f.plan();assert(f.core.accept(s,0)==Code::Accepted);assert(f.core.accept(s,0)==Code::Duplicate);auto changed=s;changed.payloadHash[0]='b';assert(f.core.accept(changed,0)==Code::Conflict);f.core.tick(0);f.core.tick(100);assert(f.core.accept(s,200)==Code::Duplicate);assert(f.sink.sent.size()==3);cases++;}
 {Fixture f;auto s=f.plan();s.bootId="old-boot";assert(f.core.accept(s,0)==Code::StaleBoot);s=f.plan();s.clientId="client-b";assert(f.core.accept(s,0)==Code::Unauthorized);assert(f.core.lease("target-a","client-b","steal",1000,0)==Code::Unauthorized);cases++;}
 {Fixture f;assert(f.core.bindClient("observer","target-a")==Code::Accepted);assert(f.core.lease("target-a","observer","other",1000,0)==Code::Busy);auto s=f.plan();f.core.accept(s,0);f.core.tick(0);assert(f.core.cancel("target-a","observer",10)==Code::Unauthorized);assert(f.core.cancel("target-a","client-a",10)==Code::Accepted);assert(f.core.result("client-a",s.segmentId)->status==Status::Cancelled);assert(f.sink.releases.size()==1);f.core.tick(100);assert(f.sink.sent.size()==1);cases++;}
 {Fixture f;auto s=f.plan();f.core.accept(s,0);f.core.tick(0);f.core.disconnect(11,20);auto r=f.core.result("client-a",s.segmentId);assert(r->status==Status::Disconnected&&!r->releaseSubmitted);assert(f.core.connect("id-public-a",33,true,true,true)==Code::Accepted);assert(f.sink.releases.back()==33);cases++;}
 {Fixture f;auto s=f.plan();f.core.accept(s,0);f.core.tick(0);f.core.tick(141);assert(f.core.result("client-a",s.segmentId)->status==Status::TimingMiss);assert(f.sink.sent.size()==1);assert(f.sink.releases.size()==1);cases++;}
 {Fixture f;auto s=f.plan();s.count=2;s.events[1]=s.events[2];s.events[1].atMs=3001;s.ttlMs=4000;assert(f.core.accept(s,0)==Code::Invalid);s=f.plan();s.events[2].buttons=1;assert(f.core.accept(s,0)==Code::Invalid);s=f.plan();s.events[1].x=10001;assert(f.core.accept(s,0)==Code::Invalid);s=f.plan();s.events[1].atMs=200;assert(f.core.accept(s,0)==Code::Invalid);cases++;}
 {Fixture f;auto s=f.plan();s.count=2;s.events[0].kind=Kind::Keyboard;s.events[0].count=2;s.events[0].usages[0]=4;s.events[0].usages[1]=4;s.events[1].kind=Kind::Keyboard;assert(f.core.accept(s,0)==Code::Invalid);s.events[0].usages[1]=5;assert(f.core.accept(s,0)==Code::Accepted);f.core.tick(0);f.sink.healthy=false;f.core.tick(100);auto r=f.core.result("client-a",s.segmentId);assert(r->status==Status::TransportFailed&&!r->releaseSubmitted);assert(f.core.target("target-a")->releasePending);cases++;}
 {Fixture f;auto s=f.plan();f.core.accept(s,0);f.core.tick(1000);assert(f.core.result("client-a",s.segmentId)->status==Status::TimedOut);cases++;}
 {Fixture f;auto s=f.plan();f.core.accept(s,14900);assert(!f.core.busy());assert(f.core.accept(s,15000)==Code::Expired);cases++;}
 {Fixture f;auto s=f.plan();assert(f.core.accept(s,0)==Code::Accepted);f.core.tick(0);f.core.tick(100);for(int i=0;i<20;i++){auto n=f.plan("later-"+std::to_string(i));auto now=200+i*110;assert(f.core.accept(n,now)==Code::Accepted);f.core.tick(now);f.core.tick(now+100);}assert(f.core.result("client-a",s.segmentId)==nullptr);assert(f.core.accept(s,3000)==Code::ReplayUnknown);cases++;}
 {Fixture f;auto s=f.plan();assert(f.core.connect("id-public-a",44,true,true,true)==Code::Busy);f.core.disconnect(11,0);assert(f.core.connect("unrecognized-rpa",33,true,true,true)==Code::Missing);assert(f.core.connect("id-public-a",33,true,true,true)==Code::Accepted);cases++;}
 {Fixture f;uint64_t now=UINT64_C(0xffffffff)+100;assert(f.core.lease("target-a","client-a","lease-after-rollover",1000,now)==Code::Accepted);auto s=f.plan();s.leaseId="lease-after-rollover";assert(f.core.accept(s,now)==Code::Accepted);f.core.tick(now);f.core.tick(now+100);assert(f.core.result("client-a",s.segmentId)->status==Status::Completed);cases++;}
 {Fixture f;auto s=f.plan();assert(f.core.accept(s,0)==Code::Accepted);f.core.tick(0);f.core.tick(15000);assert(f.core.result("client-a",s.segmentId)->status==Status::LeaseExpired);assert(f.sink.releases.back()==11);cases++;}
 {Fixture f;auto s=f.plan();f.core.accept(s,0);assert(f.core.accept(f.plan("another"),0)==Code::Busy);f.core.tick(0);f.core.tick(100);assert(f.core.target("target-a")->input.x==7000);assert(!f.core.target("target-a")->input.held());cases++;}
 {Fixture f;assert(f.core.lease("target-a","client-a","another-run",1000,10)==Code::Busy);assert(f.core.lease("target-a","client-a","lease-a",1000,10)==Code::Accepted);assert(f.core.cancel("target-a","client-a",20)==Code::Accepted);assert(f.core.lease("target-a","client-a","lease-a",1000,30)==Code::Expired);assert(f.core.lease("target-a","client-a","fresh-run",1000,30)==Code::Accepted);cases++;}
 std::cout<<cases<<" firmware core scenarios passed\n";
}
