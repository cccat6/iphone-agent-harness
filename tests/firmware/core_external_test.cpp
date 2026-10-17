#define IAH_MAX_EVENTS 128
#define IAH_SEEN_BYTES 7168
#define IAH_EXTERNAL_SEEN 1
#include "../../firmware/IPhoneAutomationHarness/src/Core.h"
#include <cassert>
#include <cstdio>
using namespace iah;
struct Fake:Sink {bool submit(uint16_t,const Event&)override{return true;}bool release(uint16_t,const Input&)override{return true;}};
void ready(Core& core){assert(core.registerBond("target","stable-id")==Code::Accepted);assert(core.bindClient("client","target")==Code::Accepted);assert(core.connect("stable-id",11,true,true,true)==Code::Accepted);assert(core.lease("target","client","lease",15000,0)==Code::Accepted);}
Segment plan(const char* id){Segment s;s.boardId="board";s.bootId="boot-a";s.targetId="target";s.clientId="client";s.leaseId="lease";s.segmentId=id;s.planId="plan";s.payloadHash=std::string(64,'a');s.ttlMs=1000;s.count=1;return s;}
int main(){
 std::array<uint8_t,SeenBytes> retained;retained.fill(255);Fake sink;
 {Core core("board","boot-a",sink,retained.data());assert(std::all_of(retained.begin(),retained.end(),[](uint8_t b){return b==0;}));ready(core);auto old=plan("old");assert(core.accept(old,0)==Code::Accepted);core.tick(0);
  for(int i=0;i<20;i++){auto s=plan(("next-"+std::to_string(i)).c_str());assert(core.accept(s,10+i)==Code::Accepted);core.tick(10+i);}
  assert(core.result("client","old")==nullptr);assert(core.accept(old,50)==Code::ReplayUnknown);
 }
 assert(std::any_of(retained.begin(),retained.end(),[](uint8_t b){return b!=0;}));
 {Core core("board","boot-b",sink,retained.data());assert(std::all_of(retained.begin(),retained.end(),[](uint8_t b){return b==0;}));ready(core);auto stale=plan("old");assert(core.accept(stale,0)==Code::StaleBoot);stale.bootId="boot-b";assert(core.accept(stale,0)==Code::Accepted);}
 std::puts("3 external replay-storage scenarios passed");
}
