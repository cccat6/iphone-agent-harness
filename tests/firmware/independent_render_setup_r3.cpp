#include <cassert>
#include <fstream>
#include <iostream>
#include <string>
#include "../../firmware/IPhoneAutomationHarness/src/LanBridgePage.h"
#include "../../firmware/IPhoneAutomationHarness/src/WifiSetupPage.h"
#include "../../firmware/IPhoneAutomationHarness/src/SetupState.h"
#if ARDUINOJSON_VERSION_MAJOR != 7 || ARDUINOJSON_VERSION_MINOR != 4 || ARDUINOJSON_VERSION_REVISION != 3
#error Requires production-pinned ArduinoJson 7.4.3
#endif
int main(int argc,char** argv){
 assert(argc==2);
 JsonDocument d;d.set("regression");std::string old="<!doctype html>";serializeJson(d,old);assert(old=="\"regression\"");
 std::string origin="https://igent.cc",owner(64,'b');
 auto helper=iah::renderLanBridgePage(origin),setup=iah::renderWifiSetupPage(owner);
 for(auto* page:{&helper,&setup}){assert(page->find("<!doctype html>")==0);assert(page->rfind("</script>")==page->size()-9);}
 std::ofstream(std::string(argv[1])+"/helper.html")<<helper;std::ofstream(std::string(argv[1])+"/setup.html")<<setup;
 using State=iah::WifiJoinState;unsigned combinations=0;
 // Independent acceptance truth table: every prerequisite is necessary, and
 // completing storage is a separate gate from receiving a candidate IP.
 for(unsigned mask=0;mask<16;mask++)for(uint64_t elapsed:{0ULL,1ULL,29999ULL,30000ULL,30001ULL}){
  State s;s.begin(100000,45);
  bool link=mask&1,address=mask&2,ssid=mask&4,fresh=mask&8;
  auto decision=s.poll(link,address,ssid,fresh?46:45,100000+elapsed);
  bool eligible=mask==15&&elapsed<30000;
  assert(decision==(elapsed>=30000?State::Decision::Fail:eligible?State::Decision::Commit:State::Decision::None));
  assert(!s.canFinish(true,true,true));
  if(eligible){assert(s.committed(true));for(unsigned gates=0;gates<8;gates++)assert(s.canFinish(gates&1,gates&2,gates&4)==(gates==7));}
  combinations++;
 }
 State stale;stale.begin(0,12);assert(stale.poll(true,true,false,13,10)==State::Decision::None);
 assert(stale.poll(true,true,true,12,11)==State::Decision::None);
 assert(stale.poll(false,true,true,13,12)==State::Decision::None);
 assert(stale.poll(true,true,true,13,30000)==State::Decision::Fail);
 assert(stale.poll(true,true,true,14,30001)==State::Decision::None);assert(!stale.canFinish(true,true,true));
 stale.begin(40000,14);assert(stale.poll(true,true,true,14,40001)==State::Decision::None);
 assert(stale.poll(true,true,true,15,40002)==State::Decision::Commit);assert(!stale.committed(false));assert(!stale.canFinish(true,true,true));
 State wrap;wrap.begin(0,UINT32_MAX);assert(wrap.poll(true,true,true,0,1)==State::Decision::Commit);
 State boot;assert(!boot.recoveryDue(false,false,100));assert(!boot.recoveryDue(false,false,30099));assert(boot.recoveryDue(false,false,30100));assert(!boot.recoveryDue(false,true,30101));
 assert(!boot.recoveryDue(true,false,40000));assert(!boot.recoveryDue(false,false,50000));assert(!boot.recoveryDue(false,false,79999));assert(boot.recoveryDue(false,false,80000));
 iah::SetupDeadline finish;assert(!finish.finish(true,false,100));assert(!finish.due(true,100000));assert(finish.finish(true,true,100001));assert(!finish.due(true,102000));assert(finish.due(true,102001));finish.opened();assert(!finish.due(true,200000));
 std::cout<<"R3: real serializer regression and production page emission; "<<combinations<<" candidate timing/condition combinations; persistence, retry, wrap, finish and recovery gates passed\n";
}
